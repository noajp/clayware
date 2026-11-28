#!/usr/bin/env node
//
// The vessel loop's own writes to the board (.claude/vessel/README.md).
//
// A simulation session files what it found, and the next simulation, as
// Elements in the Object 'Sustainment — 器' of the dev Domain. A headless
// session has no SQL connector, so this is the one place the loop creates
// Elements; it writes them the way the clayware skill says an Element is
// written (the row, element_objects, element_assignees).
//
//   gap       labels vessel + dispatch, high, assigned to the Claude Code runner
//   sim       labels simulate + dispatch, low, assigned to the Claude Code runner
//   decision  labels vessel + decision, an approval for the Space's owner;
//             never dispatched (a person decides it)
//
// Usage (from anywhere in the repo):
//   node .claude/ops/vessel.mjs open
//   node .claude/ops/vessel.mjs file --kind gap|sim|decision --title "…" --file body.md [--hold]
//   node .claude/ops/vessel.mjs go <display_id>
//
// `open` lists the Object's Elements that are not done or cancelled, one per
// line, so a session can see what is already filed before it files more.
// `--hold` files without the dispatch label; `go` adds it later.

import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, readBody } from './lease.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const VESSEL_OBJECT = 'Sustainment — 器'
export const KINDS = ['gap', 'sim', 'decision']

// ── Pure ─────────────────────────────────────────────────────────────────────

/**
 * The row an Element of this kind starts as, without its ids. Pure.
 * @param {'gap'|'sim'|'decision'} kind
 * @param {{ title: string, description: string, hold?: boolean }} input
 */
export function elementFor(kind, { title, description, hold = false }) {
  if (!KINDS.includes(kind)) throw new Error(`unknown kind: ${kind}`)
  const t = title.trim()
  if (!t) throw new Error('a title is required')
  if (kind === 'decision') {
    return {
      title: t, description, status: 'todo', priority: 'high',
      labels: ['vessel', 'decision'], is_approval: true, approval_state: 'pending',
    }
  }
  const label = kind === 'gap' ? 'vessel' : 'simulate'
  return {
    title: t, description, status: 'todo', priority: kind === 'gap' ? 'high' : 'low',
    labels: hold ? [label] : [label, 'dispatch'],
  }
}

/** One line for `open`. Pure. */
export function openLine(r) {
  const labels = (r.labels ?? []).join(',')
  const held = r.claimed_by ? ` held:${r.claimed_by}` : ''
  return `${r.display_id ?? r.id}\t${r.status}\t[${labels}]${held}\t${r.title}`
}

// ── Board ────────────────────────────────────────────────────────────────────

function loadEnv() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    for (const candidate of [join(REPO, 'web/.env.local'), join(REPO, '../../../web/.env.local')]) {
      let text
      try { text = readFileSync(candidate, 'utf8') } catch { continue }
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (!m) continue
        if (!url && (m[1] === 'SUPABASE_URL' || m[1] === 'NEXT_PUBLIC_SUPABASE_URL')) url = m[2]
        if (!key && m[1] === 'SUPABASE_SERVICE_ROLE_KEY') key = m[2]
      }
      if (url && key) break
    }
  }
  if (!url || !key) {
    console.error('FATAL     vessel cannot reach the board — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found')
    process.exit(2)
  }
  return { url: url.replace(/\/$/, ''), key }
}

function board() {
  const { url, key } = loadEnv()
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const call = async (method, path, body, prefer) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method, headers: prefer ? { ...headers, Prefer: prefer } : headers, body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`)
    return res.status === 204 ? null : res.json()
  }
  return {
    get: (path) => call('GET', path),
    insert: (table, row) => call('POST', table, row, 'return=representation'),
    patch: (table, query, row) => call('PATCH', `${table}?${query}`, row, 'return=minimal'),
  }
}

/** The vessel Object, the Claude Code runner and the Space's owner. */
async function context(db) {
  const [control] = await db.get('dev_control?id=eq.1&select=domain_id,domain:domains(activity_space_id)')
  if (!control?.domain_id) throw new Error('dev_control.domain_id is not set')
  const space = control.domain.activity_space_id
  const [object] = await db.get(`objects?domain_id=eq.${control.domain_id}&name=eq.${encodeURIComponent(VESSEL_OBJECT)}&select=id`)
  if (!object) throw new Error(`the Object '${VESSEL_OBJECT}' is not in the dev Domain`)
  const workers = await db.get(`workers?activity_space_id=eq.${space}&type=eq.ai_agent&select=id,ai_config`)
  const runner = workers.find((w) => w.ai_config?.runner === 'claude-code')
  if (!runner) throw new Error('no Worker with ai_config.runner = claude-code in the dev Space')
  const [owner] = await db.get(`activity_space_members?activity_space_id=eq.${space}&role=eq.owner&select=user_id`)
  const [human] = owner ? await db.get(`workers?user_id=eq.${owner.user_id}&type=eq.human&select=id`) : []
  return { objectId: object.id, runnerId: runner.id, ownerWorkerId: human?.id ?? null }
}

async function cmdOpen(db) {
  const { objectId } = await context(db)
  const rows = await db.get(`elements?object_id=eq.${objectId}&status=not.in.(done,cancelled)`
    + '&select=id,display_id,title,status,labels,claimed_by&order=created_at.asc')
  for (const r of rows) console.log(openLine(r))
  if (rows.length === 0) console.log('(nothing open)')
}

async function cmdFile(db, args) {
  const kind = String(args.kind ?? '')
  const title = typeof args.title === 'string' ? args.title : ''
  const description = readBody(args) ?? ''
  const row = elementFor(kind, { title, description, hold: args.hold === true })
  const ctx = await context(db)
  const [el] = await db.insert('elements', { ...row, object_id: ctx.objectId })
  await db.insert('element_objects', { element_id: el.id, object_id: ctx.objectId, is_primary: true })
    .catch((err) => { if (!/duplicate|23505/.test(err.message)) throw err })
  if (kind === 'decision') {
    if (!ctx.ownerWorkerId) throw new Error('the Space owner has no human Worker to decide this')
    await db.insert('element_assignees', { element_id: el.id, worker_id: ctx.ownerWorkerId, role: 'reviewer' })
  } else {
    await db.insert('element_assignees', { element_id: el.id, worker_id: ctx.runnerId, role: 'assignee' })
  }
  const [filed] = await db.get(`elements?id=eq.${el.id}&select=display_id`)
  console.log(`FILED     ${filed?.display_id ?? el.id}\t${kind}\t${row.title}`)
}

async function cmdGo(db, ref) {
  const [el] = await db.get(`elements?display_id=eq.${encodeURIComponent(ref)}&select=id,labels`)
  if (!el) throw new Error(`not found: ${ref}`)
  const labels = el.labels ?? []
  if (labels.includes('decision')) throw new Error('a decision is not dispatched')
  if (!labels.includes('dispatch')) await db.patch('elements', `id=eq.${el.id}`, { labels: [...labels, 'dispatch'] })
  console.log(`GO        ${ref}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

function realpathOr(p) { try { return realpathSync(p) } catch { return p } }

const isMain = !!process.argv[1] && realpathOr(fileURLToPath(import.meta.url)) === realpathOr(process.argv[1])
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  const run = cmd === 'open' ? (db) => cmdOpen(db)
    : cmd === 'file' ? (db) => cmdFile(db, args)
    : cmd === 'go' && args._[1] ? (db) => cmdGo(db, args._[1])
    : null
  if (!run) {
    console.error('usage: vessel.mjs open | file --kind gap|sim|decision --title "…" --file body.md [--hold] | go <display_id>')
    process.exit(2)
  }
  run(board()).catch((err) => {
    console.error(`ERROR     ${err.message}`)
    process.exit(1)
  })
}

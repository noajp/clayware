'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUserId } from '@/providers/authContext';

// Follow: the Visions, Strategies, Domains, Objects and Elements a person
// keeps at hand —
// listed under "Following" in Execution's sidebar, toggled by the check
// beside a page's "…". Kept per person in home_pins (each sees only their
// own, RLS); one that was deleted or that they can no longer see drops out.

export type FollowKind = 'vision' | 'strategy' | 'domain' | 'object' | 'element';
export interface Followed {
  kind: FollowKind;
  id: string;
  label: string;
  /** The Object it opens in (itself for an Object, its home for an Element;
   *  null for a Vision, a Strategy or a Domain). */
  objectId: string | null;
  domainId: string | null;
  status: string | null;
}

const KEY = (userId: string | null) => ['follows', userId] as const;

/** What this person follows, oldest first. */
export function useFollows() {
  const userId = useCurrentUserId();
  const query = useQuery({
    queryKey: KEY(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Followed[]> => {
      const { data: pins, error } = await supabase.from('home_pins').select('entity_type, entity_id, created_at')
        .in('entity_type', ['vision', 'strategy', 'domain', 'object', 'element']).order('created_at');
      if (error) throw error;
      // One round trip after the pins, not three in a row: an Element brings
      // its Object's Domain with it, so the Objects read is only the
      // followed Objects, and all three run at once.
      const idsOf = (kind: FollowKind) => (pins ?? []).filter((p) => p.entity_type === kind).map((p) => p.entity_id as string);
      const elementIds = idsOf('element');
      const objectIds = idsOf('object');
      const strategyIds = idsOf('strategy');
      const domainIds = idsOf('domain');
      const visionIds = idsOf('vision');
      const [
        { data: elementRows, error: elementsError },
        { data: objects, error: objectsError },
        { data: strategies, error: strategiesError },
        { data: domains, error: domainsError },
        { data: visions, error: visionsError },
      ] = await Promise.all([
        elementIds.length
          ? supabase.from('elements').select('id, title, status, object_id, object:objects!elements_object_id_fkey(domain_id)').in('id', elementIds)
          : Promise.resolve({ data: [], error: null }),
        objectIds.length
          ? supabase.from('objects').select('id, name, domain_id').in('id', objectIds)
          : Promise.resolve({ data: [], error: null }),
        strategyIds.length
          ? supabase.from('strategies').select('id, name').in('id', strategyIds)
          : Promise.resolve({ data: [], error: null }),
        domainIds.length
          ? supabase.from('domains').select('id, name').in('id', domainIds)
          : Promise.resolve({ data: [], error: null }),
        visionIds.length
          ? supabase.from('visions').select('id, name').in('id', visionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (elementsError) throw elementsError;
      if (objectsError) throw objectsError;
      if (strategiesError) throw strategiesError;
      if (domainsError) throw domainsError;
      if (visionsError) throw visionsError;
      const domainById = new Map((domains ?? []).map((d) => [d.id as string, d]));
      const visionById = new Map((visions ?? []).map((v) => [v.id as string, v]));
      const elements = (elementRows ?? []) as Array<{ id: string; title: string; status: string | null; object_id: string | null; object: { domain_id: string | null } | { domain_id: string | null }[] | null }>;
      const domainOfElement = (e: (typeof elements)[number]) => {
        const o = Array.isArray(e.object) ? e.object[0] : e.object;
        return o?.domain_id ?? null;
      };
      const strategyById = new Map((strategies ?? []).map((st) => [st.id as string, st]));
      const objectById = new Map((objects ?? []).map((o) => [o.id as string, o]));
      const elementById = new Map(elements.map((e) => [e.id, e]));
      const out: Followed[] = [];
      for (const p of pins ?? []) {
        if (p.entity_type === 'vision') {
          const v = visionById.get(p.entity_id as string);
          if (v) out.push({ kind: 'vision', id: v.id as string, label: v.name as string, objectId: null, domainId: null, status: null });
        } else if (p.entity_type === 'domain') {
          const d = domainById.get(p.entity_id as string);
          if (d) out.push({ kind: 'domain', id: d.id as string, label: d.name as string, objectId: null, domainId: d.id as string, status: null });
        } else if (p.entity_type === 'strategy') {
          const st = strategyById.get(p.entity_id as string);
          if (st) out.push({ kind: 'strategy', id: st.id as string, label: st.name as string, objectId: null, domainId: null, status: null });
        } else if (p.entity_type === 'object') {
          const o = objectById.get(p.entity_id as string);
          if (o) out.push({ kind: 'object', id: o.id as string, label: o.name as string, objectId: o.id as string, domainId: (o.domain_id as string | null) ?? null, status: null });
        } else {
          const e = elementById.get(p.entity_id as string);
          if (e) out.push({ kind: 'element', id: e.id, label: e.title, objectId: e.object_id ?? null, domainId: domainOfElement(e), status: e.status ?? null });
        }
      }
      return out;
    },
  });
  return { follows: query.data ?? EMPTY, loading: !!userId && query.isPending };
}
const EMPTY: Followed[] = [];

/** Whether this person follows an Object or Element, and the switch. */
export function useFollow(kind: FollowKind, id: string | null) {
  const userId = useCurrentUserId();
  const qc = useQueryClient();
  const { follows } = useFollows();
  const following = !!id && follows.some((f) => f.kind === kind && f.id === id);
  const toggle = useMutation({
    mutationFn: async () => {
      if (!userId || !id) return;
      const { error } = following
        ? await supabase.from('home_pins').delete().eq('user_id', userId).eq('entity_type', kind).eq('entity_id', id)
        : await supabase.from('home_pins').insert({ user_id: userId, entity_type: kind, entity_id: id, position: 0 });
      if (error) throw error;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['follows'] }); },
  });
  return { following, toggle };
}

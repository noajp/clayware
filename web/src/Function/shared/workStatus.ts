// The statuses a Space defines for itself (work_statuses).
//
// An Object and a Strategy each stand in one of five stages, and that stage
// is what lists and reports go by. Within a stage a Space can add statuses
// of its own, and give the stage's own status another name, icon or colour.
// Objects and Strategies share one set (scope 'work'); Elements have their
// own stages, the seven their status has always had (scope 'element').
//
// Pure: what the rows a Space saved mean, and what a stage looks like when
// it saved nothing.

export type StatusScope = 'work' | 'element';

type WorkStage = 'backlog' | 'planned' | 'in_progress' | 'completed' | 'canceled';

interface StageLook { stage: string; label: string; icon: string; color: string }

/** The stages of an Object or a Strategy, in the order they are listed, each
 *  with the look of its own status until the Space gives it another. */
const WORK_STAGES: readonly StageLook[] = [
  { stage: 'backlog', label: 'Backlog', icon: 'lucide:circle-dashed', color: 'orange' },
  { stage: 'planned', label: 'Planned', icon: 'lucide:circle', color: 'grey' },
  { stage: 'in_progress', label: 'In Progress', icon: 'lucide:circle-dot', color: 'yellow' },
  { stage: 'completed', label: 'Completed', icon: 'lucide:circle-check', color: 'purple' },
  { stage: 'canceled', label: 'Canceled', icon: 'lucide:circle-x', color: 'darkgrey' },
];

/** The stages of an Element: its status keys, in the order they are listed. */
const ELEMENT_STAGES: readonly StageLook[] = [
  { stage: 'backlog', label: 'Backlog', icon: 'lucide:circle-dashed', color: 'grey' },
  { stage: 'todo', label: 'To Do', icon: 'lucide:circle', color: 'grey' },
  { stage: 'in_progress', label: 'In Progress', icon: 'lucide:circle-dot', color: 'green' },
  { stage: 'review', label: 'In Review', icon: 'lucide:circle-arrow-right', color: 'yellow' },
  { stage: 'done', label: 'Done', icon: 'lucide:circle-check', color: 'purple' },
  { stage: 'blocked', label: 'Blocked', icon: 'lucide:circle-minus', color: 'red' },
  { stage: 'cancelled', label: 'Cancelled', icon: 'lucide:circle-x', color: 'darkgrey' },
];

export function stagesOf(scope: StatusScope): readonly StageLook[] {
  return scope === 'work' ? WORK_STAGES : ELEMENT_STAGES;
}

/** A saved row of work_statuses, as far as its meaning goes. */
export interface StatusRow {
  id: string;
  scope: string;
  stage: string;
  builtin: boolean;
  name: string;
  icon: string | null;
  color: string | null;
  order_index: number;
}

/** A status as it is shown and picked. `id` is null for a stage's own
 *  status; `rowId` is the saved row behind it, if the Space saved one. */
export interface Status {
  id: string | null;
  rowId: string | null;
  stage: string;
  builtin: boolean;
  name: string;
  /** True when `name` is the stage's built-in English label, to be translated. */
  nameIsLabel: boolean;
  icon: string;
  color: string | null;
}

export interface StageStatuses { stage: string; label: string; statuses: Status[] }

/** Pure. Every stage of a scope with its statuses: its own first — as the
 *  Space re-dressed it, or as it comes — then the ones the Space added, in
 *  their order. Rows of another scope or of no known stage are left out. */
export function statusesByStage(scope: StatusScope, rows: readonly StatusRow[]): StageStatuses[] {
  return stagesOf(scope).map((look) => {
    const mine = rows.filter((r) => r.scope === scope && r.stage === look.stage);
    const own = mine.find((r) => r.builtin);
    const added = mine.filter((r) => !r.builtin).sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name));
    return {
      stage: look.stage,
      label: look.label,
      statuses: [
        {
          id: null, rowId: own?.id ?? null, stage: look.stage, builtin: true,
          name: own?.name ?? look.label, nameIsLabel: !own || own.name === look.label,
          icon: own?.icon ?? look.icon, color: own?.color ?? look.color,
        },
        ...added.map((r): Status => ({
          id: r.id, rowId: r.id, stage: r.stage, builtin: false, name: r.name, nameIsLabel: false,
          icon: r.icon ?? look.icon, color: r.color ?? look.color,
        })),
      ],
    };
  });
}

/** Pure. The status a row stands in: the one named by `statusId` when it is
 *  one of its stage's, else the stage's own. */
export function statusOf(scope: StatusScope, rows: readonly StatusRow[], stage: string | null | undefined, statusId: string | null | undefined): Status {
  const all = statusesByStage(scope, rows);
  const group = all.find((g) => g.stage === stage) ?? all[0];
  return group.statuses.find((s) => s.id !== null && s.id === statusId) ?? group.statuses[0];
}

/** Pure. Where a new status goes: after the last one the Space added to that stage. */
export function nextOrderIndex(rows: readonly StatusRow[], scope: StatusScope, stage: string): number {
  return rows.filter((r) => r.scope === scope && r.stage === stage && !r.builtin)
    .reduce((max, r) => Math.max(max, r.order_index), 0) + 1;
}

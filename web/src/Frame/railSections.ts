'use client';

import type React from 'react';
import { NavAiIcon, NavDomainIcon, NavStrategyIcon, NavTeamsIcon } from '@/Frame/sidebar/NavIcons';

// The ModeRail's four places, left of the sidebar. Each picks what the
// sidebar lists: the assistant, Athena (what is yours — the Agent, Inbox,
// your Elements, your Calendar; its rail button is the Clayware mark), Strategy (the Visions, each with its Portfolios, as
// Execution has Domains with their Objects), Execution (what you starred,
// and the Domains) and Team (the organisation's units and who is in them). A unit says who
// someone answers to and a Domain where they work, so Team and Execution
// are two places, not one.

export type RailSection = 'assistant' | 'strategy' | 'execution' | 'team';

export interface RailSectionMeta {
  id: RailSection;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

export const RAIL_SECTIONS: readonly RailSectionMeta[] = [
  { id: 'assistant', label: 'Athena', icon: NavAiIcon },
  { id: 'strategy', label: 'Strategy', icon: NavStrategyIcon },
  { id: 'execution', label: 'Execution', icon: NavDomainIcon },
  { id: 'team', label: 'Team', icon: NavTeamsIcon },
];

const SECTION_OF_VIEW: Partial<Record<string, RailSection>> = {
  inbox: 'assistant', ai: 'assistant', 'my-elements': 'assistant', calendar: 'assistant', schedule: 'assistant', profile: 'assistant',
  strategy: 'strategy', vision: 'strategy', phase: 'strategy', timeline: 'strategy',
  objects: 'execution', 'domain-elements': 'execution', domains: 'execution', 'domain-overview': 'execution',
  team: 'team', workload: 'team',
};

/** Pure. The rail place a view belongs to; null for one under none of them
 *  (Settings, a Sustainment, and the tools opened from a page: Notebook,
 *  Table, Artifacts). */
export function railSectionOf(view: string): RailSection | null {
  return SECTION_OF_VIEW[view] ?? null;
}

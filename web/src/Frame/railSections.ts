'use client';

import type React from 'react';
import { NavDomainIcon, NavHomeIcon, NavStrategyIcon, NavTeamsIcon } from '@/Frame/sidebar/NavIcons';

// The ModeRail's four places, left of the sidebar. Each picks what the
// sidebar lists: Home (what is yours — Inbox, the Agent, your Elements,
// what you follow), Strategy (the Strategies), Execution (the Domains) and
// Team (the organisation's units and who is in them). A unit says who
// someone answers to and a Domain where they work, so Team and Execution
// are two places, not one.

export type RailSection = 'home' | 'strategy' | 'execution' | 'team';

export interface RailSectionMeta {
  id: RailSection;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

export const RAIL_SECTIONS: readonly RailSectionMeta[] = [
  { id: 'home', label: 'Home', icon: NavHomeIcon },
  { id: 'strategy', label: 'Strategy', icon: NavStrategyIcon },
  { id: 'execution', label: 'Execution', icon: NavDomainIcon },
  { id: 'team', label: 'Team', icon: NavTeamsIcon },
];

const SECTION_OF_VIEW: Partial<Record<string, RailSection>> = {
  inbox: 'home', ai: 'home', 'my-elements': 'home', calendar: 'home', schedule: 'home', profile: 'home',
  strategy: 'strategy', phase: 'strategy', timeline: 'strategy',
  objects: 'execution', 'domain-elements': 'execution', domains: 'execution', 'domain-overview': 'execution',
  team: 'team', workload: 'team',
};

/** Pure. The rail place a view belongs to; null for one under none of them
 *  (Settings, and the tools opened from a page: Notebook, Table, Artifacts). */
export function railSectionOf(view: string): RailSection | null {
  return SECTION_OF_VIEW[view] ?? null;
}

'use client';

import type React from 'react';
import { NavAiIcon, NavInboxIcon, NavDomainIcon, NavStrategyIcon, NavTeamsIcon } from '@/Frame/sidebar/NavIcons';

// The ModeRail's places, left of the sidebar. Athena (its own mark) opens
// the Agent's chat and Inbox opens the Inbox; both are whole screens with
// no sidebar. Strategy (the Visions, each with its Portfolios, as Execution
// has Domains with their Objects), Execution (what you starred, and the
// Domains) and Team (the organisation's units and who is in them) pick what
// the sidebar lists. A unit says who someone answers to and a Domain where
// they work, so Team and Execution are two places, not one.

export type RailSection = 'assistant' | 'inbox' | 'strategy' | 'execution' | 'team';

export interface RailSectionMeta {
  id: RailSection;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

export const RAIL_SECTIONS: readonly RailSectionMeta[] = [
  { id: 'assistant', label: 'Athena', icon: NavAiIcon },
  { id: 'inbox', label: 'Inbox', icon: NavInboxIcon },
  { id: 'strategy', label: 'Strategy', icon: NavStrategyIcon },
  { id: 'execution', label: 'Execution', icon: NavDomainIcon },
  { id: 'team', label: 'Team', icon: NavTeamsIcon },
];

const SECTION_OF_VIEW: Partial<Record<string, RailSection>> = {
  ai: 'assistant', inbox: 'inbox',
  strategy: 'strategy', vision: 'strategy', phase: 'strategy', timeline: 'strategy',
  objects: 'execution', 'domain-elements': 'execution', domains: 'execution', 'domain-overview': 'execution',
  team: 'team', workload: 'team',
};

/** Pure. The rail place a view belongs to; null for one under none of them
 *  (Settings, a Sustainment, the person's own screens opened from the
 *  profile — My Elements, Calendar — and the tools opened from a page:
 *  Notebook, Table, Artifacts). */
export function railSectionOf(view: string): RailSection | null {
  return SECTION_OF_VIEW[view] ?? null;
}

'use client';

import { useEffect } from 'react';
import { useActivitySpaces, updateActivitySpace } from '@/Function/space/data';
import { cachedSpaceNouns, setSpaceNouns } from '@/Function/i18n/spaceNounsStore';
import { cleanNouns, type SpaceNouns } from '@/Function/i18n/spaceNouns';

/** Keeps the translator reading the active Space's names for Strategy,
 *  Object and Element. Mounted once, in the shell. */
export function useSpaceNounsSync(spaceId: string | null): void {
  const { data: spaces } = useActivitySpaces();
  const space = spaceId ? spaces.find((s) => s.id === spaceId) : undefined;
  const nouns = space?.nouns ?? null;
  const key = JSON.stringify(nouns);
  useEffect(() => {
    if (!spaceId) return;
    // Until the Space's row is here, the names last seen for it.
    setSpaceNouns(spaceId, space ? nouns : cachedSpaceNouns(spaceId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `nouns`
  }, [spaceId, !!space, key]);
}

/** Saves a Space's names (owner only; the database refuses anyone else). */
export async function saveSpaceNouns(spaceId: string, nouns: SpaceNouns): Promise<void> {
  const clean = cleanNouns(nouns);
  await updateActivitySpace(spaceId, { nouns: clean });
  setSpaceNouns(spaceId, clean);
}

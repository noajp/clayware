'use client';

import { formatError } from './formatError';
import { SquareCheckBig } from '@/ui/icons';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { appDialog } from '@/Function/shared/appDialogStore';
import { useFollow, type FollowKind } from '@/hooks/followData';

/** The check beside a concept page's "…" (Vision, Portfolio, Domain, Object,
 *  Element): follow it (it joins Following in the sidebar), or stop. Muted until
 *  followed, then in the key blue. */
export function FollowButton({ kind, id }: { kind: FollowKind; id: string }) {
  const { t } = useI18n();
  const { following, toggle } = useFollow(kind, id);
  const label = following ? t('Unfollow') : t('Follow');
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-pressed={following} aria-label={label} title={label}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate(undefined, { onError: (e) => void appDialog.alert(formatError(e)) })}
      className={following ? 'text-[var(--accent-default)]' : 'text-muted-foreground'}>
      <SquareCheckBig size={14} />
    </Button>
  );
}

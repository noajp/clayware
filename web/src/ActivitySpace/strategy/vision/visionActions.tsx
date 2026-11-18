'use client';

import { Pencil, Trash2 } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import type { ActionItem } from '@/Function/shared/ActionMenus';
import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { deleteVision, updateVision } from '@/hooks/visionData';

/** What can be done to a Vision — the same items from its sidebar row's "…"
 *  and from its page's "…": its owners and admins rename it; its owners
 *  delete it (refused while it holds Portfolios). */
export function useVisionActions(vision: { id: string; name: string } | null, role: string | undefined, opts: { onDeleted?: () => void } = {}): ActionItem[] {
  const { t } = useI18n();
  if (!vision || (role !== 'owner' && role !== 'admin')) return [];
  const items: ActionItem[] = [{
    key: 'rename', label: t('Rename'), icon: <Pencil size={14} />,
    onSelect: async () => {
      const name = (await appDialog.prompt(t('Vision name'), vision.name))?.trim();
      if (name && name !== vision.name) updateVision(vision.id, { name }).catch((e) => void appDialog.alert(formatError(e)));
    },
  }];
  if (role === 'owner') items.push({
    key: 'delete', label: t('Delete'), icon: <Trash2 size={14} />, destructive: true, separatorBefore: true,
    onSelect: async () => {
      if (!await appDialog.confirm(t('Delete “{name}”? This can’t be undone.', { name: vision.name }))) return;
      deleteVision(vision.id)
        .then(() => opts.onDeleted?.())
        .catch(() => void appDialog.alert(t('A Vision that still holds Portfolios can’t be deleted. Move or delete them first.')));
    },
  });
  return items;
}

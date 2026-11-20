'use client';

import { NavStrategyModeIcon } from '@/Frame/sidebar/NavIcons';
import { QuickCreatePopup, type QuickCreateInput } from '@/Function/shared/QuickCreatePopup';
import { useI18n } from '@/Function/i18n/I18nProvider';

/** A new Vision: the same quick-create card Objects and Portfolios use —
 *  its name, and what it aims for. */
export function QuickAddVisionPopup({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: QuickCreateInput) => void | Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <QuickCreatePopup
      open={open}
      icon={<NavStrategyModeIcon size={12} />}
      contextLabel={t('New Vision')}
      ariaLabel={t('Quick add Vision')}
      namePlaceholder={t('Vision name…')}
      descriptionPlaceholder={t('What this Vision aims for…')}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

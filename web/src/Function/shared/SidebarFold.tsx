'use client';

import { useState, type ReactNode } from 'react';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';

const read = (key: string) => { try { return window.localStorage.getItem(key) !== '0'; } catch { return true; } };

/** A sidebar section that folds under its heading ("Follow ▾", "Your
 *  Domain ▾"): the heading names it and folds it; open by default, and each
 *  section remembers whether it was folded. */
export function SidebarFold({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const key = `alcon:sidebar-fold:${id}`;
  const [open, setOpen] = useState(() => typeof window === 'undefined' ? true : read(key));
  const toggle = () => setOpen((o) => {
    try { window.localStorage.setItem(key, o ? '0' : '1'); } catch { /* the choice lasts this visit */ }
    return !o;
  });
  return (
    <div className="mt-3.5 first:mt-1">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="mb-1 flex h-6 items-center gap-1.5 rounded-[5px] px-2 text-[11.5px] font-medium text-muted-foreground/85 transition-colors hover:text-foreground">
        {label}
        <DisclosureTriangle open={open} />
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

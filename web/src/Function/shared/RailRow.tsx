'use client';

/**
 * RailRow — the right-rail property row used inside RailCard.
 *
 * Single source of truth so the Element detail's "Properties" island
 * and the Object overview's "Properties" island stay visually identical
 * (and so a tweak in one place doesn't drift the other). Layout:
 *
 *   [ name (w-24, 12px muted) ][ icon ][ label (13px, truncates) ]
 *
 * A set value is foreground and an unset one is muted, so the rail can be
 * read for what is filled in without reading the words.
 *
 * Used as a wrapper inside <RailCard>'s body, where each row is either
 * a plain display row or a `<button>` that opens an inline picker — the
 * caller decides; this component only renders the row chrome.
 */
export function RailRow({
  icon,
  name,
  label,
  placeholder = false,
  dense = false,
}: {
  icon?: React.ReactNode;
  name?: string;
  label: React.ReactNode;
  /** Render the label in the muted "click to fill" colour. */
  placeholder?: boolean;
  /** Tighter vertical padding — used to pack the built-in property rows so a
   *  section divider below them gets more breathing room. */
  dense?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-2 px-2 ${name ? 'grid-cols-[92px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'} ${dense ? 'h-[30px]' : 'min-h-[30px] py-1'} rounded-[5px] transition-colors hover:bg-[var(--surface-strong)]/60 text-[13px] font-normal leading-5 ${
        placeholder ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      {name && (
        <span className="truncate text-left text-[12px] text-[var(--text-tertiary)]">
          {name}
        </span>
      )}
      <span className="flex min-w-0 items-center gap-1.5">
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      </span>
    </div>
  );
}

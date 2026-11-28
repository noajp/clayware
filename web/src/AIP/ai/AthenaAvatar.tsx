'use client';

import { cn } from '@/lib/utils';

type AthenaAvatarSize = 'xs' | 'sm' | 'rail' | 'md' | 'hero';

const SIZE_CLASS: Record<AthenaAvatarSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  rail: 'size-9',
  md: 'size-11',
  hero: 'size-[60px]',
};

const IMG_PX: Record<AthenaAvatarSize, number> = {
  xs: 20,
  sm: 24,
  rail: 36,
  md: 44,
  hero: 60,
};

/**
 * Athena's portrait medallion: the crowned ghost seated inside a circular
 * studio frame so its cropped bust meets the curved rim cleanly in both light
 * and dark themes. Honours prefers-reduced-motion with a static frame.
 */
export function AthenaAvatar({
  size = 'rail',
  active = false,
  working = false,
  className,
}: {
  size?: AthenaAvatarSize;
  /** Shows the single-accent selection ring (used on the ModeRail). */
  active?: boolean;
  /** Shows a subtle live presence indicator while Athena is streaming. */
  working?: boolean;
  className?: string;
}) {
  const px = IMG_PX[size];
  const dotSize = size === 'hero' ? 'size-3' : size === 'rail' ? 'size-2.5' : 'size-1.5';
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-150',
        SIZE_CLASS[size],
        active && 'ring-[1.5px] ring-[var(--accent-default)] ring-offset-2 ring-offset-[var(--surface-bg)]',
        className,
      )}
    >
      <span
        className="relative flex size-full items-end justify-center overflow-hidden rounded-full"
        style={{
          background: 'var(--athena-backdrop)',
          boxShadow: 'inset 0 0 0 1px var(--athena-rim)',
        }}
      >
        <picture className="block size-full">
          <source srcSet="/athena/idle.png" media="(prefers-reduced-motion: reduce)" />
          <img
            src="/athena/idle.webp"
            alt=""
            width={px}
            height={px}
            draggable={false}
            className="size-full translate-y-[2px] scale-[1.02] object-contain object-bottom select-none"
          />
        </picture>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ background: 'var(--athena-vignette)' }}
        />
      </span>
      {working && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--surface-bg)] bg-[var(--accent-default)]',
            dotSize,
          )}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent-default)] opacity-60" />
        </span>
      )}
    </span>
  );
}

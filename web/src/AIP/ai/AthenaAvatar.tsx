'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AthenaMood } from './athena3d/athenaGlbEngine';

export type { AthenaMood };

type AthenaAvatarSize = 'xs' | 'sm' | 'rail' | 'md' | 'hero';

const SIZE_CLASS: Record<AthenaAvatarSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  rail: 'size-7',
  md: 'size-12',
  hero: 'size-[116px]',
};

const CANVAS_PX: Record<AthenaAvatarSize, number> = {
  xs: 48,
  sm: 64,
  rail: 108,
  md: 168,
  hero: 288,
};

/**
 * Athena's character, drawn live from `/athena/athena.glb` by the shared 3D engine: cursor
 * look-at, floating, the model's own clips per mood, and drag-to-spin on the AI screen hero.
 * She stands frameless; the hero shows her whole figure, every other size her upper body.
 * Until the model is ready, and where it cannot be drawn at all (no WebGL), the still
 * picture of the same view is shown instead.
 */
export function AthenaAvatar({
  size = 'rail',
  mood = 'idle',
  working = false,
  interactive = true,
  orbitable = false,
  onTap,
  className,
}: {
  size?: AthenaAvatarSize;
  /** Expressive live pose driven by AI state and hover/click interaction. */
  mood?: AthenaMood;
  /** Shows a subtle live presence dot while Athena is streaming. */
  working?: boolean;
  /** Enables gentle cursor look-at / parallax for live portals. */
  interactive?: boolean;
  /** Enables 360° pointer drag-to-spin with spring return (used on hero). */
  orbitable?: boolean;
  /** Fires on a short click (distinguished from a drag-spin). */
  onTap?: () => void;
  className?: string;
}) {
  // The small sizes are a still taken from the engine; the larger ones are drawn every frame
  const isLive = size === 'rail' || size === 'md' || size === 'hero';
  const framing = size === 'hero' ? 'full' : 'bust';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const glbEngineRef = useRef<typeof import('./athena3d/athenaGlbEngine')['athenaGlbEngine'] | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; dist: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
    dist: 0,
  });
  const px = CANVAS_PX[size];

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    void import('./athena3d/athenaGlbEngine')
      .then(async ({ athenaGlbEngine }) => {
        if (cancelled || !(await athenaGlbEngine.ensureLoaded()) || cancelled) return;
        glbEngineRef.current = athenaGlbEngine;
        if (isLive && canvasRef.current) {
          unsub = athenaGlbEngine.subscribe(canvasRef.current, { mood, framing, interactive });
          if (unsub) setLive(true);
        } else {
          setSnapshot(athenaGlbEngine.getSnapshot());
        }
      })
      .catch(() => { /* the still picture stays */ });

    return () => {
      cancelled = true;
      unsub?.();
    };
    // Subscribe once per mount/size/mode; mood transitions push through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, framing, interactive]);

  useEffect(() => {
    if (live && canvasRef.current) glbEngineRef.current?.updateMood(canvasRef.current, mood);
  }, [live, mood]);

  const dotSize = size === 'hero' ? 'size-3' : size === 'rail' ? 'size-2.5' : 'size-1.5';
  const canOrbit = orbitable && live;

  const handlePointerDown = canOrbit
    ? (e: React.PointerEvent<HTMLSpanElement>) => {
        if (e.button !== 0 || !canvasRef.current || !glbEngineRef.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, dist: 0 };
        glbEngineRef.current.beginDrag(canvasRef.current);
      }
    : undefined;

  const handlePointerMove = canOrbit
    ? (e: React.PointerEvent<HTMLSpanElement>) => {
        if (!dragRef.current.active || !canvasRef.current || !glbEngineRef.current) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        dragRef.current.dist += Math.hypot(dx, dy);
        glbEngineRef.current.dragBy(canvasRef.current, dx, dy);
      }
    : undefined;

  const handlePointerUp = canOrbit
    ? (e: React.PointerEvent<HTMLSpanElement>) => {
        if (!dragRef.current.active || !canvasRef.current || !glbEngineRef.current) return;
        const wasTap = dragRef.current.dist < 6;
        dragRef.current.active = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        glbEngineRef.current.endDrag(canvasRef.current);
        if (wasTap) onTap?.();
      }
    : undefined;

  return (
    <span
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={!canOrbit && onTap ? onTap : undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center transition-transform duration-150',
        SIZE_CLASS[size],
        canOrbit && 'cursor-grab touch-none select-none active:cursor-grabbing',
        className,
      )}
    >
      <span className="relative flex size-full items-center justify-center overflow-hidden rounded-2xl">
        {isLive && (
          <canvas
            ref={canvasRef}
            width={px}
            height={px}
            aria-hidden
            className={cn('size-full select-none', live ? 'block' : 'hidden')}
          />
        )}
        {!live && (
          // eslint-disable-next-line @next/next/no-img-element -- local still / engine snapshot
          <img
            src={snapshot ?? `/athena/still-${framing}.png`}
            alt=""
            width={px}
            height={px}
            draggable={false}
            className="size-full object-cover select-none"
          />
        )}
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

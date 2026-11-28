'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { athenaSpriteEngine, type AthenaMood } from './athenaSpriteEngine';

export type { AthenaMood };

type AthenaAvatarSize = 'xs' | 'sm' | 'rail' | 'md' | 'hero';

const SIZE_CLASS: Record<AthenaAvatarSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  rail: 'size-9',
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
 * Athena's living companion portrait:
 * - Primary: 60fps real-time 3D WebGL engine loading `/athena/athena.glb`
 *   (full PBR studio lighting, cursor LookAt, 360° drag-to-spin on hero,
 *   organic floating, and embedded glTF skeletal clips when present).
 *   With the .glb loaded she is drawn frameless (no portrait window); the rail
 *   shows her upper body, the AI screen hero her whole figure.
 * - Fallback: while `/athena/athena.glb` is not present (or WebGL unavailable),
 *   smoothly renders the crossfaded 6-pose sprite-sheet engine.
 */
export function AthenaAvatar({
  size = 'rail',
  mood = 'idle',
  active = false,
  working = false,
  interactive = true,
  orbitable = false,
  onTap,
  className,
}: {
  size?: AthenaAvatarSize;
  /** Expressive live pose driven by AI state and hover/click interaction. */
  mood?: AthenaMood;
  /** Shows the single-accent selection ring (used on the ModeRail). */
  active?: boolean;
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
  const isLive = size === 'rail' || size === 'md' || size === 'hero';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backend, setBackend] = useState<'none' | 'glb' | 'sprite'>('none');
  const [glbSnapshot, setGlbSnapshot] = useState<string | null>(null);
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

    const mountSpriteFallback = () => {
      if (cancelled || !isLive || !canvasRef.current) return;
      unsub = athenaSpriteEngine.subscribe(canvasRef.current, { mood, interactive });
      if (unsub) setBackend('sprite');
    };

    void import('./athena3d/athenaGlbEngine')
      .then(async ({ athenaGlbEngine }) => {
        if (cancelled) return;
        const ok = await athenaGlbEngine.ensureLoaded();
        if (cancelled) return;
        if (ok) {
          glbEngineRef.current = athenaGlbEngine;
          if (isLive && canvasRef.current) {
            unsub = athenaGlbEngine.subscribe(canvasRef.current, {
              mood,
              framing: size === 'hero' ? 'full' : 'bust',
              interactive,
            });
            if (unsub) { setBackend('glb'); return; }
          } else {
            const snap = athenaGlbEngine.getSnapshot();
            if (snap) setGlbSnapshot(snap);
            return;
          }
        }
        mountSpriteFallback();
      })
      .catch(mountSpriteFallback);

    return () => {
      cancelled = true;
      unsub?.();
    };
    // Subscribe once per mount/size/mode; mood transitions push through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, size, interactive]);

  useEffect(() => {
    if (!isLive || !canvasRef.current) return;
    if (backend === 'glb' && glbEngineRef.current) {
      glbEngineRef.current.updateMood(canvasRef.current, mood);
    } else if (backend === 'sprite') {
      athenaSpriteEngine.updateMood(canvasRef.current, mood);
    }
  }, [isLive, backend, mood]);

  const dotSize = size === 'hero' ? 'size-3' : size === 'rail' ? 'size-2.5' : 'size-1.5';
  // With the real 3D GLB, Athena stands frameless (no portrait window) so her arms and
  // sceptre show
  const frameless = backend === 'glb';
  const canOrbit = orbitable && backend === 'glb';

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
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-transform duration-150',
        SIZE_CLASS[size],
        canOrbit && 'cursor-grab touch-none select-none active:cursor-grabbing',
        active && !frameless && 'ring-[1.5px] ring-[var(--accent-default)] ring-offset-2 ring-offset-[var(--surface-bg)]',
        className,
      )}
    >
      <span
        className={cn(
          'relative flex size-full items-center justify-center overflow-hidden',
          frameless ? 'rounded-2xl' : 'rounded-full',
        )}
        style={
          frameless
            ? undefined
            : {
                background: backend === 'sprite' ? 'var(--surface-bg)' : 'var(--athena-backdrop)',
                boxShadow: 'inset 0 0 0 1px var(--athena-rim)',
              }
        }
      >
        {isLive && (
          <canvas
            ref={canvasRef}
            width={px}
            height={px}
            aria-hidden
            className={cn('size-full select-none', backend !== 'none' ? 'block' : 'hidden')}
          />
        )}
        {(!isLive || backend === 'none') && (
          // eslint-disable-next-line @next/next/no-img-element -- local static portrait / 3D snapshot
          <img
            src={glbSnapshot ?? '/athena/idle.png'}
            alt=""
            width={px}
            height={px}
            draggable={false}
            className="size-full object-cover select-none"
          />
        )}
        {!frameless && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ background: 'var(--athena-vignette)' }}
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

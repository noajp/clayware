'use client';

export type AthenaMood = 'idle' | 'wave' | 'thinking' | 'working' | 'cheer' | 'surprise';

interface SheetSpec {
  src: string;
  frames: number;
  cols: number;
  size: number;
  fps: number;
}

const SHEETS: Record<AthenaMood, SheetSpec> = {
  idle: { src: '/athena/idle-sheet.webp', frames: 36, cols: 6, size: 144, fps: 12.5 },
  wave: { src: '/athena/wave-sheet.webp', frames: 36, cols: 6, size: 144, fps: 13.5 },
  cheer: { src: '/athena/cheer-sheet.webp', frames: 36, cols: 6, size: 144, fps: 14 },
  surprise: { src: '/athena/surprise-sheet.webp', frames: 33, cols: 6, size: 144, fps: 13 },
  thinking: { src: '/athena/turn-sheet.webp', frames: 40, cols: 6, size: 144, fps: 13 },
  working: { src: '/athena/dash-sheet.webp', frames: 24, cols: 6, size: 144, fps: 15 },
};

const CROSSFADE_SEC = 0.18;

interface Subscriber {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mood: AthenaMood;
  prevMood: AthenaMood | null;
  prevFrame: number;
  fadeT: number; // 0..1 crossfade progress from prevMood to mood
  frameFloat: number;
  interactive: boolean;
  panX: number;
  panY: number;
  tilt: number;
}

function damp(cur: number, target: number, lambda: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

/**
 * Shared Canvas 2D sprite-sheet playback engine for Athena's original
 * cinema-rendered poses inside a Meta Muse-style pitch-black circular portal.
 *
 * - Exact frame-0 start on mood change (hover always starts waving cleanly)
 * - 180ms crossfade between poses so transitions never snap
 * - Subtle spring-damped cursor parallax so Athena feels softly aware of you
 * - Lazy-cached WebP sprite sheets (~43-79KB each), zero WebGL overhead
 * - Pauses automatically when hidden or under prefers-reduced-motion
 */
class AthenaSpriteEngine {
  private images = new Map<AthenaMood, HTMLImageElement>();
  private loading = new Set<AthenaMood>();
  private subscribers = new Set<Subscriber>();
  private rafId: number | null = null;
  private lastMs = 0;
  private pointerX = 0;
  private pointerY = 0;
  private pointerActiveAt = 0;
  private listenersReady = false;
  private warmed = false;

  private loadSheet(mood: AthenaMood, onReady?: () => void) {
    if (this.images.has(mood)) { onReady?.(); return; }
    if (this.loading.has(mood) || typeof window === 'undefined') return;
    this.loading.add(mood);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.loading.delete(mood);
      this.images.set(mood, img);
      onReady?.();
      this.paintOnceIfReduced();
      // Gently warm wave sheet right after idle loads so hover responds instantly
      if (mood === 'idle' && !this.warmed) {
        this.warmed = true;
        this.loadSheet('wave');
      }
    };
    img.onerror = () => {
      this.loading.delete(mood);
    };
    img.src = SHEETS[mood].src;
  }

  private attachListeners() {
    if (this.listenersReady || typeof window === 'undefined') return;
    this.listenersReady = true;

    window.addEventListener(
      'pointermove',
      (e) => {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        this.pointerX = (e.clientX / w) * 2 - 1;
        this.pointerY = (e.clientY / h) * 2 - 1;
        this.pointerActiveAt = performance.now();
      },
      { passive: true },
    );

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.subscribers.size > 0) {
        this.lastMs = performance.now();
        this.scheduleLoop();
      }
    });
  }

  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private paintOnceIfReduced() {
    if (!this.prefersReducedMotion()) return;
    for (const sub of this.subscribers) this.drawSubscriber(sub);
  }

  subscribe(canvas: HTMLCanvasElement, opts: { mood: AthenaMood; interactive: boolean }): (() => void) | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    this.attachListeners();
    this.loadSheet('idle');
    this.loadSheet(opts.mood);

    const sub: Subscriber = {
      canvas,
      ctx,
      mood: opts.mood,
      prevMood: null,
      prevFrame: 0,
      fadeT: 1,
      frameFloat: 0,
      interactive: opts.interactive,
      panX: 0,
      panY: 0,
      tilt: 0,
    };
    this.subscribers.add(sub);
    this.drawSubscriber(sub);

    if (!this.prefersReducedMotion()) {
      this.lastMs = performance.now();
      this.scheduleLoop();
    }

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0 && this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  updateMood(canvas: HTMLCanvasElement, mood: AthenaMood) {
    this.loadSheet(mood);
    for (const sub of this.subscribers) {
      if (sub.canvas !== canvas || sub.mood === mood) continue;
      sub.prevMood = sub.mood;
      sub.prevFrame = Math.floor(sub.frameFloat) % SHEETS[sub.mood].frames;
      sub.mood = mood;
      sub.frameFloat = 0;
      sub.fadeT = 0;
      if (this.prefersReducedMotion()) {
        sub.fadeT = 1;
        this.drawSubscriber(sub);
      }
      return;
    }
  }

  private scheduleLoop() {
    if (this.rafId !== null || this.subscribers.size === 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.prefersReducedMotion()) return;

    const tick = (nowMs: number) => {
      this.rafId = null;
      if (this.subscribers.size === 0 || (typeof document !== 'undefined' && document.hidden)) return;
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastMs) / 1000));
      this.lastMs = nowMs;

      for (const sub of this.subscribers) {
        this.stepSubscriber(sub, nowMs, dt);
        this.drawSubscriber(sub);
      }
      this.scheduleLoop();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stepSubscriber(sub: Subscriber, nowMs: number, dt: number) {
    const spec = SHEETS[sub.mood];
    sub.frameFloat = (sub.frameFloat + spec.fps * dt) % spec.frames;

    if (sub.fadeT < 1) {
      sub.fadeT = Math.min(1, sub.fadeT + dt / CROSSFADE_SEC);
      if (sub.fadeT >= 1) sub.prevMood = null;
    }

    // Subtle cursor-aware parallax shift & tilt
    let targetX = 0;
    let targetY = 0;
    let targetTilt = 0;
    if (sub.interactive && nowMs - this.pointerActiveAt < 4500) {
      const rect = sub.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const cx = ((rect.left + rect.width * 0.5) / (window.innerWidth || 1)) * 2 - 1;
        const cy = ((rect.top + rect.height * 0.5) / (window.innerHeight || 1)) * 2 - 1;
        const dx = Math.max(-1, Math.min(1, (this.pointerX - cx) * 1.4));
        const dy = Math.max(-1, Math.min(1, (this.pointerY - cy) * 1.4));
        targetX = dx * 0.032;
        targetY = dy * 0.022;
        targetTilt = dx * 0.042;
      }
    }
    sub.panX = damp(sub.panX, targetX, 7, dt);
    sub.panY = damp(sub.panY, targetY, 7, dt);
    sub.tilt = damp(sub.tilt, targetTilt, 7, dt);
  }

  private drawFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    mood: AthenaMood,
    frameIdx: number,
    alpha: number,
    panX: number,
    panY: number,
    tilt: number,
  ) {
    const img = this.images.get(mood) ?? this.images.get('idle');
    if (!img) return;
    const spec = this.images.has(mood) ? SHEETS[mood] : SHEETS.idle;
    const idx = ((frameIdx % spec.frames) + spec.frames) % spec.frames;
    const sx = (idx % spec.cols) * spec.size;
    const sy = Math.floor(idx / spec.cols) * spec.size;

    ctx.save();
    ctx.globalAlpha = alpha;
    // Slight 1.05x overscan so cursor parallax never exposes a seam
    ctx.translate(w * (0.5 + panX), h * (0.5 + panY));
    ctx.rotate(tilt);
    const dw = w * 1.05;
    const dh = h * 1.05;
    ctx.drawImage(img, sx, sy, spec.size, spec.size, -dw * 0.5, -dh * 0.5, dw, dh);
    ctx.restore();
  }

  private drawSubscriber(sub: Subscriber) {
    const { ctx, canvas } = sub;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const curFrame = Math.floor(sub.frameFloat);
    if (sub.prevMood && sub.fadeT < 1 && this.images.has(sub.mood)) {
      this.drawFrame(ctx, w, h, sub.prevMood, sub.prevFrame, 1, sub.panX, sub.panY, sub.tilt);
      this.drawFrame(ctx, w, h, sub.mood, curFrame, sub.fadeT, sub.panX, sub.panY, sub.tilt);
    } else {
      this.drawFrame(ctx, w, h, sub.mood, curFrame, 1, sub.panX, sub.panY, sub.tilt);
    }
  }
}

export const athenaSpriteEngine = new AthenaSpriteEngine();

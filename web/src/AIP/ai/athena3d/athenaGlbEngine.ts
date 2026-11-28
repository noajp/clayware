'use client';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createStudioEnvironment } from './studioEnv';
import type { AthenaMood } from '../athenaSpriteEngine';

const ATHENA_GLB_URL = '/athena/athena.glb';

/**
 * Orientation calibration in radians if the exported .glb does not face +Z
 * by default (e.g. Math.PI / 2 or -Math.PI / 2 for some Tripo/Meshy exports).
 */
const MODEL_YAW_OFFSET = 0;

interface MoodMotionState {
  posX: number;
  posY: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  moodTime: number;
  lastMood: AthenaMood;
  // Interactive 360° drag-to-spin orbit state with momentum + gentle spring return
  dragging: boolean;
  dragYaw: number;
  dragPitch: number;
  dragVelYaw: number;
  lastReleaseAt: number;
}

interface GlbSubscriber {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mood: AthenaMood;
  framing: 'bust' | 'full';
  interactive: boolean;
  state: MoodMotionState;
}

function makeMotionState(): MoodMotionState {
  return {
    posX: 0,
    posY: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    moodTime: 0,
    lastMood: 'idle',
    dragging: false,
    dragYaw: 0,
    dragPitch: 0,
    dragVelYaw: 0,
    lastReleaseAt: 0,
  };
}

function damp(cur: number, target: number, lambda: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

const CLIP_MATCHERS: Record<AthenaMood, RegExp> = {
  idle: /idle|breath|float|rest|stand/i,
  wave: /wave|greet|hello|hi/i,
  cheer: /cheer|happy|jump|celebrat|joy|win/i,
  surprise: /surpris|shock|alert|gasp|startl/i,
  thinking: /think|turn|look|spin|curious/i,
  working: /dash|work|run|fly|zoom|fast|action/i,
};

const RENDER_SIZE = 288;

/**
 * Single-context shared WebGL engine for rendering `web/public/athena/athena.glb`
 * at 60fps across all live Athena portals (ModeRail + AI screen hero).
 *
 * Supports BOTH:
 * - Static PBR .glb models (from Tripo3D / Meshy / Rodin): auto-centered,
 *   auto-scaled, studio-lit, and brought to life with real-time cursor LookAt,
 *   levitation breathing, and expressive mood choreography.
 * - Rigged/animated .glb models: automatically drives embedded glTF clips via
 *   THREE.AnimationMixer with smooth 250ms crossfade, layered with cursor LookAt.
 */
class AthenaGlbEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private envMap: THREE.Texture | null = null;
  private pivot: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<AthenaMood, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private subscribers = new Set<GlbSubscriber>();
  private rafId: number | null = null;
  private lastMs = 0;
  private pointerX = 0;
  private pointerY = 0;
  private pointerActiveAt = 0;
  private listenersAttached = false;
  private loadPromise: Promise<boolean> | null = null;
  private ready = false;
  private snapshotUrl: string | null = null;

  /** Loads and initializes the .glb once; returns false if the file is absent or WebGL fails. */
  ensureLoaded(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.initAndLoad();
    return this.loadPromise;
  }

  private async initAndLoad(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Quick HEAD check so a missing .glb falls back cleanly without noisy loader errors
    try {
      const head = await fetch(ATHENA_GLB_URL, { method: 'HEAD' });
      if (!head.ok) return false;
    } catch {
      return false;
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
      renderer.setSize(RENDER_SIZE, RENDER_SIZE, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const envMap = createStudioEnvironment(renderer);
      scene.environment = envMap;

      // Balanced studio 3-point rig for porcelain + gold + velvet PBR materials
      scene.add(new THREE.HemisphereLight(0xf8faff, 0x262a38, 0.78));

      const key = new THREE.DirectionalLight(0xfffaf2, 1.85);
      key.position.set(-2.4, 3.8, 4.2);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xe2ecff, 0.85);
      fill.position.set(3.2, 1.6, 2.8);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xe6eeff, 1.3);
      rim.position.set(2.2, 2.6, -3.2);
      scene.add(rim);

      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
      camera.position.set(0, 0.12, 3.85);
      camera.lookAt(0, 0.12, 0);

      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(ATHENA_GLB_URL);
      const model = gltf.scene;

      // Auto-normalize the imported model to a predictable portrait height (1.65 units)
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxAxis = Math.max(size.y, size.x * 0.85, 0.001);
      const normScale = 1.65 / maxAxis;
      model.scale.multiplyScalar(normScale);
      model.position.set(
        -center.x * normScale,
        -center.y * normScale,
        -center.z * normScale,
      );
      model.rotation.y += MODEL_YAW_OFFSET;

      // Enhance PBR material responsiveness under our studio environment map
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.envMapIntensity = Math.max(obj.material.envMapIntensity, 1.05);
          obj.material.needsUpdate = true;
        }
      });

      const pivot = new THREE.Group();
      pivot.add(model);
      scene.add(pivot);

      // Wire embedded glTF skeletal animations if the .glb includes them
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        this.mixer = mixer;
        for (const [mood, regex] of Object.entries(CLIP_MATCHERS) as [AthenaMood, RegExp][]) {
          const clip = gltf.animations.find((c) => regex.test(c.name));
          if (clip) this.actions.set(mood, mixer.clipAction(clip));
        }
        // If clips exist with generic names (e.g. "Animation"), map the first clip to idle
        if (!this.actions.has('idle') && gltf.animations[0]) {
          this.actions.set('idle', mixer.clipAction(gltf.animations[0]));
        }
        const idleAction = this.actions.get('idle');
        if (idleAction) {
          idleAction.play();
          this.activeAction = idleAction;
        }
      }

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.envMap = envMap;
      this.pivot = pivot;
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  private attachListeners() {
    if (this.listenersAttached || typeof window === 'undefined') return;
    this.listenersAttached = true;

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

  subscribe(
    canvas: HTMLCanvasElement,
    opts: { mood: AthenaMood; framing: 'bust' | 'full'; interactive: boolean },
  ): (() => void) | null {
    if (!this.ready) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    this.attachListeners();
    const sub: GlbSubscriber = {
      canvas,
      ctx,
      mood: opts.mood,
      framing: opts.framing,
      interactive: opts.interactive,
      state: makeMotionState(),
    };
    this.subscribers.add(sub);
    this.syncMixerAction(opts.mood);
    this.renderSubscriber(sub, performance.now() / 1000, 0.016);

    // The loop always runs: dragging, hover and click must answer even with reduced motion.
    // Reduced motion only calms the motion Athena makes on her own (see stepMotion).
    this.lastMs = performance.now();
    this.scheduleLoop();

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0 && this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  updateMood(canvas: HTMLCanvasElement, mood: AthenaMood) {
    for (const sub of this.subscribers) {
      if (sub.canvas !== canvas) continue;
      sub.mood = mood;
      this.syncMixerAction(mood);
      return;
    }
  }

  /** Interactive 360° drag-to-spin controls (used on the AI screen hero). */
  beginDrag(canvas: HTMLCanvasElement) {
    for (const sub of this.subscribers) {
      if (sub.canvas !== canvas) continue;
      sub.state.dragging = true;
      sub.state.dragVelYaw = 0;
      return;
    }
  }

  dragBy(canvas: HTMLCanvasElement, dx: number, dy: number) {
    for (const sub of this.subscribers) {
      if (sub.canvas !== canvas) continue;
      const dYaw = dx * 0.015;
      const dPitch = dy * 0.008;
      sub.state.dragYaw += dYaw;
      sub.state.dragPitch = Math.max(-0.55, Math.min(0.55, sub.state.dragPitch + dPitch));
      sub.state.dragVelYaw = dYaw * 50;
      return;
    }
  }

  endDrag(canvas: HTMLCanvasElement) {
    for (const sub of this.subscribers) {
      if (sub.canvas !== canvas) continue;
      sub.state.dragging = false;
      sub.state.lastReleaseAt = performance.now();
      return;
    }
  }

  private syncMixerAction(mood: AthenaMood) {
    if (!this.mixer) return;
    const next = this.actions.get(mood) ?? this.actions.get('idle') ?? null;
    if (!next || next === this.activeAction) return;
    next.reset().play();
    if (this.activeAction) {
      this.activeAction.crossFadeTo(next, 0.25, true);
    }
    this.activeAction = next;
  }

  getSnapshot(): string | null {
    if (this.snapshotUrl) return this.snapshotUrl;
    if (!this.ready || !this.renderer || !this.scene || !this.camera || !this.pivot) return null;
    this.applyMotion(makeMotionState(), 'bust');
    this.renderer.render(this.scene, this.camera);
    try {
      this.snapshotUrl = this.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
    return this.snapshotUrl;
  }

  private scheduleLoop() {
    if (this.rafId !== null || this.subscribers.size === 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const tick = (nowMs: number) => {
      this.rafId = null;
      if (this.subscribers.size === 0 || (typeof document !== 'undefined' && document.hidden)) return;
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastMs) / 1000));
      this.lastMs = nowMs;
      const nowSec = nowMs / 1000;

      this.mixer?.update(this.prefersReducedMotion() ? dt * 0.6 : dt);
      for (const sub of this.subscribers) {
        this.renderSubscriber(sub, nowSec, dt);
      }
      this.scheduleLoop();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stepMotion(sub: GlbSubscriber, nowSec: number, dt: number) {
    const s = sub.state;
    const mood = sub.mood;
    if (mood !== s.lastMood) {
      s.moodTime = 0;
      s.lastMood = mood;
    } else {
      s.moodTime += dt;
    }

    // Real-time cursor look-at relative to this canvas on screen
    let lookX = 0;
    let lookY = 0;
    const pointerRecent = performance.now() - this.pointerActiveAt < 4500;
    if (sub.interactive && pointerRecent && mood !== 'thinking' && mood !== 'working') {
      const rect = sub.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const cx = ((rect.left + rect.width * 0.5) / (window.innerWidth || 1)) * 2 - 1;
        const cy = ((rect.top + rect.height * 0.5) / (window.innerHeight || 1)) * 2 - 1;
        const dx = Math.max(-1, Math.min(1, (this.pointerX - cx) * 1.45));
        const dy = Math.max(-1, Math.min(1, (this.pointerY - cy) * 1.45));
        lookX = dx * 0.36;
        lookY = dy * 0.22;
      }
    }

    const t = nowSec;
    const mt = s.moodTime;
    const hasEmbeddedClip = this.actions.has(mood);

    // Gentle living float + breathing baseline (much smaller under reduced motion)
    const calm = this.prefersReducedMotion() ? 0.3 : 1;
    let posX = Math.sin(t * 1.1) * 0.014 * calm;
    let posY = Math.sin(t * 2.1) * 0.042 * calm;
    let rotX = lookY + Math.sin(t * 1.5) * 0.025 * calm;
    let rotY = lookX + Math.sin(t * 0.9) * 0.075 * calm;
    let rotZ = Math.sin(t * 1.3) * 0.024 * calm;
    let scaleX = 1 + Math.sin(t * 2.1 - 0.5) * 0.012 * calm;
    let scaleY = 1 - Math.sin(t * 2.1 - 0.5) * 0.012 * calm;

    // Layer expressive procedural choreography (dialed back when a skeletal clip drives that mood)
    if (!hasEmbeddedClip) {
      if (mood === 'wave') {
        posY = 0.03 + Math.sin(mt * 5.2) * 0.04;
        rotY = lookX * 0.6 + Math.sin(mt * 3.0) * 0.14;
        rotZ = -0.06 + Math.sin(mt * 5.2) * 0.06;
        scaleY = 1.02 + Math.sin(mt * 5.2) * 0.02;
        scaleX = 0.99 - Math.sin(mt * 5.2) * 0.015;
      } else if (mood === 'cheer') {
        const bounce = Math.abs(Math.sin(mt * 6.4));
        posY = -0.03 + bounce * 0.14;
        rotY = Math.sin(mt * 3.2) * 0.26;
        rotZ = Math.sin(mt * 6.4) * 0.07;
        scaleY = 0.95 + bounce * 0.07;
        scaleX = 1.04 - bounce * 0.05;
      } else if (mood === 'surprise') {
        const pop = Math.exp(-mt * 3.6) * Math.sin(mt * 16);
        posY = 0.05 + pop * 0.08 + Math.sin(mt * 4.2) * 0.02;
        rotX = -0.10;
        rotY = Math.sin(mt * 2.8) * 0.12;
        scaleY = 1.04 + Math.abs(pop) * 0.05;
        scaleX = 0.97 - Math.abs(pop) * 0.03;
      } else if (mood === 'thinking') {
        posY = 0.02 + Math.sin(mt * 2.4) * 0.045;
        rotX = -0.09 + Math.sin(mt * 1.6) * 0.04;
        rotY = Math.sin(mt * 1.45) * 0.65;
        rotZ = 0.08 + Math.sin(mt * 1.45) * 0.04;
      } else if (mood === 'working') {
        posY = 0.02 + Math.sin(mt * 7.6) * 0.05;
        posX = Math.sin(mt * 3.8) * 0.04;
        rotX = 0.18 + Math.sin(mt * 7.6) * 0.04;
        rotY = -0.32 + Math.sin(mt * 2.6) * 0.15;
        rotZ = 0.13 + Math.sin(mt * 3.8) * 0.04;
      }
    }

    s.posX = damp(s.posX, posX, 10, dt);
    s.posY = damp(s.posY, posY, 10, dt);
    s.rotX = damp(s.rotX, rotX, 8, dt);
    s.rotY = damp(s.rotY, rotY, 8, dt);
    s.rotZ = damp(s.rotZ, rotZ, 9, dt);
    s.scaleX = damp(s.scaleX, scaleX, 11, dt);
    s.scaleY = damp(s.scaleY, scaleY, 11, dt);

    // Drag-to-spin momentum coast -> gentle return to front-facing after ~1.1s
    if (!s.dragging) {
      if (Math.abs(s.dragVelYaw) > 0.01) {
        s.dragYaw += s.dragVelYaw * dt;
        s.dragVelYaw *= Math.exp(-5.5 * dt);
      }
      if (performance.now() - s.lastReleaseAt > 1100) {
        // Wrap to nearest full 2π so Athena glides gently forward instead of unwinding
        const twoPi = Math.PI * 2;
        const wrapped = ((s.dragYaw % twoPi) + twoPi * 1.5) % twoPi - Math.PI;
        s.dragYaw = damp(wrapped, 0, 3.8, dt);
        s.dragPitch = damp(s.dragPitch, 0, 4.5, dt);
      }
    }
  }

  private applyMotion(s: MoodMotionState, framing: 'bust' | 'full') {
    if (!this.pivot || !this.camera) return;

    if (framing === 'bust') {
      // Upper body for the 36px rail: crown, face, both arms and the sceptre head
      this.camera.position.set(0, 0.30, 2.5);
      this.camera.lookAt(0, 0.27, 0);
    } else {
      // Full floating figure with generous headroom for the AI screen hero
      this.camera.position.set(0, 0.06, 4.15);
      this.camera.lookAt(0, 0.04, 0);
    }

    this.pivot.position.set(s.posX, s.posY, 0);
    this.pivot.rotation.set(s.rotX + s.dragPitch, s.rotY + s.dragYaw, s.rotZ);
    this.pivot.scale.set(s.scaleX, s.scaleY, 1);
  }

  private renderSubscriber(sub: GlbSubscriber, nowSec: number, dt: number) {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.stepMotion(sub, nowSec, dt);
    this.applyMotion(sub.state, sub.framing);
    this.renderer.render(this.scene, this.camera);

    const { canvas, ctx } = sub;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }
}

export const athenaGlbEngine = new AthenaGlbEngine();

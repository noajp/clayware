// The ways a canvas can start, offered before anything is asked of the AI: a
// built-in template (known code, in place at once) and, for a chart, what it
// counts by and its shape. Kept apart from the templates themselves so the
// registry can check a start without loading their code.

export type CanvasStartKind = 'app' | 'chart';

export interface CanvasStart {
  id: string;
  kind: CanvasStartKind;
  label: string;
  /** The built-in template it places (`CANVAS_TEMPLATES` id). */
  template: string;
  /** What the template keeps as its state from the start. */
  state?: Record<string, string>;
}

export const CANVAS_STARTS: readonly CanvasStart[] = [
  { id: 'dashboard', kind: 'app', label: 'Dashboard', template: 'dashboard' },
  { id: 'whiteboard', kind: 'app', label: 'Whiteboard', template: 'whiteboard' },
  { id: 'summary', kind: 'app', label: 'Summary', template: 'summary' },
  { id: 'chart-status', kind: 'chart', label: 'By status', template: 'chart', state: { chartBy: 'status', chartShape: 'donut' } },
  { id: 'chart-priority', kind: 'chart', label: 'By priority', template: 'chart', state: { chartBy: 'priority', chartShape: 'bar' } },
  { id: 'chart-phase', kind: 'chart', label: 'By Phase', template: 'chart', state: { chartBy: 'phase', chartShape: 'bar' } },
  { id: 'chart-due', kind: 'chart', label: 'By due month', template: 'chart', state: { chartBy: 'due', chartShape: 'line' } },
];

export const canvasStart = (id: unknown): CanvasStart | null =>
  (typeof id === 'string' && CANVAS_STARTS.find((s) => s.id === id)) || null;

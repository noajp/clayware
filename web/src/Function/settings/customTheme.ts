// The Custom theme: a person's own accent and backdrop, and how far apart the
// surfaces and text steps sit (contrast). Kept in this browser, as the other
// themes are. The three values go onto <html> as --custom-accent,
// --custom-bg and --custom-contrast; globals.css derives every surface, text
// and border step from them. A dark backdrop takes the dark tokens
// (theme "custom-dark"), a light one the light tokens ("custom-light").
// The boot script in app/layout.tsx sets the same three before first paint.

const CUSTOM_THEME_KEY = 'clayware.customTheme';

export interface CustomTheme {
  accent: string;
  background: string;
  /** 0–100. */
  contrast: number;
}

const DEFAULT_CUSTOM_THEME: CustomTheme = { accent: '#3d5fae', background: '#0b0b0c', contrast: 30 };

const HEX = /^#[0-9a-f]{6}$/i;

/** A six-digit hex colour from what was typed (with or without "#", three
 *  digits or six, either case), or null. */
export function normalizeHex(input: string): string | null {
  let v = input.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX.test(v) ? v : null;
}

/** Whether a backdrop reads as dark: its relative luminance under 0.25. */
export function isDarkBackground(hex: string): boolean {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2) < 0.25;
}

export function readCustomTheme(): CustomTheme {
  try {
    const raw = window.localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) return DEFAULT_CUSTOM_THEME;
    const v = JSON.parse(raw) as Partial<CustomTheme>;
    return {
      accent: normalizeHex(v.accent ?? '') ?? DEFAULT_CUSTOM_THEME.accent,
      background: normalizeHex(v.background ?? '') ?? DEFAULT_CUSTOM_THEME.background,
      contrast: typeof v.contrast === 'number' ? Math.min(100, Math.max(0, Math.round(v.contrast))) : DEFAULT_CUSTOM_THEME.contrast,
    };
  } catch {
    return DEFAULT_CUSTOM_THEME;
  }
}

/** Puts the values on the page and keeps them; returns the theme to select. */
export function applyCustomTheme(theme: CustomTheme): 'custom-dark' | 'custom-light' {
  const root = document.documentElement.style;
  root.setProperty('--custom-accent', theme.accent);
  root.setProperty('--custom-bg', theme.background);
  root.setProperty('--custom-contrast', String(theme.contrast));
  try { window.localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(theme)); } catch { /* private window */ }
  return isDarkBackground(theme.background) ? 'custom-dark' : 'custom-light';
}

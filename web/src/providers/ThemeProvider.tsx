'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

// Selectable themes: two flat ones, where the backdrop and the islands are
// one surface (White, Black), and two layered ones, where the backdrop sits a
// notch darker than the islands (Light, Dark). Each maps to a single html
// class (next-themes uses classList add/remove, which rejects space-separated
// values). The dark ones are listed in globals.css's "dark context" selectors
// (shared base tokens + Tailwind `dark:`); White only re-tones the light
// surface ramp over :root. Keep this in sync with globals.css, the OPTIONS
// list in Function/settings/appearanceOptions and the boot script in
// app/layout.tsx that moves a retired theme to its nearest. Custom is two
// entries, one for a dark backdrop and one for a light one, so it takes the
// matching token set (Function/settings/customTheme).
const THEMES = ['white', 'light', 'dark', 'black', 'custom-dark', 'custom-light'];
const THEME_CLASS: Record<string, string> = {
  white: 'theme-white',
  light: 'light',
  dark: 'dark',
  black: 'theme-black',
  'custom-dark': 'theme-custom-dark',
  'custom-light': 'theme-custom-light',
};

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={THEMES}
      value={THEME_CLASS}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

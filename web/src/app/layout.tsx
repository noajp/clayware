import type { Metadata, Viewport } from "next";
// The UI's two typefaces ship with the app, from the @fontsource packages (the
// versions and subsets Google Fonts serves): Inter as a variable font, so the
// 510 / 590 UI weights render precisely, and JetBrains Mono for code and data.
// Each script's glyphs are a file of their own, fetched only when used. Nothing is
// fetched from Google while building, so a build cannot fail on that fetch.
// The families ("Inter Variable", "JetBrains Mono Variable") are named in
// globals.css (--font-sans / --font-mono), with what follows them.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";
import { AppDialogHost } from "@/Function/shared/AppDialogHost";
import { Toaster } from "@/Function/shared/Toaster";
import { I18nProvider } from "@/Function/i18n/I18nProvider";

// The two files every page needs, fetched alongside the stylesheet rather than
// after it (the address is the one the stylesheet itself points at).
const PRELOAD_FONTS = [
  new URL("../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url).pathname,
  new URL("../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", import.meta.url).pathname,
];

export const metadata: Metadata = {
  title: "Clayware",
  description: "Organizational activity support for people and AI.",
};

// Mobile rendering: without this, mobile Safari lays the page out at ~980px and
// scales it down (everything tiny). `width=device-width, initial-scale=1` makes
// the layout viewport match the device so the responsive shell (sidebar drawer
// under 1024px) actually engages. `viewport-fit=cover` lets us pad against the
// notch/home-indicator via env(safe-area-inset-*). User scaling is left on
// (no maximum-scale / user-scalable=no) for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f8f8" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {PRELOAD_FONTS.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="anonymous" />
        ))}
        {/* Preferences this browser saved under the earlier key names move to
            the current ones, once, before anything reads them. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var L=localStorage;if(!L.getItem('clayware:storage-renamed')){for(var i=L.length-1;i>=0;i--){var k=L.key(i);if(k&&k.indexOf('alcon')===0){var n='clayware'+k.slice(5);if(L.getItem(n)===null)L.setItem(n,L.getItem(k));L.removeItem(k)}}L.setItem('clayware:storage-renamed','1')}}catch(e){}",
          }}
        />
        {/* A theme that is no longer offered moves to its nearest, before
            next-themes reads it: the blue and warm darks to Dark, the
            near-black to Black, the pure white to White, the tinted lights
            to Light. A Custom theme's colours go on before paint too. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m={midnight:'dark',graphite:'dark',carbon:'black',snow:'white',ivory:'light',mist:'light'};var t=localStorage.getItem('theme');if(t&&m[t])localStorage.setItem('theme',m[t]);var c=JSON.parse(localStorage.getItem('clayware.customTheme')||'null');if(c){var r=document.documentElement.style;if(c.accent)r.setProperty('--custom-accent',c.accent);if(c.background)r.setProperty('--custom-bg',c.background);if(c.contrast!=null)r.setProperty('--custom-contrast',String(c.contrast))}}catch(e){}",
          }}
        />
        {/* Set the document language before paint. The provider uses the same
            resolution order and translates visible copy after hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var s=['en','ja','ko','fr','es'];var n=function(x){var l=(x||'').trim().toLowerCase().split(/[-_]/)[0];return s.includes(l)?l:null};var v=null;try{v=localStorage.getItem('clayware:locale')}catch(e){}var l=n(v);if(!l){var a=navigator.languages||[navigator.language];for(var i=0;i<a.length&&!l;i++)l=n(a[i])}document.documentElement.lang=l||'en'}catch(e){}",
          }}
        />
        {/* Apply the Font size (text scale --fs) before first paint. Default is
            the slightly-large baseline (1.075) when nothing is saved. Keep the
            map in sync with FONT_SIZES in Function/settings/appearanceOptions. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var k=localStorage.getItem('clayware.fontsize');var m={smaller:'0.925',small:'1',default:'1.075',large:'1.15',larger:'1.25'};document.documentElement.style.setProperty('--fs',m[k]||'1.075');}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <I18nProvider>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                {children}
                <AppDialogHost />
                <Toaster />
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

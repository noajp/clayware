'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { MESSAGES } from './messages';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  interpolate,
  resolveLocale,
  type Locale,
} from './locales';
import { renameNouns } from './spaceNouns';
import { getNounTable, subscribeNounTable } from './spaceNounsStore';

const LOCALE_CHANGE_EVENT = 'clayware:locale-change';

let cachedLocale: Locale | null = null;

function readLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  if (cachedLocale) return cachedLocale;
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* storage may be disabled */ }
  cachedLocale = resolveLocale(saved, window.navigator.languages ?? [window.navigator.language]);
  return cachedLocale;
}

/** The viewer's language outside React (data-layer notices); `t` inside it. */
export function translate(message: string, values?: Record<string, string | number>): string {
  const locale = readLocale();
  const translated = locale === 'en' ? message : (MESSAGES[locale][message] ?? message);
  return interpolate(renameNouns(translated, getNounTable(), locale), values);
}

function subscribe(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== LOCALE_STORAGE_KEY) return;
    cachedLocale = null;
    listener();
  };
  const handleChange = () => listener();
  window.addEventListener('storage', handleStorage);
  window.addEventListener(LOCALE_CHANGE_EVENT, handleChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(LOCALE_CHANGE_EVENT, handleChange);
  };
}

type Translate = (message: string, values?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  /** `t` with the built-in nouns kept — for the page where a Space names them. */
  tBuiltIn: Translate;
}

const defaultValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (message, values) => interpolate(message, values),
  tBuiltIn: (message, values) => interpolate(message, values),
};

// The English fallback also keeps independently rendered components (tests,
// previews, and future embedded surfaces) usable without app-level wiring.
const I18nContext = createContext<I18nContextValue>(defaultValue);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);

  const setLocale = useCallback((nextLocale: Locale) => {
    cachedLocale = nextLocale;
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale); } catch { /* ignore */ }
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // The Space's names for Strategy, Object and Element go into the message
  // text before its values (spaceNouns.ts): a name someone typed stays as typed.
  const nouns = useSyncExternalStore(subscribeNounTable, getNounTable, () => null);
  const tBuiltIn = useCallback<Translate>((message, values) => {
    const translated = locale === 'en' ? message : (MESSAGES[locale][message] ?? message);
    return interpolate(translated, values);
  }, [locale]);
  const t = useCallback<Translate>((message, values) => {
    const translated = locale === 'en' ? message : (MESSAGES[locale][message] ?? message);
    return interpolate(renameNouns(translated, nouns, locale), values);
  }, [locale, nouns]);

  const value = useMemo(() => ({ locale, setLocale, t, tBuiltIn }), [locale, setLocale, t, tBuiltIn]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

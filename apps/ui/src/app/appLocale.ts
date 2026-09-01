import { useSyncExternalStore } from "react";

export type AppLocale = "ja" | "en";

const STORAGE_KEY = "biofigurestat.app-locale.v1";
const listeners = new Set<() => void>();

function storedLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "ja" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

// Public Alpha was Japanese-only. Keep Japanese as the compatibility default;
// the first-launch notice presents an explicit language choice before consent.
let currentLocale: AppLocale = storedLocale() ?? "ja";

function applyDocumentLanguage(locale: AppLocale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

applyDocumentLanguage(currentLocale);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppLocale(): AppLocale {
  return currentLocale;
}

export function setAppLocale(locale: AppLocale) {
  if (locale === currentLocale) return;
  currentLocale = locale;
  applyDocumentLanguage(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Language selection remains valid for this session when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function useAppLocale(): AppLocale {
  return useSyncExternalStore(subscribe, getAppLocale, getAppLocale);
}

export function localizedText(locale: AppLocale, ja: string, en: string): string {
  return locale === "ja" ? ja : en;
}

/**
 * Internal exceptions may still contain legacy Japanese detail. English UI
 * uses a reviewed action-specific fallback instead of exposing that detail.
 */
export function localizedFailureMessage(
  locale: AppLocale,
  error: unknown,
  jaFallback: string,
  enFallback: string,
): string {
  if (locale === "ja" && error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return localizedText(locale, jaFallback, enFallback);
}

export const appLocaleStorageKey = STORAGE_KEY;

export function resetAppLocaleForTests(locale: AppLocale = "ja") {
  currentLocale = locale;
  applyDocumentLanguage(locale);
  for (const listener of listeners) listener();
}

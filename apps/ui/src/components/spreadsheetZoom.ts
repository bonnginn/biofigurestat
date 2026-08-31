import { useEffect, useState } from "react";

export const SPREADSHEET_ZOOM_LEVELS = [70, 80, 90, 100, 110, 120, 130] as const;

export function normalizeSpreadsheetZoom(value: number): number {
  return SPREADSHEET_ZOOM_LEVELS.some((level) => level === value) ? value : 100;
}

export function nextSpreadsheetZoom(current: number, direction: -1 | 1): number {
  const currentIndex = SPREADSHEET_ZOOM_LEVELS.findIndex((level) => level === current);
  const boundedIndex = Math.min(
    SPREADSHEET_ZOOM_LEVELS.length - 1,
    Math.max(0, (currentIndex < 0 ? 3 : currentIndex) + direction),
  );
  return SPREADSHEET_ZOOM_LEVELS[boundedIndex] ?? 100;
}

function initialZoom(storageKey: string): number {
  if (typeof window === "undefined") return 100;
  try {
    return normalizeSpreadsheetZoom(Number(window.localStorage.getItem(storageKey)));
  } catch {
    return 100;
  }
}

/** Shared worksheet zoom preference; each surface retains its own storage key. */
export function useSpreadsheetZoom(storageKey: string) {
  const [zoom, setZoom] = useState<number>(() => initialZoom(storageKey));
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(zoom));
    } catch {
      // A blocked preference store must not prevent scientific data entry.
    }
  }, [storageKey, zoom]);
  return {
    zoom,
    setZoom,
    changeZoom: (direction: -1 | 1) => setZoom((current) => nextSpreadsheetZoom(current, direction)),
  };
}

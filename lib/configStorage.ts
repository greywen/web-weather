'use client';

export const CONFIG_STORAGE_KEYS = {
  sound: 'web-weather-sound',
  locale: 'web-weather-locale',
  temperatureUnit: 'web-weather-temp-unit',
  mapLocation: 'web-weather-map-location',
  autoMode: 'web-weather-auto-mode',
} as const;

export type ConfigStorageKey = (typeof CONFIG_STORAGE_KEYS)[keyof typeof CONFIG_STORAGE_KEYS];

export function readConfigFromLocalStorage(key: ConfigStorageKey): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveConfigToLocalStorage(key: ConfigStorageKey, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode, quota exceeded, blocked storage).
  }
}
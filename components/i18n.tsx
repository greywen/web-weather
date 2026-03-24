'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CONFIG_STORAGE_KEYS, readConfigFromLocalStorage, saveConfigToLocalStorage } from '../lib/configStorage';

export type Locale = 'en' | 'zh';
export type TemperatureUnit = '°C' | '°F';

export function convertTemp(celsius: number, unit: TemperatureUnit): number {
  return unit === '°F' ? celsius * 9 / 5 + 32 : celsius;
}

export function formatTemp(celsius: number, unit: TemperatureUnit): string {
  return `${Math.round(convertTemp(celsius, unit))}°`;
}

const translations = {
  en: {
    // Panel
    weatherControl: 'Weather Control',
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
    closePanel: 'Close Panel',

    // Quick Controls
    weatherMode: 'Weather Mode',
    weatherModeDesc: 'Auto Location / Manual',
    auto: 'Auto',
    manual: 'Manual',
    immersiveMode: 'Immersive Mode',
    immersiveModeDesc: 'Fullscreen / Hide Panel',
    lastUpdated: 'Updated',
    neverUpdated: 'Not yet',
    enter: 'Enter',
    exit: 'Exit',
    sound: 'Sound',
    soundDesc: 'Rain / Wind / Thunder',
    on: 'On',
    off: 'Off',

    // Weather Types
    weatherType: 'Weather Type',
    sunny: 'Sunny',
    rainy: 'Rainy',
    snowy: 'Snowy',
    cloudy: 'Cloudy',
    foggy: 'Foggy',
    icy: 'Icy',

    // Global Settings
    globalSettings: 'Global Settings',
    time24h: 'Time (24h)',
    transitionDuration: 'Transition Duration',

    // Parameters
    parameters: 'Parameters',
    lightIntensity: 'Light Intensity',
    soft: 'Soft',
    intense: 'Intense',
    cloudCover: 'Cloud Cover',
    rainfall: 'Rainfall',
    snowfall: 'Snowfall',
    fallSpeed: 'Fall Speed',
    wind: 'Wind',
    leftWind: '← Left Wind',
    rightWind: 'Right Wind →',
    thunder: 'Thunder',
    thunderDesc: 'Enable lightning flash effects',
    temperatureSnow: 'Temperature (Snow)',
    freeze: '❄️ Freeze (-10°)',
    melt: '💧 Melt (10°)',
    moveSpeed: 'Move Speed',
    fogDensity: 'Fog Density',

    // Language & Units
    language: 'Language',
    temperatureUnit: 'Temperature Unit',

    // Weather Timeline
    weatherForecast: 'Weather Forecast',
    hourly24h: '24 Hours',
    daily7d: '7 Days',
    now: 'Now',
    today: 'Today',
    tomorrow: 'Tomorrow',
    feelsLike: 'Feels like',
    precipitationAmount: 'Precipitation',
    windSpeedLabel: 'Wind',
    humidityLabel: 'Humidity',
    high: 'H',
    low: 'L',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  },
  zh: {
    // Panel
    weatherControl: '天气控制',
    hidePanel: '隐藏面板',
    showPanel: '显示面板',
    closePanel: '关闭面板',

    // Quick Controls
    weatherMode: '天气模式',
    weatherModeDesc: '自动定位 / 手动',
    auto: '自动',
    manual: '手动',
    immersiveMode: '沉浸模式',
    immersiveModeDesc: '全屏 / 隐藏面板',
    lastUpdated: '已更新',
    neverUpdated: '暂无',
    enter: '进入',
    exit: '退出',
    sound: '声音',
    soundDesc: '雨声 / 风声 / 雷声',
    on: '开启',
    off: '关闭',

    // Weather Types
    weatherType: '天气类型',
    sunny: '晴天',
    rainy: '雨天',
    snowy: '雪天',
    cloudy: '多云',
    foggy: '雾天',
    icy: '冰冻',

    // Global Settings
    globalSettings: '全局设置',
    time24h: '时间（24小时）',
    transitionDuration: '过渡时长',

    // Parameters
    parameters: '参数',
    lightIntensity: '光照强度',
    soft: '柔和',
    intense: '强烈',
    cloudCover: '云量',
    rainfall: '降雨量',
    snowfall: '降雪量',
    fallSpeed: '下落速度',
    wind: '风力',
    leftWind: '← 左风',
    rightWind: '右风 →',
    thunder: '雷暴',
    thunderDesc: '启用闪电效果',
    temperatureSnow: '温度（降雪）',
    freeze: '❄️ 冻结 (-10°)',
    melt: '💧 融化 (10°)',
    moveSpeed: '移动速度',
    fogDensity: '雾浓度',

    // Language & Units
    language: '语言',
    temperatureUnit: '温度单位',

    // Weather Timeline
    weatherForecast: '天气预报',
    hourly24h: '24小时',
    daily7d: '7天',
    now: '现在',
    today: '今天',
    tomorrow: '明天',
    feelsLike: '体感温度',
    precipitationAmount: '降水量',
    windSpeedLabel: '风速',
    humidityLabel: '湿度',
    high: '高',
    low: '低',
    mon: '周一',
    tue: '周二',
    wed: '周三',
    thu: '周四',
    fri: '周五',
    sat: '周六',
    sun: '周日',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  temperatureUnit: TemperatureUnit;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.locale);
    if (saved === 'en' || saved === 'zh') return saved;
    return 'en';
  });
  const [tempUnit, setTempUnitState] = useState<TemperatureUnit>(() => {
    const saved = readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.temperatureUnit);
    if (saved === '°C' || saved === '°F') return saved;
    return '°C';
  });
  const [mounted] = useState(() => typeof window !== 'undefined');

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.locale, l);
  }, []);

  const setTemperatureUnit = useCallback((unit: TemperatureUnit) => {
    setTempUnitState(unit);
    saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.temperatureUnit, unit);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[locale][key] ?? key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, temperatureUnit: tempUnit, setTemperatureUnit }}>
      {mounted ? children : null}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

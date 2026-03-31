'use client';

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
    Sun, Moon, CloudRain, Snowflake, Cloud, CloudFog, CloudHail, Wind,
    MapPin, Search, Volume2, VolumeX, Maximize2, Minimize2,
    Clock, Github, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    Zap, Droplets, Thermometer, Eye, Globe,
    LocateFixed, RefreshCw, SlidersHorizontal, TimerOff,
} from 'lucide-react';
import { useWeather } from './WeatherProvider';
import { WeatherType, WeatherConfig } from './weather-types';
import { useI18n, TranslationKey, formatTemp } from './i18n';
import WeatherTimeline from './WeatherTimeline';
import { CONFIG_STORAGE_KEYS, readConfigFromLocalStorage, saveConfigToLocalStorage } from '../lib/configStorage';

const WorldMap = dynamic(() => import('./WorldMap'), { ssr: false });

interface NominatimResult {
    display_name: string;
    lat: string;
    lon: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Weather type → Lucide icon
const weatherIconMap: Record<WeatherType, React.ComponentType<{ size?: number; className?: string }>> = {
    sunny: Sun,
    rainy: CloudRain,
    snowy: Snowflake,
    cloudy: Cloud,
    foggy: CloudFog,
    icy: Snowflake,
    hail: CloudHail,
    sandstorm: Wind,
};

// Per-type accent colours (text)
const weatherAccent: Record<WeatherType, string> = {
    sunny: 'text-amber-400',
    rainy: 'text-blue-400',
    snowy: 'text-sky-300',
    cloudy: 'text-slate-300',
    foggy: 'text-gray-400',
    icy: 'text-cyan-300',
    hail: 'text-indigo-300',
    sandstorm: 'text-orange-400',
};

// Per-type chip bg / border / shadow for active state
const weatherChip: Record<WeatherType, string> = {
    sunny: 'bg-amber-500/20 border-amber-500/30 shadow-amber-500/10',
    rainy: 'bg-blue-500/20 border-blue-500/30 shadow-blue-500/10',
    snowy: 'bg-sky-500/20 border-sky-500/30 shadow-sky-500/10',
    cloudy: 'bg-slate-400/15 border-slate-400/25 shadow-slate-400/10',
    foggy: 'bg-gray-500/20 border-gray-500/30 shadow-gray-500/10',
    icy: 'bg-cyan-500/20 border-cyan-500/30 shadow-cyan-500/10',
    hail: 'bg-indigo-500/20 border-indigo-500/30 shadow-indigo-500/10',
    sandstorm: 'bg-orange-500/20 border-orange-500/30 shadow-orange-500/10',
};

const displayTypes: WeatherType[] = ['sunny', 'rainy', 'snowy', 'cloudy', 'foggy', 'hail', 'sandstorm'];

/* ── tiny sub-components ──────────────────────────────────── */

function Slider({ icon, label, value, min, max, step, current, onChange, accent, leftHint, rightHint }: {
    icon: ReactNode; label: string; value: string;
    min: number; max: number; step: number; current: number;
    onChange: (v: number) => void; accent?: string;
    leftHint?: string; rightHint?: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">{icon}<span className="text-[13px] text-[var(--text-60)]">{label}</span></div>
                <span className="text-[13px] font-mono text-[var(--text-40)]">{value}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={current}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className={`w-full h-1 bg-[var(--slider-track)] rounded-full appearance-none cursor-pointer ${accent ?? 'accent-blue-500'}`} />
            {(leftHint || rightHint) && (
                <div className="flex justify-between text-[11px] text-[var(--text-20)] mt-1">
                    <span>{leftHint}</span><span>{rightHint}</span>
                </div>
            )}
        </div>
    );
}

function Toggle({ checked, onChange, activeColor = 'bg-blue-500/60' }: {
    checked: boolean; onChange: () => void; activeColor?: string;
}) {
    return (
        <button type="button" onClick={onChange}
            className={`w-8 h-[18px] rounded-full transition-all relative shrink-0 ${checked ? activeColor : 'bg-[var(--toggle-off)]'}`}>
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all ${checked ? 'left-[16px] bg-[var(--toggle-knob-on)]' : 'left-[2px] bg-[var(--toggle-knob-off)]'}`} />
        </button>
    );
}

function ToolbarBtn({ icon, active, onClick, title, activeClass }: {
    icon: ReactNode; active?: boolean; onClick: () => void; title: string; activeClass?: string;
}) {
    return (
        <button type="button" onClick={onClick} title={title}
            className={`p-2 rounded-xl transition-all ${active ? (activeClass ?? 'bg-blue-500/20 text-blue-400') : 'text-[var(--text-35)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)]'}`}>
            {icon}
        </button>
    );
}

/* ── main component ───────────────────────────────────────── */

export default function WeatherSettings() {
    const {
        weather, setWeather, config, setConfig, transition, setTransitionConfig,
        isAuto, isLocating, toggleAuto, soundEnabled, setSoundEnabled,
        immersive, setImmersive, autoPause, setAutoPause, lastUpdated, setLocation, customCoords, weatherData,
    } = useWeather();
    const { t, locale, setLocale, temperatureUnit, setTemperatureUnit, theme, setTheme } = useI18n();

    const [isOpen, setIsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
    const [menuOpen, setMenuOpen] = useState(false);
    const [mapOpen, setMapOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [paramsOpen, setParamsOpen] = useState(() => readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.paramsOpen) !== 'off');
    const [forecastOpen, setForecastOpen] = useState(() => readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.forecastOpen) !== 'off');

    const searchRef = useRef<HTMLInputElement>(null);
    const weatherTypeScrollRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    /* location search (debounced, with abort for race-safety) */
    const handleSearchInput = useCallback((value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        abortRef.current?.abort();
        if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
        debounceRef.current = setTimeout(async () => {
            const controller = new AbortController();
            abortRef.current = controller;
            setSearching(true);
            try {
                const res = await fetch(
                    `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(value)}&limit=5`,
                    { headers: { 'Accept-Language': locale }, signal: controller.signal },
                );
                if (res.ok && !controller.signal.aborted) setSearchResults(await res.json());
            } catch { /* network error or aborted – ignore */ }
            if (!controller.signal.aborted) setSearching(false);
        }, 400);
    }, [locale]);

    /* cleanup debounce + inflight request on unmount */
    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        abortRef.current?.abort();
    }, []);

    const selectResult = (r: NominatimResult) => {
        setLocation(parseFloat(r.lat), parseFloat(r.lon));
        setSearchQuery('');
        setSearchResults([]);
        setSearchOpen(false);
    };

    const scrollWeatherTypes = (direction: 'left' | 'right') => {
        const el = weatherTypeScrollRef.current;
        if (!el) return;
        const offset = Math.round(el.clientWidth * 0.7);
        el.scrollBy({
            left: direction === 'right' ? offset : -offset,
            behavior: 'smooth',
        });
    };

    /* helpers */
    const set = (key: keyof WeatherConfig, v: number | boolean) => setConfig({ [key]: v });
    const panelVisible = immersive ? menuOpen : isOpen;
    const WeatherIcon = weatherIconMap[weather];
    const locName = weatherData?.locationName || (isAuto ? t('unknownLocation' as TranslationKey) : '');
    const coordsText = customCoords ? `${customCoords.lat.toFixed(4)}, ${customCoords.lon.toFixed(4)}` : '';
    const temp = weatherData?.temperature;
    const feelsLike = weatherData?.apparentTemperature;
    const autoLoading = isAuto && (!weatherData || !weatherData.locationName);

    return (
        <>
            {/* ── Collapsed badge ──────────────────────────────── */}
            {!panelVisible && (
                <button type="button"
                    onClick={() => immersive ? setMenuOpen(true) : setIsOpen(true)}
                    className="fixed top-4 left-4 z-[70] flex items-center gap-2.5 rounded-2xl bg-[var(--badge-bg)] backdrop-blur-xl text-[var(--text-primary)] pl-3 pr-4 py-2.5 border border-[var(--badge-border)] hover:bg-[var(--badge-hover)] hover:border-[var(--border-hover)] transition-all cursor-pointer shadow-[var(--badge-shadow)] group"
                >
                    <div className={`p-1.5 rounded-lg border ${weatherChip[weather]} shadow-lg`}>
                        <WeatherIcon size={15} className={weatherAccent[weather]} />
                    </div>
                    <span className="text-sm font-medium truncate max-w-[140px]">
                        {autoLoading ? (
                            <span className="inline-block h-[16px] w-16 rounded bg-[var(--surface)] animate-pulse align-middle" />
                        ) : (
                            isAuto && locName ? locName.split(',')[0] : t(weather as TranslationKey)
                        )}
                    </span>
                    {isAuto && !autoLoading && temp != null && (
                        <>
                            <span className="text-[var(--text-20)]">·</span>
                            <span className="text-sm text-[var(--text-70)] font-semibold">{formatTemp(temp, temperatureUnit)}</span>
                        </>
                    )}
                    {isAuto && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-0.5" />}
                </button>
            )}

            {/* ── Main floating panel ─────────────────────────── */}
            <div className={`fixed z-[70] transition-all duration-300 ease-out
                w-[92vw] max-w-[24rem] left-1/2 -translate-x-1/2 top-12
                md:w-[22rem] md:max-w-[calc(100vw-2rem)] md:left-4 md:translate-x-0 md:top-4
                ${panelVisible
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 -translate-y-4 pointer-events-none scale-[0.97]'}`}>

                <div className="bg-[var(--panel-bg)] backdrop-blur-2xl border border-[var(--panel-border)] rounded-2xl shadow-[var(--panel-shadow)] overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="flex-1 overflow-y-auto overflow-x-hidden settings-scroll min-h-0">

                        {/* ─── Section: Location header ─────────── */}
                        <div className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className={`p-2.5 rounded-xl border ${weatherChip[weather]} shadow-lg mt-0.5 shrink-0`}>
                                        <WeatherIcon size={22} className={weatherAccent[weather]} />
                                    </div>
                                    <div className="min-w-0 pt-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {autoLoading ? (
                                                <div className="h-[20px] w-24 rounded bg-[var(--surface)] animate-pulse" />
                                            ) : (
                                                <h2 className="text-[15px] font-semibold text-[var(--text-primary)] truncate max-w-[160px]">
                                                    {isAuto && locName ? locName.split(',')[0] : t(weather as TranslationKey)}
                                                </h2>
                                            )}
                                            {isAuto ? (
                                                <span className="text-[10px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded-full border border-green-500/20 uppercase tracking-widest shrink-0">
                                                    {t('auto')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-[var(--text-35)] bg-[var(--surface)] px-1.5 py-0.5 rounded-full border border-[var(--border)] uppercase tracking-widest shrink-0">
                                                    {t('manual')}
                                                </span>
                                            )}
                                        </div>
                                        {isAuto ? (
                                            autoLoading ? (
                                                <div className="mt-1.5 space-y-1.5">
                                                    <div className="h-[14px] w-36 rounded bg-[var(--surface)] animate-pulse" />
                                                    <div className="h-[13px] w-28 rounded bg-[var(--surface)] animate-pulse" />
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="h-[24px] w-12 rounded bg-[var(--surface)] animate-pulse" />
                                                        <div className="h-[16px] w-10 rounded bg-[var(--surface)] animate-pulse" />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {locName.includes(',') && (
                                                        <p className="text-[13px] text-[var(--text-35)] truncate mt-0.5">
                                                            {locName.split(',').slice(1).join(',').trim()}
                                                        </p>
                                                    )}
                                                    {coordsText && (
                                                        <p className="text-xs text-[var(--text-25)] font-mono truncate mt-0.5">
                                                            {coordsText}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        {temp != null && (
                                                            <span className="text-xl font-bold text-[var(--text-primary)] leading-none">{formatTemp(temp, temperatureUnit)}</span>
                                                        )}
                                                        <span className={`text-[13px] font-medium ${weatherAccent[weather]}`}>{t(weather as TranslationKey)}</span>
                                                        {feelsLike != null && temp != null && (
                                                            <span className="text-xs text-[var(--text-25)]">{t('feelsLike')} {formatTemp(feelsLike, temperatureUnit)}</span>
                                                        )}
                                                    </div>
                                                    {lastUpdated && (
                                                        <span className="text-[11px] text-[var(--text-20)] mt-1 block">
                                                            {t('lastUpdated')} {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </>
                                            )
                                        ) : (
                                            <p className="text-[13px] text-[var(--text-35)] mt-1">
                                                {t('weatherModeDesc')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button type="button"
                                    onClick={() => immersive ? setMenuOpen(false) : setIsOpen(false)}
                                    className="p-1.5 rounded-lg text-[var(--text-25)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-all shrink-0">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* inline location search */}
                            <div className="relative">
                                <div className={`flex items-center gap-2 rounded-xl border transition-all cursor-text
                                    ${searchOpen
                                        ? 'bg-[var(--surface-active)] border-[var(--border-active)]'
                                        : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)]'}`}
                                    onClick={() => { setSearchOpen(true); searchRef.current?.focus(); }}>
                                    <div className="pl-3 text-[var(--text-25)]"><Search size={14} /></div>
                                    <input ref={searchRef} type="text" value={searchQuery}
                                        onChange={(e) => handleSearchInput(e.target.value)}
                                        onFocus={() => setSearchOpen(true)}
                                        onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                                        placeholder={t('searchPlaceholder' as TranslationKey)}
                                        className="flex-1 h-9 bg-transparent text-[13px] text-[var(--text-80)] placeholder-[var(--text-20)] focus:outline-none" />
                                    {searching && (
                                        <div className="pr-3"><div className="w-3.5 h-3.5 border-2 border-[var(--spinner-track)] border-t-[var(--spinner-head)] rounded-full animate-spin" /></div>
                                    )}
                                    <button type="button"
                                        onClick={(e) => { e.stopPropagation(); setMapOpen(true); }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 mr-1.5 rounded-lg text-xs font-medium text-[var(--text-35)] hover:text-[var(--text-70)] hover:bg-[var(--surface-hover)] transition-all whitespace-nowrap shrink-0"
                                        title={t('worldMap' as TranslationKey)}>
                                        <Globe size={13} />
                                        <span>{t('worldMap' as TranslationKey)}</span>
                                    </button>
                                </div>

                                {/* search results dropdown */}
                                {searchOpen && searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--dropdown-bg)] backdrop-blur-xl rounded-xl border border-[var(--dropdown-border)] shadow-2xl overflow-hidden z-10 max-h-[200px] overflow-y-auto">
                                        {searchResults.map((r, i) => (
                                            <button key={i} type="button" onClick={() => selectResult(r)}
                                                className="w-full text-left px-3 py-2.5 text-[13px] text-[var(--text-70)] hover:bg-[var(--surface-hover)] transition-colors flex items-start gap-2 border-b border-[var(--border)] last:border-b-0">
                                                <MapPin size={12} className="text-[var(--text-25)] mt-0.5 shrink-0" />
                                                <span className="line-clamp-2 leading-snug">{r.display_name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="h-px bg-[var(--divider)] mx-4" />

                        {/* ─── Section: Weather type selector ───── */}
                        <div className="py-3">
                            <div className="flex items-center gap-1 px-3">
                                <button
                                    type="button"
                                    onClick={() => scrollWeatherTypes('left')}
                                    aria-label="Scroll weather types left"
                                    className="p-1.5 rounded-lg text-[var(--text-25)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-colors shrink-0"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <div
                                    ref={weatherTypeScrollRef}
                                    className="flex-1 flex gap-1 overflow-x-auto scrollbar-none"
                                >
                                    {displayTypes.map((wt) => {
                                        const Icon = weatherIconMap[wt];
                                        const active = weather === wt;
                                        return (
                                            <button key={wt}
                                                onClick={() => setWeather(wt)}
                                                title={t(wt as TranslationKey)}
                                                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all shrink-0
                                                    ${active
                                                        ? `${weatherChip[wt]} border shadow-lg`
                                                        : 'border border-transparent hover:bg-[var(--surface)] hover:border-[var(--border)]'}`}>
                                                <Icon size={17} className={active ? weatherAccent[wt] : 'text-[var(--text-35)]'} />
                                                <span className={`whitespace-nowrap text-[10px] font-medium leading-none ${active ? 'text-[var(--text-90)]' : 'text-[var(--text-25)]'}`}>
                                                    {t(wt as TranslationKey)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => scrollWeatherTypes('right')}
                                    aria-label="Scroll weather types right"
                                    className="p-1.5 rounded-lg text-[var(--text-25)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-colors shrink-0"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-[var(--divider)] mx-4" />

                        {/* ─── Section: Forecast ──────────────────── */}
                        <div className="px-4 py-3">
                            <WeatherTimeline collapsed={!forecastOpen} onToggle={() => {
                                setForecastOpen((v) => {
                                    const next = !v;
                                    saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.forecastOpen, next ? 'on' : 'off');
                                    return next;
                                });
                            }} />
                        </div>

                        <div className="h-px bg-[var(--divider)] mx-4" />

                        {/* ─── Section: Parameters ────────────────── */}
                        <div className="px-4 py-3">
                            <button type="button" onClick={() => {
                                setParamsOpen((v) => {
                                    const next = !v;
                                    saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.paramsOpen, next ? 'on' : 'off');
                                    return next;
                                });
                            }}
                                className="flex items-center justify-between w-full group mb-1">
                                <div className="flex items-center gap-1.5">
                                    <SlidersHorizontal size={11} className="text-[var(--text-35)]" />
                                    <span className="text-xs font-bold text-[var(--text-35)] uppercase tracking-widest group-hover:text-[var(--text-60)] transition-colors">
                                        {t('parameters')}
                                    </span>
                                </div>
                                {paramsOpen
                                    ? <ChevronUp size={12} className="text-[var(--text-25)]" />
                                    : <ChevronDown size={12} className="text-[var(--text-25)]" />}
                            </button>

                            {paramsOpen && (
                                <div className="space-y-4 mt-3">
                                    {/* Time */}
                                    <Slider icon={<Clock size={12} className="text-[var(--text-40)]" />}
                                        label={t('time24h')}
                                        value={`${Math.floor(config.time || 12).toString().padStart(2, '0')}:${Math.floor(((config.time || 12) % 1) * 60).toString().padStart(2, '0')}`}
                                        min={0} max={24} step={0.1} current={config.time ?? 12}
                                        onChange={(v) => set('time', v)} />

                                    {/* Transition */}
                                    <Slider icon={<RefreshCw size={12} className="text-[var(--text-40)]" />}
                                        label={t('transitionDuration')}
                                        value={`${transition.duration.toFixed(1)}s`}
                                        min={0.5} max={8} step={0.1} current={transition.duration}
                                        onChange={(v) => setTransitionConfig({ duration: v })} />

                                    {/* ── Sunny ── */}
                                    {weather === 'sunny' && (
                                        <Slider icon={<Sun size={12} className="text-amber-400/60" />}
                                            label={t('lightIntensity')} value={config.intensity.toFixed(1)}
                                            min={0} max={3} step={0.1} current={config.intensity}
                                            onChange={(v) => set('intensity', v)} accent="accent-amber-500"
                                            leftHint={t('soft')} rightHint={t('intense')} />
                                    )}

                                    {/* ── Rainy / Snowy ── */}
                                    {(weather === 'rainy' || weather === 'snowy') && (<>
                                        {weather === 'rainy' && (
                                            <Slider icon={<Cloud size={12} className="text-blue-400/60" />}
                                                label={t('cloudCover')} value={`${((config.cloudCover ?? 0.1) * 100).toFixed(0)}%`}
                                                min={0} max={1} step={0.1} current={config.cloudCover ?? 0.1}
                                                onChange={(v) => set('cloudCover', v)} accent="accent-blue-400" />
                                        )}
                                        <Slider icon={<Droplets size={12} className="text-blue-400/60" />}
                                            label={weather === 'rainy' ? t('rainfall') : t('snowfall')} value={String(config.particleCount)}
                                            min={0} max={500} step={10} current={config.particleCount}
                                            onChange={(v) => set('particleCount', v)} />
                                        <Slider icon={<CloudRain size={12} className="text-[var(--text-40)]" />}
                                            label={t('fallSpeed')} value={`${config.speed.toFixed(1)}x`}
                                            min={0.5} max={3} step={0.1} current={config.speed}
                                            onChange={(v) => set('speed', v)} />
                                        <Slider icon={<Wind size={12} className="text-[var(--text-40)]" />}
                                            label={t('wind')} value={config.wind.toFixed(1)}
                                            min={-3} max={3} step={0.1} current={config.wind}
                                            onChange={(v) => set('wind', v)}
                                            leftHint={t('leftWind')} rightHint={t('rightWind')} />
                                        {weather === 'rainy' && (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <Zap size={12} className="text-yellow-400/60" />
                                                    <span className="text-[13px] text-[var(--text-60)]">{t('thunder')}</span>
                                                </div>
                                                <Toggle checked={!!config.thunder} onChange={() => set('thunder', !config.thunder)} activeColor="bg-yellow-500/50" />
                                            </div>
                                        )}
                                        {weather === 'snowy' && (
                                            <Slider icon={<Thermometer size={12} className="text-cyan-400/60" />}
                                                label={t('temperatureSnow')} value={`${config.temperature ?? 0}°C`}
                                                min={-10} max={10} step={1} current={config.temperature ?? 0}
                                                onChange={(v) => set('temperature', v)} accent="accent-cyan-500"
                                                leftHint={t('freeze')} rightHint={t('melt')} />
                                        )}
                                    </>)}

                                    {/* ── Cloudy ── */}
                                    {weather === 'cloudy' && (<>
                                        <Slider icon={<Cloud size={12} className="text-slate-300/60" />}
                                            label={t('cloudCover')} value={`${((config.cloudCover ?? 0.1) * 100).toFixed(0)}%`}
                                            min={0} max={1} step={0.1} current={config.cloudCover ?? 0.1}
                                            onChange={(v) => set('cloudCover', v)} />
                                        <Slider icon={<Wind size={12} className="text-[var(--text-40)]" />}
                                            label={t('moveSpeed')} value={`${config.speed.toFixed(1)}x`}
                                            min={0} max={5} step={0.1} current={config.speed}
                                            onChange={(v) => set('speed', v)} />
                                    </>)}

                                    {/* ── Foggy ── */}
                                    {weather === 'foggy' && (
                                        <Slider icon={<Eye size={12} className="text-gray-400/60" />}
                                            label={t('fogDensity')} value={`${((config.fogDensity ?? 0.5) * 100).toFixed(0)}%`}
                                            min={0} max={1} step={0.05} current={config.fogDensity ?? 0.5}
                                            onChange={(v) => set('fogDensity', v)} />
                                    )}

                                    {/* ── Hail ── */}
                                    {weather === 'hail' && (<>
                                        <Slider icon={<Cloud size={12} className="text-indigo-300/60" />}
                                            label={t('cloudCover')} value={`${((config.cloudCover ?? 0.8) * 100).toFixed(0)}%`}
                                            min={0} max={1} step={0.05} current={config.cloudCover ?? 0.8}
                                            onChange={(v) => set('cloudCover', v)} />
                                        <Slider icon={<Droplets size={12} className="text-blue-400/60" />}
                                            label={t('rainfall')} value={String(config.particleCount)}
                                            min={0} max={30} step={1} current={config.particleCount}
                                            onChange={(v) => set('particleCount', v)} />
                                        <Slider icon={<CloudHail size={12} className="text-indigo-300/60" />}
                                            label={t('hailCount')} value={String(config.hailCount ?? 30)}
                                            min={10} max={150} step={5} current={config.hailCount ?? 30}
                                            onChange={(v) => set('hailCount', v)} />
                                        <Slider icon={<CloudRain size={12} className="text-[var(--text-40)]" />}
                                            label={t('fallSpeed')} value={`${config.speed.toFixed(1)}x`}
                                            min={0.5} max={3} step={0.1} current={config.speed}
                                            onChange={(v) => set('speed', v)} />
                                        <Slider icon={<Wind size={12} className="text-[var(--text-40)]" />}
                                            label={t('wind')} value={config.wind.toFixed(1)}
                                            min={-3} max={3} step={0.1} current={config.wind}
                                            onChange={(v) => set('wind', v)}
                                            leftHint={t('leftWind')} rightHint={t('rightWind')} />
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <Zap size={12} className="text-yellow-400/60" />
                                                <span className="text-[13px] text-[var(--text-60)]">{t('thunder')}</span>
                                            </div>
                                            <Toggle checked={!!config.thunder} onChange={() => set('thunder', !config.thunder)} activeColor="bg-yellow-500/50" />
                                        </div>
                                    </>)}

                                    {/* ── Sandstorm ── */}
                                    {weather === 'sandstorm' && (<>
                                        <Slider icon={<Wind size={12} className="text-orange-400/60" />}
                                            label={t('sandDensity')} value={`${((config.sandDensity ?? 0.6) * 100).toFixed(0)}%`}
                                            min={0} max={1} step={0.05} current={config.sandDensity ?? 0.6}
                                            onChange={(v) => set('sandDensity', v)} accent="accent-orange-500" />
                                        <Slider icon={<Wind size={12} className="text-[var(--text-40)]" />}
                                            label={t('wind')} value={config.wind.toFixed(1)}
                                            min={-3} max={3} step={0.1} current={config.wind}
                                            onChange={(v) => set('wind', v)}
                                            leftHint={t('leftWind')} rightHint={t('rightWind')} />
                                    </>)}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* ─── Pinned toolbar (always visible) ────── */}
                    <div className="px-4 pt-1 pb-3 shrink-0">
                        <div className="h-px bg-[var(--divider)] mb-2" />
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-0.5">
                                <ToolbarBtn icon={soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                                    active={soundEnabled} onClick={() => setSoundEnabled(!soundEnabled)} title={t('sound')} />
                                <ToolbarBtn icon={<TimerOff size={15} />}
                                    active={autoPause} onClick={() => setAutoPause(!autoPause)} title={t('autoPauseDesc')} />
                                <ToolbarBtn icon={immersive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                                    active={immersive}
                                    onClick={() => { if (immersive) { setImmersive(false); setMenuOpen(false); } else setImmersive(true); }}
                                    title={t('immersiveMode')} />
                                <ToolbarBtn icon={<LocateFixed size={15} className={isLocating ? 'animate-pulse' : ''} />}
                                    active={isAuto} onClick={toggleAuto} title={t('locateMe' as TranslationKey)}
                                    activeClass="bg-green-500/20 text-green-400" />
                            </div>
                            <div className="flex items-center gap-0.5">
                                <ToolbarBtn icon={theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                                    onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                                    title={t('theme' as TranslationKey)} />
                                <button type="button" onClick={() => setTemperatureUnit(temperatureUnit === '°C' ? '°F' : '°C')}
                                    className="px-2 py-1.5 rounded-xl text-xs font-bold text-[var(--text-35)] hover:text-[var(--text-70)] hover:bg-[var(--surface-hover)] transition-all"
                                    title={t('temperatureUnit')}>
                                    {temperatureUnit}
                                </button>
                                <button type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
                                    className="px-2 py-1.5 rounded-xl text-xs font-bold text-[var(--text-35)] hover:text-[var(--text-70)] hover:bg-[var(--surface-hover)] transition-all"
                                    title={t('language')}>
                                    {locale === 'en' ? '中' : 'EN'}
                                </button>
                                <a href="https://github.com/greywen/web-weather" target="_blank" rel="noopener noreferrer"
                                    className="p-2 rounded-xl text-[var(--text-25)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-all"
                                    title="GitHub">
                                    <Github size={15} />
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── WorldMap modal ───────────────────────────────── */}
            {mapOpen && (
                <WorldMap
                    onSelectLocation={(lat, lon) => { setLocation(lat, lon); setMapOpen(false); }}
                    onClose={() => setMapOpen(false)}
                    initialLat={customCoords?.lat}
                    initialLon={customCoords?.lon}
                />
            )}
        </>
    );
}

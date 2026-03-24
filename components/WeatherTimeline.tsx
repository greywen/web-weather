'use client';

import { useState, useRef } from 'react';
import { useWeather } from './WeatherProvider';
import { useI18n, TranslationKey, formatTemp } from './i18n';
import { HourlyForecast, DailyForecast, WeatherType } from './weather-types';

const weatherIcon: Record<WeatherType, string> = {
    sunny: '☀️',
    rainy: '🌧️',
    snowy: '❄️',
    cloudy: '☁️',
    foggy: '🌫️',
    icy: '🧊',
};

const dayKeys: TranslationKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function formatHour(iso: string): string {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:00`;
}

function formatDate(iso: string, t: (key: TranslationKey) => string): string {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return t('today');
    if (d.toDateString() === tomorrow.toDateString()) return t('tomorrow');
    return t(dayKeys[d.getDay()]);
}

function isCurrentHour(iso: string): boolean {
    const d = new Date(iso);
    const now = new Date();
    return d.getHours() === now.getHours() && d.toDateString() === now.toDateString();
}

function HourlyTimeline({ data }: { data: HourlyForecast[] }) {
    const { t, temperatureUnit } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Find min/max temps for the bar visualization
    const temps = data.map(h => h.temperature);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const range = maxTemp - minTemp || 1;

    return (
        <div
            ref={scrollRef}
            className="flex gap-0.5 overflow-x-auto pb-2 scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
        >
            {data.map((hour) => {
                const isCurrent = isCurrentHour(hour.time);
                const barHeight = ((hour.temperature - minTemp) / range) * 24 + 8;
                return (
                    <div
                        key={hour.time}
                        className={`flex flex-col items-center flex-shrink-0 w-[52px] py-2 px-1 rounded-lg transition-colors
                            ${isCurrent ? 'bg-blue-500/30 ring-1 ring-blue-400/50' : 'hover:bg-white/5'}`}
                    >
                        {/* Time */}
                        <span className={`text-[10px] font-mono ${isCurrent ? 'text-blue-300 font-bold' : 'text-white/40'}`}>
                            {isCurrent ? t('now') : formatHour(hour.time)}
                        </span>

                        {/* Weather icon */}
                        <span className="text-base my-1">{weatherIcon[hour.type]}</span>

                        {/* Temperature */}
                        <span className={`text-xs font-semibold ${isCurrent ? 'text-white' : 'text-white/80'}`}>
                            {formatTemp(hour.temperature, temperatureUnit)}
                        </span>

                        {/* Temp bar */}
                        <div className="w-1 bg-white/10 rounded-full mt-1.5 overflow-hidden" style={{ height: '32px' }}>
                            <div
                                className="w-full rounded-full transition-all"
                                style={{
                                    height: `${barHeight}px`,
                                    marginTop: `${32 - barHeight}px`,
                                    background: hour.temperature > 30 ? '#ef4444' :
                                               hour.temperature > 20 ? '#f59e0b' :
                                               hour.temperature > 10 ? '#3b82f6' :
                                               hour.temperature > 0 ? '#06b6d4' : '#a78bfa',
                                }}
                            />
                        </div>

                        {/* Precipitation */}
                        {hour.precipitation > 0 && (
                            <span className="text-[9px] text-blue-300/70 mt-1 font-mono">
                                {hour.precipitation.toFixed(1)}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function DailyTimeline({ data }: { data: DailyForecast[] }) {
    const { t, temperatureUnit } = useI18n();

    const allMax = data.map(d => d.temperatureMax);
    const allMin = data.map(d => d.temperatureMin);
    const globalMax = Math.max(...allMax);
    const globalMin = Math.min(...allMin);
    const range = globalMax - globalMin || 1;

    return (
        <div className="flex flex-col gap-0.5">
            {data.map((day) => {
                const isToday = new Date(day.date).toDateString() === new Date().toDateString();
                const lowPos = ((day.temperatureMin - globalMin) / range) * 100;
                const highPos = ((day.temperatureMax - globalMin) / range) * 100;

                return (
                    <div
                        key={day.date}
                        className={`flex items-center gap-1.5 py-1.5 px-1.5 rounded-lg transition-colors
                            ${isToday ? 'bg-blue-500/20 ring-1 ring-blue-400/30' : 'hover:bg-white/5'}`}
                    >
                        {/* Day name */}
                        <span className={`text-[10px] w-11 whitespace-nowrap flex-shrink-0 ${isToday ? 'text-blue-300 font-bold' : 'text-white/60'}`}>
                            {formatDate(day.date, t)}
                        </span>

                        {/* Weather icon */}
                        <span className="text-sm flex-shrink-0">{weatherIcon[day.type]}</span>

                        {/* Low temp */}
                        <span className="text-[10px] text-white/40 w-8 text-right flex-shrink-0 font-mono">
                            {formatTemp(day.temperatureMin, temperatureUnit)}
                        </span>

                        {/* Temperature range bar */}
                        <div className="flex-1 h-1 bg-white/10 rounded-full relative min-w-[40px]">
                            <div
                                className="absolute h-full rounded-full"
                                style={{
                                    left: `${lowPos}%`,
                                    width: `${Math.max(highPos - lowPos, 4)}%`,
                                    background: `linear-gradient(to right, #3b82f6, ${day.temperatureMax > 30 ? '#ef4444' : day.temperatureMax > 20 ? '#f59e0b' : '#60a5fa'})`,
                                }}
                            />
                        </div>

                        {/* High temp */}
                        <span className="text-[10px] text-white/80 w-8 flex-shrink-0 font-mono">
                            {formatTemp(day.temperatureMax, temperatureUnit)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

interface WeatherTimelineProps {
    collapsed: boolean;
    onToggle: () => void;
}

export default function WeatherTimeline({ collapsed, onToggle }: WeatherTimelineProps) {
    const { forecastData, isAuto } = useWeather();
    const { t } = useI18n();
    const [view, setView] = useState<'24h' | '7d'>('24h');

    if (!forecastData || !isAuto) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex items-center gap-1.5 group"
                >
                    <span className={`text-[10px] transition-transform ${!collapsed ? 'rotate-90' : ''}`}>▶</span>
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest group-hover:text-white/60 transition-colors">
                        {t('weatherForecast')}
                    </h3>
                </button>
                {!collapsed && (
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                        <button
                            type="button"
                            onClick={() => setView('24h')}
                            className={`text-[10px] font-semibold px-2.5 py-1 transition-all ${
                                view === '24h'
                                    ? 'bg-blue-500/80 text-white'
                                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                            }`}
                        >
                            {t('hourly24h')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('7d')}
                            className={`text-[10px] font-semibold px-2.5 py-1 transition-all ${
                                view === '7d'
                                    ? 'bg-blue-500/80 text-white'
                                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                            }`}
                        >
                            {t('daily7d')}
                        </button>
                    </div>
                )}
            </div>

            {!collapsed && (
                <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden p-2">
                    {view === '24h' ? (
                        <HourlyTimeline data={forecastData.hourly} />
                    ) : (
                        <DailyTimeline data={forecastData.daily} />
                    )}
                </div>
            )}
        </div>
    );
}

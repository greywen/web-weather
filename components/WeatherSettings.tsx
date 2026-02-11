'use client';

import { useEffect, useState } from 'react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';

export default function WeatherSettings() {
    const { weather, setWeather, config, setConfig, transition, setTransitionConfig } = useWeather();
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isMobile = window.innerWidth < 768;
        setIsOpen(!isMobile);
    }, []);

    const handleTypeChange = (type: WeatherType) => {
        setWeather(type);
    };

    const handleConfigChange = (key: keyof typeof config, value: number | boolean) => {
        setConfig({ [key]: value });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                className="fixed top-4 left-4 z-[60] rounded-full bg-slate-900/70 text-white text-xs px-3 py-2 shadow-lg border border-white/10 backdrop-blur-md md:hidden"
            >
                {isOpen ? '隐藏控制台' : '显示控制台'}
            </button>

            <div
                className={`fixed z-50 transition-all bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl hover:bg-slate-900/80
                    w-[90vw] max-w-sm left-1/2 -translate-x-1/2 top-16 p-4 md:p-5 md:w-80 md:left-4 md:translate-x-0 md:top-4
                    max-h-[70vh] overflow-y-auto
                    ${isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}
                    md:opacity-100 md:pointer-events-auto md:translate-y-0
                `}
            >
                <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h2 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        天气控制台
                    </h2>
                </div>

            <div className="space-y-6">
                {/* 1. Global Time Control (Applies to all weathers) */}
                <div className="space-y-4 pt-2 border-b border-white/5 pb-6">
                    <div>
                        <div className="flex justify-between text-xs text-white/80 mb-1.5">
                            <span className="flex items-center gap-1">时间 (24h)</span>
                            <span className="font-mono text-white/50">
                                {Math.floor(config.time || 12).toString().padStart(2,'0')}:
                                {Math.floor(((config.time || 12) % 1) * 60).toString().padStart(2,'0')}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="24"
                            step="0.1"
                            value={config.time !== undefined ? config.time : 12}
                            onChange={(e) => handleConfigChange('time', parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] text-white/20 mt-1">
                            <span>🌑 0:00</span>
                            <span>☀️ 12:00</span>
                            <span>🌑 24:00</span>
                        </div>
                    </div>

                    {/* Transition Duration */}
                    <div className="pt-3">
                        <div className="flex justify-between text-xs text-white/80 mb-1.5">
                            <span>转场时长</span>
                            <span className="font-mono text-white/50">{transition.duration.toFixed(1)}s</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="8"
                            step="0.1"
                            value={transition.duration}
                            onChange={(e) => setTransitionConfig({ duration: parseFloat(e.target.value) })}
                            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>

                {/* 2. Weather Type Selector */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">天气模式</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {(['sunny', 'rainy', 'snowy', 'cloudy', 'foggy'] as WeatherType[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => handleTypeChange(t)}
                                className={`py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                                    weather === t 
                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 ring-1 ring-blue-400' 
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {t === 'sunny' && '☀️ 晴天'}
                                {t === 'rainy' && '🌧️ 雨天'}
                                {t === 'snowy' && '❄️ 雪天'}
                                {t === 'cloudy' && '☁️ 阴天'}
                                {t === 'foggy' && '🌫️ 雾天'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Sliders based on Type */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">参数调节</h3>
                    
                    {weather === 'sunny' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>光照强度</span>
                                    <span className="font-mono text-white/50">{config.intensity.toFixed(1)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="3"
                                    step="0.1"
                                    value={config.intensity}
                                    onChange={(e) => handleConfigChange('intensity', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-[10px] text-white/20 mt-1">
                                    <span>柔和</span>
                                    <span>刺眼</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {(weather === 'rainy' || weather === 'snowy') && (
                        <div className="space-y-5">
                            {/* Particle Count */}
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>{weather === 'rainy' ? '雨量' : '雪量'}</span>
                                    <span className="font-mono text-white/50">{config.particleCount}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="500"
                                    step="10"
                                    value={config.particleCount}
                                    onChange={(e) => handleConfigChange('particleCount', parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            {/* Speed */}
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>下落速度</span>
                                    <span className="font-mono text-white/50">{config.speed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="3.0"
                                    step="0.1"
                                    value={config.speed}
                                    onChange={(e) => handleConfigChange('speed', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            {/* Wind (For Rain & Snow) */}
                            {(weather === 'rainy' || weather === 'snowy') && (
                                <div>
                                    <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                        <span>风力</span>
                                        <span className="font-mono text-white/50">{config.wind.toFixed(1)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-3.0"
                                        max="3.0"
                                        step="0.1"
                                        value={config.wind}
                                        onChange={(e) => handleConfigChange('wind', parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-white/20 mt-1">
                                        <span>← 刮左风</span>
                                        <span>刮右风 →</span>
                                    </div>
                                </div>
                            )}

                            {/* Thunder (For Rainy) */}
                            {weather === 'rainy' && (
                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-white/80">雷暴</span>
                                        <span className="text-[10px] text-white/40">开启雷电闪光特效</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={config.thunder || false}
                                        onChange={(e) => handleConfigChange('thunder', e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-600 text-blue-500 bg-white/10 focus:ring-blue-500 focus:ring-offset-slate-900"
                                    />
                                </div>
                            )}

                            {/* Temperature (For Snowy - Melting/Freezing) */}
                            {weather === 'snowy' && (
                                <div>
                                    <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                        <span>气温 (影响积雪)</span>
                                        <span className="font-mono text-white/50">{config.temperature !== undefined ? config.temperature : 0}°C</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-10"
                                        max="10"
                                        step="1"
                                        value={config.temperature !== undefined ? config.temperature : 0}
                                        onChange={(e) => handleConfigChange('temperature', parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-white/20 mt-1">
                                        <span>❄️ 结冰 (-10°)</span>
                                        <span>💧 融化 (10°)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CLOUDY */}
                    {weather === 'cloudy' && (
                        <div className="space-y-4">
                             <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>云量覆盖</span>
                                    <span className="font-mono text-white/50">{((config.cloudCover !== undefined ? config.cloudCover : 0.5) * 100).toFixed(0)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={config.cloudCover !== undefined ? config.cloudCover : 0.5}
                                    onChange={(e) => handleConfigChange('cloudCover', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>移动速度</span>
                                    <span className="font-mono text-white/50">{config.speed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    value={config.speed}
                                    onChange={(e) => handleConfigChange('speed', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* FOGGY */}
                    {weather === 'foggy' && (
                        <div className="space-y-4">
                             <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>雾气浓度</span>
                                    <span className="font-mono text-white/50">{((config.fogDensity !== undefined ? config.fogDensity : 0.5) * 100).toFixed(0)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={config.fogDensity !== undefined ? config.fogDensity : 0.5}
                                    onChange={(e) => handleConfigChange('fogDensity', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
}

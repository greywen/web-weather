'use client';

import { useEffect, useState } from 'react';
import { Github, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';

const weatherLabel: Record<WeatherType, string> = {
    sunny: '☀️ Sunny',
    rainy: '🌧️ Rainy',
    snowy: '❄️ Snowy',
    cloudy: '☁️ Cloudy',
    foggy: '🌫️ Foggy',
    icy: '🧊 Icy',
};

export default function WeatherSettings() {
    const { weather, setWeather, config, setConfig, transition, setTransitionConfig, isAuto, toggleAuto, soundEnabled, setSoundEnabled, immersive, setImmersive } = useWeather();
    const [isOpen, setIsOpen] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);

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
            {/* Immersive mode: weather status badge at top-left, click to open panel */}
            {immersive && !menuOpen && (
                <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className="fixed top-4 left-4 z-[70] flex items-center gap-2 rounded-lg bg-slate-900/70 backdrop-blur-sm text-white text-xs px-3 py-2 border border-white/10 hover:bg-slate-900/90 transition-all cursor-pointer"
                >
                    <span>{weatherLabel[weather] ?? weather}</span>
                    {isAuto ? <span className="text-green-400">Auto</span> : <span className="text-white/40">Manual</span>}
                </button>
            )}

            {/* Normal mode UI */}
            {!immersive && (
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                className="fixed top-4 left-4 z-[60] rounded-full bg-slate-900/85 text-white text-xs px-3 py-2 shadow-lg border border-white/10 md:hidden"
            >
                {isOpen ? 'Hide Panel' : 'Show Panel'}
            </button>
            )}

            <div
                className={`fixed z-[70] transition-all bg-slate-900/85 border border-white/10 rounded-xl shadow-2xl hover:bg-slate-900/90
                    w-[90vw] max-w-sm left-1/2 -translate-x-1/2 top-16 p-4 md:p-5 md:w-80 md:left-4 md:translate-x-0 md:top-4
                    max-h-[70vh] overflow-y-auto settings-scroll
                    ${immersive
                        ? (menuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none')
                        : `${isOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'} md:opacity-100 md:pointer-events-auto md:translate-y-0`
                    }
                `}
            >
                <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h2 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        Weather Control
                    </h2>
                    <div className="flex items-center gap-1.5">
                        {immersive && (
                            <button
                                type="button"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/10"
                                title="Close Panel"
                            >
                                ✕
                            </button>
                        )}
                        <a
                            href="https://github.com/greywen/web-weather"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/10"
                            title="GitHub"
                        >
                            <Github size={20} />
                        </a>
                    </div>
                </div>

            <div className="space-y-6">
                {/* Quick Controls: Mode + Immersive + Sound */}
                <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                        <div className="flex flex-col">
                            <span className="text-xs text-white/80">Weather Mode</span>
                            <span className="text-[10px] text-white/40">Auto Location / Manual</span>
                        </div>
                        <button
                            type="button"
                            onClick={toggleAuto}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${isAuto ? 'bg-green-500/80 text-white' : 'bg-white/10 text-white/60 border border-white/10'}`}
                        >
                            {isAuto ? 'Auto' : 'Manual'}
                        </button>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                        <div className="flex flex-col">
                            <span className="text-xs text-white/80">Immersive Mode</span>
                            <span className="text-[10px] text-white/40">Fullscreen / Hide Panel</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { 
                                if (immersive) { setImmersive(false); setMenuOpen(false); } 
                                else { setImmersive(true); } 
                            }}
                            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${immersive ? 'bg-blue-500/80 text-white' : 'bg-white/10 text-white/60 border border-white/10 hover:bg-white/20'}`}
                        >
                            {immersive ? 'Exit' : 'Enter'}
                        </button>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex flex-col">
                            <span className="text-xs text-white/80">Sound</span>
                            <span className="text-[10px] text-white/40">Rain / Wind / Thunder</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${soundEnabled ? 'bg-blue-500/80 text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-white/60 border border-white/10'}`}
                        >
                            {soundEnabled ? 'On' : 'Off'}
                        </button>
                    </div>
                </div>

                {/* Weather Type Selector */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Weather Type</h3>
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
                                {t === 'sunny' && '☀️ Sunny'}
                                {t === 'rainy' && '🌧️ Rainy'}
                                {t === 'snowy' && '❄️ Snowy'}
                                {t === 'cloudy' && '☁️ Cloudy'}
                                {t === 'foggy' && '🌫️ Foggy'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Global Time Control */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Global Settings</h3>
                    <div>
                        <div className="flex justify-between text-xs text-white/80 mb-1.5">
                            <span className="flex items-center gap-1">Time (24h)</span>
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
                    <div>
                        <div className="flex justify-between text-xs text-white/80 mb-1.5">
                            <span>Transition Duration</span>
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

                {/* 2. Sliders based on Type */}
                <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Parameters</h3>
                    
                    {weather === 'sunny' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>Light Intensity</span>
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
                                    <span>Soft</span>
                                    <span>Intense</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {(weather === 'rainy' || weather === 'snowy') && (
                        <div className="space-y-5">
                            {/* Cloud Cover (For Rainy) */}
                            {weather === 'rainy' && (
                                <div>
                                    <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                        <span>Cloud Cover</span>
                                        <span className="font-mono text-white/50">{((config.cloudCover !== undefined ? config.cloudCover : 0.1) * 100).toFixed(0)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={config.cloudCover !== undefined ? config.cloudCover : 0.1}
                                        onChange={(e) => handleConfigChange('cloudCover', parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                </div>
                            )}

                            {/* Particle Count */}
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>{weather === 'rainy' ? 'Rainfall' : 'Snowfall'}</span>
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
                                    <span>Fall Speed</span>
                                    <span className="font-mono text-white/50">{config.speed.toFixed(1)}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.5"
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
                                        <span>Wind</span>
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
                                        <span>← Left Wind</span>
                                        <span>Right Wind →</span>
                                    </div>
                                </div>
                            )}

                            {/* Thunder (For Rainy) */}
                            {weather === 'rainy' && (
                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-white/80">Thunder</span>
                                        <span className="text-[10px] text-white/40">Enable lightning flash effects</span>
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
                                        <span>Temperature (Snow)</span>
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
                                        <span>❄️ Freeze (-10°)</span>
                                        <span>💧 Melt (10°)</span>
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
                                    <span>Cloud Cover</span>
                                    <span className="font-mono text-white/50">{((config.cloudCover !== undefined ? config.cloudCover : 0.1) * 100).toFixed(0)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={config.cloudCover !== undefined ? config.cloudCover : 0.1}
                                    onChange={(e) => handleConfigChange('cloudCover', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                    <span>Move Speed</span>
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
                                    <span>Fog Density</span>
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

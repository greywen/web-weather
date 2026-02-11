'use client';

import type { CSSProperties } from 'react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';

export default function FogOverlay({ forcedWeather, opacity = 1 }: { forcedWeather?: WeatherType; opacity?: number }) {
  const { weather, config } = useWeather();
  const effectiveWeather = forcedWeather ?? weather;

  if (effectiveWeather !== 'foggy' || opacity <= 0) return null;

  const density = config.fogDensity ?? 0.5;

  return (
    <div
      className="fog-overlay"
      style={{ '--fog-density': density, opacity } as CSSProperties}
      aria-hidden="true"
    >
      <div className="fog-layer fog-base" />
      <div className="fog-layer fog-smoke" />
      <div className="fog-layer fog-smoke fog-smoke--slow" />
      <div className="fog-layer fog-front" />
      <div className="fog-depth" />
      <div className="fog-haze" />
      <div className="fog-vignette" />
    </div>
  );
}

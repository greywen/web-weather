'use client';

import type { CSSProperties } from 'react';
import { useWeather } from './WeatherProvider';

export default function FogOverlay() {
  const { weather, config } = useWeather();

  if (weather !== 'foggy') return null;

  const density = config.fogDensity ?? 0.5;

  return (
    <div
      className="fog-overlay"
      style={{ '--fog-density': density } as CSSProperties}
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

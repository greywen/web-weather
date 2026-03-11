'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';

const LAYERS: Array<{ distance: number; duration: number }> = [
  { distance: 1000, duration: 20000 },
  { distance: 1000, duration: 15000 },
  { distance: 1579, duration: 17000 },
];

export default function CloudOverlay({ forcedWeather, opacity = 1 }: { forcedWeather?: WeatherType; opacity?: number }) {
  const { weather, config } = useWeather();
  const effectiveWeather = forcedWeather ?? weather;
  const isCloudy = effectiveWeather === 'cloudy' || effectiveWeather === 'rainy';

  const cloudCover = config.cloudCover ?? 0.1;
  const speed = Math.max(0.2, config.speed ?? 1);

  const animationsRef = useRef<Animation[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const startAnimations = useCallback((container: HTMLDivElement | null) => {
    // Cleanup previous
    animationsRef.current.forEach((a) => a.cancel());
    animationsRef.current = [];

    if (!container) return;

    const children = container.children;
    const anims: Animation[] = [];
    for (let i = 0; i < children.length && i < LAYERS.length; i++) {
      const el = children[i] as HTMLElement;
      const { distance, duration } = LAYERS[i];
      const anim = el.animate(
        [
          { backgroundPosition: '0 0' },
          { backgroundPosition: `-${distance}px 0` },
        ],
        { duration, iterations: Infinity, easing: 'linear' },
      );
      anim.playbackRate = speedRef.current;
      anims.push(anim);
    }
    animationsRef.current = anims;
  }, []);

  // Smoothly adjust playbackRate — no animation restart
  useEffect(() => {
    animationsRef.current.forEach((anim) => {
      anim.playbackRate = speed;
    });
  }, [speed]);

  if (!isCloudy || opacity <= 0 || cloudCover <= 0) return null;

  return (
    <div
      ref={startAnimations}
      className="clouds-overlay"
      style={{
        '--cloud-opacity': cloudCover,
        opacity,
      } as CSSProperties}
      aria-hidden="true"
    >
      <div className="clouds clouds-1" />
      <div className="clouds clouds-2" />
      <div className="clouds clouds-3" />
    </div>
  );
}

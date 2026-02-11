'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';

export default function CloudOverlay({ forcedWeather, opacity = 1 }: { forcedWeather?: WeatherType; opacity?: number }) {
  const { weather, config } = useWeather();
  const effectiveWeather = forcedWeather ?? weather;
  const isCloudy = effectiveWeather === 'cloudy';

  const cloudCover = config.cloudCover ?? 0.5;
  const speed = Math.max(0.2, config.speed ?? 1);

  const layer1Ref = useRef<HTMLDivElement | null>(null);
  const layer2Ref = useRef<HTMLDivElement | null>(null);
  const layer3Ref = useRef<HTMLDivElement | null>(null);
  const animationsRef = useRef<Animation[]>([]);

  useEffect(() => {
    if (!isCloudy) {
      animationsRef.current.forEach((a) => a.cancel());
      animationsRef.current = [];
      return;
    }

    if (animationsRef.current.length > 0) return;

    const layers: Array<[HTMLDivElement | null, number]> = [
      [layer1Ref.current, 1000],
      [layer2Ref.current, 1000],
      [layer3Ref.current, 1579],
    ];

    const baseDurations = [20000, 15000, 17000];

    layers.forEach(([el, distance], index) => {
      if (!el || typeof el.animate !== 'function') return;

      // Disable CSS animation to avoid restart/jitter
      el.style.animation = 'none';

      const anim = el.animate(
        [
          { backgroundPosition: '0 0' },
          { backgroundPosition: `-${distance}px 0` },
        ],
        {
          duration: baseDurations[index],
          iterations: Infinity,
          easing: 'linear',
        }
      );

      animationsRef.current.push(anim);
    });

    return () => {
      animationsRef.current.forEach((a) => a.cancel());
      animationsRef.current = [];
    };
  }, [isCloudy]);

  useEffect(() => {
    if (!isCloudy) return;

    animationsRef.current.forEach((anim) => {
      anim.playbackRate = speed;
    });
  }, [isCloudy, speed]);

  if (!isCloudy || opacity <= 0) return null;

  return (
    <div
      className="clouds-overlay"
      style={{
        '--cloud-opacity': cloudCover,
        opacity,
      } as CSSProperties}
      aria-hidden="true"
    >
      <div ref={layer1Ref} className="clouds clouds-1" />
      <div ref={layer2Ref} className="clouds clouds-2" />
      <div ref={layer3Ref} className="clouds clouds-3" />
    </div>
  );
}

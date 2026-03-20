'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { WeatherType, WeatherData, WeatherConfig, DEFAULT_CONFIG, WeatherTransitionConfig, WeatherTransitionState } from './weather-types';
import WeatherCanvas from './WeatherCanvas';
import FogOverlay from './FogOverlay';
import CloudOverlay from './CloudOverlay';
import { useWeatherAudio } from './useWeatherAudio';

const FPS_INITIAL = 0;

interface WeatherContextType {
  weather: WeatherType;
  setWeather: (type: WeatherType) => void;
  isAuto: boolean;
  toggleAuto: () => void;
  weatherData: WeatherData | null;
  config: WeatherConfig;
  setConfig: (config: Partial<WeatherConfig>) => void;
    transition: WeatherTransitionState;
    setTransitionConfig: (config: Partial<WeatherTransitionConfig>) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  soundVolume: number;
  setSoundVolume: (v: number) => void;
  immersive: boolean;
  setImmersive: (v: boolean) => void;
  lastUpdated: Date | null;
}

const WeatherContext = createContext<WeatherContextType | undefined>(undefined);

export const useWeather = () => {
  const context = useContext(WeatherContext);
  if (!context) {
    throw new Error('useWeather must be used within a WeatherProvider');
  }
  return context;
};

export const WeatherProvider = ({ children }: { children: ReactNode }) => {
    const [weather, setWeatherState] = useState<WeatherType>('sunny');
    const [currentWeather, setCurrentWeather] = useState<WeatherType>('sunny');
    const [transitionFrom, setTransitionFrom] = useState<WeatherType>('sunny');
    const [transitionTo, setTransitionTo] = useState<WeatherType>('sunny');
    const [transitionProgress, setTransitionProgressState] = useState<number>(1);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
      const [transitionConfig, setTransitionConfigState] = useState<WeatherTransitionConfig>({
          duration: 0.5,
      });
    const transitionRafRef = useRef<number | null>(null);
  // Initialize time with current hour
  const [config, setConfigState] = useState<WeatherConfig>(() => {
      const now = new Date();
      return {
          ...DEFAULT_CONFIG,
          time: now.getHours() + now.getMinutes() / 60
      };
  });
    const [isAuto, setIsAuto] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [soundVolume, setSoundVolume] = useState<number>(0.6);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [immersive, setImmersiveState] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(FPS_INITIAL);

  const setImmersive = useCallback((v: boolean) => {
    setImmersiveState(v);
    if (v) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }, []);

  // Sync immersive state when user exits fullscreen via Escape
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setImmersiveState(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  const finalizeTransition = (next: WeatherType) => {
      setIsTransitioning(false);
      setCurrentWeather(next);
      setTransitionFrom(next);
      setTransitionTo(next);
      setTransitionProgressState(1);
  };

  const startTransition = (next: WeatherType, startAt = 0) => {
      if (transitionRafRef.current) {
          cancelAnimationFrame(transitionRafRef.current);
      }
      const durationMs = Math.max(0.2, transitionConfig.duration) * 1000;
      const startTime = performance.now() - startAt * durationMs;
      setIsTransitioning(true);

      const tick = (now: number) => {
          const t = Math.min(1, (now - startTime) / durationMs);
          setTransitionProgressState(t);
          if (t < 1) {
              transitionRafRef.current = requestAnimationFrame(tick);
          } else {
              finalizeTransition(next);
          }
      };

      transitionRafRef.current = requestAnimationFrame(tick);
  };

  const setConfig = (newConfig: Partial<WeatherConfig>) => {
      setConfigState(prev => ({ ...prev, ...newConfig }));
      setIsAuto(false); // Manually changing config disables auto mode usually
  };

  const setTransitionConfig = (newConfig: Partial<WeatherTransitionConfig>) => {
      setTransitionConfigState(prev => ({ ...prev, ...newConfig }));
  };

  // WMO Weather Code Mapping to our types
  const mapWmoCodeToType = (code: number, temp: number): WeatherType => {
      // https://open-meteo.com/en/docs
      if ([0, 1].includes(code)) return 'sunny';
      if ([2, 3].includes(code)) return 'cloudy';
      if ([45, 48].includes(code)) return 'foggy'; 
      if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(code)) return 'rainy';
      if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return 'snowy';
      
      // Special logic for Icy: Low temp + clear or slight rain
      if (temp < 0 && [0, 1, 2, 3].includes(code)) return 'icy'; // icy is not in WeatherType yet? checking
      
      return 'sunny';
  };

  // Map detailed API data to WeatherConfig for rendering
  const mapWeatherDataToConfig = (data: WeatherData, currentTime: number): WeatherConfig => {
      const type = data.type;
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

      // Wind: direction determines sign, speed determines magnitude
      // 90-270° = wind blows rightward (positive), else leftward (negative)
      const windDir = data.windDirection;
      const windSign = (windDir >= 90 && windDir <= 270) ? 1 : -1;
      const windMagnitude = clamp(data.windSpeed / 25, 0, 2);
      const wind = windSign * windMagnitude;

      // Cloud cover: API 0-100% → config 0-1
      const cloudCover = clamp(data.cloudCover / 100, 0, 1);

      // Fog density from visibility: lower visibility = denser fog
      const fogDensity = clamp(1 - data.visibility / 10000, 0, 1);

      // Temperature
      const temperature = clamp(data.temperature, -10, 10);

      // Thunder: WMO code 95/96/99 or extreme gusts
      const thunder = data.weatherCode === 95 || data.weatherCode === 96 || data.weatherCode === 99 || data.windGusts > 60;

      let particleCount: number;
      let speed: number;
      let intensity: number;

      if (type === 'rainy') {
          // Rain amount → particle count & speed
          const totalRain = data.rain + data.showers;
          particleCount = clamp(Math.round(totalRain * 60), 50, 600);
          speed = clamp(1 + totalRain * 0.3, 1, 4);
          intensity = clamp(totalRain / 10, 0.1, 1);
      } else if (type === 'snowy') {
          // Snowfall → particle count (fewer but larger)
          particleCount = clamp(Math.round(data.snowfall * 100), 30, 400);
          speed = clamp(0.5 + data.snowfall * 0.1, 0.3, 2);
          intensity = clamp(data.snowfall / 5, 0.1, 1);
      } else if (type === 'sunny') {
          particleCount = 0;
          speed = 1;
          // Sun intensity based on cloud cover (less clouds = brighter)
          intensity = clamp(1 - cloudCover * 0.5, 0.5, 3);
      } else {
          // cloudy, foggy, icy
          particleCount = 0;
          speed = 1;
          intensity = 1;
      }

      return {
          particleCount,
          speed,
          wind,
          intensity,
          temperature,
          time: currentTime,
          thunder,
          cloudCover,
          fogDensity,
      };
  };

  const fetchWeather = async (lat: number, lon: number) => {
      try {
          const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&current=temperature_2m,apparent_temperature,relative_humidity_2m,rain,showers,snowfall,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day` +
              `&daily=sunrise,sunset&timezone=auto`
          );
          const data = await res.json();
          
          if (!data.current || !data.daily) return;

          const current = data.current;
          const daily = data.daily;
          
          // Calculate Sun Progress
          const now = new Date().getTime();
          const sunrise = new Date(daily.sunrise[0]).getTime();
          const sunset = new Date(daily.sunset[0]).getTime();
          
          let progress = -1; // Default (Night)
          if (now >= sunrise && now <= sunset) {
              progress = (now - sunrise) / (sunset - sunrise);
          }

          const newWeatherType = mapWmoCodeToType(current.weather_code, current.temperature_2m);
          
          const newWeatherData: WeatherData = {
              type: newWeatherType,
              temperature: current.temperature_2m,
              apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
              isDay: current.is_day === 1,
              sunProgress: progress,
              locationName: `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`,
              rain: current.rain ?? 0,
              showers: current.showers ?? 0,
              snowfall: current.snowfall ?? 0,
              precipitation: current.precipitation ?? 0,
              cloudCover: current.cloud_cover ?? 0,
              windSpeed: current.wind_speed_10m ?? 0,
              windDirection: current.wind_direction_10m ?? 0,
              windGusts: current.wind_gusts_10m ?? 0,
              humidity: current.relative_humidity_2m ?? 0,
              visibility: current.visibility ?? 10000,
              weatherCode: current.weather_code ?? 0,
          };

          setWeatherData(newWeatherData);
          setLastUpdated(new Date());
          
          if (isAuto) {
              // Apply weather type with transition
              applyWeatherFromData(newWeatherType, newWeatherData);
          }

      } catch (err) {
          console.error("Failed to fetch weather", err);
      }
  };

  useEffect(() => {
    if (isAuto) {
        // 1. Initial Fetch
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    fetchWeather(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    console.error("Geo error:", error);
                    fetchWeather(51.50, -0.12);
                }
            );
        } else {
             fetchWeather(51.50, -0.12);
        }

        // 2. Weather Fetch Interval (10 minutes)
        const weatherInterval = setInterval(() => {
             // Re-fetch logic (same as above, simplified for now to keep last known coords if possible, 
             // but here just re-running simple logic)
             if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (p) => fetchWeather(p.coords.latitude, p.coords.longitude),
                    () => fetchWeather(51.50, -0.12)
                );
            }
        }, 10 * 60 * 1000); // 10 minutes

        // 3. Time Update Interval (Every 1 minute)
        // Keeps the UI time slider moving smoothly
        const timeInterval = setInterval(() => {
            setConfigState(prev => {
                const now = new Date();
                const currentTime = now.getHours() + now.getMinutes() / 60;
                // Only update time, keep other config intact
                return { ...prev, time: currentTime };
            });
        }, 60 * 1000); // 1 minute updates

        return () => {
            clearInterval(weatherInterval);
            clearInterval(timeInterval);
        };
    }
  }, [isAuto]);

  useEffect(() => {
      if (transitionFrom !== transitionTo && transitionProgress < 1) {
          startTransition(transitionTo, transitionProgress);
      }
  }, [transitionFrom, transitionTo]);

  useEffect(() => {
      return () => {
          if (transitionRafRef.current) {
              cancelAnimationFrame(transitionRafRef.current);
          }
      };
  }, []);

  const toggleAuto = () => {
      const next = !isAuto;
      if (next) {
          // Avoid showing stale timestamp while waiting for the first fresh auto fetch.
          setLastUpdated(null);
      }
      setIsAuto(next);
  };

  // Audio system
  const { initAudio, triggerThunder } = useWeatherAudio(weather, config, soundEnabled, soundVolume);

  const handleUserInteraction = useCallback(() => {
    initAudio();
  }, [initAudio]);

  // Auto mode handler: apply weather type + real data-driven config
  const applyWeatherFromData = (w: WeatherType, data: WeatherData) => {
      setWeatherState(w);

      // Use real weather data to drive config
      const now = new Date();
      const currentTime = now.getHours() + now.getMinutes() / 60;
      setConfigState(mapWeatherDataToConfig(data, currentTime));

      const from = isTransitioning
          ? (transitionProgress < 0.5 ? transitionFrom : transitionTo)
          : currentWeather;

      setTransitionFrom(from);
      setTransitionTo(w);
      setTransitionProgressState(0);

      startTransition(w, 0);
  };

  // Manual override handler
  const applyWeather = (w: WeatherType, disableAuto = true) => {
      if (disableAuto) {
          setIsAuto(false);
      }
      setWeatherState(w);

      // Reset weather-specific config to defaults, preserve global params (time)
      setConfigState(prev => ({
          ...DEFAULT_CONFIG,
          time: prev.time,
      }));

      const from = isTransitioning
          ? (transitionProgress < 0.5 ? transitionFrom : transitionTo)
          : currentWeather;

      setTransitionFrom(from);
      setTransitionTo(w);
      setTransitionProgressState(0);

      startTransition(w, 0);

      // Create fake data for manual mode to ensure visualizations still work
      setWeatherData(prev => ({
          type: w,
          temperature: prev?.temperature ?? 0,
          apparentTemperature: prev?.apparentTemperature ?? 0,
          isDay: true,
          sunProgress: 0.5, // Default to noon for manual mode
          locationName: prev?.locationName ?? 'Manual Mode',
          rain: 0,
          showers: 0,
          snowfall: 0,
          precipitation: 0,
          cloudCover: (prev?.cloudCover ?? 10),
          windSpeed: 0,
          windDirection: 0,
          windGusts: 0,
          humidity: prev?.humidity ?? 50,
          visibility: prev?.visibility ?? 10000,
          weatherCode: 0,
      }));
  };

  const getBackgroundClass = (w: WeatherType) => {
    switch (w) {
      case 'sunny': return 'bg-gradient-to-b from-sky-400 to-sky-200';
      case 'rainy': return 'bg-gradient-to-b from-slate-900 to-slate-700';
      case 'snowy': return 'bg-gradient-to-b from-gray-800 to-gray-400';
      case 'cloudy': return 'bg-gradient-to-b from-slate-400 to-slate-200';
      case 'foggy': return 'bg-gradient-to-b from-slate-600 to-slate-400';
      // @ts-ignore
      case 'icy': return 'bg-gradient-to-b from-cyan-950 to-cyan-700';
      default: return 'bg-gray-900';
    }
  };

    const easedProgress = easeInOut(transitionProgress);
    const isBlending = transitionFrom !== transitionTo && isTransitioning;
  const fromOpacity = isBlending ? 1 - easedProgress : 0;
    const toOpacity = isBlending ? easedProgress : 1;

  const transitionState: WeatherTransitionState = {
      from: transitionFrom,
      to: transitionTo,
      progress: transitionProgress,
      active: isBlending && transitionProgress < 1,
      duration: transitionConfig.duration,
  };

  return (
    <WeatherContext.Provider 
        value={{ 
            weather, 
            setWeather: (w: WeatherType) => applyWeather(w, true), 
            isAuto, 
            toggleAuto, 
            weatherData,
            config,
            setConfig,
            transition: transitionState,
            setTransitionConfig,
            soundEnabled,
            setSoundEnabled,
            soundVolume,
            setSoundVolume,
            immersive,
            setImmersive,
            lastUpdated,
        }}
    >
            <div className="min-h-screen relative overflow-hidden" onClick={handleUserInteraction}>
                {/* Background crossfade */}
                <div
                    className={`absolute inset-0 transition-opacity duration-700 ${getBackgroundClass(transitionFrom)}`}
                    style={{ opacity: fromOpacity }}
                />
                <div
                    className={`absolute inset-0 transition-opacity duration-700 ${getBackgroundClass(transitionTo)}`}
                    style={{ opacity: toOpacity }}
                />

                {/* Weather Particle Layer - Now passing sunProgress and config */}
                {isBlending && (
                    <WeatherCanvas 
                            weather={transitionFrom} 
                            sunProgress={weatherData?.sunProgress ?? 0.5} 
                            config={config}
                            opacity={fromOpacity}
                            className="z-0"
                    />
                )}
                <WeatherCanvas 
                        weather={transitionTo} 
                        sunProgress={weatherData?.sunProgress ?? 0.5} 
                        config={config}
                        opacity={toOpacity}
                        className="z-0"
                        onLightningStrike={triggerThunder}
                        onFpsUpdate={setFps}
                />

                {/* Overlays crossfade */}
                {isBlending && (
                    <CloudOverlay forcedWeather={transitionFrom} opacity={fromOpacity} />
                )}
                <CloudOverlay forcedWeather={transitionTo} opacity={toOpacity} />

                {isBlending && (
                    <FogOverlay forcedWeather={transitionFrom} opacity={fromOpacity} />
                )}
                <FogOverlay forcedWeather={transitionTo} opacity={toOpacity} />
        
        <main className="relative z-10 p-10 text-white flex flex-col items-center">
            {children}

             {/* Live Data Display */}
             {!immersive && (
                 <div className="absolute top-6 right-2.5 text-right text-xs text-white/60 font-mono">
                     <p>{fps} FPS</p>
                     {weatherData && isAuto && (
                       <>
                         <p>{weatherData.temperature}°C</p>
                         <p>Sun: {(weatherData.sunProgress * 100).toFixed(0)}%</p>
                       </>
                     )}
                 </div>
             )}
        </main>
      </div>
    </WeatherContext.Provider>
  );
};

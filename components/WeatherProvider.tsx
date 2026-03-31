'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { WeatherType, WeatherData, WeatherConfig, DEFAULT_CONFIG, WeatherTransitionConfig, WeatherTransitionState, ForecastData, HourlyForecast, DailyForecast } from './weather-types';
import WeatherCanvas from './WeatherCanvas';
import FogOverlay from './FogOverlay';
import CloudOverlay from './CloudOverlay';
import { useWeatherAudio } from './useWeatherAudio';
import { useI18n } from './i18n';
import { CONFIG_STORAGE_KEYS, readConfigFromLocalStorage, saveConfigToLocalStorage, removeConfigFromLocalStorage } from '../lib/configStorage';

const FPS_INITIAL = 0;
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const BEIJING_COORDS = { lat: 39.9042, lon: 116.4074 };

async function reverseGeocode(lat: number, lon: number, locale: string): Promise<string> {
  if (lat === BEIJING_COORDS.lat && lon === BEIJING_COORDS.lon) {
    return locale.startsWith('zh') ? '北京' : 'Beijing';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      { headers: { 'Accept-Language': locale }, signal: controller.signal }
    );
    if (!res.ok) return `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`;
    const data = await res.json();
    const addr = data.address || {};
    const parts = [addr.city || addr.town || addr.village || addr.county, addr.state, addr.country].filter(Boolean);
    return parts.join(', ') || data.display_name || `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`;
  } catch {
        return `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`;
  } finally {
    clearTimeout(timer);
  }
}

interface WeatherContextType {
  weather: WeatherType;
  setWeather: (type: WeatherType) => void;
  isAuto: boolean;
    isLocating: boolean;
  toggleAuto: () => void;
  weatherData: WeatherData | null;
  forecastData: ForecastData | null;
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
  setLocation: (lat: number, lon: number) => void;
  customCoords: { lat: number; lon: number } | null;
  paused: boolean;
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
    const { locale } = useI18n();
    const geocodeSeqRef = useRef(0);
    const [weather, setWeatherState] = useState<WeatherType>('sunny');
    const [currentWeather, setCurrentWeather] = useState<WeatherType>('sunny');
    const [transitionFrom, setTransitionFrom] = useState<WeatherType>('sunny');
    const [transitionTo, setTransitionTo] = useState<WeatherType>('sunny');
    const [transitionProgress, setTransitionProgressState] = useState<number>(1);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
    const [pagePaused, setPagePaused] = useState<boolean>(false);
      const [transitionConfig, setTransitionConfigState] = useState<WeatherTransitionConfig>({
          duration: 0.5,
      });
    const transitionRafRef = useRef<number | null>(null);
  // Use stable defaults for SSR; hydrate from localStorage/Date in useEffect
  const [config, setConfigState] = useState<WeatherConfig>(() => ({
      ...DEFAULT_CONFIG,
      time: 12, // stable default; real time set after mount
  }));
  const [customCoords, setCustomCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [geoTrigger, setGeoTrigger] = useState(0);
    const [isLocating, setIsLocating] = useState<boolean>(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(false);

  // Hydrate client-only state after mount to avoid SSR mismatch
  useEffect(() => {
    queueMicrotask(() => {
      const now = new Date();
      setConfigState(prev => ({ ...prev, time: now.getHours() + now.getMinutes() / 60 }));

      const savedCoords = readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.mapLocation);
      if (savedCoords) {
        try {
          const parsed = JSON.parse(savedCoords);
          if (typeof parsed?.lat === 'number' && typeof parsed?.lon === 'number') {
            setCustomCoords(parsed);
          }
        } catch { /* corrupted data */ }
      }

      if (readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.autoMode) === 'on') {
        setIsAuto(true);
      }

      if (readConfigFromLocalStorage(CONFIG_STORAGE_KEYS.sound) === 'on') {
        setSoundEnabledState(true);
      }
    });
  }, []);
  const setSoundEnabled = useCallback((v: boolean) => {
      setSoundEnabledState(v);
            saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.sound, v ? 'on' : 'off');
  }, []);
  const [soundVolume, setSoundVolume] = useState<number>(0.6);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [immersive, setImmersiveState] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(FPS_INITIAL);
    const fetchWeatherRef = useRef<(lat: number, lon: number) => Promise<void>>(async () => {});

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

  // Pause weather effects 3s after mouse leaves the page
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onLeave = () => {
      timer = setTimeout(() => setPagePaused(true), 3000);
    };
    const onEnter = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      setPagePaused(false);
    };
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
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
      saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.autoMode, 'off');
  };

  const setTransitionConfig = (newConfig: Partial<WeatherTransitionConfig>) => {
      setTransitionConfigState(prev => ({ ...prev, ...newConfig }));
  };

  // WMO Weather Code Mapping to our types
  const mapWmoCodeToType = (code: number, temp: number, visibility?: number, windSpeed?: number, precipitation?: number): WeatherType => {
      // https://open-meteo.com/en/docs
      if ([96, 99].includes(code)) return 'hail';
      if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(code)) return 'rainy';
      if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return 'snowy';
      if ([45, 48].includes(code)) return 'foggy'; 
      
      // Sandstorm heuristic: very low visibility + strong wind + no significant precipitation
      // Open-Meteo has no dedicated sandstorm WMO code, so infer from conditions
      if (visibility !== undefined && windSpeed !== undefined && precipitation !== undefined) {
          if (visibility < 2000 && windSpeed > 40 && precipitation < 1 && ![45, 48].includes(code)) {
              return 'sandstorm';
          }
      }
      
      if ([2, 3].includes(code)) return 'cloudy';
      if ([0, 1].includes(code)) return 'sunny';
      
      // Special logic for Icy: Low temp + clear or slight rain
      if (temp < 0 && [0, 1, 2, 3].includes(code)) return 'icy';
      
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
      } else if (type === 'hail') {
          // Hail: moderate background rain + hail pellets
          const totalRain = data.rain + data.showers;
          particleCount = clamp(Math.round(totalRain * 30), 5, 30);
          speed = clamp(1.5 + data.windGusts * 0.02, 1.5, 4);
          intensity = clamp(data.precipitation / 8, 0.3, 1);
      } else if (type === 'sandstorm') {
          // Sandstorm: particle count driven by wind intensity
          particleCount = clamp(Math.round(data.windSpeed * 4), 80, 350);
          speed = clamp(data.windSpeed / 20, 1, 3);
          intensity = clamp(data.windSpeed / 50, 0.3, 1);
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

      // Hail-specific config
      const hailCount = type === 'hail'
          ? clamp(Math.round(data.precipitation * 15), 10, 150)
          : undefined;

      // Sandstorm-specific config
      const sandDensity = type === 'sandstorm'
          ? clamp(1 - data.visibility / 5000, 0.2, 1)
          : undefined;

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
          ...(hailCount !== undefined && { hailCount }),
          ...(sandDensity !== undefined && { sandDensity }),
      };
  };

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

  const fetchWeather = async (lat: number, lon: number) => {
      try {
          const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
              `&current=temperature_2m,apparent_temperature,relative_humidity_2m,rain,showers,snowfall,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,is_day` +
              `&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m,cloud_cover,relative_humidity_2m,visibility` +
              `&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
              `&forecast_days=8&timezone=auto`
          );
          const data = await res.json();
          
          if (!data.current || !data.daily) {
              setForecastData(null);
              return;
          }

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

          const newWeatherType = mapWmoCodeToType(
              current.weather_code,
              current.temperature_2m,
              current.visibility ?? 10000,
              current.wind_speed_10m ?? 0,
              current.precipitation ?? 0
          );
          
          const newWeatherData: WeatherData = {
              type: newWeatherType,
              temperature: current.temperature_2m,
              apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
              isDay: current.is_day === 1,
              sunProgress: progress,
              locationName: '',
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

          setWeatherData(prev => ({
              ...newWeatherData,
              locationName: prev?.locationName || '',
          }));

          // Reverse geocode to get location name (non-blocking)
          const seq = ++geocodeSeqRef.current;
          reverseGeocode(lat, lon, locale).then(name => {
              if (geocodeSeqRef.current === seq) {
                  setWeatherData(prev => prev ? { ...prev, locationName: name } : prev);
              }
          });

          // Parse forecast data
          if (data.hourly && data.daily) {
              const nowTime = new Date();
              const currentHourIndex = data.hourly.time.findIndex((t: string) => new Date(t) >= nowTime);
              const startIndex = Math.max(0, currentHourIndex - 1);
              const hourlySlice = data.hourly.time.slice(startIndex, startIndex + 25);

              const hourly: HourlyForecast[] = hourlySlice.map((_: string, i: number) => {
                  const idx = startIndex + i;
                  const code = data.hourly.weather_code[idx] ?? 0;
                  const temp = data.hourly.temperature_2m[idx] ?? 0;
                  const hPrecip = data.hourly.precipitation[idx] ?? 0;
                  const hWind = data.hourly.wind_speed_10m[idx] ?? 0;
                  const hVis = data.hourly.visibility?.[idx] ?? 10000;
                  return {
                      time: data.hourly.time[idx],
                      temperature: temp,
                      weatherCode: code,
                      precipitation: hPrecip,
                      windSpeed: hWind,
                      cloudCover: data.hourly.cloud_cover[idx] ?? 0,
                      humidity: data.hourly.relative_humidity_2m[idx] ?? 0,
                      type: mapWmoCodeToType(code, temp, hVis, hWind, hPrecip),
                  } as HourlyForecast;
              });

              const dailyForecasts: DailyForecast[] = data.daily.time.slice(0, 7).map((date: string, i: number) => {
                  const code = data.daily.weather_code[i] ?? 0;
                  const maxTemp = data.daily.temperature_2m_max[i] ?? 0;
                  const dPrecip = data.daily.precipitation_sum[i] ?? 0;
                  const dWind = data.daily.wind_speed_10m_max[i] ?? 0;
                  return {
                      date,
                      temperatureMax: maxTemp,
                      temperatureMin: data.daily.temperature_2m_min[i] ?? 0,
                      weatherCode: code,
                      precipitationSum: dPrecip,
                      windSpeedMax: dWind,
                      type: mapWmoCodeToType(code, maxTemp, undefined, dWind, dPrecip),
                  };
              });

              setForecastData({ hourly, daily: dailyForecasts });
          }

          setLastUpdated(new Date());
          
          if (isAuto) {
              // Apply weather type with transition
              applyWeatherFromData(newWeatherType, newWeatherData);
          }

      } catch (err) {
          console.error("Failed to fetch weather", err);
          setForecastData(null);
      }
  };

  useEffect(() => {
      fetchWeatherRef.current = fetchWeather;
  });

  useEffect(() => {
    if (isAuto) {
        const fetchForLocation = (lat: number, lon: number) => {
            void fetchWeatherRef.current(lat, lon);
        };

        // 1. Initial Fetch
        if (customCoords) {
            queueMicrotask(() => setIsLocating(false));
            fetchForLocation(customCoords.lat, customCoords.lon);
        } else if ("geolocation" in navigator) {
            queueMicrotask(() => setIsLocating(true));
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setIsLocating(false);
                    fetchForLocation(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    console.error("Geo error:", error);
                    setIsLocating(false);
                    fetchForLocation(BEIJING_COORDS.lat, BEIJING_COORDS.lon);
                }
            );
        } else {
             queueMicrotask(() => setIsLocating(false));
             setTimeout(() => {
                 fetchForLocation(BEIJING_COORDS.lat, BEIJING_COORDS.lon);
             }, 0);
        }

        // 2. Weather Fetch Interval (10 minutes)
        const weatherInterval = setInterval(() => {
             if (customCoords) {
                setIsLocating(false);
                fetchForLocation(customCoords.lat, customCoords.lon);
             } else if ("geolocation" in navigator) {
                setIsLocating(true);
                navigator.geolocation.getCurrentPosition(
                    (p) => {
                        setIsLocating(false);
                        fetchForLocation(p.coords.latitude, p.coords.longitude);
                    },
                    () => {
                        setIsLocating(false);
                        fetchForLocation(BEIJING_COORDS.lat, BEIJING_COORDS.lon);
                    }
                );
            } else {
                setIsLocating(false);
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
    }, [isAuto, customCoords, geoTrigger]);

    useEffect(() => {
            if (!isAuto) queueMicrotask(() => setIsLocating(false));
    }, [isAuto]);

  useEffect(() => {
      return () => {
          if (transitionRafRef.current) {
              cancelAnimationFrame(transitionRafRef.current);
          }
      };
  }, []);

  const toggleAuto = () => {
      // Always clear stored coords and request fresh browser geolocation.
      setLastUpdated(null);
      setCustomCoords(null);
      removeConfigFromLocalStorage(CONFIG_STORAGE_KEYS.mapLocation);
      if (!isAuto) {
          setIsAuto(true);
          saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.autoMode, 'on');
      } else {
          // Already in auto mode — force the effect to re-run even if
          // customCoords was already null (same value won't trigger effect).
          setGeoTrigger(prev => prev + 1);
      }
  };

  const setLocation = useCallback((lat: number, lon: number) => {
      setCustomCoords({ lat, lon });
      setLastUpdated(null);
      setIsAuto(true);
      saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.mapLocation, JSON.stringify({ lat, lon }));
      saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.autoMode, 'on');
  }, []);

  // Audio system
  const { initAudio, triggerThunder } = useWeatherAudio(weather, config, soundEnabled, soundVolume, pagePaused);

  const handleUserInteraction = useCallback(() => {
    initAudio();
  }, [initAudio]);

  // Manual override handler
  const applyWeather = (w: WeatherType, disableAuto = true) => {
      if (disableAuto) {
          setIsAuto(false);
          saveConfigToLocalStorage(CONFIG_STORAGE_KEYS.autoMode, 'off');
      }
      setWeatherState(w);

      // Reset weather-specific config to defaults, preserve global params (time)
      const weatherDefaults: Partial<WeatherConfig> = w === 'hail'
          ? { particleCount: 5, cloudCover: 0.8, hailCount: 30, speed: 2 }
          : w === 'sandstorm'
          ? { sandDensity: 0.6, speed: 1 }
          : {};
      setConfigState(prev => ({
          ...DEFAULT_CONFIG,
          time: prev.time,
          ...weatherDefaults,
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
      case 'icy': return 'bg-gradient-to-b from-cyan-950 to-cyan-700';
      case 'hail': return 'bg-gradient-to-b from-slate-900 to-slate-600';
      case 'sandstorm': return 'bg-gradient-to-b from-amber-900 to-yellow-700';
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
            isLocating,
            toggleAuto, 
            weatherData,
            forecastData,
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
            setLocation,
            customCoords,
            paused: pagePaused,
        }}
    >
            <div className={`min-h-screen relative overflow-hidden${pagePaused ? ' weather-paused' : ''}`} onClick={handleUserInteraction}>
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
                            paused={pagePaused}
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
                        paused={pagePaused}
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
                 <div className="absolute top-6 right-2.5 text-right text-xs text-[var(--text-60)] font-mono">
                     <p>{fps} FPS</p>
                 </div>
             )}
        </main>
      </div>
    </WeatherContext.Provider>
  );
};

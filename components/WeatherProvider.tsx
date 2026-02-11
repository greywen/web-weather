'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WeatherType, WeatherData, WeatherConfig, DEFAULT_CONFIG } from './weather-types';
import WeatherCanvas from './WeatherCanvas';
import FogOverlay from './FogOverlay';
import CloudOverlay from './CloudOverlay';
import BottomNav from './BottomNav';

interface WeatherContextType {
  weather: WeatherType;
  setWeather: (type: WeatherType) => void;
  isAuto: boolean;
  toggleAuto: () => void;
  weatherData: WeatherData | null;
  config: WeatherConfig;
  setConfig: (config: Partial<WeatherConfig>) => void;
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
  const [weather, setWeather] = useState<WeatherType>('sunny');
  // Initialize time with current hour
  const [config, setConfigState] = useState<WeatherConfig>(() => {
      const now = new Date();
      return {
          ...DEFAULT_CONFIG,
          time: now.getHours() + now.getMinutes() / 60
      };
  });
  const [isAuto, setIsAuto] = useState<boolean>(true);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  const setConfig = (newConfig: Partial<WeatherConfig>) => {
      setConfigState(prev => ({ ...prev, ...newConfig }));
      setIsAuto(false); // Manually changing config disables auto mode usually
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

  const fetchWeather = async (lat: number, lon: number) => {
      try {
          const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code&daily=sunrise,sunset&timezone=auto`
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
          
          setWeatherData({
              type: newWeatherType,
              temperature: current.temperature_2m,
              isDay: current.is_day === 1,
              sunProgress: progress,
              locationName: `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}` // In a real app we'd reverse geocode
          });
          
          if (isAuto) {
              setWeather(newWeatherType);
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

  const toggleAuto = () => setIsAuto(!isAuto);

  // Manual override handler
  const handleManualSetWeather = (w: WeatherType) => {
      setIsAuto(false);
      setWeather(w);
      // Create fake data for manual mode to ensure visualizations still work
      setWeatherData(prev => ({
          ...prev!,
          type: w,
          isDay: true,
          sunProgress: 0.5 // Default to noon for manual mode
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

  return (
    <WeatherContext.Provider 
        value={{ 
            weather, 
            setWeather: handleManualSetWeather, 
            isAuto, 
            toggleAuto, 
            weatherData,
            config,
            setConfig 
        }}
    >
            <div className={`min-h-screen relative overflow-hidden transition-colors duration-1000 ${getBackgroundClass(weather)}`}>
                {/* Weather Particle Layer - Now passing sunProgress and config */}
                <WeatherCanvas 
                        weather={weather} 
                        sunProgress={weatherData?.sunProgress ?? 0.5} 
                        config={config}
                />
                <CloudOverlay />
                <FogOverlay />
        
        <main className="relative z-10 p-10 text-white flex flex-col items-center">
             {/* Auto Mode Indicator */}
             <div 
                onClick={toggleAuto}
                className={`cursor-pointer mb-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${isAuto ? 'bg-green-500/80 text-white' : 'bg-white/10 text-white/50 border border-white/10'}`}
             >
                {isAuto ? 'Local Auto Mode' : 'Manual Mode'}
             </div>
             
            {children}

             {/* Live Data Display (Optional Debug) */}
             {weatherData && isAuto && (
                 <div className="absolute top-4 right-4 text-right text-xs text-white/60 font-mono">
                     <p>{weatherData.temperature}°C</p>
                     <p>Sun: {(weatherData.sunProgress * 100).toFixed(0)}%</p>
                 </div>
             )}
        </main>
        
        {/* Dock Navigation */}
        <BottomNav />
      </div>
    </WeatherContext.Provider>
  );
};

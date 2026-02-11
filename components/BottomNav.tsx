'use client';

import { Cloud, CloudRain, Snowflake, Sun } from 'lucide-react';
import { useWeather } from './WeatherProvider';
import { WeatherType } from './weather-types';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export default function BottomNav() {
  const { weather, setWeather, isAuto } = useWeather();

  const navItems: { type: WeatherType; icon: React.ReactNode; label: string }[] = [
    { type: 'sunny', icon: <Sun size={24} />, label: 'Sunny' },
    { type: 'rainy', icon: <CloudRain size={24} />, label: 'Rainy' },
    { type: 'snowy', icon: <Snowflake size={24} />, label: 'Snowy' },
    { type: 'cloudy', icon: <Cloud size={24} />, label: 'Cloudy' },
  ];

  return (
    <motion.div 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-md"
    >
      <div className="backdrop-blur-md bg-white/30 dark:bg-black/30 border border-white/20 rounded-2xl shadow-xl p-2 flex justify-around items-center h-20">
        {navItems.map((item) => (
          <button
            key={item.type}
            onClick={() => setWeather(item.type)}
            className={clsx(
              "flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-300",
              !isAuto && weather === item.type 
                ? "bg-white/40 text-blue-900 shadow-lg scale-105" 
                : "text-white/70 hover:bg-white/10"
            )}
          >
            {item.icon}
            <span className="text-xs mt-1 font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

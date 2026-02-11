export type WeatherType = 'sunny' | 'rainy' | 'snowy' | 'cloudy' | 'foggy' | 'icy';

export interface WeatherConfig {
  particleCount: number; // drops/flakes count
  speed: number;         // vertical speed
  wind: number;          // horizontal wind
  intensity: number;     // sun intensity or general severity (0-1+)
  temperature: number;   // -10 to 10 (Celsius)
  time: number;          // 0-24 (Hour of day)
  thunder?: boolean;     // Thunderstorm toggle
  cloudCover?: number;   // 0-1 for cloudy
  fogDensity?: number;   // 0-1 for foggy
}

export interface WeatherTransitionConfig {
  duration: number; // seconds
}

export interface WeatherTransitionState extends WeatherTransitionConfig {
  from: WeatherType;
  to: WeatherType;
  progress: number; // 0-1
  active: boolean;
}

export const DEFAULT_CONFIG: WeatherConfig = {
  particleCount: 100,
  speed: 1,
  wind: 0,
  intensity: 1,
  temperature: 0,
  time: 12, // Default noon
  thunder: false,
  cloudCover: 0.1,
  fogDensity: 0.5,
};

export interface WeatherData {
  type: WeatherType;
  temperature: number;
  isDay: boolean; // 是否是白天
  sunProgress: number; // 0 = 日出, 0.5 = 正午, 1 = 日落 (用于计算太阳位置)
  locationName: string;
}

export interface WeatherState {
  current: WeatherType;
  isAuto: boolean;
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

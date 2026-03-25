export type WeatherType = 'sunny' | 'rainy' | 'snowy' | 'cloudy' | 'foggy' | 'icy' | 'hail' | 'sandstorm';

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
  hailCount?: number;    // 0-150 hail pellets
  sandDensity?: number;  // 0-1 sandstorm density
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
  hailCount: 30,
  sandDensity: 0.6,
};

export interface WeatherData {
  type: WeatherType;
  temperature: number;
  apparentTemperature: number; // Feels-like temperature (°C)
  isDay: boolean; // Whether it is daytime
  sunProgress: number; // 0 = sunrise, 0.5 = noon, 1 = sunset (used for sun position calculation)
  locationName: string;
  // Detailed weather parameters from API
  rain: number;           // Current rainfall (mm)
  showers: number;        // Shower rainfall (mm)
  snowfall: number;       // Snowfall (cm)
  precipitation: number;  // Total precipitation (mm)
  cloudCover: number;     // Cloud cover (0-100%)
  windSpeed: number;      // Wind speed at 10m (km/h)
  windDirection: number;  // Wind direction (0-360°)
  windGusts: number;      // Wind gusts at 10m (km/h)
  humidity: number;       // Relative humidity (0-100%)
  visibility: number;     // Visibility (m)
  weatherCode: number;    // WMO weather code
}

export interface WeatherState {
  current: WeatherType;
  isAuto: boolean;
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

// Forecast types for 24h/7d timeline
export interface HourlyForecast {
  time: string;           // ISO 8601 datetime
  temperature: number;    // °C
  weatherCode: number;    // WMO code
  precipitation: number;  // mm
  windSpeed: number;      // km/h
  cloudCover: number;     // 0-100%
  humidity: number;       // 0-100%
  type: WeatherType;      // Derived from WMO code
}

export interface DailyForecast {
  date: string;           // ISO 8601 date
  temperatureMax: number; // °C
  temperatureMin: number; // °C
  weatherCode: number;    // WMO code
  precipitationSum: number; // mm total
  windSpeedMax: number;   // km/h
  type: WeatherType;      // Derived from WMO code
}

export interface ForecastData {
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

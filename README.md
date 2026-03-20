# Web Weather — Interactive Browser Weather Simulation

English | [中文](README.zh.md)

**Web Weather** is an open-source, interactive weather simulation running entirely in the browser. Built with **Next.js**, **Canvas 2D**, and the **Web Audio API**, it renders realistic rain, snow, fog, clouds, sunshine, and thunderstorms — complete with procedural audio, real-time parameter controls, and live geolocation-based weather.

**Live Demo** — [weather.anhejin.cn](https://weather.anhejin.cn)

> Keywords: web weather, weather simulation, weather visualization, weather animation, browser weather, canvas weather effects, interactive weather, rain animation, snow animation, weather app

## Features

- **6 Weather Modes** — Sunny, Rainy, Snowy, Cloudy, Foggy, Icy with smooth crossfade transitions
- **Canvas 2D Particle Engine** — Rain drops with splash particles, snow with accumulation & melting physics, sun glow with lens flares, fractal lightning bolts
- **Procedural Audio** — Thunder synthesized in real-time (snap → crack → sub-bass → rolling rumble) using Web Audio API, plus rain & wind ambience
- **Live Weather via Geolocation** — Auto-fetches your real weather from [Open-Meteo](https://open-meteo.com/) (free, no API key required), falls back to London
- **Rich Controls** — Adjust particle count, fall speed, wind direction, cloud cover, fog density, temperature, time of day (0–24h), and more
- **Day / Night Cycle** — Time slider smoothly transitions sky brightness; sun and moon positioning
- **Immersive Fullscreen Mode** — Hide all UI and enjoy the weather as a live wallpaper
- **Temperature-Driven Physics** — Snow melts above 0 °C; turns icy-blue below −5 °C
- **Performance Optimized** — SoA (Struct of Arrays) with Float32Array, batched rendering, object pooling
- **Responsive Design** — Desktop sidebar + mobile-friendly bottom navigation
- **Docker Ready** — One-command deployment with Docker Compose

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js (App Router) + React + TypeScript |
| Rendering | Canvas 2D API, Web Animations API, CSS animations |
| Audio | Web Audio API (procedural synthesis) |
| Styling | Tailwind CSS v4, Framer Motion |
| Weather Data | Open-Meteo API + Browser Geolocation API |
| Icons | lucide-react |
| Deployment | Docker + docker-compose |

## Getting Started

### Prerequisites

- Node.js 20+
- npm / yarn / pnpm

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Deployment

```bash
# Build the Next.js app first
npm run build

# Start with Docker Compose
docker compose up -d
```

The app will be available at `http://localhost:6000`.

## Project Structure

```
app/
  layout.tsx          # Root layout with Geist fonts
  page.tsx            # Entry point
  globals.css         # Global styles & animations
components/
  WeatherProvider.tsx  # Weather state context + Open-Meteo integration
  WeatherCanvas.tsx    # Canvas 2D particle engine (rain, snow, sun, lightning)
  WeatherSettings.tsx  # Control panel UI (desktop & immersive mode)
  CloudOverlay.tsx     # Parallax cloud layers
  FogOverlay.tsx       # Fog gradient & drifting smoke
  useWeatherAudio.ts   # Procedural audio synthesis (thunder, rain, wind)
  weather-types.ts     # TypeScript type definitions
public/
  images/              # Cloud & smoke textures
  sounds/              # Thunder audio samples
```

## How It Works

1. **Rendering** — A full-viewport `<canvas>` draws weather particles (rain drops, snowflakes, sun glow, lightning) at 60 fps via `requestAnimationFrame`. CSS overlays add parallax clouds and fog layers on top.
2. **Audio** — Thunder is procedurally synthesized through a multi-stage pipeline: lightning snap → arc crack → sub-bass sweep → rolling rumble, processed through compressors and delay networks.
3. **Auto Mode** — The browser's Geolocation API fetches your coordinates, queries the Open-Meteo API, maps WMO weather codes to visual presets, and refreshes every 10 minutes.
4. **Transitions** — Switching weather types triggers a dual-layer crossfade with configurable easing and duration (0.5–8 s).

## License

MIT

## Acknowledgements

- Weather data powered by [Open-Meteo](https://open-meteo.com/)
- Fonts: [Geist](https://vercel.com/font) by Vercel

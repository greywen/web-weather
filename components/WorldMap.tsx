'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useI18n, TranslationKey } from './i18n';
import 'leaflet/dist/leaflet.css';

interface WorldMapProps {
  onSelectLocation: (lat: number, lon: number, name?: string) => void;
  onClose: () => void;
  initialLat?: number;
  initialLon?: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

async function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit,
  retries = 2,
  timeoutMs = 5000
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!res.ok) {
        // Retry on throttling or transient server errors.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const delay = 250 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Request failed with status ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = 250 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('Unknown request error');
}

// Reverse geocode to get a location name
async function reverseGeocode(lat: number, lon: number, locale: string): Promise<string> {
  try {
    const data = await fetchJsonWithRetry<{ display_name?: string; address?: Record<string, string> }>(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      {
        headers: {
          'Accept-Language': locale,
        },
      }
    );
    const addr = data.address || {};
    const parts = [addr.city || addr.town || addr.village || addr.county, addr.state, addr.country].filter(Boolean);
    return parts.join(', ') || data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

export default function WorldMap({ onSelectLocation, onClose, initialLat, initialLon }: WorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLat, setSelectedLat] = useState<number | null>(initialLat ?? null);
  const [selectedLon, setSelectedLon] = useState<number | null>(initialLon ?? null);
  const [selectedName, setSelectedName] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [entering, setEntering] = useState(true);
  const { t, locale } = useI18n();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  const createMarkerIcon = useCallback(async () => {
    const L = (await import('leaflet')).default;
    return L.divIcon({
      html: `<div class="wm-marker"><div class="wm-marker-pulse"></div><div class="wm-marker-dot"></div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      className: '',
    });
  }, []);

  useEffect(() => {
    let map: L.Map | undefined;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (!mapContainerRef.current) return;

      // Calculate minZoom based on container height to prevent world repeat
      const containerH = mapContainerRef.current.clientHeight;
      const minZoom = Math.ceil(Math.log2(containerH / 256));

      map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: Math.max(2, minZoom),
        maxBoundsViscosity: 1.0,
        maxBounds: [[-85, -180], [85, 180]],
        worldCopyJump: false,
      }).setView(
        [initialLat ?? 30, initialLon ?? 0],
        initialLat != null ? 5 : Math.max(2, minZoom)
      );

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]],
      }).addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        pane: 'overlayPane',
        noWrap: true,
        bounds: [[-90, -180], [90, 180]],
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;

      const icon = await createMarkerIcon();

      if (initialLat != null && initialLon != null) {
        markerRef.current = L.marker([initialLat, initialLon], { icon }).addTo(map);
        reverseGeocode(initialLat, initialLon, locale).then(name => setSelectedName(name));
      }

      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setSelectedLat(lat);
        setSelectedLon(lng);
        setSelectedName('');

        const clickIcon = await createMarkerIcon();
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: clickIcon }).addTo(map!);
        }

        const name = await reverseGeocode(lat, lng, locale);
        setSelectedName(name);
      });
    };

    initMap();
    return () => { if (map) map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await fetchJsonWithRetry<NominatimResult[]>(
        `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
        {
          headers: {
            'Accept-Language': locale,
          },
        }
      );
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  const handleSelectResult = async (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setSelectedLat(lat);
    setSelectedLon(lon);
    setSelectedName(result.display_name);
    setSearchResults([]);
    setSearchQuery('');
    setSearchFocused(false);

    if (mapRef.current) {
      mapRef.current.setView([lat, lon], 10, { animate: true, duration: 0.8 });
      const icon = await createMarkerIcon();
      const L = (await import('leaflet')).default;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      } else {
        markerRef.current = L.marker([lat, lon], { icon }).addTo(mapRef.current);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedLat !== null && selectedLon !== null) {
      onSelectLocation(selectedLat, selectedLon, selectedName);
    }
  };

  const hasSelection = selectedLat !== null && selectedLon !== null;
  const showResults = searchResults.length > 0 && searchFocused;

  return (
    <>
      {/* Backdrop - only on desktop, click to close */}
      <div
        className={`fixed inset-0 z-[80] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 hidden md:block ${entering ? 'opacity-0' : 'opacity-100'}`}
        onClick={onClose}
      />

      {/* Panel - side panel on desktop, fullscreen on mobile */}
      <div className={`fixed z-[85] bg-[#e8e4de] transition-all duration-300 ease-out
        inset-0
        md:inset-auto md:left-[24rem] md:top-3 md:bottom-3 md:w-[calc(100vw-25.5rem)] md:max-w-[800px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.15)] md:border md:border-black/[0.08]
        ${entering ? 'opacity-0 md:translate-x-4' : 'opacity-100 md:translate-x-0'}
      `}>
        {/* Map fills the panel */}
        <div ref={mapContainerRef} className="absolute inset-0 md:rounded-2xl overflow-hidden" />

        {/* Search bar */}
        <div className={`absolute top-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 -translate-y-3' : 'opacity-100 translate-y-0'}`}>
          <div className={`relative flex items-center bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] border border-black/[0.06] transition-shadow duration-200 ${searchFocused ? 'shadow-[0_4px_24px_rgba(0,0,0,0.12)]' : ''}`}>
            <div className="pl-3 pr-1 text-black/30">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder={t('searchPlaceholder' as TranslationKey)}
              className="flex-1 h-10 px-2 bg-transparent text-[13px] text-black/80 placeholder-black/30 focus:outline-none"
            />
            {searching && (
              <div className="pr-3">
                <div className="w-4 h-4 border-2 border-black/10 border-t-black/40 rounded-full animate-spin" />
              </div>
            )}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                className="pr-3 text-black/25 hover:text-black/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            {/* Close button inside search bar on mobile */}
            <button
              type="button"
              onClick={onClose}
              className="mr-1.5 flex items-center justify-center w-7 h-7 rounded-lg text-black/30 hover:text-black/60 hover:bg-black/5 transition-all md:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            {/* Close button for desktop - inside bar right edge */}
            <button
              type="button"
              onClick={onClose}
              className="mr-2 hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-black/25 hover:text-black/50 hover:bg-black/5 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Search results dropdown */}
          {showResults && (
            <div className="mt-1.5 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-black/[0.06] overflow-hidden max-h-[50vh] overflow-y-auto">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-3 py-2.5 text-[13px] text-black/70 hover:bg-black/[0.03] transition-colors flex items-start gap-2 border-b border-black/[0.04] last:border-b-0"
                >
                  <span className="text-black/25 mt-0.5 shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span className="line-clamp-2 leading-snug">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom location card */}
        <div className={`absolute bottom-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
          {hasSelection ? (
            <div className="bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-black/[0.06] overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black/80 truncate">
                    {selectedName || `${selectedLat!.toFixed(4)}, ${selectedLon!.toFixed(4)}`}
                  </p>
                  <p className="text-[11px] text-black/35 mt-0.5">
                    {selectedLat!.toFixed(4)}°{selectedLat! >= 0 ? 'N' : 'S'}, {selectedLon!.toFixed(4)}°{selectedLon! >= 0 ? 'E' : 'W'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="h-8 px-4 rounded-lg bg-blue-500 text-white text-[12px] font-semibold hover:bg-blue-600 active:scale-[0.97] transition-all shadow-sm shrink-0"
                >
                  {t('confirmLocation' as TranslationKey)}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] text-center py-2.5 px-3">
              <p className="text-[12px] text-black/35">{t('clickMapHint' as TranslationKey)}</p>
            </div>
          )}
        </div>

        {/* Marker & Leaflet styles */}
        <style>{`
          .wm-marker {
            position: relative;
            width: 24px;
            height: 24px;
          }
          .wm-marker-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 12px;
            height: 12px;
            margin: -6px 0 0 -6px;
            background: #3b82f6;
            border: 2.5px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
          }
          .wm-marker-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 24px;
            height: 24px;
            margin: -12px 0 0 -12px;
            background: rgba(59, 130, 246, 0.2);
            border-radius: 50%;
            animation: wm-pulse 2s ease-out infinite;
          }
          @keyframes wm-pulse {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          .leaflet-container {
            background: #e8e4de !important;
            font-family: inherit;
            z-index: 0 !important;
          }
          .leaflet-pane {
            z-index: 1 !important;
          }
          .leaflet-tile-pane {
            z-index: 1 !important;
          }
          .leaflet-overlay-pane {
            z-index: 2 !important;
          }
          .leaflet-shadow-pane {
            z-index: 3 !important;
          }
          .leaflet-marker-pane {
            z-index: 4 !important;
          }
          .leaflet-tooltip-pane {
            z-index: 5 !important;
          }
          .leaflet-popup-pane {
            z-index: 6 !important;
          }
          .leaflet-control {
            z-index: 10 !important;
          }
          .leaflet-control-zoom {
            border: none !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important;
            border-radius: 10px !important;
            overflow: hidden;
          }
          .leaflet-control-zoom a {
            width: 32px !important;
            height: 32px !important;
            line-height: 32px !important;
            font-size: 15px !important;
            color: rgba(0,0,0,0.5) !important;
            background: rgba(255,255,255,0.9) !important;
            backdrop-filter: blur(12px);
            border: none !important;
            border-bottom: 1px solid rgba(0,0,0,0.06) !important;
          }
          .leaflet-control-zoom a:last-child {
            border-bottom: none !important;
          }
          .leaflet-control-zoom a:hover {
            background: rgba(255,255,255,1) !important;
            color: rgba(0,0,0,0.8) !important;
          }
        `}</style>
      </div>
    </>
  );
}

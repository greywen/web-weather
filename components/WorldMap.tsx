'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, MapPin, X, Check, Loader2 } from 'lucide-react';
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
  const [mapLoading, setMapLoading] = useState(true);
  const { t, locale } = useI18n();
  const localeRef = useRef(locale);
  const geocodeSeqRef = useRef(0);
  useEffect(() => { localeRef.current = locale; }, [locale]);

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

  // Re-geocode selected location when locale changes
  useEffect(() => {
    if (selectedLat !== null && selectedLon !== null) {
      const seq = ++geocodeSeqRef.current;
      reverseGeocode(selectedLat, selectedLon, locale).then(name => {
        if (geocodeSeqRef.current === seq) setSelectedName(name);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout>;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapContainerRef.current) return;

      // Prevent re-initializing if already mounted (React strict mode)
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 2,
        maxBoundsViscosity: 0.8,
        maxBounds: [[-85, -Infinity], [85, Infinity]],
        worldCopyJump: true,
      }).setView(
        [initialLat ?? 20, initialLon ?? 0],
        initialLat != null ? 5 : 2
      );

      if (cancelled) { map.remove(); return; }

      // Tile providers: try CARTO (dark theme), fallback to OSM if unreachable
      const CARTO_BASE = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
      const CARTO_LABELS = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png';
      const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      // Probe CARTO availability with a small test tile (timeout 4s)
      let useCarto = true;
      try {
        const probe = new AbortController();
        const probeTimer = setTimeout(() => probe.abort(), 4000);
        const res = await fetch('https://a.basemaps.cartocdn.com/dark_nolabels/0/0/0.png', {
          signal: probe.signal,
          mode: 'no-cors',
        });
        clearTimeout(probeTimer);
        // mode: no-cors gives opaque response (status 0), but no error means reachable
        if (res.type !== 'opaque' && !res.ok) useCarto = false;
      } catch {
        useCarto = false;
      }

      if (cancelled) { map.remove(); return; }

      let tilesLoaded = 0;
      const expectedTiles = useCarto ? 2 : 1;
      const onTileLayerReady = () => {
        tilesLoaded++;
        if (tilesLoaded >= expectedTiles && !cancelled) setMapLoading(false);
      };

      if (useCarto) {
        const baseTiles = L.tileLayer(CARTO_BASE, { maxZoom: 18 }).addTo(map);
        baseTiles.once('load', onTileLayerReady);
        baseTiles.once('tileerror', onTileLayerReady);

        const labelTiles = L.tileLayer(CARTO_LABELS, { maxZoom: 18, pane: 'overlayPane' }).addTo(map);
        labelTiles.once('load', onTileLayerReady);
        labelTiles.once('tileerror', onTileLayerReady);
      } else {
        const osmTiles = L.tileLayer(OSM_URL, { maxZoom: 19, className: 'osm-dark-tiles' }).addTo(map);
        osmTiles.once('load', onTileLayerReady);
        osmTiles.once('tileerror', onTileLayerReady);
      }

      // Fallback: hide loading indicator after 10s even if tiles haven't loaded
      fallbackTimer = setTimeout(() => { if (!cancelled) setMapLoading(false); }, 10000);

      L.control.zoom({ position: 'topright' }).addTo(map);

      mapRef.current = map;

      const icon = await createMarkerIcon();
      if (cancelled) { map.remove(); mapRef.current = null; return; }

      if (initialLat != null && initialLon != null) {
        markerRef.current = L.marker([initialLat, initialLon], { icon }).addTo(map);
        const seq = ++geocodeSeqRef.current;
        reverseGeocode(initialLat, initialLon, localeRef.current).then(name => {
          if (!cancelled && geocodeSeqRef.current === seq) setSelectedName(name);
        });
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

        const clickSeq = ++geocodeSeqRef.current;
        const name = await reverseGeocode(lat, lng, localeRef.current);
        if (geocodeSeqRef.current === clickSeq) setSelectedName(name);
      });
    };

    initMap();
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
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
        className={`fixed inset-0 z-[80] bg-black/40 backdrop-blur-[3px] transition-opacity duration-300 hidden md:block ${entering ? 'opacity-0' : 'opacity-100'}`}
        onClick={onClose}
      />

      {/* Panel - side panel on desktop, fullscreen on mobile */}
      <div className={`fixed z-[85] bg-slate-950/95 transition-all duration-300 ease-out
        inset-0
        md:inset-4 md:rounded-2xl md:shadow-[0_8px_60px_rgba(0,0,0,0.5)] md:border md:border-white/[0.08]
        ${entering ? 'opacity-0 md:scale-[0.97]' : 'opacity-100 md:scale-100'}
      `}>
        {/* Map fills the panel */}
        <div ref={mapContainerRef} className="absolute inset-0 md:rounded-2xl overflow-hidden" />

        {/* Loading indicator */}
        {mapLoading && (
          <div className="absolute inset-0 z-[10] flex items-center justify-center bg-slate-950/60 md:rounded-2xl pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-white/50 animate-spin" />
              <p className="text-[13px] text-white/40">{t('loading' as TranslationKey)}</p>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className={`absolute top-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 -translate-y-3' : 'opacity-100 translate-y-0'}`}>
          <div className={`relative flex items-center bg-slate-900/90 backdrop-blur-2xl rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.4)] border transition-all duration-200 ${searchFocused ? 'border-white/15 shadow-[0_4px_30px_rgba(0,0,0,0.5)]' : 'border-white/[0.08]'}`}>
            <div className="pl-3 pr-1 text-white/30">
              <Search size={15} />
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
              className="flex-1 h-10 px-2 bg-transparent text-[13px] text-white/80 placeholder-white/25 focus:outline-none"
            />
            {searching && (
              <div className="pr-3">
                <div className="w-4 h-4 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
              </div>
            )}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                className="pr-3 text-white/25 hover:text-white/55 transition-colors"
              >
                <X size={14} />
              </button>
            )}
            {/* Close button on mobile */}
            <button
              type="button"
              onClick={onClose}
              className="mr-1.5 flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all md:hidden"
            >
              <X size={14} />
            </button>
            {/* Close button for desktop */}
            <button
              type="button"
              onClick={onClose}
              className="mr-2 hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-white/25 hover:text-white/55 hover:bg-white/[0.06] transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search results dropdown */}
          {showResults && (
            <div className="mt-1.5 bg-slate-900/95 backdrop-blur-2xl rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] border border-white/[0.08] overflow-hidden max-h-[50vh] overflow-y-auto">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-3 py-2.5 text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors flex items-start gap-2 border-b border-white/[0.04] last:border-b-0"
                >
                  <MapPin size={13} className="text-white/25 mt-0.5 shrink-0" />
                  <span className="line-clamp-2 leading-snug">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom location card */}
        <div className={`absolute bottom-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
          {hasSelection ? (
            <div className="bg-slate-900/90 backdrop-blur-2xl rounded-xl shadow-[0_4px_30px_rgba(0,0,0,0.4)] border border-white/[0.08] overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/80 truncate">
                    {selectedName || `${selectedLat!.toFixed(4)}, ${selectedLon!.toFixed(4)}`}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {selectedLat!.toFixed(4)}°{selectedLat! >= 0 ? 'N' : 'S'}, {selectedLon!.toFixed(4)}°{selectedLon! >= 0 ? 'E' : 'W'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="h-8 px-4 rounded-xl bg-blue-500/80 text-white text-[12px] font-semibold hover:bg-blue-500 active:scale-[0.97] transition-all shadow-[0_2px_12px_rgba(59,130,246,0.3)] shrink-0 flex items-center gap-1.5"
                >
                  <Check size={14} />
                  {t('confirmLocation' as TranslationKey)}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/70 backdrop-blur-2xl rounded-xl shadow-[0_2px_16px_rgba(0,0,0,0.3)] border border-white/[0.06] text-center py-2.5 px-3">
              <p className="text-[12px] text-white/30">{t('clickMapHint' as TranslationKey)}</p>
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
            border: 2.5px solid rgba(255,255,255,0.9);
            border-radius: 50%;
            box-shadow: 0 2px 12px rgba(59, 130, 246, 0.5);
          }
          .wm-marker-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 24px;
            height: 24px;
            margin: -12px 0 0 -12px;
            background: rgba(59, 130, 246, 0.25);
            border-radius: 50%;
            animation: wm-pulse 2s ease-out infinite;
          }
          @keyframes wm-pulse {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          .leaflet-container {
            background: #0f172a !important;
            font-family: inherit;
            z-index: 0 !important;
          }
          .osm-dark-tiles {
            filter: invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.1) saturate(0.3);
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
            z-index: 25 !important;
          }
          .leaflet-control-zoom {
            border: none !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
            border-radius: 12px !important;
            overflow: hidden;
            margin-top: 56px !important;
            margin-right: 12px !important;
          }
          .leaflet-control-zoom a {
            width: 32px !important;
            height: 32px !important;
            line-height: 32px !important;
            font-size: 15px !important;
            color: rgba(255,255,255,0.6) !important;
            background: rgba(15,23,42,0.85) !important;
            backdrop-filter: blur(12px);
            border: none !important;
            border-bottom: 1px solid rgba(255,255,255,0.06) !important;
          }
          .leaflet-control-zoom a:last-child {
            border-bottom: none !important;
          }
          .leaflet-control-zoom a:hover {
            background: rgba(15,23,42,0.95) !important;
            color: rgba(255,255,255,0.9) !important;
          }
        `}</style>
      </div>
    </>
  );
}

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

// Cache the CARTO tile probe result for the lifetime of the page.
// null = not yet probed; true/false = reachable or not.
let cartoProbeResult: boolean | null = null;

const CONTINENT_LABELS = [
  { name: { en: 'Asia', zh: '亚洲' }, lat: 48, lon: 85 },
  { name: { en: 'Europe', zh: '欧洲' }, lat: 54, lon: 15 },
  { name: { en: 'Africa', zh: '非洲' }, lat: 5, lon: 22 },
  { name: { en: 'North America', zh: '北美洲' }, lat: 48, lon: -100 },
  { name: { en: 'South America', zh: '南美洲' }, lat: -15, lon: -58 },
  { name: { en: 'Oceania', zh: '大洋洲' }, lat: -25, lon: 135 },
  { name: { en: 'Antarctica', zh: '南极洲' }, lat: -78, lon: 0 },
];

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
  const { t, locale, theme } = useI18n();
  const localeRef = useRef(locale);
  const geocodeSeqRef = useRef(0);
  const savedViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
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

      // Restore saved view or use defaults
      let savedCenter: [number, number] | null = savedViewRef.current?.center ?? null;
      let savedZoom: number | null = savedViewRef.current?.zoom ?? null;
      savedViewRef.current = null;
      if (mapRef.current) {
        const c = mapRef.current.getCenter();
        savedCenter = [c.lat, c.lng];
        savedZoom = mapRef.current.getZoom();
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
        savedCenter ?? [initialLat ?? 20, initialLon ?? 0],
        savedZoom ?? (initialLat != null ? 5 : 2)
      );

      if (cancelled) { map.remove(); return; }

      // Tile providers: CARTO tiles (theme-aware), fallback to OSM if unreachable
      const cartoStyle = theme === 'dark' ? 'dark' : 'light';
      const CARTO_BASE = `https://{s}.basemaps.cartocdn.com/${cartoStyle}_nolabels/{z}/{x}/{y}{r}.png`;
      const CARTO_LABELS = `https://{s}.basemaps.cartocdn.com/${cartoStyle}_only_labels/{z}/{x}/{y}{r}.png`;
      const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      // Probe CARTO availability once per page session (timeout 4s).
      // If it failed before, skip the probe and fall back to OSM directly.
      let useCarto: boolean;
      if (cartoProbeResult !== null) {
        useCarto = cartoProbeResult;
      } else {
        useCarto = true;
        try {
          const probe = new AbortController();
          const probeTimer = setTimeout(() => probe.abort(), 4000);
          const res = await fetch(`https://a.basemaps.cartocdn.com/${cartoStyle}_nolabels/0/0/0.png`, {
            signal: probe.signal,
            mode: 'no-cors',
          });
          clearTimeout(probeTimer);
          // mode: no-cors gives opaque response (status 0), but no error means reachable
          if (res.type !== 'opaque' && !res.ok) useCarto = false;
        } catch {
          useCarto = false;
        }
        cartoProbeResult = useCarto;
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
        const osmTiles = L.tileLayer(OSM_URL, { maxZoom: 19, className: theme === 'dark' ? 'osm-dark-tiles' : '' }).addTo(map);
        osmTiles.once('load', onTileLayerReady);
        osmTiles.once('tileerror', onTileLayerReady);
      }

      // Fallback: hide loading indicator after 10s even if tiles haven't loaded
      fallbackTimer = setTimeout(() => { if (!cancelled) setMapLoading(false); }, 10000);

      // Add continent labels visible at low zoom levels
      const continentMarkers: L.Marker[] = [];
      CONTINENT_LABELS.forEach(({ name, lat, lon }) => {
        const label = name[localeRef.current as keyof typeof name] || name.en;
        const marker = L.marker([lat, lon], {
          icon: L.divIcon({
            html: `<div class="continent-label">${label}</div>`,
            className: '',
            iconSize: [150, 24],
            iconAnchor: [75, 12],
          }),
          interactive: false,
        });
        continentMarkers.push(marker);
      });

      const updateContinentLabels = () => {
        const zoom = map.getZoom();
        continentMarkers.forEach(m => {
          if (zoom <= 4) {
            if (!map.hasLayer(m)) m.addTo(map);
          } else {
            if (map.hasLayer(m)) m.removeFrom(map);
          }
        });
      };
      updateContinentLabels();
      map.on('zoomend', updateContinentLabels);

      L.control.zoom({ position: 'topright' }).addTo(map);

      mapRef.current = map;

      const icon = await createMarkerIcon();
      if (cancelled) { map.remove(); mapRef.current = null; return; }

      const markerLat = selectedLat ?? initialLat;
      const markerLon = selectedLon ?? initialLon;
      if (markerLat != null && markerLon != null) {
        markerRef.current = L.marker([markerLat, markerLon], { icon }).addTo(map);
        const seq = ++geocodeSeqRef.current;
        reverseGeocode(markerLat, markerLon, localeRef.current).then(name => {
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
        const c = mapRef.current.getCenter();
        savedViewRef.current = { center: [c.lat, c.lng], zoom: mapRef.current.getZoom() };
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, locale]);

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
      <div className={`fixed z-[85] bg-[var(--panel-bg)] transition-all duration-300 ease-out
        inset-0
        md:inset-4 md:rounded-2xl md:shadow-[var(--panel-shadow)] md:border md:border-[var(--panel-border)]
        ${entering ? 'opacity-0 md:scale-[0.97]' : 'opacity-100 md:scale-100'}
      `}>
        {/* Map fills the panel */}
        <div ref={mapContainerRef} className="absolute inset-0 md:rounded-2xl overflow-hidden" />

        {/* Loading indicator */}
        {mapLoading && (
          <div className="absolute inset-0 z-[10] flex items-center justify-center bg-[var(--panel-bg)] md:rounded-2xl pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="text-[var(--text-60)] animate-spin" />
              <p className="text-[13px] text-[var(--text-40)]">{t('loading' as TranslationKey)}</p>
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className={`absolute top-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 -translate-y-3' : 'opacity-100 translate-y-0'}`}>
          <div className={`relative flex items-center bg-[var(--panel-bg)] backdrop-blur-2xl rounded-xl shadow-[var(--badge-shadow)] border transition-all duration-200 ${searchFocused ? 'border-[var(--border-active)] shadow-[var(--panel-shadow)]' : 'border-[var(--panel-border)]'}`}>
            <div className="pl-3 pr-1 text-[var(--text-35)]">
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
              className="flex-1 h-10 px-2 bg-transparent text-[13px] text-[var(--text-80)] placeholder-[var(--text-25)] focus:outline-none"
            />
            {searching && (
              <div className="pr-3">
                <div className="w-4 h-4 border-2 border-[var(--spinner-track)] border-t-[var(--spinner-head)] rounded-full animate-spin" />
              </div>
            )}
            {searchQuery && !searching && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                className="pr-3 text-[var(--text-25)] hover:text-[var(--text-60)] transition-colors"
              >
                <X size={14} />
              </button>
            )}
            {/* Close button on mobile */}
            <button
              type="button"
              onClick={onClose}
              className="mr-1.5 flex items-center justify-center w-7 h-7 rounded-lg text-[var(--text-35)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-all md:hidden"
            >
              <X size={14} />
            </button>
            {/* Close button for desktop */}
            <button
              type="button"
              onClick={onClose}
              className="mr-2 hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-[var(--text-25)] hover:text-[var(--text-60)] hover:bg-[var(--surface-hover)] transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search results dropdown */}
          {showResults && (
            <div className="mt-1.5 bg-[var(--dropdown-bg)] backdrop-blur-2xl rounded-xl shadow-[var(--panel-shadow)] border border-[var(--dropdown-border)] overflow-hidden max-h-[50vh] overflow-y-auto">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-3 py-2.5 text-[13px] text-[var(--text-60)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-80)] transition-colors flex items-start gap-2 border-b border-[var(--border)] last:border-b-0"
                >
                  <MapPin size={13} className="text-[var(--text-25)] mt-0.5 shrink-0" />
                  <span className="line-clamp-2 leading-snug">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom location card */}
        <div className={`absolute bottom-3 left-3 right-3 z-[20] transition-all duration-500 ${entering ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
          {hasSelection ? (
            <div className="bg-[var(--panel-bg)] backdrop-blur-2xl rounded-xl shadow-[var(--badge-shadow)] border border-[var(--panel-border)] overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-80)] truncate">
                    {selectedName || `${selectedLat!.toFixed(4)}, ${selectedLon!.toFixed(4)}`}
                  </p>
                  <p className="text-[11px] text-[var(--text-35)] mt-0.5">
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
            <div className="bg-[var(--panel-bg)] backdrop-blur-2xl rounded-xl shadow-[var(--badge-shadow)] border border-[var(--border)] text-center py-2.5 px-3">
              <p className="text-[12px] text-[var(--text-35)]">{t('clickMapHint' as TranslationKey)}</p>
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
            background: var(--background) !important;
            font-family: inherit;
            z-index: 0 !important;
          }
          .osm-dark-tiles {
            filter: invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.1) saturate(0.3);
          }
          .continent-label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 4px;
            text-transform: uppercase;
            color: var(--text-40);
            text-shadow: 0 1px 3px rgba(0,0,0,0.15);
            white-space: nowrap;
            text-align: center;
            pointer-events: none;
            user-select: none;
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
            color: var(--text-60) !important;
            background: var(--panel-bg) !important;
            backdrop-filter: blur(12px);
            border: none !important;
            border-bottom: 1px solid var(--divider) !important;
          }
          .leaflet-control-zoom a:last-child {
            border-bottom: none !important;
          }
          .leaflet-control-zoom a:hover {
            background: var(--badge-hover) !important;
            color: var(--text-90) !important;
          }
        `}</style>
      </div>
    </>
  );
}

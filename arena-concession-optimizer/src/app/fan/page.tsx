'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

interface LocationData {
  name: string;
  waitMinutes: number;
  trafficLevel: 'low' | 'medium' | 'high';
  topItems: { item: string; category: string; qty: number }[];
  categories: string[];
  position: { x: number; y: number; side: string };
}

interface SeatZone {
  zone_id: string;
  zone_label: string;
  map_x: number;
  map_y: number;
}

interface FanData {
  game: { opponent: string; day: string; time: string };
  currentPeriod: string;
  locations: LocationData[];
  allLocations: LocationData[];
  recommendation: { location: string; reason: string; waitMinutes: number } | null;
  gameMoments: { label: string; active: boolean }[];
  seatZones?: SeatZone[];
  routeToStand?: {
    preferred: { name: string; walkMinutes: number; waitMinutes: number; roundTripMinutes: number };
    alternatives: { name: string; walkMinutes: number; waitMinutes: number; roundTripMinutes: number }[];
  } | null;
}

const CATEGORIES = ['All', 'Beer', 'Food', 'Snacks', 'Drinks'];

const CATEGORY_ICONS: Record<string, string> = {
  All: '\u{1F3DF}',
  Beer: '\u{1F37A}',
  Food: '\u{1F354}',
  Snacks: '\u{1F37F}',
  Drinks: '\u{1F964}',
};

function getWaitColor(minutes: number): string {
  if (minutes < 2) return '#22c55e';
  if (minutes < 5) return '#f59e0b';
  return '#ef4444';
}

function getWaitBg(minutes: number): string {
  if (minutes < 2) return 'bg-green-500/20 border-green-500/40';
  if (minutes < 5) return 'bg-amber-500/20 border-amber-500/40';
  return 'bg-red-500/20 border-red-500/40';
}

function getWaitDot(minutes: number): string {
  if (minutes < 2) return 'bg-green-400';
  if (minutes < 5) return 'bg-amber-400';
  return 'bg-red-400';
}

function formatWait(minutes: number): string {
  if (minutes < 1) return '<1 min';
  return `~${minutes} min`;
}

export default function FanPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<FanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [zoneId, setZoneId] = useState<string>('');
  const [mode, setMode] = useState<'fastest' | 'route'>('fastest');
  const [preferredStand, setPreferredStand] = useState<string>('');
  const [simRunning, setSimRunning] = useState(false);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [gameDates, setGameDates] = useState<{ date: string; day?: string; opponent?: string }[]>([]);
  const [simDate, setSimDate] = useState('');
  const [simSpeed] = useState(30);
  const [simBucket] = useState(300);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const opponent = searchParams.get('opponent') || 'Portland';
  const dayOfWeek = searchParams.get('dayOfWeek') || 'Friday';
  const gameTime = searchParams.get('gameTime') || '19:05';

  const fetchData = useCallback(() => {
    const url = new URL('/api/fan', window.location.origin);
    url.searchParams.set('opponent', opponent);
    url.searchParams.set('dayOfWeek', dayOfWeek);
    url.searchParams.set('gameTime', gameTime);
    if (category !== 'All') url.searchParams.set('category', category);
    if (zoneId) url.searchParams.set('zone_id', zoneId);
    if (mode === 'route' && preferredStand) url.searchParams.set('preferred_stand', preferredStand);
    if (simTime) url.searchParams.set('sim_time', simTime);

    fetch(url.toString())
      .then((res) => res.json())
      .then((d) => {
        if (d?.error || !d?.game) {
          setData(null);
        } else {
          setData(d);
          if (d.seatZones?.length && !zoneId) setZoneId(d.seatZones[0].zone_id);
        }
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [opponent, dayOfWeek, gameTime, category, zoneId, mode, preferredStand, simTime]);

  useEffect(() => {
    fetch('/api/game-dates')
      .then((r) => r.json())
      .then((d: { dates?: { date: string; day?: string; opponent?: string }[] }) => {
        const dates = d.dates ?? [];
        setGameDates(dates);
        if (dates.length > 0 && !simDate) setSimDate(dates[dates.length - 1].date);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!simRunning || !simDate) return;
    const params = new URLSearchParams();
    params.set('date', simDate);
    params.set('speed', String(simSpeed));
    params.set('bucket', String(simBucket));
    const es = new EventSource(`/api/simulate?${params.toString()}`);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { sim_time?: string; error?: string };
        if (payload.error) return;
        if (payload.sim_time) setSimTime(payload.sim_time);
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      es.close();
      setSimRunning(false);
    };
    return () => {
      es.close();
    };
  }, [simRunning, simDate, simSpeed, simBucket]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const scrollToCard = (name: string) => {
    cardRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const selectedZone = data?.seatZones?.find((z) => z.zone_id === zoneId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Finding the shortest lines...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-400">Unable to load data. Please try again.</p>
      </div>
    );
  }

  if (!data.game) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-slate-400">Unable to load game data. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header + LIVE (simulated) */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-white">Save-On-Foods Memorial Centre</h1>
            <p className="text-xs text-slate-400">
              vs {data.game.opponent} &middot; {data.game.day} &middot; {data.currentPeriod}
            </p>
          </div>
          <div className="text-right flex items-center gap-2">
            {simTime && (
              <span className="text-xs font-mono text-slate-400">
                {new Date(simTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <div>
              <div className="text-xs font-medium text-blue-400">LIVE (simulated)</div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse mx-auto mt-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Sim controls (G): date + start/stop */}
      <div className="mx-4 mt-2 flex flex-wrap items-center gap-2">
        <select
          value={simDate}
          onChange={(e) => setSimDate(e.target.value)}
          className="text-xs bg-slate-800 text-white rounded px-2 py-1 border border-slate-600"
        >
          {gameDates.map((d) => {
            const label = [d.date, d.day && d.opponent ? `${d.day} vs ${d.opponent}` : d.day || d.opponent].filter(Boolean).join(' — ') || d.date;
            return (
              <option key={d.date} value={d.date}>
                {label}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          onClick={() => setSimRunning((r) => !r)}
          className={`text-xs px-3 py-1 rounded font-medium ${simRunning ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}
        >
          {simRunning ? 'Stop sim' : 'Start sim'}
        </button>
      </div>

      {/* Mode toggle (I) */}
      <div className="px-4 mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('fastest')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === 'fastest' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          Find fastest
        </button>
        <button
          type="button"
          onClick={() => setMode('route')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === 'route' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
        >
          Route to stand
        </button>
      </div>

      {/* Route-to-stand: preferred stand dropdown */}
      {mode === 'route' && (
        <div className="px-4 mt-2">
          <label className="block text-xs text-slate-400 mb-1">Preferred stand</label>
          <select
            value={preferredStand}
            onChange={(e) => setPreferredStand(e.target.value)}
            className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-600"
          >
            <option value="">Select stand</option>
            {(data.allLocations || data.locations).map((loc) => (
              <option key={loc.name} value={loc.name}>{loc.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Route-to-stand result (I) */}
      {mode === 'route' && data.routeToStand && (
        <div className="mx-4 mt-3 rounded-xl bg-slate-800 border border-slate-600 p-4">
          <p className="text-xs text-slate-400 mb-1">Your selection</p>
          <p className="font-bold text-white">{data.routeToStand.preferred.name}</p>
          <p className="text-sm text-slate-300 mt-1">
            Walk there: {data.routeToStand.preferred.walkMinutes} min &middot; Estimated wait: {data.routeToStand.preferred.waitMinutes} min &middot; Round trip: {data.routeToStand.preferred.roundTripMinutes} min
          </p>
          {data.routeToStand.alternatives.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">Faster alternatives: {data.routeToStand.alternatives.map((a) => `${a.name} (${a.roundTripMinutes} min)`).join(', ')}</p>
          )}
        </div>
      )}

      {/* Find-fastest recommendation */}
      {mode === 'fastest' && data.recommendation && (
        <div className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/30 p-4">
          <p className="text-xs text-blue-300 font-medium uppercase tracking-wide mb-1">
            {data.recommendation.reason}
          </p>
          <p className="text-lg font-bold text-white">{data.recommendation.location}</p>
          <p className="text-2xl font-bold" style={{ color: getWaitColor(data.recommendation.waitMinutes) }}>
            {formatWait(data.recommendation.waitMinutes)} estimated wait
          </p>
        </div>
      )}

      {/* Section / Zone selector (F) */}
      {data.seatZones && data.seatZones.length > 0 && (
        <div className="px-4 mt-4">
          <label className="block text-xs text-slate-400 mb-1">Your section</label>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm border border-slate-600"
          >
            {data.seatZones.map((z) => (
              <option key={z.zone_id} value={z.zone_id}>{z.zone_label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Category Quick Filter */}
      <div className="px-4 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                category === cat ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Arena Map + blue dot (F) */}
      <div className="px-4 mt-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
          <svg viewBox="0 0 580 400" className="w-full" style={{ maxHeight: 300 }}>
            <rect x="20" y="20" width="540" height="360" rx="30" ry="30" fill="#1e293b" stroke="#334155" strokeWidth="2" />
            <rect x="120" y="120" width="340" height="180" rx="60" ry="60" fill="#0f172a" stroke="#1e3a5f" strokeWidth="1.5" />
            <line x1="290" y1="120" x2="290" y2="300" stroke="#1e3a5f" strokeWidth="1" />
            <circle cx="290" cy="210" r="30" fill="none" stroke="#1e3a5f" strokeWidth="1" />
            <rect x="135" y="190" width="20" height="40" rx="4" fill="#0c1929" stroke="#1e3a5f" strokeWidth="1" />
            <rect x="425" y="190" width="20" height="40" rx="4" fill="#0c1929" stroke="#1e3a5f" strokeWidth="1" />
            <text x="290" y="215" textAnchor="middle" fill="#1e3a5f" fontSize="14" fontWeight="bold">ICE</text>
            <text x="290" y="55" textAnchor="middle" fill="#475569" fontSize="10">MAIN CONCOURSE</text>
            <text x="290" y="375" textAnchor="middle" fill="#475569" fontSize="10">SOUTH END</text>

            {/* Blue dot: your section (F) */}
            {selectedZone != null && (
              <g>
                <circle cx={selectedZone.map_x} cy={selectedZone.map_y} r="14" fill="#3b82f6" stroke="#fff" strokeWidth="2" opacity={0.95} />
                <text x={selectedZone.map_x} y={selectedZone.map_y + 22} textAnchor="middle" fill="#93c5fd" fontSize="7" fontWeight="600">You</text>
              </g>
            )}

            {(data.allLocations || data.locations).map((loc) => {
              const color = getWaitColor(loc.waitMinutes);
              const isFiltered = data.locations.some((l) => l.name === loc.name);
              const opacity = isFiltered ? 1 : 0.3;
              const radius = 22;
              return (
                <g key={loc.name} onClick={() => scrollToCard(loc.name)} className="cursor-pointer">
                  <circle cx={loc.position.x} cy={loc.position.y} r={radius + 6} fill={color} opacity={opacity * 0.25} />
                  <circle cx={loc.position.x} cy={loc.position.y} r={radius} fill={color} stroke="#0f172a" strokeWidth="2" opacity={opacity * 0.9} />
                  <text x={loc.position.x} y={loc.position.y - 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="bold" opacity={opacity}>
                    {loc.waitMinutes < 1 ? '<1' : `${loc.waitMinutes}`}
                  </text>
                  <text x={loc.position.x} y={loc.position.y + 9} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="7" opacity={opacity}>min</text>
                  <text x={loc.position.x} y={loc.position.y + radius + 14} textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600" opacity={opacity}>{loc.name}</text>
                </g>
              );
            })}
          </svg>
          <div className="flex items-center justify-center gap-4 mt-1 text-xs text-slate-500">
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span>&lt;2 min</span></div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span>2-5 min</span></div>
            <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span>5+ min</span></div>
            <span className="text-slate-600">|</span>
            <span>Tap a stand</span>
          </div>
        </div>
      </div>

      {/* Ranked Location Cards — Estimated wait */}
      <div className="px-4 mt-4 space-y-3 pb-24">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          {data.locations.length} locations &middot; Sorted by estimated wait
        </h2>
        {data.locations.map((loc, i) => (
          <div
            key={loc.name}
            ref={(el) => { cardRefs.current[loc.name] = el; }}
            className={`rounded-xl border p-4 transition-all ${getWaitBg(loc.waitMinutes)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getWaitDot(loc.waitMinutes)}`} />
                <div>
                  <h3 className="font-bold text-white">{loc.name}</h3>
                  <p className="text-xs text-slate-400">{loc.position.side}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Estimated wait</p>
                <p className="text-xl font-bold" style={{ color: getWaitColor(loc.waitMinutes) }}>
                  {formatWait(loc.waitMinutes)}
                </p>
                {i === 0 && mode === 'fastest' && (
                  <span className="text-[10px] font-medium text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full">FASTEST</span>
                )}
              </div>
            </div>
            {loc.topItems.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-500 mb-1">Popular:</p>
                <p className="text-sm text-slate-300">{loc.topItems.map((item) => item.item).join(', ')}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {loc.categories.map((cat) => (
                <span
                  key={cat}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${category === cat ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Game Timeline */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 py-3 z-50">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {data.gameMoments.map((moment) => (
              <div
                key={moment.label}
                className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all ${
                  moment.active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {moment.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

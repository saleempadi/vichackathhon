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

interface FanData {
  game: { opponent: string; day: string; time: string };
  currentPeriod: string;
  locations: LocationData[];
  allLocations: LocationData[];
  recommendation: { location: string; reason: string; waitMinutes: number } | null;
  gameMoments: { label: string; active: boolean }[];
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
  if (minutes < 2) return '#22c55e';  // green
  if (minutes < 5) return '#f59e0b';  // amber
  return '#ef4444';                    // red
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
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const opponent = searchParams.get('opponent') || 'Portland';
  const dayOfWeek = searchParams.get('dayOfWeek') || 'Friday';
  const gameTime = searchParams.get('gameTime') || '19:05';
  const period = searchParams.get('period') || undefined;

  const fetchData = useCallback(() => {
    const url = new URL('/api/fan', window.location.origin);
    url.searchParams.set('opponent', opponent);
    url.searchParams.set('dayOfWeek', dayOfWeek);
    url.searchParams.set('gameTime', gameTime);
    if (category !== 'All') url.searchParams.set('category', category);
    if (period) url.searchParams.set('period', period);

    fetch(url.toString())
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [opponent, dayOfWeek, gameTime, category, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const scrollToCard = (name: string) => {
    cardRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-white">Save-On-Foods Memorial Centre</h1>
            <p className="text-xs text-slate-400">
              vs {data.game.opponent} &middot; {data.game.day} &middot; {data.currentPeriod}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-blue-400">LIVE</div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse mx-auto mt-0.5" />
          </div>
        </div>
      </div>

      {/* Smart Recommendation Banner */}
      {data.recommendation && (
        <div className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/30 p-4">
          <p className="text-xs text-blue-300 font-medium uppercase tracking-wide mb-1">
            {data.recommendation.reason}
          </p>
          <p className="text-lg font-bold text-white">
            {data.recommendation.location}
          </p>
          <p className="text-2xl font-bold" style={{ color: getWaitColor(data.recommendation.waitMinutes) }}>
            {formatWait(data.recommendation.waitMinutes)}
          </p>
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
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Arena Map (Mobile-Optimized) */}
      <div className="px-4 mt-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
          <svg viewBox="0 0 580 400" className="w-full" style={{ maxHeight: 300 }}>
            {/* Arena outline */}
            <rect x="20" y="20" width="540" height="360" rx="30" ry="30"
              fill="#1e293b" stroke="#334155" strokeWidth="2" />

            {/* Ice rink */}
            <rect x="120" y="120" width="340" height="180" rx="60" ry="60"
              fill="#0f172a" stroke="#1e3a5f" strokeWidth="1.5" />

            {/* Center line */}
            <line x1="290" y1="120" x2="290" y2="300" stroke="#1e3a5f" strokeWidth="1" />

            {/* Center circle */}
            <circle cx="290" cy="210" r="30" fill="none" stroke="#1e3a5f" strokeWidth="1" />

            {/* Goal creases */}
            <rect x="135" y="190" width="20" height="40" rx="4" fill="#0c1929" stroke="#1e3a5f" strokeWidth="1" />
            <rect x="425" y="190" width="20" height="40" rx="4" fill="#0c1929" stroke="#1e3a5f" strokeWidth="1" />

            {/* ICE label */}
            <text x="290" y="215" textAnchor="middle" fill="#1e3a5f" fontSize="14" fontWeight="bold">ICE</text>

            {/* Section labels */}
            <text x="290" y="55" textAnchor="middle" fill="#475569" fontSize="10">MAIN CONCOURSE</text>
            <text x="290" y="375" textAnchor="middle" fill="#475569" fontSize="10">SOUTH END</text>

            {/* Concession location markers */}
            {(data.allLocations || data.locations).map((loc) => {
              const color = getWaitColor(loc.waitMinutes);
              const isFiltered = data.locations.some((l) => l.name === loc.name);
              const opacity = isFiltered ? 1 : 0.3;
              const radius = 22;

              return (
                <g key={loc.name} onClick={() => scrollToCard(loc.name)} className="cursor-pointer">
                  {/* Glow */}
                  <circle cx={loc.position.x} cy={loc.position.y} r={radius + 6}
                    fill={color} opacity={opacity * 0.25} />
                  {/* Main circle */}
                  <circle cx={loc.position.x} cy={loc.position.y} r={radius}
                    fill={color} stroke="#0f172a" strokeWidth="2" opacity={opacity * 0.9} />
                  {/* Wait time label */}
                  <text x={loc.position.x} y={loc.position.y - 2} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="11" fontWeight="bold" opacity={opacity}>
                    {loc.waitMinutes < 1 ? '<1' : `${loc.waitMinutes}`}
                  </text>
                  <text x={loc.position.x} y={loc.position.y + 9} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="7" opacity={opacity}>
                    min
                  </text>
                  {/* Name label */}
                  <text x={loc.position.x} y={loc.position.y + radius + 14} textAnchor="middle"
                    fill="#94a3b8" fontSize="8" fontWeight="600" opacity={opacity}>
                    {loc.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-1 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span>&lt;2 min</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>2-5 min</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>5+ min</span>
            </div>
            <span className="text-slate-600">|</span>
            <span>Tap a stand</span>
          </div>
        </div>
      </div>

      {/* Ranked Location Cards */}
      <div className="px-4 mt-4 space-y-3 pb-24">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          {data.locations.length} locations &middot; Sorted by wait time
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
                <p className="text-xl font-bold" style={{ color: getWaitColor(loc.waitMinutes) }}>
                  {formatWait(loc.waitMinutes)}
                </p>
                {i === 0 && (
                  <span className="text-[10px] font-medium text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded-full">
                    FASTEST
                  </span>
                )}
              </div>
            </div>

            {/* Top Items */}
            {loc.topItems.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-slate-500 mb-1">Popular:</p>
                <p className="text-sm text-slate-300">
                  {loc.topItems.map((item) => item.item).join(', ')}
                </p>
              </div>
            )}

            {/* Category Badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {loc.categories.map((cat) => (
                <span
                  key={cat}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    category === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Game Timeline - Fixed Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 py-3 z-50">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {data.gameMoments.map((moment) => (
              <div
                key={moment.label}
                className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all ${
                  moment.active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-500'
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

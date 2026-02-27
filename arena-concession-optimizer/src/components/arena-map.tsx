'use client';

interface ArenaMapProps {
  trafficData: { location: string; value: number }[];
}

function getTrafficColor(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio > 0.75) return '#ef4444'; // red
  if (ratio > 0.5) return '#f59e0b'; // amber
  if (ratio > 0.25) return '#eab308'; // yellow
  return '#22c55e'; // green
}

function getTrafficLabel(value: number, max: number): string {
  const ratio = max > 0 ? value / max : 0;
  if (ratio > 0.75) return 'High';
  if (ratio > 0.5) return 'Medium-High';
  if (ratio > 0.25) return 'Medium';
  return 'Low';
}

// Approximate positions for each concession within the arena layout
const locationPositions: Record<string, { x: number; y: number; side: string }> = {
  'Island Canteen': { x: 160, y: 85, side: 'Main Concourse (N)' },
  'Island Slice': { x: 380, y: 85, side: 'Main Concourse (N)' },
  'Phillips Bar': { x: 520, y: 200, side: 'East Side' },
  'Portable Stations': { x: 40, y: 200, side: 'West Side' },
  'ReMax Fan Deck': { x: 280, y: 330, side: 'South End' },
  'TacoTacoTaco': { x: 280, y: 85, side: 'Main Concourse (N)' },
};

export function ArenaMap({ trafficData }: ArenaMapProps) {
  const max = Math.max(...trafficData.map(d => d.value), 1);
  const trafficMap = new Map(trafficData.map(d => [d.location, d.value]));

  return (
    <div className="relative">
      <svg viewBox="0 0 580 400" className="w-full" style={{ maxHeight: 420 }}>
        {/* Arena outline */}
        <rect x="20" y="20" width="540" height="360" rx="30" ry="30"
          fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />

        {/* Ice rink */}
        <rect x="120" y="120" width="340" height="180" rx="60" ry="60"
          fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1.5" />

        {/* Center line */}
        <line x1="290" y1="120" x2="290" y2="300" stroke="#7dd3fc" strokeWidth="1" />

        {/* Center circle */}
        <circle cx="290" cy="210" r="30" fill="none" stroke="#7dd3fc" strokeWidth="1" />

        {/* Goal creases */}
        <rect x="135" y="190" width="20" height="40" rx="4" fill="#bae6fd" stroke="#7dd3fc" strokeWidth="1" />
        <rect x="425" y="190" width="20" height="40" rx="4" fill="#bae6fd" stroke="#7dd3fc" strokeWidth="1" />

        {/* "ICE" label */}
        <text x="290" y="215" textAnchor="middle" fill="#7dd3fc" fontSize="14" fontWeight="bold">ICE</text>

        {/* Section labels */}
        <text x="290" y="55" textAnchor="middle" fill="#64748b" fontSize="10">MAIN CONCOURSE</text>
        <text x="290" y="375" textAnchor="middle" fill="#64748b" fontSize="10">SOUTH END</text>

        {/* Concession location markers */}
        {Object.entries(locationPositions).map(([name, pos]) => {
          const value = trafficMap.get(name) || 0;
          const color = getTrafficColor(value, max);
          const radius = 18 + (value / max) * 12;

          return (
            <g key={name}>
              {/* Glow effect */}
              <circle cx={pos.x} cy={pos.y} r={radius + 4} fill={color} opacity={0.2} />
              {/* Main circle */}
              <circle cx={pos.x} cy={pos.y} r={radius} fill={color} stroke="white" strokeWidth="2" opacity={0.9} />
              {/* Value label */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="10" fontWeight="bold">
                {value > 0 ? value.toLocaleString() : '?'}
              </text>
              {/* Name label */}
              <text x={pos.x} y={pos.y + radius + 14} textAnchor="middle"
                fill="#334155" fontSize="9" fontWeight="600">
                {name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Med-High</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Tooltip } from 'recharts';

interface HeatmapProps {
  data: { location: string; hour: number; total_items: number }[];
}

function getColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio > 0.75) return 'bg-red-500';
  if (ratio > 0.5) return 'bg-orange-400';
  if (ratio > 0.25) return 'bg-yellow-300';
  if (ratio > 0) return 'bg-green-200';
  return 'bg-gray-100';
}

function getTextColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio > 0.5) return 'text-white';
  return 'text-gray-700';
}

export function Heatmap({ data }: HeatmapProps) {
  const locations = [...new Set(data.map(d => d.location))].sort();
  const hours = [...new Set(data.map(d => d.hour))].sort((a, b) => a - b);
  const max = Math.max(...data.map(d => d.total_items));

  const lookup = new Map<string, number>();
  data.forEach(d => lookup.set(`${d.location}|${d.hour}`, d.total_items));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left p-2 font-medium text-gray-600 min-w-[140px]">Location</th>
            {hours.map(h => (
              <th key={h} className="p-2 font-medium text-gray-600 text-center min-w-[50px]">
                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {locations.map(loc => (
            <tr key={loc}>
              <td className="p-2 font-medium text-gray-700 whitespace-nowrap">{loc}</td>
              {hours.map(h => {
                const val = lookup.get(`${loc}|${h}`) || 0;
                return (
                  <td key={h} className="p-1">
                    <div
                      className={`rounded p-1 text-center ${getColor(val, max)} ${getTextColor(val, max)} cursor-default`}
                      title={`${loc} at ${h}:00 — ${val.toLocaleString()} items`}
                    >
                      {val > 0 ? val.toLocaleString() : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 mt-4 text-xs items-center justify-end text-gray-500">
        <span>Low</span>
        <div className="w-6 h-4 bg-green-200 rounded" />
        <div className="w-6 h-4 bg-yellow-300 rounded" />
        <div className="w-6 h-4 bg-orange-400 rounded" />
        <div className="w-6 h-4 bg-red-500 rounded" />
        <span>High</span>
      </div>
    </div>
  );
}

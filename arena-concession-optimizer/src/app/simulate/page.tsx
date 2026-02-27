'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArenaMap } from '@/components/arena-map';

interface SimLocationSnapshot {
  orders_in_bucket: number;
  qty_in_bucket: number;
  orders_per_min: number;
  utilization: number;
  wait_minutes: number;
  crowd_index: number;
  top_items: { item: string; qty: number }[];
}

interface SimSnapshot {
  sim_time: string;
  bucket_start: string;
  bucket_end: string;
  locations: Record<string, SimLocationSnapshot>;
}

export default function SimulationPage() {
  const [date, setDate] = useState<string>('2025-02-21');
  const [speed, setSpeed] = useState<number>(30);
  const [bucketSeconds, setBucketSeconds] = useState<number>(300);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    if (!running) return;

    const params = new URLSearchParams();
    params.set('date', date);
    params.set('speed', String(speed));
    params.set('bucket', String(bucketSeconds));

    const es = new EventSource(`/api/simulate?${params.toString()}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SimSnapshot;
        if ((data as any).error) {
          console.error('Simulation error', data);
          return;
        }
        setSnapshot(data);
      } catch (err) {
        console.error('Failed to parse simulation event', err);
      }
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
    };

    return () => {
      es.close();
    };
  }, [date, speed, bucketSeconds, running]);

  const trafficData = useMemo(
    () =>
      snapshot
        ? Object.entries(snapshot.locations).map(([location, loc]) => ({
            location,
            // Use crowd_index (0-1) scaled to 0-100 for the arena map visualization
            value: Math.round(loc.crowd_index * 100),
          }))
        : [],
    [snapshot],
  );

  const currentTimeLabel = snapshot
    ? new Date(snapshot.sim_time).toLocaleTimeString('en-CA', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Simulation Mode</h1>
        <p className="text-gray-500 mt-1">
          Replay a historical game day as live concession demand with estimated wait
          times by stand.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Simulation Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Game Date (YYYY-MM-DD)
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
                placeholder="2025-02-21"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Speed (sim seconds / real second)
              </label>
              <input
                type="number"
                value={speed}
                min={1}
                max={120}
                onChange={(e) => setSpeed(Number(e.target.value) || 1)}
                className="border rounded-md px-2 py-1 text-sm w-24"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Bucket Size (seconds)
              </label>
              <select
                value={bucketSeconds}
                onChange={(e) => setBucketSeconds(Number(e.target.value))}
                className="border rounded-md px-2 py-1 text-sm"
              >
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRunning((prev) => !prev)}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white ${
                  running ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {running ? 'Stop Simulation' : 'Start Simulation'}
              </button>
              <span className="text-xs text-gray-500">
                Sim time: <span className="font-mono">{currentTimeLabel}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Arena Heatmap (Estimated Crowd)</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot ? (
              <ArenaMap trafficData={trafficData} />
            ) : (
              <p className="text-sm text-gray-500">
                Start a simulation to see live arena congestion by stand.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stand Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2">Location</th>
                    <th className="pb-2 text-right">Orders/min</th>
                    <th className="pb-2 text-right">Wait (min)</th>
                    <th className="pb-2 text-right">Crowd</th>
                    <th className="pb-2">Top Items</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(snapshot.locations).map(([location, loc]) => (
                    <tr key={location} className="border-b last:border-0">
                      <td className="py-2 font-medium">{location}</td>
                      <td className="py-2 text-right">
                        {loc.orders_per_min.toFixed(2)}
                      </td>
                      <td className="py-2 text-right">
                        {loc.wait_minutes.toFixed(1)}
                      </td>
                      <td className="py-2 text-right">
                        {(loc.crowd_index * 100).toFixed(0)}%
                      </td>
                      <td className="py-2">
                        {loc.top_items.map((it) => it.item).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">
                Live per-stand metrics will appear here once the simulation is running.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


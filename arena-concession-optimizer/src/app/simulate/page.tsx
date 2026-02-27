'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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
  const [gameDates, setGameDates] = useState<{ date: string; day?: string; opponent?: string }[]>([]);
  const [date, setDate] = useState<string>('');
  const [speed, setSpeed] = useState<number>(30);
  const [bucketSeconds, setBucketSeconds] = useState<number>(300);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [puckDropTime, setPuckDropTime] = useState<string | null>(null);
  const elapsedMsRef = useRef<number>(0);
  const [elapsedDisplay, setElapsedDisplay] = useState<string>('00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const simTimeMsRef = useRef<number>(0);
  const lastTickRealRef = useRef<number>(0);
  const [displaySimTimeMs, setDisplaySimTimeMs] = useState<number>(0);

  // Fetch available game dates (B)
  useEffect(() => {
    fetch('/api/game-dates')
      .then((res) => res.json())
      .then((data: { dates?: { date: string; day?: string; opponent?: string }[] }) => {
        const list = data.dates ?? [];
        setGameDates(list);
        if (list.length > 0 && !date) {
          setDate(list[list.length - 1].date);
        }
      })
      .catch(() => setGameDates([]));
  }, []);

  // Puck drop for selected date (D)
  useEffect(() => {
    if (!date) return;
    fetch(`/api/puck-drop?date=${encodeURIComponent(date)}`)
      .then((res) => res.ok ? res.json() : { puck_drop_time: null })
      .then((data: { puck_drop_time?: string | null }) => setPuckDropTime(data.puck_drop_time ?? null))
      .catch(() => setPuckDropTime(null));
  }, [date]);

  // Real-time elapsed + smooth sim-time stopwatch: tick every 100ms, advance sim time by (deltaReal * speed)
  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsedMsRef.current;
      lastTickRealRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const now = Date.now();
        elapsedMsRef.current = now - startTimeRef.current;
        const totalSec = Math.floor(elapsedMsRef.current / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        setElapsedDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);

        const deltaRealMs = now - lastTickRealRef.current;
        lastTickRealRef.current = now;
        simTimeMsRef.current += deltaRealMs * speed;
        setDisplaySimTimeMs(simTimeMsRef.current);
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, speed]);

  const resetElapsed = () => {
    elapsedMsRef.current = 0;
    setElapsedDisplay('00:00');
  };

  useEffect(() => {
    if (!running) return;
    resetElapsed();
  }, [date, speed, bucketSeconds]);

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
        if ((data as unknown as { error?: string }).error) {
          return;
        }
        setSnapshot(data);
        simTimeMsRef.current = new Date(data.sim_time).getTime();
        lastTickRealRef.current = Date.now();
        setDisplaySimTimeMs(simTimeMsRef.current);
      } catch {
        // ignore
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
            value: Math.round(loc.crowd_index * 100),
          }))
        : [],
    [snapshot],
  );

  const simTimeMs = (displaySimTimeMs || (snapshot ? new Date(snapshot.sim_time).getTime() : 0)) || null;
  const smoothSimTimeDisplay = displaySimTimeMs
    ? new Date(displaySimTimeMs).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : (snapshot ? new Date(snapshot.sim_time).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—');
  const puckDropMs = useMemo(() => {
    if (!date || !puckDropTime) return null;
    const [h, m] = puckDropTime.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }, [date, puckDropTime]);

  const gameStarted = simTimeMs != null && puckDropMs != null && simTimeMs >= puckDropMs;
  const puckDropInSim = useMemo(() => {
    if (!snapshot || !puckDropMs || gameStarted) return null;
    const simMs = simTimeMs ?? new Date(snapshot.sim_time).getTime();
    const diffMs = puckDropMs - simMs;
    if (diffMs <= 0) return null;
    const totalMin = Math.floor(diffMs / 60000);
    const min = totalMin % 60;
    const hours = Math.floor(totalMin / 60);
    if (hours > 0) return `${hours}:${String(min).padStart(2, '0')}`;
    return `${min} min`;
  }, [snapshot, puckDropMs, gameStarted, simTimeMs]);

  const realTickMs = (bucketSeconds * 1000) / speed;
  const realTickSec = realTickMs / 1000;
  const oneRealSecEqualsSimSec = speed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Simulation Mode</h1>
        <p className="text-gray-500 mt-1">
          Replay a historical game day as live concession demand with estimated wait times by stand.
        </p>
      </div>

      {/* (A) What does this mean? — collapsible help */}
      <Card>
        <CardHeader className="pb-2">
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            className="flex items-center justify-between w-full text-left"
          >
            <CardTitle className="text-base">What does this mean?</CardTitle>
            <span className="text-gray-500">{helpOpen ? '▼' : '▶'}</span>
          </button>
        </CardHeader>
        {helpOpen && (
          <CardContent className="pt-0 space-y-2 text-sm text-gray-600">
            <p>
              <strong>Bucket size</strong> is how much simulated game time each tick represents (e.g. 5 minutes).
              One tick = one bucket of game time.
            </p>
            <p>
              <strong>Speed</strong> is how fast simulated time advances relative to real time. The formula:{' '}
              <code className="bg-gray-100 px-1 rounded">real_tick_ms = bucket_ms ÷ speed</code>.
            </p>
            <p className="font-medium">
              Example: bucket = 300 s (5 min), speed = 60× → every 5 simulated minutes is emitted every{' '}
              {bucketSeconds === 300 && speed === 60 ? '5' : (300 / 60).toFixed(1)} s real time (300÷60 = 5 s).
            </p>
            <p>
              With your current settings: 1 real second = <strong>{oneRealSecEqualsSimSec} simulated seconds</strong>.
              Emitting every <strong>{realTickSec.toFixed(1)} s</strong> real time.
            </p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulation Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Game date</label>
              <select
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm min-w-[200px]"
              >
                {gameDates.length === 0 ? (
                  <option value="">No dates in DB</option>
                ) : (
                  <>
                    {gameDates.map((d) => {
                      const label = [d.date, d.day && d.opponent ? `${d.day} vs ${d.opponent}` : d.day || d.opponent].filter(Boolean).join(' — ') || d.date;
                      return (
                        <option key={d.date} value={d.date}>
                          {label}
                        </option>
                      );
                    })}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Speed (×)</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Bucket size</label>
              <select
                value={bucketSeconds}
                onChange={(e) => setBucketSeconds(Number(e.target.value))}
                className="border rounded-md px-2 py-1 text-sm"
              >
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setRunning((prev) => !prev)}
                disabled={!date || gameDates.length === 0}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white ${
                  running ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {running ? 'Stop Simulation' : 'Start Simulation'}
              </button>
              {/* (C) Sim time first (smooth stopwatch), then real-time clock */}
              <span className="text-xs text-gray-500">
                Sim time: <span className="font-mono">{smoothSimTimeDisplay}</span>
              </span>
              <div className="flex flex-col text-xs text-gray-600">
                <span>Real time: <span className="font-mono font-medium">{elapsedDisplay}</span></span>
                <span>Emitting every {realTickSec.toFixed(1)} s</span>
              </div>
            </div>
          </div>

          {/* (D) Puck drop indicator */}
          {puckDropTime != null && (
            <div className="mt-3 flex items-center gap-2">
              {gameStarted ? (
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                  Game started
                </span>
              ) : (
                <>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                    Pre-game
                  </span>
                  {puckDropInSim != null && (
                    <span className="text-xs text-gray-500">
                      Puck drop in: {puckDropInSim} (simulated)
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {!date && gameDates.length === 0 && (
            <p className="mt-3 text-sm text-amber-600">No game dates in database. Run the seed script first.</p>
          )}
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
              <p className="text-sm text-gray-500">Start a simulation to see live arena congestion by stand.</p>
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
                    <th className="pb-2 text-right">Est. wait (min)</th>
                    <th className="pb-2 text-right">Crowd</th>
                    <th className="pb-2">Top items</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(snapshot.locations).map(([location, loc]) => (
                    <tr key={location} className="border-b last:border-0">
                      <td className="py-2 font-medium">{location}</td>
                      <td className="py-2 text-right">{loc.orders_per_min.toFixed(2)}</td>
                      <td className="py-2 text-right">{loc.wait_minutes.toFixed(1)}</td>
                      <td className="py-2 text-right">{(loc.crowd_index * 100).toFixed(0)}%</td>
                      <td className="py-2">{loc.top_items.map((it) => it.item).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">Live per-stand metrics appear when the simulation is running.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

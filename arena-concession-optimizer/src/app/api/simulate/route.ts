import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

interface SimBucketLocation {
  location: string;
  ordersInBucket: number;
  qtyInBucket: number;
  topItems: Record<string, number>;
}

interface SimBucket {
  startMs: number;
  endMs: number;
  locations: Record<string, SimBucketLocation>;
}

function buildBuckets(gameDate: string, bucketSeconds: number): SimBucket[] {
  const db = getDb();

  const rows = db
    .prepare(
      `
      SELECT timestamp, location, qty, item, category
      FROM transactions
      WHERE date = ? AND is_refund = 0
      ORDER BY timestamp
    `,
    )
    .all(gameDate) as {
    timestamp: string;
    location: string;
    qty: number;
    item: string;
    category: string;
  }[];

  if (!rows.length) {
    return [];
  }

  const bucketMs = bucketSeconds * 1000;
  const parseTs = (ts: string) => new Date(ts).getTime();
  const firstTs = parseTs(rows[0].timestamp);

  const bucketMap = new Map<number, SimBucket>();

  for (const row of rows) {
    const tsMs = parseTs(row.timestamp);
    const offset = Math.floor((tsMs - firstTs) / bucketMs);
    const startMs = firstTs + offset * bucketMs;
    const endMs = startMs + bucketMs;

    let bucket = bucketMap.get(startMs);
    if (!bucket) {
      bucket = {
        startMs,
        endMs,
        locations: {},
      };
      bucketMap.set(startMs, bucket);
    }

    let locAgg = bucket.locations[row.location];
    if (!locAgg) {
      locAgg = {
        location: row.location,
        ordersInBucket: 0,
        qtyInBucket: 0,
        topItems: {},
      };
      bucket.locations[row.location] = locAgg;
    }

    const qty = Math.abs(row.qty ?? 0);
    if (qty > 0) {
      locAgg.ordersInBucket += 1;
      locAgg.qtyInBucket += qty;
      locAgg.topItems[row.item] = (locAgg.topItems[row.item] || 0) + qty;
    }
  }

  return Array.from(bucketMap.values()).sort((a, b) => a.startMs - b.startMs);
}

function toSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const speedParam = searchParams.get('speed');
  const bucketParam = searchParams.get('bucket');
  const windowParam = searchParams.get('window'); // currently unused, kept for future rolling-window logic

  if (!date) {
    return new Response(
      toSSE({ error: 'Missing required date=YYYY-MM-DD parameter' }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    );
  }

  // Simulation parameters (with sensible defaults)
  const speed = Math.max(1, Number(speedParam) || 30); // simulated seconds per real second
  const bucketSeconds = Math.max(30, Number(bucketParam) || 300); // bucket size in seconds
  const _windowSeconds = Math.max(60, Number(windowParam) || 300);

  const buckets = buildBuckets(date, bucketSeconds);
  if (!buckets.length) {
    return new Response(
      toSSE({ error: 'No transactions found for that date' }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    );
  }

  const bucketDurationMinutes = bucketSeconds / 60;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let index = 0;

      const intervalMs = Math.max(200, (bucketSeconds * 1000) / speed);

      const timer = setInterval(() => {
        if (index >= buckets.length) {
          clearInterval(timer);
          controller.close();
          return;
        }

        const bucket = buckets[index++];

        // Simple, tunable wait-time model from the simulation plan
        const registersPerStand = 2;
        const serviceRatePerRegister = 0.6; // orders/min
        const waitScaleMinutes = 12; // at utilization ~1.0
        const serviceCapacity = registersPerStand * serviceRatePerRegister;

        const locations: Record<
          string,
          {
            orders_in_bucket: number;
            qty_in_bucket: number;
            orders_per_min: number;
            utilization: number;
            wait_minutes: number;
            crowd_index: number;
            top_items: { item: string; qty: number }[];
          }
        > = {};

        let maxUtilization = 0;

        for (const [locName, loc] of Object.entries(bucket.locations)) {
          const ordersPerMin =
            loc.ordersInBucket / bucketDurationMinutes || 0;
          const utilization = Math.min(
            1.5,
            serviceCapacity > 0 ? ordersPerMin / serviceCapacity : 0,
          );
          const waitMinutes =
            Math.max(0, utilization - 0.6) * waitScaleMinutes;

          maxUtilization = Math.max(maxUtilization, utilization);

          const topItemsSorted = Object.entries(loc.topItems)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([item, qty]) => ({ item, qty }));

          locations[locName] = {
            orders_in_bucket: loc.ordersInBucket,
            qty_in_bucket: loc.qtyInBucket,
            orders_per_min: Number(ordersPerMin.toFixed(2)),
            utilization: Number(utilization.toFixed(2)),
            wait_minutes: Number(waitMinutes.toFixed(1)),
            crowd_index: 0, // backfilled below
            top_items: topItemsSorted,
          };
        }

        // Normalize crowd index from utilization (0-1)
        for (const loc of Object.values(locations)) {
          const normUtil =
            maxUtilization > 0 ? loc.utilization / maxUtilization : 0;
          // Blend utilization and wait time into a single "crowd" index
          const waitFactor = Math.min(loc.wait_minutes / 10, 1);
          const crowd = Math.max(0, Math.min((normUtil + waitFactor) / 2, 1));
          loc.crowd_index = Number(crowd.toFixed(2));
        }

        const payload = {
          sim_time: new Date(bucket.endMs).toISOString(),
          bucket_start: new Date(bucket.startMs).toISOString(),
          bucket_end: new Date(bucket.endMs).toISOString(),
          locations,
        };

        controller.enqueue(encoder.encode(toSSE(payload)));
      }, intervalMs);
    },
    cancel() {
      // Nothing else to do; the interval is cleaned up in start()
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}


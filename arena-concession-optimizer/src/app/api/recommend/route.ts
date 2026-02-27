import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  getDemandCurve,
  getCategoryMixForFan,
} from '@/lib/queries';
import { estimateWaitForLocation } from '@/lib/queueing';

export const runtime = 'nodejs';

function getGamePeriods(gameTimeStr: string) {
  const [hourStr, minStr] = gameTimeStr.split(':');
  const gameHour = parseInt(hourStr);
  const gameMin = parseInt(minStr);
  const gameStartMin = gameHour * 60 + gameMin;

  return [
    { label: 'Doors Open', startMin: gameStartMin - 90, endMin: gameStartMin - 60 },
    { label: 'Pre-Game', startMin: gameStartMin - 60, endMin: gameStartMin },
    { label: '1st Period', startMin: gameStartMin, endMin: gameStartMin + 20 },
    { label: '1st Intermission', startMin: gameStartMin + 20, endMin: gameStartMin + 38 },
    { label: '2nd Period', startMin: gameStartMin + 38, endMin: gameStartMin + 58 },
    { label: '2nd Intermission', startMin: gameStartMin + 58, endMin: gameStartMin + 76 },
    { label: '3rd Period', startMin: gameStartMin + 76, endMin: gameStartMin + 96 },
    { label: 'Post-Game', startMin: gameStartMin + 96, endMin: gameStartMin + 130 },
  ];
}

function periodToTimeBucket(period: string, gameTimeStr: string) {
  const [hourStr, minStr] = gameTimeStr.split(':');
  const gameHour = parseInt(hourStr);
  const gameMin = parseInt(minStr);
  const gameStartMin = gameHour * 60 + gameMin;

  const periodMidpoints: Record<string, number> = {
    'Doors Open': gameStartMin - 75,
    'Pre-Game': gameStartMin - 30,
    '1st Period': gameStartMin + 10,
    '1st Intermission': gameStartMin + 29,
    '2nd Period': gameStartMin + 48,
    '2nd Intermission': gameStartMin + 67,
    '3rd Period': gameStartMin + 86,
    'Post-Game': gameStartMin + 100,
    'Before Doors': gameStartMin - 75,
  };

  const midpoint = periodMidpoints[period] ?? gameStartMin;
  const hour = Math.floor(midpoint / 60);
  const minBucket = Math.floor((midpoint % 60) / 10) * 10;
  return { hour, minBucket };
}

function computeWaitByLocation(
  opponent: string,
  dayOfWeek: string,
  gameTime: string,
  period: string,
): Map<string, number> {
  const demandCurve = getDemandCurve(opponent, dayOfWeek) as any[];
  const categoryMix = getCategoryMixForFan(opponent, dayOfWeek) as any[];

  const { hour: targetHour, minBucket: targetMinBucket } = periodToTimeBucket(
    period,
    gameTime,
  );

  const catMixByLocation: Record<string, { category: string; avg_items: number }[]> =
    {};
  for (const row of categoryMix) {
    if (!catMixByLocation[row.location]) catMixByLocation[row.location] = [];
    catMixByLocation[row.location].push({
      category: row.category,
      avg_items: row.avg_items,
    });
  }

  const demandByLocation: Record<string, number> = {};
  const peakDemandByLocation: Record<string, number> = {};

  for (const row of demandCurve) {
    const key = row.location;
    if (!peakDemandByLocation[key] || row.avg_items > peakDemandByLocation[key]) {
      peakDemandByLocation[key] = row.avg_items;
    }
    if (row.hour === targetHour && row.min_bucket === targetMinBucket) {
      demandByLocation[key] = (demandByLocation[key] || 0) + row.avg_items;
    }
  }

  if (Object.keys(demandByLocation).length === 0) {
    const targetTotal = targetHour * 60 + targetMinBucket;
    const bestMatch: Record<string, { diff: number; items: number }> = {};
    for (const row of demandCurve) {
      const bucketTotal = row.hour * 60 + row.min_bucket;
      const diff = Math.abs(bucketTotal - targetTotal);
      if (!bestMatch[row.location] || diff < bestMatch[row.location].diff) {
        bestMatch[row.location] = { diff, items: row.avg_items };
      }
    }
    for (const [loc, match] of Object.entries(bestMatch)) {
      demandByLocation[loc] = match.items;
    }
  }

  const waitByLocation = new Map<string, number>();

  for (const [location, demand] of Object.entries(demandByLocation)) {
    const arrivalRate = demand / 10; // items per minute from 10-min bucket
    const catMix = catMixByLocation[location] || [];
    const peakRate = (peakDemandByLocation[location] || 1) / 10;

    const estimate = estimateWaitForLocation(location, arrivalRate, catMix, peakRate);
    waitByLocation.set(location, estimate.waitMinutes);
  }

  return waitByLocation;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    zone_id,
    desired_item,
    max_minutes,
    sim_time,
    opponent = 'Portland',
    dayOfWeek = 'Friday',
    gameTime = '19:05',
    period = '1st Intermission',
  } = body as {
    zone_id?: string;
    desired_item?: string;
    max_minutes?: number;
    sim_time?: string;
    opponent?: string;
    dayOfWeek?: string;
    gameTime?: string;
    period?: string;
  };

  if (!zone_id) {
    return NextResponse.json({ error: 'zone_id is required' }, { status: 400 });
  }

  if (!desired_item) {
    return NextResponse.json(
      { error: 'desired_item is required' },
      { status: 400 },
    );
  }

  const db = getDb();

  // Walking distances from zone -> stand
  const zoneDistances = db
    .prepare(
      'SELECT location, distance_m FROM zone_distances WHERE zone_id = ?',
    )
    .all(zone_id) as { location: string; distance_m: number }[];

  if (!zoneDistances.length) {
    return NextResponse.json(
      { error: `Unknown or unmapped zone_id: ${zone_id}` },
      { status: 400 },
    );
  }

  const distanceByLocation = new Map<string, number>();
  for (const row of zoneDistances) {
    distanceByLocation.set(row.location, row.distance_m);
  }

  // Which stands historically sell the desired item?
  const itemLocations = db
    .prepare(
      `
      SELECT DISTINCT location
      FROM item_availability
      WHERE item = ?
    `,
    )
    .all(desired_item) as { location: string }[];

  if (!itemLocations.length) {
    return NextResponse.json(
      { error: `No historical stands found for item "${desired_item}"` },
      { status: 404 },
    );
  }

  // Category of the desired item (for alternatives)
  const itemCategoryRow = db
    .prepare(
      `
      SELECT category
      FROM transactions
      WHERE item = ? AND is_refund = 0
      GROUP BY category
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `,
    )
    .get(desired_item) as { category?: string } | undefined;

  const desiredCategory = itemCategoryRow?.category;

  // Wait estimates per stand based on the same demand curve model as /api/fan
  const waitByLocation = computeWaitByLocation(
    opponent,
    dayOfWeek,
    gameTime,
    period,
  );

  const WALK_SPEED_M_PER_MIN = 80;

  type Recommendation = {
    location: string;
    walk_minutes: number;
    wait_minutes: number;
    round_trip_minutes: number;
    confidence: 'LOW' | 'MED' | 'HIGH';
  };

  const recommendations: Recommendation[] = [];

  for (const row of itemLocations) {
    const distance = distanceByLocation.get(row.location);
    if (!distance) continue;

    const walkMinutes = distance / WALK_SPEED_M_PER_MIN;
    const waitMinutes = waitByLocation.get(row.location) ?? 2;
    const roundTrip = 2 * walkMinutes + waitMinutes;

    const utilizationLike = Math.min(waitMinutes / 8, 1);
    let confidence: Recommendation['confidence'] = 'MED';
    if (utilizationLike < 0.4) confidence = 'HIGH';
    else if (utilizationLike > 0.8) confidence = 'LOW';

    recommendations.push({
      location: row.location,
      walk_minutes: Number(walkMinutes.toFixed(1)),
      wait_minutes: Number(waitMinutes.toFixed(1)),
      round_trip_minutes: Number(roundTrip.toFixed(1)),
      confidence,
    });
  }

  recommendations.sort((a, b) => a.round_trip_minutes - b.round_trip_minutes);

  const best = recommendations[0] || null;

  type Alternative = {
    item: string;
    location: string;
    round_trip_minutes: number;
    reason: string;
  };

  const alternatives: Alternative[] = [];

  if (
    max_minutes != null &&
    best &&
    best.round_trip_minutes > max_minutes &&
    desiredCategory
  ) {
    const altRows = db
      .prepare(
        `
        SELECT DISTINCT t.item, t.location
        FROM transactions t
        WHERE t.category = ? AND t.item != ? AND t.is_refund = 0
      `,
      )
      .all(desiredCategory, desired_item) as {
      item: string;
      location: string;
    }[];

    for (const alt of altRows) {
      const distance = distanceByLocation.get(alt.location);
      if (!distance) continue;

      const walkMinutes = distance / WALK_SPEED_M_PER_MIN;
      const waitMinutes = waitByLocation.get(alt.location) ?? best.wait_minutes;
      const roundTrip = 2 * walkMinutes + waitMinutes;

      if (roundTrip >= best.round_trip_minutes) continue;
      if (roundTrip > max_minutes) continue;

      alternatives.push({
        item: alt.item,
        location: alt.location,
        round_trip_minutes: Number(roundTrip.toFixed(1)),
        reason: 'Similar category, lower estimated total time',
      });
    }

    alternatives.sort(
      (a, b) => a.round_trip_minutes - b.round_trip_minutes,
    );
  }

  const response = {
    recommendations,
    alternatives: alternatives.slice(0, 5),
    notes: [
      'Wait times are estimated from historical order rates and assumed service capacity.',
      `Routing uses approximate walking distances from ${zone_id} based on arena layout assumptions.`,
      sim_time ? `Simulated time context: ${sim_time}` : 'Simulated time not specified.',
    ],
  };

  return NextResponse.json(response);
}


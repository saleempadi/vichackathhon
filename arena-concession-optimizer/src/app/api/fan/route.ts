import { NextRequest, NextResponse } from 'next/server';
import {
  getDemandCurve,
  getCategoryMixForFan,
  getLocationCategories,
  getTopItemsByLocation,
  getHistoricalCapacityPerStand,
  getSeatZones,
} from '@/lib/queries';

// Location positions for the arena map
const locationPositions: Record<string, { x: number; y: number; side: string }> = {
  'Island Canteen': { x: 160, y: 85, side: 'Main Concourse (N)' },
  'Island Slice': { x: 380, y: 85, side: 'Main Concourse (N)' },
  'Phillips Bar': { x: 520, y: 200, side: 'East Side' },
  'Portable Stations': { x: 40, y: 200, side: 'West Side' },
  'ReMax Fan Deck': { x: 280, y: 330, side: 'South End' },
  'TacoTacoTaco': { x: 280, y: 85, side: 'Main Concourse (N)' },
};

const BASE_WAIT = 1.2;
const WAIT_SCALE = 6;
/** Softer effective capacity so utilization is higher → more visible wait spread (e.g. 2–8+ min) */
const CAPACITY_FACTOR = 0.65;
const WAIT_CAP_MINUTES = 10;
const WALK_SPEED_M_PER_MIN = 80;

// Game period definitions relative to game start time
function getGamePeriods(gameTimeStr: string) {
  const [hourStr, minStr] = gameTimeStr.split(':');
  const gameHour = parseInt(hourStr);
  const gameMin = parseInt(minStr);
  const gameStartMin = gameHour * 60 + gameMin; // minutes from midnight

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

function getCurrentPeriod(periods: ReturnType<typeof getGamePeriods>, nowMin: number) {
  for (const p of periods) {
    if (nowMin >= p.startMin && nowMin < p.endMin) return p.label;
  }
  if (nowMin < periods[0].startMin) return 'Before Doors';
  return 'Post-Game';
}

// Map a period label to the approximate clock hour & 10-min bucket
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

// Simplified category grouping for the filter UI
function simplifyCategory(category: string): string {
  if (category === 'Beer') return 'Beer';
  if (category === 'Wine Cider & Coolers' || category === 'Liquor') return 'Drinks';
  if (category === 'Food' || category === 'Food - Walking Taco') return 'Food';
  if (category === 'NA Bev' || category === 'NA Bev PST Exempt') return 'Drinks';
  if (category === 'Snacks' || category === 'Snack' || category === 'Sweets') return 'Snacks';
  return 'Other';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const opponent = searchParams.get('opponent') || 'Portland';
  const dayOfWeek = searchParams.get('dayOfWeek') || 'Friday';
  const gameTime = searchParams.get('gameTime') || '19:05';
  const categoryFilter = searchParams.get('category') || null;
  const periodOverride = searchParams.get('period') || null;
  const zoneId = searchParams.get('zone_id') || null;
  const preferredStand = searchParams.get('preferred_stand') || null;
  const simTimeIso = searchParams.get('sim_time') || null;

  try {
    const capacityPerStand = getHistoricalCapacityPerStand();

    // Fetch all data
    const demandCurve = getDemandCurve(opponent, dayOfWeek) as any[];
    const categoryMix = getCategoryMixForFan(opponent, dayOfWeek) as any[];
    const locationCats = getLocationCategories() as any[];
    const topItems = getTopItemsByLocation(opponent, dayOfWeek) as any[];
    const seatZones = getSeatZones();

    // Determine current period or use sim_time for bucket
    let targetHour: number;
    let targetMinBucket: number;
    let currentPeriod: string;

    if (simTimeIso) {
      try {
        const d = new Date(simTimeIso);
        targetHour = d.getHours();
        targetMinBucket = Math.floor(d.getMinutes() / 10) * 10;
        currentPeriod = periodOverride || 'Simulated';
      } catch {
        const periods = getGamePeriods(gameTime);
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        currentPeriod = periodOverride || getCurrentPeriod(periods, nowMin);
        const tb = periodToTimeBucket(currentPeriod, gameTime);
        targetHour = tb.hour;
        targetMinBucket = tb.minBucket;
      }
    } else {
      const periodList = getGamePeriods(gameTime);
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      currentPeriod = periodOverride || getCurrentPeriod(periodList, nowMin);
      const tb = periodToTimeBucket(currentPeriod, gameTime);
      targetHour = tb.hour;
      targetMinBucket = tb.minBucket;
    }

    const periods = getGamePeriods(gameTime);

    // Build category mix by location
    const catMixByLocation: Record<string, { category: string; avg_items: number }[]> = {};
    for (const row of categoryMix) {
      if (!catMixByLocation[row.location]) catMixByLocation[row.location] = [];
      catMixByLocation[row.location].push({ category: row.category, avg_items: row.avg_items });
    }

    // Build location categories (simplified)
    const locCategories: Record<string, string[]> = {};
    for (const row of locationCats) {
      if (!locCategories[row.location]) locCategories[row.location] = [];
      const simple = simplifyCategory(row.category);
      if (!locCategories[row.location].includes(simple)) {
        locCategories[row.location].push(simple);
      }
    }

    // Build top items by location (top 3)
    const topItemsByLoc: Record<string, { item: string; category: string; qty: number }[]> = {};
    for (const row of topItems) {
      if (!topItemsByLoc[row.location]) topItemsByLoc[row.location] = [];
      if (topItemsByLoc[row.location].length < 3) {
        topItemsByLoc[row.location].push({
          item: row.item,
          category: row.category,
          qty: Math.round(row.avg_qty),
        });
      }
    }

    // Build demand by location for the current time bucket
    const demandByLocation: Record<string, number> = {};
    // Also track peak demand for staff estimation
    const peakDemandByLocation: Record<string, number> = {};

    for (const row of demandCurve) {
      const key = row.location;
      // Track peak across all time buckets
      if (!peakDemandByLocation[key] || row.avg_items > peakDemandByLocation[key]) {
        peakDemandByLocation[key] = row.avg_items;
      }
      // Match current time bucket (exact or nearest)
      if (row.hour === targetHour && row.min_bucket === targetMinBucket) {
        demandByLocation[key] = (demandByLocation[key] || 0) + row.avg_items;
      }
    }

    // If no exact match, find nearest bucket per location
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

    // Compute wait times: softer capacity + power curve so many stands show >1 min for demo
    const locations = Object.keys(locationPositions).map((name) => {
      const itemsPer10Min = demandByLocation[name] || 0;
      const itemsPerMin = itemsPer10Min / 10;
      const capacity = capacityPerStand[name] ?? 1.2;
      const effectiveCapacity = capacity * CAPACITY_FACTOR;
      const utilization = effectiveCapacity > 0 ? itemsPerMin / effectiveCapacity : 0;
      const rawWait = BASE_WAIT + Math.pow(Math.min(utilization, 3), 1.2) * WAIT_SCALE;
      const waitMinutes = Math.min(WAIT_CAP_MINUTES, rawWait);
      const waitMinutesRounded = Math.round(waitMinutes * 10) / 10;

      let trafficLevel: 'low' | 'medium' | 'high' = 'low';
      if (waitMinutesRounded >= 5) trafficLevel = 'high';
      else if (waitMinutesRounded >= 2) trafficLevel = 'medium';

      return {
        name,
        waitMinutes: waitMinutesRounded,
        trafficLevel,
        topItems: topItemsByLoc[name] || [],
        categories: locCategories[name] || [],
        position: locationPositions[name],
      };
    });

    // Apply category filter
    let filteredLocations = locations;
    if (categoryFilter && categoryFilter !== 'All') {
      filteredLocations = locations.filter((loc) =>
        loc.categories.includes(categoryFilter)
      );
    }

    // Sort by wait time
    filteredLocations.sort((a, b) => a.waitMinutes - b.waitMinutes);

    // Route-to-stand mode: if preferred_stand set, compute walk from zone and return that stand + top 2 faster alternatives
    let routeToStandResult: {
      preferred: { name: string; walkMinutes: number; waitMinutes: number; roundTripMinutes: number };
      alternatives: { name: string; walkMinutes: number; waitMinutes: number; roundTripMinutes: number }[];
    } | null = null;

    if (preferredStand && zoneId && locationPositions[preferredStand]) {
      try {
        const { getDb } = await import('@/lib/db');
        const db = getDb();
        const zoneDistances = db
          .prepare('SELECT location, distance_m FROM zone_distances WHERE zone_id = ?')
          .all(zoneId) as { location: string; distance_m: number }[];
        const distMap = new Map(zoneDistances.map((r) => [r.location, r.distance_m]));

        const walk = (locName: string) => (distMap.get(locName) ?? 120) / WALK_SPEED_M_PER_MIN;
        const stand = locations.find((l) => l.name === preferredStand);
        if (stand) {
          const walkMin = walk(preferredStand);
          const roundTrip = 2 * walkMin + stand.waitMinutes;
          const others = filteredLocations
            .filter((l) => l.name !== preferredStand)
            .slice(0, 2)
            .map((l) => ({
              name: l.name,
              walkMinutes: walk(l.name),
              waitMinutes: l.waitMinutes,
              roundTripMinutes: 2 * walk(l.name) + l.waitMinutes,
            }));
          routeToStandResult = {
            preferred: {
              name: preferredStand,
              walkMinutes: Math.round(walkMin * 10) / 10,
              waitMinutes: stand.waitMinutes,
              roundTripMinutes: Math.round(roundTrip * 10) / 10,
            },
            alternatives: others.map((o) => ({
              ...o,
              walkMinutes: Math.round(o.walkMinutes * 10) / 10,
              roundTripMinutes: Math.round(o.roundTripMinutes * 10) / 10,
            })),
          };
        }
      } catch {
        routeToStandResult = null;
      }
    }

    // Generate recommendation (find-fastest mode)
    const best = filteredLocations[0];
    const recommendation = best
      ? {
          location: best.name,
          reason: categoryFilter && categoryFilter !== 'All'
            ? `Shortest wait for ${categoryFilter}`
            : 'Shortest wait right now',
          waitMinutes: best.waitMinutes,
        }
      : null;

    // Game moments timeline
    const gameMoments = periods.map((p) => ({
      label: p.label,
      active: p.label === currentPeriod,
    }));

    return NextResponse.json({
      game: { opponent, day: dayOfWeek, time: gameTime },
      currentPeriod,
      locations: filteredLocations,
      allLocations: locations,
      recommendation,
      gameMoments,
      seatZones,
      routeToStand: routeToStandResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

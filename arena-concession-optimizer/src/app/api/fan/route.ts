import { NextRequest, NextResponse } from 'next/server';
import {
  getDemandCurve,
  getCategoryMixForFan,
  getLocationCategories,
  getTopItemsByLocation,
} from '@/lib/queries';
import {
  estimateWaitForLocation,
  blendedServiceRate,
  estimateStaffCount,
} from '@/lib/queueing';

// Location positions for the arena map
const locationPositions: Record<string, { x: number; y: number; side: string }> = {
  'Island Canteen': { x: 160, y: 85, side: 'Main Concourse (N)' },
  'Island Slice': { x: 380, y: 85, side: 'Main Concourse (N)' },
  'Phillips Bar': { x: 520, y: 200, side: 'East Side' },
  'Portable Stations': { x: 40, y: 200, side: 'West Side' },
  'ReMax Fan Deck': { x: 280, y: 330, side: 'South End' },
  'TacoTacoTaco': { x: 280, y: 85, side: 'Main Concourse (N)' },
};

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

  try {
    // Fetch all data
    const demandCurve = getDemandCurve(opponent, dayOfWeek) as any[];
    const categoryMix = getCategoryMixForFan(opponent, dayOfWeek) as any[];
    const locationCats = getLocationCategories() as any[];
    const topItems = getTopItemsByLocation(opponent, dayOfWeek) as any[];

    // Determine current period
    const periods = getGamePeriods(gameTime);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const currentPeriod = periodOverride || getCurrentPeriod(periods, nowMin);

    // Get the time bucket for the current period
    const { hour: targetHour, minBucket: targetMinBucket } = periodToTimeBucket(currentPeriod, gameTime);

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

    // Compute wait times for each location
    const locations = Object.keys(locationPositions).map((name) => {
      const arrivalRate = (demandByLocation[name] || 0) / 10; // items per minute (from 10-min bucket)
      const catMix = catMixByLocation[name] || [];
      const peakRate = (peakDemandByLocation[name] || 1) / 10;
      const categories = locCategories[name] || [];

      const estimate = estimateWaitForLocation(name, arrivalRate, catMix, peakRate);

      return {
        name,
        waitMinutes: estimate.waitMinutes,
        trafficLevel: estimate.trafficLevel,
        topItems: topItemsByLoc[name] || [],
        categories,
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

    // Generate recommendation
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

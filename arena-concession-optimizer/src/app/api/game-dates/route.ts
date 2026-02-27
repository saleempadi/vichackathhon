import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

/** GET /api/game-dates — returns distinct transaction dates with day and opponent for simulation dropdown */
export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT t.date, g.day_of_week, g.opponent
         FROM (SELECT DISTINCT date FROM transactions) t
         LEFT JOIN games g ON g.game_date = t.date
         ORDER BY t.date ASC`,
      )
      .all() as { date: string; day_of_week: string | null; opponent: string | null }[];

    const dates = rows.map((r) => ({
      date: r.date,
      day: r.day_of_week ?? '',
      opponent: r.opponent ?? '',
    }));

    return NextResponse.json({ dates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch game dates';
    return NextResponse.json({ error: message, dates: [] }, { status: 500 });
  }
}

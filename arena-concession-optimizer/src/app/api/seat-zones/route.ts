import { NextResponse } from 'next/server';
import { getSeatZones } from '@/lib/queries';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const zones = getSeatZones();
    return NextResponse.json({ zones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch seat zones';
    return NextResponse.json({ error: message, zones: [] }, { status: 500 });
  }
}

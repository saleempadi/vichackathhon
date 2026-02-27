import { NextRequest, NextResponse } from 'next/server';
import { getPuckDropByDate } from '@/lib/queries';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) {
    return NextResponse.json({ puck_drop_time: null }, { status: 400 });
  }
  try {
    const puck_drop_time = getPuckDropByDate(date);
    return NextResponse.json({ puck_drop_time });
  } catch {
    return NextResponse.json({ puck_drop_time: null });
  }
}

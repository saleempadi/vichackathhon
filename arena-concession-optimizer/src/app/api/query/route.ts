import { NextRequest, NextResponse } from 'next/server';
import * as queries from '@/lib/queries';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryName = searchParams.get('q');
  const opponent = searchParams.get('opponent') || undefined;
  const dayOfWeek = searchParams.get('dayOfWeek') || undefined;
  const location = searchParams.get('location') || undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

  try {
    switch (queryName) {
      case 'overview':
        return NextResponse.json(queries.getOverviewKPIs());
      case 'salesByLocation':
        return NextResponse.json(queries.getSalesByLocation({ opponent, dayOfWeek }));
      case 'salesTrend':
        return NextResponse.json(queries.getSalesTrend());
      case 'topItems':
        return NextResponse.json(queries.getTopItems(limit || 10, location));
      case 'hourlyHeatmap':
        return NextResponse.json(queries.getHourlyHeatmap());
      case 'categoryByLocation':
        return NextResponse.json(queries.getCategoryByLocation());
      case 'peakThroughput':
        return NextResponse.json(queries.getPeakThroughput());
      case 'attendanceVsSales':
        return NextResponse.json(queries.getAttendanceVsSales());
      case 'salesByOpponent':
        return NextResponse.json(queries.getSalesByOpponent());
      case 'salesByDayOfWeek':
        return NextResponse.json(queries.getSalesByDayOfWeek());
      case 'gamePeriodTimeline':
        return NextResponse.json(queries.getGamePeriodTimeline());
      case 'upcomingGames':
        return NextResponse.json(queries.getUpcomingGames());
      case 'predictions':
        if (!opponent || !dayOfWeek) return NextResponse.json({ error: 'opponent and dayOfWeek required' }, { status: 400 });
        return NextResponse.json(queries.getPredictionsForGame(opponent, dayOfWeek));
      case 'staffing':
        if (!opponent || !dayOfWeek) return NextResponse.json({ error: 'opponent and dayOfWeek required' }, { status: 400 });
        return NextResponse.json(queries.getStaffingRecommendation(opponent, dayOfWeek));
      case 'expressMenu':
        return NextResponse.json(queries.getExpressMenuSuggestions());
      case 'locationTraffic':
        return NextResponse.json(queries.getLocationTraffic());
      case 'opponents':
        return NextResponse.json(queries.getOpponents());
      default:
        return NextResponse.json({ error: 'Unknown query' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

'use client';

import { useQuery } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChartComponent } from '@/components/charts/bar-chart';
import { ScatterChartComponent } from '@/components/charts/scatter-chart';

export default function GameDayPage() {
  const { data: attendanceVsSales } = useQuery<any[]>('attendanceVsSales');
  const { data: salesByOpponent } = useQuery<any[]>('salesByOpponent');
  const { data: salesByDay } = useQuery<any[]>('salesByDayOfWeek');
  const { data: timeline } = useQuery<any[]>('gamePeriodTimeline');

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedDays = salesByDay?.sort((a: any, b: any) =>
    dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Game Day Analysis</h1>
        <p className="text-gray-500 mt-1">How attendance, opponents, and timing affect concession sales</p>
      </div>

      {/* Attendance vs Sales Scatter */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance vs. Concession Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceVsSales && (
            <ScatterChartComponent
              data={attendanceVsSales}
              xKey="attendance"
              yKey="total_items"
              xLabel="Attendance"
              yLabel="Items Sold"
              height={400}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Opponent */}
        <Card>
          <CardHeader>
            <CardTitle>Avg Sales by Opponent</CardTitle>
          </CardHeader>
          <CardContent>
            {salesByOpponent && (
              <BarChartComponent
                data={salesByOpponent}
                xKey="opponent"
                yKey="avg_items_per_game"
                yLabel="Avg Items/Game"
                color="#8b5cf6"
              />
            )}
          </CardContent>
        </Card>

        {/* Day of Week Pattern */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedDays && (
              <BarChartComponent
                data={sortedDays}
                xKey="day_of_week"
                yKey="avg_items_per_game"
                yKey2="avg_attendance"
                yLabel="Avg Items/Game"
                y2Label="Avg Attendance"
                color="#10b981"
                color2="#f59e0b"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Game Period Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Game Period</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline && (
            <BarChartComponent
              data={timeline}
              xKey="period"
              yKey="total_items"
              yKey2="total_orders"
              yLabel="Total Items"
              y2Label="Total Orders"
              color="#3b82f6"
              color2="#ef4444"
            />
          )}
        </CardContent>
      </Card>

      {/* Opponent Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Opponent Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2">Opponent</th>
                <th className="pb-2 text-right">Games</th>
                <th className="pb-2 text-right">Avg Attendance</th>
                <th className="pb-2 text-right">Avg Items/Game</th>
                <th className="pb-2 text-right">Items/Fan</th>
              </tr>
            </thead>
            <tbody>
              {salesByOpponent?.map((row: any) => (
                <tr key={row.opponent} className="border-b last:border-0">
                  <td className="py-2 font-medium">{row.opponent}</td>
                  <td className="py-2 text-right">{row.num_games}</td>
                  <td className="py-2 text-right">{row.avg_attendance?.toLocaleString()}</td>
                  <td className="py-2 text-right">{Math.round(row.avg_items_per_game).toLocaleString()}</td>
                  <td className="py-2 text-right">
                    {row.avg_attendance ? (row.avg_items_per_game / row.avg_attendance).toFixed(2) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

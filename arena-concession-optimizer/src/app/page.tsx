'use client';

import { useQuery } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChartComponent } from '@/components/charts/bar-chart';
import { LineChartComponent } from '@/components/charts/line-chart';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

export default function OverviewPage() {
  const [opponent, setOpponent] = useState<string>('');
  const [dayOfWeek, setDayOfWeek] = useState<string>('');

  const { data: kpis, loading: kpiLoading } = useQuery<any>('overview');
  const { data: salesByLoc } = useQuery<any[]>('salesByLocation', { opponent, dayOfWeek });
  const { data: trend } = useQuery<any[]>('salesTrend');
  const { data: topItems } = useQuery<any[]>('topItems');
  const { data: opponents } = useQuery<any[]>('opponents');

  const trendData = trend?.map(t => ({
    ...t,
    label: `${t.date.slice(5)} vs ${t.opponent}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Overview</h1>
          <p className="text-gray-500 mt-1">Concession performance across all locations</p>
        </div>
        <div className="flex gap-3">
          <Select value={opponent} onValueChange={(v) => setOpponent(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Opponents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Opponents</SelectItem>
              {opponents?.map((o: any) => (
                <SelectItem key={o.opponent} value={o.opponent}>{o.opponent}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Days" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Days</SelectItem>
              {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Games', value: kpis?.totalGames, format: (v: number) => v.toLocaleString() },
          { label: 'Total Items Sold', value: kpis?.totalItems, format: (v: number) => v.toLocaleString() },
          { label: 'Est. Orders', value: kpis?.totalOrders, format: (v: number) => v.toLocaleString() },
          { label: 'Avg Items/Game', value: kpis?.avgItemsPerGame, format: (v: number) => v.toLocaleString() },
          { label: 'Avg Attendance', value: kpis?.avgAttendance, format: (v: number) => v.toLocaleString() },
        ].map(({ label, value, format }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{kpiLoading ? '...' : value != null ? format(value) : '-'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales by Location */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Volume by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {salesByLoc && (
            <BarChartComponent
              data={salesByLoc}
              xKey="location"
              yKey="total_items"
              yLabel="Items Sold"
              color="#3b82f6"
            />
          )}
        </CardContent>
      </Card>

      {/* Sales Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Trend Over Season</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData && (
            <LineChartComponent
              data={trendData}
              xKey="label"
              yKey="total_items"
              yKey2="attendance"
              yLabel="Items Sold"
              y2Label="Attendance"
            />
          )}
        </CardContent>
      </Card>

      {/* Top Items */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Items</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2">#</th>
                <th className="pb-2">Item</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Total Qty</th>
                <th className="pb-2 text-right">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {topItems?.map((item: any, i: number) => (
                <tr key={item.item} className="border-b last:border-0">
                  <td className="py-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 font-medium">{item.item}</td>
                  <td className="py-2"><Badge variant="secondary">{item.category}</Badge></td>
                  <td className="py-2 text-right">{item.total_qty.toLocaleString()}</td>
                  <td className="py-2 text-right">{item.num_transactions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

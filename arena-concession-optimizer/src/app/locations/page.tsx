'use client';

import { useQuery } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChartComponent } from '@/components/charts/bar-chart';
import { Heatmap } from '@/components/charts/heatmap';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function LocationsPage() {
  const { data: heatmap } = useQuery<any[]>('hourlyHeatmap');
  const { data: categoryData } = useQuery<any[]>('categoryByLocation');
  const { data: locationTraffic } = useQuery<any[]>('locationTraffic');
  const { data: topItemsCanteen } = useQuery<any[]>('topItems', { location: 'Island Canteen', limit: '5' });
  const { data: topItemsSlice } = useQuery<any[]>('topItems', { location: 'Island Slice', limit: '5' });
  const { data: topItemsPhillips } = useQuery<any[]>('topItems', { location: 'Phillips Bar', limit: '5' });
  const { data: topItemsPortable } = useQuery<any[]>('topItems', { location: 'Portable Stations', limit: '5' });
  const { data: topItemsRemax } = useQuery<any[]>('topItems', { location: 'ReMax Fan Deck', limit: '5' });
  const { data: topItemsTaco } = useQuery<any[]>('topItems', { location: 'TacoTacoTaco', limit: '5' });

  // Build stacked bar data for categories by location
  const locations = locationTraffic ? [...new Set(locationTraffic.map((d: any) => d.location))] : [];
  const categories = categoryData ? [...new Set(categoryData.map((d: any) => d.category))] : [];

  const stackedData = locations.map(loc => {
    const row: any = { location: loc };
    categoryData?.filter((d: any) => d.location === loc).forEach((d: any) => {
      row[d.category] = d.total_items;
    });
    return row;
  });

  const topItemsByLocation: Record<string, any[]> = {
    'Island Canteen': topItemsCanteen || [],
    'Island Slice': topItemsSlice || [],
    'Phillips Bar': topItemsPhillips || [],
    'Portable Stations': topItemsPortable || [],
    'ReMax Fan Deck': topItemsRemax || [],
    'TacoTacoTaco': topItemsTaco || [],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Location Deep Dive</h1>
        <p className="text-gray-500 mt-1">Traffic patterns and performance by concession stand</p>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Heatmap: Location x Hour of Day</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmap && <Heatmap data={heatmap} />}
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown by Location</CardTitle>
        </CardHeader>
        <CardContent>
          {stackedData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left">Location</th>
                    {categories.map(cat => (
                      <th key={cat} className="pb-2 text-right px-3">{cat}</th>
                    ))}
                    <th className="pb-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stackedData.map((row: any) => {
                    const total = categories.reduce((sum, cat) => sum + (row[cat] || 0), 0);
                    return (
                      <tr key={row.location} className="border-b last:border-0">
                        <td className="py-2 font-medium">{row.location}</td>
                        {categories.map(cat => (
                          <td key={cat} className="py-2 text-right px-3">{(row[cat] || 0).toLocaleString()}</td>
                        ))}
                        <td className="py-2 text-right font-bold">{total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Comparison Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Location Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {locationTraffic && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locationTraffic.map((loc: any) => (
                <div key={loc.location} className="border rounded-lg p-4">
                  <h3 className="font-bold text-lg">{loc.location}</h3>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p>Total Items: <span className="font-medium text-gray-900">{loc.total_items.toLocaleString()}</span></p>
                    <p>Total Orders: <span className="font-medium text-gray-900">{loc.total_orders.toLocaleString()}</span></p>
                    <p>Avg Items/Game: <span className="font-medium text-gray-900">{Math.round(loc.avg_items_per_game).toLocaleString()}</span></p>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Top Items:</p>
                    <div className="flex flex-wrap gap-1">
                      {topItemsByLocation[loc.location]?.slice(0, 5).map((item: any) => (
                        <Badge key={item.item} variant="outline" className="text-xs">
                          {item.item} ({item.total_qty.toLocaleString()})
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

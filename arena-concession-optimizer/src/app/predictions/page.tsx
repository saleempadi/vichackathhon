'use client';

import { useQuery } from '@/lib/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChartComponent } from '@/components/charts/bar-chart';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { ArenaMap } from '@/components/arena-map';
import { QRCodeSVG } from 'qrcode.react';

const upcomingGames = [
  { date: '2026-02-27', opponent: 'Portland', time: '7:05 PM', day: 'Friday' },
  { date: '2026-02-28', opponent: 'Portland', time: '4:05 PM', day: 'Saturday' },
  { date: '2026-03-13', opponent: 'Vancouver', time: '7:05 PM', day: 'Friday' },
  { date: '2026-03-17', opponent: 'Everett', time: '7:05 PM', day: 'Tuesday' },
  { date: '2026-03-20', opponent: 'Prince George', time: '7:05 PM', day: 'Friday' },
  { date: '2026-03-21', opponent: 'Prince George', time: '6:05 PM', day: 'Saturday' },
];

function isToday(date: string) {
  return date === new Date().toISOString().split('T')[0];
}

function to24h(time: string): string {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '19:05';
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h}:${m}`;
}

export default function PredictionsPage() {
  const [selectedGame, setSelectedGame] = useState(upcomingGames[0]);

  const { data: upcoming } = useQuery<any[]>('upcomingGames');
  const { data: predictions } = useQuery<any[]>('predictions', {
    opponent: selectedGame.opponent,
    dayOfWeek: selectedGame.day,
  });
  const { data: staffing } = useQuery<any[]>('staffing', {
    opponent: selectedGame.opponent,
    dayOfWeek: selectedGame.day,
  });
  const { data: expressMenu } = useQuery<any[]>('expressMenu');

  // Build staffing recommendations
  const staffingByLocation: Record<string, any[]> = {};
  staffing?.forEach((s: any) => {
    if (!staffingByLocation[s.location]) staffingByLocation[s.location] = [];
    staffingByLocation[s.location].push(s);
  });

  // Calculate recommended staff per location at peak
  const staffRecommendations = predictions?.map((p: any) => {
    const locationStaffing = staffingByLocation[p.location] || [];
    const peakHour = locationStaffing.reduce((max: any, s: any) =>
      s.avg_items_per_hour > (max?.avg_items_per_hour || 0) ? s : max, null);
    // Rough estimate: 1 staff per 30 items/hour at peak
    const recommendedStaff = peakHour ? Math.max(1, Math.ceil(peakHour.avg_items_per_hour / 30)) : 1;
    return {
      location: p.location,
      predicted_items: Math.round(p.predicted_items),
      peak_hour: peakHour?.hour,
      peak_items: peakHour ? Math.round(peakHour.avg_items_per_hour) : 0,
      recommended_staff: recommendedStaff,
    };
  });

  // Arena map traffic data
  const trafficData = predictions?.map((p: any) => ({
    location: p.location,
    value: Math.round(p.predicted_items),
  })) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Predictions & Staffing</h1>
        <p className="text-gray-500 mt-1">AI-powered demand forecasting for upcoming games</p>
      </div>

      {/* Upcoming Games Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Games</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {upcomingGames.map((game) => {
              const upcomingData = upcoming?.find((u: any) => u.game_date === game.date);
              return (
                <button
                  key={game.date}
                  onClick={() => setSelectedGame(game)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedGame.date === game.date
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm">{game.opponent}</p>
                    {isToday(game.date) && (
                      <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">TODAY</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{game.day}, {game.date}</p>
                  <p className="text-xs text-gray-500">{game.time}</p>
                  {upcomingData && (
                    <p className="text-xs text-blue-600 mt-1">
                      Est. {upcomingData.predicted_attendance?.toLocaleString()} fans
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Arena Map */}
        <Card>
          <CardHeader>
            <CardTitle>Predicted Traffic Map — {selectedGame.opponent} ({selectedGame.day})</CardTitle>
          </CardHeader>
          <CardContent>
            <ArenaMap trafficData={trafficData} />
          </CardContent>
        </Card>

        {/* Staffing Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Staffing Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {staffRecommendations && (
              <div className="space-y-3">
                {staffRecommendations.map((rec) => (
                  <div key={rec.location} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{rec.location}</p>
                      <p className="text-sm text-gray-500">
                        Peak at {rec.peak_hour != null ? `${rec.peak_hour}:00` : 'N/A'} — ~{rec.peak_items} items/hr
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{rec.recommended_staff}</p>
                      <p className="text-xs text-gray-500">staff needed</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Predicted Items by Location */}
      <Card>
        <CardHeader>
          <CardTitle>Predicted Items by Location — {selectedGame.opponent} ({selectedGame.day})</CardTitle>
        </CardHeader>
        <CardContent>
          {predictions && (
            <BarChartComponent
              data={predictions.map((p: any) => ({ ...p, predicted_items: Math.round(p.predicted_items) }))}
              xKey="location"
              yKey="predicted_items"
              yLabel="Predicted Items"
              color="#8b5cf6"
            />
          )}
        </CardContent>
      </Card>

      {/* Express Menu Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Express Menu Suggestions</CardTitle>
          <p className="text-sm text-gray-500">Highest-frequency items during peak game periods — ideal for a fast-service express line</p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2">#</th>
                <th className="pb-2">Item</th>
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">Avg/Game (Peak)</th>
                <th className="pb-2 text-right">Total Sold (Peak)</th>
              </tr>
            </thead>
            <tbody>
              {expressMenu?.map((item: any, i: number) => (
                <tr key={item.item} className="border-b last:border-0">
                  <td className="py-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 font-medium">{item.item}</td>
                  <td className="py-2">
                    <Badge variant="secondary">{item.category}</Badge>
                  </td>
                  <td className="py-2 text-right">{Math.round(item.avg_per_game)}</td>
                  <td className="py-2 text-right">{item.total_qty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Fan QR Code */}
      <Card>
        <CardHeader>
          <CardTitle>Fan Concession Finder</CardTitle>
          <p className="text-sm text-gray-500">Print or display this QR code at arena entrances — fans scan to find the shortest line</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="bg-white p-4 rounded-xl border shadow-sm">
              <QRCodeSVG
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/fan?opponent=${encodeURIComponent(selectedGame.opponent)}&dayOfWeek=${encodeURIComponent(selectedGame.day)}&gameTime=${encodeURIComponent(to24h(selectedGame.time))}`}
                size={160}
                level="M"
              />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900 mb-2">Tonight&apos;s Game</p>
              <p className="text-sm text-gray-600 mb-1">
                vs {selectedGame.opponent} &middot; {selectedGame.day}, {selectedGame.date}
              </p>
              <p className="text-sm text-gray-600 mb-3">{selectedGame.time}</p>
              <p className="text-xs text-gray-400">
                Links to: /fan?opponent={selectedGame.opponent}&amp;dayOfWeek={selectedGame.day}
              </p>
              <a
                href={`/fan?opponent=${encodeURIComponent(selectedGame.opponent)}&dayOfWeek=${encodeURIComponent(selectedGame.day)}&gameTime=${encodeURIComponent(to24h(selectedGame.time))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Preview Fan Page
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

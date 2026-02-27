'use client';

import { ScatterChart as RechartsScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';

interface ScatterChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

export function ScatterChartComponent({ data, xKey, yKey, xLabel, yLabel, height = 350 }: ScatterChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatterChart margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} name={xLabel || xKey} type="number" />
        <YAxis dataKey={yKey} name={yLabel || yKey} type="number" />
        <ZAxis range={[60, 60]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-white p-3 border rounded shadow-lg text-sm">
                <p className="font-medium">{d.opponent} ({d.game_date})</p>
                <p>Attendance: {d.attendance?.toLocaleString()}</p>
                <p>Items Sold: {d.total_items?.toLocaleString()}</p>
              </div>
            );
          }}
        />
        <Scatter data={data} fill="#3b82f6" />
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}

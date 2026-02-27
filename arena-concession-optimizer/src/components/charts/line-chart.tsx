'use client';

import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface LineChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  yKey2?: string;
  color?: string;
  color2?: string;
  yLabel?: string;
  y2Label?: string;
  height?: number;
}

export function LineChartComponent({ data, xKey, yKey, yKey2, color = '#3b82f6', color2 = '#10b981', yLabel, y2Label, height = 350 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} angle={-45} textAnchor="end" fontSize={11} />
        <YAxis />
        <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : value} />
        <Legend />
        <Line type="monotone" dataKey={yKey} stroke={color} name={yLabel || yKey} strokeWidth={2} dot={{ r: 3 }} />
        {yKey2 && <Line type="monotone" dataKey={yKey2} stroke={color2} name={y2Label || yKey2} strokeWidth={2} dot={{ r: 3 }} />}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

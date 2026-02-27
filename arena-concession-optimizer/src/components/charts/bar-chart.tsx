'use client';

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface BarChartProps {
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

export function BarChartComponent({ data, xKey, yKey, yKey2, color = '#3b82f6', color2 = '#f59e0b', yLabel, y2Label, height = 350 }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} angle={-45} textAnchor="end" fontSize={12} interval={0} />
        <YAxis />
        <Tooltip formatter={(value) => typeof value === 'number' ? value.toLocaleString() : value} />
        {(yKey2 || yLabel) && <Legend />}
        <Bar dataKey={yKey} fill={color} name={yLabel || yKey} radius={[4, 4, 0, 0]} />
        {yKey2 && <Bar dataKey={yKey2} fill={color2} name={y2Label || yKey2} radius={[4, 4, 0, 0]} />}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

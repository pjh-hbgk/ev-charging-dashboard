import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_GRID, CHART_AXIS, CHART_TEXT, seriesColor, tooltipStyle } from './palette';

export interface LineSeriesDef {
  key: string;
  label: string;
}

export default function SimpleLineChart({
  data,
  xKey,
  series,
  valueFormatter,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: LineSeriesDef[];
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: CHART_TEXT.muted, fontSize: 11 }} axisLine={{ stroke: CHART_AXIS }} tickLine={false} />
        <YAxis
          tick={{ fill: CHART_TEXT.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : String(v))}
          width={56}
        />
        <Tooltip {...tooltipStyle} formatter={(value: number, name: string) => [valueFormatter ? valueFormatter(value) : value, name]} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={seriesColor(i)} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

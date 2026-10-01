import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_GRID, CHART_AXIS, CHART_TEXT, seriesColor, tooltipStyle } from './palette';

export interface BarSeriesDef {
  key: string;
  label: string;
}

export default function SimpleBarChart({
  data,
  xKey,
  series,
  valueFormatter,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: BarSeriesDef[];
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap={series.length > 1 ? '20%' : '30%'} barGap={2}>
        <CartesianGrid stroke={CHART_GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: CHART_TEXT.muted, fontSize: 11 }} axisLine={{ stroke: CHART_AXIS }} tickLine={false} />
        <YAxis
          tick={{ fill: CHART_TEXT.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : String(v))}
          width={56}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [valueFormatter ? valueFormatter(value) : value, name]}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(i)} radius={[4, 4, 0, 0]} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

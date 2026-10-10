import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartColors } from './Theme';
import { EmptyState } from './feedback';
import { ChartBar } from '@phosphor-icons/react';

function TooltipBox({ active, payload, label, format, labelFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-lg)', fontSize: 'var(--font-size-sm)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{labelFormat ? labelFormat(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} aria-hidden />
          <span className="muted">{p.name}</span>
          <span className="num" style={{ marginLeft: 'auto', fontWeight: 600 }}>
            {format ? format(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ '--sw': i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Screen-reader table alternative for every chart. */
function SrTable({ caption, data, xKey, series, format, xFormat }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{xKey}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d[xKey]}>
            <th scope="row">{xFormat ? xFormat(d[xKey]) : d[xKey]}</th>
            {series.map((s) => (
              <td key={s.key}>{format ? format(d[s.key]) : d[s.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const emptyChart = <EmptyState icon={ChartBar} title="No data yet">Figures appear here once there is activity.</EmptyState>;

export function BarSeries({ data, xKey, series, format, xFormat, caption, height = 260, stacked = false }) {
  const c = useChartColors();
  if (!data?.length) return emptyChart;
  const colored = series.map((s, i) => ({ ...s, color: s.color || c.series[s.colorIndex ?? i] }));
  return (
    <figure style={{ margin: 0 }} className="stack-sm">
      <Legend items={colored} />
      <div className="chart-box" style={{ height }} aria-hidden>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickFormatter={(v) => (format ? format(v, true) : v)} tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={<TooltipBox format={format} labelFormat={xFormat} />} />
            {colored.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} stackId={stacked ? 'a' : undefined} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption={caption} data={data} xKey={xKey} series={colored} format={format} xFormat={xFormat} />
    </figure>
  );
}

export function AreaSeries({ data, xKey, series, format, xFormat, caption, height = 240 }) {
  const c = useChartColors();
  if (!data?.length) return emptyChart;
  const colored = series.map((s, i) => ({ ...s, color: s.color || c.series[s.colorIndex ?? i] }));
  return (
    <figure style={{ margin: 0 }} className="stack-sm">
      <Legend items={colored} />
      <div className="chart-box" style={{ height }} aria-hidden>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tickFormatter={(v) => (format ? format(v, true) : v)} tick={{ fill: c.text, fontSize: 12 }} axisLine={false} tickLine={false} width={64} allowDecimals={false} />
            <Tooltip content={<TooltipBox format={format} labelFormat={xFormat} />} />
            {colored.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption={caption} data={data} xKey={xKey} series={colored} format={format} xFormat={xFormat} />
    </figure>
  );
}

/** Donut for ≤ 5 categories (use bars beyond that). */
export function Donut({ data, format, caption, height = 200, centerLabel }) {
  const c = useChartColors();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return emptyChart;
  const colored = data.map((d, i) => ({ ...d, color: c.series[i % c.series.length] }));
  return (
    <figure style={{ margin: 0 }} className="stack-sm">
      <div style={{ position: 'relative', height }} aria-hidden>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={colored} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke={c.surface} isAnimationActive={false}>
              {colored.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipBox active payload={[{ ...payload[0], color: payload[0].payload.color }]} label={payload[0].name} format={format} /> : null)} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            {centerLabel}
          </div>
        )}
      </div>
      <ul className="list" style={{ fontSize: 'var(--font-size-sm)' }}>
        {colored.map((d) => (
          <li key={d.label} className="row-between" style={{ padding: '6px 0' }}>
            <span className="row" style={{ gap: 8 }}>
              <i style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: 'inline-block' }} aria-hidden />
              {d.label}
            </span>
            <span className="num">
              {format ? format(d.value) : d.value} <span className="subtle">· {Math.round((d.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

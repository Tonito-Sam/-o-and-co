import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RechartsCharts({
  channels,
  colors,
  radar,
  revenueTrend,
}: {
  channels: { name: string; value: number }[];
  colors: string[];
  radar: { metric: string; A: number; B: number }[];
  revenueTrend: { month: string; target: number; revenue: number }[];
}) {
  return (
    <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-display font-semibold mb-3">Revenue forecast — 12 months</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Line type="monotone" dataKey="target" stroke="oklch(0.78 0 0)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="revenue" stroke="oklch(0.5 0.08 195)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-3">Revenue mix</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={channels} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {channels.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                </Pie>
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-3">Top performer (Sandton) vs group avg</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <RadarChart data={radar}>
                <PolarGrid stroke="oklch(0.92 0.008 95)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar dataKey="A" stroke="oklch(0.5 0.08 195)" fill="oklch(0.5 0.08 195)" fillOpacity={0.3} />
                <Radar dataKey="B" stroke="oklch(0.55 0.1 30)" fill="oklch(0.55 0.1 30)" fillOpacity={0.15} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

export default RechartsCharts;

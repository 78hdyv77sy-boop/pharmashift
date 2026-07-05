"use client";

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrgStats } from "@/lib/stats";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function StatsCharts({ stats }: { stats: OrgStats }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Neue Mitglieder (6 Monate)">
        <LineChart data={stats.membersByMonth}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={24} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="hsl(222.2 47.4% 11.2%)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Mitglieder nach Status">
        <BarChart data={stats.membersByStatus}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={24} />
          <Tooltip />
          <Bar dataKey="value" fill="hsl(222.2 47.4% 11.2%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Mitarbeiter nach Typ">
        <BarChart data={stats.employeesByType}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} width={24} />
          <Tooltip />
          <Bar dataKey="value" fill="hsl(215.4 16.3% 46.9%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}

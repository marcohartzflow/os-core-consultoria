"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { AuditActivityDay } from "@/core/api/types";
import { ErrorState } from "@/core/ui/feedback";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseDay } from "./labels";

const chartConfig = {
  rest: { label: "Portal", color: "var(--chart-1)" },
  aiTool: { label: "Assistente", color: "var(--chart-2)" },
  system: { label: "Sistema", color: "var(--chart-3)" },
} satisfies ChartConfig;

const RANGES = [
  { value: "90", label: "Últimos 3 meses" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "7", label: "Últimos 7 dias" },
];

const SHORT_DAY = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const LONG_DAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "long" });

/** Audit events per day by origin, as the interactive area chart of the shadcn dashboard block. */
export function ActivityChart({
  days,
  error,
  onRetry,
}: {
  days: AuditActivityDay[] | null;
  error: unknown;
  onRetry: () => void;
}) {
  const [range, setRange] = useState("30");
  const data = days?.slice(-Number(range)) ?? [];
  const total = data.reduce((sum, day) => sum + day.rest + day.aiTool + day.system, 0);
  const rangeLabel = RANGES.find((r) => r.value === range)?.label.toLowerCase();

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Atividade do portal</CardTitle>
        <CardDescription>
          {days ? (
            <>
              <span className="hidden @[540px]/card:inline">
                {total.toLocaleString("pt-BR")} eventos registrados na auditoria nos {rangeLabel}
              </span>
              <span className="@[540px]/card:hidden">{total.toLocaleString("pt-BR")} eventos</span>
            </>
          ) : (
            "Eventos registrados na auditoria, por origem"
          )}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(value) => value && setRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" className="flex w-40 @[767px]/card:hidden" aria-label="Período do gráfico">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} className="h-[250px] p-6" />
        ) : !days ? (
          <Skeleton className="h-[250px] w-full" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <AreaChart data={data}>
              <defs>
                {Object.keys(chartConfig).map((key) => (
                  <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value: string) => SHORT_DAY.format(parseDay(value))}
              />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => LONG_DAY.format(parseDay(String(value)))}
                  />
                }
              />
              <Area dataKey="system" type="monotone" fill="url(#fill-system)" stroke="var(--color-system)" stackId="a" />
              <Area dataKey="aiTool" type="monotone" fill="url(#fill-aiTool)" stroke="var(--color-aiTool)" stackId="a" />
              <Area dataKey="rest" type="monotone" fill="url(#fill-rest)" stroke="var(--color-rest)" stackId="a" />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

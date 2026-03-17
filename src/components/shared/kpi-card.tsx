"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  sparkData?: number[];
  delay?: number;
  icon?: React.ReactNode;
}

export function KPICard({ title, value, change = 0, sparkData = [], delay = 0, icon }: KPICardProps) {
  const isPositive = change > 0;
  const isNeutral = change === 0;
  const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const trendColor = isNeutral ? "text-muted-foreground" : isPositive ? "text-success" : "text-destructive";
  const chartColor = isPositive ? "hsl(145 65% 42%)" : "hsl(0 72% 65%)";

  const chartData = sparkData.map((v) => ({ v }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: delay * 0.1 }}
    >
      <Card className="p-4 surface-glow hover:surface-glow-hover transition-all">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
        <div className="flex items-center justify-between mt-2">
          <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            <span>{isPositive ? "+" : ""}{change.toFixed(1)}%</span>
          </div>
          {chartData.length > 1 && (
            <div className="w-20 h-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={chartColor}
                    strokeWidth={1.5}
                    fill={`url(#spark-${title})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

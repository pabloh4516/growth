"use client";

import { motion } from "framer-motion";

interface HealthGaugeProps {
  score: number;
  size?: number;
}

export function HealthGauge({ score, size = 160 }: HealthGaugeProps) {
  const radius = (size - 20) / 2;
  const circumference = Math.PI * radius * 1.5; // 270 degrees
  const progress = (score / 100) * circumference;
  const color = score >= 70 ? "hsl(145 65% 42%)" : score >= 40 ? "hsl(38 92% 50%)" : "hsl(0 72% 65%)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(240 10% 18%)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={0}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold font-mono" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</span>
      </div>
    </div>
  );
}

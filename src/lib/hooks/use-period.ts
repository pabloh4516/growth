"use client";

import { create } from "zustand";

interface PeriodStore {
  period: string;
  days: number;
  setPeriod: (period: string) => void;
}

const PERIOD_DAYS: Record<string, number> = {
  "hoje": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
};

export const usePeriodStore = create<PeriodStore>((set) => ({
  period: "hoje",
  days: 1,
  setPeriod: (period) => set({ period, days: PERIOD_DAYS[period] || 1 }),
}));

export const PERIOD_OPTIONS = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

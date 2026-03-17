"use client";

import { create } from "zustand";

interface PeriodStore {
  period: string;
  days: number;
  setPeriod: (period: string) => void;
}

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const usePeriodStore = create<PeriodStore>((set) => ({
  period: "30d",
  days: 30,
  setPeriod: (period) => set({ period, days: PERIOD_DAYS[period] || 30 }),
}));

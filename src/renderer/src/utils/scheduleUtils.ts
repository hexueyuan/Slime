import type { RepeatPreset } from "@shared/types/schedule";

export const REPEAT_PRESETS: { value: RepeatPreset; label: string; minutes: number | null }[] = [
  { value: "none", label: "不循环", minutes: null },
  { value: "hourly", label: "每小时", minutes: 60 },
  { value: "daily", label: "每天", minutes: 1440 },
  { value: "weekly", label: "每周", minutes: 10080 },
  { value: "monthly", label: "每月", minutes: 43200 },
  { value: "custom", label: "自定义", minutes: null },
];

export function getNextExecutions(
  scheduledAt: number,
  repeatInterval: number | null | undefined,
  count = 3,
): number[] {
  if (!scheduledAt) return [];
  if (!repeatInterval) return [scheduledAt];
  const now = Date.now();
  const intervalMs = repeatInterval * 60_000;
  let next = scheduledAt;
  while (next < now) next += intervalMs;
  return Array.from({ length: count }, (_, i) => next + i * intervalMs);
}

export function formatScheduleTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

export function intervalToLabel(minutes: number): string {
  const preset = REPEAT_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

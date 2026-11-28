export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function heatLevel(percent: number): HeatLevel {
  if (!Number.isFinite(percent) || percent < 0.5) return 0;
  if (percent < 5) return 1;
  if (percent < 20) return 2;
  if (percent < 50) return 3;
  if (percent < 80) return 4;
  return 5;
}

export function shareOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part <= 0) return 0;
  return Math.min(100, (part / total) * 100);
}

const MB = 1024 * 1024;

export function rateLevel(bytesPerSec: number): HeatLevel {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0.1 * MB) return 0;
  if (bytesPerSec < MB) return 1;
  if (bytesPerSec < 10 * MB) return 2;
  if (bytesPerSec < 50 * MB) return 3;
  if (bytesPerSec < 200 * MB) return 4;
  return 5;
}

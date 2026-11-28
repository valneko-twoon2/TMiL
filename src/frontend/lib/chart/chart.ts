/** グラフの上限値を切りのよい数（1, 2, 5 × 10^n）に丸める。最低でも minimum。 */
export function niceMax(values: readonly number[], minimum = 1): number {
  const peak = Math.max(minimum, ...values.filter((v) => Number.isFinite(v)));
  const exponent = Math.floor(Math.log10(peak));
  const base = 10 ** exponent;
  for (const step of [1, 2, 5, 10]) {
    if (peak <= step * base) return step * base;
  }
  return 10 * base;
}

/**
 * 値の列を polyline の points 文字列にする。右端が最新で、capacity 個分の幅に割り付ける。
 * 値は 0〜max に収める。
 */
export function linePoints(
  values: readonly number[],
  max: number,
  width: number,
  height: number,
  capacity: number,
): string {
  if (values.length === 0 || capacity < 2 || max <= 0) return '';
  const step = width / (capacity - 1);
  const offset = capacity - values.length;
  return values
    .slice(-capacity)
    .map((v, i) => {
      const x = (Math.max(0, offset) + i) * step;
      const clamped = Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), max);
      const y = height - (clamped / max) * height;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

export function areaPoints(line: string, width: number, height: number): string {
  if (line === '') return '';
  const first = line.split(' ')[0]?.split(',')[0] ?? '0';
  return `${first},${round(height)} ${line} ${round(width)},${round(height)}`;
}

function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

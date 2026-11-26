// 画面に出す値の整形。

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/** バイト数を 1024 単位で表す（例: 1536 → "1.5 KB"）。 */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(digits);
  return `${text} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** 毎秒のバイト数（例: "1.5 MB/秒"）。 */
export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/秒`;
}

/** 使用率（例: 12.345 → "12.3%"）。 */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return `${(0).toFixed(digits)}%`;
  return `${Math.min(value, 100).toFixed(digits)}%`;
}

/** 稼働時間を「日:時:分:秒」で表す（例: 93784 → "1:02:03:04"）。 */
export function formatUptime(totalSecs: number): string {
  const secs = Math.max(0, Math.floor(Number.isFinite(totalSecs) ? totalSecs : 0));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** UNIX 秒をその PC の時刻で「年/月/日 時:分:秒」にする。0 以下や不正な値は空。 */
export function formatDateTime(unixSecs: number): string {
  if (!Number.isFinite(unixSecs) || unixSecs <= 0) return '';
  const d = new Date(unixSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** クロック周波数（MHz → "3.20 GHz"）。 */
export function formatFrequency(mhz: number): string {
  if (!Number.isFinite(mhz) || mhz <= 0) return '-';
  return `${(mhz / 1000).toFixed(2)} GHz`;
}

/** ネットワークの転送量をビット毎秒で表す（例: "8.0 Kbps"）。 */
export function formatBits(bytesPerSec: number): string {
  const bits = Math.max(0, Number.isFinite(bytesPerSec) ? bytesPerSec * 8 : 0);
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'] as const;
  let value = bits;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return unit === 0 ? `${String(Math.round(value))} bps` : `${value.toFixed(1)} ${units[unit] ?? 'bps'}`;
}

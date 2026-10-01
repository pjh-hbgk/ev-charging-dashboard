import { DateTime } from 'luxon';

export const APP_ZONE = 'Europe/Copenhagen';

/**
 * Parse a "YYYY-MM-DD HH:mm" (or similar) local Danish wall-clock string —
 * as found in the Zaptec-style export — into a UTC ISO instant.
 *
 * Correctness matters here: Denmark uses CET (UTC+1) in winter and CEST
 * (UTC+2) in summer, switching on the EU DST schedule (last Sunday of
 * March / October). Luxon resolves the correct offset for the given date
 * automatically — we must NOT hardcode +01:00 or +02:00.
 *
 * Two edge cases are called out explicitly because they matter for
 * auditability, even though luxon's default resolution is reasonable:
 *  - "Spring forward" (23-hour day, last Sunday in March): local times in
 *    02:00–03:00 do not exist. Luxon shifts them forward by the DST gap.
 *  - "Fall back" (25-hour day, last Sunday in October): local times in
 *    02:00–03:00 occur twice. Luxon resolves to the FIRST occurrence
 *    (the pre-transition/summer offset) by default.
 */
export function parseLocalToUTC(localString: string): { iso: string; ambiguous: boolean; nonExistent: boolean } {
  const dt = DateTime.fromFormat(localString.trim(), 'yyyy-MM-dd HH:mm', { zone: APP_ZONE });
  const parsed = dt.isValid ? dt : DateTime.fromFormat(localString.trim(), 'yyyy-MM-dd HH:mm:ss', { zone: APP_ZONE });
  if (!parsed.isValid) {
    throw new Error(`Unable to parse local timestamp "${localString}": ${parsed.invalidReason}`);
  }
  // luxon marks an invalid-but-shifted result via `dt.isValid` staying true
  // (it silently resolves), so we detect the DST edge cases by re-deriving
  // the offset a minute before/after and comparing.
  const before = parsed.minus({ minutes: 1 });
  const after = parsed.plus({ minutes: 1 });
  const nonExistent = before.offset !== parsed.offset && after.offset !== parsed.offset && before.offset === after.offset;
  // Ambiguity can't be perfectly detected after the fact from a single
  // zoned DateTime (luxon already picked one); we flag any timestamp that
  // falls within the historical fall-back window for the given year as a
  // heads-up for manual review, without altering the (reasonable) choice.
  const ambiguous = isWithinFallBackWindow(parsed);
  return { iso: parsed.toUTC().toISO()!, ambiguous, nonExistent };
}

function isWithinFallBackWindow(dt: DateTime): boolean {
  // Last Sunday of October, 02:00–03:00 local (the hour that repeats).
  const oct31 = DateTime.fromObject({ year: dt.year, month: 10, day: 31 }, { zone: APP_ZONE });
  const lastSunday = oct31.minus({ days: oct31.weekday % 7 });
  const windowStart = lastSunday.set({ hour: 2, minute: 0, second: 0, millisecond: 0 });
  const windowEnd = lastSunday.set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
  return dt >= windowStart && dt < windowEnd;
}

export function formatDanish(isoUTC: string, fmt: 'date' | 'time' | 'datetime' = 'datetime'): string {
  const dt = DateTime.fromISO(isoUTC, { zone: 'utc' }).setZone(APP_ZONE);
  if (fmt === 'date') return dt.toFormat('dd-MM-yyyy');
  if (fmt === 'time') return dt.toFormat('HH:mm');
  return dt.toFormat('dd-MM-yyyy HH:mm');
}

export function toDanishDate(isoUTC: string): DateTime {
  return DateTime.fromISO(isoUTC, { zone: 'utc' }).setZone(APP_ZONE);
}

/**
 * Split a [start, end) UTC interval into consecutive whole-hour buckets
 * aligned to the UTC hour grid. Used as a *fallback* segmentation when no
 * cached price-interval data exists yet for a session (e.g. before the
 * first price fetch) — real cost allocation uses splitByPriceIntervals
 * below, against the actual interval boundaries returned by the price
 * source, because the Danish/Nord Pool market resolution is NOT a fixed
 * 60-minute grid: day-ahead prices were hourly through late Sept 2025 and
 * moved to 15-minute settlement periods after the ENTSO-E-wide market
 * time unit (MTU) harmonisation. Hardcoding either width would silently
 * misallocate costs for the other era's data, so the engine always
 * segments against whatever interval widths the price cache actually has.
 */
export function splitIntoHourIntervals(startISO: string, endISO: string): Array<{ start: DateTime; end: DateTime }> {
  const start = DateTime.fromISO(startISO, { zone: 'utc' });
  const end = DateTime.fromISO(endISO, { zone: 'utc' });
  if (end <= start) return [];

  const intervals: Array<{ start: DateTime; end: DateTime }> = [];
  let cursor = start.startOf('hour');
  while (cursor < end) {
    const hourEnd = cursor.plus({ hours: 1 });
    const segStart = cursor > start ? cursor : start;
    const segEnd = hourEnd < end ? hourEnd : end;
    if (segEnd > segStart) {
      intervals.push({ start: segStart, end: segEnd });
    }
    cursor = hourEnd;
  }
  return intervals;
}

export interface PriceIntervalBound {
  start: string; // ISO UTC
  end: string;   // ISO UTC
  price: number;
}

/**
 * Split a [start, end) UTC session range into segments aligned to the
 * REAL price-interval boundaries supplied (from electricity_prices),
 * whatever their width (60min historically, 15min currently). Any part
 * of the session not covered by a supplied interval becomes a single
 * "gap" segment with price = null, so it can be flagged as missing
 * rather than silently costed at zero or at a neighbouring price.
 */
export function splitByPriceIntervals(
  startISO: string,
  endISO: string,
  intervals: PriceIntervalBound[]
): Array<{ start: DateTime; end: DateTime; price: number | null }> {
  const start = DateTime.fromISO(startISO, { zone: 'utc' });
  const end = DateTime.fromISO(endISO, { zone: 'utc' });
  if (end <= start) return [];

  const sorted = [...intervals]
    .map((iv) => ({ start: DateTime.fromISO(iv.start, { zone: 'utc' }), end: DateTime.fromISO(iv.end, { zone: 'utc' }), price: iv.price }))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const segments: Array<{ start: DateTime; end: DateTime; price: number | null }> = [];
  let cursor = start;

  for (const iv of sorted) {
    if (iv.end <= cursor || iv.start >= end) continue; // no overlap with remaining session range
    if (iv.start > cursor) {
      // gap before this interval starts
      segments.push({ start: cursor, end: iv.start < end ? iv.start : end, price: null });
    }
    const segStart = iv.start > cursor ? iv.start : cursor;
    const segEnd = iv.end < end ? iv.end : end;
    if (segEnd > segStart) segments.push({ start: segStart, end: segEnd, price: iv.price });
    cursor = segEnd > cursor ? segEnd : cursor;
    if (cursor >= end) break;
  }
  if (cursor < end) segments.push({ start: cursor, end, price: null });

  return segments.filter((s) => s.end > s.start);
}

export function minutesBetween(a: DateTime, b: DateTime): number {
  return b.diff(a, 'minutes').minutes;
}

import { describe, it, expect } from 'vitest';
import { parseLocalToUTC, splitIntoHourIntervals } from '../timezone';

describe('parseLocalToUTC', () => {
  it('resolves winter time (CET, UTC+1)', () => {
    const { iso } = parseLocalToUTC('2026-01-15 12:00');
    expect(iso).toBe('2026-01-15T11:00:00.000Z');
  });

  it('resolves summer time (CEST, UTC+2)', () => {
    const { iso } = parseLocalToUTC('2026-07-15 12:00');
    expect(iso).toBe('2026-07-15T10:00:00.000Z');
  });

  it('flags the fall-back (25-hour day) ambiguous window in October', () => {
    // Last Sunday of Oct 2026 is Oct 25.
    const { ambiguous } = parseLocalToUTC('2026-10-25 02:30');
    expect(ambiguous).toBe(true);
  });

  it('does not flag a normal hour as ambiguous', () => {
    const { ambiguous } = parseLocalToUTC('2026-10-25 12:00');
    expect(ambiguous).toBe(false);
  });
});

describe('splitIntoHourIntervals', () => {
  it('splits a session crossing multiple hour boundaries', () => {
    // Local 22:35 -> 01:10 next day, in January (CET, UTC+1) => 21:35Z -> 00:10Z
    const start = parseLocalToUTC('2026-01-10 22:35').iso;
    const end = parseLocalToUTC('2026-01-11 01:10').iso;
    const segs = splitIntoHourIntervals(start, end);
    // 21:35-22:00, 22:00-23:00, 23:00-00:00, 00:00-00:10 UTC => 4 segments
    expect(segs.length).toBe(4);
    const totalMinutes = segs.reduce((s, seg) => s + seg.end.diff(seg.start, 'minutes').minutes, 0);
    expect(Math.round(totalMinutes)).toBe(155); // 2h35m local (22:35 -> 01:10)
  });

  it('handles a session within a single hour', () => {
    const start = parseLocalToUTC('2026-03-01 10:05').iso;
    const end = parseLocalToUTC('2026-03-01 10:45').iso;
    const segs = splitIntoHourIntervals(start, end);
    expect(segs.length).toBe(1);
  });

  it('produces correct UTC-hour segments across the spring-forward transition', () => {
    // 2026-03-29 is the last Sunday of March (spring forward, 23h day).
    // A session from 01:00 to 04:00 local should map to only 2 clock-hours
    // elapsed in UTC terms (01:00-02:00 CET runs, then 03:00-04:00 CEST).
    const start = parseLocalToUTC('2026-03-29 01:00').iso;
    const end = parseLocalToUTC('2026-03-29 04:00').iso;
    const segs = splitIntoHourIntervals(start, end);
    const totalMinutes = segs.reduce((s, seg) => s + seg.end.diff(seg.start, 'minutes').minutes, 0);
    expect(Math.round(totalMinutes)).toBe(120); // only 2 real hours elapsed, not 3
  });
});

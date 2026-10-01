import { DateTime } from 'luxon';

export interface DemoRawSession {
  userName: string;
  startedAtISO: string;
  endedAtISO: string;
  energyKwh: number;
}

const DEMO_USERS = [
  { name: 'Anna Nielsen', chargeTendency: 'evening', avgKwh: 24, sessionsPerMonth: 11 },
  { name: 'Mikkel Sørensen', chargeTendency: 'night', avgKwh: 32, sessionsPerMonth: 8 },
  { name: 'Camilla Berg', chargeTendency: 'morning', avgKwh: 16, sessionsPerMonth: 6 },
];

// Simple seeded PRNG so demo data is reproducible across runs.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a realistic, multi-user, multi-month demo dataset (~14 months
 * ending last month) so the dashboard's monthly/YTD/YoY views all have
 * something meaningful to show. Purely synthetic — never overlaps real
 * imported data because it's tagged is_demo and uses distinct user names.
 */
export function generateDemoSessions(monthsBack = 14): DemoRawSession[] {
  const rand = mulberry32(42);
  const sessions: DemoRawSession[] = [];
  const now = DateTime.now().setZone('Europe/Copenhagen').startOf('month');

  for (let m = monthsBack; m >= 1; m--) {
    const monthStart = now.minus({ months: m });
    const daysInMonth = monthStart.daysInMonth ?? 30;

    for (const user of DEMO_USERS) {
      const sessionCount = Math.max(1, Math.round(user.sessionsPerMonth * (0.75 + rand() * 0.5)));
      const usedDays = new Set<number>();
      for (let i = 0; i < sessionCount; i++) {
        let day = 1 + Math.floor(rand() * daysInMonth);
        let attempts = 0;
        while (usedDays.has(day) && attempts < 5) {
          day = 1 + Math.floor(rand() * daysInMonth);
          attempts++;
        }
        usedDays.add(day);

        const startHour = pickStartHour(user.chargeTendency, rand);
        const startMinute = Math.floor(rand() * 60);
        const durationHours = 1.5 + rand() * 5;
        const start = monthStart.set({ day, hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
        const end = start.plus({ minutes: Math.round(durationHours * 60) });
        const kwh = Math.max(2, user.avgKwh * (0.5 + rand()));

        sessions.push({
          userName: user.name,
          startedAtISO: start.toUTC().toISO()!,
          endedAtISO: end.toUTC().toISO()!,
          energyKwh: Math.round(kwh * 100) / 100,
        });
      }
    }
  }

  return sessions.sort((a, b) => a.startedAtISO.localeCompare(b.startedAtISO));
}

function pickStartHour(tendency: string, rand: () => number): number {
  if (tendency === 'evening') return 17 + Math.floor(rand() * 5); // 17-21
  if (tendency === 'night') return (22 + Math.floor(rand() * 4)) % 24; // 22-01
  return 6 + Math.floor(rand() * 4); // morning 6-9
}

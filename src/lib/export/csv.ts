import type { UserTotal } from '../api/analytics';
import type { SessionWithCost } from '../types';
import { formatDanish } from '../timezone';

function toCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map(toCsvValue).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportUserTotalsToCsv(totals: UserTotal[], userNameById: Map<string, string>, filename: string) {
  const rows: string[][] = [['User', 'Sessions', 'kWh', 'Total Cost (DKK)', 'Avg DKK/kWh']];
  for (const t of totals) {
    rows.push([userNameById.get(t.userId) ?? 'Unknown', String(t.sessions), t.kwh.toFixed(3), t.cost.toFixed(2), t.avgPrice?.toFixed(3) ?? '']);
  }
  downloadCsv(rows, filename);
}

export function exportSessionsToCsv(sessions: SessionWithCost[], userNameById: Map<string, string>, filename: string) {
  const rows: string[][] = [
    ['User', 'Started', 'Ended', 'Duration (min)', 'kWh', 'Avg price (DKK/kWh)', 'Spot cost', 'Total cost', 'Flags'],
  ];
  for (const s of sessions) {
    rows.push([
      userNameById.get(s.user_id) ?? 'Unknown',
      formatDanish(s.started_at),
      formatDanish(s.ended_at),
      String(s.duration_minutes),
      s.energy_kwh.toFixed(3),
      s.cost?.avg_price_dkk_kwh?.toFixed(3) ?? '',
      s.cost?.spot_cost_dkk.toFixed(2) ?? '',
      s.cost?.total_cost_dkk.toFixed(2) ?? '',
      s.data_quality_flags.join(', '),
    ]);
  }
  downloadCsv(rows, filename);
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SessionWithCost } from '../types';
import { formatDanish } from '../timezone';
import { formatDkk, formatKwh, formatPriceDkkKwh } from '../format';

/** Individual user statement, suitable for attaching to an invoice. */
export function exportUserStatementToPdf(params: {
  userName: string;
  customerNumber?: string | null;
  periodLabel: string;
  sessions: SessionWithCost[];
  filename: string;
}) {
  const { userName, customerNumber, periodLabel, sessions, filename } = params;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('EV Charging Statement', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`User: ${userName}${customerNumber ? `  ·  Customer #: ${customerNumber}` : ''}`, 14, 26);
  doc.text(`Period: ${periodLabel}`, 14, 32);
  doc.text(`Generated: ${formatDanish(new Date().toISOString())}`, 14, 38);

  const totalKwh = sessions.reduce((s, r) => s + r.energy_kwh, 0);
  const totalCost = sessions.reduce((s, r) => s + (r.cost?.total_cost_dkk ?? 0), 0);
  const avgPrice = totalKwh > 0 ? totalCost / totalKwh : null;

  autoTable(doc, {
    startY: 44,
    head: [['Date', 'Start', 'End', 'kWh', 'Avg price', 'Total cost']],
    body: sessions.map((s) => [
      formatDanish(s.started_at, 'date'),
      formatDanish(s.started_at, 'time'),
      formatDanish(s.ended_at, 'time'),
      formatKwh(s.energy_kwh),
      formatPriceDkkKwh(s.cost?.avg_price_dkk_kwh ?? null),
      formatDkk(s.cost?.total_cost_dkk ?? 0),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [42, 120, 214] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(`Total sessions: ${sessions.length}`, 14, finalY);
  doc.text(`Total consumption: ${formatKwh(totalKwh)}`, 14, finalY + 6);
  doc.text(`Average price: ${formatPriceDkkKwh(avgPrice)}`, 14, finalY + 12);
  doc.setFontSize(12);
  doc.text(`Total amount due: ${formatDkk(totalCost)}`, 14, finalY + 20);

  doc.save(filename);
}

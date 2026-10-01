import { supabase } from '../supabaseClient';
import type { InvoiceStatus, InvoiceStatusValue } from '../types';

export async function listInvoiceStatuses(year?: number): Promise<InvoiceStatus[]> {
  let q = supabase.from('invoice_status').select('*');
  if (year) q = q.eq('year', year);
  const { data, error } = await q;
  if (error) throw error;
  return data as InvoiceStatus[];
}

export async function setInvoiceStatus(userId: string, year: number, month: number, status: InvoiceStatusValue, amountDkk?: number, reference?: string) {
  const { error } = await supabase.from('invoice_status').upsert(
    {
      user_id: userId,
      year,
      month,
      status,
      amount_dkk: amountDkk,
      invoice_reference: reference,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,year,month' }
  );
  if (error) throw error;
}

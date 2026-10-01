import { supabase } from '../supabaseClient';
import type { Charger } from '../types';

export async function listChargers(): Promise<Charger[]> {
  const { data, error } = await supabase.from('chargers').select('*').order('external_charger_id');
  if (error) throw error;
  return data as Charger[];
}

/** Find a charger by its external id, creating it if it doesn't exist yet (used during import). */
export async function getOrCreateCharger(externalChargerId: string, isDemo = false): Promise<Charger> {
  const { data: existing, error: findErr } = await supabase
    .from('chargers')
    .select('*')
    .eq('external_charger_id', externalChargerId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as Charger;

  const { data: created, error: insertErr } = await supabase
    .from('chargers')
    .insert({ external_charger_id: externalChargerId, is_demo: isDemo })
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  return created as Charger;
}

import { supabase } from '../supabaseClient';
import { deleteDemoSessions } from '../api/sessions';
import { deleteDemoUsersWithNoRealData } from '../api/users';

/**
 * Deletes all demo charging sessions, the demo import batch(es), and any
 * demo users/chargers left with zero real (non-demo) sessions. Real data
 * is never touched — this only ever targets rows explicitly flagged
 * is_demo = true.
 */
export async function deleteAllDemoData(): Promise<void> {
  await deleteDemoSessions(); // cascades to session_costs / session_cost_breakdown via FK

  const { error: importsErr } = await supabase.from('imports').delete().eq('is_demo', true);
  if (importsErr) throw importsErr;

  await deleteDemoUsersWithNoRealData();

  const { data: demoChargers } = await supabase.from('chargers').select('id').eq('is_demo', true);
  for (const c of demoChargers ?? []) {
    const { count } = await supabase.from('charging_sessions').select('id', { count: 'exact', head: true }).eq('charger_id', c.id);
    if (!count) await supabase.from('chargers').delete().eq('id', c.id);
  }
}

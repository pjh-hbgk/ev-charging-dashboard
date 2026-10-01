import { supabase } from '../supabaseClient';
import type { AppUser } from '../types';

export async function listUsers(options?: { includeInactive?: boolean }): Promise<AppUser[]> {
  let q = supabase.from('users').select('*').is('merged_into_user_id', null).order('name');
  if (!options?.includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data as AppUser[];
}

export async function getUser(id: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as AppUser | null;
}

/** Resolve a raw "User" name from an import row to a user record, creating one if new. */
export async function getOrCreateUserByName(
  name: string,
  externalUserId: string | null,
  isDemo = false
): Promise<AppUser> {
  const trimmed = name.trim();
  const { data: existing, error: findErr } = await supabase
    .from('users')
    .select('*')
    .ilike('name', trimmed)
    .is('merged_into_user_id', null)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as AppUser;

  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({ name: trimmed, external_user_id: externalUserId, is_demo: isDemo })
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  return created as AppUser;
}

export async function updateUser(id: string, patch: Partial<Pick<AppUser, 'name' | 'customer_number' | 'notes' | 'active'>>) {
  const { data, error } = await supabase
    .from('users')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AppUser;
}

/** Merge `sourceUserId`'s sessions into `targetUserId` and mark the source as merged. */
export async function mergeUsers(sourceUserId: string, targetUserId: string) {
  if (sourceUserId === targetUserId) throw new Error('Cannot merge a user into itself');
  const { error: moveErr } = await supabase
    .from('charging_sessions')
    .update({ user_id: targetUserId })
    .eq('user_id', sourceUserId);
  if (moveErr) throw moveErr;

  const { error: mergeErr } = await supabase
    .from('users')
    .update({ merged_into_user_id: targetUserId, active: false, updated_at: new Date().toISOString() })
    .eq('id', sourceUserId);
  if (mergeErr) throw mergeErr;
}

export async function deleteDemoUsersWithNoRealData() {
  // Only remove demo users that have zero non-demo sessions.
  const { data: demoUsers, error } = await supabase.from('users').select('id').eq('is_demo', true);
  if (error) throw error;
  for (const u of demoUsers ?? []) {
    const { count } = await supabase
      .from('charging_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('is_demo', false);
    if (!count) {
      await supabase.from('users').delete().eq('id', u.id);
    }
  }
}

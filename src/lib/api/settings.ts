import { supabase } from '../supabaseClient';
import type { AppSettingsValue, CostComponent } from '../types';

export const DEFAULT_SETTINGS: AppSettingsValue = {
  currency: 'DKK',
  date_format: 'dd-MM-yyyy',
  timezone: 'Europe/Copenhagen',
  price_area: 'DK2',
  price_source: 'energidataservice',
  vat_rate_percent: 25,
  default_cost_model: 'C_full',
  calculation_version: 1,
};

export async function getAppSettings(): Promise<AppSettingsValue> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'main').maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<AppSettingsValue>) };
}

export async function saveAppSettings(value: AppSettingsValue) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'main', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function bumpCalculationVersion(): Promise<number> {
  const current = await getAppSettings();
  const next = current.calculation_version + 1;
  await saveAppSettings({ ...current, calculation_version: next });
  return next;
}

export async function listCostComponents(): Promise<CostComponent[]> {
  const { data, error } = await supabase.from('cost_components').select('*').order('sort_order');
  if (error) throw error;
  return data as CostComponent[];
}

export async function upsertCostComponent(component: Partial<CostComponent> & { key: string; label: string; component_type: string }) {
  const { error } = await supabase
    .from('cost_components')
    .upsert({ ...component, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function deleteCostComponent(id: string) {
  const { error } = await supabase.from('cost_components').delete().eq('id', id);
  if (error) throw error;
}

export const DEFAULT_COST_COMPONENTS: Array<Omit<CostComponent, 'id' | 'updated_at'>> = [
  { key: 'grid_tariff', label: 'Grid tariff (net-tarif)', component_type: 'fixed_dkk_kwh', value_dkk_kwh: 0.65, percentage: null, time_schedule: null, applies_to_models: ['C_full'], enabled: true, sort_order: 1 },
  { key: 'electricity_tax', label: 'Electricity tax (elafgift)', component_type: 'fixed_dkk_kwh', value_dkk_kwh: 0.761, percentage: null, time_schedule: null, applies_to_models: ['C_full'], enabled: true, sort_order: 2 },
  { key: 'ok_surcharge', label: 'OK supplier surcharge', component_type: 'fixed_dkk_kwh', value_dkk_kwh: 0.1, percentage: null, time_schedule: null, applies_to_models: ['C_full'], enabled: true, sort_order: 3 },
  { key: 'subscription_allocation', label: 'Subscription allocation', component_type: 'fixed_dkk_kwh', value_dkk_kwh: 0, percentage: null, time_schedule: null, applies_to_models: ['C_full'], enabled: false, sort_order: 4 },
  { key: 'other_fee', label: 'Other fee', component_type: 'fixed_dkk_kwh', value_dkk_kwh: 0, percentage: null, time_schedule: null, applies_to_models: ['C_full'], enabled: false, sort_order: 5 },
];

// Core domain types — mirror the Supabase schema in supabase/migrations/0001_init.sql

export type UUID = string;

export interface Charger {
  id: UUID;
  external_charger_id: string;
  name: string | null;
  location: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface AppUser {
  id: UUID;
  external_user_id: string | null;
  name: string;
  customer_number: string | null;
  notes: string | null;
  active: boolean;
  is_demo: boolean;
  merged_into_user_id: UUID | null;
  created_at: string;
  updated_at: string;
}

export type DataQualityFlag =
  | 'zero_kwh'
  | 'negative_kwh'
  | 'missing_user'
  | 'missing_start'
  | 'missing_end'
  | 'end_before_start'
  | 'very_short_session'
  | 'very_large_session'
  | 'unknown_user_id'
  | 'price_missing'
  | 'duplicate_session';

export interface ChargingSession {
  id: UUID;
  source_session_id: string | null;
  dedup_key: string;
  user_id: UUID;
  charger_id: UUID;
  card_label: string | null;
  started_at: string; // ISO, UTC
  ended_at: string;
  duration_minutes: number;
  energy_kwh: number;
  energy_source: 'session_total' | 'interval_actual';
  source_import_id: UUID | null;
  is_demo: boolean;
  data_quality_flags: DataQualityFlag[];
  created_at: string;
}

export interface ElectricityPrice {
  id: UUID;
  price_area: string;
  hour_utc: string;
  price_dkk_kwh: number;
  includes_vat: boolean;
  source: string;
  retrieved_at: string;
}

export interface SessionCostBreakdownRow {
  id: UUID;
  session_id: UUID;
  interval_start: string;
  interval_end: string;
  allocated_kwh: number;
  allocation_method: 'proportional_duration' | 'actual';
  spot_price_dkk_kwh: number | null;
  price_missing: boolean;
  spot_cost_dkk: number | null;
  calculation_version: number;
}

export type CostModel = 'A_spot' | 'B_spot_vat' | 'C_full';

export interface SessionCost {
  id: UUID;
  session_id: UUID;
  calculation_version: number;
  cost_model: CostModel;
  spot_cost_dkk: number;
  supplier_cost_dkk: number;
  grid_cost_dkk: number;
  tax_cost_dkk: number;
  vat_cost_dkk: number;
  other_cost_dkk: number;
  total_cost_dkk: number;
  avg_price_dkk_kwh: number | null;
  price_missing: boolean;
  calculated_at: string;
}

export interface ImportRecord {
  id: UUID;
  import_id: UUID;
  row_number: number | null;
  status: 'new' | 'duplicate' | 'error' | 'review';
  raw_data: Record<string, unknown>;
  session_id: UUID | null;
  duplicate_of_session_id: UUID | null;
  message: string | null;
}

export interface ImportBatch {
  id: UUID;
  filename: string;
  imported_at: string;
  imported_by: string | null;
  records_found: number;
  records_new: number;
  records_duplicate: number;
  records_error: number;
  records_review: number;
  date_from: string | null;
  date_to: string | null;
  total_kwh_imported: number;
  is_demo: boolean;
  status: 'pending_review' | 'completed' | 'reverted';
  column_mapping: Record<string, string> | null;
  notes: string | null;
}

export type ComponentType = 'fixed_dkk_kwh' | 'percentage' | 'time_dependent';

export interface TimeScheduleEntry {
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
  value: number;
}

export interface CostComponent {
  id: UUID;
  key: string;
  label: string;
  component_type: ComponentType;
  value_dkk_kwh: number | null;
  percentage: number | null;
  time_schedule: TimeScheduleEntry[] | null;
  applies_to_models: CostModel[];
  enabled: boolean;
  sort_order: number;
  updated_at: string;
}

export interface AppSettingsValue {
  currency: 'DKK';
  date_format: string;
  timezone: string;
  price_area: string;
  price_source: 'energidataservice' | 'manual' | 'mock';
  vat_rate_percent: number;
  default_cost_model: CostModel;
  calculation_version: number;
}

export type InvoiceStatusValue = 'not_invoiced' | 'ready' | 'invoiced' | 'paid';

export interface InvoiceStatus {
  id: UUID;
  user_id: UUID;
  year: number;
  month: number;
  status: InvoiceStatusValue;
  invoice_reference: string | null;
  amount_dkk: number | null;
  updated_at: string;
}

export interface SessionCostRef {
  calculation_version: number;
  cost_model: CostModel;
  spot_cost_dkk: number;
  supplier_cost_dkk: number;
  grid_cost_dkk: number;
  tax_cost_dkk: number;
  vat_cost_dkk: number;
  other_cost_dkk: number;
  total_cost_dkk: number;
  avg_price_dkk_kwh: number | null;
  price_missing: boolean;
  calculated_at: string;
}

// Composite view row (v_session_latest_cost)
export interface SessionWithCost extends ChargingSession {
  cost?: SessionCostRef;
}

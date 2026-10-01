-- =====================================================================
-- EV Charging Dashboard — initial schema
-- Target: Supabase (Postgres 15+)
-- Design notes:
--   * All timestamps are stored as `timestamptz` (UTC under the hood).
--     The application converts to/from Europe/Copenhagen local time at
--     the edges (import + display) — see src/lib/timezone.ts. Never
--     store naive/local timestamps.
--   * Electricity prices are keyed by their UTC hour boundary
--     (hour_utc), because the underlying Nord Pool / Energi Data
--     Service hourly grid is uniform in UTC — local "23h/25h" days are
--     purely a *display* artifact of DST, not a gap in the price grid.
--   * charging_sessions.dedup_key is the duplicate-detection key used
--     when the source export has no reliable session id.
--   * calculation_version lets costs be recalculated (new settings,
--     new price source) without ever mutating/losing the original
--     session data.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Chargers (a physical charge point; the schema supports more than one
-- even though the current export only has one).
-- ---------------------------------------------------------------------
create table if not exists chargers (
  id                  uuid primary key default gen_random_uuid(),
  external_charger_id text not null unique,   -- e.g. "ZAG095101"
  name                 text,
  location             text,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Users (the people who share the charger and get billed)
-- ---------------------------------------------------------------------
create table if not exists users (
  id                 uuid primary key default gen_random_uuid(),
  external_user_id   text,                 -- raw "User" value from source export
  name               text not null,
  customer_number    text,
  notes              text,
  active             boolean not null default true,
  is_demo            boolean not null default false,
  merged_into_user_id uuid references users(id),  -- set when this user was merged into another
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_users_active on users(active);

-- ---------------------------------------------------------------------
-- Imports (one row per uploaded Excel file)
-- ---------------------------------------------------------------------
create table if not exists imports (
  id                uuid primary key default gen_random_uuid(),
  filename          text not null,
  imported_at       timestamptz not null default now(),
  imported_by       text,
  records_found     integer not null default 0,
  records_new       integer not null default 0,
  records_duplicate integer not null default 0,
  records_error     integer not null default 0,
  records_review    integer not null default 0,
  date_from         date,
  date_to           date,
  total_kwh_imported numeric(12,3) not null default 0,
  is_demo           boolean not null default false,
  status            text not null default 'completed', -- pending_review | completed | reverted
  column_mapping    jsonb,   -- the detected import mapping used, for auditability
  notes             text
);
create index if not exists idx_imports_imported_at on imports(imported_at desc);

-- Per-row outcome of an import, for the "view duplicates / errors" screen
create table if not exists import_records (
  id              uuid primary key default gen_random_uuid(),
  import_id       uuid not null references imports(id) on delete cascade,
  row_number      integer,
  status          text not null,  -- new | duplicate | error | review
  raw_data        jsonb not null,
  session_id      uuid,           -- set when status = new/duplicate and resolved to a session
  duplicate_of_session_id uuid,
  message         text
);
create index if not exists idx_import_records_import on import_records(import_id);
create index if not exists idx_import_records_status on import_records(status);

-- ---------------------------------------------------------------------
-- Charging sessions (the core fact table)
-- ---------------------------------------------------------------------
create table if not exists charging_sessions (
  id                  uuid primary key default gen_random_uuid(),
  source_session_id   text,                 -- if the export ever provides one
  dedup_key           text not null unique, -- composite fallback key, always populated
  user_id             uuid not null references users(id),
  charger_id          uuid not null references chargers(id),
  card_label          text,                 -- "Charge card" free text from export
  started_at          timestamptz not null,
  ended_at            timestamptz not null,
  duration_minutes    integer not null,
  energy_kwh          numeric(10,3) not null,
  energy_source       text not null default 'session_total', -- session_total | interval_actual
  source_import_id    uuid references imports(id),
  is_demo             boolean not null default false,
  data_quality_flags  text[] not null default '{}',  -- e.g. {zero_kwh, short_session, unknown_user}
  created_at          timestamptz not null default now()
);
create index if not exists idx_sessions_user on charging_sessions(user_id);
create index if not exists idx_sessions_charger on charging_sessions(charger_id);
create index if not exists idx_sessions_started on charging_sessions(started_at);
create index if not exists idx_sessions_import on charging_sessions(source_import_id);
create index if not exists idx_sessions_flags on charging_sessions using gin (data_quality_flags);

-- ---------------------------------------------------------------------
-- Electricity spot prices (cached from Energi Data Service or similar)
--
-- interval_start/interval_end are stored EXPLICITLY rather than assuming
-- a fixed width, because the real market resolution changed over time:
-- Energi Data Service's "Elspotprices" dataset published hourly prices
-- through late September 2025; from the ENTSO-E-wide market-time-unit
-- (MTU) harmonisation onward it publishes 15-minute prices under the
-- "DayAheadPrices" dataset (see src/lib/timezone.ts splitByPriceIntervals
-- and netlify/functions/fetch-prices.ts). Storing explicit bounds means
-- the cost engine never has to assume — and get wrong — the interval
-- width for a given historical period.
-- ---------------------------------------------------------------------
create table if not exists electricity_prices (
  id               uuid primary key default gen_random_uuid(),
  price_area       text not null,           -- 'DK2'
  interval_start   timestamptz not null,    -- UTC
  interval_end     timestamptz not null,    -- UTC, exclusive
  price_dkk_kwh    numeric(10,5) not null,  -- raw spot price, EXCLUDING vat/tariffs
  includes_vat     boolean not null default false,
  source           text not null,           -- 'energidataservice_dayahead' | 'energidataservice_elspot' | 'manual' | 'mock'
  retrieved_at     timestamptz not null default now(),
  unique (price_area, interval_start)
);
create index if not exists idx_prices_area_interval on electricity_prices(price_area, interval_start, interval_end);

-- ---------------------------------------------------------------------
-- Per-session cost breakdown across price intervals (auditability)
-- ---------------------------------------------------------------------
create table if not exists session_cost_breakdown (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references charging_sessions(id) on delete cascade,
  interval_start        timestamptz not null,
  interval_end          timestamptz not null,
  allocated_kwh         numeric(10,4) not null,
  allocation_method      text not null default 'proportional_duration', -- proportional_duration | actual
  spot_price_dkk_kwh    numeric(10,5),
  price_missing         boolean not null default false,
  spot_cost_dkk         numeric(10,4),
  calculation_version   integer not null
);
create index if not exists idx_breakdown_session on session_cost_breakdown(session_id, calculation_version);

-- ---------------------------------------------------------------------
-- Aggregated cost per session (latest calculation_version wins; older
-- versions are kept so recalculation is auditable/reversible)
-- ---------------------------------------------------------------------
create table if not exists session_costs (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references charging_sessions(id) on delete cascade,
  calculation_version  integer not null,
  cost_model           text not null,        -- 'A_spot' | 'B_spot_vat' | 'C_full'
  spot_cost_dkk        numeric(10,4) not null default 0,
  supplier_cost_dkk    numeric(10,4) not null default 0, -- OK surcharge / supplier margin
  grid_cost_dkk        numeric(10,4) not null default 0,
  tax_cost_dkk         numeric(10,4) not null default 0,
  vat_cost_dkk         numeric(10,4) not null default 0,
  other_cost_dkk       numeric(10,4) not null default 0,
  total_cost_dkk       numeric(10,4) not null default 0,
  avg_price_dkk_kwh    numeric(10,5),
  price_missing        boolean not null default false,
  calculated_at        timestamptz not null default now(),
  unique (session_id, calculation_version)
);
create index if not exists idx_session_costs_session on session_costs(session_id);
create index if not exists idx_session_costs_version on session_costs(calculation_version);

-- ---------------------------------------------------------------------
-- Configurable cost components (Settings → Electricity)
-- ---------------------------------------------------------------------
create table if not exists cost_components (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,       -- 'grid_tariff', 'electricity_tax', 'ok_surcharge', ...
  label         text not null,
  component_type text not null,             -- fixed_dkk_kwh | percentage | time_dependent
  value_dkk_kwh numeric(10,5),              -- used when component_type = fixed_dkk_kwh
  percentage    numeric(6,3),               -- used when component_type = percentage (of spot cost)
  time_schedule jsonb,                      -- used when component_type = time_dependent: [{from,to,value}]
  applies_to_models text[] not null default '{B_spot_vat,C_full}',
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- App-wide settings (single JSON document keyed by name)
-- ---------------------------------------------------------------------
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Invoicing / billing status — deliberately separate from charging data
-- ---------------------------------------------------------------------
create table if not exists invoice_status (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id),
  year              integer not null,
  month             integer not null check (month between 1 and 12),
  status            text not null default 'not_invoiced', -- not_invoiced | ready | invoiced | paid
  invoice_reference text,
  amount_dkk        numeric(10,2),
  updated_at        timestamptz not null default now(),
  unique (user_id, year, month)
);

-- ---------------------------------------------------------------------
-- Convenience view: latest cost per session joined with session+user
-- ---------------------------------------------------------------------
create or replace view v_session_latest_cost as
select
  cs.id as session_id,
  cs.user_id,
  cs.charger_id,
  cs.started_at,
  cs.ended_at,
  cs.duration_minutes,
  cs.energy_kwh,
  cs.energy_source,
  cs.data_quality_flags,
  cs.is_demo,
  sc.calculation_version,
  sc.cost_model,
  sc.spot_cost_dkk,
  sc.supplier_cost_dkk,
  sc.grid_cost_dkk,
  sc.tax_cost_dkk,
  sc.vat_cost_dkk,
  sc.other_cost_dkk,
  sc.total_cost_dkk,
  sc.avg_price_dkk_kwh,
  sc.price_missing,
  sc.calculated_at
from charging_sessions cs
left join lateral (
  select * from session_costs
  where session_costs.session_id = cs.id
  order by calculation_version desc
  limit 1
) sc on true;

-- =====================================================================
-- Row Level Security
-- This is a private, single-tenant admin tool. We require Supabase Auth
-- (email/password) and allow any authenticated user full access; the
-- anon key alone cannot read or write any table. Create your admin
-- login in Supabase Auth → Users after running these migrations.
-- =====================================================================
alter table chargers enable row level security;
alter table users enable row level security;
alter table imports enable row level security;
alter table import_records enable row level security;
alter table charging_sessions enable row level security;
alter table electricity_prices enable row level security;
alter table session_cost_breakdown enable row level security;
alter table session_costs enable row level security;
alter table cost_components enable row level security;
alter table app_settings enable row level security;
alter table invoice_status enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'chargers','users','imports','import_records','charging_sessions',
    'electricity_prices','session_cost_breakdown','session_costs',
    'cost_components','app_settings','invoice_status'
  ])
  loop
    execute format('drop policy if exists "authenticated_full_access" on %I;', t);
    execute format(
      'create policy "authenticated_full_access" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- electricity_prices is also readable by anon so a public read-only
-- price page could be exposed later if desired; writes still require auth.
drop policy if exists "anon_read_prices" on electricity_prices;
create policy "anon_read_prices" on electricity_prices for select to anon using (true);

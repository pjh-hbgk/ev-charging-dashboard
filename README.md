# EV Charging Dashboard

A production-ready dashboard for managing shared EV-charger usage: imports charging
sessions from Excel, matches every session against real DK2 (or DK1) electricity
spot prices, calculates who owes what, and gives you monthly/annual/financial
reporting you can hand to each user as an invoice basis.

Built with React + TypeScript + Vite + Tailwind + Recharts, Supabase (Postgres +
Auth) for persistence, and Netlify Functions for the electricity-price integration.
Designed to keep receiving new monthly Excel exports indefinitely without losing
history and without double-counting sessions.

## What's already known about your data

The importer was built and tested against a real "Installation detailed charge
history report" export (a Zaptec-style charger export): columns `User`, `Charger`,
`Charge card`, `Start`, `End`, `Duration (hh:mm)`, `Energy (kWh)`, with a few
metadata rows before the header and a trailing `Total` row. The column mapper is
fuzzy-matched (see `src/lib/import/fieldDefinitions.ts`), so it should keep working
even if the export format shifts slightly — but if your charger platform exports a
very differently-shaped file, check the Import Preview's "column mapping detected"
line after your first upload and extend the synonym lists there if needed.

## 1. Install dependencies

```bash
npm install
```

## 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (the free tier is enough for a single-charger, multi-year dataset).
2. In the SQL Editor, run the migration in `supabase/migrations/0001_init.sql`. This creates every table, the audit view, and Row Level Security policies.
3. Go to Authentication → Users → Add user, and create yourself an admin login (email + password). This is the only account model the app uses — anyone who can sign in has full access, matching a private single-household tool. There is no self-service signup.
4. Go to Project Settings → API and copy:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never expose this to the browser)

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in the Supabase values from step 2. The electricity price variables can be
left at their defaults (`DK2`, Energi Data Service — no API key required).

## 4. Run locally

```bash
npm run dev
```

Sign in with the admin user you created in Supabase Auth. The dashboard starts
empty — use **Data Management → Load Demo Data** to explore it with realistic
sample data (clearly marked with a **DEMO DATA ACTIVE** banner), or go straight to
**Data Management → Upload Excel file** with your real export.

Netlify Functions (the price-fetching endpoint) run separately from `vite dev`.
To test them locally too:

```bash
npm install -g netlify-cli   # once
netlify dev
```

This proxies both the Vite dev server and `netlify/functions/*` behind one URL,
which is what `src/lib/priceService.ts` expects (`/.netlify/functions/fetch-prices`).

## 5. Electricity price source

Prices come from [Energi Data Service](https://www.energidataservice.dk/), Energinet's
official open-data platform — no API key required. Two datasets are used
automatically (see `netlify/functions/fetch-prices.ts`):

- **DayAheadPrices** (current) — 15-minute settlement periods, live since the
  ENTSO-E-wide market-time-unit harmonisation in autumn 2025.
- **Elspotprices** (legacy) — hourly periods, used automatically as a fallback for
  dates before that cutover.

Both are stored in `electricity_prices` with explicit `interval_start`/`interval_end`
bounds (never an assumed fixed width), so the cost engine always segments a
charging session against the *real* price-interval boundaries for that period —
correct across the 60→15 minute transition and across DST changes alike. If a
different or more official DK price source becomes preferable later, only
`fetch-prices.ts` needs to change; nothing else depends on the source.

## 6. Cost models & OK-specific pricing

Configure everything in **Settings → Electricity** and **Settings → Cost
Components**:

- **Model A** — spot price only.
- **Model B** — spot price + VAT.
- **Model C** — spot + grid tariff + electricity tax + OK supplier surcharge + any
  other fee you add, then VAT on top. Every component can be a fixed DKK/kWh
  amount, a percentage of the spot cost, or time-dependent (e.g. a different
  night-rate grid tariff), and can be toggled on/off per model.

Changing any of this doesn't touch existing session data — click **Recalculate
Costs** (Data Management, or Settings → Cost Components) to compute a new
`calculation_version`. Every previous version is kept in `session_costs` /
`session_cost_breakdown` for audit, so you can always see what a session cost
under the old configuration too.

## 7. Monthly workflow

1. Export the month's usage report from your charger platform.
2. Data Management → Upload Excel file → review the import preview (new / duplicate / error / review counts, missing-column and missing-data warnings) → Confirm import.
3. The import automatically fetches electricity prices for the imported date range and recalculates costs.
4. Check Dashboard → Data Quality and Electricity Prices → "sessions missing prices" for anything that needs attention (a session is **never** silently costed at zero when a price is missing).
5. Use Financial Overview to mark months as ready/invoiced/paid per user, and export a PDF statement per user for invoicing.

Duplicate detection uses the source session ID if the export ever provides one,
otherwise a composite key (user + charger + start + end + kWh) — so re-uploading
an overlapping file (e.g. re-exporting "year to date" every month) is safe and
never creates duplicate sessions.

## 8. Build

```bash
npm run build
```

## 9. Deploy to Netlify

1. Push this project to a Git repository and connect it in Netlify, **or** deploy directly:
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod
   ```
2. Netlify picks up `netlify.toml` automatically (build command, publish dir `dist`, functions dir, SPA redirect, and a daily scheduled price refresh).
3. Site configuration → Environment variables — set the same keys as `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ELECTRICITY_PRICE_API_URL`, `ELECTRICITY_PRICE_AREA`, `VITE_ELECTRICITY_PRICE_AREA`
4. Trigger a deploy. Sign in with the Supabase admin user from step 2.
5. To keep it private, either rely on the Supabase-Auth login screen alone, or additionally enable Netlify's own Password Protection / Netlify Identity on the site (Site configuration → Visitor access).

## 10. Importing your first real file

Once deployed (or running locally against your real Supabase project), go to
**Data Management → Upload Excel file**, pick your first monthly export, review
the preview, and confirm. If you loaded demo data to evaluate the dashboard
first, remove it afterwards from the same page: **Delete All Demo Data** (type
`DELETE DEMO DATA` to confirm) — this only ever removes rows flagged as demo and
never touches real imports.

## Project structure

```
src/
  lib/
    timezone.ts        Europe/Copenhagen DST-safe conversions, price-interval splitting
    cost/costEngine.ts  Interval allocation + configurable cost-model math (unit tested)
    cost/recalculate.ts Recalculation orchestrator (new calculation_version, never mutates source data)
    import/             Excel column-mapping, preview, duplicate detection, commit
    api/                Typed Supabase data-access layer
    demo/                Demo dataset generator + deletion
    export/              CSV / Excel / PDF export
  pages/                 One file per nav item (see Sidebar.tsx)
netlify/functions/
  fetch-prices.ts        Energi Data Service integration (isolated — swap the source here only)
supabase/migrations/
  0001_init.sql           Full schema, indexes, audit view, RLS policies
```

## Testing

```bash
npm test
```

Covers the DST-correctness of the timezone helpers (including the 23-hour and
25-hour transition days), the interval-allocation cost engine (hourly and
15-minute resolutions, missing-price handling), and the import pipeline against
a real charger export fixture.

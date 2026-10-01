import { getOrCreateUserByName } from '../api/users';
import { getOrCreateCharger } from '../api/chargers';
import { insertSessions, type NewSessionInput } from '../api/sessions';
import { createImportBatch, updateImportBatchTotals } from '../api/imports';
import { generateDemoSessions } from './generateDemoSessions';
import { refreshElectricityPrices } from '../priceService';
import { recalculateAllCosts } from '../cost/recalculate';
import { getAppSettings, listCostComponents, upsertCostComponent, saveAppSettings, DEFAULT_COST_COMPONENTS } from '../api/settings';

const DEMO_CHARGER_ID = 'DEMO-CHARGER-01';

export async function loadDemoData(onProgress?: (label: string) => void): Promise<{ sessionsCreated: number }> {
  onProgress?.('Ensuring default settings & cost components exist…');
  const settings = await getAppSettings();
  await saveAppSettings(settings);
  const existingComponents = await listCostComponents();
  if (existingComponents.length === 0) {
    for (const c of DEFAULT_COST_COMPONENTS) await upsertCostComponent(c);
  }

  onProgress?.('Generating synthetic charging sessions…');
  const raw = generateDemoSessions();
  const charger = await getOrCreateCharger(DEMO_CHARGER_ID, true);

  const userIdCache = new Map<string, string>();
  const newSessions: NewSessionInput[] = [];
  for (const r of raw) {
    let userId = userIdCache.get(r.userName);
    if (!userId) {
      const user = await getOrCreateUserByName(r.userName, null, true);
      userId = user.id;
      userIdCache.set(r.userName, userId);
    }
    const dedupKey = `cmp:${DEMO_CHARGER_ID.toLowerCase()}|${r.userName.toLowerCase()}|${r.startedAtISO}|${r.endedAtISO}|${r.energyKwh.toFixed(3)}`;
    newSessions.push({
      source_session_id: null,
      dedup_key: dedupKey,
      user_id: userId,
      charger_id: charger.id,
      card_label: 'Demo key',
      started_at: r.startedAtISO,
      ended_at: r.endedAtISO,
      duration_minutes: Math.round((new Date(r.endedAtISO).getTime() - new Date(r.startedAtISO).getTime()) / 60000),
      energy_kwh: r.energyKwh,
      source_import_id: '', // filled below
      is_demo: true,
      data_quality_flags: [],
    });
  }

  onProgress?.('Recording demo import batch…');
  const importBatch = await createImportBatch({
    filename: 'demo-data-generator',
    date_from: raw[0]?.startedAtISO.slice(0, 10) ?? null,
    date_to: raw[raw.length - 1]?.startedAtISO.slice(0, 10) ?? null,
    column_mapping: {},
    is_demo: true,
  });
  newSessions.forEach((s) => (s.source_import_id = importBatch.id));

  onProgress?.('Inserting demo sessions…');
  const ids = await insertSessions(newSessions);
  await updateImportBatchTotals(importBatch.id, {
    records_found: newSessions.length,
    records_new: newSessions.length,
    records_duplicate: 0,
    records_error: 0,
    records_review: 0,
    total_kwh_imported: newSessions.reduce((s, r) => s + r.energy_kwh, 0),
  });

  if (raw.length > 0) {
    onProgress?.('Fetching electricity prices for the demo period…');
    const from = new Date(raw[0].startedAtISO);
    from.setDate(from.getDate() - 1);
    const to = new Date(raw[raw.length - 1].endedAtISO);
    to.setDate(to.getDate() + 2);
    try {
      await refreshElectricityPrices(from.toISOString(), to.toISOString(), settings.price_area);
    } catch {
      // if the live API is unreachable in this environment, recalculation
      // will simply flag demo sessions as price_missing — still a valid
      // demonstration of that data-quality feature.
    }
  }

  onProgress?.('Calculating electricity costs…');
  await recalculateAllCosts();

  return { sessionsCreated: ids.length };
}

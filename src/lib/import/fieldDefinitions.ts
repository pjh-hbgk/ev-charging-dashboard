// Known target fields the importer tries to recognize in an arbitrary
// Excel export, with a list of header synonyms per field. This is what
// lets the importer keep working if the exported column names shift
// slightly (e.g. "Energy (kWh)" vs "Total Energy" vs "kWh").

export type MappedField =
  | 'user'
  | 'external_user_id'
  | 'charger'
  | 'card_label'
  | 'session_id'
  | 'start'
  | 'end'
  | 'duration'
  | 'energy_kwh';

export interface FieldDefinition {
  field: MappedField;
  required: boolean;
  synonyms: string[];
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    field: 'user',
    required: true,
    synonyms: ['user', 'user name', 'username', 'driver', 'owner', 'account holder', 'customer', 'bruger', 'navn'],
  },
  {
    field: 'external_user_id',
    required: false,
    synonyms: ['user id', 'userid', 'rfid', 'tag id', 'idtag', 'id_tag', 'uid', 'rfid tag'],
  },
  {
    field: 'charger',
    required: true,
    synonyms: ['charger', 'charger id', 'chargepoint', 'charge point', 'evse', 'station', 'charger name', 'device'],
  },
  {
    field: 'card_label',
    required: false,
    synonyms: ['charge card', 'card', 'card name', 'key', 'nøgle'],
  },
  {
    field: 'session_id',
    required: false,
    synonyms: ['session id', 'sessionid', 'transaction id', 'txn id', 'charge id', 'transaction', 'id'],
  },
  {
    field: 'start',
    required: true,
    synonyms: ['start', 'start date', 'start time', 'begin', 'charging start', 'session start', 'start dato'],
  },
  {
    field: 'end',
    required: true,
    synonyms: ['end', 'end date', 'end time', 'stop', 'charging end', 'session end', 'slut'],
  },
  {
    field: 'duration',
    required: false,
    synonyms: ['duration', 'duration (hh:mm)', 'length', 'charging duration', 'varighed'],
  },
  {
    field: 'energy_kwh',
    required: true,
    synonyms: ['energy', 'energy (kwh)', 'kwh', 'consumption', 'total energy', 'energy consumed', 'forbrug'],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ');
}

/** Score how well a raw header string matches a field's synonym list. 0-100. */
export function scoreHeaderMatch(header: string, def: FieldDefinition): number {
  const h = normalize(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of def.synonyms) {
    const s = normalize(syn);
    if (h === s) return 100;
    if (h.includes(s) || s.includes(h)) best = Math.max(best, 78);
    // word-overlap score
    const hWords = new Set(h.split(' '));
    const sWords = s.split(' ');
    const overlap = sWords.filter((w) => hWords.has(w)).length;
    if (overlap > 0) best = Math.max(best, (overlap / sWords.length) * 60);
  }
  return best;
}

/** Given a row of raw header strings, find the best field mapping (column index -> field). */
export function detectColumnMapping(headerRow: (string | null)[]): Map<number, { field: MappedField; confidence: number }> {
  const mapping = new Map<number, { field: MappedField; confidence: number }>();
  const claimed = new Set<MappedField>();

  // Build all candidate (col, field, score) triples, sort by score desc, then
  // greedily assign to avoid two columns claiming the same field.
  const candidates: Array<{ col: number; field: MappedField; score: number }> = [];
  headerRow.forEach((raw, col) => {
    if (!raw) return;
    for (const def of FIELD_DEFINITIONS) {
      const score = scoreHeaderMatch(raw, def);
      if (score >= 40) candidates.push({ col, field: def.field, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const claimedCols = new Set<number>();
  for (const c of candidates) {
    if (claimed.has(c.field) || claimedCols.has(c.col)) continue;
    mapping.set(c.col, { field: c.field, confidence: c.score });
    claimed.add(c.field);
    claimedCols.add(c.col);
  }
  return mapping;
}

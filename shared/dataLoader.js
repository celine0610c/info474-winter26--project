// ============================================================
//  shared/dataLoader.js
//
//  Reads the local CSV file and parses it into an array of
//  plain JS objects. Caches the result so multiple sketches
//  can call loadRampData() without re-reading the file.
//
//  USAGE (in any sketch):
//    const rows = await loadRampData();
//    console.log(rows[0]); // see all available field names
// ============================================================

let _cache = null;

async function loadRampData() {
  if (_cache) return _cache; // return cached data if already loaded

  // ⚠️ UPDATE THIS to match your exact filename in the data/ folder
  const CSV_PATH = 'data/Curb_Ramps_CDL_-812241815784101376.csv';

  const response = await fetch(CSV_PATH);

  if (!response.ok) {
    throw new Error(`Could not load CSV: ${response.status} — check the filename in CSV_PATH`);
  }

  const text = await response.text();
  _cache = parseCSV(text);

  // These two lines print to the browser console (F12)
  // Use them to find the exact field names for your sketches
  console.log(`[dataLoader] ✓ Loaded ${_cache.length} ramp records`);
  console.log('[dataLoader] Available fields:', Object.keys(_cache[0]));

  return _cache;
}

// ── CSV parser ───────────────────────────────────────────────
// Handles quoted fields and comma-separated values
function parseCSV(text) {
  const lines = text.trim().split('\n');

  // First line is the header row
  const headers = parseCSVLine(lines[0]);

  // Every remaining line becomes an object keyed by header
  return lines.slice(1)
    .filter(line => line.trim() !== '') // skip blank lines
    .map(line => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((header, i) => {
        row[header] = values[i] !== undefined ? values[i] : '';
      });
      return row;
    });
}

// Parses a single CSV line, respecting quoted fields
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // toggle quote mode; handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current.trim()); // push the last field
  return result;
}
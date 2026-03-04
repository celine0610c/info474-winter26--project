// ============================================================
//  shared/dataLoader.js
//
//  1. Reads the local CSV and parses it into row objects
//  2. Converts x/y State Plane (EPSG:2926) coords to lat/lon
//  3. Fetches Seattle neighborhood GeoJSON and tags each ramp
//     with a NEIGHBORHOOD field via point-in-polygon lookup
//  4. Caches everything so multiple sketches share one load
//
//  USAGE:
//    const rows = await loadRampData();
//    rows[0].NEIGHBORHOOD // e.g. "Capitol Hill"
// ============================================================

// ⚠️ UPDATE to match your exact CSV filename in data/
const CSV_PATH = 'data/Curb_Ramps_CDL_-812241815784101376.csv';

// Seattle neighborhood GeoJSON — City of Seattle open data
const NEIGHBORHOODS_GEOJSON_URL = 'data/seattle-neighborhoods.geojson';

let _cache = null;

async function loadRampData() {
  if (_cache) return _cache;

  // ── 1. Load and parse CSV ──────────────────────────────────
  const response = await fetch(CSV_PATH);
  if (!response.ok) {
    throw new Error(`Could not load CSV: ${response.status} — check CSV_PATH`);
  }
  const text = await response.text();
  const rows = parseCSV(text);
  console.log(`[dataLoader] ✓ Loaded ${rows.length} ramp records`);

  // ── 2. Convert State Plane coords to lat/lon ───────────────
  for (const row of rows) {
    const x = parseFloat(row.x);
    const y = parseFloat(row.y);
    if (!isNaN(x) && !isNaN(y)) {
      const ll = statePlaneToLatLon(x, y);
      row._lat = ll.lat;
      row._lon = ll.lon;
    } else {
      row._lat = null;
      row._lon = null;
    }
  }
  console.log('[dataLoader] ✓ Coordinates converted');

  // ── 3. Fetch neighborhood polygons and tag each ramp ───────
  try {
    const geoRes = await fetch(NEIGHBORHOODS_GEOJSON_URL);
    if (!geoRes.ok) throw new Error(`GeoJSON fetch failed: ${geoRes.status}`);
    const geoJson = await geoRes.json();
    const features = geoJson.features || [];
    console.log(`[dataLoader] ✓ Loaded ${features.length} neighborhood polygons`);

    // Tag each ramp — skip rows with no coordinates
    let tagged = 0;
    for (const row of rows) {
      if (row._lat === null || row._lon === null) {
        row.NEIGHBORHOOD = 'Unknown';
        continue;
      }
      const name = findNeighborhood(row._lon, row._lat, features);
      row.NEIGHBORHOOD = name || 'Unknown';
      if (name) tagged++;
    }
    console.log(`[dataLoader] ✓ Tagged ${tagged} ramps with neighborhood names`);
  } catch (e) {
    console.warn('[dataLoader] Could not load neighborhoods:', e.message);
    for (const row of rows) row.NEIGHBORHOOD = 'Unknown';
  }

  _cache = rows;
  return _cache;
}

// ============================================================
//  State Plane (EPSG:2926) → WGS84 lat/lon
//  Washington State Plane North, US Survey Feet
//  Approximate conversion using a Lambert Conformal Conic
//  inverse projection. Accurate to ~1–2m for Seattle.
// ============================================================
function statePlaneToLatLon(x, y) {
  // EPSG:2926 parameters
  const a   = 6378137.0;          // semi-major axis (meters)
  const f   = 1 / 298.257222101;  // flattening
  const e2  = 2 * f - f * f;      // eccentricity squared
  const e   = Math.sqrt(e2);

  const lat0 = toRad(47.0);       // latitude of origin
  const lon0 = toRad(-120.8333333333); // central meridian
  const lat1 = toRad(47.5);       // standard parallel 1
  const lat2 = toRad(48.7333333333);   // standard parallel 2
  const FE   = 500000.0;          // false easting (meters)
  const FN   = 0.0;               // false northing (meters)

  // Convert US survey feet to meters
  const FEET_TO_M = 1200 / 3937;
  const xm = x * FEET_TO_M;
  const ym = y * FEET_TO_M;

  // LCC parameters
  const m1  = mFunc(lat1, e);
  const m2  = mFunc(lat2, e);
  const t0  = tFunc(lat0, e);
  const t1  = tFunc(lat1, e);
  const t2  = tFunc(lat2, e);

  const n   = (Math.log(m1) - Math.log(m2)) /
              (Math.log(t1) - Math.log(t2));
  const F   = m1 / (n * Math.pow(t1, n));
  const r0  = a * F * Math.pow(t0, n);

  const dx  = xm - FE;
  const dy  = ym - FN;
  const r   = Math.sign(n) * Math.sqrt(dx * dx + (r0 - dy) * (r0 - dy));
  const t   = Math.pow(r / (a * F), 1 / n);
  const theta = Math.atan2(dx, r0 - dy);

  const lon = theta / n + lon0;

  // Iterative latitude solution
  let lat = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const es     = e * sinLat;
    lat = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - es) / (1 + es), e / 2));
  }

  return { lat: toDeg(lat), lon: toDeg(lon) };
}

function mFunc(lat, e) {
  const sinLat = Math.sin(lat);
  return Math.cos(lat) / Math.sqrt(1 - e * e * sinLat * sinLat);
}

function tFunc(lat, e) {
  const sinLat = Math.sin(lat);
  return Math.tan(Math.PI / 4 - lat / 2) /
    Math.pow((1 - e * sinLat) / (1 + e * sinLat), e / 2);
}

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// ============================================================
//  Point-in-polygon — ray casting algorithm
//  Works on GeoJSON Feature with Polygon or MultiPolygon
// ============================================================
function findNeighborhood(lon, lat, features) {
  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;

    const name = feature.properties.S_HOOD ||
                 feature.properties.L_HOOD ||
                 feature.properties.NEIGHBORHO ||
                 feature.properties.NAME ||
                 feature.properties.name ||
                 null;
    if (!name) continue;

    if (geom.type === 'Polygon') {
      if (pointInPolygon(lon, lat, geom.coordinates[0])) return name;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (pointInPolygon(lon, lat, poly[0])) return name;
      }
    }
  }
  return null;
}

// Ray casting: returns true if [lon, lat] is inside ring
function pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ============================================================
//  CSV parser — handles quoted fields
// ============================================================
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim() !== '')
    .map(line => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] !== undefined ? values[i] : ''; });
      return row;
    });
}

function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
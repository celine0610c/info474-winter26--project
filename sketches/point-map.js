// ============================================================
//  choropleth.js
//  Static choropleth map — ramp accessibility by neighborhood
//
//  Metric: % of ramps rated Good in each neighborhood
//    Green  = high % good  (accessible)
//    Red    = low % good   (needs attention)
//
//  Uses Leaflet.js for the map, loaded via CDN in index.html.
//  Neighborhood polygons come from the same GeoJSON already
//  fetched by dataLoader.js.
//
//  DEPENDS ON: shared/dataLoader.js
// ============================================================

const CHOROPLETH_GEOJSON_URL =
  'https://data-seattlecitygis.opendata.arcgis.com/api/download/v1/items/b4a142f592e94d39a3bf787f3c112c1d/geojson?layers=0';

// Color scale: red → amber → green based on % good
function accessibilityColor(pct) {
  if (pct === null) return '#e0e0e5';   // no data — light gray
  if (pct >= 80)   return '#34c759';    // great
  if (pct >= 60)   return '#7dce8f';    // good
  if (pct >= 40)   return '#ffd60a';    // moderate
  if (pct >= 20)   return '#ff9f0a';    // poor
  return '#ff3b30';                      // very poor
}

(async function () {
  const container = document.getElementById('choropleth-container');
  if (!container) return;

  container.innerHTML = `<div class="sf-loading">Building neighborhood map…</div>`;

  // ── Load ramp data ─────────────────────────────────────────
  let rows = [];
  try {
    rows = await loadRampData();
  } catch (e) {
    container.innerHTML = `<div class="sf-error">Failed to load ramp data.</div>`;
    return;
  }

  // ── Load neighborhood GeoJSON ──────────────────────────────
  let geoJson = null;
  try {
    const res = await fetch(CHOROPLETH_GEOJSON_URL);
    if (!res.ok) throw new Error(`GeoJSON fetch failed: ${res.status}`);
    geoJson = await res.json();
  } catch (e) {
    container.innerHTML = `<div class="sf-error">Failed to load neighborhood boundaries.</div>`;
    return;
  }

  // ── Compute accessibility score per neighborhood ───────────
  // Score = % of ramps rated Good
  const hoodStats = {}; // { name: { good, total } }

  for (const row of rows) {
    const hood = (row.NEIGHBORHOOD || '').trim();
    if (!hood || hood === 'Unknown') continue;

    if (!hoodStats[hood]) hoodStats[hood] = { good: 0, total: 0 };
    hoodStats[hood].total++;

    const cond = (row.CONDITION || '').trim().toLowerCase();
    if (cond === 'good' || cond === 'excellent') hoodStats[hood].good++;
  }

  // ── Set up Leaflet map ─────────────────────────────────────
  container.innerHTML = '';

  const map = L.map(container, {
    center:        [47.608, -122.335],
    zoom:          11,
    zoomControl:   true,
    scrollWheelZoom: false,   // don't hijack page scroll
    attributionControl: true,
  });

  // Minimal light tile layer matching the site theme
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  // ── Tooltip ────────────────────────────────────────────────
  const info = L.control({ position: 'topright' });

  info.onAdd = function () {
    this._div = L.DomUtil.create('div', 'choropleth-tooltip');
    this._div.innerHTML = '<span>Hover a neighborhood</span>';
    return this._div;
  };

  info.update = function (name, stats) {
    if (!name) {
      this._div.innerHTML = '<span>Hover a neighborhood</span>';
      return;
    }
    const pct = stats
      ? Math.round((stats.good / stats.total) * 100)
      : null;
    const total = stats ? stats.total.toLocaleString() : '—';
    const good  = stats ? stats.good.toLocaleString()  : '—';
    this._div.innerHTML = `
      <strong>${name}</strong>
      <br>${pct !== null ? pct + '% good condition' : 'No data'}
      <br><span style="color:#6e6e73;font-size:0.75rem">${good} good of ${total} ramps</span>
    `;
  };

  info.addTo(map);

  // ── GeoJSON layer ──────────────────────────────────────────
  function getNeighborhoodName(props) {
    return props.L_HOOD || props.S_HOOD || props.NEIGHBORHO || props.NAME || props.name || null;
  }

  L.geoJSON(geoJson, {
    style: function (feature) {
      const name  = getNeighborhoodName(feature.properties);
      const stats = name ? hoodStats[name] : null;
      const pct   = stats ? (stats.good / stats.total) * 100 : null;
      return {
        fillColor:   accessibilityColor(pct),
        fillOpacity: 0.75,
        color:       '#ffffff',
        weight:      1.5,
        opacity:     1,
      };
    },
    onEachFeature: function (feature, layer) {
      const name  = getNeighborhoodName(feature.properties);
      const stats = name ? hoodStats[name] : null;

      layer.on({
        mouseover: function (e) {
          const l = e.target;
          l.setStyle({ weight: 3, fillOpacity: 0.92, color: '#1d1d1f' });
          l.bringToFront();
          info.update(name, stats);
        },
        mouseout: function (e) {
          geojsonLayer.resetStyle(e.target);
          info.update(null, null);
        },
        click: function (e) {
          map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
        },
      });
    },
  }).addTo(map);

  // Keep reference for resetStyle
  const geojsonLayer = L.geoJSON(geoJson, {
    style: function (feature) {
      const name  = getNeighborhoodName(feature.properties);
      const stats = name ? hoodStats[name] : null;
      const pct   = stats ? (stats.good / stats.total) * 100 : null;
      return {
        fillColor:   accessibilityColor(pct),
        fillOpacity: 0.75,
        color:       '#ffffff',
        weight:      1.5,
      };
    },
  }).addTo(map);

  // Remove the duplicate first layer
  map.eachLayer(l => {
    if (l instanceof L.GeoJSON && l !== geojsonLayer) map.removeLayer(l);
  });

  // ── Legend ─────────────────────────────────────────────────
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function () {
    const div    = L.DomUtil.create('div', 'choropleth-legend');
    const grades = [80, 60, 40, 20, 0];
    const labels = ['80–100%', '60–80%', '40–60%', '20–40%', '0–20%'];
    div.innerHTML = '<strong>% Good ramps</strong><br>';
    grades.forEach((g, i) => {
      div.innerHTML +=
        `<span class="legend-dot" style="background:${accessibilityColor(g)}"></span>${labels[i]}<br>`;
    });
    div.innerHTML +=
      `<span class="legend-dot" style="background:#e0e0e5"></span>No data`;
    return div;
  };

  legend.addTo(map);

  console.log('[choropleth] ✓ Map rendered');
})();
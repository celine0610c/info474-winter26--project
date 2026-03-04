// ============================================================
//  point-map.js  —  Neighborhood accessibility choropleth
//  DEPENDS ON: shared/dataLoader.js, Leaflet CSS + JS
// ============================================================

const CHOROPLETH_URL = 'data/seattle-neighborhoods.geojson';

function accessibilityColor(pct) {
  if (pct === null || pct === undefined) return '#e0e0e5';
  if (pct >= 80) return '#34c759';
  if (pct >= 60) return '#7dce8f';
  if (pct >= 40) return '#ffd60a';
  if (pct >= 20) return '#ff9f0a';
  return '#ff3b30';
}

function getHoodName(props) {
  return props.S_HOOD || props.L_HOOD || props.NEIGHBORHO || props.NAME || props.name || null;
}

// Initialize map immediately — don't wait for data
const map = L.map('choropleth-container', {
  center: [47.608, -122.335],
  zoom: 11,
  zoomControl: true,
  scrollWheelZoom: false,
  attributionControl: true,
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
}).addTo(map);

// Tooltip control
const info = L.control({ position: 'topright' });
info.onAdd = function () {
  this._div = L.DomUtil.create('div', 'choropleth-tooltip');
  this._div.innerHTML = '<span>Hover a neighborhood</span>';
  return this._div;
};
info.update = function (name, stats) {
  if (!name) { this._div.innerHTML = '<span>Hover a neighborhood</span>'; return; }
  const pct   = stats ? Math.round((stats.good / stats.total) * 100) : null;
  const total = stats ? stats.total.toLocaleString() : '—';
  const good  = stats ? stats.good.toLocaleString() : '—';
  this._div.innerHTML = `
    <strong>${name}</strong><br>
    ${pct !== null ? pct + '% good condition' : 'No data'}<br>
    <span style="color:#6e6e73;font-size:0.75rem">${good} good of ${total} ramps</span>
  `;
};
info.addTo(map);

// Legend
const legend = L.control({ position: 'bottomright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'choropleth-legend');
  div.innerHTML = `
    <strong>% Good ramps</strong><br>
    <span class="legend-dot" style="background:#34c759"></span>80–100%<br>
    <span class="legend-dot" style="background:#7dce8f"></span>60–80%<br>
    <span class="legend-dot" style="background:#ffd60a"></span>40–60%<br>
    <span class="legend-dot" style="background:#ff9f0a"></span>20–40%<br>
    <span class="legend-dot" style="background:#ff3b30"></span>0–20%<br>
    <span class="legend-dot" style="background:#e0e0e5"></span>No data
  `;
  return div;
};
legend.addTo(map);

// Force size recalculation after a short delay
setTimeout(() => map.invalidateSize(), 200);
setTimeout(() => map.invalidateSize(), 600);

// Load data and paint neighborhoods
async function paintMap() {
  try {
    const [rows, geoRes] = await Promise.all([
      loadRampData(),
      fetch(CHOROPLETH_URL),
    ]);

    const geoJson = await geoRes.json();

    // Compute % good per neighborhood
    const stats = {};
    for (const row of rows) {
      const hood = (row.NEIGHBORHOOD || '').trim();
      if (!hood || hood === 'Unknown') continue;
      if (!stats[hood]) stats[hood] = { good: 0, total: 0 };
      stats[hood].total++;
      const cond = (row.CONDITION || '').trim().toLowerCase();
      if (cond === 'good' || cond === 'excellent') stats[hood].good++;
    }

    // Add colored polygons
    let geojsonLayer;

    geojsonLayer = L.geoJSON(geoJson, {
      style: function (feature) {
        const name = getHoodName(feature.properties);
        const s    = name ? stats[name] : null;
        const pct  = s ? (s.good / s.total) * 100 : null;
        return {
          fillColor:   accessibilityColor(pct),
          fillOpacity: 0.75,
          color:       '#ffffff',
          weight:      1.5,
        };
      },
      onEachFeature: function (feature, layer) {
        const name = getHoodName(feature.properties);
        const s    = name ? stats[name] : null;
        layer.on({
          mouseover: function (e) {
            e.target.setStyle({ weight: 3, fillOpacity: 0.92, color: '#1d1d1f' });
            e.target.bringToFront();
            info.update(name, s);
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

    map.invalidateSize();
    console.log('[point-map] ✓ Map painted with', Object.keys(stats).length, 'neighborhoods');

  } catch (e) {
    console.error('[point-map] Failed:', e);
  }
}

paintMap();
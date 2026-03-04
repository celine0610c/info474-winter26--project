// ============================================================
//  search-filter.js
//  Interactive search & filter panel
//  Filters by condition, neighborhood, and install year
//
//  DEPENDS ON: shared/dataLoader.js (must load first)
//  dataLoader.js tags each row with a NEIGHBORHOOD field
//  via point-in-polygon lookup against Seattle's GeoJSON.
// ============================================================

const searchFilterSketch = (p) => {
  const PAD = { top: 18, right: 18, bottom: 18, left: 18 };

  let W, H;
  let rows     = [];
  let filtered = [];
  let dataReady = false;
  let errorMsg  = null;
  let ui        = null;

  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 420;
    p.createCanvas(W, H).parent('search-filter-container');
    p.textFont('-apple-system, "Helvetica Neue", sans-serif');
    p.noLoop();
    loadData();
  };

  p.draw = function () {
    p.background(255);
    if (errorMsg)   { drawError(errorMsg); return; }
    if (!dataReady) { drawSpinner();       return; }
    drawResults();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
    if (dataReady) p.redraw();
  };

  // ── data ───────────────────────────────────────────────────
  async function loadData() {
    try {
      if (typeof loadRampData !== 'function') {
        errorMsg = 'loadRampData() not found. Check script order.';
        p.redraw(); return;
      }

      rows = await loadRampData();

      if (!rows || rows.length === 0) {
        errorMsg = 'No rows loaded.';
        p.redraw(); return;
      }

      ui = bindUI();
      populateDropdowns(rows, ui);
      applyFilters();
      dataReady = true;
      p.redraw();
    } catch (e) {
      console.error('[search-filter]', e);
      errorMsg = 'Failed to load data.';
      p.redraw();
    }
  }

  // ── UI bindings ────────────────────────────────────────────
  function bindUI() {
    const conditionSel   = document.getElementById('sf-condition');
    const neighborhoodSel = document.getElementById('sf-neighborhood');
    const minYearInput   = document.getElementById('sf-minyear');
    const countEl        = document.getElementById('sf-count');

    const onChange = () => {
      if (!rows.length) return;
      applyFilters();
      p.redraw();
    };

    conditionSel.addEventListener('change', onChange);
    neighborhoodSel.addEventListener('change', onChange);
    minYearInput.addEventListener('input', onChange);

    return { conditionSel, neighborhoodSel, minYearInput, countEl };
  }

  // ── dropdowns ──────────────────────────────────────────────
  function populateDropdowns(data, ui) {
    const condSet  = new Set();
    const hoodSet  = new Set();

    for (const r of data) {
      condSet.add(normCond(r['CONDITION']));
      const hood = (r['NEIGHBORHOOD'] || '').trim();
      if (hood && hood !== 'Unknown') hoodSet.add(hood);
    }

    const conds = Array.from(condSet).sort();
    const hoods = Array.from(hoodSet).sort();

    fillSelect(ui.conditionSel,    ['All', ...conds]);
    fillSelect(ui.neighborhoodSel, ['All', ...hoods]);
  }

  function fillSelect(sel, values) {
    sel.innerHTML = '';
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = v;
      sel.appendChild(opt);
    }
  }

  // ── filtering ──────────────────────────────────────────────
  function applyFilters() {
    const cond    = ui.conditionSel.value;
    const hood    = ui.neighborhoodSel.value;
    const minYear = parseInt(ui.minYearInput.value, 10);

    filtered = rows.filter(r => {
      if (cond !== 'All' && normCond(r['CONDITION']) !== cond) return false;
      if (hood !== 'All' && (r['NEIGHBORHOOD'] || 'Unknown') !== hood) return false;
      if (!isNaN(minYear) && minYear > 0) {
        const y = extractYear(r['INSTALL_DATE']);
        if (!y || y < minYear) return false;
      }
      return true;
    });

    ui.countEl.textContent = `${filtered.length.toLocaleString()} ramps matched`;
  }

  // ── draw results table ─────────────────────────────────────
  function drawResults() {
    const x0    = PAD.left;
    let y       = 34;
    const lineH = 18;
    const maxRows = 21;

    // Column x positions
    const COL = { cond: x0, hood: x0 + 180, dist: x0 + 440, yr: x0 + 580 };

    // Header
    p.noStroke();
    p.fill(30);
    p.textSize(11);
    p.textStyle(p.BOLD);
    p.text('Condition',    COL.cond, y);
    p.text('Neighborhood', COL.hood, y);
    p.text('District',     COL.dist, y);
    p.text('Install Year', COL.yr,   y);
    p.textStyle(p.NORMAL);

    y += 14;
    p.stroke('#e8f1fb');
    p.line(x0, y, W - PAD.right, y);
    y += 14;

    if (filtered.length === 0) {
      p.noStroke(); p.fill(150);
      p.textSize(11);
      p.text('No results. Try changing the filters.', x0, y + 10);
      return;
    }

    const slice = filtered.slice(0, maxRows);
    for (let i = 0; i < slice.length; i++) {
      const r    = slice[i];
      const cond = normCond(r['CONDITION']);
      const hood = (r['NEIGHBORHOOD'] || 'Unknown');
      const dist = districtLabel(r['PRIMARYDISTRICTCD'] || '');
      const yr   = extractYear(r['INSTALL_DATE']);

      // Zebra row
      if (i % 2 === 0) {
        p.noStroke();
        p.fill('#f5f5f7');
        p.rect(x0 - 6, y - 12, W - PAD.left - PAD.right + 12, lineH, 4);
      }

      p.noStroke();
      p.fill(30);
      p.textSize(11);
      p.text(cond,           COL.cond, y);
      p.text(hood,           COL.hood, y);
      p.text(dist,           COL.dist, y);
      p.text(yr ? yr : '—', COL.yr,   y);

      y += lineH;
      if (y > H - PAD.bottom) break;
    }

    // "Showing X of Y" footer
    if (filtered.length > maxRows) {
      p.noStroke();
      p.fill(170);
      p.textSize(10);
      p.textAlign(p.RIGHT);
      p.text(`Showing ${maxRows} of ${filtered.length.toLocaleString()} results`, W - PAD.right, H - PAD.bottom);
      p.textAlign(p.LEFT);
    }
  }

  // ── spinner ────────────────────────────────────────────────
  function drawSpinner() {
    p.background(255);
    p.noFill(); p.stroke(180); p.strokeWeight(1.5);
    const a = (p.frameCount * 0.06) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, a, a + p.PI * 1.4);
    p.loop(); // keep animating while loading

    p.noStroke(); p.fill(150);
    p.textSize(11); p.textAlign(p.CENTER);
    p.text('Loading neighborhoods…', W / 2, H / 2 + 26);
    p.textAlign(p.LEFT);
  }

  // ── error ──────────────────────────────────────────────────
  function drawError(msg) {
    p.background(255);
    p.noStroke(); p.fill('#ff3b30');
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(msg, W / 2, H / 2);
    p.textAlign(p.LEFT, p.BASELINE);
  }

  // ── utils ──────────────────────────────────────────────────
  function normCond(v) {
    const s = (v || '').toString().trim().toLowerCase();
    if (!s) return 'Unknown';
    if (s.includes('new'))       return 'New Construction';
    if (s === 'very poor')       return 'Very Poor';
    if (s === 'poor')            return 'Poor';
    if (s === 'fair')            return 'Fair';
    if (s === 'good' || s === 'excellent') return 'Good';
    return 'Unknown';
  }

  function extractYear(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.toString().match(/(19|20)\d{2}/);
    if (!m) return null;
    const y = parseInt(m[0], 10);
    return Number.isFinite(y) ? y : null;
  }

  const DISTRICT_NAMES = {
    'DISTRICT1': 'SW',
    'DISTRICT2': 'South',
    'DISTRICT3': 'Central',
    'DISTRICT4': 'NE',
    'DISTRICT5': 'North',
    'DISTRICT6': 'NW',
    'DISTRICT7': 'Downtown',
  };

  function districtLabel(code) {
    return DISTRICT_NAMES[code.trim()] || code || '—';
  }
};

new p5(searchFilterSketch);
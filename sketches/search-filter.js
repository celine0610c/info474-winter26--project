// ============================================================
//  search-filter.js
//  Interactive search & filter — scrollable HTML table
//  DEPENDS ON: shared/dataLoader.js
// ============================================================

// ── Constants (defined first to avoid hoisting issues) ──────
const DISTRICT_NAMES = {
  'DISTRICT1': 'SW',
  'DISTRICT2': 'South',
  'DISTRICT3': 'Central',
  'DISTRICT4': 'NE',
  'DISTRICT5': 'North',
  'DISTRICT6': 'NW',
  'DISTRICT7': 'Downtown',
};

const COND_COLORS = {
  'Good':             { bg: '#e6f9ed', color: '#1a7a3a' },
  'Fair':             { bg: '#fff4e0', color: '#a06000' },
  'Poor':             { bg: '#fff0eb', color: '#b94000' },
  'Very Poor':        { bg: '#ffeeee', color: '#c0392b' },
  'New Construction': { bg: '#e8f1fb', color: '#0051a8' },
  'Unknown':          { bg: '#f5f5f7', color: '#6e6e73' },
};

// ── Helpers ─────────────────────────────────────────────────
function sfNormCond(v) {
  const s = (v || '').toString().trim().toLowerCase();
  if (!s) return 'Unknown';
  if (s.includes('new'))                return 'New Construction';
  if (s === 'very poor')                return 'Very Poor';
  if (s === 'poor')                     return 'Poor';
  if (s === 'fair')                     return 'Fair';
  if (s === 'good' || s === 'excellent') return 'Good';
  return 'Unknown';
}

function sfExtractYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.toString().match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

function sfDistrictLabel(code) {
  return DISTRICT_NAMES[(code || '').trim()] || code || '—';
}

function sfFillSelect(sel, values) {
  if (!sel) return;
  sel.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('');
}

// ── Main ─────────────────────────────────────────────────────
(async function () {
  const container = document.getElementById('search-filter-container');
  if (!container) return;

  container.innerHTML = `<div class="sf-loading">Loading neighborhoods…</div>`;

  let rows     = [];
  let filtered = [];

  try {
    if (typeof loadRampData !== 'function') throw new Error('loadRampData() not found.');
    rows = await loadRampData();
    if (!rows.length) throw new Error('No rows loaded.');
  } catch (e) {
    console.error('[search-filter]', e);
    container.innerHTML = `<div class="sf-error">${e.message}</div>`;
    return;
  }

  // ── Build table shell ──────────────────────────────────────
  container.innerHTML = `
    <div class="sf-table-wrap">
      <table class="sf-table">
        <thead>
          <tr>
            <th>Condition</th>
            <th>Neighborhood</th>
            <th>District</th>
            <th>Install Year</th>
          </tr>
        </thead>
        <tbody id="sf-tbody"></tbody>
      </table>
    </div>
  `;

  // ── Populate dropdowns ─────────────────────────────────────
  const condSet = new Set();
  const hoodSet = new Set();

  for (const r of rows) {
    condSet.add(sfNormCond(r['CONDITION']));
    const hood = (r['NEIGHBORHOOD'] || '').trim();
    if (hood && hood !== 'Unknown') hoodSet.add(hood);
  }

  sfFillSelect(document.getElementById('sf-condition'),    ['All', ...Array.from(condSet).sort()]);
  sfFillSelect(document.getElementById('sf-neighborhood'), ['All', ...Array.from(hoodSet).sort()]);

  // ── Filter logic ───────────────────────────────────────────
  const condSel   = document.getElementById('sf-condition');
  const hoodSel   = document.getElementById('sf-neighborhood');
  const yearInput = document.getElementById('sf-minyear');
  const countEl   = document.getElementById('sf-count');

  function applyFilters() {
    const cond    = condSel.value;
    const hood    = hoodSel.value;
    const minYear = parseInt(yearInput.value, 10);

    filtered = rows.filter(r => {
      if (cond !== 'All' && sfNormCond(r['CONDITION']) !== cond) return false;
      if (hood !== 'All' && (r['NEIGHBORHOOD'] || 'Unknown') !== hood) return false;
      if (!isNaN(minYear) && minYear >= 1970) {
        const y = sfExtractYear(r['INSTALL_DATE']);
        if (!y || y !== minYear) return false;
      }
      return true;
    });

    renderTable(filtered);
    if (countEl) countEl.textContent = `${filtered.length.toLocaleString()} ramps matched`;
  }

  // Debounce to avoid filtering 46k rows on every keystroke
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  const debouncedFilter = debounce(applyFilters, 300);

  condSel.addEventListener('change', applyFilters);
  hoodSel.addEventListener('change', applyFilters);
  yearInput.addEventListener('input', debouncedFilter);

  applyFilters(); // initial render

  // ── Render ─────────────────────────────────────────────────
  function renderTable(data) {
    const tbody = document.getElementById('sf-tbody');
    if (!tbody) return;

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="sf-empty">No results. Try changing the filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => {
      const cond  = sfNormCond(r['CONDITION']);
      const hood  = r['NEIGHBORHOOD'] || 'Unknown';
      const dist  = sfDistrictLabel(r['PRIMARYDISTRICTCD'] || '');
      const yr    = sfExtractYear(r['INSTALL_DATE']) || '—';
      const style = COND_COLORS[cond]
        ? `background:${COND_COLORS[cond].bg};color:${COND_COLORS[cond].color}`
        : '';
      return `
        <tr>
          <td><span class="sf-cond-badge" style="${style}">${cond}</span></td>
          <td>${hood}</td>
          <td>${dist}</td>
          <td>${yr}</td>
        </tr>`;
    }).join('');
  }
})();
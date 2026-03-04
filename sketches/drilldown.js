// ============================================================
//  drilldown.js
//  Interactive drill-down bar chart
//  - Level 1: conditions overview (click to drill down)
//  - Level 2: selected condition broken down by district
//
//  Gestalt principles:
//  - Continuity:   animated transition between levels
//  - Proximity:    district bars grouped under selected condition
//  - Prägnanz:     single selected condition highlighted, rest dim
//  - Figure/Ground: back button clearly separates navigation from data
//
//  DEPENDS ON: shared/dataLoader.js
// ============================================================

const DD_CONDITION_COLORS = {
  'Good':             '#34c759',
  'Fair':             '#ff9f0a',
  'Poor':             '#ff6b35',
  'Very Poor':        '#ff3b30',
  'New Construction': '#0071e3',
  'Unknown':          '#aeaeb2',
};

const DD_DISTRICT_LABELS = {
  'DISTRICT1': 'SW',
  'DISTRICT2': 'South',
  'DISTRICT3': 'Central',
  'DISTRICT4': 'NE',
  'DISTRICT5': 'North',
  'DISTRICT6': 'NW',
  'DISTRICT7': 'Downtown',
};

const DD_THEME = {
  bg:         '#ffffff',
  gridLine:   '#f0f0f5',
  axisLine:   '#e0e0e5',
  tickLabel:  '#aeaeb2',
  hoverLabel: '#1d1d1f',
  font:       '-apple-system, "Helvetica Neue", sans-serif',
};

const DD_PAD = { top: 60, right: 48, bottom: 72, left: 80 };

const ddSketch = (p) => {

  let condCounts   = {};  // { condition: count }
  let distCounts   = {};  // { condition: { district: count } }
  let condLabels   = [];
  let total        = 0;
  let dataReady    = false;
  let errorMsg     = null;

  // drill state
  let selectedCond = null;  // null = level 1, string = level 2
  let drillLabels  = [];    // district labels for level 2
  let drillCounts  = {};    // { district: count }

  // animation
  let animT     = 0;
  let prevAnimT = 0;
  const ANIM_SPEED = 0.035;

  let hoveredIdx = -1;
  let W, H;

  const CONDITION_ORDER = ['Good', 'Fair', 'Poor', 'Very Poor', 'New Construction', 'Unknown'];
  const MIN_COUNT = 50;

  // ── setup ──────────────────────────────────────────────────
  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 420;
    p.createCanvas(W, H).parent('drilldown-container');
    p.textFont(DD_THEME.font);
    loadData();
  };

  p.draw = function () {
    p.background(DD_THEME.bg);
    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }
    if (animT < 1)  animT = p.min(animT + ANIM_SPEED, 1);
    drawGridLines();
    drawBars();
    drawAxes();
    drawTitle();
    drawHint();
    updateTooltip();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
  };

  p.mousePressed = function () {
    if (!dataReady) return;
    const idx = getHoveredIdx();
    if (idx === -1) return;

    if (selectedCond === null) {
      // drill down into condition
      const cond = condLabels[idx];
      selectedCond = cond;
      drillCounts  = distCounts[cond] || {};
      drillLabels  = Object.keys(drillCounts).sort((a, b) =>
        drillCounts[b] - drillCounts[a]
      );
      animT = 0;
    } else {
      // back button area — check if click is in top-left
      if (p.mouseX < 80 && p.mouseY < 40) {
        selectedCond = null;
        animT = 0;
      }
    }
  };

  // ── data ───────────────────────────────────────────────────
  async function loadData() {
    try {
      const rows = await loadRampData();
      tally(rows);
      dataReady = true;
    } catch (e) {
      console.error('[drilldown]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function tally(rows) {
    const rawCond  = {};
    const rawDist  = {};

    for (const row of rows) {
      const cond = normCond(row['CONDITION']);
      const dist = (row['PRIMARYDISTRICTCD'] || '').trim();

      rawCond[cond] = (rawCond[cond] || 0) + 1;

      if (dist) {
        if (!rawDist[cond]) rawDist[cond] = {};
        rawDist[cond][dist] = (rawDist[cond][dist] || 0) + 1;
      }
    }

    condLabels = CONDITION_ORDER.filter(l => rawCond[l] >= MIN_COUNT);
    for (const k of Object.keys(rawCond)) {
      if (!condLabels.includes(k) && rawCond[k] >= MIN_COUNT) condLabels.push(k);
    }

    condCounts = rawCond;
    distCounts = rawDist;
    total      = rows.length;
  }

  // ── coordinate helpers ─────────────────────────────────────
  function cW() { return W - DD_PAD.left - DD_PAD.right; }
  function cH() { return H - DD_PAD.top  - DD_PAD.bottom; }

  function getLabels()  { return selectedCond ? drillLabels : condLabels; }
  function getCounts()  { return selectedCond ? drillCounts : condCounts; }
  function getMaxCount() {
    const counts = getCounts();
    return Math.max(...Object.values(counts));
  }

  function getBarColor(label) {
    if (selectedCond) {
      return DD_CONDITION_COLORS[selectedCond] || '#aeaeb2';
    }
    return DD_CONDITION_COLORS[label] || '#aeaeb2';
  }

  function getLabel(label) {
    if (selectedCond) return DD_DISTRICT_LABELS[label] || label;
    return label;
  }

  // ── grid lines ─────────────────────────────────────────────
  function drawGridLines() {
    const max   = getMaxCount();
    const steps = 4;
    p.textSize(11);
    p.textAlign(p.RIGHT, p.CENTER);
    for (let i = 0; i <= steps; i++) {
      const v = Math.round((max / steps) * i);
      const y = DD_PAD.top + cH() - (cH() * i / steps);
      p.stroke(DD_THEME.gridLine);
      p.strokeWeight(1);
      p.line(DD_PAD.left, y, DD_PAD.left + cW(), y);
      p.noStroke();
      p.fill(DD_THEME.tickLabel);
      p.text(fmtNum(v), DD_PAD.left - 10, y);
    }
  }

  // ── bars ───────────────────────────────────────────────────
  function drawBars() {
    const labels   = getLabels();
    const counts   = getCounts();
    const maxCount = getMaxCount();
    const n        = labels.length;
    if (n === 0) return;

    const BAR_W = p.min(64, (cW() / n) * 0.55);
    const slotW = cW() / n;

    for (let i = 0; i < n; i++) {
      const label  = labels[i];
      const count  = counts[label] || 0;
      const frac   = count / maxCount;
      const bH     = cH() * frac * easeOut(animT);
      const cx     = DD_PAD.left + slotW * i + slotW / 2;
      const x      = cx - BAR_W / 2;
      const y      = DD_PAD.top + cH() - bH;
      const isHov  = i === hoveredIdx;
      const col    = getBarColor(label);

      if (isHov) {
        p.drawingContext.shadowColor   = col + '44';
        p.drawingContext.shadowBlur    = 14;
        p.drawingContext.shadowOffsetY = 3;
      }

      p.noStroke();
      p.fill(isHov ? col : fadeColor(p, col, 210));
      p.rect(x, y, BAR_W, bH, 5, 5, 0, 0);

      p.drawingContext.shadowBlur    = 0;
      p.drawingContext.shadowOffsetY = 0;

      // value label
      if (animT > 0.85 && bH > 18) {
        p.noStroke();
        p.fill(isHov ? DD_THEME.hoverLabel : DD_THEME.tickLabel);
        p.textSize(isHov ? 12 : 11);
        p.textStyle(isHov ? p.BOLD : p.NORMAL);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(fmtNum(count), cx, y - 6);
        p.textStyle(p.NORMAL);
      }

      // x label
      p.noStroke();
      p.fill(isHov ? DD_THEME.hoverLabel : DD_THEME.tickLabel);
      p.textSize(11);
      p.textAlign(p.CENTER, p.TOP);
      const words = getLabel(label).split(' ');
      if (words.length > 1) {
        p.text(words[0],                 cx, H - DD_PAD.bottom + 10);
        p.text(words.slice(1).join(' '), cx, H - DD_PAD.bottom + 23);
      } else {
        p.text(getLabel(label), cx, H - DD_PAD.bottom + 10);
      }

      // click cursor hint on hover in level 1
      if (isHov && !selectedCond) {
        p.noStroke();
        p.fill(DD_THEME.tickLabel);
        p.textSize(10);
        p.textAlign(p.CENTER, p.TOP);
        p.text('click to explore', cx, H - DD_PAD.bottom + 38);
      }
    }
  }

  // ── axes ───────────────────────────────────────────────────
  function drawAxes() {
    const baseline = DD_PAD.top + cH();
    p.stroke(DD_THEME.axisLine);
    p.strokeWeight(1);
    p.line(DD_PAD.left, baseline, DD_PAD.left + cW(), baseline);

    p.push();
    p.noStroke(); p.fill(DD_THEME.tickLabel);
    p.textSize(10); p.textAlign(p.CENTER);
    p.translate(14, H / 2); p.rotate(-p.HALF_PI);
    p.text('NUMBER OF RAMPS', 0, 0);
    p.pop();
  }

  // ── title & back button ────────────────────────────────────
  function drawTitle() {
    if (selectedCond) {
      // back button
      p.noStroke();
      p.fill('#0071e3');
      p.textSize(11);
      p.textAlign(p.LEFT, p.TOP);
      p.text('← Back', DD_PAD.left, 14);

      // subtitle
      p.noStroke();
      p.fill(DD_THEME.hoverLabel);
      p.textSize(13);
      p.textAlign(p.LEFT, p.TOP);
      const col = DD_CONDITION_COLORS[selectedCond] || '#aeaeb2';
      p.fill(col);
      p.text(`${selectedCond}`, DD_PAD.left + 60, 12);
      p.fill(DD_THEME.tickLabel);
      p.textSize(11);
      p.text('ramps by district', DD_PAD.left + 60 + p.textWidth(selectedCond) + 8, 14);
    } else {
      p.noStroke();
      p.fill(DD_THEME.tickLabel);
      p.textSize(11);
      p.textAlign(p.RIGHT, p.TOP);
      p.text(`n = ${fmtNum(total)} ramps`, W - DD_PAD.right, 14);
    }
  }

  // ── hint ───────────────────────────────────────────────────
  function drawHint() {
    if (selectedCond) return;
    p.noStroke();
    p.fill(DD_THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.LEFT, p.TOP);
    p.text('Click any bar to see district breakdown', DD_PAD.left, 14);
  }

  // ── hover detection ────────────────────────────────────────
  function getHoveredIdx() {
    const labels = getLabels();
    const n      = labels.length;
    if (n === 0) return -1;
    const BAR_W  = p.min(64, (cW() / n) * 0.55);
    const slotW  = cW() / n;
    for (let i = 0; i < n; i++) {
      const cx = DD_PAD.left + slotW * i + slotW / 2;
      const x  = cx - BAR_W / 2;
      if (p.mouseX >= x && p.mouseX <= x + BAR_W &&
          p.mouseY >= DD_PAD.top && p.mouseY <= H - DD_PAD.bottom) {
        return i;
      }
    }
    // back button
    if (selectedCond && p.mouseX < 80 && p.mouseY < 40) return -2;
    return -1;
  }

  function updateTooltip() {
    const tooltip = document.getElementById('drilldown-tooltip');
    if (!tooltip) return;

    const idx    = getHoveredIdx();
    hoveredIdx   = idx >= 0 ? idx : -1;

    if (idx >= 0) {
      const labels = getLabels();
      const counts = getCounts();
      const label  = labels[idx];
      const count  = counts[label] || 0;
      const share  = ((count / total) * 100).toFixed(1);
      const name   = selectedCond ? (DD_DISTRICT_LABELS[label] || label) : label;
      tooltip.style.display = 'block';
      tooltip.style.left    = (p.mouseX + 16) + 'px';
      tooltip.style.top     = (p.mouseY - 14) + 'px';
      tooltip.innerHTML     = `<strong>${name}</strong>${fmtNum(count)} ramps · ${share}% of total`;
    } else {
      tooltip.style.display = 'none';
    }
  }

  // ── spinner / error ────────────────────────────────────────
  function drawSpinner() {
    p.background(DD_THEME.bg);
    p.noFill(); p.stroke(DD_THEME.tickLabel); p.strokeWeight(1.5);
    const a = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, a, a + p.PI * 1.4);
    p.noStroke(); p.fill(DD_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  function drawError() {
    p.background(DD_THEME.bg);
    p.noStroke(); p.fill('#ff3b30');
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  // ── utils ──────────────────────────────────────────────────
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtNum(n)  { return Number(n).toLocaleString(); }

  function normCond(v) {
    const s = (v || '').toString().trim().toLowerCase();
    if (!s) return 'Unknown';
    if (s.includes('new'))                return 'New Construction';
    if (s === 'very poor')                return 'Very Poor';
    if (s === 'poor')                     return 'Poor';
    if (s === 'fair')                     return 'Fair';
    if (s === 'good' || s === 'excellent') return 'Good';
    return 'Unknown';
  }

  function fadeColor(p, hex, alpha) {
    const c = p.color(hex);
    c.setAlpha(alpha);
    return c;
  }
};

new p5(ddSketch);
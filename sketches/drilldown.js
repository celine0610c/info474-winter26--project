// ============================================================
//  sketches/drilldown.js
//  VIZ 4 — Condition × District drill-down
//
//  State machine:
//    'overview'  — bars for each condition (all districts combined)
//    'drilldown' — bars for each district filtered to selected condition
//
//  Click a condition bar  → drill into district breakdown
//  Click "← Back"        → return to overview
// ============================================================

const DRILL_CONDITION_FIELD = 'CONDITION';
const DRILL_DISTRICT_FIELD  = 'PRIMARYDISTRICTCD';

const DRILL_CONDITION_ORDER  = ['Good', 'Fair', 'Poor', 'Very Poor', 'New Construction', 'Unknown'];
const DRILL_CONDITION_COLORS = {
  'Good':             '#34c759',
  'Fair':             '#ff9f0a',
  'Poor':             '#ff6b35',
  'Very Poor':        '#ff3b30',
  'New Construction': '#0071e3',
  'Unknown':          '#aeaeb2',
};
const DRILL_FALLBACK_COLOR = '#aeaeb2';

const DRILL_THEME = {
  bg:         '#ffffff',
  gridLine:   '#f0f0f5',
  axisLine:   '#e0e0e5',
  tickLabel:  '#aeaeb2',
  valueLabel: '#6e6e73',
  hoverLabel: '#1d1d1f',
  totalLabel: '#aeaeb2',
  font:       '-apple-system, "Helvetica Neue", sans-serif',
};

const DRILL_PAD = { top: 64, right: 48, bottom: 80, left: 72 };
const DRILL_MIN_COUNT = 10;

// ============================================================
const drilldownSketch = (p) => {

  // ── state ─────────────────────────────────────────────────
  let state          = 'overview';   // 'overview' | 'drilldown'
  let selectedCond   = null;

  // data
  let rows           = [];
  let overviewData   = [];   // [{ label, count }]
  let drillData      = [];   // [{ label, count }] — districts for selected cond
  let totalAll       = 0;
  let dataReady      = false;
  let errorMsg       = null;

  // animation
  let animT          = 0;
  const ANIM_SPEED   = 0.032;

  // interaction
  let hoveredIndex   = -1;
  let backHovered    = false;

  let W, H;

  // ── setup ─────────────────────────────────────────────────
  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 460;
    const cnv = p.createCanvas(W, H);
    cnv.parent('drilldown-container');
    p.textFont(DRILL_THEME.font);
    p.cursor(p.ARROW);
    loadData();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
  };

  // ── draw ──────────────────────────────────────────────────
  p.draw = function () {
    p.background(DRILL_THEME.bg);

    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }

    if (animT < 1) animT = p.min(animT + ANIM_SPEED, 1);

    const bars = state === 'overview' ? overviewData : drillData;
    const max  = bars.length ? Math.max(...bars.map(b => b.count)) : 1;

    drawGridLines(max);
    drawBars(bars, max);
    drawAxes();
    drawHeader();
    if (state === 'drilldown') drawBackButton();
    drawTotalLabel();
    updateTooltip(bars, max);
    updateCursor(bars);
  };

  // ── data ──────────────────────────────────────────────────
  async function loadData() {
    try {
      rows = await loadRampData();
      buildOverview();
      totalAll  = rows.length;
      dataReady = true;
    } catch (e) {
      console.error('[drilldown]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function buildOverview() {
    const raw = {};
    for (const row of rows) {
      let c = (row[DRILL_CONDITION_FIELD] || '').trim();
      if (!c) c = 'Unknown';
      c = toTitleCase(c);
      raw[c] = (raw[c] || 0) + 1;
    }
    overviewData = DRILL_CONDITION_ORDER
      .filter(l => raw[l] >= DRILL_MIN_COUNT)
      .map(l => ({ label: l, count: raw[l] || 0 }));

    // append any unseen conditions
    for (const [k, v] of Object.entries(raw)) {
      if (!overviewData.find(d => d.label === k) && v >= DRILL_MIN_COUNT) {
        overviewData.push({ label: k, count: v });
      }
    }
  }

  function buildDrilldown(condition) {
    const subset = rows.filter(r => {
      let c = (r[DRILL_CONDITION_FIELD] || '').trim();
      if (!c) c = 'Unknown';
      return toTitleCase(c) === condition;
    });
    const raw = {};
    for (const row of subset) {
      let d = (row[DRILL_DISTRICT_FIELD] || '').trim() || 'Unknown';
      raw[d] = (raw[d] || 0) + 1;
    }
    drillData = Object.entries(raw)
      .filter(([, v]) => v >= DRILL_MIN_COUNT)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── transition helpers ────────────────────────────────────
  function enterDrilldown(condition) {
    selectedCond = condition;
    buildDrilldown(condition);
    state  = 'drilldown';
    animT  = 0;
    hoveredIndex = -1;
  }

  function returnToOverview() {
    state  = 'overview';
    animT  = 0;
    hoveredIndex = -1;
    selectedCond = null;
  }

  // ── click ─────────────────────────────────────────────────
  p.mousePressed = function () {
    if (!dataReady) return;

    // back button
    if (state === 'drilldown' && isOverBack()) {
      returnToOverview();
      return;
    }

    // bar click
    const bars = state === 'overview' ? overviewData : drillData;
    const idx  = getHoveredBar(bars);
    if (idx === -1) return;

    if (state === 'overview') {
      enterDrilldown(bars[idx].label);
    }
    // drilldown bars are currently display-only (no further drill)
  };

  // ── draw: grid lines ──────────────────────────────────────
  function drawGridLines(max) {
    const chartH = H - DRILL_PAD.top - DRILL_PAD.bottom;
    const chartW = W - DRILL_PAD.left - DRILL_PAD.right;
    const steps  = 4;

    p.textSize(11);
    p.textAlign(p.RIGHT, p.CENTER);

    for (let i = 0; i <= steps; i++) {
      const v = Math.round((max / steps) * i);
      const y = DRILL_PAD.top + chartH - (chartH * i / steps);
      p.stroke(DRILL_THEME.gridLine);
      p.strokeWeight(1);
      p.line(DRILL_PAD.left, y, DRILL_PAD.left + chartW, y);
      p.noStroke();
      p.fill(DRILL_THEME.tickLabel);
      p.text(fmtNum(v), DRILL_PAD.left - 10, y);
    }
  }

  // ── draw: bars ────────────────────────────────────────────
  function drawBars(bars, max) {
    const chartH = H - DRILL_PAD.top - DRILL_PAD.bottom;
    const chartW = W - DRILL_PAD.left - DRILL_PAD.right;
    const n      = bars.length;
    if (!n) return;

    const slotW = chartW / n;
    const BAR_W = p.min(64, slotW * 0.55);

    for (let i = 0; i < n; i++) {
      const { label, count } = bars[i];
      const frac  = count / max;
      const bH    = chartH * frac * easeOut(animT);
      const cx    = DRILL_PAD.left + slotW * i + slotW / 2;
      const x     = cx - BAR_W / 2;
      const y     = DRILL_PAD.top + chartH - bH;
      const isHov = i === hoveredIndex;

      // color: in overview use condition colors; in drilldown use selected condition color
      const col = state === 'overview'
        ? (DRILL_CONDITION_COLORS[label] || DRILL_FALLBACK_COLOR)
        : (DRILL_CONDITION_COLORS[selectedCond] || DRILL_FALLBACK_COLOR);

      if (isHov) {
        p.drawingContext.shadowColor   = col + '44';
        p.drawingContext.shadowBlur    = 14;
        p.drawingContext.shadowOffsetY = 3;
      }

      p.noStroke();
      p.fill(isHov ? col : fadeColor(p, col, 200));
      p.rect(x, y, BAR_W, bH, 5, 5, 0, 0);

      p.drawingContext.shadowBlur    = 0;
      p.drawingContext.shadowOffsetY = 0;

      // value label
      if (animT > 0.85 && bH > 18) {
        p.noStroke();
        p.fill(isHov ? DRILL_THEME.hoverLabel : DRILL_THEME.valueLabel);
        p.textSize(12);
        p.textStyle(isHov ? p.BOLD : p.NORMAL);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(fmtNum(count), cx, y - 7);
        p.textStyle(p.NORMAL);
      }

      // x-axis label — wrap long district codes
      p.noStroke();
      p.fill(isHov ? DRILL_THEME.hoverLabel : DRILL_THEME.tickLabel);
      p.textSize(10);
      p.textAlign(p.CENTER, p.TOP);
      const words = label.split(/[\s_-]/);
      if (words.length > 1 && label.length > 8) {
        const mid  = Math.ceil(words.length / 2);
        const top  = words.slice(0, mid).join(' ');
        const bot  = words.slice(mid).join(' ');
        p.text(top, cx, H - DRILL_PAD.bottom + 10);
        p.text(bot, cx, H - DRILL_PAD.bottom + 22);
      } else {
        p.text(label, cx, H - DRILL_PAD.bottom + 10);
      }

      // clickable hint in overview
      if (state === 'overview' && isHov && animT > 0.9) {
        p.noStroke();
        p.fill(DRILL_THEME.tickLabel);
        p.textSize(10);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text('click to drill down ↓', cx, y - 22);
      }
    }
  }

  // ── draw: axes ────────────────────────────────────────────
  function drawAxes() {
    const chartH = H - DRILL_PAD.top - DRILL_PAD.bottom;
    const chartW = W - DRILL_PAD.left - DRILL_PAD.right;

    p.stroke(DRILL_THEME.axisLine);
    p.strokeWeight(1);
    p.line(DRILL_PAD.left, DRILL_PAD.top + chartH, DRILL_PAD.left + chartW, DRILL_PAD.top + chartH);

    p.push();
    p.noStroke();
    p.fill(DRILL_THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.translate(14, H / 2);
    p.rotate(-p.HALF_PI);
    p.text('NUMBER OF RAMPS', 0, 0);
    p.pop();

    p.noStroke();
    p.fill(DRILL_THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.CENTER);
    const xLabel = state === 'overview' ? 'CONDITION' : 'CITY COUNCIL DISTRICT';
    p.text(xLabel, W / 2, H - 10);
  }

  // ── draw: header ──────────────────────────────────────────
  function drawHeader() {
    p.noStroke();
    p.fill(DRILL_THEME.hoverLabel);
    p.textSize(13);
    p.textAlign(p.LEFT, p.TOP);

    if (state === 'overview') {
      p.text('All conditions — click any bar to see district breakdown', DRILL_PAD.left, 16);
    } else {
      const col = DRILL_CONDITION_COLORS[selectedCond] || DRILL_FALLBACK_COLOR;
      p.fill(col);
      p.textStyle(p.BOLD);
      p.text(selectedCond, DRILL_PAD.left, 16);
      p.textStyle(p.NORMAL);
      p.fill(DRILL_THEME.tickLabel);
      p.text(' ramps by city council district', DRILL_PAD.left + p.textWidth(selectedCond), 16);
    }
  }

  // ── draw: back button ─────────────────────────────────────
  function drawBackButton() {
    const bx = DRILL_PAD.left;
    const by = 36;
    const bw = 100;
    const bh = 22;

    backHovered = isOverBack();

    p.noStroke();
    p.fill(backHovered ? '#f0f0f5' : DRILL_THEME.bg);
    p.rect(bx, by, bw, bh, 4);

    p.stroke(DRILL_THEME.axisLine);
    p.strokeWeight(1);
    p.rect(bx, by, bw, bh, 4);

    p.noStroke();
    p.fill(backHovered ? DRILL_THEME.hoverLabel : DRILL_THEME.tickLabel);
    p.textSize(11);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('← All conditions', bx + bw / 2, by + bh / 2);
  }

  function isOverBack() {
    const bx = DRILL_PAD.left;
    const by = 36;
    const bw = 100;
    const bh = 22;
    return p.mouseX >= bx && p.mouseX <= bx + bw &&
           p.mouseY >= by && p.mouseY <= by + bh;
  }

  // ── draw: total label ─────────────────────────────────────
  function drawTotalLabel() {
    if (!dataReady || animT < 0.5) return;
    const bars = state === 'overview' ? overviewData : drillData;
    const sub  = bars.reduce((s, b) => s + b.count, 0);
    const label = state === 'overview'
      ? `n = ${fmtNum(totalAll)} ramps`
      : `${fmtNum(sub)} ${selectedCond.toLowerCase()} ramps`;

    p.noStroke();
    p.fill(DRILL_THEME.totalLabel);
    p.textSize(11);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(label, W - DRILL_PAD.right, 14);
  }

  // ── tooltip ───────────────────────────────────────────────
  function updateTooltip(bars, max) {
    const tooltip = document.getElementById('drilldown-tooltip');
    if (!tooltip) return;

    const idx = getHoveredBar(bars);
    hoveredIndex = idx;

    if (idx === -1) {
      tooltip.style.display = 'none';
      return;
    }

    const { label, count } = bars[idx];
    const denom = state === 'overview'
      ? totalAll
      : drillData.reduce((s, b) => s + b.count, 0);
    const share = ((count / denom) * 100).toFixed(1);

    const suffix = state === 'overview'
      ? `· ${share}% of all ramps`
      : `· ${share}% of ${selectedCond.toLowerCase()} ramps`;

    tooltip.style.display = 'block';
    tooltip.style.left    = (p.mouseX + 16) + 'px';
    tooltip.style.top     = (p.mouseY - 14) + 'px';
    tooltip.innerHTML     = `<strong>${label}</strong> &nbsp;${fmtNum(count)} ramps ${suffix}`;
  }

  // ── cursor ────────────────────────────────────────────────
  function updateCursor(bars) {
    const overBar  = getHoveredBar(bars) !== -1;
    const overBack = state === 'drilldown' && isOverBack();
    p.cursor(overBar || overBack ? p.HAND : p.ARROW);
  }

  // ── helpers ───────────────────────────────────────────────
  function getHoveredBar(bars) {
    const chartH = H - DRILL_PAD.top - DRILL_PAD.bottom;
    const chartW = W - DRILL_PAD.left - DRILL_PAD.right;
    const n      = bars.length;
    if (!n) return -1;

    const slotW = chartW / n;
    const BAR_W = p.min(64, slotW * 0.55);

    for (let i = 0; i < n; i++) {
      const cx = DRILL_PAD.left + slotW * i + slotW / 2;
      const x  = cx - BAR_W / 2;
      if (p.mouseX >= x && p.mouseX <= x + BAR_W &&
          p.mouseY >= DRILL_PAD.top && p.mouseY <= H - DRILL_PAD.bottom) {
        return i;
      }
    }
    return -1;
  }

  function drawSpinner() {
    p.background(DRILL_THEME.bg);
    p.noFill();
    p.stroke(DRILL_THEME.tickLabel);
    p.strokeWeight(1.5);
    const angle = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, angle, angle + p.PI * 1.4);
    p.noStroke();
    p.fill(DRILL_THEME.tickLabel);
    p.textSize(11);
    p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  function drawError() {
    p.background(DRILL_THEME.bg);
    p.noStroke();
    p.fill('#ff3b30');
    p.textSize(13);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtNum(n)  { return Number(n).toLocaleString(); }
  function toTitleCase(s) {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  function fadeColor(p, hex, alpha) {
    const c = p.color(hex);
    c.setAlpha(alpha);
    return c;
  }
};

new p5(drilldownSketch);
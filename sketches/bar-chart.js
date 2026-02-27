// ============================================================
//  bar-chart.js
//  Static bar chart — Seattle curb ramp counts by condition
//
//  DEPENDS ON: shared/dataLoader.js
//  Make sure dataLoader.js is loaded BEFORE this script in
//  index.html, e.g.:
//    <script src="shared/dataLoader.js"></script>
//    <script src="sketches/bar-chart.js"></script>
//
//  FIELD NAMES: This sketch reads `currentCondition` from each
//  ramp record. When you first run the project, open the browser
//  console and check what keys appear in the logged data object.
//  If condition data isn't showing up, update CONDITION_FIELD below
//  to match the real key (common alternatives are listed).
// ============================================================

// ── Field name to try — update if needed ────────────────────
const CONDITION_FIELD = 'CONDITION'; // confirmed from CSV

// ── Condition display order & colors ────────────────────────
const CONDITION_ORDER = ['Good', 'Fair', 'Poor', 'Very Poor', 'New Construction', 'Unknown'];

const CONDITION_COLORS = {
  'Good':             '#4caf7d',
  'Fair':             '#c8a96e',
  'Poor':             '#d97c4f',
  'Very Poor':        '#c0392b',
  'New Construction': '#5b8dd9',
  'Unknown':          '#888888',
};
const FALLBACK_COLOR = '#aaaaaa';

// ── Layout constants ─────────────────────────────────────────
const PAD = { top: 70, right: 40, bottom: 90, left: 90 };

// ============================================================
//  p5 sketch (instance mode so it plays nicely with other
//  sketches on the same page)
// ============================================================
const barChartSketch = (p) => {

  // state
  let counts    = {};   // { label: count }
  let labels    = [];   // ordered array of labels
  let total     = 0;
  let maxCount  = 0;
  let dataReady = false;
  let errorMsg  = null;
  let hoveredIndex = -1;

  // animation
  let animT = 0;
  const ANIM_SPEED = 0.03;

  // canvas
  let W, H;

  // ── setup ─────────────────────────────────────────────────
  p.setup = function () {
    W = p.min(p.windowWidth - 40, 860);
    H = 480;
    const cnv = p.createCanvas(W, H);
    cnv.parent('bar-chart-container'); // <div id="bar-chart-container"> in index.html
    p.textFont('monospace');
    loadData();
  };

  // ── draw ──────────────────────────────────────────────────
  p.draw = function () {
    p.background(14, 14, 14);

    if (errorMsg) { drawError(); return; }
    if (!dataReady) { drawSpinner(); return; }

    if (animT < 1) animT = p.min(animT + ANIM_SPEED, 1);

    drawGridLines();
    drawBars();
    drawAxes();
    drawChartTitle();
    drawTotalLabel();
    updateTooltip();
  };

  // ── window resize ─────────────────────────────────────────
  p.windowResized = function () {
    W = p.min(p.windowWidth - 40, 860);
    p.resizeCanvas(W, H);
  };

  // ── data loading ──────────────────────────────────────────
  async function loadData() {
    try {
      // loadRampData() comes from shared/dataLoader.js
      // It caches results so multiple sketches don't re-fetch
      const rows = await loadRampData();

      // DEBUG: log the first record so you can verify field names
      if (rows.length > 0) {
        console.log('[bar-chart] Sample record keys:', Object.keys(rows[0]));
        console.log('[bar-chart] Sample record:', rows[0]);
      }

      tally(rows);
      dataReady = true;
    } catch (e) {
      console.error('[bar-chart] Data load failed:', e);
      errorMsg = 'Failed to load data. Check the console for details.';
    }
  }

  function tally(rows) {
    const raw = {};
    for (const row of rows) {
      // read the condition field (normalise capitalisation)
      let cond = (row[CONDITION_FIELD] || '').toString().trim();
      if (!cond) cond = 'Unknown';

      // normalise to Title Case for matching CONDITION_ORDER
      cond = toTitleCase(cond);

      raw[cond] = (raw[cond] || 0) + 1;
    }

    // Build label list: known order first, then any extras from data
    labels = CONDITION_ORDER.filter(l => raw[l] !== undefined);
    for (const k of Object.keys(raw)) {
      if (!labels.includes(k)) labels.push(k);
    }

    counts   = raw;
    total    = rows.length;
    maxCount = p.max(labels.map(l => counts[l] || 0));
  }

  // ── drawing helpers ───────────────────────────────────────

  function drawGridLines() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const steps  = 5;

    p.textSize(10);
    p.textAlign(p.RIGHT, p.CENTER);

    for (let i = 0; i <= steps; i++) {
      const v = Math.round((maxCount / steps) * i);
      const y = PAD.top + chartH - (chartH * i / steps);

      p.stroke(30);
      p.strokeWeight(1);
      p.line(PAD.left, y, PAD.left + chartW, y);

      p.noStroke();
      p.fill(80);
      p.text(fmtNum(v), PAD.left - 8, y);
    }
  }

  function drawBars() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const n      = labels.length;
    if (n === 0) return;

    const slotW = chartW / n;
    const barW  = slotW * 0.55;

    for (let i = 0; i < n; i++) {
      const label  = labels[i];
      const count  = counts[label] || 0;
      const frac   = count / maxCount;
      const bH     = chartH * frac * easeOut(animT);
      const x      = PAD.left + slotW * i + slotW / 2 - barW / 2;
      const y      = PAD.top + chartH - bH;
      const isHov  = i === hoveredIndex;
      const col    = CONDITION_COLORS[label] || FALLBACK_COLOR;

      // glow on hover
      if (isHov) {
        p.drawingContext.shadowColor = col;
        p.drawingContext.shadowBlur  = 20;
      }

      // bar
      p.noStroke();
      p.fill(isHov ? col : fadeColor(p, col, 190));
      p.rect(x, y, barW, bH, 3, 3, 0, 0);

      p.drawingContext.shadowBlur = 0;

      // value label above bar
      if (animT > 0.9 && bH > 14) {
        p.noStroke();
        p.fill(isHov ? '#ffffff' : '#999');
        p.textSize(isHov ? 12 : 10);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(fmtNum(count), x + barW / 2, y - 4);
      }

      // x-axis label (wrap two-word labels)
      p.noStroke();
      p.fill(isHov ? '#e8e2d5' : '#666');
      p.textSize(10);
      p.textAlign(p.CENTER, p.TOP);
      const words = label.split(' ');
      if (words.length > 1) {
        p.text(words[0],              x + barW / 2, H - PAD.bottom + 10);
        p.text(words.slice(1).join(' '), x + barW / 2, H - PAD.bottom + 22);
      } else {
        p.text(label, x + barW / 2, H - PAD.bottom + 10);
      }
    }
  }

  function drawAxes() {
    p.stroke(45);
    p.strokeWeight(1);
    p.line(PAD.left, PAD.top, PAD.left, H - PAD.bottom);          // y-axis
    p.line(PAD.left, H - PAD.bottom, W - PAD.right, H - PAD.bottom); // x-axis

    // y-axis label
    p.push();
    p.noStroke();
    p.fill(60);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.translate(16, H / 2);
    p.rotate(-p.HALF_PI);
    p.text('NUMBER OF RAMPS', 0, 0);
    p.pop();

    // x-axis label
    p.noStroke();
    p.fill(60);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.text('CONDITION', W / 2, H - 12);
  }

  function drawChartTitle() {
    p.noStroke();
    p.fill(220);
    p.textSize(15);
    p.textAlign(p.LEFT, p.TOP);
    p.text('Curb Ramps by Condition — Seattle', PAD.left, 18);
  }

  function drawTotalLabel() {
    if (!dataReady || animT < 0.5) return;
    p.noStroke();
    p.fill(70);
    p.textSize(10);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`n = ${fmtNum(total)} ramps`, W - PAD.right, 22);
  }

  // ── hover / tooltip ───────────────────────────────────────
  function updateTooltip() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const n      = labels.length;
    if (n === 0) return;

    const slotW = chartW / n;
    const barW  = slotW * 0.55;
    const mx    = p.mouseX;
    const my    = p.mouseY;

    hoveredIndex = -1;
    const tooltip = document.getElementById('bar-chart-tooltip');
    if (!tooltip) return;

    for (let i = 0; i < n; i++) {
      const x = PAD.left + slotW * i + slotW / 2 - barW / 2;
      if (mx >= x && mx <= x + barW && my >= PAD.top && my <= H - PAD.bottom) {
        hoveredIndex = i;
        const label  = labels[i];
        const count  = counts[label] || 0;
        const share  = ((count / total) * 100).toFixed(1);
        tooltip.style.display = 'block';
        tooltip.style.left    = (p.mouseX + 20) + 'px';
        tooltip.style.top     = (p.mouseY - 10) + 'px';
        tooltip.innerHTML     = `<strong>${label}</strong><br>${fmtNum(count)} ramps &nbsp;·&nbsp; ${share}% of total`;
        return;
      }
    }
    tooltip.style.display = 'none';
  }

  // ── loading / error states ────────────────────────────────
  function drawSpinner() {
    p.noFill();
    p.stroke(80);
    p.strokeWeight(2);
    const angle = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 36, 36, angle, angle + p.PI * 1.4);
    p.noStroke();
    p.fill(70);
    p.textSize(11);
    p.textAlign(p.CENTER);
    p.text('Loading data…', W / 2, H / 2 + 30);
  }

  function drawError() {
    p.noStroke();
    p.fill('#c0392b');
    p.textSize(12);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  // ── utilities ─────────────────────────────────────────────
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function fmtNum(n) { return Number(n).toLocaleString(); }

  function toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  function fadeColor(p, hex, alpha) {
    const c = p.color(hex);
    c.setAlpha(alpha);
    return c;
  }
};

// Mount the sketch
new p5(barChartSketch);
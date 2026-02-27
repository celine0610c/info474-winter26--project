// ============================================================
//  bar-chart.js
//  Static bar chart — Seattle curb ramp counts by condition
//
//  Gestalt principles applied:
//  - Proximity:    only bars with meaningful counts are shown;
//                  consistent spacing creates clear groups
//  - Similarity:   all bars share equal width; color encodes
//                  condition severity on a consistent scale
//  - Figure/Ground: white bg, light grid recedes; bars + labels
//                  are the clear foreground
//  - Continuity:   grid lines guide the eye horizontally to the
//                  y-axis; bar tops align to a clear baseline
//  - Common Region: subtle inner padding frames the chart area
//  - Prägnanz:     labels sized by hierarchy — title > value
//                  labels > axis ticks; nothing competes equally
//
//  DEPENDS ON: shared/dataLoader.js
// ============================================================

const CONDITION_FIELD = 'CONDITION';

// Threshold — bars below this count are filtered out as noise
const MIN_COUNT = 50;

// Canonical order: best → worst, then special categories
const CONDITION_ORDER = ['Good', 'Fair', 'Poor', 'Very Poor', 'New Construction', 'Unknown'];

// Severity-coded colors: green → amber → orange → red
// Blue for New Construction (neutral/positive), gray for Unknown
const CONDITION_COLORS = {
  'Good':             '#34c759',
  'Fair':             '#ff9f0a',
  'Poor':             '#ff6b35',
  'Very Poor':        '#ff3b30',
  'New Construction': '#0071e3',
  'Unknown':          '#aeaeb2',
};
const FALLBACK_COLOR = '#aeaeb2';

// Theme — mirrors site CSS variables
const THEME = {
  bg:         '#ffffff',
  gridLine:   '#f0f0f5',   // very subtle — recedes behind bars
  axisLine:   '#e0e0e5',
  tickLabel:  '#aeaeb2',   // lighter than bar labels — clear hierarchy
  valueLabel: '#6e6e73',   // mid-weight — present but not dominant
  hoverLabel: '#1d1d1f',   // full contrast on hover only
  totalLabel: '#aeaeb2',
  font:       '-apple-system, "Helvetica Neue", sans-serif',
};

const PAD = { top: 52, right: 48, bottom: 72, left: 72 };

// ============================================================
const barChartSketch = (p) => {

  let counts       = {};
  let labels       = [];   // filtered — only bars worth showing
  let total        = 0;
  let maxCount     = 0;
  let dataReady    = false;
  let errorMsg     = null;
  let hoveredIndex = -1;

  let animT = 0;
  const ANIM_SPEED = 0.028;

  let W, H;

  // ── setup ──────────────────────────────────────────────────
  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 420;
    const cnv = p.createCanvas(W, H);
    cnv.parent('bar-chart-container');
    p.textFont(THEME.font);
    loadData();
  };

  // ── draw ───────────────────────────────────────────────────
  p.draw = function () {
    p.background(THEME.bg);

    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }

    if (animT < 1) animT = p.min(animT + ANIM_SPEED, 1);

    drawGridLines();
    drawBars();
    drawAxes();
    drawTotalLabel();
    updateTooltip();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
  };

  // ── data ───────────────────────────────────────────────────
  async function loadData() {
    try {
      const rows = await loadRampData();
      tally(rows);
      dataReady = true;
    } catch (e) {
      console.error('[bar-chart]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function tally(rows) {
    const raw = {};
    for (const row of rows) {
      let cond = (row[CONDITION_FIELD] || '').toString().trim();
      if (!cond) cond = 'Unknown';
      cond = toTitleCase(cond);
      raw[cond] = (raw[cond] || 0) + 1;
    }

    // GESTALT — PROXIMITY / PRÄGNANZ:
    // Only include bars that have a meaningful count (>= MIN_COUNT).
    // Near-zero bars create confusing empty space and imply false
    // categories. Filter them out so every bar earns its presence.
    labels = CONDITION_ORDER.filter(l => raw[l] !== undefined && raw[l] >= MIN_COUNT);
    for (const k of Object.keys(raw)) {
      if (!labels.includes(k) && raw[k] >= MIN_COUNT) labels.push(k);
    }

    counts   = raw;
    total    = rows.length;
    maxCount = p.max(labels.map(l => counts[l] || 0));
  }

  // ── grid lines ─────────────────────────────────────────────
  // GESTALT — FIGURE/GROUND + CONTINUITY:
  // Grid lines are very light (#f0f0f5) so they guide the eye
  // without competing with the bars. They run full width to
  // create horizontal continuity linking bars to y-axis values.
  function drawGridLines() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const steps  = 4; // fewer lines = less visual noise

    p.textSize(11);
    p.textAlign(p.RIGHT, p.CENTER);

    for (let i = 0; i <= steps; i++) {
      const v = Math.round((maxCount / steps) * i);
      const y = PAD.top + chartH - (chartH * i / steps);

      p.stroke(THEME.gridLine);
      p.strokeWeight(1);
      p.line(PAD.left, y, PAD.left + chartW, y);

      p.noStroke();
      p.fill(THEME.tickLabel); // lighter gray — clearly subordinate
      p.text(fmtNum(v), PAD.left - 10, y);
    }
  }

  // ── bars ───────────────────────────────────────────────────
  // GESTALT — SIMILARITY + COMMON REGION:
  // All bars have equal fixed width (not proportional to canvas).
  // They share the same baseline and corner radius, forming a
  // unified group. Color encodes severity — not random.
  function drawBars() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const n      = labels.length;
    if (n === 0) return;

    // Fixed bar width — consistent regardless of how many bars
    // This enforces SIMILARITY: every bar feels the same "weight"
    const BAR_W  = p.min(64, (chartW / n) * 0.55);
    const slotW  = chartW / n;

    for (let i = 0; i < n; i++) {
      const label = labels[i];
      const count = counts[label] || 0;
      const frac  = count / maxCount;
      const bH    = chartH * frac * easeOut(animT);
      const cx    = PAD.left + slotW * i + slotW / 2; // center of slot
      const x     = cx - BAR_W / 2;
      const y     = PAD.top + chartH - bH;
      const isHov = i === hoveredIndex;
      const col   = CONDITION_COLORS[label] || FALLBACK_COLOR;

      // GESTALT — FIGURE/GROUND:
      // Hovered bar gets full opacity + soft shadow; others dim
      // slightly. This pops the active element to foreground.
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

      // GESTALT — PRÄGNANZ (hierarchy in labels):
      // Value labels are medium gray at rest, dark only on hover.
      // They sit clearly above the bar with consistent spacing.
      // They are larger than tick labels but smaller than the title —
      // a clear three-level reading hierarchy.
      if (animT > 0.85 && bH > 18) {
        p.noStroke();
        p.fill(isHov ? THEME.hoverLabel : THEME.valueLabel);
        p.textSize(12);
        p.textStyle(isHov ? p.BOLD : p.NORMAL);
        p.textAlign(p.CENTER, p.BOTTOM);
        p.text(fmtNum(count), cx, y - 7);
        p.textStyle(p.NORMAL);
      }

      // x-axis label — split two-word labels across two lines
      // so they stay narrow and don't crowd their neighbor
      p.noStroke();
      p.fill(isHov ? THEME.hoverLabel : THEME.tickLabel);
      p.textSize(11);
      p.textAlign(p.CENTER, p.TOP);
      const words = label.split(' ');
      if (words.length > 1) {
        p.text(words[0],                 cx, H - PAD.bottom + 10);
        p.text(words.slice(1).join(' '), cx, H - PAD.bottom + 23);
      } else {
        p.text(label, cx, H - PAD.bottom + 10);
      }
    }
  }

  // ── axes ───────────────────────────────────────────────────
  function drawAxes() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;

    // Baseline only — no full y-axis spine to reduce clutter
    p.stroke(THEME.axisLine);
    p.strokeWeight(1);
    p.line(PAD.left, PAD.top + chartH, PAD.left + chartW, PAD.top + chartH);

    // Axis labels — lightest text in the chart
    p.push();
    p.noStroke();
    p.fill(THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.translate(14, H / 2);
    p.rotate(-p.HALF_PI);
    p.text('NUMBER OF RAMPS', 0, 0);
    p.pop();

    p.noStroke();
    p.fill(THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.text('CONDITION', W / 2, H - 8);
  }

  // ── total label ────────────────────────────────────────────
  function drawTotalLabel() {
    if (!dataReady || animT < 0.5) return;
    p.noStroke();
    p.fill(THEME.totalLabel);
    p.textSize(11);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`n = ${fmtNum(total)} ramps`, W - PAD.right, 14);
  }

  // ── tooltip ────────────────────────────────────────────────
  function updateTooltip() {
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;
    const n      = labels.length;
    if (n === 0) return;

    const slotW   = chartW / n;
    const BAR_W   = p.min(64, slotW * 0.55);
    const tooltip = document.getElementById('bar-chart-tooltip');
    if (!tooltip) return;

    hoveredIndex = -1;

    for (let i = 0; i < n; i++) {
      const cx = PAD.left + slotW * i + slotW / 2;
      const x  = cx - BAR_W / 2;
      if (p.mouseX >= x && p.mouseX <= x + BAR_W &&
          p.mouseY >= PAD.top && p.mouseY <= H - PAD.bottom) {
        hoveredIndex = i;
        const label = labels[i];
        const count = counts[label] || 0;
        const share = ((count / total) * 100).toFixed(1);
        tooltip.style.display = 'block';
        tooltip.style.left    = (p.mouseX + 16) + 'px';
        tooltip.style.top     = (p.mouseY - 14) + 'px';
        tooltip.innerHTML     = `<strong>${label}</strong>${fmtNum(count)} ramps · ${share}% of total`;
        return;
      }
    }
    tooltip.style.display = 'none';
  }

  // ── spinner ────────────────────────────────────────────────
  function drawSpinner() {
    p.background(THEME.bg);
    p.noFill();
    p.stroke(THEME.tickLabel);
    p.strokeWeight(1.5);
    const angle = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, angle, angle + p.PI * 1.4);
    p.noStroke();
    p.fill(THEME.tickLabel);
    p.textSize(11);
    p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  // ── error ──────────────────────────────────────────────────
  function drawError() {
    p.background(THEME.bg);
    p.noStroke();
    p.fill('#ff3b30');
    p.textSize(13);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  // ── utils ──────────────────────────────────────────────────
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtNum(n)  { return Number(n).toLocaleString(); }
  function toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  function fadeColor(p, hex, alpha) {
    const c = p.color(hex);
    c.setAlpha(alpha);
    return c;
  }
};

new p5(barChartSketch);
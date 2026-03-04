// ============================================================
//  filterable-bar.js  (scatter plot — replaces filterable bar)
//  Neighborhood scatter: avg ramp age vs % poor/fair condition
//
//  X axis: average ramp age (years since install)
//  Y axis: % of ramps in poor or fair condition
//  Dot size: total ramps in neighborhood
//  Color: district
//
//  DEPENDS ON: shared/dataLoader.js
// ============================================================

const SC_DISTRICT_COLORS = {
  'DISTRICT1': '#ff6b35',
  'DISTRICT2': '#ff3b30',
  'DISTRICT3': '#ff9f0a',
  'DISTRICT4': '#34c759',
  'DISTRICT5': '#0071e3',
  'DISTRICT6': '#5e5ce6',
  'DISTRICT7': '#ac8e68',
};

const SC_DISTRICT_LABELS = {
  'DISTRICT1': 'SW',
  'DISTRICT2': 'South',
  'DISTRICT3': 'Central',
  'DISTRICT4': 'NE',
  'DISTRICT5': 'North',
  'DISTRICT6': 'NW',
  'DISTRICT7': 'Downtown',
};

const SC_THEME = {
  bg:        '#ffffff',
  gridLine:  '#f0f0f5',
  axisLine:  '#e0e0e5',
  tickLabel: '#aeaeb2',
  hoverLabel:'#1d1d1f',
  font:      '-apple-system, "Helvetica Neue", sans-serif',
};

const SC_PAD = { top: 52, right: 160, bottom: 64, left: 72 };

const scatterSketch = (p) => {

  let points     = [];
  let dataReady  = false;
  let errorMsg   = null;
  let hoveredIdx = -1;
  let animT      = 0;
  const ANIM_SPEED = 0.025;

  let W, H;
  let xMin, xMax, yMin, yMax;

  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 460;
    p.createCanvas(W, H).parent('filterable-bar-container');
    p.textFont(SC_THEME.font);
    loadData();
  };

  p.draw = function () {
    p.background(SC_THEME.bg);
    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }
    if (animT < 1)  animT = p.min(animT + ANIM_SPEED, 1);
    drawQuadrants();
    drawGridLines();
    drawTrendLine();
    drawDots();
    drawAxes();
    drawLegend();
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
      buildPoints(rows);
      dataReady = true;
    } catch (e) {
      console.error('[scatter]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function buildPoints(rows) {
    const hoodData = {};
    const currentYear = new Date().getFullYear();

    for (const row of rows) {
      const hood = (row.NEIGHBORHOOD || '').trim();
      if (!hood || hood === 'Unknown') continue;

      const cond = normCond(row['CONDITION']);
      const dist = (row['PRIMARYDISTRICTCD'] || '').trim();

      if (!hoodData[hood]) hoodData[hood] = { ages: [], notGood: 0, total: 0, district: dist };

      hoodData[hood].total++;
      if (cond === 'Poor' || cond === 'Very Poor' || cond === 'Fair') {
        hoodData[hood].notGood++;
      }

      const m = (row['INSTALL_DATE'] || '').toString().match(/(19|20)\d{2}/);
      if (m) {
        const yr = parseInt(m[0], 10);
        if (yr >= 1970 && yr <= currentYear) {
          hoodData[hood].ages.push(currentYear - yr);
        }
      }
    }

    points = Object.entries(hoodData)
      .filter(([, d]) => d.total >= 10 && d.ages.length >= 5)
      .map(([hood, d]) => ({
        hood,
        district: d.district,
        avgAge:   d.ages.reduce((s, a) => s + a, 0) / d.ages.length,
        pctPoor:  (d.notGood / d.total) * 100,
        total:    d.total,
      }));

    xMin = Math.max(0,   p.min(points.map(pt => pt.avgAge))  - 2);
    xMax =               p.max(points.map(pt => pt.avgAge))  + 2;
    yMin = Math.max(0,   p.min(points.map(pt => pt.pctPoor)) - 5);
    yMax = Math.min(100, p.max(points.map(pt => pt.pctPoor)) + 5);

    console.log('[scatter] ✓', points.length, 'neighborhoods plotted');
  }

  // ── helpers ────────────────────────────────────────────────
  function cW() { return W - SC_PAD.left - SC_PAD.right; }
  function cH() { return H - SC_PAD.top  - SC_PAD.bottom; }
  function xPos(v) { return SC_PAD.left + ((v - xMin) / (xMax - xMin)) * cW(); }
  function yPos(v) { return SC_PAD.top  + cH() - ((v - yMin) / (yMax - yMin)) * cH(); }
  function dotR(total) {
    const mx = p.max(points.map(pt => pt.total));
    return p.map(total, 0, mx, 4, 18);
  }

  // ── quadrant labels ────────────────────────────────────────
  function drawQuadrants() {
    const midX = xMin + (xMax - xMin) / 2;
    const midY = yMin + (yMax - yMin) / 2;
    const mx   = xPos(midX);
    const my   = yPos(midY);

    // Subtle crosshair
    p.stroke('#ebebf0'); p.strokeWeight(1);
    p.line(mx, SC_PAD.top, mx, SC_PAD.top + cH());
    p.line(SC_PAD.left, my, SC_PAD.left + cW(), my);

    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(9);

    p.textAlign(p.LEFT,  p.TOP);    p.text('NEWER · MORE PROBLEMS',  SC_PAD.left + 8, SC_PAD.top + 8);
    p.textAlign(p.RIGHT, p.TOP);    p.text('OLDER · MORE PROBLEMS',   SC_PAD.left + cW() - 8, SC_PAD.top + 8);
    p.textAlign(p.LEFT,  p.BOTTOM); p.text('NEWER · FEWER PROBLEMS',  SC_PAD.left + 8, SC_PAD.top + cH() - 8);
    p.textAlign(p.RIGHT, p.BOTTOM); p.text('OLDER · FEWER PROBLEMS',  SC_PAD.left + cW() - 8, SC_PAD.top + cH() - 8);
  }

  // ── grid ───────────────────────────────────────────────────
  function drawGridLines() {
    p.textSize(10);

    for (let i = 0; i <= 5; i++) {
      const val = xMin + (xMax - xMin) * (i / 5);
      const x   = xPos(val);
      p.stroke(SC_THEME.gridLine); p.strokeWeight(1);
      p.line(x, SC_PAD.top, x, SC_PAD.top + cH());
      p.noStroke(); p.fill(SC_THEME.tickLabel);
      p.textAlign(p.CENTER, p.TOP);
      p.text(Math.round(val) + 'y', x, SC_PAD.top + cH() + 8);
    }

    for (let i = 0; i <= 4; i++) {
      const val = yMin + (yMax - yMin) * (i / 4);
      const y   = yPos(val);
      p.stroke(SC_THEME.gridLine); p.strokeWeight(1);
      p.line(SC_PAD.left, y, SC_PAD.left + cW(), y);
      p.noStroke(); p.fill(SC_THEME.tickLabel);
      p.textAlign(p.RIGHT, p.CENTER);
      p.text(Math.round(val) + '%', SC_PAD.left - 8, y);
    }
  }

  // ── trend line ─────────────────────────────────────────────
  function drawTrendLine() {
    if (points.length < 3) return;
    const n     = points.length;
    const sumX  = points.reduce((s, pt) => s + pt.avgAge,  0);
    const sumY  = points.reduce((s, pt) => s + pt.pctPoor, 0);
    const sumXY = points.reduce((s, pt) => s + pt.avgAge * pt.pctPoor, 0);
    const sumX2 = points.reduce((s, pt) => s + pt.avgAge * pt.avgAge,  0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const b     = (sumY - slope * sumX) / n;

    p.stroke('#d0d0d8'); p.strokeWeight(1.5);
    p.drawingContext.setLineDash([5, 5]);
    p.line(xPos(xMin), yPos(slope * xMin + b), xPos(xMax), yPos(slope * xMax + b));
    p.drawingContext.setLineDash([]);

    // Trend label
    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(9); p.textAlign(p.RIGHT, p.BOTTOM);
    p.text('trend', xPos(xMax) - 4, yPos(slope * xMax + b) - 4);
  }

  // ── dots ───────────────────────────────────────────────────
  function drawDots() {
    const t = easeOut(animT);

    // Draw non-hovered first, hovered on top
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < points.length; i++) {
        const isHov = i === hoveredIdx;
        if (pass === 0 && isHov)  continue;
        if (pass === 1 && !isHov) continue;

        const pt  = points[i];
        const x   = xPos(pt.avgAge);
        const y   = yPos(pt.pctPoor * t);
        const r   = dotR(pt.total);
        const col = SC_DISTRICT_COLORS[pt.district] || '#aeaeb2';

        if (isHov) {
          p.drawingContext.shadowColor = col + '55';
          p.drawingContext.shadowBlur  = 18;
        }

        p.stroke('#ffffff'); p.strokeWeight(isHov ? 2 : 1);
        p.fill(isHov ? col : fadeColor(p, col, 170));
        p.circle(x, y, r * 2);

        p.drawingContext.shadowBlur = 0;

        // Neighborhood label on hover
        if (isHov) {
          const label = pt.hood;
          p.textSize(11);
          const tW  = p.textWidth(label) + 16;
          const tH  = 22;
          const bx  = x + r + 8 + tW > W - SC_PAD.right ? x - r - tW - 8 : x + r + 8;
          const by  = y - tH / 2;
          p.noStroke(); p.fill(SC_THEME.hoverLabel);
          p.rect(bx, by, tW, tH, 4);
          p.fill('#ffffff');
          p.textAlign(p.LEFT, p.CENTER);
          p.text(label, bx + 8, by + tH / 2);
        }
      }
    }
  }

  // ── axes ───────────────────────────────────────────────────
  function drawAxes() {
    const bl = SC_PAD.top + cH();
    p.stroke(SC_THEME.axisLine); p.strokeWeight(1);
    p.line(SC_PAD.left, SC_PAD.top, SC_PAD.left, bl);
    p.line(SC_PAD.left, bl, SC_PAD.left + cW(), bl);

    p.push();
    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(10); p.textAlign(p.CENTER);
    p.translate(14, H / 2); p.rotate(-p.HALF_PI);
    p.text('% POOR OR FAIR CONDITION', 0, 0);
    p.pop();

    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(10); p.textAlign(p.CENTER);
    p.text('AVERAGE RAMP AGE (YEARS)', SC_PAD.left + cW() / 2, H - 8);
  }

  // ── legend ─────────────────────────────────────────────────
  function drawLegend() {
    const lx = W - SC_PAD.right + 20;
    let   ly = SC_PAD.top + 10;

    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(10); p.textAlign(p.LEFT, p.TOP);
    p.text('DISTRICT', lx, ly);
    ly += 18;

    for (const [code, label] of Object.entries(SC_DISTRICT_LABELS)) {
      const col = SC_DISTRICT_COLORS[code];
      p.noStroke(); p.fill(col);
      p.circle(lx + 6, ly + 6, 11);
      p.noStroke(); p.fill(SC_THEME.hoverLabel);
      p.textSize(11); p.textAlign(p.LEFT, p.CENTER);
      p.text(label, lx + 16, ly + 6);
      ly += 20;
    }

    ly += 14;
    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(9); p.textAlign(p.LEFT, p.TOP);
    p.text('DOT SIZE = # RAMPS', lx, ly);
  }

  // ── tooltip ────────────────────────────────────────────────
  function updateTooltip() {
    const tooltip = document.getElementById('filterable-bar-tooltip');
    if (!tooltip) return;

    let closest = -1, closestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const x  = xPos(pt.avgAge);
      const y  = yPos(pt.pctPoor);
      const r  = dotR(pt.total);
      const d  = Math.hypot(p.mouseX - x, p.mouseY - y);
      if (d < r + 8 && d < closestD) { closestD = d; closest = i; }
    }

    hoveredIdx = closest;

    if (closest >= 0) {
      const pt   = points[closest];
      const dist = SC_DISTRICT_LABELS[pt.district] || pt.district;
      tooltip.style.display = 'block';
      tooltip.style.left    = (p.mouseX + 16) + 'px';
      tooltip.style.top     = (p.mouseY - 14) + 'px';
      tooltip.innerHTML     = `
        <strong>${pt.hood}</strong>${dist} District<br>
        Avg age: ${Math.round(pt.avgAge)} yrs &nbsp;·&nbsp; ${Math.round(pt.pctPoor)}% poor/fair<br>
        <span style="color:#aeaeb2;font-size:0.75rem">${pt.total.toLocaleString()} ramps total</span>
      `;
    } else {
      tooltip.style.display = 'none';
    }
  }

  // ── spinner / error ────────────────────────────────────────
  function drawSpinner() {
    p.background(SC_THEME.bg);
    p.noFill(); p.stroke(SC_THEME.tickLabel); p.strokeWeight(1.5);
    const a = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, a, a + p.PI * 1.4);
    p.noStroke(); p.fill(SC_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  function drawError() {
    p.background(SC_THEME.bg);
    p.noStroke(); p.fill('#ff3b30');
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  // ── utils ──────────────────────────────────────────────────
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function normCond(v) {
    const s = (v || '').toString().trim().toLowerCase();
    if (!s) return 'Unknown';
    if (s.includes('new'))                 return 'New Construction';
    if (s === 'very poor')                 return 'Very Poor';
    if (s === 'poor')                      return 'Poor';
    if (s === 'fair')                      return 'Fair';
    if (s === 'good' || s === 'excellent') return 'Good';
    return 'Unknown';
  }

  function fadeColor(p, hex, alpha) {
    const c = p.color(hex);
    c.setAlpha(alpha);
    return c;
  }
};

new p5(scatterSketch);
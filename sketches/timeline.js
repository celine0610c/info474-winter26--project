const TIMELINE_THEME = {
  bg:        '#ffffff',
  gridLine:  '#f0f0f5',
  axisLine:  '#e0e0e5',
  tickLabel: '#aeaeb2',
  hoverLabel:'#1d1d1f',
  lineColor: '#0071e3',
  annotBg:   '#1d1d1f',
  annotText: '#ffffff',
  font:      '-apple-system, "Helvetica Neue", sans-serif',
};

const TPAD = { top: 52, right: 48, bottom: 64, left: 72 };

// ============================================================
const timelineSketch = (p) => {

  let yearCounts = {};
  let years      = [];
  let maxCount   = 0;
  let total      = 0;
  let peakYear   = null;
  let dataReady  = false;
  let errorMsg   = null;
  let hoveredIdx = -1;
  let animT      = 0;
  const ANIM_SPEED = 0.022;
  let W, H;

  // ── setup ──────────────────────────────────────────────────
  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 420;
    p.createCanvas(W, H).parent('timeline-container');
    p.textFont(TIMELINE_THEME.font);
    loadData();
  };

  // ── draw ───────────────────────────────────────────────────
  p.draw = function () {
    p.background(TIMELINE_THEME.bg);
    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }
    if (animT < 1)  animT = p.min(animT + ANIM_SPEED, 1);
    drawGridLines();
    drawFilledArea();
    drawLine();
    drawDots();
    drawAxes();
    drawAnnotation();
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
      console.error('[timeline]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function tally(rows) {
    const raw = {};
    const currentYear = new Date().getFullYear();

    for (const row of rows) {
      const dateStr = (row['INSTALL_DATE'] || '').trim();
      if (!dateStr) continue;

      // Format from CSV: "M/D/YYYY HH:MM:SS AM/PM"
      // Split on space → first token is "M/D/YYYY"
      // Split that on "/" → index 2 is the 4-digit year
      let year = null;
      const datePart = dateStr.split(' ')[0];   // "M/D/YYYY"
      const parts    = datePart.split('/');      // ["M", "D", "YYYY"]
      if (parts.length === 3 && parts[2].length === 4) {
        year = parseInt(parts[2], 10);
      }

      // Sanity check
      if (!year || isNaN(year) || year < 1970 || year > new Date().getFullYear()) continue;

      raw[year] = (raw[year] || 0) + 1;
    }

    years      = Object.keys(raw).map(Number).sort((a, b) => a - b);
    yearCounts = raw;
    total      = years.reduce((sum, y) => sum + raw[y], 0);
    maxCount   = Math.max(...years.map(y => raw[y]));
    peakYear   = years.reduce((a, b) => raw[a] > raw[b] ? a : b, years[0]);

    console.log('[timeline] Years parsed:', years.length, '| Peak:', peakYear, '(', raw[peakYear], ')');
  }

  // ── coordinate helpers ─────────────────────────────────────
  function cW() { return W - TPAD.left - TPAD.right; }
  function cH() { return H - TPAD.top  - TPAD.bottom; }

  function xFor(i) {
    return TPAD.left + (i / (years.length - 1)) * cW();
  }

  function yFor(count) {
    return TPAD.top + cH() - (count * easeOut(animT) / maxCount) * cH();
  }

  // ── grid lines ─────────────────────────────────────────────
  function drawGridLines() {
    const steps = 4;
    p.textSize(11);
    p.textAlign(p.RIGHT, p.CENTER);
    for (let i = 0; i <= steps; i++) {
      const v = Math.round((maxCount / steps) * i);
      const y = TPAD.top + cH() - (cH() * i / steps);
      p.stroke(TIMELINE_THEME.gridLine);
      p.strokeWeight(1);
      p.line(TPAD.left, y, TPAD.left + cW(), y);
      p.noStroke();
      p.fill(TIMELINE_THEME.tickLabel);
      p.text(fmtNum(v), TPAD.left - 10, y);
    }
  }

  // ── filled area ─────────────────────────────────────────────
  function drawFilledArea() {
    if (years.length < 2) return;
    const baseline = TPAD.top + cH();
    const grad = p.drawingContext.createLinearGradient(0, TPAD.top, 0, baseline);
    grad.addColorStop(0, 'rgba(0,113,227,0.12)');
    grad.addColorStop(1, 'rgba(0,113,227,0.00)');

    p.drawingContext.beginPath();
    p.drawingContext.moveTo(xFor(0), baseline);
    for (let i = 0; i < years.length; i++) {
      const x = xFor(i);
      const y = yFor(yearCounts[years[i]]);
      if (i === 0) {
        p.drawingContext.lineTo(x, y);
      } else {
        const px  = xFor(i - 1);
        const py  = yFor(yearCounts[years[i - 1]]);
        const cpx = (px + x) / 2;
        p.drawingContext.bezierCurveTo(cpx, py, cpx, y, x, y);
      }
    }
    p.drawingContext.lineTo(xFor(years.length - 1), baseline);
    p.drawingContext.closePath();
    p.drawingContext.fillStyle = grad;
    p.drawingContext.fill();
  }

  // ── line ───────────────────────────────────────────────────
  function drawLine() {
    if (years.length < 2) return;
    p.noFill();
    p.stroke(TIMELINE_THEME.lineColor);
    p.strokeWeight(2.5);
    p.drawingContext.beginPath();
    for (let i = 0; i < years.length; i++) {
      const x = xFor(i);
      const y = yFor(yearCounts[years[i]]);
      if (i === 0) {
        p.drawingContext.moveTo(x, y);
      } else {
        const px  = xFor(i - 1);
        const py  = yFor(yearCounts[years[i - 1]]);
        const cpx = (px + x) / 2;
        p.drawingContext.bezierCurveTo(cpx, py, cpx, y, x, y);
      }
    }
    p.drawingContext.stroke();
  }

  // ── dots ───────────────────────────────────────────────────
  function drawDots() {
    for (let i = 0; i < years.length; i++) {
      const x     = xFor(i);
      const y     = yFor(yearCounts[years[i]]);
      const isHov = i === hoveredIdx;
      if (isHov) {
        p.stroke(TIMELINE_THEME.lineColor);
        p.strokeWeight(2);
        p.fill(255);
        p.circle(x, y, 10);
        p.noStroke();
        p.fill(TIMELINE_THEME.lineColor);
        p.circle(x, y, 5);
      } else {
        p.noStroke();
        p.fill(TIMELINE_THEME.lineColor);
        p.circle(x, y, 4);
      }
    }
  }

  // ── axes ───────────────────────────────────────────────────
  function drawAxes() {
    const baseline = TPAD.top + cH();
    p.stroke(TIMELINE_THEME.axisLine);
    p.strokeWeight(1);
    p.line(TPAD.left, baseline, TPAD.left + cW(), baseline);

    // Y label
    p.push();
    p.noStroke(); p.fill(TIMELINE_THEME.tickLabel);
    p.textSize(10); p.textAlign(p.CENTER);
    p.translate(14, H / 2); p.rotate(-p.HALF_PI);
    p.text('RAMPS INSTALLED', 0, 0);
    p.pop();

    // X labels — every 5 years only (Gestalt: Proximity)
    p.noStroke(); p.fill(TIMELINE_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.CENTER, p.TOP);
    for (let i = 0; i < years.length; i++) {
      if (years[i] % 5 !== 0) continue;
      p.text(years[i], xFor(i), baseline + 10);
    }
  }

  // ── annotation ─────────────────────────────────────────────
  function drawAnnotation() {
    if (!peakYear || animT < 0.75) return;
    const idx   = years.indexOf(peakYear);
    const x     = xFor(idx);
    const y     = yFor(yearCounts[peakYear]);
    const label = `Peak: ${peakYear}  (${fmtNum(yearCounts[peakYear])})`;

    p.textSize(11);
    const tW = p.textWidth(label) + 20;
    const tH = 26;
    const bx = (x + tW + 16 > W - TPAD.right) ? x - tW - 10 : x + 10;
    const by = y - tH / 2;

    p.noStroke(); p.fill(TIMELINE_THEME.annotBg);
    p.rect(bx, by, tW, tH, 6);

    p.stroke(TIMELINE_THEME.annotBg); p.strokeWeight(1);
    p.line(bx < x ? bx + tW : bx, y, x, y);

    p.noStroke(); p.fill(TIMELINE_THEME.annotText);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(label, bx + 10, by + tH / 2);
  }

  // ── total label ────────────────────────────────────────────
  function drawTotalLabel() {
    if (!dataReady || animT < 0.5) return;
    p.noStroke(); p.fill(TIMELINE_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.RIGHT, p.TOP);
    p.text(`${years[0]}–${years[years.length - 1]}  ·  n = ${fmtNum(total)} ramps`, W - TPAD.right, 14);
  }

  // ── tooltip ────────────────────────────────────────────────
  function updateTooltip() {
    if (!years.length) return;
    const tooltip = document.getElementById('timeline-tooltip');
    if (!tooltip) return;

    let closest = -1, closestD = Infinity;
    for (let i = 0; i < years.length; i++) {
      const d = Math.abs(p.mouseX - xFor(i));
      if (d < closestD) { closestD = d; closest = i; }
    }

    const inChart = p.mouseX >= TPAD.left && p.mouseX <= W - TPAD.right &&
                    p.mouseY >= TPAD.top  && p.mouseY <= H - TPAD.bottom;

    if (inChart && closestD < cW() / years.length / 2 + 10) {
      hoveredIdx = closest;
      const yr    = years[closest];
      const count = yearCounts[yr];
      const share = ((count / total) * 100).toFixed(1);
      tooltip.style.display = 'block';
      tooltip.style.left    = (p.mouseX + 16) + 'px';
      tooltip.style.top     = (p.mouseY - 14) + 'px';
      tooltip.innerHTML     = `<strong>${yr}</strong>${fmtNum(count)} ramps · ${share}% of total`;
    } else {
      hoveredIdx = -1;
      tooltip.style.display = 'none';
    }
  }

  // ── spinner ────────────────────────────────────────────────
  function drawSpinner() {
    p.background(TIMELINE_THEME.bg);
    p.noFill(); p.stroke(TIMELINE_THEME.tickLabel); p.strokeWeight(1.5);
    const a = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, a, a + p.PI * 1.4);
    p.noStroke(); p.fill(TIMELINE_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  // ── error ──────────────────────────────────────────────────
  function drawError() {
    p.background(TIMELINE_THEME.bg);
    p.noStroke(); p.fill('#ff3b30');
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  // ── utils ──────────────────────────────────────────────────
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtNum(n)  { return Number(n).toLocaleString(); }
};

new p5(timelineSketch);
const HEATMAP_CONDITION_ORDER = ['Good', 'New Construction', 'Fair', 'Poor', 'Very Poor', 'Unknown'];

const HEATMAP_THEME = {
  bg:          '#ffffff',
  gridLine:    '#f0f0f5',
  axisLine:    '#e0e0e5',
  tickLabel:   '#aeaeb2',
  hoverLabel:  '#1d1d1f',
  cellEmpty:   '#f5f5f7',
  cellLow:     '#cce4ff',
  cellMid:     '#0071e3',
  cellHigh:    '#003380',
  hoverBorder: '#1d1d1f',
  totalLabel:  '#aeaeb2',
  font:        '-apple-system, "Helvetica Neue", sans-serif',
};

const HPAD = { top: 52, right: 48, bottom: 64, left: 132 };

const heatmapSketch = (p) => {

  let grid       = {};
  let conditions = [];
  let decades    = [];
  let maxCount   = 0;
  let total      = 0;
  let dataReady  = false;
  let errorMsg   = null;
  let hoveredCell = null;
  let animT      = 0;
  const ANIM_SPEED = 0.025;

  let W, H;
  let CELL_W, CELL_H;

  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 380;
    p.createCanvas(W, H).parent('heatmap-container');
    p.textFont(HEATMAP_THEME.font);
    loadData();
  };

  p.draw = function () {
    p.background(HEATMAP_THEME.bg);
    if (errorMsg)   { drawError();   return; }
    if (!dataReady) { drawSpinner(); return; }
    if (animT < 1)  animT = p.min(animT + ANIM_SPEED, 1);

    updateCellSize();
    drawCells();
    drawRowLabels();
    drawColLabels();
    drawBaseline();
    drawTotalLabel();
    updateTooltip();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
  };

  async function loadData() {
    try {
      const rows = await loadRampData();
      tally(rows);
      dataReady = true;
    } catch (e) {
      console.error('[heatmap]', e);
      errorMsg = 'Failed to load data.';
    }
  }

  function tally(rows) {
    const raw = {};

    for (const row of rows) {
      let cond = (row['CONDITION'] || '').toString().trim();
      if (!cond) cond = 'Unknown';
      cond = toTitleCase(cond);

      // parse "M/D/YYYY HH:MM:SS" → decade
      const dateStr  = (row['INSTALL_DATE'] || '').trim();
      const datePart = dateStr.split(' ')[0];
      const parts    = datePart.split('/');
      if (parts.length < 3 || parts[2].length !== 4) continue;
      const year = parseInt(parts[2], 10);
      if (isNaN(year) || year < 1970 || year > new Date().getFullYear()) continue;
      const decade = Math.floor(year / 10) * 10;

      if (!raw[cond]) raw[cond] = {};
      raw[cond][decade] = (raw[cond][decade] || 0) + 1;
    }

    conditions = HEATMAP_CONDITION_ORDER.filter(c => raw[c]);
    for (const k of Object.keys(raw)) {
      if (!conditions.includes(k)) conditions.push(k);
    }

    const decadeSet = new Set();
    for (const c of conditions) {
      for (const d of Object.keys(raw[c])) decadeSet.add(Number(d));
    }
    decades = [...decadeSet].sort((a, b) => a - b);

    grid     = raw;
    maxCount = 0;
    total    = 0;
    for (const c of conditions) {
      for (const d of decades) {
        const v = raw[c][d] || 0;
        if (v > maxCount) maxCount = v;
        total += v;
      }
    }
  }

  function updateCellSize() {
    const chartW = W - HPAD.left - HPAD.right;
    const chartH = H - HPAD.top  - HPAD.bottom;
    CELL_W = chartW / Math.max(decades.length, 1);
    CELL_H = chartH / Math.max(conditions.length, 1);
  }

  function drawCells() {
    const ease = easeOut(animT);

    for (let ri = 0; ri < conditions.length; ri++) {
      for (let ci = 0; ci < decades.length; ci++) {
        const count = (grid[conditions[ri]] || {})[decades[ci]] || 0;
        const x     = HPAD.left + ci * CELL_W;
        const y     = HPAD.top  + ri * CELL_H;
        const pad   = 3;
        const isHov = hoveredCell && hoveredCell.ri === ri && hoveredCell.ci === ci;

        const col = count === 0
          ? HEATMAP_THEME.cellEmpty
          : lerpColor3(
              p.color(HEATMAP_THEME.cellLow),
              p.color(HEATMAP_THEME.cellMid),
              p.color(HEATMAP_THEME.cellHigh),
              (count / maxCount) * ease
            );

        if (isHov) {
          p.drawingContext.shadowColor   = 'rgba(0,0,0,0.18)';
          p.drawingContext.shadowBlur    = 10;
          p.drawingContext.shadowOffsetY = 2;
        }

        p.noStroke();
        p.fill(col);
        p.rect(x + pad, y + pad, CELL_W - pad * 2, CELL_H - pad * 2, 5);

        p.drawingContext.shadowBlur    = 0;
        p.drawingContext.shadowOffsetY = 0;

        if (isHov) {
          p.noFill();
          p.stroke(HEATMAP_THEME.hoverBorder);
          p.strokeWeight(1.5);
          p.rect(x + pad, y + pad, CELL_W - pad * 2, CELL_H - pad * 2, 5);
        }

        // only show count if cell is big enough
        if (count > 0 && CELL_W > 38 && CELL_H > 22 && animT > 0.85) {
          const textFill = (count / maxCount) > 0.55 ? '#ffffff' : HEATMAP_THEME.hoverLabel;
          p.noStroke();
          p.fill(textFill);
          p.textSize(10);
          p.textAlign(p.CENTER, p.CENTER);
          p.text(fmtNum(count), x + CELL_W / 2, y + CELL_H / 2);
        }
      }
    }
  }

  function drawRowLabels() {
    p.textSize(12);
    p.textAlign(p.RIGHT, p.CENTER);
    for (let ri = 0; ri < conditions.length; ri++) {
      const y     = HPAD.top + ri * CELL_H + CELL_H / 2;
      const isHov = hoveredCell && hoveredCell.ri === ri;
      p.noStroke();
      p.fill(isHov ? HEATMAP_THEME.hoverLabel : HEATMAP_THEME.tickLabel);
      p.textStyle(isHov ? p.BOLD : p.NORMAL);
      p.text(conditions[ri], HPAD.left - 10, y);
      p.textStyle(p.NORMAL);
    }
  }

  function drawColLabels() {
    const baseline = HPAD.top + conditions.length * CELL_H;
    p.textSize(11);
    p.textAlign(p.CENTER, p.TOP);
    for (let ci = 0; ci < decades.length; ci++) {
      const x     = HPAD.left + ci * CELL_W + CELL_W / 2;
      const isHov = hoveredCell && hoveredCell.ci === ci;
      p.noStroke();
      p.fill(isHov ? HEATMAP_THEME.hoverLabel : HEATMAP_THEME.tickLabel);
      p.textStyle(isHov ? p.BOLD : p.NORMAL);
      p.text(decades[ci] + 's', x, baseline + 10);
      p.textStyle(p.NORMAL);
    }

    p.noStroke();
    p.fill(HEATMAP_THEME.tickLabel);
    p.textSize(10);
    p.textAlign(p.CENTER);
    p.text('INSTALLATION DECADE', W / 2, H - 8);
  }

  function drawBaseline() {
    const y = HPAD.top + conditions.length * CELL_H;
    p.stroke(HEATMAP_THEME.axisLine);
    p.strokeWeight(1);
    p.line(HPAD.left, y, W - HPAD.right, y);
  }

  function drawTotalLabel() {
    if (animT < 0.5) return;
    p.noStroke();
    p.fill(HEATMAP_THEME.totalLabel);
    p.textSize(11);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`n = ${fmtNum(total)} ramps`, W - HPAD.right, 14);
  }

  function updateTooltip() {
    const tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) return;

    const ci = Math.floor((p.mouseX - HPAD.left) / CELL_W);
    const ri = Math.floor((p.mouseY - HPAD.top)  / CELL_H);

    const inBounds =
      p.mouseX >= HPAD.left &&
      p.mouseX <= HPAD.left + decades.length * CELL_W &&
      p.mouseY >= HPAD.top  &&
      p.mouseY <= HPAD.top  + conditions.length * CELL_H &&
      ci >= 0 && ci < decades.length &&
      ri >= 0 && ri < conditions.length;

    if (inBounds) {
      hoveredCell = { ri, ci };
      const count = (grid[conditions[ri]] || {})[decades[ci]] || 0;
      const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      tooltip.style.display = 'block';
      tooltip.style.left    = (p.mouseX + 16) + 'px';
      tooltip.style.top     = (p.mouseY - 14) + 'px';
      tooltip.innerHTML     = `<strong>${conditions[ri]}</strong> · ${decades[ci]}s<br>${fmtNum(count)} ramps · ${share}% of total`;
    } else {
      hoveredCell = null;
      tooltip.style.display = 'none';
    }
  }

  function drawSpinner() {
    p.background(HEATMAP_THEME.bg);
    p.noFill(); p.stroke(HEATMAP_THEME.tickLabel); p.strokeWeight(1.5);
    const a = (p.frameCount * 0.05) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, a, a + p.PI * 1.4);
    p.noStroke(); p.fill(HEATMAP_THEME.tickLabel);
    p.textSize(11); p.textAlign(p.CENTER);
    p.text('Loading…', W / 2, H / 2 + 26);
  }

  function drawError() {
    p.background(HEATMAP_THEME.bg);
    p.noStroke(); p.fill('#ff3b30');
    p.textSize(13); p.textAlign(p.CENTER, p.CENTER);
    p.text(errorMsg, W / 2, H / 2);
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function fmtNum(n)  { return Number(n).toLocaleString(); }
  function toTitleCase(s) {
    return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  // three-stop lerp: low → mid → high
  function lerpColor3(a, b, c, t) {
    if (t <= 0.5) return p.lerpColor(a, b, t * 2);
    return p.lerpColor(b, c, (t - 0.5) * 2);
  }
};

new p5(heatmapSketch);
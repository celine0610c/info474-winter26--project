const searchFilterSketch = (p) => {
  const PAD = { top: 18, right: 18, bottom: 18, left: 18 };

  let W, H;
  let rows = [];
  let filtered = [];
  let dataReady = false;
  let errorMsg = null;

  let ui = null;

  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 420;

    const cnv = p.createCanvas(W, H);
    cnv.parent("search-filter-viz");

    p.textFont('-apple-system, "Helvetica Neue", sans-serif');
    p.noLoop();

    loadData();
  };

  p.draw = function () {
    p.background(255);

    if (errorMsg) {
      drawError(errorMsg);
      return;
    }
    if (!dataReady) {
      drawSpinner();
      return;
    }

    drawHeader();
    drawResults();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
    if (dataReady) p.redraw();
  };

  async function loadData() {
    try {
      if (typeof loadRampData !== "function") {
        errorMsg = "loadRampData() not found. Check script order.";
        p.redraw();
        return;
      }

      rows = await loadRampData();
      if (!rows || rows.length === 0) {
        errorMsg = "No rows loaded.";
        p.redraw();
        return;
      }

      ui = bindUI();
      populateDropdowns(rows, ui);

      applyFilters();
      dataReady = true;
      p.redraw();
    } catch (e) {
      console.error("[search-filter]", e);
      errorMsg = "Failed to load data.";
      p.redraw();
    }
  }

  function bindUI() {
    const conditionSel = document.getElementById("sf-condition");
    const districtSel  = document.getElementById("sf-district");
    const minYearInput = document.getElementById("sf-minyear");
    const countEl      = document.getElementById("sf-count");

    const onChange = () => {
      if (!rows.length) return;
      applyFilters();
      p.redraw();
    };

    conditionSel.addEventListener("change", onChange);
    districtSel.addEventListener("change", onChange);
    minYearInput.addEventListener("input", onChange);

    return { conditionSel, districtSel, minYearInput, countEl };
  }

  function populateDropdowns(data, ui) {
    const condSet = new Set();
    const distSet = new Set();

    for (const r of data) {
      const c = normCond(r["CONDITION"]);
      condSet.add(c);

      const d = (r["PRIMARYDISTRICTCD"] || "").toString().trim();
      if (d) distSet.add(d);
    }

    const conds = Array.from(condSet).sort((a, b) => a.localeCompare(b));
    const dists = Array.from(distSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    fillSelect(ui.conditionSel, ["All", ...conds]);
    fillSelect(ui.districtSel, ["All", ...dists]);

    if (!ui.minYearInput.value) ui.minYearInput.value = "";
  }

  function fillSelect(sel, values) {
    sel.innerHTML = "";
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
  }

  function applyFilters() {
    const cond = ui.conditionSel.value;
    const dist = ui.districtSel.value;
    const minYear = parseInt(ui.minYearInput.value, 10);

    filtered = rows.filter((r) => {
      const c = normCond(r["CONDITION"]);
      const d = (r["PRIMARYDISTRICTCD"] || "").toString().trim();
      const y = extractYear(r["INSTALL_DATE"]);

      if (cond !== "All" && c !== cond) return false;
      if (dist !== "All" && d !== dist) return false;
      if (!Number.isNaN(minYear) && minYear > 0) {
        if (!y || y < minYear) return false;
      }
      return true;
    });

    ui.countEl.textContent = `${filtered.length.toLocaleString()} ramps matched`;
  }

  function drawHeader() {}

  function drawResults() {
    const x0 = PAD.left;
    let y = 34;
    const lineH = 18;
    const maxRows = 30;

    p.noStroke();
    p.fill(30);
    p.textSize(12);

    const header = ["Condition", "District", "Install Year"];
    p.textStyle(p.BOLD);
    p.text(header[0], x0, y);
    p.text(header[1], x0 + 220, y);
    p.text(header[2], x0 + 330, y);
    p.textStyle(p.NORMAL);

    y += 16;
    p.stroke(230, 238, 250); // light blue line
    p.line(x0, y, W - PAD.right, y);
    y += 14;

    const slice = filtered.slice(0, maxRows);

    if (slice.length === 0) {
      p.noStroke();
      p.fill(120);
      p.text("No results. Try changing filters.", x0, y + 10);
      return;
    }

    for (let i = 0; i < slice.length; i++) {
      const r = slice[i];
      const c = normCond(r["CONDITION"]);
      const d = (r["PRIMARYDISTRICTCD"] || "").toString().trim() || "—";
      const y0 = extractYear(r["INSTALL_DATE"]);
      const yr = y0 ? String(y0) : "—";

      if (i % 2 === 0) {
        p.noStroke();
        p.fill(232, 241, 251); // #e8f1fb light blue zebra row
        p.rect(x0 - 6, y - 12, W - PAD.left - PAD.right + 12, lineH, 6);
      }

      p.noStroke();
      p.fill(30);
      p.text(c, x0, y);
      p.text(d, x0 + 220, y);
      p.text(yr, x0 + 330, y);

      y += lineH;
      if (y > H - PAD.bottom) break;
    }
  }

  function drawSpinner() {
    p.background(255);
    p.noFill();
    p.stroke(170);
    p.strokeWeight(1.5);
    const angle = (p.frameCount * 0.06) % p.TWO_PI;
    p.arc(W / 2, H / 2, 28, 28, angle, angle + p.PI * 1.4);

    p.noStroke();
    p.fill(150);
    p.textSize(11);
    p.textAlign(p.CENTER);
    p.text("Loading…", W / 2, H / 2 + 26);
    p.textAlign(p.LEFT);
  }

  function drawError(msg) {
    p.background(255);
    p.noStroke();
    p.fill("#ff3b30");
    p.textSize(13);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(msg, W / 2, H / 2);
    p.textAlign(p.LEFT, p.BASELINE);
  }

  function normCond(v) {
    const s = (v || "").toString().trim().toLowerCase();
    if (!s) return "Unknown";

    if (s.includes("new")) return "New Construction";
    if (s === "very poor") return "Very Poor";
    if (s === "poor") return "Poor";
    if (s === "fair") return "Fair";
    if (s === "good" || s === "excellent") return "Good";

    return "Unknown";
  }

  function extractYear(dateStr) {
    if (!dateStr) return null;
    const s = dateStr.toString();
    const m = s.match(/(19|20)\d{2}/);
    if (!m) return null;
    const y = parseInt(m[0], 10);
    return Number.isFinite(y) ? y : null;
  }
};

new p5(searchFilterSketch);

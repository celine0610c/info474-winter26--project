const pointMapSketch = (p) => {
  const PAD = 18;

  let W, H;
  let pts = [];
  let status = "Loading…";
  let dataReady = false;
  let errorMsg = null;

  let hoveredIndex = -1;

  p.setup = function () {
    W = p.min(p.windowWidth - 100, 920);
    H = 520;

    const cnv = p.createCanvas(W, H);
    cnv.parent("audrey-container");

    p.textFont('-apple-system, "Helvetica Neue", sans-serif');
    p.noLoop();

    loadData();
  };

  p.draw = function () {
    p.background(250);

    if (errorMsg) {
      drawError(errorMsg);
      return;
    }
    if (!dataReady) {
      drawSpinner();
      return;
    }

    drawHeader();
    drawPoints();
    drawHover();
  };

  p.mouseMoved = function () {
    if (!dataReady) return;
    updateHoverIndex();
    p.redraw();
  };

  p.windowResized = function () {
    W = p.min(p.windowWidth - 100, 920);
    p.resizeCanvas(W, H);
    if (dataReady) p.redraw();
  };

  async function loadData() {
    try {
      if (typeof loadRampData !== "function") {
        errorMsg = "loadRampData() not found. Check script order (p5.js → shared/dataLoader.js → point-map.js).";
        p.redraw();
        return;
      }

      const rows = await loadRampData();
      if (!rows || rows.length === 0) {
        errorMsg = "No rows loaded.";
        p.redraw();
        return;
      }

      const LAT_KEYS = ["Y", "LAT", "LATITUDE", "latitude", "y", "Y_COORD", "YCOORD"];
      const LON_KEYS = ["X", "LON", "LONGITUDE", "longitude", "x", "X_COORD", "XCOORD"];

      const latKey = LAT_KEYS.find((k) => rows[0] && rows[0][k] != null);
      const lonKey = LON_KEYS.find((k) => rows[0] && rows[0][k] != null);

      if (!latKey || !lonKey) {
        errorMsg = "Lat/Lon columns not found in CSV. Update LAT_KEYS/LON_KEYS in point-map.js.";
        p.redraw();
        return;
      }

      const N = p.min(2500, rows.length);
      const step = p.max(1, Math.floor(rows.length / N));
      const sampled = [];
      for (let i = 0; i < rows.length; i += step) sampled.push(rows[i]);

      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

      for (const r of sampled) {
        const lat = parseFloat(r[latKey]);
        const lon = parseFloat(r[lonKey]);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }

      pts = sampled
        .map((r) => {
          const lat = parseFloat(r[latKey]);
          const lon = parseFloat(r[lonKey]);
          if (!isFinite(lat) || !isFinite(lon)) return null;

          const x = mapVal(lon, minLon, maxLon, PAD, W - PAD);
          const y = mapVal(lat, maxLat, minLat, PAD + 40, H - PAD);

          return {
            x,
            y,
            condition: (r["CONDITION"] || "Unknown").toString(),
            install: (r["INSTALL_DATE"] || "").toString(),
            district: (r["PRIMARYDISTRICTCD"] || r["DISTRICT"] || "").toString(),
          };
        })
        .filter(Boolean);

      status = `Loaded ${rows.length.toLocaleString()} · showing ${pts.length.toLocaleString()} sampled points`;
      dataReady = true;
      updateHoverIndex();
      p.redraw();
    } catch (e) {
      console.error("[point-map]", e);
      errorMsg = "Failed to load data.";
      p.redraw();
    }
  }

  function drawHeader() {
    p.noStroke();
    p.fill(20);
    p.textSize(14);
    p.text("Point Map (sampled) — Seattle Curb Ramps", 12, 20);

    p.fill(120);
    p.textSize(12);
    p.text(status, 12, 38);
  }

  function drawPoints() {
    p.noStroke();
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const c = pt.condition.toLowerCase();
      let a = 120;
      if (c.includes("poor")) a = 200;
      if (c.includes("very")) a = 230;

      p.fill(60, 120, 200, a);
      p.circle(pt.x, pt.y, 4);
    }
  }

  function updateHoverIndex() {
    hoveredIndex = -1;
    if (!pts.length) return;

    let bestI = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = p.mouseX - pts[i].x;
      const dy = p.mouseY - pts[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestI = i;
      }
    }
    if (bestD2 < 64) hoveredIndex = bestI;
  }

  function drawHover() {
    if (hoveredIndex < 0) return;

    const pt = pts[hoveredIndex];

    p.stroke(20);
    p.noFill();
    p.circle(pt.x, pt.y, 10);

    const lines = [
      `Condition: ${pt.condition}`,
      pt.district ? `District: ${pt.district}` : null,
      pt.install ? `Install: ${pt.install}` : null,
    ].filter(Boolean);

    const boxW = 340;
    const boxH = 18 + lines.length * 16;

    const bx = Math.min(pt.x + 12, W - boxW - 10);
    const by = Math.max(pt.y - boxH - 10, 55);

    p.noStroke();
    p.fill(255);
    p.rect(bx, by, boxW, boxH, 8);

    p.fill(20);
    p.textSize(12);
    let ty = by + 18;
    for (const line of lines) {
      p.text(line, bx + 12, ty);
      ty += 16;
    }
  }

  function drawSpinner() {
    p.background(250);
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
    p.background(250);
    p.noStroke();
    p.fill("#ff3b30");
    p.textSize(13);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(msg, W / 2, H / 2);
    p.textAlign(p.LEFT, p.BASELINE);
  }

  function mapVal(v, a, b, c, d) {
    if (a === b) return (c + d) / 2;
    return c + ((v - a) * (d - c)) / (b - a);
  }
};

new p5(pointMapSketch);

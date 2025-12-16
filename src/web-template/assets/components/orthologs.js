// ----------------------------
// Brewer palette: Set2
// ----------------------------
const BREWER_SET2_8 = [
  "#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3",
  "#A6D854", "#FFD92F", "#E5C494", "#B3B3B3"
];

const ORTHO_CATS = [
  { key: "core_1to1",  label: "Core (1:1)",     color: BREWER_SET2_8[0] },
  { key: "core_multi", label: "Core (multi)",   color: BREWER_SET2_8[1] },
  { key: "aux",        label: "Aux",           color: BREWER_SET2_8[2] },
  { key: "unique",     label: "Unique",        color: BREWER_SET2_8[3] },
];

function ensureOrthoTooltip() {
  let tip = document.getElementById("ortho-tooltip");
  if (tip) return tip;

  tip = document.createElement("div");
  tip.id = "ortho-tooltip";
  tip.style.position = "fixed";
  tip.style.pointerEvents = "none";
  tip.style.zIndex = "9999";
  tip.style.background = "rgba(255,255,255,0.95)";
  tip.style.color = "#111";
  tip.style.border = "1px solid #ccc";
  tip.style.borderRadius = "6px";
  tip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  tip.style.padding = "6px 8px";
  tip.style.fontSize = "12px";
  tip.style.fontFamily = "sans-serif";
  tip.style.display = "none";
  document.body.appendChild(tip);
  return tip;
}

function showOrthoTip(evt, html) {
  const tip = ensureOrthoTooltip();
  tip.innerHTML = html;
  tip.style.left = `${evt.clientX + 12}px`;
  tip.style.top = `${evt.clientY + 12}px`;
  tip.style.display = "block";
}

function hideOrthoTip() {
  const tip = document.getElementById("ortho-tooltip");
  if (tip) tip.style.display = "none";
}

function wireDropdown(btnId, ddId) {
  const btn = document.getElementById(btnId);
  const dd = document.getElementById(ddId);
  if (!btn || !dd) return;

  const close = () => dd.classList.add("hidden");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dd.classList.toggle("hidden");
  });

  document.addEventListener("click", close);
}

function svgViewBoxWH(svgEl) {
  const vb = (svgEl.getAttribute("viewBox") || "").trim();
  if (!vb) return { w: 1200, h: 600 };
  const parts = vb.split(/\s+/).map(Number);
  return { w: parts[2] || 1200, h: parts[3] || 600 };
}

function inlineSvgComputedStyles(svgEl) {
  const nodes = svgEl.querySelectorAll("*");
  nodes.forEach(n => {
    const cs = window.getComputedStyle(n);
    if (cs.fill) n.setAttribute("fill", cs.fill);
    if (cs.stroke) n.setAttribute("stroke", cs.stroke);
    if (cs.strokeWidth) n.setAttribute("stroke-width", cs.strokeWidth);
    if (n.tagName.toLowerCase() === "text") {
      if (cs.fontSize) n.setAttribute("font-size", cs.fontSize);
      if (cs.fontFamily) n.setAttribute("font-family", cs.fontFamily);
    }
  });
}

function niceStep(raw) {
  if (!isFinite(raw) || raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const x = raw / pow;
  let n = 1;
  if (x >= 5) n = 5;
  else if (x >= 2) n = 2;
  return n * pow;
}

function renderOrthologStackedChart(summary, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const rows = Array.isArray(summary.table) ? summary.table : [];
  if (!rows.length) {
    container.innerHTML = "<p>No plot data available.</p>";
    return;
  }

  // ----------------------------
  // Sizing (increase these)
  // ----------------------------
  const FONT = Math.round(12 * 2.5);     // label + legend font
  const TICK_FONT = Math.round(FONT * 0.9);
  const AXIS_TITLE_FONT = FONT;

  const barH = 36;    // bigger bars
  const gap  = 16;    // bigger spacing

  // Margins must grow with font size
  const margin = { top: 18, right: 340, bottom: 110, left: 460 };
  const innerW = 900;
  const innerH = rows.length * (barH + gap);

  const width  = margin.left + innerW + margin.right;
  //const height = margin.top + innerH + margin.bottom;
  const axisY = margin.top + innerH + 30;
  const heightNeeded = (axisY + 10 + TICK_FONT + 6 + AXIS_TITLE_FONT + 18) + Math.round(FONT * 1.2);

  // Find max total for scaling
  const totals = rows.map(r => ORTHO_CATS.reduce((s, c) => s + (Number(r[c.key]) || 0), 0));
  const maxTotal = Math.max(...totals, 1);

  // Axis unit choice: hundreds or thousands
  const unit = (maxTotal >= 1000) ? 1000 : 100;
  const unitLabel = (unit === 1000) ? "Number of genes (thousands)" : "Number of genes (hundreds)";

  // Ticks in units
  const maxUnits = maxTotal / unit;
  const step = niceStep(maxUnits / 5);
  const axisMaxUnits = Math.ceil(maxUnits / step) * step;
  const axisMaxGenes = axisMaxUnits * unit;

  const ticks = [];
  for (let v = 0; v <= axisMaxUnits + 1e-9; v += step) ticks.push(v);


  //const maxTickUnits = Math.ceil(maxUnits / step) * step;
  //const ticks = [];
  //for (let v = 0; v <= maxTickUnits + 1e-9; v += step) ticks.push(v);

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${heightNeeded}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(heightNeeded));  // important: real height, not "auto"
  svg.style.display = "block";
  svg.style.verticalAlign = "top";

  // ----------------------------
  // Bars + genome labels
  // ----------------------------
  rows.forEach((r, i) => {
    const y = margin.top + i * (barH + gap);
    const genome = String(r.genome ?? "");

    // genome label
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(margin.left - 12));
    t.setAttribute("y", String(y + barH * 0.78));
    t.setAttribute("text-anchor", "end");
    t.setAttribute("font-family", "sans-serif");
    t.setAttribute("font-size", String(FONT));
    t.setAttribute("fill", "#111");
    t.textContent = genome;
    svg.appendChild(t);

    let x0 = 0;
    ORTHO_CATS.forEach(cat => {
      const v = Number(r[cat.key]) || 0;
      const w = (v / axisMaxGenes) * innerW;

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(margin.left + x0));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(barH));
      rect.setAttribute("fill", cat.color);
      rect.setAttribute("stroke", "#ffffff");
      rect.setAttribute("stroke-width", "1");

      rect.addEventListener("mousemove", (evt) => {
        showOrthoTip(
          evt,
          `<div style="font-weight:600; margin-bottom:2px;">${cat.label}</div>
           <div>${genome}: <span style="font-weight:600;">${v}</span></div>`
        );
      });
      rect.addEventListener("mouseleave", hideOrthoTip);

      svg.appendChild(rect);
      x0 += w;
    });
  });

  // ----------------------------
  // X axis (bottom)
  // ----------------------------

  // baseline
  const axisLine = document.createElementNS(ns, "line");
  axisLine.setAttribute("x1", String(margin.left));
  axisLine.setAttribute("x2", String(margin.left + innerW));
  axisLine.setAttribute("y1", String(axisY));
  axisLine.setAttribute("y2", String(axisY));
  axisLine.setAttribute("stroke", "#111");
  axisLine.setAttribute("stroke-width", "2");
  svg.appendChild(axisLine);

  // ticks + labels
  ticks.forEach(vUnits => {
    const vGenes = vUnits * unit;
    const x = margin.left + (vGenes / axisMaxGenes) * innerW;

    const tick = document.createElementNS(ns, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", String(axisY));
    tick.setAttribute("y2", String(axisY + 10));
    tick.setAttribute("stroke", "#111");
    tick.setAttribute("stroke-width", "2");
    svg.appendChild(tick);

    const lab = document.createElementNS(ns, "text");
    lab.setAttribute("x", String(x));
    lab.setAttribute("y", String(axisY + 10 + TICK_FONT + 6));
    lab.setAttribute("text-anchor", "middle");
    lab.setAttribute("font-family", "sans-serif");
    lab.setAttribute("font-size", String(TICK_FONT));
    lab.setAttribute("fill", "#111");
    lab.textContent = Number.isInteger(vUnits) ? String(vUnits) : vUnits.toFixed(1);
    svg.appendChild(lab);
  });

  // axis title
  const axisTitle = document.createElementNS(ns, "text");
  axisTitle.setAttribute("x", String(margin.left + innerW / 2));
  axisTitle.setAttribute("y", String(axisY + 10 + TICK_FONT + 6 + AXIS_TITLE_FONT + 18));
  axisTitle.setAttribute("text-anchor", "middle");
  axisTitle.setAttribute("font-family", "sans-serif");
  axisTitle.setAttribute("font-size", String(AXIS_TITLE_FONT));
  axisTitle.setAttribute("fill", "#111");
  axisTitle.textContent = unitLabel;
  svg.appendChild(axisTitle);

  // ----------------------------
  // Legend (reverse order)
  // ----------------------------
  const legend = document.createElementNS(ns, "g");
  const legendX = margin.left + innerW + 24;
  const legendY = margin.top;
  const legendItems = [...ORTHO_CATS].reverse();

  const swatch = Math.round(FONT * 0.9);
  const legendGap = Math.round(FONT * 1.15);

  legendItems.forEach((cat, i) => {
    const yy = legendY + i * legendGap;

    const sw = document.createElementNS(ns, "rect");
    sw.setAttribute("x", String(legendX));
    sw.setAttribute("y", String(yy));
    sw.setAttribute("width", String(swatch));
    sw.setAttribute("height", String(swatch));
    sw.setAttribute("fill", cat.color);
    sw.setAttribute("stroke", "#999");
    sw.setAttribute("stroke-width", "1");
    legend.appendChild(sw);

    const lt = document.createElementNS(ns, "text");
    lt.setAttribute("x", String(legendX + swatch + 14));
    lt.setAttribute("y", String(yy + swatch * 0.82));
    lt.setAttribute("font-family", "sans-serif");
    lt.setAttribute("font-size", String(FONT));
    lt.setAttribute("fill", "#111");
    lt.textContent = cat.label;
    legend.appendChild(lt);
  });

  svg.appendChild(legend);

  container.innerHTML = "";
  container.appendChild(svg);
}

function exportSvgElement(svgEl, filename) {
  const clone = svgEl.cloneNode(true);
  inlineSvgComputedStyles(clone);

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function exportPngFromSvgElement(svgEl, filename) {
  const clone = svgEl.cloneNode(true);
  inlineSvgComputedStyles(clone);

  const { w, h } = svgViewBoxWH(clone);
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function () {
    const SCALE = 3;
    const canvas = document.createElement("canvas");
    canvas.width = img.width * SCALE;
    canvas.height = img.height * SCALE;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(img, 0, 0);

    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  };

  img.src = url;
}

SYNIMA.exportOrthologChartSvg = function (containerId, filename) {
  const svgEl = document.querySelector(`#${containerId} svg`);
  if (!svgEl) return;
  exportSvgElement(svgEl, filename);
};

SYNIMA.exportOrthologChartPng = function (containerId, filename) {
  const svgEl = document.querySelector(`#${containerId} svg`);
  if (!svgEl) return;
  exportPngFromSvgElement(svgEl, filename);
};

function formatSequenceType(code) {
    if (code === "cds") return "Coding sequences (CDS)";
    if (code === "pep") return "Peptide sequences (PEP)";
    return code;
}

function formatOrthoTool(method) {
    if (method === "orthomcl") return "OrthoMCL";
    if (method === "rbh") return "Reciprocal Best Hits (RBH)";
    if (method === "orthofinder") return "OrthoFinder";
    return method;
}

SYNIMA.showOrthologs = function () {
  const app = document.getElementById("app");
  const data = JSON.parse(document.getElementById("data-orthologs").textContent);

  const main = document.getElementById("app");
  if (main) {
      main.classList.add("max-w-6xl", "mx-auto");
      main.style.maxWidth = "";
      main.style.margin = "";
  }

  const params = data.params || null;

  if (!data.summaries || data.summaries.length === 0) {
    app.innerHTML = `<h1>Ortholog Summary</h1><p>No summary files found.</p>`;
    return;
  }

  // Determine sequence type + orthology tool run
  let seqType = "Unknown";
  let orthoTool = "Unknown";

  if (data.summaries && data.summaries.length > 0) {
    seqType = formatSequenceType(data.summaries[0].alignment);
    orthoTool = formatOrthoTool(data.summaries[0].method);
  }

  // ----------------------------
  // Header 
  // ----------------------------
  let html = `<h1>Ortholog Summaries</h1>`;

  // Determine which parameters should be shown
  let paramRows = `
    <tr><th>Sequence type</th><td>${seqType}</td></tr>
    <tr><th>Aligner</th><td>${params.aligner}</td></tr>
    <tr><th>Orthology tool</th><td>${orthoTool}</td></tr>
  `;

  // Shared parameters (apply to BLAST and DIAMOND)
  if (params.max_target_seqs !== undefined) {
    paramRows += `<tr><th>Max target seqs</th><td>${params.max_target_seqs}</td></tr>`;
  }

  if (params.evalue !== undefined) {
    paramRows += `<tr><th>E-value</th><td>${params.evalue}</td></tr>`;
  }

  // DIAMOND-specific settings
  if (params.aligner === "diamond" || (params.aligner === "auto" && params.diamond_sensitivity)) {
    paramRows += `<tr><th>Diamond sensitivity</th><td>${params.diamond_sensitivity}</td></tr>`;
  }

  // BLAST-specific things (none yet, but easily added later)

  // Always relevant for translation of coding sequences
  paramRows += `<tr><th>Genetic code</th><td>${params.genetic_code}</td></tr>`;

  // Show global single-copy orthologs at the top (only once)
  html += `
    <div class="section">
      <h2>Single Copy Orthologs</h2>
      <p>Total 1:1 ortholog groups: <strong>${data.single_copy_orthologs}</strong></p>
    </div>
  `;

  const chartJobs = [];
  data.summaries.forEach((summary, i) => {
  //data.summaries.forEach(summary => {


    html += `
    <div class="section">
      <h2>Ortholog Inference Parameters</h2>
      <table class="param-table">
        ${paramRows}
      </table>
    </div>


    <div class="section">
      <h2>Orthologs</h2>
      <table class="ortho-table">
      <thead>
      <tr>
        <th>Genome</th>
        <th>Core (1:1)</th>
        <th>Core (multi)</th>
        <th>Aux</th>
        <th>Unique</th>
      </tr>
      </thead>
      <tbody>
    `;

    summary.table.forEach(row => {
          html += `
            <tr>
              <td>${row.genome}</td>
              <td>${row.core_1to1}</td>
              <td>${row.core_multi}</td>
              <td>${row.aux}</td>
              <td>${row.unique}</td>
            </tr>
          `;
    });
    html += `</tbody></table>`;

    // ----------------------------
    // Ortholog stacked barchart & Download buttons
    // ----------------------------
    const chartId = `ortho-chart-${i}`;
    const menuId = `ortho-dl-${i}`;

    html += `
      <div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:6px;">
        <h2 style="margin:0;">Plot</h2>

        <div style="position:relative; display:inline-block;">
          <button id="${menuId}-btn" style="padding:2px 6px; margin:0;">Download ▾</button>

          <div id="${menuId}-dd" class="hidden"
            style="position:absolute; right:0; top:100%; margin-top:2px; background:white; color:black;
                   border:1px solid #ccc; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);
                   z-index:1000; width:120px;">
            <button id="${menuId}-svg"
              style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
              onmouseover="this.style.background='#e5e5e5'" onmouseout="this.style.background='none'">
              SVG
            </button>
            <button id="${menuId}-png"
              style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
              onmouseover="this.style.background='#e5e5e5'" onmouseout="this.style.background='none'">
              PNG
            </button>
          </div>
        </div>
      </div>

      <div class="tree-view" style="--synima-tree-bg:#ffffff;">
        <div id="${chartId}" style="width:100%; overflow-x:auto;"></div>
      </div>
    `;

    chartJobs.push({ summary, chartId, menuId, i });

      //  <h2>Plot</h2>


    // ----------------------------
    // Rscript 
    // ----------------------------
      html += `
        <h2>R code</h2>
        <pre>${summary.rscript}</pre>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${summary.rscript}\`)">
          Copy R Script
        </button>
      </div>
    `;
  });


  app.innerHTML = html;

  chartJobs.forEach(job => {
  renderOrthologStackedChart(job.summary, job.chartId);

  wireDropdown(`${job.menuId}-btn`, `${job.menuId}-dd`);

  const svgBtn = document.getElementById(`${job.menuId}-svg`);
  const pngBtn = document.getElementById(`${job.menuId}-png`);

  if (svgBtn) {
    svgBtn.addEventListener("click", () => {
      SYNIMA.exportOrthologChartSvg(job.chartId, `synima_orthologs_${job.i}.svg`);
    });
  }

  if (pngBtn) {
    pngBtn.addEventListener("click", () => {
      SYNIMA.exportOrthologChartPng(job.chartId, `synima_orthologs_${job.i}.png`);
    });
  }
});



};
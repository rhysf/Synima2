window.SYNIMA = window.SYNIMA || {};

SYNIMA.showSynteny = function () {

    const app = document.getElementById("app");
    const raw = document.getElementById("data-synteny");

    if (!raw) {
        app.innerHTML = "<p>No synteny data found.</p>";
        return;
    }

    // Expand layout for synteny view
    //const main = document.getElementById("app");
    //if (main) {
    if (app) {
        app.classList.remove("max-w-6xl", "mx-auto");
        app.style.maxWidth = "none";
        app.style.margin = "20px auto";  // 20px top/bottom, auto center
        app.style.padding = "20px";      // inner padding
        app.style.maxWidth = "100%";     // full width but with margins
    }

    const data = JSON.parse(raw.textContent);
    const config = data.synteny_config;
    const aligncoords = data.aligncoords || "";
    const spansText = data.aligncoords_spans || "";


    // Genome order should follow the current TREE PAGE settings
    let genomeOrder = [];
    if (window.SYNIMA && SYNIMA.getCurrentTipOrder) {
        genomeOrder = SYNIMA.getCurrentTipOrder();
    }

    // Fallback to rust-provided order only if tree order unavailable
    if (!genomeOrder || genomeOrder.length === 0) {
        genomeOrder = config.genome_order || [];
    }

    // ----------------------------
    // Debug section
    // ----------------------------
    let html = "<h1>Synteny Viewer</h1>";
    //html += `<p>Num genomes: ${config.num_genomes}</p>`;
    //html += `<p>Max genome length: ${config.max_length}</p>`;
    //html += `<p>Halfway index: ${config.halfway}</p>`;
    //html += `<p>Genome order from tree: `;
    //if (genomeOrder.length === 0) {
    //    html += `<em>No genome order extracted (tree not found or mismatch)</em></p>`;
    //} else {
    //    html += `${genomeOrder.join(" → ")}</p>`;
    //}
    // Print all genome metadata
    //config.genomes.forEach(g => {
    //    html += `<h3>${g.name}</h3>`;
    //    html += `<p>Total length: ${g.total_length}</p>`;
    //    html += `<p>Contig order (inferred): ${g.inferred_order.join(", ")}</p>`;
    //    html += `<p>Contig order (fasta): ${g.fasta_order.join(", ")}</p>`;
    //    html += `<p>Contig lengths:</p>`;
    //    html += `<ul>`;
    //    g.contigs.forEach(c => {
    //        html += `<li>${c.contig}: ${c.length}</li>`;
    //    });
    //    html += `</ul>`;
    //});

    // ----------------------------
    // Viewer controls + plot container
    // ----------------------------
    //<h2>Synteny viewer</h2>
    html += `
    <div class="section">

        <div style="display:flex; gap:20px;">

        <!-- MINI TREE COLUMN -->
        <!-- min-width:260px;  -->
        <div style="flex:0 0 20%; min-height:400px; padding-right:0px; padding-bottom:20px; overflow-y:auto; ">
          <!--<h2>Tree</h2>-->
            <div id="synteny-tree-mini" 
                class="panel-view" 
                style="width:100%; overflow-x:auto; overflow-y:auto; padding-bottom:30px; box-sizing:border-box;">
            </div>
        </div>

        <!-- SYNTENY MAIN COLUMN -->
        <!-- min-height:auto; min-width:400px; overflow-x:auto;  -->
        <div style="flex:1 1 auto; min-height:400px; padding-left:0px; overflow-x:auto; overflow-y:hidden;">
            <!-- min-height:auto; -->

            <div id="synteny-plot" 
                class="panel-view overflow-x-auto">
            </div>

        </div>

      </div>



      <details class="mt-4">
        <div id="synteny-stats" class="text-sm"></div>

        <summary>Parsed block preview (first 15)</summary>
        <pre id="synteny-preview" class="text-xs"></pre>
      </details>
    </div>

    <div class="choice-group text-white">
        <label>
          <input type="radio" name="synteny-mode" value="spans" checked>
          Chromosome synteny (aligncoords.spans)
        </label>

        <label>
          <input type="radio" name="synteny-mode" value="aligncoords">
          Gene synteny (aligncoords) (next)
        </label>
    </div>

    <div class="section">
      <h2>Raw aligncoords</h2>
      <pre>${escapeHtml(aligncoords.substring(0, 2000))}...</pre>

      <h2>Raw aligncoords.spans</h2>
      <pre>${escapeHtml(spansText.substring(0, 2000))}...</pre>
    </div>
  `;

  app.innerHTML = html;

  // ----------------------------
  // Render logic
  // ----------------------------

  // Now the container exists, so render the mini tree
    if (window.SYNIMA_TREES && SYNIMA_TREES.current) {
      renderTreeSvg(SYNIMA_TREES.current, "synteny-tree-mini", { mini: true });
    } else {
      console.warn("synteny: SYNIMA_TREES.current missing, cannot render mini tree");
    }

    const statsEl = document.getElementById("synteny-stats");
    const previewEl = document.getElementById("synteny-preview");
    const plotEl = document.getElementById("synteny-plot");

    const maps = buildGenomeMaps(config);

    document.querySelectorAll('input[name="synteny-mode"]').forEach(el => {
        el.addEventListener("change", rerender);
    });


    function rerender() {
        const mode = document.querySelector('input[name="synteny-mode"]:checked')?.value || "spans";

        let blocks = [];
        if (mode === "spans") {
          blocks = parseAligncoordsSpansText(spansText);
        } else {
          // Stub for now, so the toggle works.
          blocks = [];
        }

        //const prepared = prepareBlocksForPlot(blocks, config, maps);
        const layout = buildSyntenyLayout(config);
        const prepared = prepareBlocksForPlot(blocks, config, maps, layout);

        statsEl.textContent =
          `Mode: ${mode}. Parsed blocks: ${blocks.length}. Adjacent blocks: ${prepared.blocks.length}. ` +
          `Skipped (non-adjacent): ${prepared.skippedNonAdjacent}. ` +
          `Skipped (unknown genome): ${prepared.skippedUnknownGenome}. ` +
          `Skipped (unknown contig): ${prepared.skippedUnknownContig}.`;

        previewEl.textContent = prepared.blocks
          .slice(0, 15)
          .map(b => {
            return [
              `${b.topGenome}:${b.topContig} ${b.topAbsStart}-${b.topAbsEnd}`,
              `${b.botGenome}:${b.botContig} ${b.botAbsStart}-${b.botAbsEnd}`,
              `strand=${b.strand}`,
              `x1=[${b.x1lo.toFixed(1)},${b.x1hi.toFixed(1)}]`,
              `x2=[${b.x2lo.toFixed(1)},${b.x2hi.toFixed(1)}]`
            ].join(" | ");
          })
          .join("\n");

        //plotEl.innerHTML = renderSyntenySvg(prepared.blocks, config);
        plotEl.innerHTML = renderSyntenySvg(prepared.blocks, config, maps, layout);
    }

    rerender();
    SYNIMA._syntenyRerender = rerender;


    // Add hover tooltip
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
        position:absolute; background:#333; color:white;
        padding:5px 8px; border-radius:4px; font-size:12px;
        pointer-events:none; display:none; z-index:99999;
        `;
    document.body.appendChild(tooltip);

    plotEl.addEventListener("mousemove", e => {
        const ctg = e.target.closest(".synteny-ctg");
        if (!ctg) {
            tooltip.style.display = "none";
            return;
        }

        const g = ctg.dataset.genome;
        const c = ctg.dataset.contig;
        const o = ctg.dataset.orientation;

        tooltip.innerHTML = `
            <b>${g}</b><br>
            Contig: ${c}<br>
            Orientation: ${o}
        `;

        tooltip.style.left = (e.pageX + 12) + "px";
        tooltip.style.top = (e.pageY + 12) + "px";
        tooltip.style.display = "block";
    });

    // Ensure tooltip disappears if the mouse leaves the synteny area entirely
    plotEl.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
    });

}

// ----------------------------
// Helpers
// ----------------------------


// Safe HTML for <pre>
function escapeHtml(str) {
  return (str || "").replace(/[&<>]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  }[ch] || ch));
}

function splitGenomeContig(s) {
  const parts = (s || "").split(";");
  if (parts.length < 2) return [null, null];
  return [parts[0], parts[1]];
}

function parseStartStop(ss) {
  const parts = (ss || "").split("-");
  if (parts.length < 2) return [null, null];
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return [null, null];
  return [a, b];
}

let _measureCtx = null;

function getMeasureCtx(fontPx) {
  if (!_measureCtx) {
    const c = document.createElement("canvas");
    _measureCtx = c.getContext("2d");
  }
  _measureCtx.font = `${fontPx}px sans-serif`;
  return _measureCtx;
}

function trimLabelToWidth(text, maxW, fontPx) {
  const ctx = getMeasureCtx(fontPx);
  if (ctx.measureText(text).width <= maxW) return text;

  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(trimmed + "…").width > maxW) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length ? (trimmed + "…") : "";
}

function getGenomeOrderForAdjacency(config) {
  // Prefer the currently-rendered tree order (most important)
  if (window.SYNIMA && typeof SYNIMA.getCurrentTipOrder === "function") {
    const live = SYNIMA.getCurrentTipOrder();
    if (Array.isArray(live) && live.length > 0) {
      return live.map(s => String(s).trim());
    }
  }

  // Fallback to rust-provided order
  if (Array.isArray(config.genome_order) && config.genome_order.length > 0) {
    return config.genome_order.slice();
  }

  // Fallback to config.genomes order
  return config.genomes.map(g => g.name);
}

function buildAdjacencySet(order) {
  const adj = new Set();
  for (let i = 0; i < order.length - 1; i++) {
    adj.add(order[i] + "|" + order[i + 1]);
    adj.add(order[i + 1] + "|" + order[i]);
  }
  return adj;
}

// Build genomeIndex + contigLen + contigOffset using inferred_order
function buildGenomeMaps(config) {
  const genomeIndex = {};
  const contigLen = {};
  const contigOffset = {};
  const contigOrder = {};

  config.genomes.forEach((g, i) => {
    genomeIndex[g.name] = i;

    const lenMap = {};
    (g.contigs || []).forEach(c => { lenMap[c.contig] = c.length; });
    contigLen[g.name] = lenMap;

    const order = (g.inferred_order && g.inferred_order.length)
      ? g.inferred_order
      : (g.fasta_order || []);
    contigOrder[g.name] = order;

    const offMap = {};
    let cum = 0;
    order.forEach(ctg => {
      offMap[ctg] = cum;
      const L = lenMap[ctg];
      if (typeof L === "number") {
        cum += L;
      }
    });
    contigOffset[g.name] = offMap;
  });

  return { genomeIndex, contigLen, contigOffset, contigOrder };
}

// Parse aligncoords.spans text
function parseAligncoordsSpansText(text) {
  const blocks = [];
  const lines = (text || "").split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const cols = t.split("\t");
    if (cols.length < 6) continue;

    const [g1c1, ss1, len1s, g2c2, ss2, len2s] = cols;
    const strand = (cols[6] || "+").trim(); // cols[6] exists in your sample
    const [g1, c1] = splitGenomeContig(g1c1);
    const [g2, c2] = splitGenomeContig(g2c2);
    const [s1, e1] = parseStartStop(ss1);
    const [s2, e2] = parseStartStop(ss2);

    if (!g1 || !c1 || !g2 || !c2) continue;
    if (s1 == null || e1 == null || s2 == null || e2 == null) continue;

    blocks.push({
      g1, c1, s1, e1,
      g2, c2, s2, e2,
      len1: parseInt(len1s, 10) || 0,
      len2: parseInt(len2s, 10) || 0,
      strand
    });
  }

  return blocks;
}

// Convert spans blocks into absolute coords + scaled x coords
function prepareBlocksForPlot(blocks, config, maps, layout) {

    const order = getGenomeOrderForAdjacency(config);
    const adjacent = buildAdjacencySet(order);

    // optional, but useful for debugging / index lookups:
    const genomeIndex = Object.create(null);
    order.forEach((name, i) => { genomeIndex[name] = i; });

    const idx = maps.genomeIndex;
    const offset = maps.contigOffset;

    const scale = layout.scaleX;
    const x0 = layout.xStart;

  let skippedUnknownGenome = 0;
  let skippedUnknownContig = 0;
  let skippedNonAdjacent = 0;

  const out = [];

  for (const b of blocks) {

    // adjacency should be based on the tree order (order[]), not config.genomes
    if (genomeIndex[b.g1] === undefined || genomeIndex[b.g2] === undefined) {
      skippedUnknownGenome++;
      continue;
    }
    if (!adjacent.has(`${b.g1}|${b.g2}`)) {
      skippedNonAdjacent++;
      continue;
    }

    const i1 = genomeIndex[b.g1];
    const i2 = genomeIndex[b.g2];
    // (we already checked undefined above, but keeping safe is fine)
    if (i1 === undefined || i2 === undefined) {
      skippedUnknownGenome++;
      continue;
    }

    // Make "top" always the smaller index so y layout is stable
    let top, bot;
    if (i1 <= i2) {
      top = { genome: b.g1, contig: b.c1, s: b.s1, e: b.e1 };
      bot = { genome: b.g2, contig: b.c2, s: b.s2, e: b.e2 };
    } else {
      top = { genome: b.g2, contig: b.c2, s: b.s2, e: b.e2 };
      bot = { genome: b.g1, contig: b.c1, s: b.s1, e: b.e1 };
    }

    const topOff = offset[top.genome]?.[top.contig];
    const botOff = offset[bot.genome]?.[bot.contig];
    if (topOff == null || botOff == null) {
      skippedUnknownContig++;
      continue;
    }

    const topAbsStart = topOff + Math.min(top.s, top.e);
    const topAbsEnd   = topOff + Math.max(top.s, top.e);
    const botAbsStart = botOff + Math.min(bot.s, bot.e);
    const botAbsEnd   = botOff + Math.max(bot.s, bot.e);

    const x1lo = x0 + topAbsStart * scale;
    const x1hi = x0 + topAbsEnd   * scale;
    const x2lo = x0 + botAbsStart * scale;
    const x2hi = x0 + botAbsEnd   * scale;

    out.push({
      topGenome: top.genome,
      topContig: top.contig,
      botGenome: bot.genome,
      botContig: bot.contig,

      topAbsStart, topAbsEnd,
      botAbsStart, botAbsEnd,

      x1lo, x1hi, x2lo, x2hi,

      strand: b.strand
    });
  }

  return { blocks: out, skippedUnknownGenome, skippedUnknownContig, skippedNonAdjacent };
}

// Render a simple SVG: genome tracks + polygons
function renderSyntenySvg(blocks, config, maps, layout) {
  const svgW = layout.plotWidthPx;
  const svgH = Math.max(layout.treeHeightPx, 200);

  const trackHeight = layout.trackHeight;

  // fallback if tip positions not available
  const topPad = 20;
  const rowSpacing = 30;
  const yFallback = (gName) => {
    const idx = config.genomes.findIndex(g => g.name === gName);
    return topPad + idx * rowSpacing;
  };
  const yFor = (gName) => (layout.yByGenome && layout.yByGenome[gName] !== undefined) ? layout.yByGenome[gName] : yFallback(gName);


    // Polygons first, then tracks and labels on top
    let polys = "";
    for (const b of blocks) {

        const yTop = yFor(b.topGenome);
        const yBot = yFor(b.botGenome);
        if (yTop == null || yBot == null) continue;

        const yTopEdge = yTop + trackHeight / 2;  // bottom of top rectangle
        const yBotEdge = yBot - trackHeight / 2;  // top of bottom rectangle

        // For now: ignore strand twisting, just draw the ribbon.
        const points = [
          `${b.x1lo},${yTopEdge}`,
          `${b.x1hi},${yTopEdge}`,
          `${b.x2hi},${yBotEdge}`,
          `${b.x2lo},${yBotEdge}`
        ].join(" ");

        polys += `
          <polygon
            points="${points}"
            fill="#ffffff"
            fill-opacity="0.5"
            stroke="#ffffff"
            stroke-opacity="0.25"
            stroke-width="0.5">
            <title>${escapeHtml(b.topGenome)}:${escapeHtml(b.topContig)} ${b.topAbsStart}-${b.topAbsEnd}
    ↔ ${escapeHtml(b.botGenome)}:${escapeHtml(b.botContig)} ${b.botAbsStart}-${b.botAbsEnd}
    strand=${escapeHtml(b.strand)}</title>
          </polygon>
        `;
    }

    let tracks = "";
    for (const g of config.genomes) {
      const y = yFor(g.name);
      const yRect = y - trackHeight / 2;

      const order = maps.contigOrder[g.name] || [];
      const lenMap = maps.contigLen[g.name] || {};

      let x = layout.xStart;
      for (const contig of order) {
        const bpLen = lenMap[contig] || 0;
        const w = bpLen * layout.scaleX;
        if (w <= 0) continue;

        const fontSize = Math.max(10, Math.min(18, trackHeight * 0.45));
        const label = trimLabelToWidth(contig, w - 6, fontSize);

        // Center text in the rectangle
        const textX = x + w / 2;
        const textY = yRect + trackHeight * 0.70;

        // <rect x="${x}" y="${rectY}" width="${w}" height="${rectH}" fill="#6699cc" stroke="white" stroke-width="1"></rect>
        //             fill-opacity="0.10"
        //             stroke-opacity="0.35"
        tracks += `
            <g class="synteny-ctg"
                     data-genome="${g.name}"
                     data-contig="${contig}"
                     data-orientation="+">
          <rect
            x="${x}"
            y="${yRect}"
            width="${w}"
            height="${trackHeight}"
            fill="#6699cc"
            stroke="#ffffff"
            stroke-width="1">
            <title>${escapeHtml(g.name)}:${escapeHtml(contig)} (${bpLen} bp)</title>
          </rect>
            ${
            (label && w >= 25)
              ? `<text x="${textX}" y="${textY}"
                       fill="#ffffff"
                       font-size="${fontSize}"
                       text-anchor="middle"
                       style="pointer-events:none; user-select:none;">
                   ${escapeHtml(label)}
                 </text>`
              : ""
          }
              </g>
        `;
        x += w;
      }
    }

  return `
    <svg width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block;">
        ${polys}
        ${tracks}
    </svg>
    `;
}

function buildSyntenyLayout(config) {
  const plotEl = document.getElementById("synteny-plot");
  const treeSvg = document.querySelector("#synteny-tree-mini svg");

  const plotWidthPx = plotEl ? plotEl.getBoundingClientRect().width : 800;
  const treeHeightPx = treeSvg ? treeSvg.getBoundingClientRect().height : 300;

  // left padding is not needed because the tree already shows labels
  const xStart = 10;
  const xPadRight = 10;
  const usablePlotWidth = Math.max(100, plotWidthPx - xStart - xPadRight);

  const scaleX = config.max_length > 0 ? (usablePlotWidth / config.max_length) : 1;

  const tipY = (window.SYNIMA && SYNIMA.tipYPositions) ? SYNIMA.tipYPositions : null;
  const originalH =
    (window.SYNIMA && SYNIMA.originalMiniTreeHeight) ? SYNIMA.originalMiniTreeHeight :
    (treeSvg && treeSvg.viewBox && treeSvg.viewBox.baseVal) ? treeSvg.viewBox.baseVal.height :
    null;

  const vScale = (tipY && originalH && originalH > 0) ? (treeHeightPx / originalH) : 1;

  const yByGenome = {};
  if (tipY) {
    for (const g of config.genomes) {
      if (tipY[g.name] !== undefined) {
        yByGenome[g.name] = tipY[g.name] * vScale;
      }
    }
  }

  // Derive row spacing from rendered tree tips, then choose a track height
  let trackHeight = 22; // fallback

  if (yByGenome && Object.keys(yByGenome).length >= 2) {
    const ys = Object.values(yByGenome).slice().sort((a, b) => a - b);

    // nearest-neighbour diffs
    const diffs = [];
    for (let i = 1; i < ys.length; i++) diffs.push(ys[i] - ys[i - 1]);

    // median diff is robust
    diffs.sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)] || 30;

    // track height as a fraction of row spacing
    trackHeight = Math.max(10, Math.min(20, med * 0.325));

    //console.log("Median tree row spacing:", med, "→ trackHeight:", trackHeight);
  }

  return {
    plotWidthPx,
    treeHeightPx,
    xStart,
    usablePlotWidth,
    scaleX,
    yByGenome,
    trackHeight
  };
}


// The old stuff:
/*
    

    // Render the Synteny browser
    // Phase 1: Basic synteny contig rectangles
    function renderSynteny() {

        const container = document.getElementById("synteny-main");
        if (!container) return;

        const genomes = config.genomes;

        // Map genome names to genome objects for quick lookup
        const genomeMap = {};
        genomes.forEach(g => genomeMap[g.name] = g);

        // Take the ordered list from the tree
        const orderedGenomes = genomeOrder
            .map(name => genomeMap[name])
            .filter(x => x);   // drop missing names

        // Determine the actual width available for synteny
        const mainDiv = document.getElementById("synteny-main");
        //const availableWidth = mainDiv ? mainDiv.clientWidth : 800;
        const usable = mainDiv.getBoundingClientRect().width;

        // Give synteny the max width available
        const plotWidthPx = Math.max(400, usable);

        // Find max genome length for scaling
        const maxLen = config.max_length;
        const scale = plotWidthPx / maxLen;

        // Helper: trim label to fit inside rectangle
        function trimLabelToWidth(ctx, text, maxW) {
            if (ctx.measureText(text).width <= maxW) return text;
            let trimmed = text;
            while (trimmed.length > 0 && ctx.measureText(trimmed + "…").width > maxW) {
                trimmed = trimmed.slice(0, -1);
            }
            return trimmed.length === 0 ? "" : trimmed + "…";
        }

        // Pre-create canvas to measure text width
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = "14px sans-serif";

        // Must have mini-tree Y positions
        const tipY = SYNIMA.tipYPositions || {};

        if (!Object.keys(tipY).length) {
            console.warn("Mini-tree tip positions missing: synteny rows cannot align.");
        }

        //const maxSVGHeight = Math.max(...Object.values(tipY)) + 60;

        const renderedTreeHeight = SYNIMA.renderedTreeHeight || 300; // fallback
        const maxSVGHeight = renderedTreeHeight;

        let html = `
          <svg width="100%"
               viewBox="0 0 ${plotWidthPx} ${maxSVGHeight}"
               preserveAspectRatio="xMinYMin meet"
               style="background:#222; border:1px solid #444;">
        `;

        orderedGenomes.forEach(g => {

            const original = SYNIMA.originalMiniTreeHeight || 300;
            const rendered = SYNIMA.renderedTreeHeight || 300;

            // vertical scale factor
            let vScale = rendered / original;

            // clamp to avoid extreme squashing/stretching
            //vScale = Math.min(1.5, Math.max(0.7, vScale));

            const yBase = tipY[g.name] ?? 0;
            const yAdj  = yBase * vScale - 4;

            // taxa label
            //html += `
            //  <text x="10" y="${yAdj + 5}" fill="white" font-size="14">${g.name}</text>
            //`;

            const xStart = 10;   // instead of 150
            let x = xStart;

            g.inferred_order.forEach(ctgName => {
                const contig = g.contigs.find(c => c.contig === ctgName);
                if (!contig) return;

                const w = contig.length * scale;
                const trimmed = trimLabelToWidth(ctx, ctgName, w - 6);

                // Dynamically scale rectangle height based on vScale
                const baseRectHeight = 40;
                const rectH = Math.max(6, baseRectHeight * vScale);   // never let it go to zero
                const rectY = yAdj - rectH / 2;

                // Scale font size gently so labels remain readable
                const baseFont = 12;
                const fontSize = Math.max(8, baseFont * vScale);

                // Text baseline adjustment (keeps text centered vertically)
                const textY = rectY + rectH * 0.70;

                // Center of the rectangle in X
                const textX = x + w / 2;

                html += `
                  <g class="synteny-ctg"
                     data-genome="${g.name}"
                     data-contig="${ctgName}"
                     data-orientation="+">

                    <rect x="${x}" y="${rectY}" width="${w}" height="${rectH}"
                          fill="#6699cc" stroke="white" stroke-width="1"></rect>

                    ${
                      trimmed
                        ? `<text x="${textX}" y="${textY}"
                                 fill="white" font-size="12" text-anchor="middle">${trimmed}</text>`
                        : ""
                    }
                  </g>
                `;

                x += w;
            });
        });

        html += `</svg>`;
        container.innerHTML = html;

        // Add hover tooltip
        const tooltip = document.createElement("div");
        tooltip.style.cssText = `
            position:absolute; background:#333; color:white;
            padding:5px 8px; border-radius:4px; font-size:12px;
            pointer-events:none; display:none; z-index:99999;
        `;
        document.body.appendChild(tooltip);

        container.addEventListener("mousemove", e => {
            const ctg = e.target.closest(".synteny-ctg");
            if (!ctg) {
                tooltip.style.display = "none";
                return;
            }

            const g = ctg.dataset.genome;
            const c = ctg.dataset.contig;
            const o = ctg.dataset.orientation;

            tooltip.innerHTML = `
                <b>${g}</b><br>
                Contig: ${c}<br>
                Orientation: ${o}
            `;

            tooltip.style.left = (e.pageX + 12) + "px";
            tooltip.style.top = (e.pageY + 12) + "px";
            tooltip.style.display = "block";
        });

        // Ensure tooltip disappears if the mouse leaves the synteny area entirely
        container.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

    }

};

*/

window.addEventListener("resize", () => {
  if (window.SYNIMA && SYNIMA.currentPage === "synteny") {
    //SYNIMA.showSynteny();
    if (SYNIMA._syntenyRerender) SYNIMA._syntenyRerender();
  }
});
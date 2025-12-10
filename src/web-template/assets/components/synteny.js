window.SYNIMA = window.SYNIMA || {};

SYNIMA.showSynteny = function () {

    const app = document.getElementById("app");
    const raw = document.getElementById("data-synteny");

    if (!raw) {
        app.innerHTML = "<p>No synteny data found.</p>";
        return;
    }

    // Expand layout for synteny view
    const main = document.getElementById("app");
    if (main) {
        main.classList.remove("max-w-6xl", "mx-auto");
        main.style.maxWidth = "none";
        main.style.margin = "20px auto";  // 20px top/bottom, auto center
        main.style.padding = "20px";      // inner padding
        main.style.maxWidth = "100%";     // full width but with margins
    }

    const data = JSON.parse(raw.textContent);
    const config = data.synteny_config;
    const aligncoords = data.aligncoords || "";
    const spans = data.aligncoords_spans || "";

    // Genome order should follow the current TREE PAGE settings
    let genomeOrder = [];

    if (window.SYNIMA && SYNIMA.getCurrentTipOrder) {
        genomeOrder = SYNIMA.getCurrentTipOrder();
    }

    // Fallback to rust-provided order only if tree order unavailable
    if (!genomeOrder || genomeOrder.length === 0) {
        genomeOrder = config.genome_order || [];
    }

    // 2. Begin debug output
    let html = "<h1>Synteny Debug</h1>";

    html += `<p>Num genomes: ${config.num_genomes}</p>`;
    html += `<p>Max genome length: ${config.max_length}</p>`;
    html += `<p>Halfway index: ${config.halfway}</p>`;

    // 3. Print detected genome order from phylogenetic tree
    //----------------------------------------------------------------
    html += `<p>Genome order from tree: `;

    if (genomeOrder.length === 0) {
        html += `<em>No genome order extracted (tree not found or mismatch)</em></p>`;
    } else {
        html += `${genomeOrder.join(" → ")}</p>`;
    }

    // 4. Print all genome metadata
    config.genomes.forEach(g => {
        html += `<h3>${g.name}</h3>`;
        html += `<p>Total length: ${g.total_length}</p>`;
        html += `<p>Contig order (inferred): ${g.inferred_order.join(", ")}</p>`;
        html += `<p>Contig order (fasta): ${g.fasta_order.join(", ")}</p>`;
        html += `<p>Contig lengths:</p>`;
        html += `<ul>`;
        g.contigs.forEach(c => {
            html += `<li>${c.contig}: ${c.length}</li>`;
        });
        html += `</ul>`;
    });

    // 5. Preview aligncoords + spans
    html += `
        <h2>Raw aligncoords</h2>
        <pre>${aligncoords.substring(0, 2000)}...</pre>

        <h2>Raw aligncoords.spans</h2>
        <pre>${spans.substring(0, 2000)}...</pre>
    `;

    //app.innerHTML = html;

    app.innerHTML = `
  <h1>Synteny Viewer</h1>

  <div style="display:flex; gap:20px;">

    <!-- MINI TREE COLUMN -->
    <div style="flex:0 0 20%; min-width:260px; padding-right:10px; padding-bottom:20px; overflow-y:auto; ">
      <!--<h2>Tree</h2>-->
        <div id="synteny-tree-mini"
             style="width:100%; overflow-x:auto; overflow-y:auto; padding-bottom:30px; box-sizing:border-box;">
        </div>
    </div>

    <!-- SYNTENY MAIN COLUMN -->
    <div style="flex:1; padding-left:0; background:none; min-height:auto; min-width:400px; overflow-x:auto; border:none;">
      <div id="synteny-main" style="min-height:auto;"></div>
    </div>

  </div>

  <hr style="margin:20px 0; border-color:#555;">

  <div id="synteny-debug">
    ${html}
  </div>
`;


    //console.log("Mini render debug:", {
    //    hasRender: typeof SYNIMA.renderTreeSvg,
    //    hasTree: !!SYNIMA_TREES.current
    //});

    // Render the Mini Tree
    renderTreeSvg(SYNIMA_TREES.current, "synteny-tree-mini", { mini:true });

    // Render the Synteny browser

    // =============================================
    // Phase 1: Basic synteny contig rectangles
    // =============================================
    (function renderSynteny() {

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

        // Width of the synteny plot in pixels
        //const plotWidthPx = 1200;
        const availableWidth = document.getElementById("synteny-main").clientWidth;

        // minimum width = to prevent EVERYTHING from being squished
        const minWidth = 600;

        // maximum width = prevents rectangles from being huge
        const maxWidth = 1800;

        const plotWidthPx = Math.max(minWidth, Math.min(availableWidth, maxWidth));

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

        const maxSVGHeight = Math.max(...Object.values(tipY)) + 100;

        let html = `
          <svg width="100%"
               viewBox="0 0 ${plotWidthPx + 200} ${maxSVGHeight}"
               preserveAspectRatio="xMinYMin meet"
               style="background:#222; border:1px solid #444;">
        `;

        orderedGenomes.forEach(g => {

            const y = tipY[g.name] || 0;    // fall back to 0 if missing
            const miniScaleFactor = 1.83;
            const yAdj = y / miniScaleFactor;

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

                html += `
                  <g class="synteny-ctg"
                     data-genome="${g.name}"
                     data-contig="${ctgName}"
                     data-orientation="+">

                    <rect x="${x}" y="${yAdj - 12}" width="${w}" height="24"
                          fill="#6699cc" stroke="white" stroke-width="1"></rect>

                    ${
                      trimmed
                        ? `<text x="${x + 3}" y="${yAdj + 5}"
                                 fill="white" font-size="12">${trimmed}</text>`
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

    })();

};

window.addEventListener("resize", () => SYNIMA.showSynteny());
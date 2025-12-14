
// Useful function to start with - finding default values that might have been preselected
function syncSyntenyModeFromStorage() {
    // synteny mode (spans vs gene/aligncoords)
    try {
        const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyMode);
        if (saved === "spans" || saved === "aligncoords") {
            window.SYNIMA_STATE.syntenyMode = saved;
        }
    } catch (e) {
        console.warn("Could not read synteny mode from localStorage", e);
    }

    // contig gaps
    try {
        const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyGap);
        if (saved !== null) {
            const n = parseInt(saved, 10);
            if (!Number.isNaN(n)) window.SYNIMA_STATE.syntenyGapPx = n;
        }
    } catch (e) {
        console.warn("Could not read synteny contig gap from localStorage", e);
    }

    // track scale
    try {
        const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyTrackScale);
        if (saved !== null) {
            const n = parseFloat(saved);
            if (!Number.isNaN(n) && n > 0) window.SYNIMA_STATE.syntenyTrackScale = n;
        }
    } catch (e) {
        console.warn("Could not read synteny contig scale from localStorage", e);
    }

    // synteny colours
    try {
        const c = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockColor);
        if (c) window.SYNIMA_STATE.syntenyBlockColor = c;
    } catch (e) {
        console.warn("Could not read synteny colour from localStorage", e);
    }

    // synteny opacity
    try {
      const v = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockOpacity);
      if (v !== null) {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) window.SYNIMA_STATE.syntenyBlockOpacity = n;
      }
    } catch (e) {}

    // contig colours
    try {
        const saved1 = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode);
        const saved2 = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor);
        const saved3 = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides);
        const saved4 = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigPalette);
        if (saved1 !== null) {
            window.SYNIMA_STATE.syntenyContigColorMode = saved1;
        }
        if (saved2 !== null) {
            window.SYNIMA_STATE.syntenyContigBaseColor = saved2;
        }
        if (saved3 !== null) {
            window.SYNIMA_STATE.syntenyContigOverrides = saved3;
        }
        if (saved4 !== null) {
            window.SYNIMA_STATE.syntenyContigPalette = saved4;
        }
    } catch (e) {
        console.warn("Could not read contig colour options from localStorage", e);
    }

    if (!window.SYNIMA_STATE.syntenyContigColorMode) window.SYNIMA_STATE.syntenyContigColorMode = "single";
    if (!window.SYNIMA_STATE.syntenyContigBaseColor) window.SYNIMA_STATE.syntenyContigBaseColor = "#6699cc";
    if (!window.SYNIMA_STATE.syntenyContigPalette) window.SYNIMA_STATE.syntenyContigPalette = "classic";

    if (typeof window.SYNIMA_STATE.syntenyContigOverrides === "string") {
      try {
        window.SYNIMA_STATE.syntenyContigOverrides = JSON.parse(window.SYNIMA_STATE.syntenyContigOverrides) || {};
      } catch (e) {
        window.SYNIMA_STATE.syntenyContigOverrides = {};
      }
    }
    if (!window.SYNIMA_STATE.syntenyContigOverrides) window.SYNIMA_STATE.syntenyContigOverrides = {};
}

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
    // Header / Download
    // ----------------------------
    let html = `<div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:6px;"><h1>Synteny Viewer</h1>`;
    html += `<div style="position:relative; display:inline-block;">
      <button id="synteny-download-btn" style="padding:2px 6px; margin:0;">
        Download ▾
      </button>

      <div id="synteny-download-dropdown"
           class="hidden"
           style="
             position:absolute;
             right:0;
             top:100%;
             margin-top:2px;
             background:white;
             color:black;
             border:1px solid #ccc;
             border-radius:4px;
             box-shadow:0 2px 4px rgba(0,0,0,0.2);
             z-index:1000;
             width:140px;
           ">

        <button id="synteny-download-svg"
          style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          Synteny (SVG)
        </button>

        <button id="synteny-download-png"
          style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          Synteny (PNG)
        </button>

        <button id="synteny-download-figure-png"
          style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          Tree + Synteny (PNG)
        </button>

        <button id="synteny-download-figure-svg"
          style="display:block; width:100%; text-align:left; padding:4px 8px; border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          Tree + Synteny (SVG)
        </button>

      </div>
    </div>
    </div>`;

    // ----------------------------
    // Tree and Synteny Plot
    // ----------------------------
    html += `
    <div class="section">

        <!--<div style="display:flex; gap:20px;">-->
        <div class="synteny-figure" style="display:flex; gap:10px;">

            <!-- MINI TREE COLUMN -->
            <div id="synteny-tree-col" style="flex:0 0 20%; min-height:400px; padding-right:0px; padding-bottom:20px; overflow-y:auto; ">
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
    </div>`;

    // ----------------------------
    // Synteny Plot Graphical Options
    // ----------------------------
    html += `
    <div class="section">
    <h2>Graphical Options</h2>

    <div class="synteny-controls">

        <!-- Row 0: actions -->
        <div class="synteny-controls-row">
            <button onclick="SYNIMA.resetSynteny()" style="margin-left:10px;">Reset synteny</button>
        </div>

        <!-- Row 1: data -->
        <fieldset class="synteny-controls-group">
            <legend>Data</legend>

            <label>
              <input type="radio" name="synteny-mode" value="spans" checked>
              Contig synteny 
            </label>

            <label>
              <input type="radio" name="synteny-mode" value="aligncoords">
              Gene synteny 
            </label>
        </fieldset>

        <!-- Row 2: layout + size -->
        <fieldset class="synteny-controls-group">
            <legend>Layout and size</legend>

            <!-- Tree width -->
            <label style="margin-left: 10px;">
              Tree width:
              <select id="synteny-tree-width-select">
                <option value="20">20%</option>
                <option value="15">15%</option>
                <option value="10">10%</option>
              </select>
            </label>

            <!-- label size -->
            <label style="margin-left: 10px;">
              Contig font size:
              <select id="synteny-font-size-select">
                <option value="6">6</option>
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="20">20</option>
                <option value="22">22</option>
                <option value="24">24</option>
              </select>
            </label>

            <!-- contig box scale -->
            <label style="margin-left: 10px;">
              Contig box height:
              <select id="synteny-track-scale-select">
                <option value="0.75">0.75×</option>
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </label>

            <!-- contig gap -->
            <label style="margin-left: 10px;">
              Contig gap:
              <select id="synteny-gap-select">
                <option value="0">0</option>
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="6">6</option>
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
              </select>
            </label>
        </fieldset>

        <!-- Row 3: colours -->
        <fieldset class="synteny-controls-group">
            <legend>Colours</legend>

            <!-- contig colours -->
            <label style="margin-left: 10px;">
              Contig colour:
              <select id="contig-colour-select">
                <option value="#66cc99">Green Cyan</option>
                <option value="#6699cc">Blue Gray</option>
                <option value="#cc6699">Pink</option>
                <option value="#cc9966">Light Orange</option>
                <option value="#ffffff">White</option>
                <option value="#ff0000">Red</option>
                <option value="#000000">Black</option>
                <option value="classic">Palette: Classic</option>
                <option value="pastel">Palette: Pastel</option>
                <option value="muted">Palette: Muted</option>
                <option value="okabe">Palette: Okabe</option>
                <option value="vibrant">Palette: Vibrant</option>
                <option value="cool">Palette: Cool</option>
                <option value="warm">Palette: Warm</option>
              </select>
            </label>

            <!-- synteny colours -->
            <label style="margin-left: 10px;">
              Synteny block colour:
              <select id="synteny-block-colour-select">
                <option value="#ffffff">White</option>
                <option value="#d1d5db">Light grey</option>
                <option value="#93c5fd">Light blue</option>
                <option value="#a7f3d0">Mint</option>
                <option value="#fde68a">Soft yellow</option>
                <option value="#fca5a5">Soft red</option>
                <option value="#c4b5fd">Lavender</option>
                <option value="#22c55e">Green</option>
                <option value="#f59e0b">Orange</option>
                <option value="#60a5fa">Blue</option>
              </select>
            </label>

            <!-- synteny opacity -->
            <label style="margin-left: 10px;">
              Synteny opacity:
              <select id="synteny-block-opacity-select">
                <option value="0.10">0.10</option>
                <option value="0.20">0.20</option>
                <option value="0.30">0.30</option>
                <option value="0.40">0.40</option>
                <option value="0.50">0.50</option>
                <option value="0.60">0.60</option>
                <option value="0.70">0.70</option>
                <option value="0.80">0.80</option>
                <option value="0.90">0.90</option>
              </select>
            </label>
        </fieldset>

      </div>
    </div>
    `;

    app.innerHTML = html;

    // ----------------------------
    // Render logic
    // ----------------------------

    syncSyntenyModeFromStorage();
    syncSyntenyFontFromStorage();

    const initMode = window.SYNIMA_STATE.syntenyMode || "spans";
    const initRadio = document.querySelector(`input[name="synteny-mode"][value="${initMode}"]`);
    if (initRadio) initRadio.checked = true;

    // Now the container exists, so render the mini tree
    if (window.SYNIMA_TREES && SYNIMA_TREES.current) {
      renderTreeSvg(SYNIMA_TREES.current, "synteny-tree-mini", { mini: true });
    } else {
      console.warn("synteny: SYNIMA_TREES.current missing, cannot render mini tree");
    }

    //const statsEl = document.getElementById("synteny-stats");
    //const previewEl = document.getElementById("synteny-preview");
    const plotEl = document.getElementById("synteny-plot");

    // select contig
    plotEl.addEventListener("click", (e) => {
      const ctg = e.target.closest(".synteny-ctg");
      
        // clicked empty space inside the plot
        if (!ctg) {
            if (window.SYNIMA_STATE.selectedContigKey) {
              window.SYNIMA_STATE.selectedContigKey = null;
              rerender();
            }
            return;
        }

        const g = ctg.dataset.genome;
        const c = ctg.dataset.contig;
        const key = `${g}|${c}`;

        // toggle if clicking same contig again
        if (window.SYNIMA_STATE.selectedContigKey === key) {
            window.SYNIMA_STATE.selectedContigKey = null;
        } else {
            window.SYNIMA_STATE.selectedContigKey = key;
        }

        rerender();
        e.stopPropagation();
        //openContigEditor(e.pageX, e.pageY, g, c);
    });

    const maps = buildGenomeMaps(config);

    // synteny mode
    const mode = document.querySelector('input[name="synteny-mode"]:checked')?.value || window.SYNIMA_STATE.syntenyMode || "spans";
    const radio = document.querySelector(`input[name="synteny-mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    document.querySelectorAll('input[name="synteny-mode"]').forEach(el => {
      el.addEventListener("change", () => {
        window.SYNIMA_STATE.syntenyMode = el.value;
        try {
            localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyMode, el.value);
        } catch (e) {}
        rerender();
      });
    });

    // tree width
    const tw = document.getElementById("synteny-tree-width-select");
    if (tw) {
      // initialize from saved state
      tw.value = String(window.SYNIMA_STATE.syntenyTreeWidthPct ?? 20);
      applySyntenyTreeWidth();

      tw.addEventListener("change", () => {
        const n = parseInt(tw.value, 10);
        if (!Number.isNaN(n)) {
          window.SYNIMA_STATE.syntenyTreeWidthPct = n;
          try {
            localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyTreeWidth, String(n));
          } catch (e) {}
          applySyntenyTreeWidth();

          // optional: re-render synteny so layout recalculates plot width
          if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
        }
      });
    }

    // label size option
    const fsSelect = document.getElementById("synteny-font-size-select");
    if (fsSelect) {
        fsSelect.value = String(window.SYNIMA_STATE.syntenyFontSize ?? 12);

        fsSelect.addEventListener("change", () => {
            const n = parseInt(fsSelect.value, 10);
            if (!Number.isNaN(n)) {
                window.SYNIMA_STATE.syntenyFontSize = n;
                try {
                    localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyFontSize, String(n));
                } catch (e) {}
                rerender();
            }
        });
    }

    // contig box scale
    const thSel = document.getElementById("synteny-track-scale-select");
    if (thSel) {
        thSel.value = String(window.SYNIMA_STATE.syntenyTrackScale ?? 1.0);

        thSel.addEventListener("change", () => {
            const n = parseFloat(thSel.value);
            if (!Number.isNaN(n) && n > 0) {
                window.SYNIMA_STATE.syntenyTrackScale = n;
                try {
                    localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyTrackScale, String(n));
                } catch (e) {}
                rerender();
            }
        });
    }

    // contig gap
    const gapSelect = document.getElementById("synteny-gap-select");
    if (gapSelect) {
        gapSelect.value = String(window.SYNIMA_STATE.syntenyGapPx ?? 0);

        gapSelect.addEventListener("change", () => {
        const n = parseInt(gapSelect.value, 10);
            if (!Number.isNaN(n)) {
                window.SYNIMA_STATE.syntenyGapPx = n;
                try {
                    localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyGap, String(n));
                } catch (e) {}
                rerender();
            }
        });
    }

    // colour contig
    const colorContig = document.getElementById("contig-colour-select");
    if (colorContig) {
      // init the dropdown from state
      const mode = window.SYNIMA_STATE.syntenyContigColorMode || "single";
      if (mode === "palette_by_genome") {
        colorContig.value = window.SYNIMA_STATE.syntenyContigPalette || "palette1";
      } else {
        colorContig.value = window.SYNIMA_STATE.syntenyContigBaseColor || "#6699cc";
      }

      colorContig.addEventListener("change", () => {
        const v = colorContig.value;

        if (typeof v === "string" && v.startsWith("#")) {
          window.SYNIMA_STATE.syntenyContigColorMode = "single";
          window.SYNIMA_STATE.syntenyContigBaseColor = v;
        } else {
          // e.g. "palette1"
          window.SYNIMA_STATE.syntenyContigColorMode = "palette_by_genome";
          window.SYNIMA_STATE.syntenyContigPalette = v;
        }

        try {
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode, window.SYNIMA_STATE.syntenyContigColorMode);
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor, window.SYNIMA_STATE.syntenyContigBaseColor || "#6699cc");
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyContigPalette, window.SYNIMA_STATE.syntenyContigPalette || "classic");
        } catch (e) {}

        rerender();
      });
    }

    // synteny block colour
    const blockColorSel = document.getElementById("synteny-block-colour-select");
    if (blockColorSel) {
      blockColorSel.value = window.SYNIMA_STATE.syntenyBlockColor || "#ffffff";

      blockColorSel.addEventListener("change", () => {
        const v = blockColorSel.value;
        window.SYNIMA_STATE.syntenyBlockColor = v;
        try {
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockColor, v);
        } catch (e) {}
        rerender();
      });
    }

    // opacity
    const opSel = document.getElementById("synteny-block-opacity-select");
    if (opSel) {
      const cur = Number(window.SYNIMA_STATE.syntenyBlockOpacity ?? 0.5);
      opSel.value = cur.toFixed(2);

      opSel.addEventListener("change", () => {
        const n = parseFloat(opSel.value);
        if (!Number.isNaN(n)) {
          window.SYNIMA_STATE.syntenyBlockOpacity = n;
          try {
            localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockOpacity, n.toFixed(2));
          } catch (e) {}
          rerender();
        }
      });
    }

    function rerender() {
        const mode = document.querySelector('input[name="synteny-mode"]:checked')?.value || "spans";

        let blocks = [];
        if (mode === "spans") {
          blocks = parseAligncoordsSpansText(spansText);
        } else {
          blocks = parseAligncoordsText(aligncoords);
        }

        const maps = buildGenomeMaps(config);
        const layout = buildSyntenyLayout(config, maps);
        const prepared = prepareBlocksForPlot(blocks, config, maps, layout);

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
        const l = maps.contigLen?.[g]?.[c] ?? "unknown";

        tooltip.innerHTML = `
            <b>${g}</b><br>
            Contig: ${c}<br>
            Length: ${l} bp<br>
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

    const dlBtn = document.getElementById("synteny-download-btn");
    const dlMenu = document.getElementById("synteny-download-dropdown");

    dlBtn?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      dlMenu.classList.toggle("hidden");
    });

    document.getElementById("synteny-download-svg")?.addEventListener("click", () => {
      dlMenu.classList.add("hidden");
      SYNIMA.exportSyntenySvg();
    });

    document.getElementById("synteny-download-png")?.addEventListener("click", () => {
      dlMenu.classList.add("hidden");
      SYNIMA.exportSyntenyPng();
    });

    document.getElementById("synteny-download-figure-png")?.addEventListener("click", () => {
      dlMenu.classList.add("hidden");
      SYNIMA.exportSyntenyFigurePng();
    });

    document.getElementById("synteny-download-figure-svg")?.addEventListener("click", () => {
      dlMenu.classList.add("hidden");
      SYNIMA.exportSyntenyFigureSvg();
    });

    document.addEventListener("click", () => {
      dlMenu?.classList.add("hidden");
    });

}

// ----------------------------
// Helpers
// ----------------------------

// Pull from storage once at load
function syncSyntenyFontFromStorage() {
  try {
    const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyFontSize);
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n)) window.SYNIMA_STATE.syntenyFontSize = n;
    }
  } catch (e) {
    console.warn("Could not read synteny font size from localStorage", e);
  }
}

function applySyntenyTreeWidth() {
    const col = document.getElementById("synteny-tree-col");
    if (!col) return;

    const pct = window.SYNIMA_STATE.syntenyTreeWidthPct ?? 20;
    col.style.flex = `0 0 ${pct}%`;
}

function getGenomePaletteColor(idx, paletteName) {
  const palettes = {
    classic: ["#6699cc", "#8bb174", "#d6a84f", "#c77d7d", "#7fa6a3", "#b08fbf"],
    pastel:   ["#a3c4f3", "#bde0fe", "#caffbf", "#ffd6a5", "#ffadad", "#d0bfff"],

    // Softer but higher-contrast than pastel (nice with white text)
    muted:    ["#4C78A8", "#59A14F", "#F28E2B", "#E15759", "#76B7B2", "#B07AA1"],

    // Colorblind-friendly-ish (Okabe-Ito inspired, avoids “muddy” mixes)
    okabe:    ["#56B4E9", "#009E73", "#E69F00", "#D55E00", "#CC79A7", "#F0E442"],

    // Bold / punchy (good if you want genomes to pop)
    vibrant:  ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#14B8A6", "#A855F7"],

    // Cool tones only (very clean on dark UI)
    cool:     ["#60A5FA", "#38BDF8", "#2DD4BF", "#34D399", "#A78BFA", "#818CF8"],

    // Warm tones only (looks “paper/ink” on dark background)
    warm:     ["#FCA5A5", "#FDBA74", "#FCD34D", "#FBBF24", "#FB7185", "#F472B6"],
  };

  const pal = palettes[paletteName] || palettes.classic;
  return pal[Math.abs(idx) % pal.length];
}

function computeBaseFillForGenome(genomeIndex) {
  const palette = window.SYNIMA_STATE?.syntenyContigPalette || "palette1";
  return getGenomePaletteColor(genomeIndex, palette);
}

SYNIMA.resetSynteny = function () {

    // defaults
    const defaultMode = window.SYNIMA_SYNTENY_DEFAULT_MODE || "spans";
    const defaultFont = 12;

    const SYNIMA_SYNTENY_DEFAULTS = {
        contigColorMode: "single",        // or "palette_by_genome"
        contigBaseColor: "#6699cc",
        contigPalette: "palette1"
    };

    // reset state
    window.SYNIMA_STATE.syntenyFontSize = defaultFont;
    window.SYNIMA_STATE.syntenyMode = defaultMode;
    window.SYNIMA_STATE.syntenyGapPx = 0;
    window.SYNIMA_STATE.syntenyTrackScale = 1.0;
    window.SYNIMA_STATE.syntenyTreeWidthPct = 20;
    window.SYNIMA_STATE.syntenyContigColorMode = SYNIMA_SYNTENY_DEFAULTS.contigColorMode;
    window.SYNIMA_STATE.syntenyContigBaseColor = SYNIMA_SYNTENY_DEFAULTS.contigBaseColor;
    window.SYNIMA_STATE.syntenyContigPalette   = SYNIMA_SYNTENY_DEFAULTS.contigPalette;
    window.SYNIMA_STATE.syntenyBlockColor = "#ffffff";
    window.SYNIMA_STATE.syntenyBlockOpacity = 0.5;

    // tree width
    const tw = document.getElementById("synteny-tree-width-select");
    if (tw) tw.value = "20";
    applySyntenyTreeWidth();

    // reset UI: font select
    const fsSelect = document.getElementById("synteny-font-size-select");
    if (fsSelect) fsSelect.value = String(defaultFont);

    // reset UI: radio
    const modeRadio = document.querySelector(
        `input[name="synteny-mode"][value="${defaultMode}"]`
    );
    if (modeRadio) modeRadio.checked = true;

    // reset contig box scale
    const thSel = document.getElementById("synteny-track-scale-select");
    if (thSel) thSel.value = "1";

    // reset contig gap
    const gapSelect = document.getElementById("synteny-gap-select");
    if (gapSelect) gapSelect.value = "0";

    // reset contig colour dropdown
    const colorSelect = document.getElementById("contig-colour-select");
    if (colorSelect) colorSelect.value = SYNIMA_SYNTENY_DEFAULTS.contigBaseColor; // "#6699cc"

    // contig block colour
    const bc = document.getElementById("synteny-block-colour-select");
    if (bc) bc.value = "#ffffff";

    // opacity
    const opSel = document.getElementById("synteny-block-opacity-select");
    if (opSel) opSel.value = "0.5";

    // clear saved state
    try {
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyMode);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyFontSize);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyTrackScale);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyGap);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyTreeWidth);

        // colour keys
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigPalette);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides);

        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockColor);

        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockOpacity);
    } catch (e) {}

    // redraw
    if (typeof SYNIMA._syntenyRerender === "function") {
        SYNIMA._syntenyRerender();
    }
    console.log("Synteny reset to defaults.");
};


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

//let _measureCtx = null;

function getMeasureCtx(fontPx) {
  //if (!_measureCtx) {
    if (!getMeasureCtx._ctx) {
        const c = document.createElement("canvas");
        //_measureCtx = c.getContext("2d");
        getMeasureCtx._ctx = c.getContext("2d");
    }
    const ctx = getMeasureCtx._ctx;
    //_measureCtx.font = `${fontPx}px sans-serif`;
    //return _measureCtx;
    ctx.font = `${fontPx}px sans-serif`;
    return ctx;
}

function trimLabelToWidth(text, maxW, fontPx) {
    if (!text || maxW <= 0) return "";
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

// Parse aligncoords (gene synteny) text
function parseAligncoordsText(text) {
  const blocks = [];
  const lines = (text || "").split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Skip headers like "## alignment ..." and any other comment-style lines
    if (t.startsWith("#")) continue;

    const cols = t.split("\t");
    // Expect at least:
    // g1, c1, gene1, s1, e1, MATCHES, g2, c2, gene2, s2, e2, ...
    //if (cols.length < 11) continue;

    //if (cols[5] !== "MATCHES") continue; // keeps us from accidentally parsing junk
    const mi = cols.indexOf("MATCHES");
    if (mi < 0) continue;

    // Need: g1,c1,s1,e1 then after MATCHES: g2,c2,s2,e2
    // Layout: [g1,c1,gene1,s1,e1,?,MATCHES,g2,c2,gene2,s2,e2,...]
    if (cols.length <= mi + 5) continue;


    const g1 = cols[0];
    const c1 = cols[1];
    const s1 = parseInt(cols[3], 10);
    const e1 = parseInt(cols[4], 10);

    const g2 = cols[mi + 1];
    const c2 = cols[mi + 2];
    const s2 = parseInt(cols[mi + 4], 10);
    const e2 = parseInt(cols[mi + 5], 10);

    if (!g1 || !c1 || !g2 || !c2) continue;
    if ([s1, e1, s2, e2].some(v => Number.isNaN(v))) continue;

    // Strand: same direction => '+', opposite direction => '-'
    const strand = ((s1 <= e1) === (s2 <= e2)) ? "+" : "-";
    blocks.push({ g1, c1, s1, e1, g2, c2, s2, e2, strand });
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

    // new for contig gaps
    const contigRank = {};
    for (const g of config.genomes) {
      const order = maps.contigOrder[g.name] || [];
      const r = {};
      order.forEach((ctg, i) => { r[ctg] = i; });
      contigRank[g.name] = r;
    }
    const gapPx = layout.gapPx ?? 0;
    const rTop = contigRank[top.genome]?.[top.contig] ?? 0;
    const rBot = contigRank[bot.genome]?.[bot.contig] ?? 0;

    const x1lo = x0 + topAbsStart * scale + rTop * gapPx;
    const x1hi = x0 + topAbsEnd   * scale + rTop * gapPx;
    const x2lo = x0 + botAbsStart * scale + rBot * gapPx;
    const x2hi = x0 + botAbsEnd   * scale + rBot * gapPx;

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

    // colour and opacity
    const polyColor = (window.SYNIMA_STATE && window.SYNIMA_STATE.syntenyBlockColor) ? window.SYNIMA_STATE.syntenyBlockColor : "#ffffff";
    const polyFillOpacity = (window.SYNIMA_STATE && Number.isFinite(window.SYNIMA_STATE.syntenyBlockOpacity)) ? window.SYNIMA_STATE.syntenyBlockOpacity : 0.5;

    // keep stroke a bit lighter than fill
    const polyStrokeOpacity = Math.max(0, Math.min(1, polyFillOpacity * 0.5));

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
            fill="${polyColor}"
            fill-opacity="${polyFillOpacity}"
            stroke="${polyColor}"
            stroke-opacity="${polyStrokeOpacity}"
            stroke-width="0.5">
            <title>${escapeHtml(b.topGenome)}:${escapeHtml(b.topContig)} ${b.topAbsStart}-${b.topAbsEnd}
            ↔ ${escapeHtml(b.botGenome)}:${escapeHtml(b.botContig)} ${b.botAbsStart}-${b.botAbsEnd}
            strand=${escapeHtml(b.strand)}</title>
          </polygon>
        `;
    }

    let tracks = "";
    //for (const g of config.genomes) {
    for (const [i, g] of config.genomes.entries()) {
        const y = yFor(g.name);
        const yRect = y - trackHeight / 2;

        const order = maps.contigOrder[g.name] || [];
        const lenMap = maps.contigLen[g.name] || {};

        let x = layout.xStart;

        for (const contig of order) {
            const bpLen = lenMap[contig] || 0;
            const w = bpLen * layout.scaleX;
            if (w <= 0) continue;

            // Contig font size
            const autoFontSize = Math.max(10, Math.min(18, trackHeight * 0.45));
            const stateFont = window.SYNIMA_STATE && Number.isFinite(window.SYNIMA_STATE.syntenyFontSize) ? window.SYNIMA_STATE.syntenyFontSize : null;
            const userFontSize = stateFont ?? autoFontSize;

            // optional clamp (keeps it sane)
            const fontSize = Math.max(6, Math.min(30, userFontSize));
            const label = trimLabelToWidth(contig, w - 6, fontSize);

            // Center text in the rectangle
            const textX = x + w / 2;
            const textY = yRect + trackHeight * 0.68;

            // colour and select
            const overrides = window.SYNIMA_STATE.syntenyContigOverrides || {};
            const key = `${g.name}|${contig}`;

            const mode = window.SYNIMA_STATE.syntenyContigColorMode || "single";
            let fill = window.SYNIMA_STATE.syntenyContigBaseColor || "#6699cc";

            if (mode === "palette_by_genome") {
                //fill = computeBaseFillForGenome(g.name);
                fill = computeBaseFillForGenome(i);
            }
            if (overrides[key]) { fill = overrides[key]; }

            const isSelected = (window.SYNIMA_STATE.selectedContigKey === key);
            const stroke = isSelected ? "#facc15" : "#ffffff";
            const strokeW = isSelected ? 2.5 : 1;

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
                    fill="${fill}"
                    stroke="${stroke}"
                    stroke-width="${strokeW}">
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
            x += w + layout.gapPx;
        }
    }

    return `
        <svg width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block;">
        ${polys}
        ${tracks}
        </svg>
    `;
}

function buildSyntenyLayout(config, maps) {
    const plotEl = document.getElementById("synteny-plot");
    const treeSvg = document.querySelector("#synteny-tree-mini svg");

    const plotWidthPx = plotEl ? plotEl.getBoundingClientRect().width : 800;
    const treeHeightPx = treeSvg ? treeSvg.getBoundingClientRect().height : 300;

    // left padding is not needed because the tree already shows labels
    const xStart = 10;
    const xPadRight = 10;

    // contig gaps
    const gapPx = window.SYNIMA_STATE?.syntenyGapPx ?? 0;
    // Find the maximum number of gaps on any genome row
    let maxGapTotalPx = 0;
    for (const g of config.genomes) {
        const order = maps.contigOrder[g.name] || [];
        const gaps = Math.max(0, order.length - 1);
        maxGapTotalPx = Math.max(maxGapTotalPx, gaps * gapPx);
    }

    const usablePlotWidth = Math.max(100, plotWidthPx - xStart - xPadRight - maxGapTotalPx);
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

        // user multiplier:
        const fontPx = window.SYNIMA_STATE?.syntenyFontSize ?? 12;
        const scale = window.SYNIMA_STATE?.syntenyTrackScale ?? 1.0;
        trackHeight = trackHeight * scale;

        // guarantee label fits inside box (+ a little padding):
        trackHeight = Math.max(trackHeight, fontPx + 6);

        // final clamp (optional, keeps it sane)
        trackHeight = Math.max(10, Math.min(120, trackHeight));

        //console.log("Median tree row spacing:", med, "→ trackHeight:", trackHeight);
    }

    return {
        plotWidthPx,
        treeHeightPx,
        xStart,
        xPadRight,
        usablePlotWidth,
        scaleX,
        gapPx,
        yByGenome,
        trackHeight
    };
}

function cloneSyntenySvgForExport(svgEl) {
    const clone = svgEl.cloneNode(true);

    // if your styling is CSS-driven, do this:
    inlineSvgComputedStyles(clone);

    // bake in the same dark background you use on-screen:
    addSvgBackgroundRect(clone, "#0f1b30");   // or "#111" if you prefer

  // Make exports print-friendly (optional).
  // Remove if you want “exactly as seen”.
  clone.setAttribute("style", "background:#ffffff;");

  // Recolor white text/strokes to black so it exports clearly.
  clone.querySelectorAll("text").forEach(t => t.setAttribute("fill", "black"));
  clone.querySelectorAll("polygon, rect, line, path").forEach(el => {
    const s = el.getAttribute("stroke");
    if (s && (s === "#fff" || s === "#ffffff" || s === "white")) el.setAttribute("stroke", "black");
  });

  return clone;
}

function svgViewBoxWH(svgEl) {
  const vb = (svgEl.getAttribute("viewBox") || "").trim();
  if (!vb) return { w: 1200, h: 600 };
  const parts = vb.split(/\s+/).map(Number);
  return { w: parts[2] || 1200, h: parts[3] || 600 };
}

function addSvgBackgroundRect(svgEl, fill) {
  const vb = (svgEl.getAttribute("viewBox") || "").split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some(n => Number.isNaN(n))) return;
  const [, , vbW, vbH] = vb;

  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("x", "0");
  r.setAttribute("y", "0");
  r.setAttribute("width", String(vbW));
  r.setAttribute("height", String(vbH));
  r.setAttribute("fill", fill);

  svgEl.insertBefore(r, svgEl.firstChild);
}

// Optional, but makes exports robust if your colors come from CSS classes:
function inlineSvgComputedStyles(svgEl) {
  const nodes = svgEl.querySelectorAll("*");
  nodes.forEach(n => {
    const cs = window.getComputedStyle(n);

    // Only inline what we care about for visible output
    if (cs.fill) n.setAttribute("fill", cs.fill);
    if (cs.stroke) n.setAttribute("stroke", cs.stroke);
    if (cs.strokeWidth) n.setAttribute("stroke-width", cs.strokeWidth);

    if (n.tagName.toLowerCase() === "text") {
      if (cs.fontSize) n.setAttribute("font-size", cs.fontSize);
      if (cs.fontFamily) n.setAttribute("font-family", cs.fontFamily);
    }
  });
}

SYNIMA.exportSyntenySvg = function () {
  const svgEl = document.querySelector("#synteny-plot svg");
  if (!svgEl) return;

  const clone = cloneSyntenySvgForExport(svgEl);
  const svgData = new XMLSerializer().serializeToString(clone);

  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "synima_synteny.svg";
  a.click();

  URL.revokeObjectURL(url);
};

SYNIMA.exportSyntenyPng = function () {
  const svgEl = document.querySelector("#synteny-plot svg");
  if (!svgEl) return;

  const clone = cloneSyntenySvgForExport(svgEl);

  // Critical: set explicit width/height from viewBox
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

    // White background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, img.width, img.height);

    ctx.drawImage(img, 0, 0);

    const pngUrl = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "synima_synteny.png";
    a.click();

    URL.revokeObjectURL(url);
  };

  img.src = url;
};

SYNIMA.exportSyntenyFigurePng = function () {
    const treeSvg = document.querySelector("#synteny-tree-mini svg");
  const synSvg  = document.querySelector("#synteny-plot svg");
  if (!treeSvg || !synSvg) return;

  const treeClone = treeSvg.cloneNode(true);
  const synClone  = cloneSyntenySvgForExport(synSvg);

  const tWH = svgViewBoxWH(treeClone);
  const sWH = svgViewBoxWH(synClone);

  treeClone.setAttribute("width", tWH.w);
  treeClone.setAttribute("height", tWH.h);
  synClone.setAttribute("width", sWH.w);
  synClone.setAttribute("height", sWH.h);

  const treeUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(treeClone)], { type: "image/svg+xml" }));
  const synUrl  = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(synClone)],  { type: "image/svg+xml" }));

  const treeImg = new Image();
  const synImg  = new Image();

  let loaded = 0;
  const done = () => {
    loaded++;
    if (loaded !== 2) return;

    const SCALE = 3;

    // Shrink-only target height (prevents tree from getting bigger)
    const targetH = Math.min(tWH.h, sWH.h);

    // Scale tree to match target height
    const treeScale = (tWH.h > 0) ? (targetH / tWH.h) : 1;
    const synScale  = (sWH.h > 0) ? (targetH / sWH.h) : 1;

    const treeDrawW = tWH.w * treeScale;
    const treeDrawH = targetH;

    // If synteny height differs, scale synteny too (normally this will be 1)
    const synDrawW = sWH.w * synScale;
    const synDrawH = targetH;

    const GAP = 10; // in SVG units, tweak (0, 5, 10, 20)

    //const outW = (tWH.w + sWH.w);
    //const outH = Math.max(tWH.h, sWH.h);
    const outW = treeDrawW + GAP + synDrawW;
    const outH = targetH;

    const canvas = document.createElement("canvas");
    canvas.width = outW * SCALE;
    canvas.height = outH * SCALE;

    const ctx = canvas.getContext("2d");

    // scale first so everything below uses "SVG units"
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    // dark background in SVG units
    ctx.fillStyle = "#0f1b30";
    ctx.fillRect(0, 0, outW, outH);

    // draw both images in SVG units
    ctx.drawImage(treeImg, 0, 0, treeDrawW, treeDrawH);
    ctx.drawImage(synImg, treeDrawW + GAP, 0, synDrawW, synDrawH);

    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "synima_tree_and_synteny.png";
    a.click();

    URL.revokeObjectURL(treeUrl);
    URL.revokeObjectURL(synUrl);
  };

    treeImg.onload = done;
    synImg.onload = done;

    treeImg.src = treeUrl;
    synImg.src  = synUrl;
};

SYNIMA.exportSyntenyFigureSvg = function () {
  const treeSvg = document.querySelector("#synteny-tree-mini svg");
  const synSvg  = document.querySelector("#synteny-plot svg");
  if (!treeSvg || !synSvg) return;

  const GAP = 10;                // SVG units
  const BG  = "#0f1b30";         // same as your panel background

  // Clone originals
  const treeClone = treeSvg.cloneNode(true);
  const synClone  = cloneSyntenySvgForExport(synSvg);

  // Ensure viewBox exists and get dimensions
  const tWH = svgViewBoxWH(treeClone);
  const sWH = svgViewBoxWH(synClone);

  // Target height = synteny height (so they align)
  const targetH = sWH.h || tWH.h || 300;

  // Scale tree to match target height
  const treeScale = (tWH.h > 0) ? (targetH / tWH.h) : 1;
  const treeDrawW = tWH.w * treeScale;
  const treeDrawH = targetH;

  // Synteny scale (normally 1 because targetH = sWH.h)
  const synScale = (sWH.h > 0) ? (targetH / sWH.h) : 1;
  const synDrawW = sWH.w * synScale;
  const synDrawH = targetH;

  const outW = treeDrawW + GAP + synDrawW;
  const outH = targetH;

  // Wrapper SVG
  const ns = "http://www.w3.org/2000/svg";
  const wrapper = document.createElementNS(ns, "svg");
  wrapper.setAttribute("xmlns", ns);
  wrapper.setAttribute("width", outW);
  wrapper.setAttribute("height", outH);
  wrapper.setAttribute("viewBox", `0 0 ${outW} ${outH}`);

  // Background rect
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", outW);
  bg.setAttribute("height", outH);
  bg.setAttribute("fill", BG);
  wrapper.appendChild(bg);

  // Put tree inside a <g> and scale it
  const gTree = document.createElementNS(ns, "g");
  gTree.setAttribute("transform", `translate(0 0) scale(${treeScale})`);
  // move children (not the outer <svg>) into the group
  while (treeClone.childNodes.length) gTree.appendChild(treeClone.childNodes[0]);
  wrapper.appendChild(gTree);

  // Put synteny inside a <g> and translate + scale it
  const gSyn = document.createElementNS(ns, "g");
  gSyn.setAttribute("transform", `translate(${treeDrawW + GAP} 0) scale(${synScale})`);
  while (synClone.childNodes.length) gSyn.appendChild(synClone.childNodes[0]);
  wrapper.appendChild(gSyn);

  // Download
  const svgData = new XMLSerializer().serializeToString(wrapper);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "synima_tree_and_synteny.svg";
  a.click();

  URL.revokeObjectURL(url);
};

// selecting contigs
if (!SYNIMA._syntenyOutsideClickBound) {
    SYNIMA._syntenyOutsideClickBound = true;

    document.addEventListener("click", (e) => {
        if (e.target.closest("#synteny-plot")) return;
        if (!window.SYNIMA_STATE.selectedContigKey) return;

        window.SYNIMA_STATE.selectedContigKey = null;
        if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
    });
}

window.addEventListener("resize", () => {
  if (window.SYNIMA && SYNIMA.currentPage === "synteny") {
    //SYNIMA.showSynteny();
    if (SYNIMA._syntenyRerender) SYNIMA._syntenyRerender();
  }
});
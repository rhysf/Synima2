// Ensure new settings have safe defaults even if other scripts define these objects.
if (typeof window !== "undefined") {
    window.SYNIMA_STATE = window.SYNIMA_STATE || {};
    window.SYNIMA_PERSIST_KEYS = window.SYNIMA_PERSIST_KEYS || {};
    if (!window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle) window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle = "synima_syntenyLinkStyle";
    if (!window.SYNIMA_STATE.syntenyLinkStyle) window.SYNIMA_STATE.syntenyLinkStyle = "polygons";

    // Contig order overrides
    if (!window.SYNIMA_PERSIST_KEYS.syntenyContigOrder) window.SYNIMA_PERSIST_KEYS.syntenyContigOrder = "synima_syntenyContigOrder";
    if (!window.SYNIMA_STATE.syntenyContigOrderOverrides) window.SYNIMA_STATE.syntenyContigOrderOverrides = {};
}

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

    // synteny link style (polygons vs ribbons)
    try {
        // Ensure a default key exists even if SYNIMA_PERSIST_KEYS is defined elsewhere
        if (window.SYNIMA_PERSIST_KEYS && !window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle) {
            window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle = "synima_syntenyLinkStyle";
        }
        const k = (window.SYNIMA_PERSIST_KEYS && window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle)
            ? window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle
            : "synima_syntenyLinkStyle";

        const saved = localStorage.getItem(k);
        if (saved === "polygons" || saved === "ribbons") {
            window.SYNIMA_STATE.syntenyLinkStyle = saved;
        }
    } catch (e) {
        console.warn("Could not read synteny link style from localStorage", e);
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
    } catch (e) {
        console.warn("Could not read synteny opacity from localStorage", e);
    }

    // background colour
    try {
        const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyBgColor);
        if (saved) window.SYNIMA_STATE.syntenyBgColor = saved;
    } catch (e) {
        console.warn("Could not read background colour option from localStorage", e);
    }

    // font colour
    try {
      const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyLabelColor);
      if (saved) window.SYNIMA_STATE.syntenyLabelColor = saved;
    } catch (e) {
        console.warn("Could not read contig colour option from localStorage", e);
    }

    // contig rename etc.
    try {
      const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigNames);
      if (saved) window.SYNIMA_STATE.syntenyContigNameOverrides = JSON.parse(saved);
    } catch (e) {
      console.warn("Could not read contig name overrides from localStorage", e);
    }

    // contig reverse compliment
    try {
      const raw = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigFlips);
      if (raw) window.SYNIMA_STATE.syntenyContigFlips = JSON.parse(raw) || {};
    } catch (e) {}

    // contig order overrides
    try {
      // Ensure a default key exists even if SYNIMA_PERSIST_KEYS is defined elsewhere
      if (window.SYNIMA_PERSIST_KEYS && !window.SYNIMA_PERSIST_KEYS.syntenyContigOrder) {
        window.SYNIMA_PERSIST_KEYS.syntenyContigOrder = "synima_syntenyContigOrder";
      }
      const k = (window.SYNIMA_PERSIST_KEYS && window.SYNIMA_PERSIST_KEYS.syntenyContigOrder)
        ? window.SYNIMA_PERSIST_KEYS.syntenyContigOrder
        : "synima_syntenyContigOrder";

      const raw = localStorage.getItem(k);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === "object") window.SYNIMA_STATE.syntenyContigOrderOverrides = obj;
      }
    } catch (e) {
      console.warn("Could not read contig order overrides from localStorage", e);
    }

    // scale bar width
    try {
      const v = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleLineWidth);
      if (v !== null) {
        const n = parseFloat(v);
        if (Number.isFinite(n) && n > 0) window.SYNIMA_STATE.syntenyScaleLineWidth = n;
      }
    } catch (e) {}

    // contig border colours
    try {
      const saved = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.syntenyContigStrokeColor);
      if (saved) window.SYNIMA_STATE.syntenyContigStrokeColor = saved;
    } catch (e) {
        console.warn("Could not read contig border colour from localStorage", e);
    }

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

function openContigEditor(ev, genome, contig) {
    const editorEl = document.getElementById("synteny-contig-editor");
    if (!editorEl) return;

    const key = `${genome}|${contig}`;

    //const maps = window.SYNIMA_STATE._lastMaps; // optional, or pass maps in; see note below
    const maps = window.SYNIMA_STATE._syntenyLastMaps || window.SYNIMA_STATE._lastMaps;
    const len = maps?.contigLen?.[genome]?.[contig] ?? "unknown";

    // We know you currently write data-orientation="+"
    // so this will show "+" for now, but it's ready for later when you implement flipping
    const flips = window.SYNIMA_STATE.syntenyContigFlips || {};
    const isFlipped = !!flips[key];
    const orientation = isFlipped ? "-" : "+";

    const nameOverrides = window.SYNIMA_STATE.syntenyContigNameOverrides || {};
    const curName = nameOverrides[key] || contig;

    const overrides = window.SYNIMA_STATE.syntenyContigOverrides || {};
    const curColor = overrides[key] || "";

    // contig order
    const orderArr = maps?.contigOrder?.[genome] || [];
    const idx = orderArr.indexOf(contig);
    const total = orderArr.length;
    const canUp = idx > 0;
    const canDown = (idx >= 0 && idx < total - 1);

    // position relative to plot
    const plotRect = document.getElementById("synteny-plot").getBoundingClientRect();
    const x = Math.max(10, ev.clientX - plotRect.left + 10);
    const y = Math.max(10, ev.clientY - plotRect.top + 10);

    editorEl.style.position = "absolute";
    editorEl.style.left = `${x}px`;
    editorEl.style.top = `${y}px`;
    editorEl.style.zIndex = "100000";

    editorEl.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:700;">${contig}</div>
        <button class="close" id="ctg-close" type="button">×</button>
      </div>

      <div style="margin-top:6px; font-size:12px; opacity:0.9;">
        Genome: ${genome}<br>
        Length: ${len} bp<br>
        Orientation: <span id="ctg-orientation-val">${orientation}</span>
      </div>

        <div style="margin-top:10px;">
          <label style="display:block; font-size:12px; margin-bottom:4px;">Adjust contig order</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="ctg-order-up" type="button" ${canUp ? "" : "disabled"}>-</button>
            <button id="ctg-order-down" type="button" ${canDown ? "" : "disabled"}>+</button>
            <span style="font-size:12px; opacity:0.9;">${idx >= 0 ? `${idx + 1} / ${total}` : ""}</span>
          </div>
        </div>  

      <div style="margin-top:10px;">
        <label style="display:block; font-size:12px; margin-bottom:4px;">Rename contig</label>
        <input id="ctg-rename-input" type="text" value="${curName}">

        <!-- colours -->
        <div style="margin-top:10px;">
        <label style="display:block; font-size:12px; margin-bottom:4px;">Contig colour</label>
        <select id="ctg-colour-select">
          <option value="">Default</option>
          <option value="#66cc99">Green Cyan</option>
          <option value="#6699cc">Blue Gray</option>
          <option value="#cc6699">Pink</option>
          <option value="#cc9966">Light Orange</option>
          <option value="#ffffff">White</option>
          <option value="#ff0000">Red</option>
          <option value="#000000">Black</option>
        </select>
      </div>

        <!-- Reverse compliment -->
        <div style="margin-top:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:12px;">Reverse complement</span>
            <input id="ctg-flip-checkbox" type="checkbox" ${isFlipped ? "checked" : ""}>
          </div>
        </div>


        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
          <button id="ctg-rename-cancel" type="button">Cancel</button>
          <button id="ctg-rename-apply" type="button">Apply</button>
        </div>
      </div>
    </div>
    `;

    // initial colour
    const colSel = document.getElementById("ctg-colour-select");
    if (colSel) colSel.value = curColor;

  editorEl.classList.remove("hidden");

  // Initial placement near cursor
  editorEl.style.left = (ev.clientX + 12) + "px";
  editorEl.style.top  = (ev.clientY + 12) + "px";

  // Clamp into viewport (fixes bottom-of-plot partially hidden)
  const r = editorEl.getBoundingClientRect();
  let left = ev.clientX + 12;
  let top  = ev.clientY + 12;
  if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
  if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  editorEl.style.left = left + "px";
  editorEl.style.top  = top + "px";

    function closeContigEditor() {
      if (editorEl) editorEl.classList.add("hidden");
    }

  document.getElementById("ctg-close")?.addEventListener("click", () => {
    window.SYNIMA_STATE.selectedContigKey = null;
    closeContigEditor();
    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
  });

  document.getElementById("ctg-rename-cancel")?.addEventListener("click", () => {
    closeContigEditor();
    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
  });

  // rename contig
  document.getElementById("ctg-rename-apply")?.addEventListener("click", () => {
    const val = document.getElementById("ctg-rename-input")?.value?.trim() || "";
    window.SYNIMA_STATE.syntenyContigNameOverrides ||= {};

    if (!val || val === contig) delete window.SYNIMA_STATE.syntenyContigNameOverrides[key];
    else window.SYNIMA_STATE.syntenyContigNameOverrides[key] = val;

    try {
      localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyContigNames,
        JSON.stringify(window.SYNIMA_STATE.syntenyContigNameOverrides));
    } catch (e) {}

    closeContigEditor();
    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
  });

  // recolor
  document.getElementById("ctg-colour-select")?.addEventListener("change", (e) => {
    const v = e.target.value; // "" means default
    window.SYNIMA_STATE.syntenyContigOverrides ||= {};

    if (!v) delete window.SYNIMA_STATE.syntenyContigOverrides[key];
    else window.SYNIMA_STATE.syntenyContigOverrides[key] = v;

    try {
      localStorage.setItem(
        window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides,
        JSON.stringify(window.SYNIMA_STATE.syntenyContigOverrides)
      );
    } catch (err) {}

    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
    });

    // reverse compliment
    document.getElementById("ctg-flip-checkbox")?.addEventListener("change", (e) => {
          const v = !!e.target.checked;
          window.SYNIMA_STATE.syntenyContigFlips ||= {};
          if (!v) delete window.SYNIMA_STATE.syntenyContigFlips[key];
          else window.SYNIMA_STATE.syntenyContigFlips[key] = true;

          // update Orientation in the open editor immediately
          const orientEl = document.getElementById("ctg-orientation-val");
          if (orientEl) orientEl.textContent = v ? "-" : "+";

          try {
            localStorage.setItem(
              window.SYNIMA_PERSIST_KEYS.syntenyContigFlips,
              JSON.stringify(window.SYNIMA_STATE.syntenyContigFlips)
            );
          } catch (err) {}

          if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
    });

    // contig reorder
    function persistContigOrderOverrides() {
    try {
        if (window.SYNIMA_PERSIST_KEYS && !window.SYNIMA_PERSIST_KEYS.syntenyContigOrder) {
          window.SYNIMA_PERSIST_KEYS.syntenyContigOrder = "synima_syntenyContigOrder";
        }
        const k = window.SYNIMA_PERSIST_KEYS?.syntenyContigOrder || "synima_syntenyContigOrder";
        localStorage.setItem(k, JSON.stringify(window.SYNIMA_STATE.syntenyContigOrderOverrides || {}));
      } catch (e) {}
    }

    function moveContigBy(delta) {
      const base = maps?.contigOrder?.[genome] || [];
      if (!Array.isArray(base) || base.length === 0) return;

      window.SYNIMA_STATE.syntenyContigOrderOverrides ||= {};
      let cur = window.SYNIMA_STATE.syntenyContigOrderOverrides[genome];
      if (!Array.isArray(cur) || cur.length === 0) cur = base.slice();

      // sanitize to real contigs only, keep uniqueness, append any missing
      const baseSet = new Set(base);
      const seen = new Set();
      const clean = [];
      for (const ctg of cur) {
        if (baseSet.has(ctg) && !seen.has(ctg)) {
          clean.push(ctg);
          seen.add(ctg);
        }
      }
      for (const ctg of base) {
        if (!seen.has(ctg)) {
          clean.push(ctg);
          seen.add(ctg);
        }
      }
      cur = clean;

      const i = cur.indexOf(contig);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return;

      const tmp = cur[i];
      cur[i] = cur[j];
      cur[j] = tmp;

      window.SYNIMA_STATE.syntenyContigOrderOverrides[genome] = cur;
      persistContigOrderOverrides();

      if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();

      // refresh editor so +/- disabled state and “x / n” updates
      const rect = editorEl.getBoundingClientRect();
      openContigEditor({ clientX: rect.left, clientY: rect.top }, genome, contig);
    }

    document.getElementById("ctg-order-up")?.addEventListener("click", () => moveContigBy(-1));
    document.getElementById("ctg-order-down")?.addEventListener("click", () => moveContigBy(+1));

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
                <div id="synteny-plot" class="panel-view overflow-x-auto" style="position:relative;">
                    <div id="synteny-plot-svg"></div>
                    <div id="synteny-contig-editor" class="synima-contig-editor hidden"></div>
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

            <!-- synteny link style -->
            <label style="margin-left: 10px;">
              Link style:
              <select id="synteny-link-style-select">
                <option value="polygons">Polygons</option>
                <option value="ribbons">Ribbons</option>
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

            <!-- contig border colours -->
            <label style="margin-left: 10px;">
              Contig outline:
              <select id="synteny-contig-stroke-select">
                <option value="#ffffff">White</option>
                <option value="#000000">Black</option>
                <option value="#0f1b30">Navy</option>
                <option value="#d1d5db">Light grey</option>
                <option value="#fbbf24">Amber</option>
                <option value="#93c5fd">Light blue</option>
                <option value="#66cc99">Green cyan</option>
                <option value="#cc6699">Pink</option>
                <option value="#cc9966">Light orange</option>
                <option value="#ff0000">Red</option>
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

            <!-- Background colour -->
            <label style="margin-left: 10px;">
              Background colour:
              <select id="synteny-bg-select">
                <option value="#0f1b30">Navy</option>
                <option value="#111827">Slate</option>
                <option value="#111111">Charcoal</option>
                <option value="#000000">Black</option>
                <option value="#ffffff">White</option>
              </select>
            </label>

            <!-- Contig label colour -->
            <label style="margin-left: 10px;">
              Label colour:
              <select id="synteny-label-colour-select">
                <option value="#ffffff">White</option>
                <option value="#000000">Black</option>
                <option value="#0f1b30">Navy</option>
                <option value="#d1d5db">Light grey</option>
                <option value="#fbbf24">Amber</option>
                <option value="#93c5fd">Light blue</option>
              </select>
            </label>

        </fieldset>

        <!-- Row 4: scale bar -->
        <fieldset class="synteny-controls-group">
          <legend>Scale Bar</legend>

          <label>
            <input type="checkbox" id="synteny-scale-show">
            Show
          </label>

          <label style="margin-left: 10px;">
            Units:
            <select id="synteny-scale-units">
              <option value="auto">Auto</option>
              <option value="bp">bp</option>
              <option value="kb">Kb</option>
              <option value="mb">Mb</option>
              <option value="gb">Gb</option>
            </select>
          </label>

          <label style="margin-left: 10px;">
            Max:
            <input id="synteny-scale-max" type="number" min="0" step="1" placeholder="auto" style="width:90px;">
          </label>

          <label style="margin-left: 10px;">
            Intervals:
            <select id="synteny-scale-intervals">
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </label>

          <label style="margin-left: 10px;">
            Axis font:
            <select id="synteny-scale-axis-font">
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="20">20</option>
                <option value="22">22</option>
                <option value="24">24</option>
                <option value="28">28</option>
                <option value="32">32</option>
            </select>
          </label>

          <label style="margin-left: 10px;">
            Label font:
            <select id="synteny-scale-label-font">
                <option value="8">8</option>
                <option value="10">10</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="20">20</option>
                <option value="22">22</option>
                <option value="24">24</option>
                <option value="28">28</option>
                <option value="32">32</option>
            </select>
          </label>

        <label style="margin-left:10px;">
          Line width:
          <select id="synteny-scale-linewidth-select">
            <option value="0.5">0.5</option>
            <option value="1">1</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>

          <label style="margin-left: 10px;">
            Label:
            <input id="synteny-scale-label-text" type="text" style="width:180px;">
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
    const editorEl = document.getElementById("synteny-contig-editor");

    // Editor box location
    if (editorEl && editorEl.parentElement !== document.body) {
      document.body.appendChild(editorEl);
      editorEl.style.position = "fixed";
      editorEl.style.zIndex = "100000";
    }

    // Add hover tooltip
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
        position:absolute; background:#333; color:white;
        padding:5px 8px; border-radius:4px; font-size:12px;
        pointer-events:none; display:none; z-index:99999;
        `;
    document.body.appendChild(tooltip);

    plotEl.addEventListener("mousemove", e => {

        // If editor is open OR a contig is selected, hide tooltip and stop.
        if (!editorEl.classList.contains("hidden") || window.SYNIMA_STATE.selectedContigKey) {
            tooltip.style.display = "none";
            return;
        }

        // Synteny block tooltip
        const blk = e.target.closest(".synteny-block");
        if (blk) {
            const tip = blk.getAttribute("data-tip") || "";
            if (!tip) { tooltip.style.display = "none"; return; }

            // show multi-line nicely
            tooltip.innerHTML = escapeHtml(tip).replace(/\n/g, "<br>");

            tooltip.style.left = (e.pageX + 12) + "px";
            tooltip.style.top = (e.pageY + 12) + "px";
            tooltip.style.display = "block";
            return;
        }

        // existing contig tooltip
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

    function closeContigEditor() {
      if (editorEl) editorEl.classList.add("hidden");
    }

    // select contig
    plotEl.addEventListener("click", (e) => {
        const ctg = e.target.closest(".synteny-ctg");

        // hide hover tooltip immediately on click
        if (tooltip) tooltip.style.display = "none";
      
        // click outside any contig, and not inside editor
        if (!ctg) {
            if (editorEl && editorEl.contains(e.target)) return;
            window.SYNIMA_STATE.selectedContigKey = null;
            closeContigEditor();
            rerender();
            return;
        }

        const g = ctg.dataset.genome;
        const c = ctg.dataset.contig;
        const key = `${g}|${c}`;

        const wasSelected = (window.SYNIMA_STATE.selectedContigKey === key);

        // toggle
        window.SYNIMA_STATE.selectedContigKey = wasSelected ? null : key;

        if (wasSelected) {
            closeContigEditor();
        } else {
            openContigEditor(e, g, c);
        }

        rerender();
    });

    // Escape closes editor + highlight
    if (!window.SYNIMA_STATE._syntenyEscHooked) {
      window.SYNIMA_STATE._syntenyEscHooked = true;
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        window.SYNIMA_STATE.selectedContigKey = null;
        closeContigEditor();
        if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
      });
    }

    const maps = buildGenomeMaps(config);

    // make maps available to helpers like openContigEditor
    window.SYNIMA_STATE = window.SYNIMA_STATE || {};
    window.SYNIMA_STATE._lastMaps = maps;

    // background colour
    applySyntenyBackground();
    const bgSel = document.getElementById("synteny-bg-select");
    if (bgSel) {
      bgSel.value = window.SYNIMA_STATE.syntenyBgColor || "#0f1b30";
      bgSel.addEventListener("change", () => {
        const bg = bgSel.value;
        window.SYNIMA_STATE.syntenyBgColor = bg;
        try {
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyBgColor, bg);
        } catch (e) {}
        applySyntenyBackground();
        rerender(); // optional, only needed if you want the SVG itself to use BG too
      });
    }

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

    // synteny link style (polygons vs ribbons)
    const linkStyleSel = document.getElementById("synteny-link-style-select");
    if (linkStyleSel) {
        linkStyleSel.value = String(window.SYNIMA_STATE.syntenyLinkStyle ?? "polygons");

        linkStyleSel.addEventListener("change", () => {
            const v = linkStyleSel.value;
            if (v === "polygons" || v === "ribbons") {
                window.SYNIMA_STATE.syntenyLinkStyle = v;
                try {
                    if (window.SYNIMA_PERSIST_KEYS && !window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle) {
                        window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle = "synima_syntenyLinkStyle";
                    }
                    const k = (window.SYNIMA_PERSIST_KEYS && window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle)
                        ? window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle
                        : "synima_syntenyLinkStyle";
                    localStorage.setItem(k, v);
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

    // contig border colour
    const strokeSel = document.getElementById("synteny-contig-stroke-select");
    if (strokeSel) {
      strokeSel.value = window.SYNIMA_STATE.syntenyContigStrokeColor || "#ffffff";

      strokeSel.addEventListener("change", () => {
        const v = strokeSel.value || "#ffffff";
        window.SYNIMA_STATE.syntenyContigStrokeColor = v;
        try {
          localStorage.setItem(window.SYNIMA_PERSIST_KEYS.syntenyContigStrokeColor, v);
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

    // Small helpers (keeps the bindings consistent)
    function persist(key, val) {
      try { localStorage.setItem(key, String(val)); } catch (e) {}
    }

    // Prefer the canonical synteny rerender if it exists, fallback to local rerender()
    function rerenderSynteny() {
      if (typeof SYNIMA?._syntenyRerender === "function") SYNIMA._syntenyRerender();
      else if (typeof rerender === "function") rerender();
    }

    // Simple debounce for text/number inputs
    function debounce(fn, ms = 150) {
      let t = null;
      return (...args) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }

    // --------------------
    // Contig label colour
    // --------------------
    {
      const el = document.getElementById("synteny-label-colour-select");
      if (el) {
        const init = window.SYNIMA_STATE.syntenyLabelColor || "#ffffff";
        el.value = init;

        el.addEventListener("change", () => {
          const v = el.value || "#ffffff";
          window.SYNIMA_STATE.syntenyLabelColor = v;
          persist(window.SYNIMA_PERSIST_KEYS.syntenyLabelColor, v);
          rerenderSynteny();
        });
      }
    }

    // --------------------
    // Scale bar settings
    // --------------------
    function bindScaleBarControls() {
      const show = document.getElementById("synteny-scale-show");
      const units = document.getElementById("synteny-scale-units");
      const maxI  = document.getElementById("synteny-scale-max");
      const ints  = document.getElementById("synteny-scale-intervals");
      const axF   = document.getElementById("synteny-scale-axis-font");
      const lbF   = document.getElementById("synteny-scale-label-font");
      const text  = document.getElementById("synteny-scale-label-text");

      // initialise UI from state
      if (show) show.checked = (window.SYNIMA_STATE.syntenyScaleShow !== false);
      if (units) units.value = window.SYNIMA_STATE.syntenyScaleUnits || "auto";
      if (maxI) maxI.value = String(window.SYNIMA_STATE.syntenyScaleMax ?? "");
      if (ints) ints.value = String(window.SYNIMA_STATE.syntenyScaleIntervals ?? 10);
      if (axF) axF.value = String(window.SYNIMA_STATE.syntenyScaleAxisFont ?? 12);
      if (lbF) lbF.value = String(window.SYNIMA_STATE.syntenyScaleLabelFont ?? 12);
      if (text) text.value = String(window.SYNIMA_STATE.syntenyScaleLabelText ?? "Position in genome");

      // per-control save helpers
      function saveBool(kPersist, kState, v) {
        window.SYNIMA_STATE[kState] = !!v;
        persist(kPersist, window.SYNIMA_STATE[kState]);
        rerenderSynteny();
      }

      function saveStr(kPersist, kState, v) {
        window.SYNIMA_STATE[kState] = String(v ?? "");
        persist(kPersist, window.SYNIMA_STATE[kState]);
        rerenderSynteny();
      }

      function saveInt(kPersist, kState, v, fallback) {
        const n = parseInt(String(v), 10);
        window.SYNIMA_STATE[kState] = Number.isFinite(n) ? n : fallback;
        persist(kPersist, window.SYNIMA_STATE[kState]);
        rerenderSynteny();
      }

      // Events
      show?.addEventListener("change", () => {
        saveBool(window.SYNIMA_PERSIST_KEYS.syntenyScaleShow, "syntenyScaleShow", show.checked);
      });

      units?.addEventListener("change", () => {
        saveStr(window.SYNIMA_PERSIST_KEYS.syntenyScaleUnits, "syntenyScaleUnits", units.value || "auto");
      });

      // new additional code to try and get auto -> change to start from auto value
      function currentAutoNiceMax() {
        const maxBp = Number(config?.max_length ?? 0);
        const intervals = parseInt(String(ints?.value ?? window.SYNIMA_STATE.syntenyScaleIntervals ?? 10), 10) || 10;
        const u = String(units?.value ?? window.SYNIMA_STATE.syntenyScaleUnits ?? "auto");
        const { factor } = scaleUnitSpec(maxBp, u);
        const maxRawUnits = factor > 0 ? (maxBp / factor) : 0;
        const { maxNice } = computeNiceMax(maxRawUnits, intervals);
        return (Number.isFinite(maxNice) && maxNice > 0) ? maxNice : 1;
      }

      function seedMaxIfAutoEmpty() {
        const raw = String(maxI?.value ?? "").trim();
        if (raw !== "") return false;
        const seeded = currentAutoNiceMax();
        maxI.value = String(seeded);
        // do not persist yet; we will persist via the normal input handler after stepping
        return true;
      }

      // Keyboard arrows in the field
      maxI?.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        if (!seedMaxIfAutoEmpty()) return;
        // allow the browser to apply the step from the seeded value
      });

      // Mouse click on the spinner buttons (right side of number input)
      maxI?.addEventListener("mousedown", (e) => {
        if (!maxI) return;
        const raw = String(maxI.value ?? "").trim();
        if (raw !== "") return;

        const r = maxI.getBoundingClientRect();
        const onSpinner = (e.clientX - r.left) > (r.width - 24);
        if (!onSpinner) return;

        e.preventDefault(); // we will step manually
        seedMaxIfAutoEmpty();

        const clickedUp = (e.clientY - r.top) < (r.height / 2);
        if (clickedUp) maxI.stepUp();
        else maxI.stepDown();

        maxI.dispatchEvent(new Event("input", { bubbles: true }));
      }, true);


      // max: only accept "" (auto) or a finite > 0 number, and debounce typing
      maxI?.addEventListener("input", debounce(() => {
        const raw = String(maxI.value ?? "").trim();
        if (raw === "") {
          window.SYNIMA_STATE.syntenyScaleMax = "";
          persist(window.SYNIMA_PERSIST_KEYS.syntenyScaleMax, "");
          rerenderSynteny();
          return;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return; // ignore invalid partial typing
        window.SYNIMA_STATE.syntenyScaleMax = raw; // keep as string, your renderer expects string-ish
        persist(window.SYNIMA_PERSIST_KEYS.syntenyScaleMax, raw);
        rerenderSynteny();
      }, 200));

      ints?.addEventListener("change", () => {
        saveInt(window.SYNIMA_PERSIST_KEYS.syntenyScaleIntervals, "syntenyScaleIntervals", ints.value, 10);
      });

      axF?.addEventListener("change", () => {
        saveInt(window.SYNIMA_PERSIST_KEYS.syntenyScaleAxisFont, "syntenyScaleAxisFont", axF.value, 12);
      });

      lbF?.addEventListener("change", () => {
        saveInt(window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelFont, "syntenyScaleLabelFont", lbF.value, 12);
      });

      // label text: debounce typing
      text?.addEventListener("input", debounce(() => {
        saveStr(window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelText, "syntenyScaleLabelText", text.value);
      }, 200));
    }

    bindScaleBarControls();

    // --------------------
    // Scale bar line width
    // --------------------
    {
      const lw = document.getElementById("synteny-scale-linewidth-select");
      if (lw) {
        lw.value = String(window.SYNIMA_STATE.syntenyScaleLineWidth ?? 1);

        lw.addEventListener("change", () => {
          const n = Number(lw.value);
          if (!Number.isFinite(n) || n <= 0) return;
          window.SYNIMA_STATE.syntenyScaleLineWidth = n;
          persist(window.SYNIMA_PERSIST_KEYS.syntenyScaleLineWidth, n);
          rerenderSynteny();
        });
      }
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
        window.SYNIMA_STATE._syntenyLastMaps = maps;
        const layout = buildSyntenyLayout(config, maps);
        const prepared = prepareBlocksForPlot(blocks, config, maps, layout);

        //plotEl.innerHTML = renderSyntenySvg(prepared.blocks, config, maps, layout);
        const svgHost = document.getElementById("synteny-plot-svg");
        if (svgHost) {
            svgHost.innerHTML = renderSyntenySvg(prepared.blocks, config, maps, layout);
            //console.log("rerendered with new tracks etc.", svgHost.innerHTML);
        }
    }

    rerender();
    SYNIMA._syntenyRerender = rerender;

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

function applySyntenyBackground() {
    const bg = window.SYNIMA_STATE.syntenyBgColor || "#0f1b30";
    const fig = document.querySelector(".synteny-figure");
    if (fig) fig.style.setProperty("--synima-synteny-bg", bg);
}

function scaleUnitSpec(maxBp, units) {
  if (units === "bp") return { factor: 1, label: "bp" };
  if (units === "kb") return { factor: 1e3, label: "Kb" };
  if (units === "mb") return { factor: 1e6, label: "Mb" };
  if (units === "gb") return { factor: 1e9, label: "Gb" };

  // auto
  if (maxBp >= 1e9) return { factor: 1e9, label: "Gb" };
  if (maxBp >= 1e6) return { factor: 1e6, label: "Mb" };
  if (maxBp >= 1e3) return { factor: 1e3, label: "Kb" };
  return { factor: 1, label: "bp" };
}

function niceStep(v, targetIntervals) {
  if (!isFinite(v) || v <= 0 || !isFinite(targetIntervals) || targetIntervals <= 0) return 1;
  const raw = v / targetIntervals;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const mant = raw / pow;
  let niceMant = 1;
  if (mant <= 1) niceMant = 1;
  else if (mant <= 2) niceMant = 2;
  else if (mant <= 5) niceMant = 5;
  else niceMant = 10;
  return niceMant * pow;
}

// ensure maxNice <= maxRaw by shrinking step if needed
function computeNiceMax(maxRawUnits, intervals) {
  if (!isFinite(maxRawUnits) || maxRawUnits <= 0) return { maxNice: 0, step: 0 };
  let step = niceStep(maxRawUnits, intervals);

  // try to reduce step until it fits
  for (let tries = 0; tries < 20; tries++) {
    const maxNice = step * intervals;
    if (maxNice <= maxRawUnits) return { maxNice, step };
    step = step / 2;
  }
  const fallbackStep = maxRawUnits / intervals;
  return { maxNice: fallbackStep * intervals, step: fallbackStep };
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

    // scale bar defaults
    const SYNIMA_SYNTENY_SCALE_DEFAULTS = {
      show: true,
      units: "auto",          // auto|bp|kb|mb|gb
      max: "",                // "" => auto
      intervals: 10,
      axisFont: 20,
      labelFont: 24,
      labelText: "Position in genome"
    };

    // reset state
    window.SYNIMA_STATE.syntenyFontSize = defaultFont;
    window.SYNIMA_STATE.syntenyMode = defaultMode;
    window.SYNIMA_STATE.syntenyGapPx = 0;
    window.SYNIMA_STATE.syntenyTrackScale = 1.0;
    window.SYNIMA_STATE.syntenyTreeWidthPct = 20;
    window.SYNIMA_STATE.syntenyLinkStyle = "polygons";
    window.SYNIMA_STATE.syntenyContigColorMode = SYNIMA_SYNTENY_DEFAULTS.contigColorMode;
    window.SYNIMA_STATE.syntenyContigBaseColor = SYNIMA_SYNTENY_DEFAULTS.contigBaseColor;
    window.SYNIMA_STATE.syntenyContigPalette   = SYNIMA_SYNTENY_DEFAULTS.contigPalette;
    window.SYNIMA_STATE.syntenyBlockColor = "#ffffff";
    window.SYNIMA_STATE.syntenyBlockOpacity = 0.5;
    window.SYNIMA_STATE.syntenyBgColor = "#0f1b30";
    window.SYNIMA_STATE.syntenyLabelColor = "#ffffff";
    window.SYNIMA_STATE.selectedContigKey = null;
    window.SYNIMA_STATE.syntenyContigNameOverrides = {};
    window.SYNIMA_STATE.syntenyContigFlips = {};
    window.SYNIMA_STATE.syntenyContigOverrides = {};
    window.SYNIMA_STATE.syntenyContigStrokeColor = "#ffffff";
    window.SYNIMA_STATE.syntenyScaleLineWidth = 1.0;
    window.SYNIMA_STATE.syntenyContigOrderOverrides = {};

    // scale bar
    window.SYNIMA_STATE.syntenyScaleShow      = SYNIMA_SYNTENY_SCALE_DEFAULTS.show;
    window.SYNIMA_STATE.syntenyScaleUnits     = SYNIMA_SYNTENY_SCALE_DEFAULTS.units;
    window.SYNIMA_STATE.syntenyScaleMax       = SYNIMA_SYNTENY_SCALE_DEFAULTS.max;
    window.SYNIMA_STATE.syntenyScaleIntervals = SYNIMA_SYNTENY_SCALE_DEFAULTS.intervals;
    window.SYNIMA_STATE.syntenyScaleAxisFont  = SYNIMA_SYNTENY_SCALE_DEFAULTS.axisFont;
    window.SYNIMA_STATE.syntenyScaleLabelFont = SYNIMA_SYNTENY_SCALE_DEFAULTS.labelFont;
    window.SYNIMA_STATE.syntenyScaleLabelText = SYNIMA_SYNTENY_SCALE_DEFAULTS.labelText;

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

    // reset link style
    const linkStyleSel = document.getElementById("synteny-link-style-select");
    if (linkStyleSel) linkStyleSel.value = "polygons";

    // contig colour dropdown
    const colorSelect = document.getElementById("contig-colour-select");
    if (colorSelect) colorSelect.value = SYNIMA_SYNTENY_DEFAULTS.contigBaseColor; // "#6699cc"

    // contig border colour dropdown
    const stSel = document.getElementById("synteny-contig-stroke-select");
    if (stSel) stSel.value = "#ffffff";

    // contig block colour
    const bc = document.getElementById("synteny-block-colour-select");
    if (bc) bc.value = "#ffffff";

    // opacity
    const opSel = document.getElementById("synteny-block-opacity-select");
    if (opSel) opSel.value = "0.50";

    // background colour
    const bgSel = document.getElementById("synteny-bg-select");
    if (bgSel) bgSel.value = "#0f1b30";
    try { localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyBgColor); } catch (e) {}
    applySyntenyBackground();

    // contig label colour
    const lc = document.getElementById("synteny-label-colour-select");
    if (lc) lc.value = "#ffffff";

    // scale bar
    const scShow = document.getElementById("synteny-scale-show");
    if (scShow) scShow.checked = !!SYNIMA_SYNTENY_SCALE_DEFAULTS.show;

    const scUnits = document.getElementById("synteny-scale-units");
    if (scUnits) scUnits.value = SYNIMA_SYNTENY_SCALE_DEFAULTS.units;

    const scMax = document.getElementById("synteny-scale-max");
    if (scMax) scMax.value = SYNIMA_SYNTENY_SCALE_DEFAULTS.max;

    const scInts = document.getElementById("synteny-scale-intervals");
    if (scInts) scInts.value = String(SYNIMA_SYNTENY_SCALE_DEFAULTS.intervals);

    const scAxisF = document.getElementById("synteny-scale-axis-font");
    if (scAxisF) scAxisF.value = String(SYNIMA_SYNTENY_SCALE_DEFAULTS.axisFont);

    const scLabelF = document.getElementById("synteny-scale-label-font");
    if (scLabelF) scLabelF.value = String(SYNIMA_SYNTENY_SCALE_DEFAULTS.labelFont);

    const scText = document.getElementById("synteny-scale-label-text");
    if (scText) scText.value = SYNIMA_SYNTENY_SCALE_DEFAULTS.labelText;

    const lw = document.getElementById("synteny-scale-linewidth-select");
    if (lw) lw.value = "1";

    // clear saved state
    try {
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyMode);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyFontSize);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyTrackScale);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyGap);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyTreeWidth);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyLinkStyle);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigColorMode);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigBaseColor);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigPalette);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockColor);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyBlockOpacity);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyLabelColor);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigNames);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigFlips);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigOverrides);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyContigStrokeColor);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS?.syntenyContigOrder || "synima_syntenyContigOrder");

        //scale bar
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleShow);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleUnits);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleMax);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleIntervals);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleAxisFont);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelFont);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleLabelText);
        localStorage.removeItem(window.SYNIMA_PERSIST_KEYS.syntenyScaleLineWidth);
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

function escapeAttr(str) {
  return (str || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
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

    //const order = (g.inferred_order && g.inferred_order.length) ? g.inferred_order : (g.fasta_order || []);
    //contigOrder[g.name] = order;

    const baseOrder = (g.inferred_order && g.inferred_order.length) ? g.inferred_order : (g.fasta_order || []);

    let order = Array.isArray(baseOrder) ? baseOrder.slice() : [];

    // Apply user contig order override for this genome (stored by real contig IDs)
    const all = window.SYNIMA_STATE.syntenyContigOrderOverrides || {};
    const ov = all[g.name];

    if (Array.isArray(ov) && ov.length) {
      const baseSet = new Set(order);
      const seen = new Set();
      const newOrder = [];

      for (const ctg of ov) {
        if (baseSet.has(ctg) && !seen.has(ctg)) {
          newOrder.push(ctg);
          seen.add(ctg);
        }
      }
      for (const ctg of order) {
        if (!seen.has(ctg)) {
          newOrder.push(ctg);
          seen.add(ctg);
        }
      }
      order = newOrder;
    }

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

function flipInterval(lo, hi, L) {
  // lo/hi are local contig coords in ascending order
  // map [lo,hi] -> [L-hi, L-lo]
  // 1-based inclusive [lo,hi] -> [L-hi+1, L-lo+1]
  return { lo: (L - hi + 1), hi: (L - lo + 1) };
}

// Convert spans blocks into absolute coords + scaled x coords
function prepareBlocksForPlot(blocks, config, maps, layout) {
    //const idx = maps.genomeIndex;
    const offset = maps.contigOffset;
    const lenMap = maps.contigLen;
    const flips = window.SYNIMA_STATE.syntenyContigFlips || {};

    const order = getGenomeOrderForAdjacency(config);
    const adjacent = buildAdjacencySet(order);

    // optional, but useful for debugging / index lookups:
    const genomeIndex = Object.create(null);
    order.forEach((name, i) => { genomeIndex[name] = i; });

    const scale = layout.scaleX;
    const x0 = layout.xStart;

    // Build contig ranks ONCE (for gaps)
    const contigRank = {};
    for (const g of config.genomes) {
        const order = maps.contigOrder[g.name] || [];
        const r = {};
        order.forEach((ctg, i) => { r[ctg] = i; });
        contigRank[g.name] = r;
    }
    const gapPx = layout.gapPx ?? 0;

    let skippedUnknownGenome = 0;
    let skippedUnknownContig = 0;
    let skippedNonAdjacent = 0;

    const out = [];

    for (const b of blocks) {

        const i1 = genomeIndex[b.g1];
        const i2 = genomeIndex[b.g2];
        if (i1 === undefined || i2 === undefined) {
          skippedUnknownGenome++;
          continue;
        }

        const pairKey = (i1 <= i2) ? `${b.g1}|${b.g2}` : `${b.g2}|${b.g1}`;
        if (!adjacent.has(pairKey)) { 
            skippedNonAdjacent++; 
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

        // new for r.c.,
        let topLo = Math.min(top.s, top.e);
        let topHi = Math.max(top.s, top.e);
        let botLo = Math.min(bot.s, bot.e);
        let botHi = Math.max(bot.s, bot.e);

        const topKey = `${top.genome}|${top.contig}`;
        const botKey = `${bot.genome}|${bot.contig}`;

        const topFlip = !!flips[topKey];
        const botFlip = !!flips[botKey];

        if (topFlip) {
          const L = lenMap?.[top.genome]?.[top.contig];
          if (typeof L === "number") ({ lo: topLo, hi: topHi } = flipInterval(topLo, topHi, L));
        }
        if (botFlip) {
          const L = lenMap?.[bot.genome]?.[bot.contig];
          if (typeof L === "number") ({ lo: botLo, hi: botHi } = flipInterval(botLo, botHi, L));
        }

        // strand should flip if exactly one side is flipped
        let strand = b.strand;
        if (topFlip !== botFlip) {
          strand = (strand === "+") ? "-" : "+";
        }

        const topAbsStart = topOff + topLo;
        const topAbsEnd   = topOff + topHi;
        const botAbsStart = botOff + botLo;
        const botAbsEnd   = botOff + botHi;

        //const topAbsStart = topOff + Math.min(top.s, top.e);
        //const topAbsEnd   = topOff + Math.max(top.s, top.e);
        //const botAbsStart = botOff + Math.min(bot.s, bot.e);
        //const botAbsEnd   = botOff + Math.max(bot.s, bot.e);

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

          strand
        });
    }

    return { blocks: out, skippedUnknownGenome, skippedUnknownContig, skippedNonAdjacent };
}

// Render a simple SVG: genome tracks + polygons
function renderSyntenySvg(blocks, config, maps, layout) {
    const svgW = layout.plotWidthPx;
    let svgH = Math.max(layout.treeHeightPx, 200);

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
    const labelColor = (window.SYNIMA_STATE && window.SYNIMA_STATE.syntenyLabelColor) ? window.SYNIMA_STATE.syntenyLabelColor : "#ffffff";

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

        // Strand twisting is ignored for now (non-twisting ribbons).
        const linkStyle = (window.SYNIMA_STATE && window.SYNIMA_STATE.syntenyLinkStyle)
            ? window.SYNIMA_STATE.syntenyLinkStyle
            : "polygons";

        const tip = `${b.topGenome}:${b.topContig} ${b.topAbsStart}-${b.topAbsEnd}\n` +
            `↔ ${b.botGenome}:${b.botContig} ${b.botAbsStart}-${b.botAbsEnd}\n`;

            // + `strand=${b.strand}`

        if (linkStyle === "ribbons") {
            const yMid = (yTopEdge + yBotEdge) / 2;
            const d = [
              `M ${b.x1lo} ${yTopEdge}`,
              `L ${b.x1hi} ${yTopEdge}`,
              `C ${b.x1hi} ${yMid} ${b.x2hi} ${yMid} ${b.x2hi} ${yBotEdge}`,
              `L ${b.x2lo} ${yBotEdge}`,
              `C ${b.x2lo} ${yMid} ${b.x1lo} ${yMid} ${b.x1lo} ${yTopEdge}`,
              `Z`
            ].join(" ");

            //                 <title>${escapeHtml(b.topGenome)}:${escapeHtml(b.topContig)} ${b.topAbsStart}-${b.topAbsEnd}
            //    ↔ ${escapeHtml(b.botGenome)}:${escapeHtml(b.botContig)} ${b.botAbsStart}-${b.botAbsEnd}
            //    strand=${escapeHtml(b.strand)}</title>

            polys += `
              <path 
                class="synteny-block" 
                data-tip="${escapeAttr(tip)}" 
                d="${d}"
                fill="${polyColor}"
                fill-opacity="${polyFillOpacity}"
                stroke="${polyColor}"
                stroke-opacity="${polyStrokeOpacity}"
                stroke-width="0.5">

              </path>
            `;
        } else {
            const points = [
              `${b.x1lo},${yTopEdge}`,
              `${b.x1hi},${yTopEdge}`,
              `${b.x2hi},${yBotEdge}`,
              `${b.x2lo},${yBotEdge}`
            ].join(" ");

            //                 <title>${escapeHtml(b.topGenome)}:${escapeHtml(b.topContig)} ${b.topAbsStart}-${b.topAbsEnd}
            //    ↔ ${escapeHtml(b.botGenome)}:${escapeHtml(b.botContig)} ${b.botAbsStart}-${b.botAbsEnd}
            //    strand=${escapeHtml(b.strand)}</title>

            polys += `
              <polygon 
                class="synteny-block"
                data-tip="${escapeAttr(tip)}" 
                points="${points}"
                fill="${polyColor}"
                fill-opacity="${polyFillOpacity}"
                stroke="${polyColor}"
                stroke-opacity="${polyStrokeOpacity}"
                stroke-width="0.5">
              </polygon>
            `;
        }
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

            // contig label
            const key = `${g.name}|${contig}`;
            const nameOverrides = window.SYNIMA_STATE.syntenyContigNameOverrides || {};
            const flips = window.SYNIMA_STATE.syntenyContigFlips || {};

            const baseName = nameOverrides[key] || contig;
            const isFlipped = !!flips[key];
            const orient = isFlipped ? "-" : "+";

            // Render-only suffix (not editable by user)
            const renderName = isFlipped ? (baseName + "-") : baseName;

            // Trim AFTER suffix is added so the suffix participates in width logic
            const label = trimLabelToWidth(renderName, w - 6, fontSize);

            // Center text in the rectangle
            const textX = x + w / 2;
            const textY = yRect + trackHeight * 0.68;

            // colour and select
            const overrides = window.SYNIMA_STATE.syntenyContigOverrides || {};
            //const key = `${g.name}|${contig}`;

            const mode = window.SYNIMA_STATE.syntenyContigColorMode || "single";
            let fill = window.SYNIMA_STATE.syntenyContigBaseColor || "#6699cc";

            if (mode === "palette_by_genome") {
                //fill = computeBaseFillForGenome(g.name);
                fill = computeBaseFillForGenome(i);
            }
            if (overrides[key]) { fill = overrides[key]; }

            const isSelected = (window.SYNIMA_STATE.selectedContigKey === key);
            const gClass = isSelected ? "synteny-ctg is-selected" : "synteny-ctg";


            // outline only when selected
            const baseStroke = window.SYNIMA_STATE.syntenyContigStrokeColor || "#ffffff";
            const stroke  = isSelected ? "#facc15" : baseStroke;
            const strokeW = isSelected ? 2.5 : 1;

            //if(isSelected) {
            //    console.warn("found something that is selected. stroke = ", stroke);
            //}

            // style="stroke:${stroke};stroke-width:${strokeW};" 
            // stroke="${stroke}" 
            // stroke-width="${strokeW}"

           tracks += `
                <g class="${gClass}"
                    data-genome="${g.name}"
                    data-contig="${contig}"
                    data-orientation="${orient}">
                <rect
                    x="${x}"
                    y="${yRect}"
                    width="${w}"
                    height="${trackHeight}"
                    fill="${fill}" 
                    stroke="${stroke}" 
                    stroke-width="${strokeW}"
                    >
                </rect>
                ${
                (label && w >= 25)
                  ? `<text x="${textX}" y="${textY}"
                           fill="${labelColor}"
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

    // ----------------------------
    // Scale bar (optional)
    // ----------------------------
    const showScale = (window.SYNIMA_STATE.syntenyScaleShow !== false);
    let scaleBarSvg = "";
    let extraBottom = 0;

    if (showScale) {
        const maxBpRaw = config.max_length || 0;
        const units = window.SYNIMA_STATE.syntenyScaleUnits || "auto";
        const intervals = parseInt(window.SYNIMA_STATE.syntenyScaleIntervals, 10) || 10;

        const { factor, label } = scaleUnitSpec(maxBpRaw, units);

        // if user provided a max, interpret it in chosen units (or auto-chosen units)
        let maxUnitsRaw = maxBpRaw / factor;
        const userMaxStr = String(window.SYNIMA_STATE.syntenyScaleMax ?? "").trim();
        const userMax = userMaxStr === "" ? NaN : Number(userMaxStr);
        if (isFinite(userMax) && userMax > 0) {
          maxUnitsRaw = userMax;
        }

        //const { maxNice, step } = computeNiceMax(maxUnitsRaw, intervals);
        let maxNice, step;

        if (Number.isFinite(userMax) && userMax > 0) {
          // obey user max exactly
          maxNice = userMax;
          step = maxNice / intervals; // exact steps
        } else {
          // auto “nice” max
          ({ maxNice, step } = computeNiceMax(maxUnitsRaw, intervals));
        }
        const maxBpNice = maxNice * factor;

        const xStart = layout.xStart;
        const pxLen = maxBpNice * layout.scaleX;

        // find bottom of plotted contigs so the bar sits underneath
        let maxY = 0;
        for (let i = 0; i < config.genomes.length; i++) {
          const y = yFor(config.genomes[i].name, i);
          if (y > maxY) maxY = y;
        }
        const plotBottom = maxY + trackHeight + 10;

        const axisY = plotBottom + 25;
        const tickH = 6;
        const axisFont = parseInt(window.SYNIMA_STATE.syntenyScaleAxisFont, 10) || 12;
        const labelFont = parseInt(window.SYNIMA_STATE.syntenyScaleLabelFont, 10) || axisFont;
        const labelText = (window.SYNIMA_STATE.syntenyScaleLabelText || "Position in genome").trim();

        const strokeCol = labelColor;
        //const strokeW = (typeof window.SYNIMA_LINE_WIDTH === "number") ? window.SYNIMA_LINE_WIDTH : 2;
        const axisLW = Number(window.SYNIMA_STATE.syntenyScaleLineWidth);
        const axisLineW = (Number.isFinite(axisLW) && axisLW > 0) ? axisLW : 1;

        let ticks = "";
        for (let i = 0; i <= intervals; i++) {
          const x = xStart + (pxLen * (i / intervals));
          const val = (step * i);
          ticks += `
            <line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + tickH}" stroke="${strokeCol}" stroke-width="${axisLineW}" />
            <text x="${x}" y="${axisY + tickH + axisFont + 2}" fill="${strokeCol}" font-size="${axisFont}" text-anchor="middle">${Number(val.toFixed(3))}</text>
          `;
        }

        const axisX2 = xStart + pxLen;
        const labelY = axisY + tickH + axisFont + 2 + labelFont + 8;
        const axisLabel = `${labelText} (${label})`;

        scaleBarSvg = `
          <g class="synteny-scale">
            <line x1="${xStart}" y1="${axisY}" x2="${axisX2}" y2="${axisY}" stroke="${strokeCol}" stroke-width="${axisLineW}" />
            ${ticks}
            <text x="${(xStart + axisX2) / 2}" y="${labelY}" fill="${strokeCol}" font-size="${labelFont}" text-anchor="middle">${escapeHtml(axisLabel)}</text>
          </g>
        `;

        extraBottom = (labelY + 12) - svgH; // svgH is your existing height; we will fix it next
        if (!isFinite(extraBottom) || extraBottom < 0) extraBottom = 0;
    }

    // bump svgH so the scale bar is visible
    svgH = Math.max(svgH, svgH + extraBottom);

    return `
        <svg width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="display:block;">
        ${polys}
        ${tracks}
        ${scaleBarSvg}
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

function svgRenderedPx(svgEl) {
  const r = svgEl.getBoundingClientRect();
  return { w: r.width || 0, h: r.height || 0 };
}

function parseViewBox(svgEl) {
  const vb = (svgEl.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some(n => Number.isNaN(n))) return { x: 0, y: 0, w: 1200, h: 600 };
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
}

function addGenomeLabelsToSyntenyExport(svgEl) {
  const { x: vbX, y: vbY, w: vbW, h: vbH } = parseViewBox(svgEl);

  const groups = Array.from(svgEl.querySelectorAll("g.synteny-ctg"));
  if (!groups.length) return;

  // pick a y position per genome (use first rect we see per genome)
  const byGenome = new Map();
  for (const g of groups) {
    const genome = g.getAttribute("data-genome");
    const r = g.querySelector("rect");
    if (!genome || !r) continue;

    const y = parseFloat(r.getAttribute("y"));
    const hh = parseFloat(r.getAttribute("height"));
    if (!Number.isFinite(y) || !Number.isFinite(hh)) continue;

    const yMid = y + hh / 2;
    if (!byGenome.has(genome)) byGenome.set(genome, yMid);
  }

  const entries = Array.from(byGenome.entries()).sort((a, b) => a[1] - b[1]);
  const maxLen = Math.max(...entries.map(([name]) => name.length), 10);

  const fontSize = 14;
  const fill = window.SYNIMA_STATE?.syntenyLabelColor || "#ffffff";

  // estimate label gutter
  const gutter = Math.max(120, Math.min(320, Math.round(maxLen * fontSize * 0.6 + 20)));

  // expand viewBox to the left
  const newX = vbX - gutter;
  const newW = vbW + gutter;
  svgEl.setAttribute("viewBox", `${newX} ${vbY} ${newW} ${vbH}`);

  const labelX = newX + 6;

  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  layer.setAttribute("class", "synteny-export-genome-labels");

  for (const [name, yMid] of entries) {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(labelX));
    t.setAttribute("y", String(yMid + fontSize * 0.35));
    t.setAttribute("fill", fill);
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-family", "sans-serif");
    t.setAttribute("text-anchor", "start");
    t.textContent = name;
    layer.appendChild(t);
  }

  // insert labels above background, below ribbons/rects is fine
  svgEl.insertBefore(layer, svgEl.firstChild);
}

function cloneSyntenySvgForExport(svgEl, opts = {}) {
    const clone = svgEl.cloneNode(true);

    // if your styling is CSS-driven, do this:
    inlineSvgComputedStyles(clone);

    // Background colour you use on-screen:
    const BG = window.SYNIMA_STATE?.syntenyBgColor || "#0f1b30";
    addSvgBackgroundRect(clone, BG);

    if (opts.includeGenomeLabels) {
        addGenomeLabelsToSyntenyExport(clone);
        // background rect needs to cover new viewBox (see fix to addSvgBackgroundRect below)
        addSvgBackgroundRect(clone, BG);
      }

    // Make exports print-friendly (optional).
    // Remove if you want “exactly as seen”.
    //clone.setAttribute("style", "background:#ffffff;");

    // Recolor white text/strokes to black so it exports clearly.
    //clone.querySelectorAll("text").forEach(t => t.setAttribute("fill", "black"));
    //clone.querySelectorAll("polygon, rect, line, path").forEach(el => {
    //    const s = el.getAttribute("stroke");
    //    if (s && (s === "#fff" || s === "#ffffff" || s === "white")) el.setAttribute("stroke", "black");
    //});

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
  const [minX, minY, vbW, vbH] = vb;

  // remove existing bg rect if you re-call this
  const old = svgEl.querySelector("rect.__synima_bg");
  if (old) old.remove();

  const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  r.setAttribute("class", "__synima_bg");
  r.setAttribute("x", String(minX));
  r.setAttribute("y", String(minY));
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

  //const clone = cloneSyntenySvgForExport(svgEl);
  const clone = cloneSyntenySvgForExport(svgEl, { includeGenomeLabels: true });
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

  //const clone = cloneSyntenySvgForExport(svgEl);
  const clone = cloneSyntenySvgForExport(svgEl, { includeGenomeLabels: true });

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

    // Background
    ctx.fillStyle = window.SYNIMA_STATE?.syntenyBgColor || "#0f1b30";
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
    //const synClone  = cloneSyntenySvgForExport(synSvg);
    const synClone  = cloneSyntenySvgForExport(synSvg, { includeGenomeLabels: false });

    const tWH = svgViewBoxWH(treeClone);
    const sWH = svgViewBoxWH(synClone);

    const tPx = svgRenderedPx(treeSvg);

    // Scale tree so its exported height matches what the layout used
    const targetTreeH = tPx.h || sWH.h || tWH.h;
    const treeScale = (tWH.h > 0) ? (targetTreeH / tWH.h) : 1;

    const treeDrawW = tWH.w * treeScale;
    const treeDrawH = targetTreeH;

    // Keep synteny at native size (includes scale bar)
    const synDrawW = sWH.w;
    const synDrawH = sWH.h;

    const GAP = 10;
    const outW = treeDrawW + GAP + synDrawW;
    const outH = Math.max(treeDrawH, synDrawH);

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

        const canvas = document.createElement("canvas");
        canvas.width = outW * SCALE;
        canvas.height = outH * SCALE;

        const ctx = canvas.getContext("2d");

        // scale first so everything below uses "SVG units"
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

        // Background colour
        ctx.fillStyle = window.SYNIMA_STATE?.syntenyBgColor || "#0f1b30";
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
  const BG = window.SYNIMA_STATE?.syntenyBgColor || "#0f1b30";         // same as panel background

  // Clone originals
  const treeClone = treeSvg.cloneNode(true);
  //const synClone  = cloneSyntenySvgForExport(synSvg);
  const synClone  = cloneSyntenySvgForExport(synSvg, { includeGenomeLabels: false });

  // Ensure viewBox exists and get dimensions
  const tWH = svgViewBoxWH(treeClone);
  const sWH = svgViewBoxWH(synClone);

    const tPx = svgRenderedPx(treeSvg);
    const targetTreeH = tPx.h || sWH.h || tWH.h;

    const treeScale = (tWH.h > 0) ? (targetTreeH / tWH.h) : 1;
    const treeDrawW = tWH.w * treeScale;
    const treeDrawH = targetTreeH;

    const outW = treeDrawW + GAP + sWH.w;
    const outH = Math.max(treeDrawH, sWH.h);

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
  //gTree.setAttribute("transform", `translate(0 0)`);
  gTree.setAttribute("transform", `translate(0 0) scale(${treeScale})`);
  // move children (not the outer <svg>) into the group
  while (treeClone.childNodes.length) gTree.appendChild(treeClone.childNodes[0]);
  wrapper.appendChild(gTree);

  // Put synteny inside a <g> and translate + scale it
  const gSyn = document.createElementNS(ns, "g");
  gSyn.setAttribute("transform", `translate(${treeDrawW + GAP} 0)`);
  //gSyn.setAttribute("transform", `translate(${tWH.w + GAP} 0)`);
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
function eventPathHasId(e, id) {
  if (typeof e.composedPath === "function") {
    return e.composedPath().some(n => n && n.id === id);
  }
  // fallback
  return !!(e.target && e.target.closest && e.target.closest(`#${id}`));
}

if (!SYNIMA._syntenyOutsideClickBound) {
  SYNIMA._syntenyOutsideClickBound = true;

  document.addEventListener("click", (e) => {
    if (e.target.closest("#synteny-contig-editor")) return;
    if (e.target.closest("#synteny-plot")) return;
    if (!window.SYNIMA_STATE?.selectedContigKey) return;

    // IMPORTANT: treat clicks in the plot OR in the editor as "inside"
    const inPlot = eventPathHasId(e, "synteny-plot");
    const inEditor = eventPathHasId(e, "synteny-contig-editor");
    if (inPlot || inEditor) return;

    window.SYNIMA_STATE.selectedContigKey = null;

    const editorEl = document.getElementById("synteny-contig-editor");
    if (editorEl) editorEl.classList.add("hidden");

    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
  });
}

window.addEventListener("resize", () => {
  if (window.SYNIMA && SYNIMA.currentPage === "synteny") {
    //SYNIMA.showSynteny();
    if (SYNIMA._syntenyRerender) SYNIMA._syntenyRerender();
  }
});
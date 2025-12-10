window.SYNIMA = window.SYNIMA || {};

let SYNIMA_ALIGN_LABELS = true;

let SYNIMA_TREES = {
  original: null,
  current: null
};

SYNIMA_TAXON_NAMES = {}; // mapping oldName → newName
SYNIMA.selectedLabelName = null;   // currently selected displayed name
let SYNIMA_LINE_WIDTH = 2;   // default stroke width
let SYNIMA_FONT_SIZE = 14;   // default tip label font-size

const SYNIMA_PERSIST_KEYS = {
  names: "synima_tree_renames",
  lineWidth: "synima_tree_line_width",
  fontSize: "synima_tree_font_size",
  alignLabels: "synima_tree_align_labels",
  rootTip: "synima_tree_root_tip"
};

// Apply stored renames to a cloned tree
function applyRenamedTaxa(node) {
  if (node.origName && SYNIMA_TAXON_NAMES[node.origName]) {
    node.name = SYNIMA_TAXON_NAMES[node.origName];
  }
  if (node.children) node.children.forEach(applyRenamedTaxa);
}

// Record original names once after parsing
function setOriginalNames(node) {
  node.origName = node.name || null;
  if (node.children) node.children.forEach(setOriginalNames);
}

// Remove NEXUS wrappers and BEAST metadata, return pure Newick
function extractNewick(raw) {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();

  // CASE 1: Plain Newick (starts with "(" and ends with ";")
  if (s.startsWith("(") && s.includes(";")) {
    // Remove BEAST-style metadata: [&label=...]
    s = s.replace(/\[\&[^\]]*\]/g, "");
    return s;
  }

  // CASE 2: NEXUS format
  const lower = s.toLowerCase();

  // Find "begin trees"
  let treesStart = lower.indexOf("begin trees");
  if (treesStart === -1) {
    // Not NEXUS and not plain Newick
    console.warn("extractNewick: Not Newick or NEXUS:", raw.slice(0, 100));
    return null;
  }

  // Trim to trees section
  s = s.slice(treesStart);

  // Find line matching: tree NAME = <newick>
  const treeMatch = s.match(/tree[^=]*=\s*(.*)/i);
  if (!treeMatch) {
    console.warn("extractNewick: NEXUS found but no 'tree =' line");
    return null;
  }

  let newick = treeMatch[1];

  // Remove BEAST metadata [&something]
  newick = newick.replace(/\[\&[^\]]*\]/g, "");

  // Keep only up to final semicolon
  let semi = newick.indexOf(";");
  if (semi !== -1) {
    newick = newick.slice(0, semi + 1);
  }

  // Ensure it starts at the first "("
  let firstParen = newick.indexOf("(");
  if (firstParen !== -1) {
    newick = newick.slice(firstParen);
  }

  return newick.trim();
}

// Newick parsing
function parseNewick(s) {
  let ancestors = [];
  let tree = {};
  let tokens = s.trim().split(/\s*(;|\(|\)|,|:)\s*/);
  let node = tree;
  let expectingLength = false;

  for (let token of tokens) {
    if (!token) continue;

    if (token === "(") {
      let newNode = {};
      newNode.children = [];
      node.children = node.children || [];
      node.children.push(newNode);
      ancestors.push(node);
      node = newNode;
      expectingLength = false;
    }

    else if (token === ",") {
      let parent = ancestors[ancestors.length - 1];
      let newNode = {};
      newNode.children = [];
      parent.children.push(newNode);
      node = newNode;
      expectingLength = false;
    }

    else if (token === ")") {
      node = ancestors.pop();
      expectingLength = false;
    }

    else if (token === ":") {
      expectingLength = true;
    }

    else if (token === ";") {
      break;
    }

    else {
      if (expectingLength) {
        node.length = parseFloat(token) || 0;
        expectingLength = false;
      } else {
        node.name = token;
      }
    }
  }

  // Remove top-level wrapper
  if (tree.children && tree.children.length === 1 && !tree.name) {
    tree = tree.children[0];
  }

  return tree;
}

function cloneTree(node) {
  return {
    name: node.name,
    origName: node.origName,
    length: node.length,
    children: (node.children || []).map(child => cloneTree(child))
  };
}

// Basic phylogram layout
function layoutTree(root) {
  // collect leaves
  let leaves = [];
  function collectLeaves(node) {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
    } else {
      node.children.forEach(collectLeaves);
    }
  }
  collectLeaves(root);

  // Y positions (even)
  leaves.forEach((leaf, i) => {
    leaf.y = i * 30;
  });

  // internal Y = midpoint of children
  function setInternalY(node) {
    if (!node.children || node.children.length === 0) return node.y;
    let ys = node.children.map(setInternalY);
    node.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    return node.y;
  }
  setInternalY(root);

  // X = cumulative branch length
  function setX(node, parentX) {
    node.x = parentX + (node.length || 0);
    if (node.children) node.children.forEach(c => setX(c, node.x));
  }
  setX(root, 0);

  return root;
}

// Label click handlers (select / deselect / enable annotate)
SYNIMA.attachLabelClickHandlers = function(root) {

  const labels = document.querySelectorAll(".tree-label-text");

  labels.forEach(el => {
    el.addEventListener("click", (evt) => {
      evt.stopPropagation(); // don't trigger background deselect

      const name = el.getAttribute("data-tip-name");

      // Toggle off if clicking same taxon again
      if (SYNIMA.selectedLabelName === name) {
          SYNIMA.selectedLabelName = null;
          el.classList.remove("tree-label-selected");
          const ann = document.getElementById("annotate-btn");
          if (ann) ann.disabled = true;
          return;
      }

      // Remove highlight from others
      document.querySelectorAll(".tree-label-text")
        .forEach(n => n.classList.remove("tree-label-selected"));

      // Highlight this one
      el.classList.add("tree-label-selected");

      // record selected name
      SYNIMA.selectedLabelName = name; // store globally

      // >>> ENABLE ANNOTATE BUTTON HERE <<<
      const annBtn = document.getElementById("annotate-btn");
      if (annBtn) annBtn.disabled = false;

      console.log("Selected taxon:", name);
    });
  });
};

// SVG rendering
function renderTreeSvg(root, containerId, opts={}) {
  const isMini = opts.mini || false;

  console.log(">>> RENDER START, tree:", JSON.stringify(root));

  // Ensure dropdown closes when tree is re-rendered
  const dd = document.getElementById("annotate-dropdown");
  if (dd) dd.classList.add("hidden");

  // Layout the tree (x = branch length, y = vertical spacing)
  layoutTree(root);

  // gather nodes
  let allNodes = [];
  (function walk(n) {
    allNodes.push(n);
    if (n.children) n.children.forEach(walk);
  })(root);

  // Expand vertical scale for mini tree BEFORE computing height
  if (isMini) {
      allNodes.forEach(n => {
          n.y *= 4;    // or 5 if you prefer your previous spacing
      });
  }

  let maxX = Math.max(...allNodes.map(n => n.x));
  let maxY = Math.max(...allNodes.map(n => n.y));

  // Horizontal scaling
  let scaleX = isMini ? 250 / (maxX || 1) : 500 / (maxX || 1);
  let offsetX = isMini ? 10 : 20;
  let offsetY = isMini ? 40 : 20;

  let lines = [];
  let labels = [];
  let leaderLines = [];

  function drawBranches(node) {
    if (!node.children || node.children.length === 0) return;
    node.children.forEach(child => {
      let x1 = offsetX + node.x * scaleX;
      let y1 = offsetY + node.y;

      let x2 = offsetX + child.x * scaleX;
      let y2 = offsetY + child.y;

      // Vertical segment
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="white" stroke-width="${SYNIMA_LINE_WIDTH}" style="stroke-width:${SYNIMA_LINE_WIDTH}px;" />`);
      // Horizontal segment
      lines.push(`<line x1="${x1}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="${SYNIMA_LINE_WIDTH}" style="stroke-width:${SYNIMA_LINE_WIDTH}px;" />`);

      drawBranches(child);
    });
  }
  drawBranches(root);

  function drawLabels(node) {
    if (node.name && !/^[0-9.]+$/.test(node.name)) {

      // Y-position is always the same
      let y = offsetY + node.y + 5;

      // Label X-position depends on alignment mode
      let x;
      if (SYNIMA_ALIGN_LABELS) {

        // space between branch tip and dotted line
        //const LEADER_GAP = 6;
        const LEADER_GAP = isMini ? 3 : 6;

        // Pixel coordinates
        let tipX   = offsetX + node.x * scaleX;
        let leaderStartX = tipX + LEADER_GAP;
        //let labelX = offsetX + (maxX * scaleX) + 10;
        let labelX = offsetX + (maxX * scaleX) + (isMini ? 5 : 10);

        // Dotted leader (stop right before the label)
        leaderLines.push(`
          <line x1="${leaderStartX}" y1="${offsetY + node.y}"
                x2="${labelX - 5}" y2="${offsetY + node.y}"
                stroke="white"
                stroke-width="1"
                stroke-dasharray="3,3" />
        `);

        // Label is still positioned at labelX
        x = labelX;

      } else {
        // Natural position at tip
        x = offsetX + node.x * scaleX + 5;
      }

      // label too big?
      let displayName = node.name;
      if (isMini && displayName.length > 20) {
          displayName = displayName.slice(0, 17) + "...";
      }

      // Boost font size in mini trees
      const effectiveFontSize = isMini ? SYNIMA_FONT_SIZE * 2 : SYNIMA_FONT_SIZE;

      // old font-size = font-size="${isMini ? SYNIMA_FONT_SIZE * 0.8 : SYNIMA_FONT_SIZE}" 
      labels.push(
        `<text class="tree-label-text"
           data-tip-name="${node.name}"
           x="${x}" y="${y}"
           fill="white" 
           font-size="${effectiveFontSize}"
           font-family="sans-serif">
            ${displayName}
         </text>`
      );


    }
    if (node.children) node.children.forEach(drawLabels);
  }
  drawLabels(root);

  // Scale bar based on tree length
  let scaleLen = maxX * 0.2;
  let rounded = Number(scaleLen.toFixed(3)); // e.g. 0.00593 → 0.006

  let scalePxStart = offsetX;
  let scalePxEnd = offsetX + scaleLen * scaleX;
  let scalePxMid = (scalePxStart + scalePxEnd) / 2;

  // Build scale bar SVG
  let scaleBar = `
    <line x1="${scalePxStart}" y1="${maxY + offsetY + 40}"
          x2="${scalePxEnd}"   y2="${maxY + offsetY + 40}"
          stroke="white" stroke-width="2" />

    <text x="${scalePxMid}" y="${maxY + offsetY + 60}"
          class="tree-label"
          text-anchor="middle">${rounded}</text>
  `;

  // Overall SVG dimensions in user space
  let width = isMini ? (offsetX + maxX * scaleX + 100) : 650;
  let height = maxY + 100;

  let preserve = "xMinYMin meet";
  let svgWidthAttr = width;
  let svgHeightAttr = height;

  if (isMini) {
      preserve = "none"; 
      svgWidthAttr = "100%";    // but maintain full height
      svgHeightAttr = height;   // full natural height
  }

  //let svg = `<svg class="tree-svg" viewBox="0 0 ${width} ${height}">
  let svg = `<svg class="tree-svg" width="${svgWidthAttr}" height="${svgHeightAttr}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${preserve}">
      <g class="tree-lines">${lines.join("\n")}</g>
      <g class="tree-leaders">${leaderLines.join("\n")}</g>
      <g class="tree-labels">${labels.join("\n")}</g>
      <g class="tree-scale">${scaleBar}</g>
    </svg>
  `;

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn("renderTreeSvg: no container with id", containerId);
    return;
  }
  container.innerHTML = svg;

  // Background click to clear selection
  const svgEl = container.querySelector("svg");
  if (svgEl) {
    svgEl.addEventListener("click", (e) => {
      // Ignore clicks on labels (handled in label handler)
      if (e.target.tagName.toLowerCase() === "text") return;

      SYNIMA.selectedLabelName = null;
      document.querySelectorAll(".tree-label-text")
        .forEach(n => n.classList.remove("tree-label-selected"));

      const ann = document.getElementById("annotate-btn");
      if (ann) ann.disabled = true;
    });
  }

  if (!isMini) {
    SYNIMA.attachLabelClickHandlers(root);
  }

}

// Get tip names (current displayed labels)
SYNIMA.getTipNames = function(root) {
  let out = [];
  (function walk(n) {
    if (!n.children || n.children.length === 0) {
      if (n.name) out.push(n.name);
    } else {
      n.children.forEach(walk);
    }
  })(root);
  return out;
};

// Root-by-tip dropdown builder
SYNIMA.buildRootByTipDropdown = function () {
  const controls = document.querySelector(".tree-controls");
  if (!controls || !SYNIMA_TREES.current) return;

  // Remove existing dropdown + button if any
  const oldSelect = document.getElementById("tip-root-select");
  if (oldSelect && oldSelect.parentElement) {
    oldSelect.parentElement.remove(); // removes label wrapper
  }
  const oldBtn = document.getElementById("apply-tip-root");
  if (oldBtn) oldBtn.remove();

  const tips = SYNIMA.getTipNames(SYNIMA_TREES.current);
  if (!tips || tips.length === 0) return;

  let dropdownHtml = `
    <label style="margin-left: 10px;">
      Root by tip:
      <select id="tip-root-select">
        <option value="">Select…</option>
        ${tips.map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </label>
    <button id="apply-tip-root">Apply</button>
  `;

  controls.insertAdjacentHTML("beforeend", dropdownHtml);

  const btn = document.getElementById("apply-tip-root");
  if (btn) {
    btn.addEventListener("click", () => {
      const chosen = document.getElementById("tip-root-select").value;
      if (chosen) SYNIMA.rootByTip(chosen);
    });
  }
};

// Modal-based rename
SYNIMA.applyRename = function (oldDisplayedName, newName) {
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed) return;

  // detect duplicates
  const allNames = SYNIMA.getTipNames(SYNIMA_TREES.current);
  if (allNames.includes(trimmed) && trimmed !== oldDisplayedName) {
    alert("Name already exists. Choose a unique name.");
    return;
  }

  function replace(node) {
    if (!node.children || node.children.length === 0) {
      if (node.name === oldDisplayedName) {
        if (!node.origName) node.origName = node.name;
        SYNIMA_TAXON_NAMES[node.origName] = trimmed;
        node.name = trimmed;
      }
    }
    if (node.children) node.children.forEach(replace);
  }

  // apply to current
  replace(SYNIMA_TREES.current);

  // PERSIST THE RENAME MAP
  localStorage.setItem(SYNIMA_PERSIST_KEYS.names, JSON.stringify(SYNIMA_TAXON_NAMES));

  renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  SYNIMA.buildRootByTipDropdown();
};

// rename taxa (entry point from button)
SYNIMA.renameSelectedTaxon = function () {
  const oldName = SYNIMA.selectedLabelName;
  if (!oldName) return;

  const dd = document.getElementById("annotate-dropdown");
  const input = document.getElementById("rename-input");
  const apply = document.getElementById("rename-apply");
  const cancel = document.getElementById("rename-cancel");

  // Position dropdown just under the Annotate button
  const btn = document.getElementById("annotate-btn");
  const rect = btn.getBoundingClientRect();
  dd.style.position = "absolute";
  dd.style.left = rect.left + "px";
  dd.style.top = rect.bottom + window.scrollY + "px";

  // Populate input with old name
  input.value = oldName;
  dd.classList.remove("hidden");

  // Close helper
  function close() {
    dd.classList.add("hidden");
    apply.removeEventListener("click", onApply);
    cancel.removeEventListener("click", onCancel);
    document.removeEventListener("click", onClickAway);
  }

  function onApply() {
    SYNIMA.applyRename(oldName, input.value.trim());
    close();
  }

  function onCancel() {
    close();
  }

  // Close if clicking outside dropdown
  function onClickAway(ev) {
    if (!dd.contains(ev.target) && ev.target !== btn) {
      close();
    }
  }

  apply.addEventListener("click", onApply);
  cancel.addEventListener("click", onCancel);
  setTimeout(() => document.addEventListener("click", onClickAway), 50);

  input.focus();
  input.select();
};

// Root by selection (Figtree-style)
SYNIMA.rootByTip = function (tipName, skipRender = false) {

  // Clone original tree always
  let root = cloneTree(SYNIMA_TREES.original);
  applyRenamedTaxa(root);

  // Parent pointers
  function addParents(n, parent = null) {
    n.parent = parent;
    if (n.children) n.children.forEach(c => addParents(c, n));
  }
  addParents(root);

  function stripParents(n) {
    delete n.parent;
    if (n.children) n.children.forEach(stripParents);
  }

  function findNode(n, name) {
    if (n.name === name) return n;
    if (!n.children) return null;
    for (let c of n.children) {
      const found = findNode(c, name);
      if (found) return found;
    }
    return null;
  }

  function pathToRoot(n) {
    let out = [];
    while (n) { out.push(n); n = n.parent; }
    return out;
  }

  function flipEdge(parent, child) {
    parent.children = parent.children.filter(c => c !== child);

    const down = child.length || 0;
    const up   = parent.length || 0;

    child.children = child.children || [];
    child.children.push(parent);

    parent.length = down;
    child.length = up;
  }

  // 1. Locate the chosen tip
  const tip = findNode(root, tipName);
  if (!tip) {
    console.warn("Tip not found:", tipName);
    return;
  }

  const originalTipLength = tip.length || 0;

  const path = pathToRoot(tip);

  // Flip edges until tip’s parent is the global root
  for (let i = 1; i < path.length - 1; i++) {
    const child  = path[i];
    const parent = path[i + 1];
    flipEdge(parent, child);
  }

  // After flipping: tip.parent is the top clade root
  const oldParent = tip.parent;

  // Remove tip from oldParent’s children to avoid duplicates
  oldParent.children = oldParent.children.filter(c => c !== tip);

  // Build new root (bifurcating)
  tip.length = originalTipLength;   // Preserve original branch length
  oldParent.length = 0;             // branch from new root to clade

  const newRoot = {
    length: 0,
    children: [ tip, oldParent ]
  };

  stripParents(newRoot);

  SYNIMA_TREES.current = newRoot;
  localStorage.setItem(SYNIMA_PERSIST_KEYS.rootTip, tipName);
  if (!skipRender) {
    renderTreeSvg(newRoot, "tree-view-0");
  }
};

// =============================================================
// GLOBAL TREE INITIALISATION (used by Tree tab AND Synteny tab)
// =============================================================
window.SYNIMA_TREES = window.SYNIMA_TREES || {};

(function initGlobalTree() {
  try {
    const scriptEl = document.getElementById("data-tree");
    if (!scriptEl || !scriptEl.textContent.trim()) {
      console.warn("No data-tree JSON found for global tree init");
      return;
    }

    const data = JSON.parse(scriptEl.textContent);
    if (!data.trees || data.trees.length === 0) {
      console.warn("No trees in data-tree JSON");
      return;
    }

    const treeItem = data.trees[0];
    const newickRaw = treeItem.newick || "";
    const newick = extractNewick(newickRaw);

    const parsed = parseNewick(newick);
    setOriginalNames(parsed);

    // initialise originals
    SYNIMA_TREES.original = cloneTree(parsed);
    SYNIMA_TREES.current  = cloneTree(parsed);

    // restore settings
    const savedNames = localStorage.getItem(SYNIMA_PERSIST_KEYS.names);
    if (savedNames) {
      SYNIMA_TAXON_NAMES = JSON.parse(savedNames);
      applyRenamedTaxa(SYNIMA_TREES.current);
    }

    const savedLW = localStorage.getItem(SYNIMA_PERSIST_KEYS.lineWidth);
    if (savedLW !== null) {
      SYNIMA_LINE_WIDTH = parseInt(savedLW, 10);
    }

    const savedFS = localStorage.getItem(SYNIMA_PERSIST_KEYS.fontSize);
    if (savedFS !== null) {
      SYNIMA_FONT_SIZE = parseInt(savedFS, 10);
    }

    const savedAlign = localStorage.getItem(SYNIMA_PERSIST_KEYS.alignLabels);
    if (savedAlign !== null) {
      SYNIMA_ALIGN_LABELS = (savedAlign === "true");
    }

    const savedRoot = localStorage.getItem(SYNIMA_PERSIST_KEYS.rootTip);
    if (savedRoot) {
      SYNIMA.rootByTip(savedRoot, true);   // compute root, but DO NOT render yet
    }

    //console.log("Global tree initialised:", SYNIMA_TREES);

  } catch (err) {
    console.error("Global tree initialization failed", err);
  }
})();

// Page function
SYNIMA.showTree = function () {
  const app = document.getElementById("app");
  const scriptEl = document.getElementById("data-tree");

  let data = { trees: [] };
  if (scriptEl && scriptEl.textContent.trim()) {
    try {
      data = JSON.parse(scriptEl.textContent);
    } catch (e) {
      console.error("Failed to parse data-tree JSON", e);
    }
  }

  if (!data.trees || data.trees.length === 0) {
    app.innerHTML = `<h1>Phylogenetic Tree</h1><p>No tree detected.</p>`;
    return;
  }

  const treeItem = data.trees[0];

  // Format sequence type
  function formatSequenceTypeTree(code) {
    if (code === "cds") return "Coding sequences (CDS)";
    if (code === "pep") return "Peptide sequences (PEP)";
    return code;
  }

  // Orthology tool name mapping
  function formatOrthoToolTree(method) {
    if (method === "orthomcl") return "OrthoMCL";
    if (method === "rbh") return "Reciprocal Best Hits (RBH)";
    if (method === "orthofinder") return "OrthoFinder";
    return method;
  }

  const seqType  = formatSequenceTypeTree(treeItem.alignment);
  const orthoTool = formatOrthoToolTree(treeItem.method);
  let newickRaw = treeItem.newick || "";
  let newick = extractNewick(newickRaw);

  if (!newick) {
    console.error("Could not extract Newick from input", newickRaw);
    app.innerHTML = "<p>Could not extract Newick tree.</p>";
    return;
  }

  // --- PAGE HTML ---
  let html = `
    <h1>Phylogenetic Tree</h1>

    <div class="section">
      <h2>Tree Inference Parameters</h2>
      <table class="param-table">
        <tr><th>Sequence type</th><td>${seqType}</td></tr>
        <tr><th>Orthology tool</th><td>${orthoTool}</td></tr>
        <tr><th>Multiple alignment</th><td>MUSCLE v5</td></tr>
        <tr><th>Tree builder</th><td>FastTree</td></tr>
        <tr><th>Tree file</th><td>${treeItem.file_name}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Newick Tree</h2>
      <pre id="newick-text" class="newick-block"></pre>
      <button id="copy-newick-btn" class="copy-btn">Copy Newick</button>
    </div>

    <div class="section">

  <div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:6px;">
    <h2 style="margin:0;">Tree Visualisation</h2>

    <div style="position:relative; display:inline-block;">
      <button id="download-btn" style="padding:2px 6px; margin:0;">
        Download ▾
      </button>

      <div id="download-dropdown"
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
             width:120px;
           ">
        <button id="download-svg"
          style="display:block; width:100%; text-align:left; padding:4px 8px;
                 border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          SVG
        </button>

        <button id="download-png"
          style="display:block; width:100%; text-align:left; padding:4px 8px;
                 border:none; background:none; cursor:pointer;"
          onmouseover="this.style.background='#e5e5e5'"
          onmouseout="this.style.background='none'">
          PNG
        </button>
      </div>
    </div>
  </div>

  <div id="tree-view-0" class="tree-view"></div>
</div>

    <div class="tree-controls">
      <!--<button disabled title="Midpoint rooting coming soon">Midpoint root (coming soon)</button>-->
      <!--<button disabled title="Tip rooting coming soon">Root by tip (coming soon)</button>-->
      
      <button onclick="SYNIMA.resetRoot()">Reset tree</button>

      <label>
          <input type="checkbox" id="align-labels-checkbox" />
          Align tip labels
      </label>

      
    <label style="margin-left: 10px;">
      Line width:
      <select id="line-width-select">
        <option value="1">1</option>
        <option value="2" selected>2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
      </select>
    </label>


    <label style="margin-left: 10px;">
      Font size:
      <select id="font-size-select">
        <option value="10">10</option>
        <option value="12">12</option>
        <option value="14" selected>14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
      </select>
    </label>


      <button id="annotate-btn" disabled>Annotate</button>
      <div id="annotate-dropdown" 
         class="hidden absolute bg-white text-black border rounded shadow p-2 z-50"
         style="margin-top: 4px; width: 180px;">
      <input id="rename-input" type="text" 
             class="border p-1 w-full mb-2" placeholder="New name…">
      <div class="flex justify-end gap-2">
        <button id="rename-cancel">Cancel</button>
        <button id="rename-apply" class="font-bold">Apply</button>
      </div>
    </div>


    </div>

    <div id="tip-root-dialog" class="tip-dialog hidden"></div>
  `;

  app.innerHTML = html;

  // DOWNLOAD DROPDOWN LOGIC
  const downloadBtn = document.getElementById("download-btn");
  const downloadMenu = document.getElementById("download-dropdown");

  downloadBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    downloadMenu.classList.toggle("hidden");
  });

  // Clicking SVG option
  document.getElementById("download-svg").addEventListener("click", () => {
    downloadMenu.classList.add("hidden");
    SYNIMA.exportSvg();
  });

  // Clicking PNG option
  document.getElementById("download-png").addEventListener("click", () => {
    downloadMenu.classList.add("hidden");
    SYNIMA.exportPng();
  });

  // Close on outside click
  document.addEventListener("click", () => {
    downloadMenu.classList.add("hidden");
  });

  // Enable aligned labels by default
  SYNIMA_ALIGN_LABELS = true;

  const chk = document.getElementById("align-labels-checkbox");
  if (chk) chk.checked = true;

  // allow taxa to be selected
  document.getElementById("annotate-btn").addEventListener("click", () => {
    SYNIMA.renameSelectedTaxon();
  });

  // adjust line width
  const lwSelect = document.getElementById("line-width-select");
  lwSelect.addEventListener("change", () => {
    SYNIMA_LINE_WIDTH = parseInt(lwSelect.value, 10);
    localStorage.setItem(SYNIMA_PERSIST_KEYS.lineWidth, SYNIMA_LINE_WIDTH);
    renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  });

  // adjust font size
  const fsSelect = document.getElementById("font-size-select");
  fsSelect.addEventListener("change", () => {
    SYNIMA_FONT_SIZE = parseInt(fsSelect.value, 10);
    localStorage.setItem(SYNIMA_PERSIST_KEYS.fontSize, SYNIMA_FONT_SIZE);  
    renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  });


  // Fill Newick block safely
  const preEl = document.getElementById("newick-text");
  if (preEl) preEl.textContent = newick;

  // Copy Newick
  const copyBtn = document.getElementById("copy-newick-btn");
  if (copyBtn && navigator.clipboard) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(newick).catch(err =>
        console.warn("Failed to copy Newick:", err)
      );
    });
  }

  // Parse + draw tree
  try {

    // The tree is already initialized globally.
    // Just render the current state.
    applyRenamedTaxa(SYNIMA_TREES.current);
    renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");

    // new code for rooting:
    // Insert "root by tip" dropdown once tree is rendered
    const tips = SYNIMA.getTipNames(SYNIMA_TREES.current);

    let dropdownHtml = `
      <label style="margin-left: 10px;">
        Root by tip:
        <select id="tip-root-select">
          <option value="">Select…</option>
          ${tips.map(t => `<option value="${t}">${t}</option>`).join("")}
        </select>
      </label>
      <button id="apply-tip-root">Apply</button>
    `;

    document.querySelector(".tree-controls").insertAdjacentHTML("beforeend", dropdownHtml);

    document.getElementById("apply-tip-root").addEventListener("click", () => {
      const chosen = document.getElementById("tip-root-select").value;
      if (chosen) SYNIMA.rootByTip(chosen);
    });
  
  } catch (e) {
    console.error("Failed to parse or render tree", e);
    document.getElementById("tree-view-0").innerHTML =
      "<p>Could not render tree.</p>";
  }

  document.getElementById("align-labels-checkbox").addEventListener("change", e => {
    SYNIMA_ALIGN_LABELS = e.target.checked;
    localStorage.setItem(SYNIMA_PERSIST_KEYS.alignLabels, SYNIMA_ALIGN_LABELS);
    if (SYNIMA_TREES.current) {
      renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
    }
  });

};

SYNIMA.midpointRoot = function () {
  console.log("=== MIDPOINT ROOT: STAGE 1 ===");

  const root = SYNIMA_TREES.original
    ? cloneTree(SYNIMA_TREES.original)
    : null;

  if (!root) {
    console.warn("No tree loaded.");
    return;
  }

  // --- 1. Compute depths and parent pointers ---
  function addParents(node, parent = null, depth = 0) {
    node.parent = parent;
    node.depth = depth;
    if (node.children) {
      node.children.forEach(child =>
        addParents(child, node, depth + (child.length || 0))
      );
    }
  }
  addParents(root);

  // --- 2. Collect leaves ---
  let leaves = [];
  (function gather(n) {
    if (!n.children || n.children.length === 0) leaves.push(n);
    else n.children.forEach(gather);
  })(root);

  console.log("Leaves:");
  leaves.forEach(l => {
    console.log(`  ${l.name}: depth ${l.depth}`);
  });

  // --- 3. LCA helper ---
  function lca(a, b) {
    let visited = new Set();
    let x = a;
    while (x) {
      visited.add(x);
      x = x.parent;
    }
    x = b;
    while (x) {
      if (visited.has(x)) return x;
      x = x.parent;
    }
    return null;
  }

  // --- 4. Compute farthest leaf pair ---
  let bestA = null;
  let bestB = null;
  let bestDist = -1;

  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      let A = leaves[i];
      let B = leaves[j];
      let L = lca(A, B);
      let dist = A.depth + B.depth - 2 * (L ? L.depth : 0);

      if (dist > bestDist) {
        bestDist = dist;
        bestA = A;
        bestB = B;
      }
    }
  }

  console.log(`Farthest pair: ${bestA.name} – ${bestB.name}`);
  console.log(`Distance: ${bestDist}`);
  console.log(`Midpoint target from ${bestA.name}: ${bestDist / 2}`);

  console.log("=== END OF STAGE 1 ===");


  console.log("=== MIDPOINT ROOT: STAGE 2 (path reconstruction) ===");

  // Helper: path from node to root
  function pathToRoot(n) {
    let out = [];
    while (n) {
      out.push(n);
      n = n.parent;
    }
    return out;
  }

  let pathA = pathToRoot(bestA);  // CA1280 → root
  let pathB = pathToRoot(bestB);  // CNB2 → root

  // Find LCA again
  let mapA = new Map();
  pathA.forEach((n, i) => mapA.set(n, i));

  let lcaNode = null;
  let idxA = -1;
  let idxB = -1;

  for (let j = 0; j < pathB.length; j++) {
    let n = pathB[j];
    if (mapA.has(n)) {
      lcaNode = n;
      idxA = mapA.get(n);
      idxB = j;
      break;
    }
  }

  console.log("LCA node:", lcaNode.name || "(internal)");

  // Build explicit path A → LCA → B
  let path = [];

  // A → ... → LCA
  for (let i = 0; i <= idxA; i++) {
    path.push(pathA[i]);
  }

  // from LCA back down to B (excluding LCA)
  for (let j = idxB - 1; j >= 0; j--) {
    path.push(pathB[j]);
  }

  console.log("Path from A to B:");
  for (let i = 0; i < path.length; i++) {
    let n = path[i];
    console.log(`  ${i}. ${n.name || "(internal)"} depth=${n.depth}`);
  }

  console.log("=== END STAGE 2 ===");

};

SYNIMA.resetRoot = function () {
  if (!SYNIMA_TREES.original) {
    console.warn("resetRoot: No original tree stored.");
    return;
  }

  // reset line widths
  SYNIMA_LINE_WIDTH = 2;
  const lwSelect = document.getElementById("line-width-select");
  if (lwSelect) lwSelect.value = "2";

  // reset font size
  SYNIMA_FONT_SIZE = 14;
  const fsSelect = document.getElementById("font-size-select");
  if (fsSelect) fsSelect.value = "14";

  // Reset renames
  SYNIMA_TAXON_NAMES = {};
  SYNIMA.selectedLabelName = null;

  // hide dropdown if open
  const dd = document.getElementById("annotate-dropdown");
  if (dd) dd.classList.add("hidden");

  // Default: labels aligned
  SYNIMA_ALIGN_LABELS = true;
  const chk = document.getElementById("align-labels-checkbox");
  if (chk) chk.checked = true;

  // Clear saved state
  localStorage.removeItem(SYNIMA_PERSIST_KEYS.names);
  localStorage.removeItem(SYNIMA_PERSIST_KEYS.lineWidth);
  localStorage.removeItem(SYNIMA_PERSIST_KEYS.fontSize);
  localStorage.removeItem(SYNIMA_PERSIST_KEYS.alignLabels);
  localStorage.removeItem(SYNIMA_PERSIST_KEYS.rootTip);

  // Reset globals
  SYNIMA_TAXON_NAMES = {};
  SYNIMA_LINE_WIDTH = 2;
  SYNIMA_FONT_SIZE = 14;
  SYNIMA_ALIGN_LABELS = true;

  // Update dropdown UI controls
  document.getElementById("line-width-select").value = "2";
  document.getElementById("font-size-select").value = "14";
  document.getElementById("align-labels-checkbox").checked = true;

  // clone pristine original
  SYNIMA_TREES.current = cloneTree(SYNIMA_TREES.original);

  // redraw
  renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  SYNIMA.buildRootByTipDropdown();

  console.log("Tree reset to original unrooted version.");
};

SYNIMA.exportSvg = function () {
  const svgEl = document.querySelector("#tree-view-0 svg");
  if (!svgEl) return;

  // Clone the SVG so we don’t touch on-screen version
  const clone = svgEl.cloneNode(true);

  // Convert all white strokes/fills to black
  clone.querySelectorAll("line").forEach(line => {
    line.setAttribute("stroke", "black");
  });

  clone.querySelectorAll("text").forEach(txt => {
    txt.setAttribute("fill", "black");
  });

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "synima_tree.svg";
  a.click();

  URL.revokeObjectURL(url);
};

SYNIMA.exportPng = function () {
  const svgEl = document.querySelector("#tree-view-0 svg");
  if (!svgEl) return;

  // Clone and recolor white→black
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll("line").forEach(line => {
    line.setAttribute("stroke", "black");
  });
  clone.querySelectorAll("text").forEach(txt => {
    txt.setAttribute("fill", "black");
  });

  // Ensure width + height exist in the SVG tag (critically important!)
  const viewBox = clone.getAttribute("viewBox").split(/\s+/);
  const vbWidth  = parseFloat(viewBox[2]);
  const vbHeight = parseFloat(viewBox[3]);

  clone.setAttribute("width", vbWidth);
  clone.setAttribute("height", vbHeight);

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function () {

    const SCALE = 3;   // or 2 or 4 depending on quality preference

    const canvas = document.createElement("canvas");
    canvas.width = img.width * SCALE;
    canvas.height = img.height * SCALE;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(img, 0, 0);

    const pngUrl = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "synima_tree.png";
    a.click();

    URL.revokeObjectURL(url);
  };

  img.src = url;
};

SYNIMA.getCurrentTipOrder = function () {
  if (!SYNIMA_TREES.current) return [];
  return SYNIMA.getTipNames(SYNIMA_TREES.current);
};

// Export functions for other modules (synteny.js)
SYNIMA.renderTreeSvg = renderTreeSvg;
SYNIMA.getCurrentTipOrder = SYNIMA.getCurrentTipOrder;  // already defined as SYNIMA.method
// These are already defined on SYNIMA earlier, so do NOT reassign them:
// SYNIMA.rootByTip
// SYNIMA.resetRoot
// SYNIMA.enableTaxonSelection
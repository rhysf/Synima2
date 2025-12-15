window.SYNIMA = window.SYNIMA || {};

window.SYNIMA_MIDPOINT_VALUE = window.SYNIMA_MIDPOINT_VALUE || "__SYNIMA_MIDPOINT__";
const SYNIMA_MIDPOINT_VALUE = window.SYNIMA_MIDPOINT_VALUE;

// Default alignment flag - will be overridden by localStorage if present
let SYNIMA_ALIGN_LABELS = true;

// updates align taxa flag from storage
function syncAlignFromStorage() {
  try {
    const savedAlign = localStorage.getItem(SYNIMA_PERSIST_KEYS.alignLabels);
    if (savedAlign !== null) {
      SYNIMA_ALIGN_LABELS = (savedAlign === "true");
    }
    // if null: first run → keep whatever default you set in the global
  } catch (e) {
    console.warn("Could not read alignLabels from localStorage", e);
    // localStorage might be blocked; ignore and keep default
  }
}

// Pull any stored value into SYNIMA_ALIGN_LABELS once at startup
//syncAlignFromStorage();

let SYNIMA_TREES = {
  original: null,
  current: null
};

// tree tab
SYNIMA_TAXON_NAMES = {}; // mapping oldName → newName
SYNIMA.selectedLabelName = null;   // currently selected displayed name
SYNIMA.annotateArmed = false;  // tracks "Annotate" armed state
let SYNIMA_LINE_WIDTH = 2;   // default stroke width
let SYNIMA_FONT_SIZE = 14;   // default tip label font-size

// synteny tab
//let SYNIMA_SYNTENY_FONT_SIZE = 12;
//const SYNIMA_SYNTENY_DEFAULT_MODE = "spans";

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

// Label click handlers (select / deselect / sync root dropdown / annotate-armed)
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

        // Clear "Root by tip" dropdown when deselecting
        const rootSel = document.getElementById("tip-root-select");
        if (rootSel) rootSel.value = "";

        return;
      }

      // Remove highlight from others
      document.querySelectorAll(".tree-label-text")
        .forEach(n => n.classList.remove("tree-label-selected"));

      // Highlight this one
      el.classList.add("tree-label-selected");

      // Record selected name
      SYNIMA.selectedLabelName = name;

      // Sync "Root by tip" dropdown with this selection
      const rootSel = document.getElementById("tip-root-select");
      if (rootSel) {
        // If this value exists as an option, select it
        const opt = Array.from(rootSel.options).find(o => o.value === name);
        if (opt) rootSel.value = name;
      }

      // If Annotate is armed, immediately open rename and un-arm
      if (SYNIMA.annotateArmed && typeof SYNIMA.renameSelectedTaxon === "function") {
        SYNIMA.renameSelectedTaxon();
        SYNIMA.annotateArmed = false;
        const annBtn = document.getElementById("annotate-btn");
        if (annBtn) annBtn.classList.remove("annotate-active");
      }

      console.log("Selected taxon:", name);
    });
  });
};

// SVG rendering
function renderTreeSvg(root, containerId, opts={}) {
  const isMini = opts.mini || false;

  //console.log(">>> RENDER START, tree:", JSON.stringify(root));

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
          n.y *= 6;
      });
  }

  // Boost font size and line width in mini trees
  const effectiveFontSize = isMini ? SYNIMA_FONT_SIZE * 3 : SYNIMA_FONT_SIZE;
  const lineW = isMini ? SYNIMA_LINE_WIDTH * 3 : SYNIMA_LINE_WIDTH;

  let maxX = Math.max(...allNodes.map(n => n.x));
  let maxY = Math.max(...allNodes.map(n => n.y));

  // Horizontal scaling
  let scaleX = isMini ? 250 / (maxX || 1) : 500 / (maxX || 1);
  let offsetX = isMini ? 40 : 20;
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
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="white" stroke-width="${lineW}" style="stroke-width:${lineW}px;" />`);
      // Horizontal segment
      lines.push(`<line x1="${x1}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="${lineW}" style="stroke-width:${lineW}px;" />`);

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
      if (isMini && displayName.length > 18) {
          displayName = displayName.slice(0, 14) + "...";
      }

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

  const barY = maxY + offsetY + 40;
  const textY = isMini
      ? barY + effectiveFontSize * 1.2   // extra spacing for large mini fonts
      : barY + 20;                       // original (≈40→60) spacing

  //const scaleBarFont = isMini ? effectiveFontSize : SYNIMA_FONT_SIZE;
  const scaleBarStroke = lineW //isMini ? 6 : 2;

  // Build scale bar SVG
  let scaleBar = `
    <line x1="${scalePxStart}" y1="${barY}"
      x2="${scalePxEnd}"   y2="${barY}"
      stroke="white" stroke-width="${scaleBarStroke}" />

    <text x="${scalePxMid}" y="${textY}"
      fill="white" 
      font-size="${effectiveFontSize}"
      class="tree-label"
      text-anchor="middle">${rounded}</text>
  `;

  // Overall SVG dimensions in user space
  //let width = isMini ? (offsetX + maxX * scaleX + 100) : 650;
  let width;
  if (isMini) {
      // give labels plenty of horizontal space
      const labelRoom = effectiveFontSize * 8; 
      width = offsetX + maxX * scaleX + labelRoom;
  } else {
      width = 650;
  }
  let height = textY + 20;

  let preserve = "xMinYMin meet";
  let svgWidthAttr = width;
  let svgHeightAttr = height;

  if (isMini) {
      preserve = "none"; 
      svgWidthAttr = "100%";    // but maintain full height
      svgHeightAttr = height;   // full natural height
      window.SYNIMA.originalMiniTreeHeight = height;
  }

  //let svg = `<svg class="tree-svg" viewBox="0 0 ${width} ${height}">
  let svg = `<svg class="tree-svg" width="${svgWidthAttr}" height="${svgHeightAttr}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${preserve}">
      <g class="tree-lines">${lines.join("\n")}</g>
      <g class="tree-leaders">${leaderLines.join("\n")}</g>
      <g class="tree-labels">${labels.join("\n")}</g>
      <g class="tree-scale">${scaleBar}</g>
    </svg>
  `;

  // --------------------------------------
  // Expose tip Y positions (for synteny)
  // --------------------------------------
  if (isMini) {
      const tipY = {};
      (function collectTips(n) {
          if (!n.children || n.children.length === 0) {
            // Use original name if available, otherwise fall back to current
            const key = n.origName || n.name;
            if (key) {
                tipY[key] = offsetY + n.y;   // absolute Y position in pixels
            }
          }
          if (n.children) n.children.forEach(collectTips);
      })(root);

      // Save globally so synteny can retrieve them
      window.SYNIMA = window.SYNIMA || {};
      SYNIMA.tipYPositions = tipY;
  }

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

      // Clear Root-by-tip dropdown when clicking empty background
      const rootSel = document.getElementById("tip-root-select");
      if (rootSel) rootSel.value = "";

      // Do NOT disable annotate; it can always be armed
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
  const host = document.getElementById("rooting-controls");
  if (!host || !SYNIMA_TREES.current) return;

  const tips = SYNIMA.getTipNames(SYNIMA_TREES.current);
  if (!tips || tips.length === 0) return;

  host.innerHTML = `
    <label>
      Rooting:
      <select id="tip-root-select">
        <option value="">User selection</option>
        <option value="${SYNIMA_MIDPOINT_VALUE}">Midpoint</option>
        ${tips.map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </label>
    <button id="apply-tip-root" type="button">Apply</button>
  `;

  const sel = document.getElementById("tip-root-select");
  const btn = document.getElementById("apply-tip-root");

  // sync the “Root by tip” dropdown to the saved value
  if (sel) {
    const savedRoot = localStorage.getItem(SYNIMA_PERSIST_KEYS.rootTip);
    if (savedRoot) sel.value = savedRoot;
  }

  if (btn && sel) {
    btn.addEventListener("click", () => {
      const selected = sel.value;

      // "User selection" = turn off rooting (including midpoint)
      if (!selected) {
        if (SYNIMA_TREES && SYNIMA_TREES.original) {
          SYNIMA_TREES.current = cloneTree(SYNIMA_TREES.original);
          applyRenamedTaxa(SYNIMA_TREES.current); // keep any renames
          try { localStorage.removeItem(SYNIMA_PERSIST_KEYS.rootTip); } catch (e) {}

          const el = document.getElementById("tree-view-0");
          if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
          SYNIMA.buildRootByTipDropdown(); // refresh dropdown to show "User selection"
        }
        return;
      }

      if (selected === SYNIMA_MIDPOINT_VALUE) {
        SYNIMA.midpointRoot(false);
      } else {
        SYNIMA.rootByTip(selected);
      }
    });
  }
}

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

  const el = document.getElementById("tree-view-0");
  if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
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
  //const rect = btn.getBoundingClientRect();
  //dd.style.position = "absolute";
  //dd.style.left = rect.left + "px";
  //dd.style.top = rect.bottom + window.scrollY + "px";

  // Do NOT position using page coordinates.
  // Let .annotate-wrap/.annotate-dropdown CSS handle it.
  dd.style.position = "";
  dd.style.left = "";
  dd.style.top = "";

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
SYNIMA.rootByTip = function (tipName, skipRender) {

  if (tipName === SYNIMA_MIDPOINT_VALUE) {
    return SYNIMA.midpointRoot(skipRender);
  }

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
    const el = document.getElementById("tree-view-0");
    if (el) renderTreeSvg(newRoot, "tree-view-0");
  }
};


// Midpoint root code
function buildAdjacencyFromTree(root) {
  const adj = new Map();
  const nodes = [];

  function addEdge(a, b, w) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ node: b, w });
    adj.get(b).push({ node: a, w });
  }

  (function walk(n, parent) {
    nodes.push(n);
    if (!adj.has(n)) adj.set(n, []);

    if (parent) {
      const w = (typeof n.length === "number" && Number.isFinite(n.length)) ? n.length : 0;
      addEdge(parent, n, w);
    }

    if (n.children && n.children.length) {
      for (const c of n.children) walk(c, n);
    }
  })(root, null);

  return { adj, nodes };
}

function isLeafByAdjacency(node, adj) {
  const deg = (adj.get(node) || []).length;
  // In an undirected tree, tips have degree 1.
  // If the whole tree is a single node, degree can be 0.
  return deg <= 1;
}

function farthestTipFrom(start, adj) {
  const dist = new Map();
  const prev = new Map();

  const stack = [start];
  dist.set(start, 0);

  while (stack.length) {
    const cur = stack.pop();
    const curD = dist.get(cur);

    for (const { node: nb, w } of (adj.get(cur) || [])) {
      if (dist.has(nb)) continue;
      dist.set(nb, curD + w);
      prev.set(nb, cur);
      stack.push(nb);
    }
  }

  let bestNode = start;
  let bestDist = 0;

  for (const [n, d] of dist.entries()) {
    if (!isLeafByAdjacency(n, adj)) continue;
    if (d > bestDist) {
      bestDist = d;
      bestNode = n;
    }
  }

  return { node: bestNode, dist: bestDist, prev, distMap: dist };
}

function edgeWeight(adj, a, b) {
  const xs = adj.get(a) || [];
  for (const e of xs) {
    if (e.node === b) return e.w;
  }
  return 0;
}

function buildRootedSubtreeFromAdj(node, parent, lenToParent, adj) {
  const out = {
    name: node.name ?? null,
    origName: node.origName ?? null,
    length: lenToParent,
    children: []
  };

  for (const { node: nb, w } of (adj.get(node) || [])) {
    if (nb === parent) continue;
    out.children.push(buildRootedSubtreeFromAdj(nb, node, w, adj));
  }

  return out;
}

SYNIMA.midpointRoot = function (fromStorage = false) {
  if (!SYNIMA_TREES.original) {
    console.warn("midpointRoot: No original tree stored.");
    return;
  }

  // Toggle behavior: if already midpoint-rooted and user applies again, revert to unrooted.
  if (!fromStorage) {
    const prev = localStorage.getItem(SYNIMA_PERSIST_KEYS.rootTip);
    if (prev === SYNIMA_MIDPOINT_VALUE) {
      localStorage.removeItem(SYNIMA_PERSIST_KEYS.rootTip);
      SYNIMA_TREES.current = cloneTree(SYNIMA_TREES.original);
      applyRenamedTaxa(SYNIMA_TREES.current);

      const el = document.getElementById("tree-view-0");
      if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
      SYNIMA.buildRootByTipDropdown();
      console.log("Midpoint root toggled off (reverted to unrooted).");
      return;
    }
  }

  // Work from a fresh clone of the original (like rootByTip does)
  const base = cloneTree(SYNIMA_TREES.original);
  applyRenamedTaxa(base);

  const { adj, nodes } = buildAdjacencyFromTree(base);
  if (nodes.length < 2) {
    SYNIMA_TREES.current = base;
    const el = document.getElementById("tree-view-0");
    if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
    return;
  }

  const start = nodes.find(n => isLeafByAdjacency(n, adj)) || nodes[0];

  // Tree diameter via 2 passes
  const Ares = farthestTipFrom(start, adj);
  const Bres = farthestTipFrom(Ares.node, adj);

  const A = Ares.node;
  const B = Bres.node;
  const total = Bres.dist;

  //console.group("Midpoint rooting");
  //console.log("Diameter tip A:", A?.name, "tip B:", B?.name, "diameter length:", total);

  // Reconstruct path A -> B using prev map from the second pass (which started at A)
  const path = [];
  let cur = B;
  while (cur && cur !== A) {
    path.push(cur);
    cur = Bres.prev.get(cur);
  }
  if (cur !== A) {
    console.warn("midpointRoot: could not reconstruct A->B path; leaving tree unchanged");
    //console.groupEnd();
    return;
  }
  path.push(A);
  path.reverse();

  //console.log("Path node count:", path.length);

  // Find midpoint position along path
  const target = total / 2;
  let acc = 0;

  let u = null;
  let v = null;
  let along = 0;
  let w = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ew = edgeWeight(adj, a, b);

    if (acc + ew >= target) {
      u = a;
      v = b;
      w = ew;
      along = target - acc; // distance from u towards v
      break;
    }
    acc += ew;
  }

  if (!u || !v) {
    console.warn("midpointRoot: midpoint edge not found; leaving tree unchanged");
    //console.groupEnd();
    return;
  }

  //console.log("Midpoint on edge:", u.name, "<->", v.name, "edgeLen:", w, "offsetFromU:", along);

  let newTree;

  // If midpoint lands exactly on an existing node, just root at that node.
  if (w === 0 || along <= 0) {
    console.log("Midpoint coincides with node:", u.name);
    newTree = buildRootedSubtreeFromAdj(u, null, 0, adj);
  } else if (along >= w) {
    console.log("Midpoint coincides with node:", v.name);
    newTree = buildRootedSubtreeFromAdj(v, null, 0, adj);
  } else {
    // Midpoint is inside the edge, split it and create a new root node
    const du = along;
    const dv = w - along;

    const left = buildRootedSubtreeFromAdj(u, v, du, adj);
    const right = buildRootedSubtreeFromAdj(v, u, dv, adj);

    newTree = {
      name: null,
      origName: null,
      length: 0,
      children: [left, right]
    };

    //console.log("Created new root inside edge; split lengths:", { du, dv });
  }

  SYNIMA_TREES.current = newTree;

  if (!fromStorage) {
    localStorage.setItem(SYNIMA_PERSIST_KEYS.rootTip, SYNIMA_MIDPOINT_VALUE);
  }

  const el = document.getElementById("tree-view-0");
  if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  SYNIMA.buildRootByTipDropdown();

  console.groupEnd();
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

    const savedRoot = localStorage.getItem(SYNIMA_PERSIST_KEYS.rootTip);
    if (savedRoot) {
      SYNIMA.rootByTip(savedRoot, true); // skipRender true
    } else {
      SYNIMA.midpointRoot(true); // do midpoint by default, and do not render yet
    }

    // Align labels: restore from localStorage
    syncAlignFromStorage();

    //console.log("Global tree initialised:", SYNIMA_TREES);

  } catch (err) {
    console.error("Global tree initialization failed", err);
  }
})();

// Page function
SYNIMA.showTree = function () {
  const app = document.getElementById("app");
  const scriptEl = document.getElementById("data-tree");

  const main = document.getElementById("app");
  if (main) {
      main.classList.add("max-w-6xl", "mx-auto");
      main.style.maxWidth = "";
      main.style.margin = "";
  }

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

    // ----------------------------
    // Header / Download
    // ----------------------------
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
        </div>`;

    // ----------------------------
    // Tree 
    // ----------------------------
    html += `
    <div id="tree-view-0" class="tree-view"></div>
    </div>`;

    // ----------------------------
    // Tree Graphical Options
    // ----------------------------

    html += `
    <div class="section">
    <h2>Graphical Options</h2>

      <div class="tree-controls">
        <!--<button disabled title="Midpoint rooting coming soon">Midpoint root (coming soon)</button>-->
        <!--<button disabled title="Tip rooting coming soon">Root by tip (coming soon)</button>-->
        
        <!-- Row 0: actions -->
        <!--<div class="control-group">-->
        <div class="tree-controls-row">
          <button onclick="SYNIMA.resetRoot()" style="margin-left:10px;">Reset tree</button>
        </div>

        <!-- Row 1: Layout -->
        <fieldset class="tree-controls-group">
          <legend>Layout</legend>

          <label>
            <input type="checkbox" id="align-labels-checkbox" />
              Align tip labels
          </label>
        </fieldset>
        
        <!-- Appearance -->
        <fieldset class="tree-controls-group">
          <legend>Appearance</legend>

          <label style="margin-left: 10px;">
            Line width:
            <select id="line-width-select">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
        </fieldset>

        <!-- Trees -->
        <fieldset class="tree-controls-group">
          <legend>Trees</legend>

          <div id="rooting-controls"></div>

          <div id="tip-root-dialog" class="tip-dialog hidden"></div>
        </fieldset>

        <!-- Tip labels -->
        <fieldset class="tree-controls-group">
          <legend>Tip labels</legend>

          <label style="margin-left: 10px;">
            Font size:
            <select id="font-size-select">
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

          <div class="annotate-wrap">
            <button id="annotate-btn">Annotate</button>

            <div id="annotate-dropdown" class="annotate-dropdown hidden">
              <input id="rename-input" type="text" class="border p-1 w-full mb-2" placeholder="New name…">
              <div class="flex justify-end gap-2">
                <button id="rename-cancel">Cancel</button>
                <button id="rename-apply" class="font-bold">Apply</button>
              </div>
            </div>
          </div>
        </fieldset>

      </div>
    </div>

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

  // Reflect the current setting (loaded from localStorage at startup)
  const chk = document.getElementById("align-labels-checkbox");
  if (chk) chk.checked = !!SYNIMA_ALIGN_LABELS;

  // allow taxa to be selected
  const annBtn = document.getElementById("annotate-btn");
  if (annBtn) {
    annBtn.addEventListener("click", () => {
      if (SYNIMA.selectedLabelName) {
        // A taxon is already selected → open rename now
        SYNIMA.renameSelectedTaxon();
      } else {
        // No selection yet → toggle "armed" mode
        SYNIMA.annotateArmed = !SYNIMA.annotateArmed;
        annBtn.classList.toggle("annotate-active", SYNIMA.annotateArmed);
      }
    });
  }

  // adjust line width
  const lwSelect = document.getElementById("line-width-select");
  lwSelect.addEventListener("change", () => {
    const v = parseInt(lwSelect.value, 10);
    SYNIMA_LINE_WIDTH = v;
    localStorage.setItem(SYNIMA_PERSIST_KEYS.lineWidth, String(v));
    const el = document.getElementById("tree-view-0");
    if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  });

  // adjust font size
  const fsSelect = document.getElementById("font-size-select");
  fsSelect.addEventListener("change", () => {
    SYNIMA_FONT_SIZE = parseInt(fsSelect.value, 10);
    localStorage.setItem(SYNIMA_PERSIST_KEYS.fontSize, SYNIMA_FONT_SIZE);
    const el = document.getElementById("tree-view-0");
    if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  });

  // Restore persisted settings
  const savedLW = localStorage.getItem(SYNIMA_PERSIST_KEYS.lineWidth);
  if (savedLW !== null) {
    SYNIMA_LINE_WIDTH = parseInt(savedLW, 10);
    if (lwSelect) lwSelect.value = savedLW;
  } else {
    // default
    SYNIMA_LINE_WIDTH = 2;
    if (lwSelect) lwSelect.value = "2";
  }

  const savedFS = localStorage.getItem(SYNIMA_PERSIST_KEYS.fontSize);
  if (savedFS !== null) {
    SYNIMA_FONT_SIZE = parseInt(savedFS, 10);
    if (fsSelect) fsSelect.value = savedFS;
  } else {
    // default
    SYNIMA_FONT_SIZE = 14;
    if (fsSelect) fsSelect.value = "14";
  }

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
    const el = document.getElementById("tree-view-0");
    if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");

    // Populate "Root by tip" select now that the tree exists
    const tipSelect = document.getElementById("tip-root-select");
    const applyTipBtn = document.getElementById("apply-tip-root");

    if (tipSelect) {
      const tips = SYNIMA.getTipNames(SYNIMA_TREES.current);

      tipSelect.innerHTML =
        `<option value="">User selection</option>` +
        tips.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    }

    if (applyTipBtn) {
      applyTipBtn.addEventListener("click", () => {
        const chosen = tipSelect ? tipSelect.value : "";
        if (chosen) SYNIMA.rootByTip(chosen);
      });
    }
  
  } catch (e) {
    console.error("Failed to parse or render tree", e);
    document.getElementById("tree-view-0").innerHTML =
      "<p>Could not render tree.</p>";
  }

  // add rooting dropdown menu
  SYNIMA.buildRootByTipDropdown();

  document.getElementById("align-labels-checkbox").addEventListener("change", e => {
    SYNIMA_ALIGN_LABELS = e.target.checked;
    localStorage.setItem(SYNIMA_PERSIST_KEYS.alignLabels, SYNIMA_ALIGN_LABELS);
    if (SYNIMA_TREES.current) {
      const el = document.getElementById("tree-view-0");
      if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
    }
  });

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
  //localStorage.removeItem(SYNIMA_PERSIST_KEYS.rootTip);
  localStorage.setItem(SYNIMA_PERSIST_KEYS.rootTip, SYNIMA_MIDPOINT_VALUE);

  // Reset globals
  SYNIMA_TAXON_NAMES = {};
  SYNIMA_LINE_WIDTH = 2;
  SYNIMA_FONT_SIZE = 14;

  // Update dropdown UI controls
  document.getElementById("line-width-select").value = "2";
  document.getElementById("font-size-select").value = "14";
  document.getElementById("align-labels-checkbox").checked = true;

  // clone pristine original
  SYNIMA_TREES.current = cloneTree(SYNIMA_TREES.original);

  // apply default rooting (midpoint)
  if (typeof SYNIMA.midpointRoot === "function") {
    SYNIMA.midpointRoot(true); // true = suppressRender, if you implemented that pattern
  }

  // redraw
  const el = document.getElementById("tree-view-0");
  if (el) renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  SYNIMA.buildRootByTipDropdown();

  console.log("Tree reset");
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

  const out = [];
  (function walk(n) {
    if (!n.children || n.children.length === 0) {
      // Use original name as the stable ID for synteny
      const key = n.origName || n.name;
      if (key) out.push(key);
    } else if (n.children) {
      n.children.forEach(walk);
    }
  })(SYNIMA_TREES.current);

  return out;
};

// Export functions for other modules (synteny.js)
SYNIMA.renderTreeSvg = renderTreeSvg;
SYNIMA.getCurrentTipOrder = SYNIMA.getCurrentTipOrder;  // already defined as SYNIMA.method
// These are already defined on SYNIMA earlier, so do NOT reassign them:
// SYNIMA.rootByTip
// SYNIMA.resetRoot
// SYNIMA.enableTaxonSelection
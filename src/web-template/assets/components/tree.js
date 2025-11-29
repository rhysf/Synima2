window.SYNIMA = window.SYNIMA || {};

let SYNIMA_ALIGN_LABELS = false;

let SYNIMA_TREES = {
  original: null,
  current: null
};

// Remove NEXUS wrappers and BEAST metadata, return pure Newick
function extractNewick(raw) {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();

  // -----------------------------------------
  // CASE 1: Plain Newick (starts with "(" and ends with ";")
  // -----------------------------------------
  if (s.startsWith("(") && s.includes(";")) {
    // Remove BEAST-style metadata: [&label=...]
    s = s.replace(/\[\&[^\]]*\]/g, "");
    return s;
  }

  // -----------------------------------------
  // CASE 2: NEXUS format
  // -----------------------------------------
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

// -------------------------
// Newick parsing
// -------------------------
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
    length: node.length,
    children: (node.children || []).map(child => cloneTree(child))
  };
}

// -------------------------
// Basic phylogram layout
// -------------------------
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


// -------------------------
// SVG rendering
// -------------------------
function renderTreeSvg(root, containerId) {

  console.log(">>> RENDER START, tree:", JSON.stringify(root));

  layoutTree(root);

  // gather nodes
  let allNodes = [];
  (function walk(n) {
    allNodes.push(n);
    if (n.children) n.children.forEach(walk);
  })(root);

  let maxX = Math.max(...allNodes.map(n => n.x));
  let maxY = Math.max(...allNodes.map(n => n.y));

  let scaleX = 500 / (maxX || 1);
  let offsetX = 20;
  let offsetY = 20;

  let lines = [];
  let labels = [];

  function drawBranches(node) {
    if (!node.children || node.children.length === 0) return;
    node.children.forEach(child => {
      let x1 = offsetX + node.x * scaleX;
      let y1 = offsetY + node.y;

      let x2 = offsetX + child.x * scaleX;
      let y2 = offsetY + child.y;

      // Vertical segment
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="white" stroke-width="2" />`);
      // Horizontal segment
      lines.push(`<line x1="${x1}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="white" stroke-width="2" />`);

      drawBranches(child);
    });
  }
  drawBranches(root);

  function drawLabels(node) {
    if (node.name && !/^[0-9.]+$/.test(node.name)) {
      let x;
      if (SYNIMA_ALIGN_LABELS) {
        // All labels flush right at the max X
        x = offsetX + (maxX * scaleX) + 10;
      } else {
        // Natural position at tip
        x = offsetX + node.x * scaleX + 5;
      }
      let y = offsetY + node.y + 5;
      labels.push(
        `<text x="${x}" y="${y}" fill="white" font-size="14" font-family="sans-serif">
           ${node.name}
         </text>`
      );
    }
    if (node.children) node.children.forEach(drawLabels);
  }
  drawLabels(root);

  // Choose a scale bar = 20% of tree length
  let scaleLen = maxX * 0.2;

  // Round the number for display
  let rounded = Number(scaleLen.toFixed(3)); // e.g. 0.00593 → 0.006

  let scalePxStart = offsetX;
  let scalePxEnd = offsetX + scaleLen * scaleX;

  // Compute midpoint in *pixel coordinates*
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

  let width = 650;
  let height = maxY + 100;

  let svg = `
    <svg class="tree-svg" viewBox="0 0 ${width} ${height}">
      <g class="tree-lines">${lines.join("\n")}</g>
      <g class="tree-labels">${labels.join("\n")}</g>
      <g class="tree-scale">${scaleBar}</g>
    </svg>
  `;

  document.getElementById(containerId).innerHTML = svg;
}


// -------------------------
// Page function
// -------------------------
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
      <h2>Tree Visualisation</h2>
      <div id="tree-view-0" class="tree-view"></div>
    </div>

    <div class="tree-controls">
      <!--<button disabled title="Midpoint rooting coming soon">Midpoint root (coming soon)</button>-->
      <!--<button disabled title="Tip rooting coming soon">Root by tip (coming soon)</button>-->
      

      <label>
          <input type="checkbox" id="align-labels-checkbox" />
          Align tip labels
      </label>

      <button onclick="SYNIMA.resetRoot()">Reset tree</button>

    <button onclick="SYNIMA.exportSvg()">Download SVG</button>
    <button onclick="SYNIMA.exportPng()">Download PNG</button>

    </div>

  

    <div id="tip-root-dialog" class="tip-dialog hidden"></div>
  `;

  app.innerHTML = html;

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
    const parsed = parseNewick(newick);

    SYNIMA_TREES.original = cloneTree(parsed);
    SYNIMA_TREES.current  = cloneTree(parsed);

    renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");
  } catch (e) {
    console.error("Failed to parse or render tree", e);
    document.getElementById("tree-view-0").innerHTML =
      "<p>Could not render tree.</p>";
  }

  document.getElementById("align-labels-checkbox").addEventListener("change", e => {
  SYNIMA_ALIGN_LABELS = e.target.checked;
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

  // 1. Turn off label alignment mode
  SYNIMA_ALIGN_LABELS = false;

  const chk = document.getElementById("align-labels-checkbox");
  if (chk) chk.checked = false;

  // Deep clone (so mutations won't touch the stored original)
  SYNIMA_TREES.current = cloneTree(SYNIMA_TREES.original);

  // Re-render
  renderTreeSvg(SYNIMA_TREES.current, "tree-view-0");

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



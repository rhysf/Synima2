window.SYNIMA = window.SYNIMA || {};

let SYNIMA_TREES = {
  original: null,
  current: null
};

// -------------------------
// Newick parsing
// -------------------------
function parseNewick(str) {
  // Split by separators, keeping them as tokens
  const tokens = str.trim().split(/\s*(;|\(|\)|,|:)\s*/);
  const ancestors = [];
  let tree = {};
  let prevToken = null;

  for (let token of tokens) {
    if (!token) continue;

    if (token === "(") {
      // Start a new subtree
      const subtree = {};
      if (!tree.children) {
        tree.children = [];
      }
      tree.children.push(subtree);
      ancestors.push(tree);
      tree = subtree;
    } else if (token === ",") {
      // New sibling under the same parent
      const parent = ancestors[ancestors.length - 1];
      const subtree = {};
      parent.children.push(subtree);
      tree = subtree;
    } else if (token === ")") {
      // Close current group, go up one level
      tree = ancestors.pop();
    } else if (token === ":") {
      // Length marker; value handled on next token
      // (we just remember via prevToken)
    } else if (token === ";") {
      // End of tree
      break;
    } else {
      // Name or length, depending on what came before
      if (prevToken === ":" ) {
        // This token is a branch length
        const len = parseFloat(token);
        tree.length = isNaN(len) ? 0 : len;
      } else if (
        prevToken === "(" ||
        prevToken === "," ||
        prevToken === ")" ||
        prevToken === null
      ) {
        // This token is a node name (tip or internal)
        tree.name = token;
      }
    }

    prevToken = token;
  }

  return tree;
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
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" />`);
      // Horizontal segment
      lines.push(`<line x1="${x1}" y1="${y2}" x2="${x2}" y2="${y2}" />`);

      drawBranches(child);
    });
  }
  drawBranches(root);

  function drawLabels(node) {
    if (node.name && !/^[0-9.]+$/.test(node.name)) {
      let x = offsetX + node.x * scaleX + 5;
      let y = offsetY + node.y + 5;
      labels.push(`<text x="${x}" y="${y}" class="tree-label">${node.name}</text>`);
    }
    if (node.children) node.children.forEach(drawLabels);
  }
  drawLabels(root);

  // Scale bar
  let scaleLen = maxX * 0.2;
  let sx1 = offsetX;
  let sx2 = offsetX + scaleLen * scaleX;

  let scaleBar = `
    <line x1="${sx1}" y1="${maxY + offsetY + 40}"
          x2="${sx2}" y2="${maxY + offsetY + 40}"
          style="stroke:white;stroke-width:2" />
    <text x="${sx1}" y="${maxY + offsetY + 55}" class="tree-label">0</text>
    <text x="${sx2}" y="${maxY + offsetY + 55}" class="tree-label">${scaleLen.toFixed(4)}</text>
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

  const first = data.trees[0];
  const newickStr = first.newick || "";

  // Page content
  app.innerHTML = `
    <h1>Phylogenetic Tree</h1>

    <div class="section">
      <h2>Tree file</h2>
      <p>${first.file_name}</p>
    </div>

    <div class="section">
      <h2>Newick</h2>
      <pre class="newick-block">${newickStr}</pre>
    </div>

    <div class="section">
      <h2>Visualisation</h2>
      <div id="tree-view-0" class="tree-view"></div>
    </div>
  `;

  const parsed = parseNewick(newickStr);
  SYNIMA_TREES.original = parsed;
  SYNIMA_TREES.current = parsed;

  renderTreeSvg(parsed, "tree-view-0");
};
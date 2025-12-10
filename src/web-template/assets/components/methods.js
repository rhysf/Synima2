window.SYNIMA = window.SYNIMA || {};

SYNIMA.showMethods = function () {
  const app = document.getElementById("app");
  const methodsRaw = document.getElementById("data-methods");
  const orthRaw    = document.getElementById("data-orthologs");

  if (!methodsRaw) {
    app.innerHTML = "<p>Error: methods metadata missing.</p>";
    return;
  }

  const main = document.getElementById("app");
  if (main) {
      main.classList.add("max-w-6xl", "mx-auto");
      main.style.maxWidth = "";
      main.style.margin = "";
  }

  const methodsData = JSON.parse(methodsRaw.textContent);
  const orthData    = orthRaw ? JSON.parse(orthRaw.textContent) : null;

  // --------------------------------------------------------------------
  // Extract values from methods table
  // --------------------------------------------------------------------

  function findTool(name) {
    return methodsData.tools.find(t => t.name.toLowerCase() === name.toLowerCase());
  }

  function findCategory(cat) {
    return methodsData.tools.filter(t => t.category.toLowerCase() === cat.toLowerCase());
  }

  const synima              = findTool("Synima");
  const orthologyToolEntry  = findCategory("Orthology tool")[0];
  const alignerEntry        = findCategory("Aligner")[0];
  const alignParams         = findCategory("Aligner parameters");
  const muscleEntry         = findCategory("Multiple aligner")[0];
  const fasttreeEntry       = findCategory("Tree builder")[0];
  const dagEntry            = findCategory("Synteny chaining")[0];
  const dagParams           = findCategory("Synteny chaining parameters")[0];
  const seqTypeEntry        = findCategory("Sequence type")[0];

  const synima_version      = synima ? synima.version : "-";
  const orthology_tool      = orthologyToolEntry ? orthologyToolEntry.name : "-";
  const orthology_version   = orthologyToolEntry ? orthologyToolEntry.version : "-";
  const aligner             = alignerEntry ? alignerEntry.name : "-";
  const aligner_version     = alignerEntry ? alignerEntry.version : "-";
  const muscle_version      = muscleEntry ? muscleEntry.version : "-";
  const fasttree_version    = fasttreeEntry ? fasttreeEntry.version : "-";
  const dagchainer_version  = dagEntry ? dagEntry.version : "-";
  const dagchainer_chains   = dagParams ? dagParams.version : "-";
  const sequence_type       = seqTypeEntry ? seqTypeEntry.name : "-";

  function sequenceTypeHuman(seq) {
    if (!seq) return seq;
    if (seq.toLowerCase() === "cds") return "coding";
    if (seq.toLowerCase() === "pep") return "peptide";
    return seq;
  }

  const sequence_type_human = sequenceTypeHuman(sequence_type);

  // Extract aligner parameters
  let max_target_seqs = "-";
  let evalue          = "-";
  let diamond_extra   = "";

  alignParams.forEach(p => {
    if (p.name === "max_target_seqs") max_target_seqs = p.version;
    if (p.name === "evalue")          evalue = p.version;
    if (p.name === "diamond_sensitivity")
      diamond_extra = `, diamond_sensitivity=${p.version}`;
  });

  // Number of single-copy orthologs
  const num_single_copy =
    orthData && orthData.single_copy_orthologs !== undefined
      ? orthData.single_copy_orthologs
      : 0;

  // --------------------------------------------------------------------
  // Citation engine (Option A: first-appearance ordering)
  // --------------------------------------------------------------------
  const citationMap  = new Map();  // tool -> number
  const citationList = [];         // ordered list of citation entries

  function registerCitation(tool) {
    if (!tool) return "";

    const key = tool.toLowerCase();

    // Already seen?
    if (citationMap.has(key)) {
      return citationMap.get(key);
    }

    // Find citation entry
    const entry = methodsData.citations.find(x =>
      x.tool.toLowerCase() === key ||
      (key === "synima" && x.tool.toLowerCase() === "synima2")
    );
    if (!entry) return "";

    citationList.push(entry);
    const num = citationList.length;
    citationMap.set(key, num);
    return num;
  }

  function applyCitations(text) {
    return text.replace(/\[\[(.*?)\]\]/g, (_, tool) => {
      const num = registerCitation(tool.trim());
      return num ? `<a class="ref" href="#ref-${num}">[${num}]</a>` : "";
    });
  }

  function citationKeyForAligner(aligner) {
    const a = aligner.toLowerCase();
    if (a === "blastplus" || a === "legacy") return "BLAST+";
    if (a === "diamond") return "DIAMOND";
    return aligner;
  }

  // --------------------------------------------------------------------
  // Build tools + parameter table
  // --------------------------------------------------------------------
  let html = `
    <h1 class="text-3xl font-bold mb-6">Methods</h1>

    <div class="section">
      <h2>Tools and Parameters</h2>
      <table class="param-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Tool / Parameter</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
  `;

  methodsData.tools.forEach(t => {
    html += `
      <tr>
        <td>${t.category}</td>
        <td>${t.name}</td>
        <td>${t.version}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // --------------------------------------------------------------------
  // Build Description with placeholder tags
  // --------------------------------------------------------------------

  let desc = `
<p>
  Ortholog prediction and synteny analysis were performed using Synima v${synima_version} [[Synima]].
  Orthologs were inferred using ${orthology_tool} v${orthology_version} [[${orthology_tool}]]
  based on an all-vs-all comparison of ${sequence_type_human} sequences computed with
  ${aligner} v${aligner_version} [[${citationKeyForAligner(aligner)}]]
  using the parameters max_target_seqs=${max_target_seqs}, evalue=${evalue}${diamond_extra}.
</p>

<p>
  Orthogroups assigned by Synima were classified into core, accessory, and unique categories.
  ${num_single_copy} single-copy core orthologs were identified and used to construct a phylogenetic tree.
  Each orthogroup of single-copy orthologs was aligned separately using MUSCLE v${muscle_version} [[MUSCLE]]
  with default settings. All alignments were concatenated into a single FASTA, and an
  'approximately maximum-likelihood' tree was inferred using FastTree v${fasttree_version} [[FastTree]].
</p>

<p>
  Synteny blocks were identified as chains of ≥ ${dagchainer_chains} orthologous genes using
  DAGChainer [[DAGChainer]], and visualised using Synima.
</p>
`;

  desc = applyCitations(desc);

  html += `<div class="section"><h2>Description</h2>${desc}</div>`;

  // --------------------------------------------------------------------
  // References (ordered by appearance)
  // --------------------------------------------------------------------
  html += `
    <div class="section">
      <h2>References</h2>
  `;

  citationList.forEach((c, idx) => {
    const num = idx + 1;
    html += `
      <p id="ref-${num}" class="mb-4">
        <strong>[${num}] ${c.tool}</strong><br/>
        ${c.citation}<br/>
        <a href="${c.link}" target="_blank" class="text-blue-300 underline">${c.link}</a>
      </p>
    `;
  });

  html += `</div>`;

  app.innerHTML = html;
};
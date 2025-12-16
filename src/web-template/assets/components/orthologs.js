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

  let html = `<h1>Ortholog Summaries</h1>`;

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

  // Determine sequence type + orthology tool run
  let seqType = "Unknown";
  let orthoTool = "Unknown";

  if (data.summaries && data.summaries.length > 0) {
    seqType = formatSequenceType(data.summaries[0].alignment);
    orthoTool = formatOrthoTool(data.summaries[0].method);
  }

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

  data.summaries.forEach(summary => {


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

    html += `
          </tbody>
        </table>

        <h2>Plot</h2>
    `;

        // Prefer PNG if available
      if (summary.png_path) {
        html += `
          <img src="${summary.png_path}" class="plot-image" alt="Cluster distribution plot">
        `;
      } else if (summary.pdf_path) {
        html += `
          <iframe src="${summary.pdf_path}" class="pdf-viewer" loading="lazy"></iframe>
        `;
      } else {
        html += `<p>No plot available.</p>`;
      }

      // R script
      html += `
        <h2>R code</h2>
        <pre>${summary.rscript}</pre>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${summary.rscript}\`)">
          Copy R Script
        </button>
      </div>
    `;
  });

  // Escape for safe HTML display
function escapeHtml(str) {
  return str.replace(/[&<>]/g, tag =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
    }[tag] || tag)
  );
}

// Escape for safe JS template literal insertion
function escapeForJsLiteral(str) {
  return str
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/\\/g, "\\\\");
}


  app.innerHTML = html;
};
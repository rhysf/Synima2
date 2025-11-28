window.SYNIMA = window.SYNIMA || {};

SYNIMA.showOrthologs = function () {
  const app = document.getElementById("app");
  const data = JSON.parse(document.getElementById("data-orthologs").textContent);

  const params = data.params || null;

  if (!data.summaries || data.summaries.length === 0) {
    app.innerHTML = `<h1>Ortholog Summary</h1><p>No summary files found.</p>`;
    return;
  }

  let html = `<h1>Ortholog Summaries</h1>`;

  data.summaries.forEach(summary => {


    html += `
      <div class="section">
      <h2>Ortholog Inference Parameters</h2>

    <table class="param-table">
      <tr><th>Aligner</th><td>${params.aligner}</td></tr>
      <tr><th>Max target seqs</th><td>${params.max_target_seqs}</td></tr>
      <tr><th>Diamond sensitivity</th><td>${params.diamond_sensitivity}</td></tr>
      <tr><th>E-value</th><td>${params.evalue}</td></tr>
      <tr><th>Genetic code</th><td>${params.genetic_code}</td></tr>
    </table>
  </div>


<div class="section">
      <h2>Orthologs</h2>
        <table class="ortho-table">
          <thead>
            <tr>
              <th>Genome</th>
              <th>Core</th>
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
          <td>${row.core}</td>
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
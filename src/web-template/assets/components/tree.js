window.SYNIMA = window.SYNIMA || {};

SYNIMA.showTree = function () {
  const app = document.getElementById("app");

  const data = JSON.parse(
    document.getElementById("data-tree").textContent
  );

  const newick = data.newick || "(no_tree_available);";

  app.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">Phylogenetic Tree</h1>
    <pre class="bg-gray-100 p-4 rounded text-sm">${newick}</pre>
  `;
};
window.SYNIMA = window.SYNIMA || {};

SYNIMA.showOrthologs = function () {
  const app = document.getElementById("app");

  const data = JSON.parse(
    document.getElementById("data-orthologs").textContent
  );

  app.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">Orthologs</h1>
    <pre class="bg-gray-100 p-4 rounded text-sm">
${JSON.stringify(data, null, 2)}
    </pre>
  `;
};
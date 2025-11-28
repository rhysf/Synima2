window.SYNIMA = window.SYNIMA || {};

SYNIMA.showSynteny = function () {
  const app = document.getElementById("app");

  const data = JSON.parse(
    document.getElementById("data-synteny").textContent
  );

  app.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">Synteny</h1>
    <pre class="bg-gray-100 p-4 rounded text-sm">
${JSON.stringify(data, null, 2)}
    </pre>
  `;
};
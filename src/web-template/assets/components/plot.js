window.SYNIMA = window.SYNIMA || {};

SYNIMA.showPlot = function () {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">Plot</h1>
    <p class="mb-4">Interactive plot will go here.</p>
    <canvas id="plot-canvas" width="800" height="600" class="border"></canvas>

    <div class="mt-4 space-x-3">
      <button id="save-png" class="px-4 py-2 bg-blue-600 text-white rounded">Save PNG</button>
    </div>
  `;

  const canvas = document.getElementById("plot-canvas");
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "black";
  ctx.fillText("Plot placeholder", 20, 40);

  document.getElementById("save-png").onclick = () => {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "synima_plot.png";
    a.click();
  };
};
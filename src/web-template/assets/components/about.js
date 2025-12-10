window.SYNIMA = window.SYNIMA || {};

SYNIMA.showAbout = function () {
  const app = document.getElementById("app");

  const main = document.getElementById("app");
  if (main) {
      main.classList.add("max-w-6xl", "mx-auto");
      main.style.maxWidth = "";
      main.style.margin = "";
  }

  app.innerHTML = `
    <h1 class="text-3xl font-bold mb-6">About</h1>

    <div class="section">
      <p class="mb-4">
        <strong>Synima</strong> (Synteny Imager) is an orthology prediction
        pipeline and synteny viewer.
      </p>

      <p class="mb-4">
        <strong>Synima 2</strong> is a complete re-write of the code to streamline
        and update functionality and outputs.
      </p>

      <p class="mb-4">
        All documentation for Synima2 can be found at:<br/>
        <a href="https://github.com/rhysf/Synima2" target="_blank"
           class="text-blue-300 underline hover:text-blue-200">
           https://github.com/rhysf/Synima2
        </a>
      </p>

      <p class="mb-4">
        There is not currently a new manuscript associated with the updated code, so
        when publishing work that uses Synima2 please cite:
      </p>

      <p class="mb-4 pl-4 border-l-4 border-gray-500">
        Farrer RA (2017), BMC Bioinformatics 18:507<br/>
        <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5697234/"
           target="_blank"
           class="text-blue-300 underline hover:text-blue-200">
           https://pmc.ncbi.nlm.nih.gov/articles/PMC5697234/
        </a>
      </p>
    </div>
  `;
};
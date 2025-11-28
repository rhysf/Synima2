window.SYNIMA = window.SYNIMA || {};

SYNIMA.renderHeader = function () {
  const el = document.getElementById("header");

  el.innerHTML = `
    <nav class="bg-white shadow mb-4">
      <div class="max-w-6xl mx-auto px-4">
        <div class="flex items-center justify-between h-16">

          <div class="flex items-center space-x-3">
            <span class="text-xl font-semibold text-blue-600">Synima2</span>
          </div>

          <div class="flex space-x-6 text-sm font-medium">
            <a href="#/orthologs" class="hover:text-blue-600">Orthologs</a>
            <a href="#/tree" class="hover:text-blue-600">Tree</a>
            <a href="#/synteny" class="hover:text-blue-600">Synteny</a>
            <a href="#/plot" class="hover:text-blue-600">Plot</a>
            <a href="#/methods" class="hover:text-blue-600">Methods</a>
            <a href="#/about" class="hover:text-blue-600">About</a>
          </div>

        </div>
      </div>
    </nav>
  `;
};
window.SYNIMA = window.SYNIMA || {};

SYNIMA.routes = {
  orthologs: SYNIMA.showOrthologs,
  tree: SYNIMA.showTree,
  synteny: SYNIMA.showSynteny,
  plot: SYNIMA.showPlot,
  methods: SYNIMA.showMethods,
  about: SYNIMA.showAbout
};

SYNIMA.router = function () {
  const hash = window.location.hash.replace("#/", "");
  const route = hash || "orthologs";

  const view = SYNIMA.routes[route];

  if (typeof view === "function") {
    view();
  } else {
    document.getElementById("app").innerHTML =
      `<div class="p-4 text-red-600">Page not found: ${route}</div>`;
  }
};

SYNIMA.routerInit = function () {
  window.addEventListener("hashchange", SYNIMA.router);
  window.addEventListener("load", SYNIMA.router);
};
window.SYNIMA = window.SYNIMA || {};

SYNIMA.routes = {
  orthologs: SYNIMA.showOrthologs,
  tree: SYNIMA.showTree,
  synteny: SYNIMA.showSynteny,
  plot: SYNIMA.showPlot,
  methods: SYNIMA.showMethods,
  about: SYNIMA.showAbout
};

SYNIMA.currentPage = "orthologs";  // default

SYNIMA.router = function (page) {
  const view = SYNIMA.routes[page] || SYNIMA.showOrthologs;
  SYNIMA.currentPage = page;       // track which tab is active
  view();
};

SYNIMA.routerInit = function () {

  // Attach click handlers to all nav links
  document.addEventListener("click", function (e) {
    const link = e.target.closest("a[data-page]");
    if (!link) return;

    e.preventDefault(); // prevent URL change
    const page = link.getAttribute("data-page");
    SYNIMA.router(page);
  });

  // Default landing page
  SYNIMA.router("orthologs");
};
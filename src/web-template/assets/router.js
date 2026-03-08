window.SYNIMA = window.SYNIMA || {};

SYNIMA.routes = {
  orthologs: SYNIMA.showOrthologs,
  tree: SYNIMA.showTree,
  genes: SYNIMA.showGenes,
  synteny: SYNIMA.showSynteny,
  cloud: SYNIMA.showCloud,
  methods: SYNIMA.showMethods,
  about: SYNIMA.showAbout
};

SYNIMA.currentPage = "orthologs";  // default

SYNIMA.updateActiveNav = function (page) {
  const links = document.querySelectorAll("a[data-page]");
  links.forEach((link) => {
    const p = link.getAttribute("data-page");
    if (p === page) link.classList.add("synima-nav-active");
    else link.classList.remove("synima-nav-active");
  });
};

SYNIMA.router = function (page) {
  const view = SYNIMA.routes[page] || SYNIMA.showOrthologs;
  SYNIMA.currentPage = page;       // track which tab is active
  view();
  SYNIMA.updateActiveNav(page);
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

window.SYNIMA = window.SYNIMA || {};

SYNIMA.routes = {
  orthologs: SYNIMA.showOrthologs,
  tree: SYNIMA.showTree,
  genes: SYNIMA.showGenes,
  synteny: SYNIMA.showSynteny,
  function: SYNIMA.showFunction,
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
  if (page === "function" && !SYNIMA.hasCloudAuth()) page = "orthologs";
  const view = SYNIMA.routes[page] || SYNIMA.showOrthologs;
  SYNIMA.currentPage = page;       // track which tab is active
  view();
  SYNIMA.updateActiveNav(page);
};

SYNIMA.routerInit = function () {
  function updateFunctionAccess() {
    const available = SYNIMA.hasCloudAuth();
    document.querySelectorAll('a[data-page="function"]').forEach(link => {
      link.hidden = !available;
    });
    if (!available && SYNIMA.currentPage === "function") SYNIMA.router("orthologs");
  }

  updateFunctionAccess();
  window.addEventListener("synima-cloud-auth-changed", updateFunctionAccess);
  window.addEventListener("storage", event => {
    if (event.key === null || event.key === window.SYNIMA_CLOUD_KEYS.apiKey) updateFunctionAccess();
  });

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

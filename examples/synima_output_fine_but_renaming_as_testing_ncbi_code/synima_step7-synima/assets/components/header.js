window.SYNIMA = window.SYNIMA || {};

SYNIMA.renderHeader = function () {
  const el = document.getElementById("header");

  el.innerHTML = `
    <nav class="synima-header">
      <div class="synima-header-inner">

        <!-- Top row: logo + title + (mobile) hamburger -->
        <div class="synima-top-row">
          <div class="synima-logo-title">
            <img src="./assets/logo.png"
                 alt="Synima2 Logo"
                 class="synima-logo" />
          </div>

          <!-- hamburger (mobile only) -->
          <button id="hamburger-btn" class="hamburger-btn mobile-only" aria-label="Menu">
            ☰
          </button>
        </div>

        <!-- Desktop nav -->
        <div class="synima-nav-row desktop-only synima-nav">
          <a href="#" data-page="orthologs">Orthologs</a>
<a href="#" data-page="tree">Tree</a>
<a href="#" data-page="synteny">Synteny</a>
<!--<a href="#" data-page="plot">Plot</a>-->
<a href="#" data-page="methods">Methods</a>
<a href="#" data-page="about">About</a>
        </div>

        <!-- Mobile dropdown nav -->
        <div id="mobile-menu" class="mobile-menu synima-nav">
          <a href="#" data-page="orthologs">Orthologs</a>
<a href="#" data-page="tree">Tree</a>
<a href="#" data-page="synteny">Synteny</a>
<!--<a href="#" data-page="plot">Plot</a>-->
<a href="#" data-page="methods">Methods</a>
<a href="#" data-page="about">About</a>
        </div>

      </div>
    </nav>
  `;

  const btn = document.getElementById("hamburger-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  if (btn && mobileMenu) {
    btn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
    });
  }

  // Close mobile menu when clicking outside
  document.addEventListener("click", function (e) {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("hamburger-btn");

    if (!menu.classList.contains("open")) return;

    // If click is NOT inside the menu AND not on button → close it
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("open");
    }
  });

  // Close mobile menu when resizing wider than mobile
  window.addEventListener("resize", function () {
    if (window.innerWidth > 760) {
      const menu = document.getElementById("mobile-menu");
      if (menu) menu.classList.remove("open");
    }
  });
};
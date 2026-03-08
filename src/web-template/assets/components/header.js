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
<a href="#" data-page="genes">Genes</a>
<a href="#" data-page="synteny">Synteny</a>
<!--<a href="#" data-page="plot">Plot</a>-->
<a href="#" data-page="methods">Methods</a>
<a href="#" data-page="about">About</a>
<span class="synima-nav-divider" aria-hidden="true">|</span>
<div class="synima-cloud-account" data-cloud-account hidden>
  <button type="button" class="synima-cloud-account-trigger synima-cloud-user" data-cloud-user aria-expanded="false">
    <span class="synima-cloud-account-label" data-cloud-user-label>Account</span>
    <span class="synima-cloud-caret" aria-hidden="true">▼</span>
  </button>
  <div class="synima-cloud-menu">
    <a href="#" data-cloud-action="login">Login</a>
    <a href="#" data-cloud-action="register">Register</a>
    <a href="#" data-cloud-action="save">Save report</a>
    <a href="#" data-cloud-action="saved">Saved reports</a>
    <a href="#" data-cloud-action="logout">Logout</a>
  </div>
</div>
<span class="synima-cloud-status" data-cloud-status></span>
        </div>

        <!-- Mobile dropdown nav -->
        <div id="mobile-menu" class="mobile-menu synima-nav">
          <a href="#" data-page="orthologs">Orthologs</a>
<a href="#" data-page="tree">Tree</a>
<a href="#" data-page="genes">Genes</a>
<a href="#" data-page="synteny">Synteny</a>
<!--<a href="#" data-page="plot">Plot</a>-->
<a href="#" data-page="methods">Methods</a>
<a href="#" data-page="about">About</a>
<span class="synima-mobile-divider"></span>
<span class="synima-cloud-user" data-cloud-user hidden></span>
<a href="#" data-cloud-action="login">Login</a>
<a href="#" data-cloud-action="register">Register</a>
<a href="#" data-cloud-action="save">Save report</a>
<a href="#" data-cloud-action="saved">Saved reports</a>
<a href="#" data-cloud-action="logout">Logout</a>
<span class="synima-cloud-status" data-cloud-status></span>
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

  const cloudOrigin = function (baseUrl) {
    try {
      return new URL(baseUrl).origin;
    } catch (e) {
      return "";
    }
  };

  const openLoginWindow = function (baseUrl) {
    const next = encodeURIComponent("/auth/connect.php");
    const url = `${baseUrl}/auth/login.php?next=${next}`;
    const popup = window.open(url, "synima-login", "width=540,height=720,resizable=yes,scrollbars=yes");
    if (!popup) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const closeCloudMenus = function () {
    const menus = document.querySelectorAll("[data-cloud-account]");
    menus.forEach((menu) => {
      menu.classList.remove("open");
      const trigger = menu.querySelector("[data-cloud-user]");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  };

  const accountButtons = document.querySelectorAll("[data-cloud-user]");
  accountButtons.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      const account = trigger.closest("[data-cloud-account]");
      if (!account) return;
      const isOpen = account.classList.contains("open");
      closeCloudMenus();
      if (!isOpen) {
        account.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      }
      event.preventDefault();
      event.stopPropagation();
    });
  });

  const ensureCloudApiKey = async function (cloud) {
    if (cloud.apiKey) return cloud;
    await SYNIMA.syncCloudSession();
    const synced = await SYNIMA.refreshCloudState();
    if (synced.apiKey) return synced;

    window.open(`${cloud.baseUrl}/auth/profile.php`, "_blank", "noopener,noreferrer");

    const apiKey = window.prompt("Paste your Synima API key (from profile page) to enable Save/Saved reports:");
    if (apiKey === null) return null;
    if (!apiKey.trim()) throw new Error("API key is required.");

    const email = window.prompt("Email (optional, for display in menu):", cloud.userEmail || "") || cloud.userEmail || "";
    SYNIMA.setCloudAuth(email.trim(), apiKey.trim());
    return await SYNIMA.refreshCloudState();
  };

  const onCloudMessage = async function (event) {
    const cloud = await SYNIMA.refreshCloudState();
    const expectedOrigin = cloudOrigin(cloud.baseUrl);
    if (!expectedOrigin || event.origin !== expectedOrigin) return;

    const data = event.data || {};
    if (!data || data.type !== "SYNIMA_AUTH_CONNECTED" || !data.user) return;

    const email = data.user.email || "";
    const apiKey = data.user.api_key || "";
    if (email || apiKey) {
      SYNIMA.setCloudAuth(email, apiKey);
      renderCloudState(await SYNIMA.refreshCloudState());
      closeCloudMenus();
      window.alert(`Connected as ${email || "user"}.`);
    }
  };
  window.addEventListener("message", onCloudMessage);

  const setCloudAction = function (action, enabled, href) {
    const nodes = document.querySelectorAll(`[data-cloud-action="${action}"]`);
    nodes.forEach((node) => {
      if (enabled) {
        node.classList.remove("synima-disabled-link");
        node.removeAttribute("aria-disabled");
        node.href = href;
      } else {
        node.classList.add("synima-disabled-link");
        node.setAttribute("aria-disabled", "true");
        node.href = "#";
      }
      node.removeAttribute("target");
      node.removeAttribute("rel");
    });
  };

  const setCloudVisibility = function (action, visible) {
    const nodes = document.querySelectorAll(`[data-cloud-action="${action}"]`);
    nodes.forEach((node) => {
      node.hidden = !visible;
    });
  };

  const setCloudAccountVisible = function (visible) {
    const nodes = document.querySelectorAll("[data-cloud-account]");
    nodes.forEach((node) => {
      node.hidden = !visible;
    });
  };

  const renderCloudState = function (cloudState) {
    const hasAuth = Boolean(cloudState.apiKey);
    const userNodes = document.querySelectorAll("[data-cloud-user-label]");
    userNodes.forEach((node) => {
      if (cloudState.userEmail) {
        node.hidden = false;
        node.textContent = cloudState.userEmail;
      } else {
        node.hidden = false;
        node.textContent = "Account";
      }
    });

    const statusNodes = document.querySelectorAll("[data-cloud-status]");
    statusNodes.forEach((node) => {
      let text = cloudState.statusLabel;
      if (cloudState.enabled && cloudState.online && cloudState.reachable) {
        text = hasAuth ? "" : "Not logged in";
      }
      node.textContent = text;
      node.hidden = !text;
      if (cloudState.enabled && cloudState.online && cloudState.reachable) {
        node.classList.add("synima-cloud-status-ok");
      } else {
        node.classList.remove("synima-cloud-status-ok");
      }
    });

    setCloudAction("login", cloudState.enabled, "#");
    setCloudAction("register", cloudState.enabled, "#");
    setCloudAction("save", cloudState.enabled && hasAuth, "#");
    setCloudAction("saved", cloudState.enabled && hasAuth, "#");
    setCloudAction("logout", cloudState.enabled && hasAuth, "#");

    setCloudVisibility("login", cloudState.enabled && !hasAuth);
    setCloudVisibility("register", cloudState.enabled && !hasAuth);
    setCloudVisibility("save", cloudState.enabled && hasAuth);
    setCloudVisibility("saved", cloudState.enabled && hasAuth);
    setCloudVisibility("logout", cloudState.enabled && hasAuth);
    setCloudAccountVisible(cloudState.enabled);
  };

  SYNIMA.refreshCloudState()
    .then(renderCloudState)
    .catch(() => renderCloudState(SYNIMA.cloudState || {
      baseUrl: "",
      enabled: false,
      online: navigator.onLine !== false,
      reachable: false,
      userEmail: "",
      statusLabel: "Offline mode"
    }));

  const cloudClickHandler = function (event) {
    const link = event.target.closest("a[data-cloud-action]");
    if (!link) return;
    if (link.classList.contains("synima-disabled-link")) {
      event.preventDefault();
      return;
    }

    const action = link.getAttribute("data-cloud-action");
    if (!action) return;
    event.preventDefault();

    const run = async function () {
      const cloud = await SYNIMA.refreshCloudState();
      if (!cloud.enabled) return;

      if (action === "register") {
        window.open(`${cloud.baseUrl}/`, "_blank", "noopener,noreferrer");
        return;
      }

      if (action === "login") {
        openLoginWindow(cloud.baseUrl);
        return;
      }

      if (action === "logout") {
        SYNIMA.clearCloudAuth();
        renderCloudState(await SYNIMA.refreshCloudState());
        window.alert("Logged out from local report session.");
        return;
      }

      if (action === "save") {
        closeCloudMenus();
        SYNIMA.cloudUiMode = "save";
        SYNIMA.router("cloud");
        return;
      }

      if (action === "saved") {
        closeCloudMenus();
        SYNIMA.cloudUiMode = "saved";
        SYNIMA.router("cloud");
      }
    };

    run().catch((err) => {
      window.alert(err && err.message ? err.message : "Cloud action failed.");
    });
  };
  document.addEventListener("click", cloudClickHandler);

  // Close mobile/cloud menus when clicking outside
  document.addEventListener("click", function (e) {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("hamburger-btn");

    if (!menu.classList.contains("open")) return;

    // If click is NOT inside the menu AND not on button → close it
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("open");
    }
  });

  document.addEventListener("click", function (e) {
    const inCloudMenu = e.target.closest("[data-cloud-account]");
    if (!inCloudMenu) closeCloudMenus();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeCloudMenus();
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

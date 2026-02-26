SYNIMA.showCloud = async function () {
  const app = document.getElementById("app");
  if (!app) return;

  app.classList.add("max-w-6xl", "mx-auto");
  app.style.maxWidth = "";
  app.style.margin = "";

  const state = await SYNIMA.refreshCloudState();
  const connected = Boolean(state.apiKey);
  const mode = SYNIMA.cloudUiMode || "saved";

  app.innerHTML = `
    <h1 class="text-3xl font-bold mb-6">Cloud Reports</h1>
    <div class="section">
      <p class="mb-3">Cloud status: <strong>${state.statusLabel}</strong></p>
      <p class="mb-5">${connected ? `Connected as <strong>${state.userEmail || "user"}</strong>.` : "Not connected yet."}</p>

      <div class="section" style="margin-top: 1rem;">
        <h2 class="text-2xl font-semibold mb-3">Save Current Report</h2>
        <form id="synima-cloud-save-form" class="space-y-3">
          <div class="synima-cloud-save-row">
            <input id="synima-cloud-report-name" type="text" placeholder="Report name" class="synima-cloud-report-name rounded border border-gray-300 px-3 py-2 bg-white text-gray-900" />
            <button id="synima-cloud-save-btn" type="submit" class="copy-btn">Save report</button>
          </div>
          <div id="synima-cloud-upload-indicator" class="synima-cloud-upload-indicator">
            <div class="synima-cloud-upload-bar"></div>
            <span id="synima-cloud-upload-text">Uploading report...</span>
          </div>
        </form>
        <p id="synima-cloud-save-msg" class="mt-3"></p>
      </div>

      <div class="section" style="margin-top: 1.4rem;">
        <h2 class="text-2xl font-semibold mb-3">Saved Reports</h2>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-bottom:0.8rem;">
          <button id="synima-cloud-refresh-btn" type="button" class="copy-btn">Refresh</button>
        </div>
        <div id="synima-cloud-list"></div>
      </div>
    </div>
  `;

  const msg = document.getElementById("synima-cloud-save-msg");
  const saveBtn = document.getElementById("synima-cloud-save-btn");
  const refreshBtn = document.getElementById("synima-cloud-refresh-btn");
  const listEl = document.getElementById("synima-cloud-list");
  const nameInput = document.getElementById("synima-cloud-report-name");
  const saveForm = document.getElementById("synima-cloud-save-form");
  const uploadIndicator = document.getElementById("synima-cloud-upload-indicator");
  const uploadText = document.getElementById("synima-cloud-upload-text");

  const setMsg = function (text, isError) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.color = isError ? "#fca5a5" : "#86efac";
  };

  const setUploading = function (busy, text) {
    if (uploadIndicator) uploadIndicator.classList.toggle("is-active", Boolean(busy));
    if (uploadText && text) uploadText.textContent = text;
    if (saveBtn) saveBtn.disabled = Boolean(busy);
    if (nameInput) nameInput.disabled = Boolean(busy);
  };

  const gzipToBase64 = async function (input) {
    if (typeof CompressionStream === "undefined") return null;
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(input));
    writer.close();
    const compressed = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };

  const connectFlow = async function () {
    const cloud = await SYNIMA.refreshCloudState();
    const popup = window.open(`${cloud.baseUrl}/auth/connect.php`, "synima-connect", "width=540,height=720,resizable=yes,scrollbars=yes");
    if (!popup) {
      window.open(`${cloud.baseUrl}/auth/connect.php`, "_blank", "noopener,noreferrer");
    }

    const ok = await SYNIMA.pollCloudSession(90000, 1500);
    if (ok) return true;

    // Fallback manual flow when browser blocks third-party cookies/session sharing.
    window.open(`${cloud.baseUrl}/auth/profile.php`, "_blank", "noopener,noreferrer");
    const apiKey = window.prompt("Could not auto-connect. Paste API key from profile page:");
    if (apiKey === null) return false;
    if (!apiKey.trim()) throw new Error("API key is required.");
    const email = window.prompt("Email (optional, for display):", cloud.userEmail || "") || cloud.userEmail || "";
    SYNIMA.setCloudAuth(email.trim(), apiKey.trim());
    await SYNIMA.refreshCloudState();
    return true;
  };

  const loadList = async function () {
    const cloud = await SYNIMA.refreshCloudState();
    if (!cloud.apiKey) {
      if (listEl) listEl.innerHTML = `<p class="text-sm">Sign in from <strong>Account > Login</strong>, then click Refresh.</p>`;
      return;
    }

    const result = await SYNIMA.cloudApi("/api/reports.php", { method: "GET" });
    const reports = Array.isArray(result.reports) ? result.reports : [];
    if (!reports.length) {
      if (listEl) listEl.innerHTML = `<p class="text-sm">No saved reports yet.</p>`;
      return;
    }

    if (listEl) {
      listEl.innerHTML = reports.map((r) => {
        const safe = String(r.name || "").replace(/"/g, "&quot;");
        return `
          <div class="section synima-cloud-report-card">
            <div style="display:flex; justify-content:space-between; gap:0.8rem; flex-wrap:wrap;">
              <div class="synima-cloud-report-meta">
                <strong>${safe}</strong><br/>
                <small>Updated: ${r.updated_at || ""}</small>
              </div>
              <div class="synima-cloud-report-actions">
                <button type="button" class="copy-btn" data-cloud-load-id="${r.id}">Load</button>
                <button type="button" class="copy-btn" data-cloud-rename-id="${r.id}" data-cloud-rename-name="${safe}">Rename</button>
                <button type="button" class="copy-btn" data-cloud-delete-id="${r.id}" data-cloud-delete-name="${safe}">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  };

  if (saveForm) {
    saveForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const run = async function () {
        let cloud = await SYNIMA.refreshCloudState();
        if (!cloud.apiKey) {
          const ok = await connectFlow();
          if (!ok) return;
          cloud = await SYNIMA.refreshCloudState();
        }

        const name = (nameInput && nameInput.value) ? nameInput.value.trim() : "";
        if (!name) throw new Error("Report name is required.");

        const payload = SYNIMA.getCurrentReportPayload();
        const rawReport = JSON.stringify(payload.report);
        const approxBytes = rawReport ? rawReport.length : 0;
        if (approxBytes > (25 * 1024 * 1024)) {
          throw new Error(`Report is too large to upload (${(approxBytes / (1024 * 1024)).toFixed(1)} MB, max 25 MB).`);
        }
        if (approxBytes > (7 * 1024 * 1024)) {
          setMsg(`Large upload (~${(approxBytes / (1024 * 1024)).toFixed(1)} MB). This may fail if server post_max_size is low.`, true);
        }
        const form = new FormData();
        form.append("name", name);

        setUploading(true, "Preparing upload...");
        const maybeCompressed = await gzipToBase64(rawReport || "{}");
        if (maybeCompressed) {
          form.append("report_json_gzip_base64", maybeCompressed);
          form.append("report_encoding", "gzip+base64");
        } else {
          form.append("report_json", rawReport || "{}");
        }
        form.append("summary_json", JSON.stringify(payload.summary || {}));

        setUploading(true, "Uploading report...");
        await SYNIMA.cloudApi("/api/reports.php", {
          method: "POST",
          body: form
        });
        setMsg("Report saved.", false);
        if (nameInput) nameInput.value = "";
        await loadList();
      };

      run()
        .catch((err) => setMsg(err.message || "Save failed.", true))
        .finally(() => setUploading(false));
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadList().catch((err) => setMsg(err.message || "Could not refresh reports.", true));
    });
  }

  if (listEl) {
    listEl.addEventListener("click", function (e) {
      const loadBtn = e.target.closest("[data-cloud-load-id]");
      if (loadBtn) {
        const id = loadBtn.getAttribute("data-cloud-load-id");
        if (!id) return;

        SYNIMA.cloudApi(`/api/report.php?id=${encodeURIComponent(id)}`, { method: "GET" })
          .then((loaded) => {
            const reportData = loaded && loaded.report ? loaded.report.data : null;
            SYNIMA.loadSavedReportPayload(reportData);
          })
          .catch((err) => setMsg(err.message || "Could not load report.", true));
        return;
      }

      const renameBtn = e.target.closest("[data-cloud-rename-id]");
      if (renameBtn) {
        const id = renameBtn.getAttribute("data-cloud-rename-id");
        const prevName = renameBtn.getAttribute("data-cloud-rename-name") || "";
        if (!id) return;
        const next = window.prompt("Rename report:", prevName);
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed) {
          setMsg("Report name is required.", true);
          return;
        }
        SYNIMA.cloudApi(`/api/report.php?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: trimmed })
        })
          .then(() => {
            setMsg("Report renamed.", false);
            return loadList();
          })
          .catch((err) => setMsg(err.message || "Could not rename report.", true));
        return;
      }

      const deleteBtn = e.target.closest("[data-cloud-delete-id]");
      if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-cloud-delete-id");
        const name = deleteBtn.getAttribute("data-cloud-delete-name") || "this report";
        if (!id) return;
        const ok = window.confirm(`Delete report \"${name}\"?`);
        if (!ok) return;
        SYNIMA.cloudApi(`/api/report.php?id=${encodeURIComponent(id)}`, {
          method: "DELETE"
        })
          .then(() => {
            setMsg("Report deleted.", false);
            return loadList();
          })
          .catch((err) => setMsg(err.message || "Could not delete report.", true));
      }
    });
  }

  if (saveBtn && !connected) saveBtn.title = "Connect account first";
  if (mode === "save" && nameInput) nameInput.focus();
  // Try to sync existing website login session automatically.
  await SYNIMA.syncCloudSession();
  await loadList().catch((err) => setMsg(err.message || "Could not load reports.", true));
};

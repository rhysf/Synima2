window.SYNIMA = window.SYNIMA || {};
window.SYNIMA_STATE = window.SYNIMA_STATE || {};
window.SYNIMA_PERSIST_KEYS = window.SYNIMA_PERSIST_KEYS || {};

if (!window.SYNIMA_PERSIST_KEYS.genesCategories) {
  window.SYNIMA_PERSIST_KEYS.genesCategories = "synima_genes_categories";
}

function synimaGeneUid() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function synimaDefaultGeneCategory() {
  return {
    id: synimaGeneUid(),
    name: "Category 1",
    genesText: "",
    shape: "circle",
    size: 10,
    color: "#f59e0b",
    yOffset: -8
  };
}

function synimaNormalizeGeneCategory(cat, idx) {
  const base = synimaDefaultGeneCategory();
  const out = Object.assign({}, base, (cat && typeof cat === "object") ? cat : {});

  out.id = (typeof out.id === "string" && out.id.trim()) ? out.id : synimaGeneUid();
  out.name = (typeof out.name === "string" && out.name.trim()) ? out.name.trim().slice(0, 80) : `Category ${idx + 1}`;
  out.genesText = typeof out.genesText === "string" ? out.genesText : "";

  const shape = String(out.shape || "circle").toLowerCase();
  out.shape = (shape === "circle" || shape === "square" || shape === "triangle") ? shape : "circle";

  const size = Number(out.size);
  out.size = Number.isFinite(size) ? Math.min(30, Math.max(4, size)) : 10;

  const yOffset = Number(out.yOffset);
  out.yOffset = Number.isFinite(yOffset) ? Math.min(100, Math.max(-100, yOffset)) : -8;

  const c = String(out.color || "").trim();
  out.color = /^#([0-9a-fA-F]{6})$/.test(c) ? c : "#f59e0b";

  return out;
}

function synimaLoadGeneCategories() {
  let parsed = [];
  try {
    const raw = localStorage.getItem(window.SYNIMA_PERSIST_KEYS.genesCategories);
    if (raw) parsed = JSON.parse(raw);
  } catch (e) {
    parsed = [];
  }

  const arr = Array.isArray(parsed) ? parsed : [];
  window.SYNIMA_STATE.geneCategories = arr.map((c, i) => synimaNormalizeGeneCategory(c, i));

  if (window.SYNIMA_STATE.geneCategories.length === 0) {
    window.SYNIMA_STATE.geneCategories = [synimaDefaultGeneCategory()];
  }
}

function synimaSaveGeneCategories() {
  const safe = (window.SYNIMA_STATE.geneCategories || []).map((c, i) => synimaNormalizeGeneCategory(c, i));
  window.SYNIMA_STATE.geneCategories = safe;
  try {
    localStorage.setItem(window.SYNIMA_PERSIST_KEYS.genesCategories, JSON.stringify(safe));
  } catch (e) {}
}

function synimaParseGeneLines(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const v = line.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function synimaParseGeneLinesDetailed(text) {
  const lines = String(text || "").split(/\r?\n/);
  return lines.map((raw, i) => {
    const trimmed = String(raw || "").trim();
    const isBlank = trimmed.length === 0;
    const isComment = !isBlank && (trimmed.startsWith("#") || trimmed.startsWith("//"));
    return {
      lineNo: i + 1,
      raw: String(raw || ""),
      query: trimmed,
      isBlank,
      isComment
    };
  });
}

function synimaGeneLookupKeys(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const keys = new Set();
  keys.add(raw.toLowerCase());
  if (raw.includes("|")) {
    const bare = raw.split("|").pop().trim().toLowerCase();
    if (bare) keys.add(bare);
  }
  return Array.from(keys);
}

function synimaParseAligncoordsGeneIndex(aligncoordsText) {
  const text = String(aligncoordsText || "");
  if (SYNIMA._geneAligncoordsIndexCache && SYNIMA._geneAligncoordsIndexCache.raw === text) {
    return SYNIMA._geneAligncoordsIndexCache.index;
  }

  const index = Object.create(null);
  const lines = text.split(/\r?\n/);

  const addHit = function (geneName, hit) {
    const lookupKeys = synimaGeneLookupKeys(geneName);
    if (lookupKeys.length === 0) return;

    for (const k of lookupKeys) {
      if (!index[k]) index[k] = { gene: String(geneName || "").trim(), hits: [], _seen: new Set() };

      const seenKey = `${hit.genome}|${hit.contig}|${hit.start}|${hit.end}`;
      if (index[k]._seen.has(seenKey)) continue;
      index[k]._seen.add(seenKey);
      index[k].hits.push(hit);
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;

    const cols = t.split("\t");
    const mi = cols.indexOf("MATCHES");
    if (mi < 0 || cols.length <= mi + 5) continue;

    const g1 = cols[0] || "";
    const c1 = cols[1] || "";
    const gene1 = cols[2] || "";
    const s1 = parseInt(cols[3], 10);
    const e1 = parseInt(cols[4], 10);

    const g2 = cols[mi + 1] || "";
    const c2 = cols[mi + 2] || "";
    const gene2 = cols[mi + 3] || "";
    const s2 = parseInt(cols[mi + 4], 10);
    const e2 = parseInt(cols[mi + 5], 10);

    if (!g1 || !c1 || Number.isNaN(s1) || Number.isNaN(e1)) continue;
    if (!g2 || !c2 || Number.isNaN(s2) || Number.isNaN(e2)) continue;

    addHit(gene1, {
      gene: gene1,
      genome: g1,
      contig: c1,
      start: Math.min(s1, e1),
      end: Math.max(s1, e1)
    });

    addHit(gene2, {
      gene: gene2,
      genome: g2,
      contig: c2,
      start: Math.min(s2, e2),
      end: Math.max(s2, e2)
    });
  }

  Object.values(index).forEach((entry) => {
    delete entry._seen;
  });

  SYNIMA._geneAligncoordsIndexCache = { raw: text, index };
  return index;
}

function synimaEscapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

SYNIMA.getGeneCategoryStatuses = function (aligncoordsText) {
  synimaLoadGeneCategories();
  const idx = synimaParseAligncoordsGeneIndex(aligncoordsText);

  return (window.SYNIMA_STATE.geneCategories || []).map((cat, i) => {
    const c = synimaNormalizeGeneCategory(cat, i);
    const lines = synimaParseGeneLinesDetailed(c.genesText).map((line) => {
      if (line.isBlank || line.isComment) {
        return Object.assign({}, line, {
          found: false,
          genomes: [],
          hits: []
        });
      }

      const keys = synimaGeneLookupKeys(line.query);
      const hitMap = new Map();
      for (const key of keys) {
        const entry = idx[key];
        if (!entry || !Array.isArray(entry.hits)) continue;
        for (const h of entry.hits) {
          const hk = `${h.genome}|${h.contig}|${h.start}|${h.end}`;
          if (!hitMap.has(hk)) hitMap.set(hk, h);
        }
      }
      const hits = Array.from(hitMap.values());
      const genomes = Array.from(new Set(hits.map((h) => h.genome))).sort();
      return Object.assign({}, line, {
        found: hits.length > 0,
        genomes,
        hits
      });
    });

    return { category: c, lines };
  });
};

SYNIMA.getGeneMarkersForSynteny = function (aligncoordsText) {
  const statusByCategory = SYNIMA.getGeneCategoryStatuses(aligncoordsText);
  const markers = [];
  const markerSeen = new Set();

  statusByCategory.forEach(({ category, lines }) => {
    lines.forEach((st) => {
      if (st.isBlank || st.isComment) return;
      if (!st.found) return;
      st.hits.forEach((hit) => {
        const pos = (Number(hit.start) + Number(hit.end)) / 2;
        const dedupeKey = `${category.id}|${st.query}|${hit.genome}|${hit.contig}|${hit.start}|${hit.end}`;
        if (markerSeen.has(dedupeKey)) return;
        markerSeen.add(dedupeKey);
        markers.push({
          categoryId: category.id,
          categoryName: category.name,
          gene: st.query,
          genome: hit.genome,
          contig: hit.contig,
          pos,
          shape: category.shape,
          size: category.size,
          color: category.color,
          yOffset: category.yOffset
        });
      });
    });
  });

  return markers;
};

SYNIMA.showGenes = function () {
  const app = document.getElementById("app");
  if (!app) return;

  const raw = document.getElementById("data-synteny");
  const data = raw ? JSON.parse(raw.textContent || "{}") : {};
  const aligncoords = data.aligncoords || "";

  app.classList.add("max-w-6xl", "mx-auto");
  app.style.maxWidth = "";
  app.style.margin = "";
  app.style.padding = "";

  synimaLoadGeneCategories();

  app.innerHTML = `
    <div class="section">
      <h1>Genes</h1>
      <p>Paste one gene per line. Found genes can be rendered as glyphs on the Synteny tab.</p>
      <button id="synima-gene-add-category" class="copy-btn" type="button">Add category</button>
    </div>
    <div id="synima-gene-categories" class="synima-genes-categories"></div>
  `;

  const host = document.getElementById("synima-gene-categories");

  function rerenderSyntenyIfReady() {
    if (typeof SYNIMA._syntenyRerender === "function") SYNIMA._syntenyRerender();
  }

  function renderCategories() {
    const items = SYNIMA.getGeneCategoryStatuses(aligncoords);

    host.innerHTML = items.map(({ category, lines }) => {
      const rows = lines.length ? lines.map((st) => {
        if (st.isBlank) {
          return `
            <div class="synima-gene-status-row synima-gene-status-row-muted">
              <span class="synima-gene-status-line">${st.lineNo}</span>
              <span class="synima-gene-status-icon" title="Blank line" aria-label="Blank line">·</span>
              <span class="synima-gene-status-gene">&nbsp;</span>
            </div>
          `;
        }

        if (st.isComment) {
          return `
            <div class="synima-gene-status-row synima-gene-status-row-muted">
              <span class="synima-gene-status-line">${st.lineNo}</span>
              <span class="synima-gene-status-icon" title="Comment line" aria-label="Comment line">#</span>
              <span class="synima-gene-status-gene">${synimaEscapeHtml(st.raw)}</span>
            </div>
          `;
        }

        const tip = st.found
          ? `Gene found in genome(s): ${st.genomes.join(", ")}`
          : "Gene not found";
        const symbol = st.found ? "&#10003;" : "&#10007;";
        const iconClass = st.found ? "synima-gene-found" : "synima-gene-missing";
        return `
          <div class="synima-gene-status-row">
            <span class="synima-gene-status-line">${st.lineNo}</span>
            <span class="synima-gene-status-icon ${iconClass}" title="${synimaEscapeHtml(tip)}" aria-label="${synimaEscapeHtml(tip)}">${symbol}</span>
            <span class="synima-gene-status-gene">${synimaEscapeHtml(st.raw)}</span>
          </div>
        `;
      }).join("") : `<p class="synima-gene-empty">No genes entered yet.</p>`;

      return `
        <div class="section synima-gene-card" data-gene-category-id="${synimaEscapeHtml(category.id)}">
          <div class="synima-gene-card-row">
            <label>Name
              <input type="text" data-gene-field="name" value="${synimaEscapeHtml(category.name)}" maxlength="80" />
            </label>
            <label>Glyph
              <select data-gene-field="shape">
                <option value="circle" ${category.shape === "circle" ? "selected" : ""}>Circle</option>
                <option value="square" ${category.shape === "square" ? "selected" : ""}>Square</option>
                <option value="triangle" ${category.shape === "triangle" ? "selected" : ""}>Triangle</option>
              </select>
            </label>
            <label>Size
              <input type="number" data-gene-field="size" min="4" max="30" step="1" value="${category.size}" />
            </label>
            <label>Colour
              <input type="color" data-gene-field="color" value="${synimaEscapeHtml(category.color)}" />
            </label>
            <label>Y offset
              <input type="number" data-gene-field="yOffset" min="-100" max="100" step="1" value="${category.yOffset}" />
            </label>
            <button type="button" class="copy-btn" data-gene-action="remove">Remove</button>
          </div>

          <div class="synima-gene-io-row">
            <label class="synima-gene-io-label">Genes (one per line)
              <textarea data-gene-field="genesText" rows="8" wrap="off" placeholder="geneA\ngeneB\ngeneC">${synimaEscapeHtml(category.genesText)}</textarea>
            </label>

            <div class="synima-gene-status-col">
              <div class="synima-gene-status-title">Status</div>
              <div class="synima-gene-status-list">
                ${rows}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  const debouncedInput = (() => {
    let t = null;
    return function (cb) {
      if (t) clearTimeout(t);
      t = setTimeout(cb, 120);
    };
  })();

  function withCategoryFromTarget(target, cb) {
    const card = target.closest("[data-gene-category-id]");
    if (!card) return;
    const id = card.getAttribute("data-gene-category-id");
    const arr = window.SYNIMA_STATE.geneCategories || [];
    const idx = arr.findIndex((c) => c && c.id === id);
    if (idx < 0) return;
    cb(arr, idx);
  }

  host.addEventListener("change", (e) => {
    const fieldEl = e.target.closest("[data-gene-field]");
    if (!fieldEl) return;

    withCategoryFromTarget(fieldEl, (arr, idx) => {
      const field = fieldEl.getAttribute("data-gene-field");
      if (field === "name" || field === "genesText" || field === "shape" || field === "color") {
        arr[idx][field] = fieldEl.value;
      } else if (field === "size" || field === "yOffset") {
        arr[idx][field] = Number(fieldEl.value);
      }
      arr[idx] = synimaNormalizeGeneCategory(arr[idx], idx);
      synimaSaveGeneCategories();
      renderCategories();
      rerenderSyntenyIfReady();
    });
  });

  host.addEventListener("input", (e) => {
    const fieldEl = e.target.closest("[data-gene-field='genesText']");
    if (!fieldEl) return;

    withCategoryFromTarget(fieldEl, (arr, idx) => {
      arr[idx].genesText = fieldEl.value;
      debouncedInput(() => {
        arr[idx] = synimaNormalizeGeneCategory(arr[idx], idx);
        synimaSaveGeneCategories();
        renderCategories();
        rerenderSyntenyIfReady();
      });
    });
  });

  host.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-gene-action='remove']");
    if (!btn) return;

    withCategoryFromTarget(btn, (arr, idx) => {
      arr.splice(idx, 1);
      if (arr.length === 0) arr.push(synimaDefaultGeneCategory());
      arr.forEach((c, i) => {
        c.name = c.name && c.name.trim() ? c.name : `Category ${i + 1}`;
      });
      synimaSaveGeneCategories();
      renderCategories();
      rerenderSyntenyIfReady();
    });
  });

  document.getElementById("synima-gene-add-category")?.addEventListener("click", () => {
    const arr = window.SYNIMA_STATE.geneCategories || [];
    const next = synimaDefaultGeneCategory();
    next.name = `Category ${arr.length + 1}`;
    arr.push(next);
    synimaSaveGeneCategories();
    renderCategories();
    rerenderSyntenyIfReady();
  });

  renderCategories();
};

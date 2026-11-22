window.SYNIMA = window.SYNIMA || {};
window.SYNIMA_STATE = window.SYNIMA_STATE || {};
window.SYNIMA_PERSIST_KEYS = window.SYNIMA_PERSIST_KEYS || {};

if (!window.SYNIMA_PERSIST_KEYS.genesCategories) {
  window.SYNIMA_PERSIST_KEYS.genesCategories = "synima_genes_categories";
}

function synimaGeneUid() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const SYNIMA_GENE_CATEGORY_STYLES = [
  ["#f59e0b", "circle"],
  ["#0ea5e9", "square"],
  ["#ec4899", "triangle"],
  ["#10b981", "circle"],
  ["#8b5cf6", "square"],
  ["#f97316", "triangle"],
  ["#84cc16", "square"],
  ["#ef4444", "circle"],
  ["#14b8a6", "triangle"],
  ["#a855f7", "circle"]
];

function synimaDefaultGeneCategory(idx = 0, styleIndex = idx) {
  const [color, shape] = SYNIMA_GENE_CATEGORY_STYLES[styleIndex % SYNIMA_GENE_CATEGORY_STYLES.length];
  return {
    id: synimaGeneUid(),
    name: `Category ${idx + 1}`,
    genesText: "",
    shape,
    size: 10,
    color,
    yOffset: -8
  };
}

function synimaNormalizeGeneCategory(cat, idx) {
  const base = synimaDefaultGeneCategory(idx);
  const out = Object.assign({}, base, (cat && typeof cat === "object") ? cat : {});

  out.id = (typeof out.id === "string" && out.id.trim()) ? out.id : synimaGeneUid();
  out.name = (typeof out.name === "string" && out.name.trim()) ? out.name.trim().slice(0, 80) : `Category ${idx + 1}`;
  out.genesText = typeof out.genesText === "string" ? out.genesText : "";
  out.orthologCategoryName = typeof out.orthologCategoryName === "string" ? out.orthologCategoryName : null;
  out.functionalType = ["signalp", "d2go", "eggnog", "other"].includes(out.functionalType) ? out.functionalType : "";
  out.functionalField = typeof out.functionalField === "string" ? out.functionalField : "GOs";
  out.functionalSelection = typeof out.functionalSelection === "string" ? out.functionalSelection : "";

  const shape = String(out.shape || base.shape).toLowerCase();
  out.shape = (shape === "circle" || shape === "square" || shape === "triangle") ? shape : base.shape;

  const size = Number(out.size);
  out.size = Number.isFinite(size) ? Math.min(30, Math.max(4, size)) : 10;

  const yOffset = Number(out.yOffset);
  out.yOffset = Number.isFinite(yOffset) ? Math.min(100, Math.max(-100, yOffset)) : -8;

  const c = String(out.color || "").trim();
  out.color = /^#([0-9a-fA-F]{6})$/.test(c) ? c : base.color;

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
    const bare = raw.slice(raw.indexOf("|") + 1).trim().toLowerCase();
    if (bare) keys.add(bare);
  }
  return Array.from(keys);
}

const ORTHOLOG_SUMMARY_CATEGORY_NAMES = new Map([
  ["unique", "Unique"],
  ["aux", "Aux"],
  ["core_multi", "Core (multi)"],
  ["core_1to1", "Core (1:1)"]
]);

let orthologGeneDataCache;
function synimaOrthologGeneData() {
  const raw = document.getElementById("data-orthologs")?.textContent || "";
  if (orthologGeneDataCache?.raw === raw) return orthologGeneDataCache;
  let data = {};
  try { data = JSON.parse(raw) || {}; } catch (e) {}
  orthologGeneDataCache = {
    raw,
    categories: Array.isArray(data.gene_categories)
      ? data.gene_categories.filter(c => c && Array.isArray(c.genes)
        && (typeof c.genome === "string"
          ? c.kind === "unique" || c.kind === "lost"
          : c.genome == null && ORTHOLOG_SUMMARY_CATEGORY_NAMES.has(c.kind)))
      : [],
    loci: Array.isArray(data.category_gene_loci) ? data.category_gene_loci : []
  };
  return orthologGeneDataCache;
}

function synimaOrthologCategoryPresets(categories) {
  const specific = categories.filter(category => typeof category.genome === "string");
  const presets = [];
  for (const [kind, name] of ORTHOLOG_SUMMARY_CATEGORY_NAMES) {
    const summary = categories.find(category => category.genome == null && category.kind === kind);
    if (summary) {
      presets.push({ name, genesText: summary.genes.join("\n") });
    } else if (kind === "unique" && specific.some(category => category.kind === "unique")) {
      // Older reports contain only per-genome categories.
      const genes = specific.filter(category => category.kind === "unique").flatMap(category => category.genes);
      presets.push({ name, genesText: [...new Set(genes)].sort().join("\n") });
    }
  }
  for (const { genome, kind, genes } of specific) {
    const name = kind === "unique" ? `Unique in ${genome}` : `Uniquely lost in ${genome}`;
    presets.push({ name, genome, kind, genesText: genes.join("\n") });
  }
  return presets;
}

function synimaParseAligncoordsGeneIndex(aligncoordsText) {
  const text = String(aligncoordsText || "");
  const { loci } = synimaOrthologGeneData();
  if (SYNIMA._geneAligncoordsIndexCache?.raw === text && SYNIMA._geneAligncoordsIndexCache.loci === loci) {
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

  for (const locus of loci) addHit(locus.gene, locus);

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

  SYNIMA._geneAligncoordsIndexCache = { raw: text, loci, index };
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

function synimaGeneStatusLines(genesText, idx) {
  return synimaParseGeneLinesDetailed(genesText).map(line => {
    if (line.isBlank || line.isComment) return { ...line, found: false, genomes: [], hits: [] };
    // Qualified queries must not match a gene with the same ID in another genome.
    const hits = idx[line.query.toLowerCase()]?.hits || [];
    const genomes = Array.from(new Set(hits.map(h => h.genome))).sort();
    return { ...line, found: hits.length > 0, genomes, hits };
  });
}

function synimaGeneGutterRows(lines) {
  return lines.map(line => {
    let icon = "·";
    let css = "";
    let status = "Blank line";
    if (line.isComment) {
      icon = "#";
      status = "Comment line";
    } else if (!line.isBlank) {
      icon = line.found ? "✓" : "✗";
      css = line.found ? "synima-gene-found" : "synima-gene-missing";
      status = line.found ? `Gene found in ${line.genomes.join(", ")}` : "Gene not found";
    }
    return `<div class="synima-gene-gutter-line" title="${synimaEscapeHtml(status)}">
      <span>${line.lineNo}</span>
      <span class="synima-gene-status-icon ${css}" aria-label="${synimaEscapeHtml(status)}">${icon}</span>
    </div>`;
  }).join("");
}

SYNIMA.getGeneCategoryStatuses = function (aligncoordsText) {
  synimaLoadGeneCategories();
  const idx = synimaParseAligncoordsGeneIndex(aligncoordsText);
  return (window.SYNIMA_STATE.geneCategories || []).map((cat, i) => {
    const category = synimaNormalizeGeneCategory(cat, i);
    return { category, lines: synimaGeneStatusLines(category.genesText, idx) };
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

function synimaUpdateGeneCategoryControls() {
  const loggedIn = SYNIMA.hasCloudAuth();
  document.querySelectorAll("[data-ortholog-category]").forEach((select) => {
    const hasCategories = select.options.length > 1;
    select.disabled = !loggedIn || !hasCategories;
    const message = !loggedIn ? "Log in to use ortholog categories"
      : hasCategories ? "Choose a category" : "No categories in this report";
    select.options[0].textContent = message;
    select.parentElement.title = select.disabled ? message : "";
  });
  const controls = document.querySelectorAll("[data-functional-category]");
  if (!controls.length) return;
  const annotations = SYNIMA.getFunctionalAnnotations?.() || new Map();
  const initial = annotations.size ? "Choose a category" : "Import annotations on the Function tab";
  const options = `<option value="">${initial}</option>` +
    Array.from(annotations, ([key, annotation]) =>
      `<option value="${key}">${synimaEscapeHtml(annotation.type.label)}</option>`
    ).join("");
  const categories = new Map((window.SYNIMA_STATE.geneCategories || []).map(category => [category.id, category]));
  controls.forEach(select => {
    const card = select.closest("[data-gene-category-id]");
    const category = categories.get(card.getAttribute("data-gene-category-id"));
    const type = category?.functionalType;
    select.innerHTML = options;
    select.value = annotations.has(type) ? type : "";
    select.disabled = !loggedIn || annotations.size === 0;
    select.parentElement.hidden = !loggedIn;
    const isEggnog = loggedIn && select.value === "eggnog";
    const fieldSelect = card.querySelector("[data-gene-field='functionalField']");
    const fields = annotations.get("eggnog")?.type.fields.filter(field => field.selectionLabel) || [];
    fieldSelect.innerHTML = fields.map(field =>
      `<option value="${field.key}">${synimaEscapeHtml(field.selectionLabel)}</option>`
    ).join("");
    fieldSelect.value = synimaFunctionalField(category, annotations.get("eggnog"))?.key || "";
    fieldSelect.parentElement.hidden = !isEggnog;
    const selection = card.querySelector("[data-functional-selection]");
    selection.hidden = !loggedIn || !select.value || select.value === "signalp";
    selection.querySelector("input").placeholder = select.value === "d2go" || (isEggnog && fieldSelect.value === "GOs")
      ? "GO:0005737" : "Exact value";
  });
}

window.addEventListener("synima-cloud-auth-changed", synimaUpdateGeneCategoryControls);
window.addEventListener("storage", (event) => {
  if (event.key === null || event.key === window.SYNIMA_CLOUD_KEYS.apiKey) {
    synimaUpdateGeneCategoryControls();
  }
});

function synimaSelectedOrthologCategory(category, presets) {
  if (typeof category.orthologCategoryName === "string") {
    return presets.find(preset => preset.name === category.orthologCategoryName);
  }
  // Recover selections from cards saved before the selection was stored explicitly.
  return presets.find(preset =>
    preset.name.toLowerCase() === category.name.toLowerCase() && preset.genesText === category.genesText
  );
}

function synimaFunctionalField(category, annotation) {
  const fields = annotation?.type.fields.filter(field => field.selectionLabel) || [];
  return fields.find(field => field.key === category?.functionalField) || fields[0];
}

function synimaApplyGeneCategoryFilters(category, presets) {
  const ortholog = synimaSelectedOrthologCategory(category, presets);
  category.orthologCategoryName = ortholog?.name || "";
  const annotation = SYNIMA.getFunctionalAnnotations?.().get(category.functionalType);
  const value = category.functionalType === "signalp" ? "Y" : category.functionalSelection;
  const eggnogField = category.functionalType === "eggnog" ? synimaFunctionalField(category, annotation) : null;
  if (!annotation || !value) {
    if (ortholog) {
      category.name = ortholog.name;
      category.genesText = ortholog.genesText;
    }
    return;
  }

  const allowed = ortholog ? new Set(ortholog.genesText.split("\n")) : null;
  const field = eggnogField?.key || annotation.type.fields[0].key;
  const query = value.toUpperCase();
  const genes = [];
  for (const [id, row] of annotation.byId) {
    if (allowed && !allowed.has(id)) continue;
    const values = row.get(field);
    if (values && [...values].some(item => item.toUpperCase() === query)) genes.push(id);
  }
  const name = eggnogField ? `eggNOG ${eggnogField.selectionLabel}: ${value}`
    : category.functionalType === "signalp" ? "SignalP prediction"
    : category.functionalType === "other" ? `Other: ${value}` : `D2GO: ${value}`;
  category.name = ortholog ? `${name} (${ortholog.name})` : name;
  category.genesText = genes.sort().join("\n");
}

SYNIMA.showGenes = function () {
  const app = document.getElementById("app");
  if (!app) return;

  const raw = document.getElementById("data-synteny");
  const data = raw ? JSON.parse(raw.textContent || "{}") : {};
  const aligncoords = data.aligncoords || "";
  const orthologCategories = synimaOrthologCategoryPresets(synimaOrthologGeneData().categories);

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
      const ortholog = synimaSelectedOrthologCategory(category, orthologCategories);
      const options = orthologCategories.map((preset, i) =>
        `<option value="${i}" ${preset === ortholog ? "selected" : ""}>${synimaEscapeHtml(preset.name)}</option>`
      ).join("");
      const combined = ortholog && (category.functionalType === "signalp" || category.functionalSelection);
      const emptyStatus = combined ? "No genes match both categories."
        : category.functionalSelection ? `No genes match ${category.functionalSelection}.`
        : category.functionalType === "signalp" ? "No genes have a positive SignalP call."
        : ortholog ? "No genes in this ortholog category." : "No genes entered yet.";
      const textareaId = `synima-genes-${synimaEscapeHtml(category.id)}`;

      return `
        <div class="section synima-gene-card" data-gene-category-id="${synimaEscapeHtml(category.id)}">
          <div class="synima-gene-card-row">
            <label>Name
              <input type="text" data-gene-field="name" value="${synimaEscapeHtml(category.name)}" maxlength="80" />
            </label>
            <label>Ortholog Category
              <select data-gene-field="orthologCategory" data-ortholog-category disabled>
                <option value="">Choose a category</option>
                ${options}
              </select>
            </label>
            <label class="synima-functional-category-field" hidden>Functional Category
              <select data-gene-field="functionalCategory" data-functional-category></select>
            </label>
            <label class="synima-functional-category-field" hidden>Annotation field
              <select data-gene-field="functionalField"></select>
            </label>
            <label class="synima-functional-category-field" data-functional-selection hidden>Selection
              <input type="text" data-gene-field="functionalSelection" placeholder="GO:0005737"
                title="Press Enter to apply a selection" value="${synimaEscapeHtml(category.functionalSelection)}" />
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

          <label for="${textareaId}">Genes (one per line)</label>
          <div class="synima-gene-editor" style="--synima-gene-number-width:${String(lines.length).length}ch">
            <div class="synima-gene-gutter"><div data-gene-gutter>${synimaGeneGutterRows(lines)}</div></div>
            <textarea id="${textareaId}" data-gene-field="genesText" rows="8" wrap="off" placeholder="geneA\ngeneB\ngeneC">
${synimaEscapeHtml(category.genesText)}</textarea>
          </div>
          <p class="synima-gene-empty" data-gene-empty${category.genesText ? " hidden" : ""}>${synimaEscapeHtml(emptyStatus)}</p>
        </div>
      `;
    }).join("");
    synimaUpdateGeneCategoryControls();
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

  function applyFunctionalSelection(input, commit) {
    if (!SYNIMA.hasCloudAuth()) return;
    withCategoryFromTarget(input, (arr, idx) => {
      const category = arr[idx];
      const annotation = SYNIMA.getFunctionalAnnotations?.().get(category.functionalType);
      if (!annotation || category.functionalType === "signalp") return;
      const go = category.functionalType === "d2go" || synimaFunctionalField(category, annotation)?.key === "GOs";
      if (!go && !commit) return;
      const raw = input.value.trim();
      const term = go ? raw.toUpperCase() : raw;
      if ((go && term && !/^GO:\d{7}$/.test(term)) || category.functionalSelection === term) return;
      category.functionalSelection = term;
      synimaApplyGeneCategoryFilters(category, orthologCategories);
      const hadFocus = document.activeElement === input;
      synimaSaveGeneCategories();
      renderCategories();
      if (hadFocus) {
        host.querySelector(
          `[data-gene-category-id="${CSS.escape(category.id)}"] [data-gene-field="functionalSelection"]`
        )?.focus({ preventScroll: true });
      }
      rerenderSyntenyIfReady();
    });
  }

  host.addEventListener("change", (e) => {
    const fieldEl = e.target.closest("[data-gene-field]");
    if (!fieldEl) return;
    const field = fieldEl.getAttribute("data-gene-field");
    if (field === "functionalSelection") {
      applyFunctionalSelection(fieldEl, true);
      return;
    }
    if (field === "genesText") return; // Input already saves the text without resetting the editor.

    withCategoryFromTarget(fieldEl, (arr, idx) => {
      if (field === "orthologCategory") {
        if (fieldEl.disabled || !SYNIMA.hasCloudAuth()) return;
        const preset = fieldEl.value === "" ? null : orthologCategories[Number(fieldEl.value)];
        if (fieldEl.value !== "" && !preset) return;
        arr[idx].orthologCategoryName = preset?.name || "";
        synimaApplyGeneCategoryFilters(arr[idx], orthologCategories);
      } else if (field === "functionalCategory") {
        if (fieldEl.disabled || !SYNIMA.hasCloudAuth()) return;
        const type = fieldEl.value;
        const annotation = SYNIMA.getFunctionalAnnotations?.().get(type);
        if (type && !annotation) return;
        arr[idx].functionalType = type;
        arr[idx].functionalField = "GOs";
        arr[idx].functionalSelection = "";
        synimaApplyGeneCategoryFilters(arr[idx], orthologCategories);
      } else if (field === "functionalField") {
        if (!SYNIMA.hasCloudAuth() || arr[idx].functionalType !== "eggnog") return;
        const annotation = SYNIMA.getFunctionalAnnotations?.().get("eggnog");
        if (!annotation?.type.fields.some(item => item.selectionLabel && item.key === fieldEl.value)) return;
        arr[idx].functionalField = fieldEl.value;
        arr[idx].functionalSelection = "";
        synimaApplyGeneCategoryFilters(arr[idx], orthologCategories);
      } else if (field === "name" || field === "shape" || field === "color") {
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
    const selection = e.target.closest("[data-gene-field='functionalSelection']");
    if (selection) {
      applyFunctionalSelection(selection, false);
      return;
    }

    const fieldEl = e.target.closest("[data-gene-field='genesText']");
    if (!fieldEl) return;

    withCategoryFromTarget(fieldEl, (arr, idx) => {
      arr[idx].genesText = fieldEl.value;
      synimaSaveGeneCategories();

      const lines = synimaGeneStatusLines(fieldEl.value, synimaParseAligncoordsGeneIndex(aligncoords));
      const editor = fieldEl.parentElement;
      const gutter = editor.querySelector("[data-gene-gutter]");
      editor.style.setProperty("--synima-gene-number-width", `${String(lines.length).length}ch`);
      gutter.innerHTML = synimaGeneGutterRows(lines);
      gutter.style.transform = `translateY(${-fieldEl.scrollTop}px)`;
      const empty = editor.parentElement.querySelector("[data-gene-empty]");
      empty.hidden = Boolean(fieldEl.value);
      empty.textContent = "No genes entered yet.";
      debouncedInput(rerenderSyntenyIfReady);
    });
  });

  host.addEventListener("scroll", (event) => {
    const input = event.target;
    if (input.matches?.("[data-gene-field='genesText']")) {
      input.parentElement.querySelector("[data-gene-gutter]").style.transform = `translateY(${-input.scrollTop}px)`;
    }
  }, true);

  host.addEventListener("keydown", (e) => {
    const input = e.target.closest("[data-gene-field='functionalSelection']");
    if (!input || e.key !== "Enter") return;
    e.preventDefault();
    applyFunctionalSelection(input, true);
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
    const unusedStyle = SYNIMA_GENE_CATEGORY_STYLES.findIndex(([color, shape]) =>
      !arr.some(category => category.color.toLowerCase() === color && category.shape === shape)
    );
    arr.push(synimaDefaultGeneCategory(arr.length, unusedStyle < 0 ? arr.length : unusedStyle));
    synimaSaveGeneCategories();
    renderCategories();
    rerenderSyntenyIfReady();
  });

  renderCategories();
};

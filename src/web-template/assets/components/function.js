const SYNIMA_SIGNALP_EXAMPLE = `# SignalP-4.1 euk predictions
#Name\tCmax\tpos\tYmax\tpos\tSmax\tpos\tSmean\tD\t?\tDmaxcut\tNetworks-used
CNB2|7000010424374377\t0.316\t67\t0.182\t67\t0.195\t41\t0.111\t0.143\tN\t0.450\tSignalP-noTM`;
const SYNIMA_SIGNALP_KEY = "Y = signal peptide predicted. N = no signal peptide predicted. ? = no prediction available for this gene.";
const SYNIMA_D2GO_EXAMPLE = `#gene_id\tgene_name\tspecies\te-value\tGO-term\tevidence_code\tqualifier\tcategory
CA1280|7000010362783547\tXP_066606293.1 uncharacterized protein I312_102342\tCryptococcus bacillisporus CA1280\t4.89e-165\tGO:0046316\tIEA\tenables\tF`;
const SYNIMA_EGGNOG_EXAMPLE = `#query\tseed_ortholog\tevalue\tscore\teggNOG_OGs\tmax_annot_lvl\tCOG_category\tDescription\tPreferred_name\tGOs\tEC\tKEGG_ko\tKEGG_Pathway\tKEGG_Module\tKEGG_Reaction\tKEGG_rclass\tBRITE\tKEGG_TC\tCAZy\tBiGG_Reaction\tPFAMs
CNB2|7000010424374377\t552467.XP_003197416.1\t0.0\t2336.0\tKOG1248@1|root,KOG1248@2759|Eukaryota,38B52@33154|Opisthokonta,3NZ15@4751|Fungi,3UZTP@5204|Basidiomycota,3VD9D@5234|Tremellales\t4751|Fungi\tJ\tribosomal protein\tRRP12\tGO:0000462,GO:0003674,GO:0003676\t-\tko:K14794\t-\t-\t-\t-\tko00000,ko03009\t-\t-\t-\tNUC173`;

const SYNIMA_EGGNOG_FIELDS = [
  { key: "seed_ortholog", label: "eggNOG seed_ortholog", index: 1 },
  { key: "evalue", label: "eggNOG e-value", index: 2, numeric: true },
  { key: "Description", label: "eggNOG Description", index: 7 },
  { key: "Preferred_name", label: "eggNOG Preferred name", index: 8 },
  ...[
    ["GOs", "GO"], ["EC", "EC"], ["KEGG_ko", "KEGG KO"], ["KEGG_Pathway", "KEGG Pathway"],
    ["KEGG_Module", "KEGG Module"], ["KEGG_Reaction", "KEGG Reaction"], ["KEGG_rclass", "KEGG rclass"],
    ["BRITE", "BRITE"], ["KEGG_TC", "KEGG TC"], ["CAZy", "CAZy"], ["BiGG_Reaction", "BiGG Reaction"],
    ["PFAMs", "PFAM"]
  ].map(([key, selectionLabel], index) => ({ key, label: `eggNOG ${key}`, index: index + 9, selectionLabel }))
];

const SYNIMA_IMPORT_TYPES = new Map([
  ["signalp", {
    label: "SignalP v4", coverage: "have predictions",
    fields: [{ key: "call", label: "SignalP", missing: "?" }],
    description: "Short report from SignalP v4 on all proteins (e.g., repo_spec.txt.all.pep). Expected header and first example data row:",
    example: SYNIMA_SIGNALP_EXAMPLE,
    parse: synimaParseSignalP
  }],
  ["d2go", {
    label: "diamond2GO", coverage: "have GO terms",
    fields: [
      { key: "go", label: "D2GO GO-Terms" },
      { key: "gene_name", label: "D2GO gene_name" },
      { key: "species", label: "D2GO species" },
      { key: "evalue", label: "D2GO e-value", numeric: true }
    ],
    description: "processed.tab report from running diamond2go -q repo_spec.txt.all.pep. Expected header and first example data row:",
    example: SYNIMA_D2GO_EXAMPLE,
    parse: synimaParseD2go
  }],
  ["eggnog", {
    label: "eggNOG-mapper", coverage: "have annotations", fields: SYNIMA_EGGNOG_FIELDS,
    description: "annotations report from running $eggnog-mapper/emapper.py -i repo_spec.txt.all.pep --itype proteins -m diamond --decorate_gff repo_spec.txt.all.gff --excel --data_dir $eggnog-mapper/data/ --output_dir ./ -o eggnog_results --cpu 12 --override. Expected header and first example data row:",
    example: SYNIMA_EGGNOG_EXAMPLE,
    parse: synimaParseEggnog
  }],
  ["other", {
    label: "Other", coverage: "have annotations",
    fields: [{ key: "annotation", label: "Other annotation" }],
    description: "Other annotations in a tab file with column 1 consisting of gene names and column 2 the annotation of gene info.",
    example: "#gene\tannotation\nCNB2|7000010424374377\tRibosomal protein",
    parse: synimaParseOther
  }]
]);

let synimaAnnotationState;

function synimaAnnotationsForReport() {
  const raw = document.getElementById("data-orthologs")?.textContent || "{}";
  if (synimaAnnotationState?.raw === raw) return synimaAnnotationState;
  const data = JSON.parse(raw) || {};
  const ids = new Set(Array.isArray(data.gene_ids) ? data.gene_ids.filter(id => typeof id === "string" && id) : []);
  const aliases = new Map(Object.entries(data.gene_aliases || {}).filter(([, target]) => ids.has(target)));
  const genes = Array.from(ids, id => {
    const separator = id.indexOf("|");
    return {
      id,
      species: separator < 0 ? "" : id.slice(0, separator),
      gene: separator < 0 ? id : id.slice(separator + 1)
    };
  });
  synimaAnnotationState = { raw, ids, aliases, genes, files: [], annotations: new Map() };
  return synimaAnnotationState;
}

SYNIMA.getFunctionalAnnotations = function () {
  if (!SYNIMA.hasCloudAuth() || !synimaAnnotationState?.files.length) return new Map();
  return synimaAnnotationsForReport().annotations;
};

function synimaClearAnnotationsAfterLogout() {
  if (!SYNIMA.hasCloudAuth()) synimaAnnotationState = undefined;
}

window.addEventListener("synima-cloud-auth-changed", synimaClearAnnotationsAfterLogout);
window.addEventListener("storage", event => {
  if (event.key === null || event.key === window.SYNIMA_CLOUD_KEYS.apiKey) synimaClearAnnotationsAfterLogout();
});

function* synimaAnnotationLines(text) {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) yield [index + 1, line];
  }
}

function synimaParseSignalP(text) {
  const predictions = new Map();
  for (const [lineNumber, line] of synimaAnnotationLines(text)) {
    const columns = line.trim().split(/\s+/);
    const call = columns[9];
    if (columns.length !== 12 || (call !== "Y" && call !== "N")) {
      throw new Error(`Line ${lineNumber} must either start with a # or have 12 SignalP v4 short-report columns and Y or N in column 10.`);
    }
    const id = columns[0];
    if (predictions.has(id) && !predictions.get(id).get("call").has(call)) {
      throw new Error(`Line ${lineNumber} gives conflicting predictions for ${id}.`);
    }
    predictions.set(id, new Map([["call", new Set([call])]]));
  }
  if (predictions.size === 0) throw new Error("The file has no prediction rows.");
  return predictions;
}

function synimaParseD2go(text) {
  const annotations = new Map();
  for (const [lineNumber, line] of synimaAnnotationLines(text)) {
    const columns = line.split("\t");
    const id = columns[0].trim();
    const term = columns[4]?.trim().toUpperCase();
    if (columns.length !== 8 || !id || !/^GO:\d{7}$/.test(term || "")) {
      throw new Error(`Line ${lineNumber} must either start with a # or have 8 tab-separated D2GO columns, with a gene ID in column 1 and a GO term in column 5.`);
    }
    synimaMergeAnnotationRow(annotations, id, [
      ["go", [term]], ["gene_name", [columns[1].trim()]], ["species", [columns[2].trim()]],
      ["evalue", [columns[3].trim()]]
    ]);
  }
  if (annotations.size === 0) throw new Error("The file has no GO-term rows.");
  return annotations;
}

function synimaParseEggnog(text) {
  const annotations = new Map();
  for (const [lineNumber, line] of synimaAnnotationLines(text)) {
    const columns = line.split("\t");
    const id = columns[0].trim();
    if (columns.length !== 21 || !id) {
      throw new Error(`Line ${lineNumber} must either start with a # or have 21 tab-separated eggNOG annotation columns, with a query ID in column 1.`);
    }
    synimaMergeAnnotationRow(annotations, id, SYNIMA_EGGNOG_FIELDS.map(field => [
      field.key,
      field.selectionLabel ? columns[field.index].split(",").map(value => value.trim()) : [columns[field.index].trim()]
    ]));
  }
  if (annotations.size === 0) throw new Error("The file has no eggNOG annotation rows.");
  return annotations;
}

function synimaParseOther(text) {
  const annotations = new Map();
  for (const [lineNumber, line] of synimaAnnotationLines(text)) {
    const columns = line.split("\t");
    const id = columns[0].trim();
    if (columns.length !== 2 || !id) {
      throw new Error(`Line ${lineNumber} must either start with a # or have two tab-separated columns with a gene name in column 1.`);
    }
    synimaMergeAnnotationRow(annotations, id, [["annotation", [columns[1].trim()]]]);
  }
  if (annotations.size === 0) throw new Error("The file has no annotation rows.");
  return annotations;
}

function synimaUnqualifiedGeneNames(state) {
  const names = new Map();
  function add(name, id) {
    if (!names.has(name)) names.set(name, id);
    else if (names.get(name) !== id) names.set(name, null);
  }
  for (const { gene, id } of state.genes) add(gene, id);
  for (const [alias, id] of state.aliases) {
    add(alias.slice(alias.indexOf("|") + 1), id);
  }
  return names;
}

function synimaMergeAnnotationRow(byId, id, fields) {
  if (!byId.has(id)) byId.set(id, new Map());
  const row = byId.get(id);
  for (const [key, values] of fields) {
    for (const value of values) {
      if (!value || (value === "-" && key !== "annotation")) continue;
      if (!row.has(key)) row.set(key, new Set());
      row.get(key).add(value);
    }
  }
  if (row.size === 0) byId.delete(id);
}

function synimaMergedAnnotations(files) {
  const types = new Map();
  for (const [key, type] of SYNIMA_IMPORT_TYPES) {
    const sources = files.filter(file => file.type === key);
    if (!sources.length) continue;
    const byId = new Map();
    for (const file of sources) {
      for (const [id, fields] of file.byId) synimaMergeAnnotationRow(byId, id, fields);
    }
    types.set(key, { byId, type });
  }
  return types;
}

function synimaAnnotationColumns(annotations) {
  const columns = new Map();
  for (const [key, { byId, type }] of annotations) {
    for (const field of type.fields) {
      const text = new Map();
      const valuesById = new Map();
      for (const [id, row] of byId) {
        const values = row.get(field.key);
        if (!values) continue;
        valuesById.set(id, values);
        const sorted = [...values].sort(field.numeric ? (a, b) => Number(a) - Number(b) : undefined);
        text.set(id, sorted.join("; "));
      }
      columns.set(`${key}-${field.key}`, { field, text, valuesById });
    }
  }
  return columns;
}

function synimaEnrichmentCounts(genes, selected, byId, { species, field, value }) {
  const groups = [
    { present: 0, absent: 0, unknown: 0 },
    { present: 0, absent: 0, unknown: 0 }
  ];
  const query = value.toUpperCase();
  for (const { id, species: genome } of genes) {
    if (species && genome !== species) continue;
    const group = groups[selected.has(id) ? 0 : 1];
    const values = byId.get(id)?.get(field);
    if (!values?.size) group.unknown++;
    else if ([...values].some(item => item.toUpperCase() === query)) group.present++;
    else group.absent++;
  }
  return groups;
}

function synimaFisherEnrichmentLogP([inside, outside]) {
  const observed = inside.present;
  const rowTotal = inside.present + inside.absent;
  const featureTotal = inside.present + outside.present;
  const total = rowTotal + outside.present + outside.absent;
  const lower = Math.max(0, rowTotal + featureTotal - total);
  const upper = Math.min(rowTotal, featureTotal);
  const mode = Math.min(upper, Math.max(lower, Math.floor((rowTotal + 1) * (featureTotal + 1) / (total + 2))));

  // With fixed margins, the upper tail is the probability of this overlap or more.
  // Start at the mode with weight 1 and use neighboring hypergeometric probabilities
  // to get relative weights. Keep the tail on a log scale to preserve tiny p-values.
  function logNextRatio(overlap) {
    return Math.log((featureTotal - overlap) * (rowTotal - overlap) /
      ((overlap + 1) * (total - featureTotal - rowTotal + overlap + 1)));
  }

  let mass = 1;
  let logTail = mode >= observed ? 0 : -Infinity;
  function addWeight(overlap, logWeight) {
    mass += Math.exp(logWeight);
    if (overlap < observed) return;
    const peak = Math.max(logTail, logWeight);
    logTail = peak + Math.log1p(Math.exp(-Math.abs(logTail - logWeight)));
  }

  let logWeight = 0;
  for (let overlap = mode; overlap < upper; overlap++) {
    logWeight += logNextRatio(overlap);
    addWeight(overlap + 1, logWeight);
  }
  logWeight = 0;
  for (let overlap = mode - 1; overlap >= lower; overlap--) {
    logWeight -= logNextRatio(overlap);
    addWeight(overlap, logWeight);
  }
  return Math.min(0, logTail - Math.log(mass));
}

function synimaEnrichmentRCode(labels, result) {
  const [inside, outside] = result;
  const comment = text => text.replace(/[\r\n\u2028\u2029]+/g, " ");
  return [
    `# Ortholog category: ${comment(labels.ortholog)}`,
    `# Functional category: ${comment(labels.feature)}`,
    `# Species scope: ${comment(labels.species)}`,
    `# Unknown results excluded: ${inside.unknown} in category, ${outside.unknown} outside`,
    `tab <- matrix(c(${inside.present}, ${inside.absent}, ${outside.present}, ${outside.absent}),`,
    '              nrow = 2, byrow = TRUE,',
    '              dimnames = list(c("In category", "Outside category"),',
    '                              c("Feature present", "Feature absent")))',
    'print(tab)',
    'fisher.test(tab, alternative = "greater")'
  ].join("\n");
}

function synimaBindEnrichment(state, presets, numbers) {
  const element = name => document.getElementById(`function-enrichment-${name}`);
  const ortholog = element("ortholog");
  const source = element("source");
  const field = element("field");
  const selection = element("selection");
  const species = element("species");
  const status = element("status");
  const results = element("results");
  const testActions = element("test-actions");
  const testResult = element("test-result");
  const codeToggle = element("code-toggle");
  const codeDetails = element("code-details");
  const code = element("code");
  const copyStatus = element("copy-status");
  const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  let selected = new Set();
  let testGroups;

  function showCode(show) {
    codeDetails.hidden = !show;
    codeToggle.setAttribute("aria-expanded", String(show));
    codeToggle.textContent = show ? "Hide R code" : "View R code";
  }

  function render() {
    results.hidden = true;
    testActions.hidden = true;
    testResult.textContent = "";
    testGroups = undefined;
    code.value = "";
    copyStatus.textContent = "";
    const category = presets.get(ortholog.value);
    const annotation = state.annotations.get(source.value);
    if (!state.genes.length || !presets.size) {
      status.textContent = "This report has no gene list or ortholog categories for enrichment.";
      return;
    }
    if (!annotation || !category) {
      status.textContent = "Choose an ortholog category and an uploaded functional category.";
      return;
    }
    const signalp = source.value === "signalp";
    const featureField = source.value === "eggnog"
      ? annotation.type.fields.find(item => item.key === field.value)
      : annotation.type.fields[0];
    const value = signalp ? "Y" : selection.value.trim();
    if (featureField.key === "go" || featureField.key === "GOs") {
      if (!/^GO:\d{7}$/i.test(value)) {
        status.textContent = "Enter a GO term of the form GO:0005737.";
        return;
      }
    } else if (!value) {
      status.textContent = "Enter an exact annotation value.";
      return;
    }
    const feature = signalp ? "SignalP prediction (Y)" : `${featureField.label}: ${value}`;
    const scope = species.value || "All species";
    const groups = synimaEnrichmentCounts(state.genes, selected, annotation.byId, {
      species: species.value, field: featureField.key, value
    });
    const [inside, outside] = groups;
    const totals = {
      present: inside.present + outside.present,
      absent: inside.absent + outside.absent,
      unknown: inside.unknown + outside.unknown
    };
    const tested = totals.present + totals.absent;
    element("feature").textContent = feature;
    status.textContent = `${scope} · ${numbers.format(tested + totals.unknown)} total genes · ${numbers.format(tested)} included in the comparison.`;
    element("table").innerHTML = [...groups, totals].map(({ present, absent, unknown }, index) => {
      const n = present + absent;
      const label = ["In ortholog category", "Outside ortholog category", "Total"][index];
      return `<tr><th scope="row">${label}</th><td>${numbers.format(present)}</td>
        <td>${numbers.format(absent)}</td>
        <td>${numbers.format(unknown)}</td><td>${numbers.format(n + unknown)}</td>
        <td>${n ? percent.format(100 * present / n) : "—"}</td></tr>`;
    }).join("");
    element("background").textContent = signalp
      ? "Percentages and the test use only genes with a Y or N call."
      : `Percentages and the test use only genes with a value in ${featureField.label}.`;
    const canTest = inside.present + inside.absent > 0 && outside.present + outside.absent > 0
      && totals.present > 0 && totals.absent > 0;
    element("test-note").textContent = canTest
      ? "The one-sided Fisher exact test asks whether the feature is more common in the selected ortholog category. The R code also gives the odds ratio and confidence interval."
      : "Fisher’s exact test requires tested genes in both groups and at least one gene with and one gene without the selected feature.";
    if (canTest) {
      testGroups = groups;
      code.value = synimaEnrichmentRCode({ ortholog: category.name, feature, species: scope }, groups);
    }
    testActions.hidden = !canTest;
    results.hidden = false;
  }

  function updateSelection() {
    const id = source.value;
    const eggnog = id === "eggnog";
    field.parentElement.hidden = !eggnog;
    selection.parentElement.hidden = !id || id === "signalp";
    selection.placeholder = id === "d2go" || (eggnog && field.value === "GOs") ? "GO:0005737" : "Exact value";
    render();
  }

  ortholog.addEventListener("change", () => {
    const category = presets.get(ortholog.value);
    selected = new Set(category?.genesText.split("\n"));
    const genome = category?.kind === "unique" ? category.genome : "";
    species.value = Array.from(species.options).some(option => option.value === genome) ? genome : "";
    render();
  });
  for (const control of [source, field]) control.addEventListener("change", () => {
    selection.value = "";
    updateSelection();
  });
  selection.addEventListener("input", render);
  species.addEventListener("change", render);
  element("run-test").addEventListener("click", () => {
    if (!testGroups) return;
    const logP = synimaFisherEnrichmentLogP(testGroups);
    const log10P = logP / Math.LN10;
    testResult.textContent = log10P < -300
      ? `Unadjusted p-value < 1e-300 (log₁₀ p-value = ${log10P.toFixed(2)})`
      : `Unadjusted p-value = ${Number(Math.exp(logP).toPrecision(6))}`;
  });
  codeToggle.addEventListener("click", () => showCode(codeDetails.hidden));
  element("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      copyStatus.textContent = "R code copied.";
    } catch {
      showCode(true);
      code.focus();
      code.select();
      copyStatus.textContent = "R code selected. Use your device’s copy shortcut.";
    }
  });

  return () => {
    const previous = source.value;
    source.innerHTML = `<option value="">${state.annotations.size ? "Choose a category" : "Import annotations first"}</option>` +
      Array.from(state.annotations, ([key, { type }]) => `<option value="${key}">${type.label}</option>`).join("");
    source.disabled = !state.annotations.size;
    source.value = state.annotations.has(previous) ? previous : "";
    if (source.value !== previous) selection.value = "";
    updateSelection();
  };
}

SYNIMA.showFunction = function () {
  const app = document.getElementById("app");
  app.classList.add("max-w-6xl", "mx-auto");
  app.style.maxWidth = "";
  app.style.margin = "";
  app.style.padding = "";

  const typeOptions = Array.from(SYNIMA_IMPORT_TYPES, ([key, { label }]) =>
    `<option value="${key}">${label}</option>`
  ).join("");
  const limitOptions = [10, 50, 100]
    .map(limit => `<option value="${limit}">${limit.toLocaleString("en-GB")}</option>`)
    .join("");
  const state = synimaAnnotationsForReport();
  const presets = new Map(synimaOrthologCategoryPresets(synimaOrthologGeneData().categories)
    .map(preset => [preset.name, preset]));
  const annotationFields = [...SYNIMA_IMPORT_TYPES].flatMap(([key, { fields }]) =>
    fields.map(field => ({ ...field, id: `${key}-${field.key}` })));
  const speciesOptions = [...new Set(state.genes.map(row => row.species).filter(Boolean))].sort()
    .map(species => `<option value="${synimaEscapeHtml(species)}">${synimaEscapeHtml(species)}</option>`)
    .join("");

  app.innerHTML = `
    <h1>Functional annotation</h1>
    <section class="section">
      <h2>Add annotation</h2>
      <form id="function-import">
        <div class="synima-function-controls synima-function-import">
          <label>File
            <input type="file" id="function-file" />
          </label>
          <label>Type
            <select id="function-type" aria-describedby="function-type-description">
              ${typeOptions}
            </select>
          </label>
          <div>
            <span class="synima-function-description-label">Description</span>
            <p id="function-type-description" aria-live="polite"></p>
            <pre id="function-type-example" hidden></pre>
          </div>
        </div>
        <button type="submit" id="function-import-button" class="copy-btn" disabled>Import annotation</button>
        <p id="function-import-status" role="status"></p>
      </form>
    </section>

    <section class="section">
      <h2>Uploaded Annotation</h2>
      <table class="ortho-table">
        <thead>
          <tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">Desc</th><th scope="col">Action</th></tr>
        </thead>
        <tbody id="function-uploaded"></tbody>
      </table>
    </section>

    <section class="section">
      <h2>Counts / Enrichment</h2>
      <div class="synima-function-controls synima-enrichment-controls">
        <label>Ortholog Category
          <select id="function-enrichment-ortholog" ${presets.size ? "" : "disabled"}>
            <option value="">Choose a category</option>
            ${[...presets.keys()].map(name => {
              const label = synimaEscapeHtml(name);
              return `<option value="${label}">${label}</option>`;
            }).join("")}
          </select>
        </label>
        <label>Functional Category
          <select id="function-enrichment-source" disabled></select>
        </label>
        <label hidden>Annotation field
          <select id="function-enrichment-field">
            ${SYNIMA_EGGNOG_FIELDS.filter(field => field.selectionLabel).map(field =>
              `<option value="${field.key}">${field.selectionLabel}</option>`).join("")}
          </select>
        </label>
        <label hidden>Selection
          <input type="text" id="function-enrichment-selection" />
        </label>
        <label>Species scope
          <select id="function-enrichment-species" ${state.genes.length ? "" : "disabled"}>
            <option value="">All species</option>
            ${speciesOptions}
          </select>
        </label>
      </div>
      <p id="function-enrichment-status" role="status"></p>
      <div id="function-enrichment-results" hidden>
        <div class="synima-function-browse-scroll" role="region" aria-label="Enrichment counts" tabindex="0">
          <table class="ortho-table">
            <caption id="function-enrichment-feature"></caption>
            <thead><tr>
              <th scope="col">Genes</th><th scope="col">Feature present</th><th scope="col">Feature absent</th>
              <th scope="col">Unknown (excluded)</th><th scope="col">Total genes</th>
              <th scope="col">% with feature</th>
            </tr></thead>
            <tbody id="function-enrichment-table"></tbody>
          </table>
        </div>
        <p id="function-enrichment-background"></p>
        <p id="function-enrichment-test-note"></p>
        <div id="function-enrichment-test-actions" hidden>
          <button type="button" class="copy-btn" id="function-enrichment-run-test">Run enrichment test</button>
          <button type="button" class="copy-btn" id="function-enrichment-copy">Copy R code</button>
          <button type="button" class="copy-btn" id="function-enrichment-code-toggle"
            aria-controls="function-enrichment-code-details" aria-expanded="false">View R code</button>
          <span id="function-enrichment-copy-status" role="status"></span>
          <p id="function-enrichment-test-result" role="status"></p>
          <div id="function-enrichment-code-details" hidden>
            <textarea id="function-enrichment-code" aria-label="R code for Fisher’s exact test" rows="9" readonly></textarea>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Filter/Sort</h2>
      <div class="synima-function-controls">
        <label>Species
          <select id="function-species" disabled>
            <option value="">All species</option>
            ${speciesOptions}
          </select>
        </label>
        <label>Sort by
          <select id="function-sort" disabled>
            <option value="species">Species</option>
            <option value="gene">Gene</option>
            ${annotationFields.map(field =>
              `<option value="${field.id}" disabled>${field.label}</option>`).join("")}
          </select>
        </label>
        <label>Show
          <select id="function-limit" aria-label="Show entries per page">
            ${limitOptions}
          </select>
        </label>
        <label>Search
          <input type="search" id="function-search" placeholder="Exact match" />
        </label>
      </div>
    </section>

    <section class="section">
      <div class="synima-function-browse-header">
        <h2>Browse</h2>
        <div class="synima-function-download">
          <button type="button" id="function-download">Download ▾</button>
          <div id="function-download-menu" class="synima-function-download-menu hidden">
            <button type="button" id="function-download-selection">Download selection</button>
            <button type="button" id="function-download-all">Download all</button>
          </div>
        </div>
      </div>
      <div class="synima-function-browse-scroll" role="region" aria-label="Browse annotations" tabindex="0">
        <table class="ortho-table">
          <thead>
            <tr>
              <th scope="col" aria-label="Row number">#</th>
              <th scope="col">Species</th><th scope="col">Gene</th>
              ${annotationFields.map(field => `
                <th scope="col" id="function-${field.id}-heading" hidden>
                  ${field.label}
                  ${field.id === "signalp-call" ? `<span id="function-signalp-help" class="synima-signalp-key" tabindex="0"
                    aria-label="SignalP values" aria-describedby="function-signalp-tooltip">?</span>` : ""}
                </th>`).join("")}
            </tr>
          </thead>
          <tbody id="function-genes"></tbody>
        </table>
      </div>
      <p id="function-browse-status" role="status"></p>
      <div id="function-pagination" class="synima-function-controls" hidden>
        <button type="button" id="function-previous" class="copy-btn">Previous</button>
        <button type="button" id="function-next" class="copy-btn">Next</button>
      </div>
    </section>
    <div id="function-signalp-tooltip" class="synima-signalp-tooltip" role="tooltip" hidden>${SYNIMA_SIGNALP_KEY}</div>
    <dialog id="function-delete-dialog" class="synima-function-dialog" aria-labelledby="function-delete-question">
      <form method="dialog">
        <p id="function-delete-question"></p>
        <div class="synima-function-controls">
          <button type="submit" class="copy-btn" value="no" autofocus>No</button>
          <button type="submit" class="copy-btn synima-function-delete" value="yes">Yes</button>
        </div>
      </form>
    </dialog>
  `;

  const type = document.getElementById("function-type");
  const fileInput = document.getElementById("function-file");
  const description = document.getElementById("function-type-description");
  const example = document.getElementById("function-type-example");
  const form = document.getElementById("function-import");
  const submit = document.getElementById("function-import-button");
  const importStatus = document.getElementById("function-import-status");
  const uploaded = document.getElementById("function-uploaded");
  const species = document.getElementById("function-species");
  const sort = document.getElementById("function-sort");
  const limit = document.getElementById("function-limit");
  const search = document.getElementById("function-search");
  const help = document.getElementById("function-signalp-help");
  const tooltip = document.getElementById("function-signalp-tooltip");
  const deleteDialog = document.getElementById("function-delete-dialog");
  const deleteQuestion = document.getElementById("function-delete-question");
  const rows = document.getElementById("function-genes");
  const browseStatus = document.getElementById("function-browse-status");
  const pagination = document.getElementById("function-pagination");
  const previous = document.getElementById("function-previous");
  const next = document.getElementById("function-next");
  const download = document.getElementById("function-download");
  const downloadSelection = document.getElementById("function-download-selection");
  const downloadAll = document.getElementById("function-download-all");
  const counts = new Intl.NumberFormat("en-GB");
  const updateEnrichment = synimaBindEnrichment(state, presets, counts);
  let pending = false;
  let fileToDelete;
  let columns = new Map();
  let sortedRows = [];
  let results = [];
  let page = 0;
  let pageSize = Number(limit.value);

  function setImportStatus(message, isError = false) {
    importStatus.textContent = isError ? `Error: ${message}` : message;
    importStatus.classList.toggle("synima-function-error", isError);
  }

  function updateImportButton() {
    fileInput.disabled = pending;
    type.disabled = pending;
    submit.disabled = pending || !SYNIMA_IMPORT_TYPES.has(type.value) || !fileInput.files.length || state.ids.size === 0;
  }

  function updateDescription() {
    const importer = SYNIMA_IMPORT_TYPES.get(type.value);
    description.textContent = importer?.description || "";
    example.hidden = !importer;
    example.textContent = importer?.example || "";
    setImportStatus(importer && state.ids.size === 0
      ? `Regenerate this report with its combined FASTA to import ${importer.label}.` : "");
    updateImportButton();
  }

  function annotationValues(row) {
    return Array.from(columns.values(), column => column.text.get(row.id) ?? column.field.missing ?? "");
  }

  function visibleRows() {
    const start = page * pageSize;
    return results.slice(start, start + pageSize);
  }

  function renderPage() {
    const selection = visibleRows();
    const start = page * pageSize;
    const end = start + selection.length;
    rows.innerHTML = selection.map(({ row, number }) => `
      <tr><td>${counts.format(number)}</td><td>${synimaEscapeHtml(row.species || "—")}</td>
        <td title="${synimaEscapeHtml(row.id)}">${synimaEscapeHtml(row.gene)}</td>
        ${annotationValues(row).map(value => `<td>${synimaEscapeHtml(value)}</td>`).join("")}</tr>`).join("");
    browseStatus.textContent = !state.genes.length ? "This report contains no gene IDs."
      : !results.length ? "No genes match the current filters."
        : `Showing ${counts.format(start + 1)}–${counts.format(end)} of ${counts.format(results.length)} genes.`;
    pagination.hidden = results.length <= pageSize;
    previous.disabled = start === 0;
    next.disabled = end === results.length;
    download.disabled = !state.genes.length;
    downloadSelection.disabled = !selection.length;
    downloadAll.disabled = !state.genes.length;
  }

  function updateSearch() {
    page = 0;
    const query = search.value.trim().toLowerCase();
    const term = query.toUpperCase();
    const rowNumber = Number(query.replaceAll(",", ""));
    const annotations = [...columns.values()];
    results = query ? sortedRows.filter(({ row, number }) =>
      (number === rowNumber && (String(number) === query || counts.format(number) === query)) ||
      (row.species || "—").toLowerCase() === query || row.gene.toLowerCase() === query ||
      row.id.toLowerCase() === query ||
      annotations.some(column =>
        (column.text.get(row.id) ?? column.field.missing ?? "").toLowerCase() === query ||
        [...(column.valuesById.get(row.id) || [])].some(value => value.toUpperCase() === term))
    ) : sortedRows;
    renderPage();
  }

  function sortRows(pool) {
    const byId = (a, b) => a.id.localeCompare(b.id);
    const column = columns.get(sort.value);
    if (sort.value === "gene") pool.sort((a, b) => a.gene.localeCompare(b.gene) || byId(a, b));
    else if (column) {
      pool.sort((a, b) => {
        const left = column.text.get(a.id);
        const right = column.text.get(b.id);
        if (left == null || right == null) return Number(left == null) - Number(right == null) || byId(a, b);
        const comparison = column.field.numeric ? Number(left.split(";")[0]) - Number(right.split(";")[0])
          : sort.value === "signalp-call" ? right.localeCompare(left) : left.localeCompare(right);
        return comparison || byId(a, b);
      });
    } else pool.sort((a, b) => a.species.localeCompare(b.species) || byId(a, b));
    return pool.map((row, index) => ({ row, number: index + 1 }));
  }

  function updateBrowse() {
    sortedRows = sortRows(state.genes.filter(row => !species.value || row.species === species.value));
    updateSearch();
  }

  function updateAnnotations() {
    state.annotations = synimaMergedAnnotations(state.files);
    updateEnrichment();
    columns = synimaAnnotationColumns(state.annotations);
    uploaded.innerHTML = state.files.map((file, index) => {
      const importer = SYNIMA_IMPORT_TYPES.get(file.type);
      return `
      <tr>
        <td>${synimaEscapeHtml(file.name)}</td><td>${importer.label}</td>
        <td>${counts.format(file.byId.size)} / ${counts.format(state.ids.size)} ${importer.coverage}.
          ${counts.format(file.unmapped)} unmapped.${file.aliasMatches ? ` ${counts.format(file.aliasMatches)} IDs matched by alias.` : ""}
          ${file.nameMatches ? ` ${counts.format(file.nameMatches)} matched by gene name.` : ""}</td>
        <td><button type="button" class="copy-btn synima-function-delete" data-delete-annotation="${index}" aria-label="Delete ${synimaEscapeHtml(file.name)}">×</button></td>
      </tr>`;
    }).join("");
    if (!columns.has("signalp-call")) tooltip.hidden = true;
    species.disabled = !state.genes.length;
    sort.disabled = !state.genes.length;
    search.disabled = !state.genes.length;
    for (const field of annotationFields) {
      const absent = !columns.has(field.id);
      document.getElementById(`function-${field.id}-heading`).hidden = absent;
      sort.querySelector(`option[value="${field.id}"]`).disabled = absent;
      if (absent && sort.value === field.id) sort.value = "species";
    }
    updateBrowse();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled || !SYNIMA.hasCloudAuth()) return;
    const file = fileInput.files[0];
    const key = type.value;
    const importer = SYNIMA_IMPORT_TYPES.get(key);
    pending = true;
    updateImportButton();
    setImportStatus("Reading annotation…");
    try {
      const text = await file.text();
      if (!form.isConnected || synimaAnnotationState !== state || !SYNIMA.hasCloudAuth()) return;
      const annotations = importer.parse(text);
      const names = key === "other" ? synimaUnqualifiedGeneNames(state) : null;
      const mapped = new Map();
      let unmapped = 0;
      let aliasMatches = 0;
      let nameMatches = 0;
      for (const [id, fields] of annotations) {
        const exact = state.ids.has(id);
        const alias = exact ? null : state.aliases.get(id);
        const target = exact ? id : alias || (!id.includes("|") && names?.get(id));
        if (!target) {
          unmapped++;
          continue;
        }
        if (key === "signalp") {
          const call = fields.get("call").values().next().value;
          const inFile = mapped.get(target)?.get("call");
          const imported = state.annotations.get(key)?.byId.get(target)?.get("call");
          if (inFile && !inFile.has(call)) {
            throw new Error(`The file gives conflicting predictions for ${target} across its IDs.`);
          }
          if (imported && !imported.has(call)) {
            throw new Error(`The prediction for ${target} conflicts with an imported file. Delete that file before importing a different call.`);
          }
        }
        if (alias) aliasMatches++;
        else if (!exact) nameMatches++;
        synimaMergeAnnotationRow(mapped, target, fields);
      }
      state.files.push({ name: file.name, type: key, byId: mapped, unmapped, aliasMatches, nameMatches });
      fileInput.value = "";
      setImportStatus(`Imported ${file.name}.`);
      updateAnnotations();
    } catch (error) {
      setImportStatus(error.message || "Could not read the annotation file.", true);
    } finally {
      pending = false;
      updateImportButton();
    }
  });

  uploaded.addEventListener("click", event => {
    const button = event.target.closest("[data-delete-annotation]");
    if (!button || !SYNIMA.hasCloudAuth()) return;
    fileToDelete = state.files[Number(button.dataset.deleteAnnotation)];
    if (!fileToDelete) return;
    deleteQuestion.textContent = `Are you sure you want to delete file “${fileToDelete.name}” from this report?`;
    deleteDialog.returnValue = "";
    deleteDialog.showModal();
  });
  deleteDialog.addEventListener("close", () => {
    const index = state.files.indexOf(fileToDelete);
    fileToDelete = undefined;
    if (deleteDialog.returnValue !== "yes" || index < 0 || !SYNIMA.hasCloudAuth()) return;
    state.files.splice(index, 1);
    setImportStatus("");
    updateAnnotations();
  });

  function showSignalPTooltip(x, y) {
    tooltip.hidden = false;
    const { width, height } = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - width - 8))}px`;
    const below = y + 12;
    tooltip.style.top = `${below + height + 8 <= window.innerHeight ? below : Math.max(8, y - height - 12)}px`;
  }

  function hideSignalPTooltip() {
    tooltip.hidden = true;
  }

  help.addEventListener("pointerenter", event => showSignalPTooltip(event.clientX, event.clientY));
  help.addEventListener("pointermove", event => showSignalPTooltip(event.clientX, event.clientY));
  help.addEventListener("pointerleave", hideSignalPTooltip);
  help.addEventListener("focus", () => {
    const bounds = help.getBoundingClientRect();
    showSignalPTooltip(bounds.right, bounds.bottom);
  });
  help.addEventListener("blur", hideSignalPTooltip);
  help.addEventListener("keydown", event => {
    if (event.key === "Escape") hideSignalPTooltip();
  });

  function downloadRows(selection, filename) {
    if (!selection.length || !SYNIMA.hasCloudAuth()) return;
    const header = ["#", "Species", "Gene", ...Array.from(columns.values(), column => column.field.label)];
    const tsv = [header.join("\t"), ...selection.map(({ row, number }) =>
      [counts.format(number), row.species || "—", row.gene, ...annotationValues(row)].join("\t")
    )].join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  wireDropdown("function-download", "function-download-menu");
  downloadSelection.addEventListener("click", () => downloadRows(visibleRows(), "synima_annotations_selection.tsv"));
  downloadAll.addEventListener("click", () => downloadRows(sortRows([...state.genes]), "synima_annotations_all.tsv"));

  previous.addEventListener("click", () => { page--; renderPage(); });
  next.addEventListener("click", () => { page++; renderPage(); });
  for (const control of [species, sort]) control.addEventListener("change", updateBrowse);
  search.addEventListener("input", updateSearch);
  limit.addEventListener("change", () => {
    const start = page * pageSize;
    pageSize = Number(limit.value);
    page = Math.floor(start / pageSize);
    renderPage();
  });
  fileInput.addEventListener("change", updateImportButton);
  type.addEventListener("change", updateDescription);
  updateDescription();
  updateAnnotations();
};

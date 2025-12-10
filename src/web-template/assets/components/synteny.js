window.SYNIMA = window.SYNIMA || {};

SYNIMA.showSynteny = function () {

    const app = document.getElementById("app");
    const raw = document.getElementById("data-synteny");

    if (!raw) {
        app.innerHTML = "<p>No synteny data found.</p>";
        return;
    }

    const data = JSON.parse(raw.textContent);
    const config = data.synteny_config;
    const aligncoords = data.aligncoords || "";
    const spans = data.aligncoords_spans || "";

    // Genome order should follow the current TREE PAGE settings
    let genomeOrder = [];

    if (window.SYNIMA && SYNIMA.getCurrentTipOrder) {
        genomeOrder = SYNIMA.getCurrentTipOrder();
    }

    // Fallback to rust-provided order only if tree order unavailable
    if (!genomeOrder || genomeOrder.length === 0) {
        genomeOrder = config.genome_order || [];
    }

    // 2. Begin debug output
    let html = "<h1>Synteny Debug</h1>";

    html += `<p>Num genomes: ${config.num_genomes}</p>`;
    html += `<p>Max genome length: ${config.max_length}</p>`;
    html += `<p>Halfway index: ${config.halfway}</p>`;

    // 3. Print detected genome order from phylogenetic tree
    //----------------------------------------------------------------
    html += `<p>Genome order from tree: `;

    if (genomeOrder.length === 0) {
        html += `<em>No genome order extracted (tree not found or mismatch)</em></p>`;
    } else {
        html += `${genomeOrder.join(" → ")}</p>`;
    }

    // 4. Print all genome metadata
    config.genomes.forEach(g => {
        html += `<h3>${g.name}</h3>`;
        html += `<p>Total length: ${g.total_length}</p>`;
        html += `<p>Contig order (inferred): ${g.inferred_order.join(", ")}</p>`;
        html += `<p>Contig order (fasta): ${g.fasta_order.join(", ")}</p>`;
        html += `<p>Contig lengths:</p>`;
        html += `<ul>`;
        g.contigs.forEach(c => {
            html += `<li>${c.contig}: ${c.length}</li>`;
        });
        html += `</ul>`;
    });

    // 5. Preview aligncoords + spans
    html += `
        <h2>Raw aligncoords</h2>
        <pre>${aligncoords.substring(0, 2000)}...</pre>

        <h2>Raw aligncoords.spans</h2>
        <pre>${spans.substring(0, 2000)}...</pre>
    `;

    //app.innerHTML = html;

    app.innerHTML = `
  <h1>Synteny Viewer</h1>

  <div style="display:flex; gap:20px;">

    <!-- MINI TREE COLUMN -->
    <div style="flex:0 0 20%; min-width:260px; border-right:1px solid #444; padding-right:10px; padding-bottom:20px; overflow-y:auto; ">
      <!--<h2>Tree</h2>-->
        <div id="synteny-tree-mini"
             style="width:100%; overflow-x:auto; overflow-y:auto; padding-bottom:30px; box-sizing:border-box;">
        </div>
    </div>

    <!-- SYNTENY MAIN COLUMN -->
    <div style="flex:1; padding-left:10px;">
      <div id="synteny-main"></div>
    </div>

  </div>

  <hr style="margin:20px 0; border-color:#555;">

  <div id="synteny-debug">
    ${html}
  </div>
`;


    //console.log("Mini render debug:", {
    //    hasRender: typeof SYNIMA.renderTreeSvg,
    //    hasTree: !!SYNIMA_TREES.current
    //});

    renderTreeSvg(SYNIMA_TREES.current, "synteny-tree-mini", { mini:true });
    //const mini = document.getElementById("synteny-tree-mini");
    //mini.querySelector("svg").style.transform = "scaleX(0.5)";
    //mini.querySelector("svg").style.transformOrigin = "left top";


};
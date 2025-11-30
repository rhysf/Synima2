window.SYNIMA = window.SYNIMA || {};

SYNIMA.showSynteny = function () {

    const app = document.getElementById("app");
    const raw = document.getElementById("data-synteny");
    const treeRaw = document.getElementById("data-tree");

    if (!raw) {
        app.innerHTML = "<p>No synteny data found.</p>";
        return;
    }

    const data = JSON.parse(raw.textContent);
    const config = data.synteny_config;
    const aligncoords = data.aligncoords || "";
    const spans = data.aligncoords_spans || "";

    // 1. Load tree JSON and extract correct tree
    //----------------------------------------------------------------
    let genomeOrder = [];

    if (treeRaw && treeRaw.textContent.trim()) {
        const treeData = JSON.parse(treeRaw.textContent);

        // Extract alignment + method from synteny_config
        // (Rust includes these inside Tools table AND ortholog summary,
        //  but synteny doesn't currently re-embed them. So we assume:)
        const alignment = config.alignment || data.alignment || null;
        const method = config.method || data.method || null;

        // If not available, try to guess nothing yet
        if (alignment && method) {
            const match = treeData.trees.find(
                t =>
                    t.alignment.toLowerCase() === alignment.toLowerCase() &&
                    t.method.toLowerCase() === method.toLowerCase()
            );

            if (match) {
                genomeOrder = extractLeafOrder(match.newick);
            }
        }
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
        html += `<p>Contig order: ${g.order.join(", ")}</p>`;
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

    app.innerHTML = html;
};

// Extract leaf order from Newick
function extractLeafOrder(newick) {
    const leaves = [];
    let token = "";

    for (const c of newick) {
        if (c === '(' || c === ')' || c === ',' || c === ';') {
            if (token.length > 0 && isNaN(Number(token))) {
                leaves.push(token);
            }
            token = "";
        } else if (c === ':') {
            // Colon indicates branch length → previous token was a label
            if (token.length > 0 && isNaN(Number(token))) {
                leaves.push(token);
            }
            token = "";
        } else {
            token += c;
        }
    }

    return leaves;
}
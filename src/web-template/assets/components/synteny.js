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

    let html = "<h1>Synteny Debug</h1>";

    html += `<p>Num genomes: ${config.num_genomes}</p>`;
    html += `<p>Max genome length: ${config.max_length}</p>`;
    html += `<p>Halfway index: ${config.halfway}</p>`;

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

    html += `

        <h2>Raw aligncoords</h2>
        <pre>${aligncoords.substring(0, 2000)}...</pre>

        <h2>Raw aligncoords.spans</h2>
        <pre>${spans.substring(0, 2000)}...</pre>
    `;

    app.innerHTML = html;
};
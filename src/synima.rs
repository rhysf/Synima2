use regex::Regex;
use anyhow::{Result, Context};
use rust_embed::RustEmbed;
use serde::Serialize;
use std::fs;
use std::path::{Path}; //, PathBuf

#[derive(RustEmbed)]
#[folder = "src/web-template/"]
struct WebTemplate;

// orthologs

#[derive(Serialize)]
struct SummaryRow {
    genome: String,
    core_1to1: u32,
    core_multi: u32,
    aux: u32,
    unique: u32,
}

#[derive(Serialize)]
struct SummaryItem {
    alignment: String,
    method: String,
    table: Vec<SummaryRow>,
    pdf_path: Option<String>,
    png_path: Option<String>,
    rscript: Option<String>,
}

#[derive(Serialize)]
struct OrthologSummary {
    params: OrthoParams,
    summaries: Vec<SummaryItem>,
    single_copy_orthologs: usize,
}

#[derive(Serialize)]
pub struct OrthoParams {
    pub aligner: String,
    pub max_target_seqs: usize,
    pub diamond_sensitivity: String,
    pub evalue: String,
    pub dagchainer_chains: usize,
    pub genetic_code: usize
}

// tree

#[derive(Serialize)]
struct TreeItem {
    alignment: String,   // "cds" or "pep"
    method: String,      // "orthomcl", "rbh", "orthofinder"
    newick: String,
    file_name: String,   // tree file name
}

#[derive(Serialize)]
struct TreeSummary {
    trees: Vec<TreeItem>,
}

// methods

#[derive(Serialize)]
pub struct ToolInfo {
    pub category: String,
    pub name: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct CitationInfo {
    pub tool: String,
    pub citation: String,
    pub link: String,
}

#[derive(Serialize)]
pub struct MethodsData {
    pub tools: Vec<ToolInfo>,
    pub citations: Vec<CitationInfo>,
}


pub fn copy_web_template(output_dir: &Path) -> Result<()> {
    for file in WebTemplate::iter() {
        let data = WebTemplate::get(&file).unwrap().data;

        let dest = output_dir.join(&file.to_string());
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }

        std::fs::write(dest, &*data)?;
    }

    Ok(())
}

pub fn inject_json_into_html(path: &Path, id: &str, json: &str) -> Result<()> {
    let html = std::fs::read_to_string(path)?;

    let re = Regex::new(&format!(
        r#"<script[^>]*id="{}"[^>]*type="application/json"[^>]*>(?s).*?</script>"#,
        id
    ))?;

    let replacement = format!(
        r#"<script id="{}" type="application/json">{}</script>"#,
        id, json
    );

    let new_html = re.replace(&html, replacement.as_str()).to_string();

    std::fs::write(path, new_html)?;
    Ok(())
}

// Ortholog functions below

/// Parse a `.summary` file
fn parse_summary_file(path: &Path) -> Result<Vec<SummaryRow>> {
    let text = fs::read_to_string(path)?;
    let mut rows = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }

        // genome core aux unique
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 { continue; }

        rows.push(SummaryRow {
            genome:      parts[0].to_string(),
            core_1to1:   parts[1].parse().unwrap_or(0),
            core_multi:  parts[2].parse().unwrap_or(0),
            aux:         parts[3].parse().unwrap_or(0),
            unique:      parts[4].parse().unwrap_or(0),
        });
    }

    Ok(rows)
}

/// Extract alignment + method from a filename like:
/// GENE_CLUSTERS_SUMMARIES.cds.orthomcl.cluster_dist_per_genome.summary
fn extract_alignment_and_method(path: &Path) -> Option<(String, String)> {
    let filename = path.file_name()?.to_string_lossy();

    let parts: Vec<&str> = filename.split('.').collect();
    if parts.len() < 4 { return None; }

    // Expect ... {align}.{method}.cluster_dist_per_genome.summary
    let alignment = parts[1].to_string(); // cds or pep
    let method    = parts[2].to_string(); // orthomcl, rbh, orthofinder etc.

    Some((alignment, method))
}

/// Find matching PDF, PNG and R script for this summary
fn find_associated_files(dir: &Path, alignment: &str, method: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut pdf_path: Option<String> = None;
    let mut png_path: Option<String> = None;
    let mut r_path: Option<String> = None;

    let pdf_suffix = format!(".{}.{}.cluster_dist_per_genome.summary_plot.pdf", alignment, method);
    let png_suffix = format!(".{}.{}.cluster_dist_per_genome.summary_plot.png", alignment, method);
    let r_suffix   = format!(".{}.{}.cluster_dist_per_genome.summary_plot.R", alignment, method);

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let fname = p.file_name().unwrap().to_string_lossy();

            println!("find_associated_files: Found file: {}", fname);

            if fname.ends_with(&pdf_suffix) {
                pdf_path = Some(format!("../synima_step4-ortholog-summary/{}", fname));
            }
            if fname.ends_with(&png_suffix) {
                png_path = Some(format!("../synima_step4-ortholog-summary/{}", fname));
            }
            if fname.ends_with(&r_suffix) {
                r_path = Some(p.to_string_lossy().to_string());
            }
        }
    }

    // Read R script contents into string
    let rscript_contents = if let Some(ref rp) = r_path {
        fs::read_to_string(rp).ok()
    } else { None };

    // For PDF, we only return relative filename (Synima HTML uses relative paths)
    (pdf_path, png_path, rscript_contents)
}

/// Main function to assemble summaries into JSON and inject into HTML
pub fn process_ortholog_summaries(
    gene_clusters_out_dir: &Path,
    index_path: &Path,
    params: OrthoParams) -> Result<()> {

    let mut summaries: Vec<SummaryItem> = Vec::new();

    for entry in fs::read_dir(gene_clusters_out_dir)
        .with_context(|| format!("Cannot read directory {:?}", gene_clusters_out_dir))?
    {
        let path = entry?.path();

        // Only *.summary files
        if path.extension() != Some("summary".as_ref()) {
            continue;
        }

        // Extract alignment + method
        let (alignment, method) = match extract_alignment_and_method(&path) {
            Some(v) => v,
            None => continue,
        };

        // Parse table
        let table = parse_summary_file(&path).with_context(|| format!("Failed parsing {:?}", path))?;

        // Find PDF + R script
        let (pdf_path, png_path, rscript) = find_associated_files(gene_clusters_out_dir, &alignment, &method);

        summaries.push(SummaryItem {
            alignment,
            method,
            table,
            pdf_path,
            png_path,
            rscript,
        });
    }

    // Compute global single-copy ortholog count across all summaries
    let mut global_sco = 0usize;

    for summary in &summaries {
        for row in &summary.table {
            // row.core_1to1 is the SCO count for this genome
            // We only want to count *unique SCO groups*, not sum per-genome
            // So track only once from one genome (e.g., the first)
            global_sco = row.core_1to1 as usize;
            break;
        }
        break;
    }

    // Serialize to JSON
    let json = serde_json::to_string(&OrthologSummary { params, summaries, single_copy_orthologs: global_sco })?;

    // Inject into HTML
    inject_json_into_html(index_path, "data-orthologs", &json)?;

    Ok(())
}

// Tree functions below

pub fn process_tree_files(
    tree_dir: &Path,
    index_path: &Path,
) -> Result<()> {
    let mut trees: Vec<TreeItem> = Vec::new();

    for entry in fs::read_dir(tree_dir)
        .with_context(|| format!("Cannot read directory {:?}", tree_dir))?
    {
        let path = entry?.path();
        if path.extension() != Some("tree".as_ref()) {
            continue;
        }

        let filename = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        // Expect something like: SC_core_concat.cds.orthomcl.mfa.tree
        let parts: Vec<&str> = filename.split('.').collect();
        if parts.len() < 5 {
            continue;
        }

        let alignment = parts[1].to_string(); // cds or pep
        let method    = parts[2].to_string(); // orthomcl / rbh / orthofinder

        let newick = fs::read_to_string(&path)
            .with_context(|| format!("Failed reading tree file {:?}", path))?
            .trim()
            .to_string();

        trees.push(TreeItem {
            alignment,
            method,
            newick,
            file_name: filename,
        });
    }

    let json = serde_json::to_string(&TreeSummary { trees })?;
    inject_json_into_html(index_path, "data-tree", &json)?;

    Ok(())
}
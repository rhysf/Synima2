use crate::logger::Logger;
use crate::RepoEntry;
use crate::read_fasta;

use regex::Regex;
use anyhow::{Result, Context};
use rust_embed::RustEmbed;
use serde::Serialize;
use std::fs;
//use std::fs::File;
use std::path::{Path, PathBuf};
//use std::io::{BufRead, BufReader};
//use std::io::{BufRead, BufReader};
//use std::collections::HashSet;
use std::collections::HashMap;
//use anyhow::anyhow;
//use anyhow::bail;

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

// synteny plots:

#[derive(Serialize)]
pub struct GenomeContig {
    pub contig: String,
    pub length: u64,
}

#[derive(Serialize)]
pub struct GenomeInfo {
    pub name: String,
    pub total_length: u64,
    pub contigs: Vec<GenomeContig>,      // contig + length
    pub fasta_order: Vec<String>,             // original ordered contig names
    pub inferred_order: Vec<String>,    // ordered contig names
}

#[derive(Serialize)]
pub struct SyntenyConfig {
    pub genomes: Vec<GenomeInfo>,
    pub num_genomes: usize,
    pub max_length: u64,
    pub halfway: f64,
    pub genome_order: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Span {
    pub genome1: String,
    pub contig1: String,
    pub start1: u64,
    pub stop1: u64,
    pub length1: u64,

    pub genome2: String,
    pub contig2: String,
    pub start2: u64,
    pub stop2: u64,
    pub length2: u64,
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
    index_path: &Path) -> Result<()> {

    let mut trees: Vec<TreeItem> = Vec::new();

    for entry in fs::read_dir(tree_dir).with_context(|| format!("Cannot read directory {:?}", tree_dir))? {
        let path = entry?.path();
        if path.extension() != Some("tree".as_ref()) {
            continue;
        }

        let filename = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();

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

// synteny plots

pub fn build_synteny_config(repo_entries: &[RepoEntry], genome_order: &[String], spans_text: &str, logger: &Logger) -> Result<SyntenyConfig> {

    logger.information(&format!("build_synteny_config: saving from repo..."));

    //let genome_set = extract_genome_names_from_spans(spans_file)?;
    let mut genomes: Vec<GenomeInfo> = Vec::new();

    for entry in repo_entries {
        let genome = &entry.name;

        if genome == "synima_all" {
            continue;
        }

        // Genome FASTA
        let genome_fasta_path = if let Some(genome_file) = entry.files.get("genome") {
            PathBuf::from(&genome_file.path)
        } else if let Some(genome_file) = entry.files.get("genome_parsed") {
            PathBuf::from(&genome_file.path)
        } else {
            logger.warning(&format!("build_synteny_config: no genome FASTA for genome {}, skipping", genome));
            continue;
        };

        // Total genome length
        let total_len = read_fasta::fasta_to_total_seq_length(&genome_fasta_path)?;

        // Contig -> length map
        let contig_map = read_fasta::fasta_id_to_seq_length_hash(&genome_fasta_path)?;

        // Order array
        let fasta_order = read_fasta::fasta_id_to_order_array(&genome_fasta_path)?;

        // Convert contigs to struct list
        let contigs = contig_map.into_iter()
            .map(|(id, len)| GenomeContig { contig: id, length: len })
            .collect();

        genomes.push(GenomeInfo {
            name: genome.clone(),
            total_length: total_len,
            contigs,
            fasta_order: fasta_order.clone(),
            inferred_order: fasta_order, // temporary, replaced later
        });
    }

    // reorder genomes to match tree leaf order
    genomes.sort_by_key(|g| {
        genome_order.iter().position(|x| x == &g.name).unwrap_or(usize::MAX)
    });

    // Parse spans and infer contig order -----
    let spans = parse_aligncoords_spans_text(spans_text)?;

    // Infer contig order
    // use genome 0 (top) as guide
    if genomes.len() > 1 {
        let guide = genomes[0].name.clone();
        let guide_order = genomes[0].inferred_order.clone();

        // guide genome keeps original order
        genomes[0].inferred_order = guide_order.clone();

        for i in 1..genomes.len() {
            let target = genomes[i].name.clone();
            let target_order = genomes[i].inferred_order.clone();

            logger.information(&format!("Inferring contig order for {} using guide {}", target, guide));

            let inferred = infer_contig_order_from_spans(
                &guide,
                &target,
                &guide_order,
                &target_order,
                &spans
            );

            genomes[i].inferred_order = inferred;
        }
    } else if genomes.len() == 1 {
        genomes[0].inferred_order = genomes[0].fasta_order.clone();
    }

    let num_genomes = genomes.len();
    let max_length = genomes.iter().map(|g| g.total_length).max().unwrap_or(0);
    let halfway = (num_genomes as f64 / 2.0) - 1.0;

    Ok(SyntenyConfig {
        genomes,
        num_genomes,
        max_length,
        halfway,
        genome_order: genome_order.to_vec(),
    })
}

pub fn parse_aligncoords_spans_text(text: &str) -> Result<Vec<Span>> {
    let mut out = Vec::<Span>::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 6 {
            continue; // skip malformed lines
        }

        // genome1;contig1
        let gc1: Vec<&str> = cols[0].split(';').collect();
        if gc1.len() != 2 {
            continue;
        }

        // start1-stop1
        let s1: Vec<&str> = cols[1].split('-').collect();
        if s1.len() != 2 {
            continue;
        }

        // aligned length1
        let len1 = cols[2].parse::<u64>().unwrap_or(0);

        // genome2;contig2
        let gc2: Vec<&str> = cols[3].split(';').collect();
        if gc2.len() != 2 {
            continue;
        }

        // start2-stop2
        let s2: Vec<&str> = cols[4].split('-').collect();
        if s2.len() != 2 {
            continue;
        }

        // aligned length2
        let len2 = cols[5].parse::<u64>().unwrap_or(0);

        out.push(Span {
            genome1: gc1[0].to_string(),
            contig1: gc1[1].to_string(),
            start1: s1[0].parse().unwrap_or(0),
            stop1:  s1[1].parse().unwrap_or(0),
            length1: len1,

            genome2: gc2[0].to_string(),
            contig2: gc2[1].to_string(),
            start2: s2[0].parse().unwrap_or(0),
            stop2:  s2[1].parse().unwrap_or(0),
            length2: len2,
        });
    }

    Ok(out)
}

fn split_genome_contig(s: &str) -> Option<(String, String)> {
    let mut parts = s.split(';');
    let g = parts.next()?.trim().to_string();
    let c = parts.next()?.trim().to_string();
    Some((g, c))
}

/// Recreate Perl logic:
/// infer the order of genome2’s contigs using genome1 as guide.
pub fn infer_contig_order_from_spans(guide_genome: &str, target_genome: &str, guide_order: &[String], target_order: &[String], spans: &[Span]) -> Vec<String> {

    let mut seen: HashMap<String, u64> = HashMap::new();
    let mut new_order: Vec<String> = Vec::new();

    for contig1 in guide_order {

        // collect all synteny hits between guide and target
        let mut matches: Vec<(String, u64, u64)> = spans
            .iter()
            .filter(|s|
                (s.genome1 == guide_genome && s.contig1 == *contig1 && s.genome2 == target_genome) ||
                (s.genome2 == guide_genome && s.contig2 == *contig1 && s.genome1 == target_genome)
            )
            .map(|s| {
                let (tcontig, tstart) = if s.genome1 == target_genome {
                    (s.contig1.clone(), s.start1)
                } else {
                    (s.contig2.clone(), s.start2)
                };
                let weight = s.length1.max(s.length2);
                (tcontig, tstart, weight)
            })
            .collect();

        // sort by start along guide
        matches.sort_by_key(|(_, start, _)| *start);

        for (contig2, _, weight) in matches {
            if let Some(prev) = seen.get(&contig2) {
                if weight > *prev {
                    new_order.retain(|c| c != &contig2);
                    new_order.push(contig2.clone());
                    seen.insert(contig2, weight);
                }
            } else {
                seen.insert(contig2.clone(), weight);
                new_order.push(contig2);
            }
        }
    }

    // append any target contig that had no synteny hits
    for contig in target_order {
        if !seen.contains_key(contig) {
            new_order.push(contig.clone());
        }
    }

    new_order
}
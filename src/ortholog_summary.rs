use crate::logger::Logger;
use crate::omcl;

use std::path::{Path, PathBuf};
use std::process;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::collections::BTreeSet;

pub enum OrthologySource {
    OrthoFinder(PathBuf),
    OrthoMcl(PathBuf),
    Rbh(PathBuf),
}

#[derive(Debug, Copy, Clone)]
pub enum OrthologyMethod {
    OrthoFinder,
    OrthoMcl,
    Rbh,
}

pub fn detect_orthology_source(
    preferred: Option<OrthologyMethod>,
    orthofinder_out_dir: &Path,
    omcl_out_dir: &Path,
    rbh_out_dir: &Path,
    logger: &Logger,
) -> OrthologySource {

    // Marker files for auto-detection
    let of_marker = orthofinder_out_dir.join("Orthogroups.tsv");
    let omcl_marker = omcl_out_dir.join("all_orthomcl.out");
    let rbh_marker = rbh_out_dir.join("all_vs_all.out.pairs.slclust.OrthoClusters");

    // 1. If the user explicitly ran rbh/orthomcl/orthofinder in this invocation,
    //    respect that first and fail loudly if its output is missing.
    if let Some(method) = preferred {
        match method {
            OrthologyMethod::OrthoFinder => {
                if fs::metadata(&of_marker).is_ok() {
                    logger.information(&format!("ortholog-summary: using OrthoFinder output at {}", of_marker.display()));
                    return OrthologySource::OrthoFinder(orthofinder_out_dir.to_path_buf());
                } else {
                    logger.error(&format!("ortholog-summary: OrthoFinder was requested but {} does not exist", of_marker.display()));
                    process::exit(1);
                }
            }
            OrthologyMethod::OrthoMcl => {
                if fs::metadata(&omcl_marker).is_ok() {
                    logger.information(&format!("ortholog-summary: using OrthoMCL output at {}", omcl_marker.display()));
                    return OrthologySource::OrthoMcl(omcl_out_dir.to_path_buf());
                } else {
                    logger.error(&format!("ortholog-summary: OrthoMCL was requested but {} does not exist", omcl_marker.display()));
                    process::exit(1);
                }
            }
            OrthologyMethod::Rbh => {
                if fs::metadata(&rbh_marker).is_ok() {
                    logger.information(&format!("ortholog-summary: using RBH output at {}",rbh_marker.display()));
                    return OrthologySource::Rbh(rbh_out_dir.to_path_buf());
                } else {
                    logger.error(&format!("ortholog-summary: RBH was requested but {} does not exist", rbh_marker.display()));
                    process::exit(1);
                }
            }
        }
    }

    // 2. No explicit method in this run: auto-detect in default priority:
    //    OrthoFinder > OrthoMCL > RBH

    // 1. OrthoFinder first
    if fs::metadata(&of_marker).is_ok() {
        logger.information(&format!("ortholog-summary: using OrthoFinder output at {}", of_marker.display()));
        return OrthologySource::OrthoFinder(orthofinder_out_dir.to_path_buf());
    }

    // 2. OrthoMCL
    if fs::metadata(&omcl_marker).is_ok() {
        logger.information(&format!("ortholog-summary: using OrthoMCL output at {}", omcl_marker.display()));
        return OrthologySource::OrthoMcl(omcl_out_dir.to_path_buf());
    }

    // 3. RBH
    if fs::metadata(&rbh_marker).is_ok() {
        logger.information(&format!("ortholog-summary: using RBH output at {}", rbh_marker.display()));
        return OrthologySource::Rbh(rbh_out_dir.to_path_buf());
    }

    // 4. Nothing found - fail loudly
    logger.error(
        "ortholog-summary: could not find any orthology output.\n\
         Expected one of:\n\
         - Orthofinder at Orthogroups.tsv in orthofinder_out_dir\n\
         - OrthoMCL output in omcl_out_dir\n\
         - RBH output in rbh_out_dir",
    );
    process::exit(1);
}

pub fn from_orthofinder(
    orthofinder_dir: &Path,
    alignment_type: &str,
    gene_clusters_out_dir: &Path,
    all_genes: &HashMap<String, Vec<String>>,
    logger: &Logger,
) -> PathBuf {

    logger.information(&format!("from_orthofinder: {}", alignment_type));

    // 1. Locate Orthogroups.tsv
    let input_path = orthofinder_dir.join("Orthogroups.tsv");
    if !input_path.is_file() {
        logger.error(&format!("from_orthofinder: could not find {}", input_path.display()));
        process::exit(1);
    }

    // 2. Ensure output directory exists
    if let Err(e) = fs::create_dir_all(gene_clusters_out_dir) {
        logger.error(&format!("from_orthofinder: failed to create output directory {}: {}", gene_clusters_out_dir.display(), e));
        process::exit(1);
    }

    // 3. Output paths
    let clusters_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.orthofinder.clusters", alignment_type));
    let unique_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.orthofinder.unique", alignment_type));
    let clusters_and_unique = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.orthofinder.clusters_and_uniques", alignment_type));

    logger.information(&format!("from_orthofinder: reading {}", input_path.display()));
    logger.information(&format!("from_orthofinder: writing clusters to {}", clusters_path.display()));
    logger.information(&format!("from_orthofinder: writing uniques to {}", unique_path.display()));
    logger.information(&format!("from_orthofinder: writing combined clusters+uniques to {}", clusters_and_unique.display()));

    // 4. Open input and outputs
    let infile = match File::open(&input_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthofinder: failed to open {}: {}", input_path.display(), e));
            process::exit(1);
        }
    };
    let mut reader = BufReader::new(infile);

    let clusters_file = match File::create(&clusters_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthofinder: failed to create clusters file {}: {}", clusters_path.display(), e));
            process::exit(1);
        }
    };
    let mut clusters_writer = BufWriter::new(clusters_file);

    let combined_file = match File::create(&clusters_and_unique) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthofinder: failed to create combined file {}: {}", clusters_and_unique.display(), e));
            process::exit(1);
        }
    };
    let mut combined_writer = BufWriter::new(combined_file);

    // 5. Read header line to get genome names
    let mut header_line = String::new();
    if let Err(e) = reader.read_line(&mut header_line) {
        logger.error(&format!("from_orthofinder: failed to read header from {}: {}", input_path.display(), e));
        process::exit(1);
    }

    // remove only newline characters, keep trailing tabs
    while header_line.ends_with('\n') || header_line.ends_with('\r') {
        header_line.pop();
    }

    if header_line.is_empty() {
        logger.error("from_orthofinder: Orthogroups.tsv header line is empty");
        process::exit(1);
    }

    let header_cols: Vec<&str> = header_line.split('\t').collect();
    if header_cols.len() < 2 {
        logger.error(&format!("from_orthofinder: header has fewer than 2 columns: {}", header_line));
        process::exit(1);
    }

    // First column is "Orthogroup"
    // Remaining columns are genome names, which should match repo genome ids
    let genome_headers: Vec<String> = header_cols[1..].iter().map(|s| s.to_string()).collect();

    logger.information(&format!("from_orthofinder: detected {} genomes in Orthogroups.tsv header",genome_headers.len()));

    // 6. Track which genes are clustered
    let mut clustered_genes: HashSet<(String, String)> = HashSet::new();
    let mut next_cluster_id: u64 = 0;

    // Helper to flush a group
    let mut flush_group = |group: &mut Vec<(String, String)>, next_cluster_id: &mut u64| {
        if group.len() < 2 {
            group.clear();
            return;
        }

        let label = format!("{:07}", *next_cluster_id);
        *next_cluster_id += 1;

        let mut genomes_in_group: HashSet<&str> = HashSet::new();

        for (genome, gene_id) in group.iter() {
            genomes_in_group.insert(genome.as_str());

            let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

            if let Err(e) = writeln!(clusters_writer, "{line}") {
                logger.error(&format!("from_orthofinder: write error (clusters): {}", e));
                process::exit(1);
            }
            if let Err(e) = writeln!(combined_writer, "{line}") {
                logger.error(&format!("from_orthofinder: write error (clusters_and_uniques): {}", e));
                process::exit(1);
            }
        }

        if let Err(e) = writeln!(clusters_writer) {
            logger.error(&format!("from_orthofinder: write error (clusters spacer): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer) {
            logger.error(&format!("from_orthofinder: write error (combined spacer): {}", e));
            process::exit(1);
        }

        //logger.information(&format!("from_orthofinder: wrote cluster {label} with {} genes from {} genomes", group.len(), genomes_in_group.len()));

        group.clear();
    };

    // 7. Parse each orthogroup row
    let mut line_buf = String::new();
    let mut group: Vec<(String, String)> = Vec::new();

    loop {
        line_buf.clear();
        let bytes = match reader.read_line(&mut line_buf) {
            Ok(n) => n,
            Err(e) => {
                logger.error(&format!("from_orthofinder: read error in {}: {}", input_path.display(), e));
                process::exit(1);
            }
        };

        if bytes == 0 {
            break;
        }

        // strip only newlines
        while line_buf.ends_with('\n') || line_buf.ends_with('\r') {
            line_buf.pop();
        }

        if line_buf.trim().is_empty() {
            continue;
        }

        let mut cols: Vec<&str> = line_buf.split('\t').collect();

        // If there are fewer columns than the header (because of trailing empty cells)
        // pad with empty strings so indices still line up
        if cols.len() < header_cols.len() {
            logger.information(&format!("from_orthofinder: padding row {} from {} to {} columns", cols[0], cols.len(), header_cols.len()));
            cols.resize(header_cols.len(), "");
        } else if cols.len() > header_cols.len() {
            logger.warning(&format!("from_orthofinder: row has {} columns (expected {}), keeping first {}: {}", cols.len(), header_cols.len(), header_cols.len(), line_buf));
            cols.truncate(header_cols.len());
        }

        // let og_id = cols[0]; // not used, but available if needed
        group.clear();

        // For each genome column
        for (idx, genome_name) in genome_headers.iter().enumerate() {
            let cell = cols[idx + 1].trim();
            if cell.is_empty() {
                continue;
            }

            // OrthoFinder uses comma separated IDs in each cell
            // Example: "CA1280|7000010..., CA1280|7000010..."
            for raw_id in cell.split(',') {
                let raw_id = raw_id.trim();
                if raw_id.is_empty() {
                    continue;
                }

                // If the id looks like "GENOME|gene_id" then split on '|'
                // Otherwise, treat the entire string as gene_id and use the
                // column header as the genome name.
                let (genome, gene_id) = match raw_id.split_once('|') {
                    Some((g, id_part)) => {
                        // If the genome in the id does not match the column genome, warn but use the header
                        if g != genome_name {
                            logger.warning(&format!("from_orthofinder: id genome '{}' does not match column genome '{}' (id '{}'), using column genome", g, genome_name, raw_id));
                        }
                        (genome_name.clone(), id_part.to_string())
                    }
                    None => {
                        // No '|' present, assume raw_id is gene_id and header genome is correct
                        (genome_name.clone(), raw_id.to_string())
                    }
                };

                clustered_genes.insert((genome.clone(), gene_id.clone()));
                group.push((genome, gene_id));
            }
        }

        flush_group(&mut group, &mut next_cluster_id);
    }

    // 8. Write uniques, same approach as from_orthomcl/from_rbh
    let unique_file = match File::create(&unique_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthofinder: failed to create uniques file {}: {}", unique_path.display(), e));
            process::exit(1);
        }
    };
    let mut unique_writer = BufWriter::new(unique_file);

    let mut all_pairs: Vec<(String, String)> = Vec::new();

    for (genome, features) in all_genes {
        for line in features {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 9 {
                logger.error(&format!("from_orthofinder: GFF line has < 9 columns for genome {}: {}", genome, line));
                process::exit(1);
            }
            let attrs = cols[8];
            let parts: Vec<&str> = attrs.split('|').collect();
            if parts.len() < 2 {
                logger.error(&format!("from_orthofinder: could not parse gene_id from attributes for genome {}: {}", genome, attrs));
                process::exit(1);
            }
            let gene_id = parts[1].to_string();
            all_pairs.push((genome.clone(), gene_id));
        }
    }

    all_pairs.sort();

    let mut uniq_counter: u64 = 1;

    for (genome, gene_id) in all_pairs {
        if clustered_genes.contains(&(genome.clone(), gene_id.clone())) {
            continue;
        }

        let label = format!("uniq_{}", uniq_counter);
        uniq_counter += 1;

        let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

        if let Err(e) = writeln!(unique_writer, "{line}") {
            logger.error(&format!("from_orthofinder: write error (unique): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer, "{line}") {
            logger.error(&format!("from_orthofinder: write error (clusters_and_uniques): {}", e));
            process::exit(1);
        }
    }

    logger.information(&format!("from_orthofinder: wrote {} cluster groups and {} unique genes", next_cluster_id, uniq_counter.saturating_sub(1)));

    clusters_and_unique
}

pub fn from_orthomcl(
    omcl_dir: &Path,
    alignment_type: &str,
    gene_clusters_out_dir: &Path,
    all_genes: &HashMap<String, Vec<String>>,
    logger: &Logger,
) -> PathBuf {

    logger.information(&format!("from_orthomcl: {}", alignment_type));

    // Input OMCL clusters file
    let input_path = omcl_dir.join("all_orthomcl.out");
    if !input_path.is_file() {
        logger.error(&format!("from_orthomcl: could not find {}", input_path.display()));
        std::process::exit(1);
    }

    // 2. Load genome code → genome name mapping (e.g. G001 → CNB2)
    let codes_path = omcl_dir.join("genome_codes.tsv");
    let code_to_genome = omcl::load_genome_codes(&codes_path, logger);

    // 3. Make output directory
    if let Err(e) = fs::create_dir_all(gene_clusters_out_dir) {
        logger.error(&format!("from_orthomcl: failed to create output directory {} : {}", gene_clusters_out_dir.display(), e));
        std::process::exit(1);
    }

    // 4. Output files
    let clusters_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.OMCL.clusters", alignment_type));
    let unique_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.OMCL.unique", alignment_type));
    let clusters_and_unique = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.OMCL.clusters_and_uniques", alignment_type));

    logger.information(&format!("from_orthomcl: reading {}", input_path.display()));
    logger.information(&format!("from_orthomcl: writing clusters to {}", clusters_path.display()));
    logger.information(&format!("from_orthomcl: writing uniques to {}", unique_path.display()));
    logger.information(&format!("from_orthomcl: writing combined clusters+uniques to {}", clusters_and_unique.display()));

    // Open input
    let infile = match File::open(&input_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthomcl: failed to open {}: {}", input_path.display(), e));
            process::exit(1);
        }
    };
    let reader = BufReader::new(infile);

    // Open clusters output
    let clusters_file = match File::create(&clusters_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthomcl: failed to create clusters file {}: {}", clusters_path.display(), e));
            process::exit(1);
        }
    };
    let mut clusters_writer = BufWriter::new(clusters_file);

    let combined_file = match File::create(&clusters_and_unique) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthomcl: failed to create combined file {}: {}", clusters_and_unique.display(), e));
            process::exit(1);
        }
    };
    let mut combined_writer = BufWriter::new(combined_file);

    // 5. Track which genes are used in clusters
    let mut clustered_genes: HashSet<(String, String)> = HashSet::new();
    let mut next_cluster_id: u64 = 0;

    // Helper to write one group (already parsed into (genome, gene_id))
    let mut flush_group = |group: &mut Vec<(String, String)>, next_cluster_id: &mut u64| -> () {
        // need at least 2 genes to be a cluster
        if group.len() < 2 {
            group.clear();
            return;
        }

        let label = format!("{:07}", *next_cluster_id);
        *next_cluster_id += 1;

        for (genome, gene_id) in group.iter() {
            let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

            if let Err(e) = writeln!(clusters_writer, "{line}") {
                logger.error(&format!("from_orthomcl: write error (clusters): {}", e));
                process::exit(1);
            }
            if let Err(e) = writeln!(combined_writer, "{line}") {
                logger.error(&format!("from_orthomcl: write error (clusters_and_uniques): {}", e));
                process::exit(1);
            }
        }

        // extra blank line between groups
        if let Err(e) = writeln!(clusters_writer) {
            logger.error(&format!("from_orthomcl: write error (clusters spacer): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer) {
            logger.error(&format!("from_orthomcl: write error (combined spacer): {}", e));
            process::exit(1);
        }

        group.clear();
    };

    // 6. Parse OrthoMCL groups file
    // Example line:
    // ORTHOMCL0(23 genes,1 taxa):  G001|7000010362786819(G001) G001|7000010362789333(G001) ...
    // Each token after ':' is "Gnnn|GENEID(Gnnn)".
    let mut group: Vec<(String, String)> = Vec::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("from_orthomcl: read error in {}: {}", input_path.display(), e));
                process::exit(1);
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        //logger.warning(&format!("from_orthomcl: processing omcl line: {}", trimmed));

        // Split off header before ":"; everything after is the gene list
        let parts: Vec<&str> = trimmed.splitn(2, ':').collect();
        if parts.len() < 2 {
            logger.error(&format!("from_orthomcl: line missing ':' separator: {}", trimmed));
            process::exit(1);
        }

        let genes_part = parts[1].trim();
        if genes_part.is_empty() {
            continue;
        }

        //logger.warning(&format!("from_orthomcl: genes part: {}", genes_part));

        group.clear();

        for token in genes_part.split_whitespace() {
            // token like "G001|7000010362786819(G001)"
            let (code, rest) = match token.split_once('|') {
                Some(cr) => cr,
                None => {
                    logger.error(&format!("from_orthomcl: token missing '|': {}", token));
                    process::exit(1);
                }
            };

            let genome = match code_to_genome.get(code) {
                Some(g) => g.clone(),
                None => {
                    logger.error(&format!("from_orthomcl: genome code '{}' not found in genome_codes.txt (token: {})", code, token));
                    process::exit(1);
                }
            };

            // Strip trailing "(G001)" etc.
            let gene_id = match rest.split_once('(') {
                Some((id, _)) => id.to_string(),
                None => rest.to_string(),
            };

            //logger.warning(&format!("from_orthomcl: code: {}, genome: {} and gene_id {}", code, genome, gene_id));

            clustered_genes.insert((genome.clone(), gene_id.clone()));
            group.push((genome, gene_id));
        }

        // One OrthoMCL line = one cluster group
        flush_group(&mut group, &mut next_cluster_id);

        //logger.error(&format!("from_orthomcl: end here"));
        //process::exit(1);
    }

    // 7. Write uniques (same logic as in from_rbh)
    let unique_file = match File::create(&unique_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_orthomcl: failed to create uniques file {}: {}", unique_path.display(), e));
            process::exit(1);
        }
    };
    let mut unique_writer = BufWriter::new(unique_file);

    // Collect all (genome, gene_id) from GFF-derived map
    let mut all_pairs: Vec<(String, String)> = Vec::new();
    for (genome, features) in all_genes {
        for line in features {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 9 {
                logger.error(&format!("from_orthomcl: GFF line has < 9 columns for genome {}: {}", genome, line));
                process::exit(1);
            }
            let attrs = cols[8];
            let parts: Vec<&str> = attrs.split('|').collect();
            if parts.len() < 2 {
                logger.error(&format!("from_orthomcl: could not parse gene_id from attributes for genome {}: {}", genome, attrs));
                process::exit(1);
            }
            let gene_id = parts[1].to_string();
            all_pairs.push((genome.clone(), gene_id));
        }
    }
    all_pairs.sort();

    let mut uniq_counter: u64 = 1;

    for (genome, gene_id) in all_pairs {
        if clustered_genes.contains(&(genome.clone(), gene_id.clone())) {
            continue;
        }

        let label = format!("uniq_{}", uniq_counter);
        uniq_counter += 1;

        let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

        if let Err(e) = writeln!(unique_writer, "{line}") {
            logger.error(&format!("from_orthomcl: write error (unique): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer, "{line}") {
            logger.error(&format!("from_orthomcl: write error (clusters_and_uniques): {}", e));
            process::exit(1);
        }
    }

    logger.information(&format!("from_orthomcl: wrote {} cluster groups and {} unique genes", next_cluster_id, uniq_counter.saturating_sub(1)));

    clusters_and_unique
}

pub fn from_rbh(
    rbh_dir: &Path,
    alignment_type: &str,
    gene_clusters_out_dir: &Path,
    all_genes: &HashMap<String, Vec<String>>,
    logger: &Logger,
) -> PathBuf {

    logger.information(&format!("from_rbh: {}", alignment_type));

    // Input RBH clusters file
    let input_path = rbh_dir.join("all_vs_all.out.pairs.slclust.OrthoClusters");
    if !input_path.is_file() {
        logger.error(&format!("from_rbh: could not find {}", input_path.display()));
        std::process::exit(1);
    }

    // Make output directory
    if let Err(e) = fs::create_dir_all(gene_clusters_out_dir) {
        logger.error(&format!("from_rbh: failed to create output directory {} : {}", gene_clusters_out_dir.display(), e));
        std::process::exit(1);
    }

    // Output files
    let clusters_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.RBH.clusters", alignment_type));
    let unique_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.RBH.unique", alignment_type));
    let clusters_and_unique = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.RBH.clusters_and_uniques", alignment_type));

    logger.information(&format!("from_rbh: reading {}", input_path.display()));
    logger.information(&format!("from_rbh: writing clusters to {}", clusters_path.display()));
    logger.information(&format!("from_rbh: writing uniques to {}", unique_path.display()));
    logger.information(&format!("from_rbh: writing combined clusters+uniques to {}", clusters_and_unique.display()));

    // Open input
    let infile = match File::open(&input_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_rbh: failed to open {}: {}", input_path.display(), e));
            process::exit(1);
        }
    };
    let reader = BufReader::new(infile);

    // Open clusters output
    let clusters_file = match File::create(&clusters_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_rbh: failed to create clusters file {}: {}", clusters_path.display(), e));
            process::exit(1);
        }
    };
    let mut clusters_writer = BufWriter::new(clusters_file);

    let combined_file = match File::create(&clusters_and_unique) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_rbh: failed to create combined file {}: {}", clusters_and_unique.display(), e));
            process::exit(1);
        }
    };
    let mut combined_writer = BufWriter::new(combined_file);

    // Track which genes are used in clusters
    let mut clustered_genes: HashSet<(String, String)> = HashSet::new();

    // Helper to flush one RBH group to the clusters file
    let mut next_cluster_id: u64 = 0;
    let mut group: Vec<(String, String)> = Vec::new(); // (genome, gene_id)
    let mut flush_group = |group: &mut Vec<(String, String)>| {

        // need at least 2 genes to be a cluster
        if group.len() < 2 {
            group.clear();
            return;
        }

        // Only keep groups with 2 or more distinct genomes
        //let distinct_genomes: HashSet<&str> = group.iter().map(|(g, _)| g.as_str()).collect();
        //if distinct_genomes.len() < 2 {
        //    group.clear();
        //    return;
        //}

        let label = format!("{:07}", next_cluster_id);
        next_cluster_id += 1;

        for (genome, gene_id) in group.iter() {
            // cluster label, genome, "Ortho", gene_id
            let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

            if let Err(e) = writeln!(clusters_writer, "{line}") {
                logger.error(&format!("from_rbh: write error (clusters): {}", e));
                process::exit(1);
            }
            if let Err(e) = writeln!(combined_writer, "{line}") {
                logger.error(&format!("from_rbh: write error (clusters_and_uniques): {}", e));
                process::exit(1);
            }
        }

        // extra blank line between groups
        if let Err(e) = writeln!(clusters_writer) {
            logger.error(&format!("from_rbh: write error (clusters spacer): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer) {
            logger.error(&format!("from_rbh: write error (combined spacer): {}", e));
            process::exit(1);
        }

        group.clear();
    };

    // Parse input line by line
    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("from_rbh: read error in {}: {}", input_path.display(), e));
                process::exit(1);
            }
        };
        let trimmed = line.trim();

        if trimmed.is_empty() {
            // end of one cluster block
            flush_group(&mut group);
            continue;
        }

        let cols: Vec<&str> = trimmed.split('\t').collect();
        if cols.len() < 4 {
            logger.error(&format!("from_rbh: expected at least 4 columns in {}, got {}: {}", input_path.display(), cols.len(), trimmed));
            std::process::exit(1);
        }

        // cols[0] is the original RBH cluster id, cols[1] is "Ortho"
        let genome = cols[2].to_string();
        let gene_id = cols[3].to_string();

        clustered_genes.insert((genome.clone(), gene_id.clone()));
        group.push((genome, gene_id));
    }

    // Flush last group if file does not end with a blank line
    flush_group(&mut group);

    // Now write uniques
    let unique_file = match File::create(&unique_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("from_rbh: failed to create uniques file {}: {}", unique_path.display(), e));
            process::exit(1);
        }
    };
    let mut unique_writer = BufWriter::new(unique_file);

    // Collect all (genome, gene_id) pairs, sorted for deterministic output
    let mut all_pairs: Vec<(String, String)> = Vec::new();
    for (genome, features) in all_genes {
        for line in features {
            //let line = feat.  .original_line.clone();
            let cols: Vec<&str> = line.split('\t').collect();
            let cols2: Vec<&str> = cols[8].split('|').collect();
            all_pairs.push((genome.clone(), cols2[1].to_string().clone()));
        }
    }
    all_pairs.sort();

    let mut uniq_counter: u64 = 1;

    for (genome, gene_id) in all_pairs {
        if clustered_genes.contains(&(genome.clone(), gene_id.clone())) {
            continue;
        }
        let label = format!("uniq_{}", uniq_counter);
        uniq_counter += 1;
        
        let line = format!("{label}\t{genome}\tOrtho\t{gene_id}");

        if let Err(e) = writeln!(unique_writer, "{line}") {
            logger.error(&format!("from_rbh: write error (unique): {}", e));
            process::exit(1);
        }
        if let Err(e) = writeln!(combined_writer, "{line}") {
            logger.error(&format!("from_rbh: write error (clusters_and_uniques): {}", e));
            process::exit(1);
        }
    }

    logger.information(&format!("from_rbh: wrote {} cluster groups and {} unique genes", next_cluster_id, uniq_counter.saturating_sub(1)));

    clusters_and_unique
}

pub fn write_cluster_dist_per_genome(
    combined_clusters_path: &Path,  // GENE_CLUSTERS_SUMMARIES.*.clusters_and_uniques
    output_path: &Path,             // *.cluster_dist_per_genome.txt
    logger: &Logger,
) {
    logger.information(&format!("cluster_dist_per_genome: reading {}", combined_clusters_path.display()));
    logger.information(&format!("cluster_dist_per_genome: writing {}", output_path.display()));

    // Open input
    let infile = match File::open(combined_clusters_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("cluster_dist_per_genome: failed to open {}: {}", combined_clusters_path.display(), e));
            process::exit(1);
        }
    };
    let reader = BufReader::new(infile);

    // Open output
    let outfile = match File::create(output_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("cluster_dist_per_genome: failed to create {}: {}", output_path.display(), e));
            process::exit(1);
        }
    };
    let mut writer = BufWriter::new(outfile);

    // Data structures (Rust equivalents of Perl hashes)
    let mut cluster_to_genome_count: HashMap<String, HashMap<String, u64>> = HashMap::new();
    //let mut cluster_to_name_count: HashMap<String, HashMap<String, u64>> = HashMap::new();
    let mut genome_to_gene_count: HashMap<String, u64> = HashMap::new();
    let mut genomes: BTreeSet<String> = BTreeSet::new();

    // Parse combined file: cluster_id, genome, Ortho, gene_id
    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("cluster_dist_per_genome: read error in {}: {}", combined_clusters_path.display(), e));
                process::exit(1);
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let cols: Vec<&str> = trimmed.split('\t').collect();
        if cols.len() < 4 {
            logger.error(&format!("cluster_dist_per_genome: expected at least 4 columns, got {}: {}", cols.len(), trimmed));
            process::exit(1);
        }

        let cluster_id = cols[0].to_string();
        let genome = cols[1].to_string();
        // cols[2] is "Ortho" (not used here)
        //let gene_id = cols[3].to_string();

        genomes.insert(genome.clone());

        // cluster_to_genome_count{cluster}{genome}++
        let genome_counts = cluster_to_genome_count.entry(cluster_id.clone()).or_insert_with(HashMap::new);
        *genome_counts.entry(genome.clone()).or_insert(0) += 1;

        // cluster_to_name_count{cluster}{name}++ (we use gene_id as 'name' proxy)
        //let name_counts = cluster_to_name_count.entry(cluster_id.clone()).or_insert_with(HashMap::new);
        //*name_counts.entry(gene_id.clone()).or_insert(0) += 1;

        // genome_to_gene_count{genome}++
        *genome_to_gene_count.entry(genome).or_insert(0) += 1;
    }

    // Sorted list of genomes
    let mut genome_list: Vec<String> = genomes.into_iter().collect();
    genome_list.sort();

    // Sorted list of cluster IDs
    let mut cluster_ids: Vec<String> = cluster_to_genome_count.keys().cloned().collect();
    cluster_ids.sort();

    // First header line: #genome=count
    let mut header_counts = String::from("#");
    let mut genome_keys: Vec<&String> = genome_to_gene_count.keys().collect();
    genome_keys.sort();
    for g in genome_keys {
        let count = genome_to_gene_count.get(g).unwrap_or(&0);
        header_counts.push_str(&format!("{}={}\t", g, count));
    }
    if header_counts.ends_with('\t') {
        header_counts.pop();
    }
    if let Err(e) = writeln!(writer, "{}", header_counts) {
        logger.error(&format!("cluster_dist_per_genome: write error (header counts): {}", e));
        process::exit(1);
    }

    // Second header line: #cluster_id\tname\t<genomes...>
    if let Err(e) = writeln!(writer, "#cluster_id\tname\t{}", genome_list.join("\t")) {
        logger.error(&format!("cluster_dist_per_genome: write error (header line): {}", e));
        process::exit(1);
    }

    // Body lines
    for cluster_id in cluster_ids {
        //let name_counts = match cluster_to_name_count.get(&cluster_id) {
        //    Some(n) if !n.is_empty() => n,
        //    _ => continue,
        //};

        // Pick most frequent "name" (here: gene_id) as representative
        //let mut name_vec: Vec<(&String, &u64)> = name_counts.iter().collect();
        //name_vec.sort_by_key(|(_, count)| *count);
        //let (best_name, _) = name_vec[name_vec.len() - 1];

        // Sanitize non-word chars -> '_'
        //let clean_name: String = best_name.chars().map(|c| { if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' } }).collect();
        let clean_name = "hypothetical protein";

        let mut line = format!("{}\t{}", cluster_id, clean_name);

        if let Some(genome_counts) = cluster_to_genome_count.get(&cluster_id) {
            for g in &genome_list {
                let c = genome_counts.get(g).cloned().unwrap_or(0);
                line.push('\t');
                line.push_str(&c.to_string());
            }
        } else {
            // Should not really happen, but keep behaviour defined
            for _ in &genome_list {
                line.push_str("\t0");
            }
        }

        if let Err(e) = writeln!(writer, "{}", line) {
            logger.error(&format!("cluster_dist_per_genome: write error (cluster row): {}", e));
            process::exit(1);
        }
    }

    logger.information(&format!("cluster_dist_per_genome: wrote {} clusters for {} genomes to {}", cluster_to_genome_count.len(), genome_list.len(), output_path.display()));
}
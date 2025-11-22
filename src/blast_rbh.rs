use crate::logger::Logger;

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn write_blast_pairs<P: AsRef<Path>>(all_vs_all_path: P) -> Result<PathBuf, String> {
    let input_path = all_vs_all_path.as_ref();
    let output_path = input_path.with_extension("pairs");

    let infile = File::open(&input_path)
        .map_err(|e| format!("Cannot open input file {}: {}", input_path.display(), e))?;
    let reader = BufReader::new(infile);

    let mut outfile = File::create(&output_path)
        .map_err(|e| format!("Cannot create output file {}: {}", output_path.display(), e))?;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Error reading line: {}", e))?;
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() >= 2 {
            writeln!(outfile, "{}\t{}", fields[0], fields[1])
                .map_err(|e| format!("Error writing line: {}", e))?;
        }
    }

    Ok(output_path)
}

pub fn run_slclust_on_pairs(
    slclust_path: &Path,
    pairs_file: &Path,
    logger: &Logger,
) -> Result<PathBuf, String> {
    let output_path = pairs_file.with_extension("pairs.slclust");

    logger.information(&format!("run_slclust_on_pairs: {}", pairs_file.display()));

    // Open input and output files
    let input_file = File::open(pairs_file).map_err(|e| format!("Failed to open pairs file {}: {}", pairs_file.display(), e))?;
    let output_file = File::create(&output_path).map_err(|e| format!("Failed to create output file {}: {}", output_path.display(), e))?;

    // Pipe input and output to slclust
    let mut child = Command::new(slclust_path)
        .stdin(Stdio::from(input_file))
        .stdout(Stdio::from(output_file))
        .spawn()
        .map_err(|e| format!("Failed to launch slclust: {}", e))?;

    let status = child.wait().map_err(|e| format!("Failed to wait for slclust: {}", e))?;

    if !status.success() {
        return Err(format!("slclust returned non-zero exit status: {}", status));
    }

    logger.information(&format!("run_slclust_on_pairs: finished successfully: {}", output_path.display()));
    Ok(output_path)
}

pub fn parse_clusters<P: AsRef<Path>>(cluster_file: P) -> Result<HashMap<usize, Vec<String>>, String> {
    let file = File::open(&cluster_file).map_err(|e| format!("Failed to open cluster file {}: {}", cluster_file.as_ref().display(), e))?;
    let reader = BufReader::new(file);

    let mut clusters = HashMap::new();
    for (index, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| format!("Error reading cluster file: {}", e))?;
        let genes: Vec<String> = line.split_whitespace().map(|s| s.to_string()).collect();
        clusters.insert(index + 1, genes); // cluster_id starts from 1
    }

    Ok(clusters)
}

pub fn map_gene_to_cluster_id(cluster_map: &HashMap<usize, Vec<String>>) -> HashMap<String, usize> {
    let mut gene_to_cluster = HashMap::new();

    for (cluster_id, genes) in cluster_map {
        for gene in genes {
            gene_to_cluster.insert(gene.clone(), *cluster_id);
        }
    }

    gene_to_cluster
}
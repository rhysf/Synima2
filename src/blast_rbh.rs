use crate::logger::Logger;
use crate::RepoEntry;
use crate::read_repo::GeneStruct;

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Write, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn write_blast_pairs<P: AsRef<Path>>(all_vs_all_path: P) -> Result<PathBuf, String> {
    let input_path = all_vs_all_path.as_ref();
    let output_path = input_path.with_file_name(format!("{}{}", input_path.file_name().unwrap().to_string_lossy(), ".pairs"));

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

pub fn get_top_ortho_blast_score(
    repo: &[RepoEntry],
    blast_out_dir: &Path,
    logger: &Logger
) -> Result<HashMap<String, f64>, String> {

    logger.information(&format!("get_top_ortho_blast_score: {}", blast_out_dir.display()));

    let mut id_to_top_score: HashMap<String, f64> = HashMap::new();
    let mut genomes: Vec<&String> = repo.iter().map(|r| &r.name).collect();
    genomes.sort();

    for i in 0..genomes.len() {

        let genome_a = genomes[i];
        if genome_a == "synima_all" {
            continue;
        }

        for j in (i + 1)..genomes.len() {

            let genome_b = genomes[j];
            if genome_b == "synima_all" {
                continue;
            }

            let file_name = format!("{}_vs_{}.out", genome_a, genome_b);
            let rbh_file = blast_out_dir.join(file_name);

            if !rbh_file.exists() {
                logger.error(&format!("get_top_ortho_blast_score: {} does not exist (rerun step 2: blast-grid)", rbh_file.display()));
                return Err(format!("Error: {} does not exist", rbh_file.display()));
            }

            let reader = BufReader::new(File::open(&rbh_file).map_err(|e| format!("Error opening {}: {}", rbh_file.display(), e))?);

            for line in reader.lines() {
                let line = line.map_err(|e| format!("Error reading {}: {}", rbh_file.display(), e))?;
                let fields: Vec<&str> = line.split('\t').collect();
                if fields.len() < 12 {
                    continue;
                }

                let acc_a = fields[0].to_string();
                let acc_b = fields[1].to_string();
                let bit_score: f64 = fields[11].parse().map_err(|e| format!("Error parsing bit score in {}: {}", rbh_file.display(), e))?;

                id_to_top_score
                    .entry(acc_a.clone())
                    .and_modify(|e| *e = e.max(bit_score))
                    .or_insert(bit_score);
                id_to_top_score
                    .entry(acc_b.clone())
                    .and_modify(|e| *e = e.max(bit_score))
                    .or_insert(bit_score);
            }
        }
    }

    Ok(id_to_top_score)
}

pub fn get_inparalogs(
    repo: &[RepoEntry],
    blast_out_dir: &Path,
    gene_to_top_ortho_blast_score: &HashMap<String, f64>,
    gene_to_cluster: &HashMap<String, usize>,
    logger: &Logger,
) -> Result<HashMap<usize, Vec<String>>, String> {

    logger.information("get_inparalogs: Running...");

    let mut inparalog_to_ortho_group: HashMap<String, (usize, f64)> = HashMap::new();

    for entry in repo.iter() {
        let genome = &entry.name;
        if genome == "synima_all" {
            continue;
        }

        let self_blast_file_name = format!("{}_vs_{}.out", genome, genome);
        let self_blast_file = blast_out_dir.join(self_blast_file_name);

        let file = File::open(&self_blast_file)
            .map_err(|e| format!("Failed to open self-BLAST file {}: {}", self_blast_file.display(), e))?;

        let reader = BufReader::new(file);

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Error reading line: {}", e))?;
            let fields: Vec<&str> = line.trim().split('\t').collect();
            if fields.len() < 12 {
                continue;
            }

            let (mut acc_a, mut acc_b) = (fields[0], fields[1]);
            if acc_a == acc_b {
                continue;
            }

            let bit_score: f64 = fields[11].parse().unwrap_or(0.0);

            let acc_a_has_ortho = gene_to_top_ortho_blast_score.contains_key(acc_a);
            let acc_b_has_ortho = gene_to_top_ortho_blast_score.contains_key(acc_b);

            if acc_a_has_ortho == acc_b_has_ortho {
                continue;
            }

            if acc_b_has_ortho {
                std::mem::swap(&mut acc_a, &mut acc_b);
            }

            let ortho_score = *gene_to_top_ortho_blast_score.get(acc_a).unwrap();
            if bit_score > ortho_score {
                let ortho_cluster = *gene_to_cluster
                    .get(acc_a)
                    .ok_or_else(|| format!("Missing cluster for acc: {}", acc_a))?;

                match inparalog_to_ortho_group.get(acc_b) {
                    Some((existing_cluster, existing_score)) => {
                        if *existing_cluster != ortho_cluster && *existing_score < bit_score {
                            logger.warning(&format!(
                                "Warning: {} already mapped to cluster {} with score {}, moving to {} with score {}",
                                acc_b, existing_cluster, existing_score, ortho_cluster, bit_score
                            ));
                            inparalog_to_ortho_group.insert(acc_b.to_string(), (ortho_cluster, bit_score));
                        }
                    }
                    None => {
                        inparalog_to_ortho_group.insert(acc_b.to_string(), (ortho_cluster, bit_score));
                    }
                }
            }
        }
    }

    // Re-map to: cluster_id -> Vec<gene>
    let mut cluster_id_to_para_list: HashMap<usize, Vec<String>> = HashMap::new();
    for (gene, (cluster_id, _)) in inparalog_to_ortho_group {
        cluster_id_to_para_list
            .entry(cluster_id)
            .or_default()
            .push(gene);
    }

    Ok(cluster_id_to_para_list)
}

pub fn write_final_rbh_clusters<P: AsRef<Path>>(
    out_path: P,
    cluster_id_to_orthologs: &HashMap<usize, Vec<String>>,
    cluster_id_to_inparalogs: &HashMap<usize, Vec<String>>,
    gene_info: &HashMap<String, GeneStruct>,
    logger: &Logger,
) -> Result<(), String> {

    logger.information(&format!("write_final_rbh_clusters: {}", out_path.as_ref().display()));

    let file = File::create(&out_path).map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut writer = BufWriter::new(file);

    let mut cluster_ids: Vec<_> = cluster_id_to_orthologs.keys().cloned().collect();
    cluster_ids.sort_unstable();

    for cluster_id in cluster_ids {

        // Write orthologs
        if let Some(orthologs) = cluster_id_to_orthologs.get(&cluster_id) {
            for gene_id in orthologs {
                let gene_id_clean = gene_id.split('|').nth(1).ok_or_else(|| format!("Invalid gene ID format: {}", gene_id))?;
                match gene_info.get(gene_id_clean) {
                    Some(gene) => {
                        writeln!(
                            writer,
                            "{}\tOrtho\t{}\t{}\t{}\t{}\t{}",
                            cluster_id,
                            gene.genome,
                            gene.gene_id,
                            gene.gene_id,
                            gene.gene_id,
                            gene.name
                        ).map_err(|e| format!("Write error: {}", e))?;
                    }
                    None => {
                        logger.warning(&format!("write_final_rbh_clusters: Missing gene info for {}", gene_id_clean));
                        continue;
                    }
                }
            }
        }

        // Write in-paralogs
        if let Some(inparas) = cluster_id_to_inparalogs.get(&cluster_id) {
            for gene_id in inparas {
                let gene = gene_info.get(gene_id).ok_or_else(|| format!("Missing gene info for {}", gene_id))?;
                writeln!(
                    writer,
                    "{}\tInPara\t{}\t{}\t{}\t{}\t{}",
                    cluster_id,
                    gene.genome,
                    gene.gene_id,
                    gene.gene_id,
                    gene.gene_id,
                    gene.name
                ).map_err(|e| format!("Write error: {}", e))?;
            }
        }

        writeln!(writer).map_err(|e| format!("Write error: {}", e))?; // spacer
    }

    Ok(())
}
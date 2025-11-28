use crate::Logger;
use crate::dagchainer::ClusterToGenes;
use crate::util::{LogResultExt,mkdir,open_bufwrite};
use crate::read_fasta;

use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::collections::BTreeMap;
use std::io::Write;
use std::collections::{HashSet,HashMap};
use std::process::Command;
use std::process::Stdio;

use rayon::prelude::*;

// cluster_to_genes: HashMap<String, Vec<ClusterMember>>
// ClusterMember { genome: String, trans_id: String }
pub fn write_cluster_pep_files(
    cluster_to_genes: &ClusterToGenes,
    alignment_type: &str,
    pep_by_id: &HashMap<String, String>,
    malign_outdir: &Path,
    genomes_parsed: &HashSet<String>,
    logger: &Logger) {

    // Ensure directory exists
    mkdir(malign_outdir, logger, "write_cluster_pep_files");

    // Deterministic ordering of genomes and clusters
    let mut genomes: Vec<String> = genomes_parsed.iter().cloned().collect();
    genomes.sort();
    let n_genomes = genomes.len();

    logger.information(&format!("write_cluster_pep_files: considering {} genomes for 1:1 ortholog clusters", n_genomes));

    let mut cluster_ids: Vec<String> = cluster_to_genes.keys().cloned().collect();
    cluster_ids.sort();

    let mut total = 0usize;
    let mut skipped_uniq = 0usize;
    let mut skipped_not_1to1 = 0usize;
    let mut written = 0usize;

    for cluster_id in cluster_ids {
        total += 1;

        // 1) Skip uniq_ clusters
        if cluster_id.starts_with("uniq_") {
            skipped_uniq += 1;
            continue;
        }

        let members = &cluster_to_genes[&cluster_id];

        // 2) Quick length check: must have exactly one member per genome
        if members.len() != n_genomes {
            skipped_not_1to1 += 1;
            continue;
        }

        // 3) Count per genome and ensure exactly one per genome, and no extra genomes
        let mut per_genome: HashMap<&str, usize> = HashMap::new();
        for m in members {
            *per_genome.entry(m.genome.as_str()).or_insert(0) += 1;
        }

        if per_genome.len() != n_genomes {
            skipped_not_1to1 += 1;
            continue;
        }

        let mut is_1to1 = true;
        for g in &genomes {
            match per_genome.get(g.as_str()) {
                Some(1) => {}
                _ => {
                    is_1to1 = false;
                    break;
                }
            }
        }

        if !is_1to1 {
            skipped_not_1to1 += 1;
            continue;
        }

        let cds_or_pep_path = malign_outdir.join(format!("{}.{}", cluster_id, alignment_type));

        // If file already exists and is non-empty, skip (like the Perl version)
        let already_exists = cds_or_pep_path.metadata().map(|m| m.len() > 0).unwrap_or(false);

        if already_exists {
            logger.information(&format!("write_cluster_pep_files: {} already exists, not overwriting", cds_or_pep_path.display()));
            written += 1;
            continue;
        } 
        
        //logger.information(&format!("write_cluster_pep_files: writing peptide FASTA for 1:1 cluster {} -> {}", cluster_id, cds_or_pep_path.display()));

        let mut writer = open_bufwrite(&cds_or_pep_path, &logger, "write_cluster_pep_files");

        // Group by genome, then sort, to mimic Perl's "sort keys %{$clusters{$cluster_id}}"
        let mut by_genome: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for m in members {
            by_genome.entry(m.genome.clone()).or_default().push(m.trans_id.clone());
        }
        for ids in by_genome.values_mut() {
            ids.sort();
        }

        for (_genome, ids) in by_genome {
            for trans_id in ids {
                let seq = pep_by_id.get(&trans_id).unwrap_or_else(|| {
                    logger.error(&format!("write_cluster_pep_files: no protein sequence found for {} in cluster {}", trans_id, cluster_id));
                    std::process::exit(1);
                });
                let seq_upper = seq.to_ascii_uppercase();
                writeln!(writer, ">{}", trans_id).unwrap();
                writeln!(writer, "{}", seq_upper).unwrap();
            }
        }
        written += 1;
    }
    logger.information(&format!("write_cluster_pep_files: clusters examined: {}, 1:1 orthologs: {}, unique clusters skipped: {}, skipped non-1:1: {}", total, written, skipped_uniq, skipped_not_1to1));
}

pub fn run_muscle_on_pep_clusters(
    malign_dir: &Path,
    muscle_path: &Path,
    max_threads: usize,
    logger: &Logger) {

    logger.information(&format!("run_muscle_on_pep_clusters: running MUSCLE on peptide clusters in {}", malign_dir.display()));

    // Make sure directory exists
    mkdir(malign_dir, logger, "run_muscle_on_pep_clusters");

    // Collect all *.pep files in MALIGN_DIR
    let read_dir = fs::read_dir(malign_dir).log_or_exit(logger, |e| {
        format!("run_muscle_on_pep_clusters: failed to read MALIGN_DIR {}: {}", malign_dir.display(), e)
    });

    let mut pep_files: Vec<PathBuf> = Vec::new();

    for entry_res in read_dir {
        let entry = entry_res.log_or_exit(logger, |e| {
            format!("run_muscle_on_pep_clusters: failed to read entry in {}: {}", malign_dir.display(), e)
        });

        let path = entry.path();
        if path.extension() == Some(OsStr::new("pep")) {
            pep_files.push(path);
        }
    }

    if pep_files.is_empty() {
        logger.warning("run_muscle_on_pep_clusters: no .pep files found for MUSCLE, skipping alignment step");
        return;
    }

    pep_files.sort();

    let n_threads = max_threads.max(1);
    logger.information(&format!("run_muscle_on_pep_clusters: found {} .pep files, running MUSCLE with {} threads", pep_files.len(), n_threads));

    // Build a dedicated rayon pool so we do not rely on the global one
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(n_threads)
        .build()
        .log_or_exit(logger, |e| {
            format!("run_muscle_on_pep_clusters: failed to build rayon thread pool for MUSCLE: {}", e)
        });

    pool.install(|| {
        pep_files.par_iter().for_each(|pep_path| {
            // Output is "<pep>.mfa", same as Perl: $opt_s.mfa
            let mfa_path = pep_path.with_extension("pep.mfa");

            // Skip if output already exists and is non empty
            let already_done = mfa_path.metadata().map(|m| m.len() > 0).unwrap_or(false);

            if already_done {
                logger.information(&format!("run_muscle_on_pep_clusters: alignment already exists, skipping MUSCLE: {}", mfa_path.display()));
                return;
            }

            //logger.information(&format!("run_muscle_on_pep_clusters: MUSCLE aligning {} -> {}", pep_path.display(), mfa_path.display()));

            let status = Command::new(muscle_path)
                .arg("-align").arg(pep_path)
                .arg("-output").arg(&mfa_path)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                // Keep MUSCLE single threaded and let rayon control concurrency
                .arg("-threads").arg("1")
                .status();

            match status {
                Ok(st) if st.success() => {
                    //logger.information(&format!("run_muscle_on_pep_clusters: MUSCLE finished for {}", pep_path.display()));
                }
                Ok(st) => {
                    logger.error(&format!("run_muscle_on_pep_clusters: MUSCLE failed for {} with status {}", pep_path.display(), st));
                    std::process::exit(1);
                }
                Err(e) => {
                    logger.error(&format!("run_muscle_on_pep_clusters: failed to start MUSCLE for {}: {}", pep_path.display(), e));
                    std::process::exit(1);
                }
            }
        });
    });

    logger.information("run_muscle_on_pep_clusters: MUSCLE alignments complete");
}

/// Concatenate all MUSCLE alignments (*.pep.mfa) in `malign_dir`
/// into a single alignment per genome and write as FASTA.
///
/// `genomes_parsed` should be the set of genomes that appear in the
/// 1:1 core orthogroups (from `save_gene_ids_from_ortholog_file`).
pub fn concatenate_alignments_and_write(
    malign_dir: &Path,
    genomes_parsed: &HashSet<String>,
    alignment_suffix: &str,   // e.g. ".pep.mfa"
    output_path: &Path,
    logger: &Logger) {

    logger.information(&format!("concatenate_alignments_and_write: MALIGN_DIR = {}", malign_dir.display()));

    // Sorted genome list for deterministic output
    let mut genomes: Vec<String> = genomes_parsed.iter().cloned().collect();
    genomes.sort();

    if genomes.is_empty() {
        logger.error("concatenate_alignments_and_write: no genomes found in genomes_parsed");
        std::process::exit(1);
    }

    // Collect alignment files
    let mut alignment_files: Vec<PathBuf> = Vec::new();
    let rd = match fs::read_dir(malign_dir) {
        Ok(rd) => rd,
        Err(e) => {
            logger.error(&format!("concatenate_alignments_and_write: failed to read MALIGN_DIR {}: {}", malign_dir.display(), e));
            std::process::exit(1);
        }
    };

    for entry_res in rd {
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                logger.error(&format!("concatenate_alignments_and_write: error reading dir entry in {}: {}", malign_dir.display(), e));
                std::process::exit(1);
            }
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n,
            None => continue,
        };

        if name.ends_with(alignment_suffix) {
            alignment_files.push(path);
        }
    }

    alignment_files.sort();

    if alignment_files.is_empty() {
        logger.error(&format!("concatenate_alignments_and_write: no alignment files matching *{} in {}", alignment_suffix, malign_dir.display()));
        std::process::exit(1);
    }

    logger.information(&format!("concatenate_alignments_and_write: found {} alignment files", alignment_files.len()));

    // Initialise concatenated sequences per genome
    let mut concat_alignment: HashMap<String, String> = HashMap::new();
    for g in &genomes {
        concat_alignment.insert(g.clone(), String::new());
    }

    // Process each alignment file
    for aln in &alignment_files {
        logger.information(&format!("concatenate_alignments_and_write: concatenating {}", aln.display() ));

        let seqs = read_fasta::read_fasta(aln, logger);

        // genome -> aligned sequence for this single cluster alignment
        let mut this_alignment: HashMap<String, String> = HashMap::new();
        let mut length_of_seq: Option<usize> = None;

        for rec in seqs {
            let trans_id = &rec.id;

            // trans_id is like "GENOME|gene"
            let genome = match trans_id.split('|').next() {
                Some(g) => g.to_string(),
                None => {
                    logger.error(&format!("concatenate_alignments_and_write: cannot parse genome from id '{}' in {}", trans_id, aln.display()));
                    std::process::exit(1);
                }
            };

            if !genomes_parsed.contains(&genome) {
                logger.error(&format!("concatenate_alignments_and_write: genome '{}' (from id '{}') not in genomes_parsed when reading {}", genome, trans_id, aln.display()));
                std::process::exit(1);
            }

            let alignment_seq = rec.seq;
            let len = alignment_seq.len();

            if let Some(l) = length_of_seq {
                if l != len {
                    logger.error(&format!("concatenate_alignments_and_write: inconsistent sequence length in {} for genome {}: {} vs {}", aln.display(), genome, len, l));
                    std::process::exit(1);
                }
            } else {
                length_of_seq = Some(len);
            }

            if this_alignment.insert(genome.clone(), alignment_seq).is_some() {
                logger.error(&format!("concatenate_alignments_and_write: genome '{}' appears more than once in {}", genome, aln.display()));
                std::process::exit(1);
            }
        }

        // QC: every genome must be present in this alignment
        for g in &genomes {
            if !this_alignment.contains_key(g) {
                logger.error(&format!("concatenate_alignments_and_write: alignment {} missing genome {}", aln.display(), g));
                std::process::exit(1);
            }
        }

        // Append to concatenated sequences
        for g in &genomes {
            let seg = this_alignment.get(g).expect("checked above");
            let current = concat_alignment.get_mut(g).expect("pre-initialised for all genomes");
            current.push_str(seg);
        }

        // QC: concatenated lengths consistent after this alignment
        let mut concat_len: Option<usize> = None;
        for g in &genomes {
            let l = concat_alignment.get(g).unwrap().len();
            if let Some(prev) = concat_len {
                if l != prev {
                    logger.error(&format!("concatenate_alignments_and_write: inconsistent concatenated length after {} for genome {} ({} vs {})", aln.display(), g, l, prev));
                    std::process::exit(1);
                }
            } else {
                concat_len = Some(l);
            }
        }
    }

    // Finally, write the concatenated alignment to FASTA
    logger.information(&format!("concatenate_alignments_and_write: writing concatenated alignment to {}", output_path.display()));

    let mut writer = open_bufwrite(output_path, logger, "concatenate_alignments_and_write");

    for g in &genomes {
        if let Some(seq) = concat_alignment.get(g) {
            if let Err(e) = writeln!(writer, ">{}", g) {
                logger.error(&format!("concatenate_alignments_and_write: write error for header {}: {}", g, e));
                std::process::exit(1);
            }

            // wrap at 60 chars
            let bytes = seq.as_bytes();
            let mut i = 0;
            while i < bytes.len() {
                let end = std::cmp::min(i + 60, bytes.len());
                let line = std::str::from_utf8(&bytes[i..end]).unwrap();
                if let Err(e) = writeln!(writer, "{}", line) {
                    logger.error(&format!("concatenate_alignments_and_write: write error for {}: {}", g, e));
                    std::process::exit(1);
                }
                i = end;
            }
        }
    }

    // flush
    if let Err(e) = writer.flush() {
        logger.error(&format!("concatenate_alignments_and_write: flush error for {}: {}", output_path.display(), e));
        std::process::exit(1);
    }
}

/// Run FastTree on a concatenated alignment and write `<alignment>.tree`.
/// If FastTree fails, this logs a warning and returns without exiting,
/// mirroring the old Perl `eval { ... }` behaviour.
pub fn run_fasttree_on_alignment(
    fasttree_path: &Path,
    alignment_fasta: &Path,
    is_nt: bool,   // true for nucleotide, false for protein
    logger: &Logger) {

    let tree_path = alignment_fasta.with_extension(format!("{}.tree", alignment_fasta.extension().and_then(|s| s.to_str()).unwrap_or("tree")));

    logger.information(&format!("run_fasttree_on_alignment: building tree from {} -> {}", alignment_fasta.display(), tree_path.display()));

    let mut cmd = Command::new(fasttree_path);

    if is_nt {
        cmd.arg("-nt");
    }

    cmd.arg(alignment_fasta)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => {
            logger.warning(&format!("run_fasttree_on_alignment: FastTree failed to start: {}. Skipping tree.", e));
            return;
        }
    };

    if !output.status.success() {
        logger.warning(&format!("run_fasttree_on_alignment: FastTree exited with status {}. Skipping tree.", output.status));
        return;
    }

    fs::write(&tree_path, &output.stdout).log_or_exit(logger, |e| {
        format!("run_fasttree_on_alignment: failed to write tree {}: {}", tree_path.display(), e)
    });

    logger.information(&format!("run_fasttree_on_alignment: wrote tree to {}",tree_path.display()));
}
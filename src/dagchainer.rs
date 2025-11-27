use crate::logger::Logger;
use crate::RepoEntry;
use crate::util::{mkdir,open_bufread,open_bufwrite};

use std::collections::{HashMap, HashSet};
use std::path::{Path,PathBuf};
use std::io::BufRead;
use std::io::Write;
use std::process;
use std::process::Command;
use std::process::Stdio;
use std::collections::{BTreeMap}; //BTreeSet
use std::io;
use std::fs;

#[derive(Debug, Clone)]
pub struct ClusterMember {
    pub genome: String,
    pub trans_id: String, // e.g. "CA1280:7000010362857299"
}

#[derive(Debug, Clone)]
pub struct DagchainerPaths {
    pub annot_gff: PathBuf,
    pub genome_fasta: PathBuf,
}

// cluster_id -> list of members
pub type ClusterToGenes = HashMap<String, Vec<ClusterMember>>;

// genomeA -> genomeB -> list of (trans_id_A, trans_id_B)
pub type GenomePairToGenePairs = HashMap<String, HashMap<String, Vec<GenePair>>>;

// genome -> paths
pub type GenomePathMap = BTreeMap<String, DagchainerPaths>;

/// A single orthologous hit pair used by DAGchainer
pub type GenePair = (String, String);

pub fn save_gene_ids_from_ortholog_file(
    clusters_file: &Path,
    logger: &Logger) -> (ClusterToGenes, HashSet<String>) {

    logger.information(&format!("save_gene_ids_from_ortholog_file: reading {}", clusters_file.display()));

    let reader = open_bufread(clusters_file, logger, "save_gene_ids_from_ortholog_file");
    let mut cluster_to_genes: ClusterToGenes = HashMap::new();
    let mut genomes_parsed: HashSet<String> = HashSet::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("save_gene_ids_from_ortholog_file: error reading {}: {}", clusters_file.display(), e));
                process::exit(1);
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Expected format: cluster_id \t genome_id \t "Ortho" \t gene_id
        let cols: Vec<&str> = trimmed.split('\t').collect();
        if cols.len() < 4 {
            logger.warning(&format!("save_gene_ids_from_ortholog_file: skipping malformed line: {}", trimmed));
            continue;
        }

        let cluster_id = cols[0].to_string();
        let genome_id = cols[1].to_string();
        let _annot_run_name = cols[2]; // "Ortho"
        let gene_id = cols[3].to_string();

        // trans_id equivalent, e.g. "CA1280:7000010362857299"
        let trans_id = format!("{}|{}", genome_id, gene_id);

        cluster_to_genes.entry(cluster_id.clone()).or_insert_with(Vec::new).push(ClusterMember { genome: genome_id.clone(), trans_id });

        genomes_parsed.insert(genome_id);
    }

    logger.information(&format!("save_gene_ids_from_ortholog_file: found {} genomes", genomes_parsed.len()));

    (cluster_to_genes, genomes_parsed)
}

pub fn process_orthocluster_results_into_hit_pairs(cluster_to_genes: &ClusterToGenes, logger: &Logger) -> GenomePairToGenePairs {

    let mut genome_pair_to_gene_pairs: GenomePairToGenePairs = HashMap::new();

    for (cluster_id, genes) in cluster_to_genes {
        if genes.len() < 2 {
            continue;
        }

        for i in 0..genes.len() - 1 {
            for j in i + 1..genes.len() {
                let g1: &ClusterMember = &genes[i];
                let g2: &ClusterMember = &genes[j];

                // Sort by genome name to normalize ordering
                let (first, second) = if g1.genome <= g2.genome {
                    (g1, g2)
                } else {
                    (g2, g1)
                };

                let genome_a = &first.genome;
                let genome_b = &second.genome;
                let gene_id_a = &first.trans_id;
                let gene_id_b = &second.trans_id;

                if gene_id_a.is_empty() || gene_id_b.is_empty() {
                    logger.error(&format!("process_orthocluster_results_into_hit_pairs: trans_id not saved from clusters for cluster {} ({} / {})", cluster_id, genome_a, genome_b));
                    process::exit(1);
                }

                genome_pair_to_gene_pairs
                    .entry(genome_a.clone())
                    .or_insert_with(HashMap::new)
                    .entry(genome_b.clone())
                    .or_insert_with(Vec::new)
                    .push((gene_id_a.clone(), gene_id_b.clone()));
            }
        }
    }

    logger.information(&format!("process_orthocluster_results_into_hit_pairs: found {} genome pairs", genome_pair_to_gene_pairs.len()));

    genome_pair_to_gene_pairs
}

/// Collect per-genome annotation + genome FASTA paths for DAGchainer.
/// Uses paths already stored in `RepoEntry.files`.
/// Expected keys (adjust if your keys differ):
///   - "gff_parsed" : parsed GFF3 written in step 1
///   - "genome"     : genome FASTA from the repo spec
pub fn save_genome_paths_for_dagchainer(repo_entries: &[RepoEntry], logger: &Logger) -> GenomePathMap {

    let mut map: GenomePathMap = BTreeMap::new();

    for entry in repo_entries {
        let genome = &entry.name;

        if genome == "synima_all" {
            continue;
        }

        // 1. Annotation GFF: prefer the parsed GFF
        let annot_gff_path = if let Some(gff_file) = entry.files.get("gff_parsed") {
            PathBuf::from(&gff_file.path)
        } else if let Some(gff_file) = entry.files.get("gff") {
            // fallback to original GFF if parsed one is missing
            logger.warning(&format!("save_genome_paths_for_dagchainer: using original GFF for genome {}", genome));
            PathBuf::from(&gff_file.path)
        } else {
            logger.warning(&format!("save_genome_paths_for_dagchainer: no GFF or gff_parsed for genome {}, skipping", genome));
            continue;
        };

        // 2. Genome FASTA
        let genome_fasta_path = if let Some(genome_file) = entry.files.get("genome") {
            PathBuf::from(&genome_file.path)
        } else if let Some(genome_file) = entry.files.get("genome_parsed") {
            PathBuf::from(&genome_file.path)
        } else {
            logger.warning(&format!("save_genome_paths_for_dagchainer: no genome FASTA for genome {}, skipping", genome));
            continue;
        };

        map.insert(
            genome.clone(),
            DagchainerPaths {
                annot_gff: annot_gff_path,
                genome_fasta: genome_fasta_path,
            },
        );
    }

    if map.is_empty() {
        logger.error("save_genome_paths_for_dagchainer: no genomes with both GFF and genome FASTA paths found");
        std::process::exit(1);
    }

    logger.information(&format!("save_genome_paths_for_dagchainer: collected paths for {} genomes", map.len()));

    map
}

/// Create:
///  - *.hit_pairs files for each genome pair
///  - *.dagchainer.conf files for each genome pair
///  - dagchainer.cmds listing one run_DAG_chainer.pl command per pair
///
/// Returns the list of command lines written to dagchainer.cmds.
pub fn write_dagchainer_conf_file(
    dagchainer_rundir: &Path,
    dagchainer_prog: &Path,                       // run_DAG_chainer.pl
    genomes_parsed: &HashSet<String>,            // genomes that appear in orthogroups
    genome_paths: &GenomePathMap,                 // genome -> {annot_gff, genome_fasta}
    genome_pair_to_gene_pairs: &GenomePairToGenePairs,
    dagchainer_args: &str,                        // e.g. "-v" or ""
    min_pairs: usize,
    logger: &Logger,
) -> Vec<String> {

    // Ensure run directory exists
    mkdir(dagchainer_rundir, logger, "write_dagchainer_conf_file");

    let mut genomes: Vec<String> = genomes_parsed.iter().cloned().collect();
    genomes.sort();

    if genomes.len() < 2 {
        logger.error("write_dagchainer_conf_file: need at least two genomes for DAGchainer");
        std::process::exit(1);
    }

    let cmds_path = dagchainer_rundir.join("dagchainer.cmds");
    let mut cmds_writer = open_bufwrite(&cmds_path, logger, "write_dagchainer_conf_file:dagchainer.cmds");

    logger.information(&format!("write_dagchainer_conf_file: writing DAGchainer config + hit_pairs for {} genomes to {}", genomes.len(), dagchainer_rundir.display()));

    let mut all_cmds: Vec<String> = Vec::new();

    // all unordered genome pairs i<j
    for i in 0..genomes.len() {
        for j in (i + 1)..genomes.len() {
            let genome_i = &genomes[i];
            let genome_j = &genomes[j];

            // Get paths for both genomes
            let paths_i = match genome_paths.get(genome_i) {
                Some(p) => p,
                None => {
                    logger.warning(&format!("write_dagchainer_conf_file: missing paths for genome {}, skipping pair {} vs {}", genome_i, genome_i, genome_j));
                    continue;
                }
            };
            let paths_j = match genome_paths.get(genome_j) {
                Some(p) => p,
                None => {
                    logger.warning(&format!("write_dagchainer_conf_file: missing paths for genome {}, skipping pair {} vs {}", genome_j, genome_i, genome_j));
                    continue;
                }
            };

            // Fetch the gene pairs for this genome pair
            let pairs_for_i = match genome_pair_to_gene_pairs.get(genome_i) {
                Some(m) => m,
                None => {
                    logger.warning(&format!("write_dagchainer_conf_file: no gene pairs for genome {} vs {}, skipping", genome_i, genome_j));
                    continue;
                }
            };
            let gene_pairs = match pairs_for_i.get(genome_j) {
                Some(v) if !v.is_empty() => v,
                _ => {
                    logger.warning(&format!("write_dagchainer_conf_file: no gene pairs for genome {} vs {}, skipping", genome_i, genome_j));
                    continue;
                }
            };

            // Build the annotation + genome sections (Perl: $annot_section_text, $genome_seq_section_text)
            let annot_section_text = format!(
                "{g1} = {g1_annot}\n{g2} = {g2_annot}\n",
                g1 = genome_i,
                g1_annot = paths_i.annot_gff.display(),
                g2 = genome_j,
                g2_annot = paths_j.annot_gff.display(),
            );

            let genome_seq_section_text = format!(
                "{g1} = {g1_genome}\n{g2} = {g2_genome}\n",
                g1 = genome_i,
                g1_genome = paths_i.genome_fasta.display(),
                g2 = genome_j,
                g2_genome = paths_j.genome_fasta.display(),
            );

            // Write hit_pairs file for this genome pair
            let hit_pairs_path = dagchainer_rundir.join(format!("{g1}_vs_{g2}.hit_pairs", g1 = genome_i, g2 = genome_j));
            let mut hit_pairs_writer = open_bufwrite(&hit_pairs_path, logger, "write_dagchainer_conf_file:hit_pairs");

            for (gene_a, gene_b) in gene_pairs {
                // Perl: gene_A, gene_B, "1e-50"
                if let Err(e) = writeln!(hit_pairs_writer, "{}\t{}\t1e-50", gene_a, gene_b) {
                    logger.error(&format!("write_dagchainer_conf_file: failed to write hit_pairs {}: {}", hit_pairs_path.display(), e));
                    std::process::exit(1);
                }
            }
            // flush
            if let Err(e) = hit_pairs_writer.flush() {
                logger.error(&format!("write_dagchainer_conf_file: flush error for {}: {}", hit_pairs_path.display(), e));
                std::process::exit(1);
            }

            // Build DAGchainer conf template (this mirrors get_dagchainer_conf_template in Perl)
            let conf_contents = get_dagchainer_conf_template(
                &annot_section_text,
                &genome_seq_section_text,
                &hit_pairs_path,
                min_pairs, // usize
            );

            let conf_path = dagchainer_rundir.join(format!("{g1}_vs_{g2}.dagchainer.conf", g1 = genome_i, g2 = genome_j));
            let mut conf_writer = open_bufwrite(&conf_path, logger, "write_dagchainer_conf_file:dagchainer.conf");

            if let Err(e) = conf_writer.write_all(conf_contents.as_bytes()) {
                logger.error(&format!("write_dagchainer_conf_file: failed to write conf {}: {}", conf_path.display(), e));
                std::process::exit(1);
            }
            if let Err(e) = conf_writer.flush() {
                logger.error(&format!("write_dagchainer_conf_file: flush error for conf {}: {}", conf_path.display(), e));
                std::process::exit(1);
            }

            // Build the run command (Perl: "$DAGCHAINER_PROG -c $conf_file $dagchainer_commands\n")
            let dag_prog_str = dagchainer_prog.display();
            let args_trimmed = dagchainer_args.trim();

            let cmd = if args_trimmed.is_empty() {
                format!("{prog} -c {conf}\n", prog = dag_prog_str, conf = conf_path.display())
            } else {
                format!("{prog} -c {conf} {args}\n", prog = dag_prog_str, conf = conf_path.display(), args = args_trimmed)
            };

            if let Err(e) = cmds_writer.write_all(cmd.as_bytes()) {
                logger.error(&format!("write_dagchainer_conf_file: failed to write to {}: {}", cmds_path.display(), e));
                std::process::exit(1);
            }

            all_cmds.push(cmd);
        }
    }

    if let Err(e) = cmds_writer.flush() {
        logger.error(&format!("write_dagchainer_conf_file: flush error for {}: {}", cmds_path.display(), e));
        std::process::exit(1);
    }

    logger.information(&format!("write_dagchainer_conf_file: wrote {} DAGchainer command(s) to {}", all_cmds.len(), cmds_path.display()));

    all_cmds
}

/// Build the full DAGchainer configuration file contents.
///
/// `annot_section` and `genome_seq_section` are the lines like:
///   "CA1280 = /path/to/CA1280.synima-parsed.gff3\nIND107 = /path/to/IND107.synima-parsed.gff3\n"
///   "CA1280 = /path/to/CA1280.genome.fa\nIND107 = /path/to/IND107.genome.fa\n"
///
/// `hit_pairs_path` is the .hit_pairs file for this genome pair.
/// `min_pairs` is the value that used to be `$opt_i` (MIN_ALIGNED_PAIRS).
pub fn get_dagchainer_conf_template(
    annot_section: &str,
    genome_seq_section: &str,
    hit_pairs_path: &Path,
    min_pairs: usize,
) -> String {
    let hit_pairs_str = hit_pairs_path.to_string_lossy();

    format!(
r#"#-----------------------------------------------------------------------
;; configuration file for dagchainer

[GeneAnnotations]

{annot_section}
[GenomeSequences]

{genome_seq_section}
[MatchPairs]

# only first three fields of a tab-delimited file are examined, expecting:
#  accA accB E-value
# compatible with NCBI-blast (blastall)  -m 8 output format.

Data = {hit_pairs}

[NoiseFilter]
BEST_MATCH_AGGREGATE_DIST = 5

[Orthologs]
# Data = all_orthomcl.out

# Section is optional

[Parameters]

# MODE can correspond to relative gene position or actual genome coordinate
# with respective values:  RELATIVE_POSITION  |   GENOME_COORDINATE
MODE = RELATIVE_POSITION

# gap open and extend penalties
GAP_OPEN = 0
GAP_EXTEND = -1

## size of a single gap
GAP_LENGTH = 1

MAX_MATCH_SCORE = 50

# comment out the line below to enforce a constant match score 
# instead of the min(-log(Evalue), MAX_MATCH_SCORE) value.
CONSTANT_MATCH_SCORE = 3

# maximum E-value 
MAX_EVALUE = 10

# maximum distance allowed between two neighboring syntenic genes in a single block
MAX_DIST_BETWEEN_SYN_PAIRS = 5


# minimum alignment score of the highest scoring block
# by default, this is set dynamically to: MIN_ALIGN_LEN * 2.5 * -GAP_PENALTY
# MIN_ALIGNMENT_SCORE = 

# minimum number of aligned gene pairs within a single block
MIN_ALIGNED_PAIRS = {min_pairs}

# Include self-molecule comparisons.  Turn on if looking for segmental genome duplications
INCLUDE_SELF_COMPARISONS = FALSE

VERBOSE = FALSE

; #------------------------------------------------------------------------------------------"#
    ,
        annot_section = annot_section.trim_end(),
        genome_seq_section = genome_seq_section.trim_end(),
        hit_pairs = hit_pairs_str,
        min_pairs = min_pairs
    )
}

pub fn concatenate_aligncoords_and_make_spans(
    pairwise_dir: &Path,
    output_dir: &Path,
    repo_spec: &Path,
    dagchainer_to_spans: &Path,
    logger: &Logger,
) {
    // Base name from repo_spec, e.g. Repo_spec.txt -> Repo_spec.txt.dagchainer.aligncoords
    let repo_base = repo_spec.file_name().and_then(|s| s.to_str()).unwrap_or("synima");

    let combined_aligncoords = output_dir.join(format!("{repo_base}.dagchainer.aligncoords"));
    let combined_spans = output_dir.join(format!("{repo_base}.dagchainer.aligncoords.spans"));

    logger.information(&format!("dagchainer: collecting *.aligncoords under {}", pairwise_dir.display()));

    // 1) Collect all *.aligncoords paths recursively under pairwise_dir
    let mut align_files: Vec<PathBuf> = Vec::new();
    collect_aligncoords_files(pairwise_dir, &mut align_files, logger);

    if align_files.is_empty() {
        logger.warning("dagchainer: no .aligncoords files found, skipping concatenation and spans");
        return;
    }

    logger.information(&format!("dagchainer: found {} aligncoords files, writing combined file to {}", align_files.len(), combined_aligncoords.display()));

    // 2) Concatenate into a single combined_aligncoords file
    {
        let mut writer = open_bufwrite(&combined_aligncoords, logger, "concatenate_aligncoords");

        for path in &align_files {
            logger.information(&format!("dagchainer: appending {} to {}", path.display(), combined_aligncoords.display()));

            let mut reader = open_bufread(path, logger, "concatenate_aligncoords");
            if let Err(e) = io::copy(&mut reader, &mut writer) {
                logger.error(&format!("dagchainer: failed to copy {} into {}: {}", path.display(), combined_aligncoords.display(), e));
                std::process::exit(1);
            }
        }
    }

    // 3) Run dagchainer_to_chain_spans.pl on the combined file
    logger.information(&format!("dagchainer: running {} to create spans {}", dagchainer_to_spans.display(), combined_spans.display()));

    let input_file = std::fs::File::open(&combined_aligncoords).unwrap_or_else(|e| {
        logger.error(&format!("dagchainer: failed to open {} for reading: {}", combined_aligncoords.display(), e));
        std::process::exit(1);
    });

    let output_file = std::fs::File::create(&combined_spans).unwrap_or_else(|e| {
        logger.error(&format!("dagchainer: failed to create {}: {}", combined_spans.display(), e));
        std::process::exit(1);
    });

    // If the script has a proper shebang and executable bit, this is enough:
    let status = Command::new(dagchainer_to_spans)
        .stdin(Stdio::from(input_file))
        .stdout(Stdio::from(output_file))
        .stderr(Stdio::inherit())
        .status();

    match status {
        Ok(s) if s.success() => {
            logger.information(&format!("dagchainer: spans written to {}", combined_spans.display()));
        }
        Ok(s) => {
            logger.error(&format!("dagchainer: dagchainer_to_chain_spans.pl exited with status {s}"));
            std::process::exit(1);
        }
        Err(e) => {
            logger.error(&format!("dagchainer: failed to run dagchainer_to_chain_spans.pl: {}", e));
            std::process::exit(1);
        }
    }
}

/// Recursively collect all *.aligncoords files under `dir`.
fn collect_aligncoords_files(dir: &Path, acc: &mut Vec<PathBuf>, logger: &Logger) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            logger.error(&format!("dagchainer: failed to read directory {}: {}", dir.display(), e));
            std::process::exit(1);
        }
    };

    for entry_res in entries {
        let entry = match entry_res {
            Ok(en) => en,
            Err(e) => {
                logger.error(&format!("dagchainer: read_dir error in {}: {}", dir.display(), e));
                std::process::exit(1);
            }
        };

        let path = entry.path();

        if path.is_dir() {
            collect_aligncoords_files(&path, acc, logger);
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.ends_with(".aligncoords") {
                acc.push(path);
            }
        }
    }
}
use crate::logger::Logger;
use crate::RepoEntry;
use crate::external_tools;

use std::process::Command;
use std::path::Path;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use rayon::prelude::*;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};

pub struct BlastTools {
    pub version: String,
    pub db_tool: PathBuf,
    pub blast_tool: PathBuf,
}

/// Try to detect usable BLAST+ or legacy BLAST tools.
/// Returns a struct containing paths to the database builder and blast executor.
pub fn get_blast_binaries(bin_dir: &Path, logger: &Logger) -> BlastTools {

    // Try BLAST+
    let (found_makeblastdb, makeblastdb_path) =
        external_tools::find_executable_with_fallback("makeblastdb", bin_dir, logger);
    let (found_blastp, blastp_path) =
        external_tools::find_executable_with_fallback("blastp", bin_dir, logger); // or blastn, depending on data

    if found_makeblastdb && found_blastp {
        logger.information(&format!("get_blast_binaries: Using BLAST+:\n  - makeblastdb: {}\n  - blastp:      {}", makeblastdb_path.as_ref().unwrap().display(), blastp_path.as_ref().unwrap().display()));
        return BlastTools {
            version: "blast+".to_string(),
            db_tool: makeblastdb_path.unwrap(),
            blast_tool: blastp_path.unwrap(),
        };
    }

    // Try legacy BLAST
    let (found_formatdb, formatdb_path) =
        external_tools::find_executable_with_fallback("formatdb", bin_dir, logger);
    let (found_blastall, blastall_path) =
        external_tools::find_executable_with_fallback("blastall", bin_dir, logger);

    if found_formatdb && found_blastall {
        logger.information(&format!("get_blast_binaries: Using legacy BLAST:\n  - formatdb: {}\n  - blastall: {}", formatdb_path.as_ref().unwrap().display(), blastall_path.as_ref().unwrap().display()));
        return BlastTools {
            version: "legacy".to_string(),
            db_tool: formatdb_path.unwrap(),
            blast_tool: blastall_path.unwrap(),
        };
    }

    // Nothing found
    logger.error("get_blast_binaries: No suitable BLAST+ or legacy BLAST binaries found in PATH or fallback `bin/`.");
    std::process::exit(1);
}

pub fn create_all_blast_dbs(
    repo: &[RepoEntry],
    alignment_type: &str,
    db_tool: &Path,
    blast_version: &str,
    main_output_dir: &Path,
    logger: &Logger,
) -> Result<(), String> {
    for entry in repo {
        let genome = &entry.name;

        if genome == "synima_all" {
            continue;
        }

        // Check for genome subdirectory inside main_output_dir
        let genome_dir = main_output_dir.join(genome);
        if !genome_dir.exists() {
            logger.error(&format!("create_all_blast_dbs: Expected directory '{}' not found. Please run Step 1 (create-repo-db) before BLAST setup.", genome_dir.display()));
            std::process::exit(1);
        }

        // Expected file: <genome>/<genome>.synima-parsed.<alignment_type>
        let parsed_filename = format!("{genome}.synima-parsed.{alignment_type}");
        let parsed_fasta_path = genome_dir.join(parsed_filename);

        if !parsed_fasta_path.exists() {
            logger.warning(&format!("Skipping {}: no parsed {} file found at '{}'.", genome, alignment_type, parsed_fasta_path.display()));
            continue;
        }

        create_blast_db(&parsed_fasta_path, db_tool, blast_version, logger)?;
    }

    Ok(())
}

fn create_blast_db(fasta_path: &Path, db_tool: &Path, blast_version: &str, logger: &Logger) -> Result<(), String> {
    let status = if blast_version == "legacy" {
        Command::new(db_tool)
            .arg("-i").arg(fasta_path)
            .arg("-p").arg("T")
            .status()
    } else {
        Command::new(db_tool)
            .arg("-in").arg(fasta_path)
            .arg("-dbtype").arg("prot")
            .status()
    }.map_err(|e| format!("Failed to spawn db creation: {}", e))?;

    if status.success() {
        logger.information(&format!("create_blast_db: Created BLAST db for {}", fasta_path.display()));
        Ok(())
    } else {
        Err(format!("create_blast_db: BLAST db creation failed for {}", fasta_path.display()))
    }
}

fn run_blast(query: &Path, db: &Path, output: &Path, blast_tool: &Path, blast_version: &str, alignment_type: &str, evalue: &str, logger: &Logger) -> Result<(), String> {

    logger.information(&format!("run_blast: {} using {}", output.display(), blast_tool.display()));

    let program = match alignment_type {
        "pep" => "blastp",
        "cds" => "blastn",
        other => return Err(format!("run_blast: Unsupported alignment type '{}'", other)),
    };

    let status = if blast_version == "legacy" {
        Command::new(blast_tool)
            .args(["-p", program, "-i"])
            .arg(query)
            .args(["-d", db.to_str().unwrap(), "-e", evalue, "-m", "8", "-o"])
            .arg(output)
            .status()
    } else {
        Command::new(blast_tool)
            .args([
                "-query", query.to_str().unwrap(),
                "-db", db.to_str().unwrap(),
                "-evalue", evalue,
                "-outfmt", "6",
                "-out", output.to_str().unwrap()
            ])
            .status()
    }.map_err(|e| format!("run_blast: Failed to spawn BLAST: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("run_blast: BLAST failed between {:?} and {:?}", query, db))
    }
}

pub fn run_all_vs_all_blast(
    repo: &[RepoEntry],
    blast_tool: &Path,
    blast_version: &str,
    alignment_type: &str,
    evalue: &str,
    out_dir: &Path,
    threads: usize,
    logger: &Logger) -> Result<(), String> {

    let key = match alignment_type {
        "cds" => "cds_parsed",
        "pep" => "pep_parsed",
        other => return Err(format!("run_all_vs_all_blast: Unsupported alignment type '{}'", other)),
    };

    let mut fasta_map = HashMap::new();
    let mut genome_names = Vec::new();

    for entry in repo {
        if entry.name == "synima_all" {
            continue;
        }

        if let Some(file) = entry.files.get(key) {
            fasta_map.insert(entry.name.clone(), PathBuf::from(&file.path));
            genome_names.push(entry.name.clone());
        } else {
            logger.warning(&format!("run_all_vs_all_blast: Missing {} file for {}", key, entry.name));
        }
    }

    logger.information(&format!("run_all_vs_all_blast: Running BLAST for {} genome pairs...", genome_names.len()));

    let all_pairs: Vec<(String, String)> = genome_names.iter().flat_map(|q|
        genome_names.iter().map(move |db| (q.clone(), db.clone()))
    ).collect();

    rayon::ThreadPoolBuilder::new().num_threads(threads).build_global().map_err(|e| format!("Failed to build thread pool: {}", e))?;

    std::fs::create_dir_all(out_dir).map_err(|e| format!("Failed to create output directory: {}", e))?;

    all_pairs.par_iter().try_for_each(|(query, db)| {
        let query_path = fasta_map.get(query).ok_or_else(|| format!("Missing query FASTA for {}", query))?;
        let db_path = fasta_map.get(db).ok_or_else(|| format!("Missing db FASTA for {}", db))?;
        let output_path = out_dir.join(format!("{}_vs_{}.out", query, db));
        run_blast(query_path, db_path, &output_path, blast_tool, blast_version, alignment_type, &evalue, &logger)
    })
}

pub fn concatenate_unique_blast_pairs(blast_out_dir: &Path, output_file: &Path, run_type: &str, logger: &Logger) -> Result<(), std::io::Error> {
    let mut seen_pairs = HashSet::new();
    let mut writer = File::create(output_file)?;

    for entry in fs::read_dir(blast_out_dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }

        // Match files like A_vs_B.out
        let file_name = match path.file_name().and_then(|f| f.to_str()) {
            Some(name) => name,
            None => continue,
        };

        // Skip output file itself and irrelevant hidden/system files
        if file_name == "all_vs_all.out" || file_name.starts_with('.') {
            continue;
        }

        let Some((q, r)) = file_name.strip_suffix(".out").and_then(|base| {
            let parts: Vec<_> = base.split("_vs_").collect();
            if parts.len() == 2 {
                Some((parts[0], parts[1]))
            } else {
                None
            }
        }) else {
            logger.warning(&format!("concatenate_unique_blast_pairs: Skipping unexpected file: {}", file_name));
            continue;
        };

        // Ensure we only process one of (A,B) or (B,A)
        let pair = if q <= r { (q.to_string(), r.to_string()) } else { (r.to_string(), q.to_string()) };
        if run_type == "orthomcl" && seen_pairs.contains(&pair) {
            logger.information(&format!("concatenate_unique_blast_pairs: Skipping reciprical BLAST pair: {} vs {}", q, r));
            continue;
        }

        logger.information(&format!("concatenate_unique_blast_pairs: Including BLAST result: {} vs {}", q, r));
        seen_pairs.insert(pair);

        let reader = BufReader::new(File::open(&path)?);
        for line in reader.lines() {
            writeln!(writer, "{}", line?)?;
        }
    }

    Ok(())
}
use crate::logger::Logger;
use crate::Args;
use crate::RepoEntry;
use crate::external_tools;
use crate::util::{mkdir, open_bufread, open_bufwrite}; //,open_file_read,open_file_write

use std::process;
use std::process::Command;
use std::path::Path;
//use std::collections::{HashSet}; //HashMap, 
use std::path::PathBuf;
//use rayon::prelude::*;
use std::fs::{self};
use std::io::{BufRead, Write};
use std::ffi::OsStr;
use std::process::Stdio;

struct Species {
    name: String,
    fasta: PathBuf,
    db_prefix: PathBuf, // base path (no ext)
}

#[derive(Debug, Clone)]
pub struct AlignerTools {
    pub db_builder: PathBuf,
    pub searcher: PathBuf,
}

pub fn resolve_aligner_tools(
    aligner: &str,
    alignment_type: &str,
    bin_dir: &Path,
    logger: &Logger,
) -> AlignerTools {
    let (db_prog, search_prog) = match aligner {
        "blastplus" => {
            let search = match alignment_type {
                "pep" => "blastp",
                "cds" => "blastn",
                other => {
                    logger.error(&format!("resolve_aligner_tools: unsupported alignment_type '{}', expected 'pep' or 'cds'", other));
                    std::process::exit(1);
                }
            };
            ("makeblastdb", search)
        }

        "blastlegacy" => {
            // formatdb + blastall
            ("formatdb", "blastall")
        }

        "diamond" => {
            // diamond handles both db building and searching
            ("diamond", "diamond")
        }

        other => {
            logger.error(&format!("resolve_aligner_tools: unsupported aligner '{}', expected 'blastplus', 'blastlegacy', or 'diamond'", other));
            std::process::exit(1);
        }
    };

    let db_builder_path = external_tools::find_executable(db_prog, bin_dir, logger);
    let searcher_path = external_tools::find_executable(search_prog, bin_dir, logger);

    AlignerTools {
        db_builder: db_builder_path,
        searcher: searcher_path,
    }
}

fn shell_escape(arg: &OsStr) -> String {
    let s = arg.to_string_lossy();
    if s.chars().all(|c| c.is_ascii_alphanumeric() || "_-./:".contains(c)) {
        s.into_owned()
    } else {
        let esc = s.replace('\'', "'\\''");
        format!("'{}'", esc)
    }
}

fn render_cmd(cmd: &Command) -> String {
    let mut s = String::new();
    s.push_str(&shell_escape(cmd.get_program()));
    for a in cmd.get_args() {
        s.push(' ');
        s.push_str(&shell_escape(a));
    }
    s
}

pub fn create_all_dbs(
    repo: &[RepoEntry],
    alignment_type: &str,
    db_builder: PathBuf,
    out_dir: &Path,
    logger: &Logger) {

    // Decide which kind of builder this is from its filename
    let builder_name = db_builder.file_name().and_then(|s| s.to_str()).unwrap_or("");

    enum DbBuilderKind {
        Diamond,
        BlastPlus,
        Legacy,
    }

    let builder_kind = match builder_name {
        "diamond" => DbBuilderKind::Diamond,
        "makeblastdb" => DbBuilderKind::BlastPlus,
        "formatdb" => DbBuilderKind::Legacy,
        other => {
            logger.error(&format!("create_all_dbs: unsupported db builder executable '{}'", other));
            std::process::exit(1);
        }
    };

    let db_dir = out_dir.join("databases");
    mkdir(&db_dir, &logger, "create_all_dbs");

    let mut species: Vec<Species> = Vec::new();

    for entry in repo {
        let Some(fasta) = find_fasta(entry, alignment_type) else { continue };
        //let stem = Path::new(&fasta).file_stem().unwrap().to_string_lossy();
        //let db_prefix = db_dir.join(stem.as_ref());
        let db_prefix = db_dir.join(&entry.name);

        species.push(Species {
            name: entry.name.clone(),        // "CNB2"
            fasta: PathBuf::from(&fasta),
            db_prefix: db_prefix.clone(),    // ".../databases/CNB2.synima-parsed"
        });
    }

    for s in &species {
        match builder_kind {
            DbBuilderKind::Diamond => {
                let mut cmd = Command::new(&db_builder);

                cmd.arg("makedb")
                    .arg("--in").arg(&s.fasta)
                    .arg("--db").arg(&s.db_prefix)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());

                logger.information(&format!("Running: {}", render_cmd(&cmd)));

                let status = match cmd.status() {
                    Ok(st) => st,
                    Err(e) => {
                        logger.error(&format!("create_all_dbs: failed to run diamond makedb for {}: {}", s.name, e));
                        std::process::exit(1);
                    }
                };

                if !status.success() {
                    logger.error(&format!("create_all_dbs: diamond makedb failed for {}", s.name));
                    std::process::exit(1);
                }

                logger.information(&format!("Created DIAMOND DB {}", s.db_prefix.display()));
            }

            DbBuilderKind::BlastPlus => {
                // makeblastdb -in FASTA -dbtype prot|nucl -out PREFIX
                let dbtype = if matches!(alignment_type, "pep" | "protein") { "prot" } else { "nucl" };
                //let prefix = db_dir.join(&s.name); // no extension
                let prefix = &s.db_prefix;

                // Only build if pin file does not exist
                if !prefix.with_extension("pin").exists() {
                    let status = Command::new(&db_builder)
                        .args(["-in"]).arg(&s.fasta)
                        .args(["-dbtype", dbtype])
                        .args(["-out"]).arg(&prefix) // db_prefix
                        .status();

                    let status = match status {
                        Ok(st) => st,
                        Err(e) => {
                            logger.error(&format!("create_all_dbs: failed to run makeblastdb for {}: {}", s.fasta.display(), e));
                            std::process::exit(1);
                        }
                    };

                    if !status.success() {
                        logger.error(&format!("create_all_dbs: makeblastdb failed for {}", s.fasta.display()));
                        std::process::exit(1);
                    }
                }
            }

            DbBuilderKind::Legacy => {
                // formatdb -i fasta -p T|F
                let pflag = if matches!(alignment_type, "pep" | "protein") { "T" } else { "F" };
                //let prefix = db_dir.join(&s.name); // no extension
                let prefix = &s.db_prefix;

                // Only build if pin file does not exist
                if !prefix.with_extension("pin").exists() {
                    let status = Command::new(&db_builder)
                        .args(["-i"]).arg(&s.fasta)
                        .args(["-p", pflag])
                        .status();
                    
                    let status = match status {
                        Ok(st) => st,
                        Err(e) => {
                            logger.error(&format!("create_all_dbs: failed to run formatdb for {}: {}", s.fasta.display(), e));
                            std::process::exit(1);
                        }
                    };

                    if !status.success() {
                        logger.error(&format!("create_all_dbs: formatdb failed for {}", s.fasta.display()));
                        std::process::exit(1);
                    }
                }
            }
        }
        logger.information(&format!("create_all_dbs: {}", s.fasta.display()));
    }
}

pub fn find_fasta(entry: &RepoEntry, alignment_type: &str) -> Option<PathBuf> {

    let want_pep = matches!(alignment_type.to_ascii_lowercase().as_str(), "pep" | "protein");
    let suffix = if want_pep { "synima-parsed.pep" } else { "synima-parsed.cds" };

    entry.files.values()
        .map(|f| PathBuf::from(&f.path))
        .find(|p| {
            p.file_name()
             .and_then(|s| s.to_str())
             .map(|fname| fname.ends_with(suffix))
             .unwrap_or(false)
        })
}

pub fn run_all_vs_all(
    repo: &[RepoEntry],
    searcher: &Path,     // e.g. diamond, blastp, blastn, or blastall
    args: &Args,         // has aligner, alignment_type, evalue, threads, max_target_seqs, diamond_sensitivity
    out_dir: &Path,
    logger: &Logger) {

    // Unpack what we need from args
    let aligner = args.aligner.as_str();                 // "diamond" | "blastplus" | "blastlegacy"
    let alignment_type = args.alignment_type.as_str();   // "pep" | "cds" | "protein" | "nucl"
    let evalue = args.evalue.as_str();
    let threads = args.threads;
    let max_target_seqs = args.max_target_seqs;
    let diamond_sensitivity = args.diamond_sensitivity.as_str();    

    if let Err(e) = fs::create_dir_all(out_dir) {
        logger.error(&format!("run_all_vs_all: failed to create output directory {}: {}", out_dir.display(), e));
        std::process::exit(1);
    }

    // This must match create_all_dbs: databases are under out_dir/databases with prefix = FASTA stem
    let db_dir = out_dir.join("databases");
    let mut species = Vec::new();

    for entry in repo {
        if let Some(fasta) = find_fasta(entry, alignment_type) {
            // stem like "CA1280.synima-parsed"
            //let stem = Path::new(&fasta)
            //    .file_stem()
            //    .and_then(|s| s.to_str())
            //    .unwrap_or_else(|| {
            //        logger.error(&format!("run_all_vs_all: could not get file stem for FASTA {}", fasta.display()));
            //        std::process::exit(1);
            //    })
            //    .to_string();

            //logger.information(&format!("run_all_vs_all: stem for {} = {}", entry.name.clone(), stem));

            species.push(Species {
                name: entry.name.clone(),            // used in output filenames
                fasta: PathBuf::from(&fasta),
                //db_prefix: db_dir.join(&stem),       // must match create_all_dbs
                db_prefix: db_dir.join(&entry.name)
            });
        }
    }

    // Helper for diamond: .dmnd file from prefix
    fn dmnd_path(prefix: &Path) -> PathBuf {
        prefix.with_extension("dmnd")
    }

    for q in &species {
        for s in &species {
            let out_path = out_dir.join(format!("{}_vs_{}.out", q.name, s.name)); // <— desired filenames

            match aligner {
                "diamond" => {
                    // diamond blastp --db sdb -q qfasta -o out -p threads -k max_target_seqs -e evalue -f 6
                    let program = if matches!(alignment_type, "pep" | "protein") { "blastp" } else { "blastn" };
                    let dmnd = dmnd_path(&s.db_prefix);

                    // Optional sanity check so failures are obvious
                    if !dmnd.exists() {
                        logger.error(&format!("run_all_vs_all: missing DIAMOND DB {} (expected for {})", dmnd.display(), s.name));
                        std::process::exit(1);
                    }

                    let mut cmd = Command::new(searcher);

                    cmd.arg(program)
                        .arg("-d").arg(&s.db_prefix)   // diamond takes prefix without .dmnd
                        .arg("-q").arg(&q.fasta)
                        .arg("-o").arg(&out_path)
                        .arg("-p").arg(threads.to_string()) // threads
                        .arg("-k").arg(max_target_seqs.to_string())
                        .arg("-e").arg(format!("{}", evalue))
                        .arg("-f").arg("6") // standard 12 columns
                        .arg("--masking").arg("0")
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());

                    // sensitivity: "", "fast", "sensitive", "more-sensitive", "very-sensitive", "ultra-sensitive"
                    if !diamond_sensitivity.is_empty() {
                        let opt = if diamond_sensitivity.starts_with("--") {
                            diamond_sensitivity.to_string()
                        } else {
                            format!("--{}", diamond_sensitivity)
                        };
                        cmd.arg(opt);
                    }

                    logger.information(&format!("run_all_vs_all: Running: {}", render_cmd(&cmd)));

                    let status = match cmd.status() {
                        Ok(st) => st,
                        Err(e) => {
                            logger.error(&format!("run_all_vs_all: failed to run diamond for {} vs {}: {}", q.name, s.name, e));
                            std::process::exit(1);
                        }
                    };

                    if !status.success() {
                        logger.error(&format!("run_all_vs_all: diamond search failed for {} vs {}", q.name, s.name));
                        std::process::exit(1);
                    }
                }

                "blastplus" => {
                    // searcher is blastp or blastn
                    let mut cmd = std::process::Command::new(searcher);
                    cmd.arg("-query").arg(&q.fasta)
                        .arg("-db").arg(&s.db_prefix)
                        .arg("-num_threads").arg(threads.to_string())
                        .arg("-evalue").arg(format!("{}", evalue))
                        .arg("-max_target_seqs").arg(max_target_seqs.to_string())
                        .arg("-outfmt").arg("6")
                        .arg("-out").arg(&out_path);

                    logger.information(&format!("run_all_vs_all: Running {}", render_cmd(&cmd)));

                    let status = match cmd.status() {
                        Ok(st) => st,
                        Err(e) => {
                            logger.error(&format!("run_all_vs_all: failed to run BLAST+ for {} vs {}: {}", q.name, s.name, e));
                            std::process::exit(1);
                        }
                    };

                    if !status.success() {
                        logger.error(&format!("run_all_vs_all: BLAST+ search failed for {} vs {}", q.name, s.name));
                        std::process::exit(1);
                    }
                }

                "blastlegacy" => {
                    // blastall -p blastp|blastn -d sdb -i qfasta -o out -a threads -e evalue -m 8
                    let program = if matches!(alignment_type, "pep" | "protein") { "blastp" } else { "blastn" };

                    let mut cmd = Command::new(searcher);
                    cmd.args(["-p", program])
                        .args(["-d"]).arg(&s.db_prefix)
                        .args(["-i"]).arg(&q.fasta)
                        .args(["-o"]).arg(&out_path)
                        .args(["-a", &threads.to_string()])
                        .args(["-e", &format!("{}", evalue)])
                        .args(["-m", "8"]); // tabular

                    logger.information(&format!("run_all_vs_all: Running {}", render_cmd(&cmd)));    

                    let status = match cmd.status() {
                        Ok(st) => st,
                        Err(e) => {
                            logger.error(&format!("run_all_vs_all: failed to run legacy BLAST for {} vs {}: {}", q.name, s.name, e));
                            std::process::exit(1);
                        }
                    };

                    if !status.success() {
                        logger.error(&format!("run_all_vs_all: legacy BLAST search failed for {} vs {}", q.name, s.name));
                        std::process::exit(1);
                    }
                }

                other => {
                    logger.error(&format!("run_all_vs_all: unsupported aligner '{}', expected 'diamond', 'blastplus', or 'blastlegacy'", other));
                    std::process::exit(1);
                }
            }
            logger.information(&format!("run_all_vs_all: wrote {}", out_path.display()));
        }
    }
}

pub fn concatenate_unique_blast_pairs(blast_out_dir: &Path, output_file: &Path, logger: &Logger) {
    //let mut seen_pairs = HashSet::new();

    // Create output file
    let mut writer = open_bufwrite(&output_file, &logger, "concatenate_unique_blast_pairs");

    // Read directory
    let read_dir = match fs::read_dir(blast_out_dir) {
        Ok(rd) => rd,
        Err(e) => {
            logger.error(&format!("concatenate_unique_blast_pairs: Failed to read directory {}: {}",blast_out_dir.display(), e));
            process::exit(1);
        }
    };

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                logger.warning(&format!("concatenate_unique_blast_pairs: Skipping unreadable dir entry: {}", e));
                continue;
            }
        };

        let path = entry.path();
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
        //let pair = if q <= r { (q.to_string(), r.to_string()) } else { (r.to_string(), q.to_string()) };
        //if run_type == "orthomcl" && seen_pairs.contains(&pair) {
        //    logger.information(&format!("concatenate_unique_blast_pairs: Skipping reciprical BLAST pair: {} vs {}", q, r));
        //    continue;
        //}

        logger.information(&format!("concatenate_unique_blast_pairs: Including BLAST result: {} vs {}", q, r));
        //seen_pairs.insert(pair);

        // Open the BLAST file
        let reader = open_bufread(&path, &logger, "concatenate_unique_blast_pairs");

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    logger.warning(&format!("concatenate_unique_blast_pairs: Failed to read from {}: {}", path.display(), e));
                    break;
                }
            };

            if let Err(e) = writeln!(writer, "{}", line) {
                logger.error(&format!("concatenate_unique_blast_pairs: Failed to write to {}: {}", output_file.display(), e));
                process::exit(1);
            }
        }
    }
}

pub fn ensure_blast_dir(out_dir: &Path) -> Result<PathBuf, String> {
    let blast_dir = out_dir.join("Blast");
    fs::create_dir_all(&blast_dir)
        .map_err(|e| format!("create {}: {}", blast_dir.display(), e))?;
    Ok(blast_dir)
}
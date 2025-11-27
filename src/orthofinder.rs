use crate::logger::Logger;
use crate::RepoEntry;
use crate::write_fasta;
use crate::util::{mkdir, open_bufread, open_bufwrite};

use std::collections::BTreeMap;
use std::fs::{self};
use std::io::{Write, BufRead};
use std::path::{Path, PathBuf};
use std::collections::HashMap;

/// Build SpeciesIDs.txt and return species name to ID map
fn generate_species_ids(blast_dir: &Path, out_dir: &Path, logger: &Logger) -> Result<BTreeMap<String, usize>, String> {
    let mut species_set = BTreeMap::new();

    for entry in fs::read_dir(blast_dir).map_err(|e| format!("Failed to read blast dir: {e}"))? {
        let path = entry.map_err(|e| format!("Dir entry error: {e}"))?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("out") {
            if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                if let Some((a, b)) = file_stem.split_once("_vs_") {
                    species_set.insert(a.to_string(), ());
                    species_set.insert(b.to_string(), ());
                }
            }
        }
    }

    let species_list: Vec<String> = species_set.keys().cloned().collect();
    let species_id_map: BTreeMap<String, usize> = species_list.iter().enumerate().map(|(i, s)| (s.clone(), i)).collect();

    let blast_subdir = out_dir.join("Blast");
    mkdir(&blast_subdir, &logger, "generate_species_ids");

    // output
    let file_path = blast_subdir.join("SpeciesIDs.txt");
    let mut writer = open_bufwrite(&file_path, &logger, "generate_species_ids");

    for (name, id) in &species_id_map {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(format!("Blank species name for ID {}", id));
        }
        writeln!(writer, "{}: {}", id, trimmed).map_err(|e| format!("Write error: {e}"))?;
    }

    Ok(species_id_map)
}

/// Rewrite BLAST .out files to OrthoFinder .m8:
pub fn rewrite_blast_files(
    blast_dir: &Path,
    of_out_dir: &Path,
    species_ids: &BTreeMap<String, usize>,
    seq_id_map: &HashMap<String, String>,
    logger: &Logger
) -> Result<(), String> {

    // Out directory
    let of_blast = of_out_dir.join("Blast");
    mkdir(&of_blast, &logger, "rewrite_blast_files");

    for entry in fs::read_dir(blast_dir).map_err(|e| format!("Failed to read blast dir: {e}"))? {
        let path = entry.map_err(|e| format!("Dir entry error: {e}"))?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("out") {
            continue;
        }
        let file_stem = path.file_stem().and_then(|s| s.to_str()).ok_or_else(|| format!("Non-UTF8 file name: {}", path.display()))?;
        let (a_name, b_name) = file_stem.split_once("_vs_").ok_or_else(|| format!("Unexpected BLAST filename (need A_vs_B.out): {}", path.display()))?;
        let i = *species_ids.get(a_name).ok_or_else(|| format!("Species not found in ID map: {a_name}"))?;
        let j = *species_ids.get(b_name).ok_or_else(|| format!("Species not found in ID map: {b_name}"))?;

        // Input/Output
        let reader = open_bufread(&path, &logger, "rewrite_blast_files");
        let out_path = of_blast.join(format!("Blast{}_{}.txt", i, j));
        let mut writer = open_bufwrite(&out_path, &logger, "rewrite_blast_files");

        for (lnum, line_res) in reader.lines().enumerate() {
            let line = line_res.map_err(|e| format!("Read error {}: {e}", path.display()))?;
            if line.is_empty() || line.starts_with('#') { continue; }
            let mut cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 12 {
                return Err(format!("Line {} in {} has <12 columns", lnum + 1, path.display()));
            }

            let q_old = cols[0];
            let s_old = cols[1];
            let q_new = seq_id_map.get(q_old).ok_or_else(|| {
                format!("No mapping for query '{}' at {}:{}", q_old, path.display(), lnum + 1)
            })?;
            let s_new = seq_id_map.get(s_old).ok_or_else(|| {
                format!("No mapping for subject '{}' at {}:{}", s_old, path.display(), lnum + 1)
            })?;

            cols[0] = q_new;
            cols[1] = s_new;

            // write back
            writer.write_all(cols.join("\t").as_bytes()).map_err(|e| format!("Write {}: {}", out_path.display(), e))?;
            writer.write_all(b"\n").map_err(|e| format!("Write {}: {}", out_path.display(), e))?;
        }
        writer.flush().map_err(|e| format!("Flush error {}: {e}", out_path.display()))?;
    }
    Ok(())
}

/// Prepare Orthofinder Blast folder from Synima all-vs-all BLAST output
pub fn prepare_orthofinder_blast(
    repo: &[RepoEntry],
    alignment_type: &str,
    blast_out_dir: &Path, 
    orthofinder_out_dir: &Path, 
    logger: &Logger) -> Result<(), String> {

    // speciesID.txt
    logger.information(&format!("prepare_orthofinder_blast: generate species ids: {}", orthofinder_out_dir.display()));
    let species_ids = generate_species_ids(blast_out_dir, orthofinder_out_dir, &logger)?;

    // Process FASTAs -> Blast/Species<ID>.fa and SequenceIDs.txt, and build seq map
    logger.information(&format!("prepare_orthofinder_blast: rewrite FASTA files with species codes: {}", orthofinder_out_dir.display()));
    let seq_id_map = write_fasta::rewrite_fastas_from_repo(repo, alignment_type, &species_ids, orthofinder_out_dir, &logger)?;

    // Rewrite BLAST files using sequence map
    logger.information(&format!("prepare_orthofinder_blast: rewrite BLAST files with species codes: {}", orthofinder_out_dir.display()));
    rewrite_blast_files(blast_out_dir, orthofinder_out_dir, &species_ids, &seq_id_map, &logger)?;

   Ok(())
}

/// 1) Try to parse the "Results directory:" line from OrthoFinder output.
///    Accepts same-line or next-line paths, ignores leading spaces.
///    Returns the last such path found (OF prints it twice).
fn parse_results_dir_folded(log: &str) -> Option<PathBuf> {
    // Find every "Results directory:" occurrence and keep the last usable path.
    let mut last: Option<PathBuf> = None;
    let mut lines = log.lines().enumerate().peekable();

    while let Some((_i, line)) = lines.next() {
        if !line.contains("Results directory:") {
            continue;
        }
        // Consume the following indented lines and glue them together.
        // This fixes splits like ".../B\nlast/OrthoFinder/Results_.../"
        let mut buf = String::new();
        while let Some((_, nxt)) = lines.peek() {
            let t = nxt.trim_start();
            if t.is_empty() {
                lines.next();
                continue;
            }
            // Stop at the first non-indented line. Keep all indented ones.
            if nxt.starts_with(' ') || nxt.starts_with('\t') {
                if !buf.is_empty() {
                    buf.push_str(t);
                } else {
                    buf = t.to_string();
                }
                lines.next();
            } else {
                break;
            }
        }
        if !buf.is_empty() {
            last = Some(PathBuf::from(buf));
        }
    }
    last
}

fn find_results_dir(orthofinder_out_dir: &Path, parsed_from_log: Option<PathBuf>) -> Option<PathBuf> {
    // Prefer a parsed path that actually exists
    if let Some(p) = parsed_from_log {
        if p.is_dir() {
            return Some(p);
        }
    }
    // Fallback: pick newest Results_* under Blast/OrthoFinder
    let base = orthofinder_out_dir.join("Blast").join("OrthoFinder");
    let mut candidates = Vec::new();
    if let Ok(rd) = fs::read_dir(&base) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                    if name.starts_with("Results_") {
                        if let Ok(meta) = fs::metadata(&p) {
                            if let Ok(modified) = meta.modified() {
                                candidates.push((modified, p));
                            }
                        }
                    }
                }
            }
        }
    }
    candidates.sort_by_key(|(t, _)| *t);
    candidates.last().map(|(_, p)| p.clone())
}

/// Harvest Orthogroups.tsv and copy it to `<orthofinder_out_dir>/Orthogroups.tsv`.
pub fn harvest_orthogroups(log: &str, orthofinder_out_dir: &Path) -> Result<PathBuf, String> {
    let parsed = parse_results_dir_folded(log);
    let results_dir = find_results_dir(orthofinder_out_dir, parsed)
        .ok_or_else(|| "Could not resolve OrthoFinder results directory".to_string())?;

    let src = results_dir.join("Orthogroups").join("Orthogroups.tsv");
    if !src.is_file() {
        return Err(format!("Missing {}", src.display()));
    }

    let dst = orthofinder_out_dir.join("Orthogroups.tsv");
    if dst.exists() {
        fs::remove_file(&dst).map_err(|e| format!("remove {}: {}", dst.display(), e))?;
    }
    fs::copy(&src, &dst)
        .map_err(|e| format!("copy {} -> {} failed: {}", src.display(), dst.display(), e))?;

    Ok(dst)
}
use crate::read_fasta::Fasta;
use crate::logger::Logger;
use crate::RepoEntry;
use crate::blast;

//use std::fs;
use std::fs::{File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::collections::BTreeMap;
use std::collections::HashMap;

pub fn write_filtered_fasta(
    filtered_records: &[Fasta],
    output_path: &Path,
    logger: &Logger,
) -> Result<(), std::io::Error> {

    let mut writer = BufWriter::new(File::create(&output_path)?);

    for fasta in filtered_records {
        writeln!(writer, ">{}", fasta.id)?;
        writeln!(writer, "{}", fasta.seq)?;
    }

    logger.information(&format!("write_filtered_fasta: Wrote parsed FASTA to {}", output_path.display()));
    Ok(())
}

pub fn write_combined_fasta_file(
    output_path: &Path,
    all_fasta: &[Fasta],
    logger: &Logger,
) -> std::io::Result<()> {
    let mut file = File::create(output_path)?;

    for fasta in all_fasta {
        writeln!(file, ">{}", fasta.id)?;
        let wrapped_seq = fasta.seq.as_bytes().chunks(60);
        for chunk in wrapped_seq {
            writeln!(file, "{}", std::str::from_utf8(chunk).unwrap())?;
        }
    }

    logger.information(&format!("write_combined_fasta_file: Wrote combined FASTA to {:?}", output_path));
    Ok(())
}

// Orthofinder

fn wanted_suffix_for(alignment_type: &str) -> Result<&'static str, String> {
    match alignment_type.to_ascii_lowercase().as_str() {
        "pep" | "protein" | "aa" => Ok("synima-parsed.pep"),
        "cds" | "dna" | "nucl" | "nucleotide" => Ok("synima-parsed.cds"),
        other => Err(format!("alignment_type must be 'pep' or 'cds', got: {}", other)),
    }
}

// Helper: locate a fasta path in the repo for this species
/// Locate a fasta path in the repo for each species; error on none or ambiguous.
fn build_species_to_fasta_map(
    repo: &[RepoEntry],
    species_ids: &BTreeMap<String, usize>,
    suffix: &str,
) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut species_to_fasta: BTreeMap<String, PathBuf> = BTreeMap::new();

    for species in species_ids.keys() {
        let mut found: Option<PathBuf> = None;

        for entry in repo {
            for file in entry.files.values() {
                let p = Path::new(&file.path);
                if let Some(fname) = p.file_name().and_then(|s| s.to_str()) {
                    // simple heuristic: filename contains species and ends with the wanted suffix
                    if fname.ends_with(suffix) && fname.contains(species) {
                        if let Some(prev) = &found {
                            return Err(format!(
                                "Multiple '{}' files match species '{}' (at least '{}' and '{}')",
                                suffix, species, prev.display(), p.display()
                            ));
                        }
                        found = Some(p.to_path_buf());
                    }
                }
            }
        }

        let path = found.ok_or_else(|| {
            format!(
                "No '{}' FASTA found for species '{}' anywhere in repo entries",
                suffix, species
            )
        })?;

        species_to_fasta.insert(species.clone(), path);
    }

    Ok(species_to_fasta)
}

/// Rewrite one FASTA to OrthoFinder’s numeric headers, collect sequence-ID mapping.
/// Header rule:
///   original header first token -> `orig`
///   new header written as        -> `>{sid}_{local_idx}`
/// Mapping recorded as            -> `orig` => `sid_idx`
fn rewrite_one_species_fasta(
    in_fa: &Path,
    out_fa: &Path,
    sid: usize,
    seq_map: &mut HashMap<String, String>,
    seq_index_rows: &mut Vec<(usize, usize, String)>,
) -> Result<(), String> {
    let rdr = BufReader::new(File::open(in_fa).map_err(|e| format!("open {}: {}", in_fa.display(), e))?);
    let mut wtr = BufWriter::new(File::create(out_fa).map_err(|e| format!("create {}: {}", out_fa.display(), e))?);

    let mut local_idx: usize = 0;

    for (lineno, line) in rdr.lines().enumerate() {
        let line = line.map_err(|e| format!("read {} line {}: {}", in_fa.display(), lineno + 1, e))?;
        if line.starts_with('>') {
            let hdr = line[1..].trim();
            let orig_token = hdr.split_whitespace().next().unwrap_or("").to_string();
            if orig_token.is_empty() {
                return Err(format!("Empty FASTA header at {}:{}", in_fa.display(), lineno + 1));
            }

            let new_id = format!("{}_{}", sid, local_idx);
            writeln!(wtr, ">{}", new_id).map_err(|e| format!("write header {}: {}", out_fa.display(), e))?;

            // record mapping
            seq_map.insert(orig_token.clone(), new_id.clone());
            seq_index_rows.push((sid, local_idx, orig_token));

            local_idx += 1;
        } else {
            writeln!(wtr, "{}", line).map_err(|e| format!("write seq {}: {}", out_fa.display(), e))?;
        }
    }

    Ok(())
}

/// Write SequenceIDs.txt as "sid_idx: original_token" sorted by (sid, idx)
fn write_sequence_ids_txt(
    blast_dir: &Path,
    seq_index_rows: &mut Vec<(usize, usize, String)>,
) -> Result<(), String> {

    seq_index_rows.sort_by_key(|(sid, idx, _)| (*sid, *idx));
    let seq_ids_fn = blast_dir.join("SequenceIDs.txt");
    let mut w = BufWriter::new(
        File::create(&seq_ids_fn).map_err(|e| format!("create {}: {}", seq_ids_fn.display(), e))?,
    );
    for (sid, idx, orig) in seq_index_rows.iter() {
        writeln!(w, "{}_{}: {}", sid, idx, orig).map_err(|e| format!("write {}: {}", seq_ids_fn.display(), e))?;
    }
    Ok(())
}

pub fn rewrite_fastas_from_repo(
    repo: &[RepoEntry],
    alignment_type: &str,                  // "pep" or "cds"
    species_ids: &BTreeMap<String, usize>,    // .../Blast/SpeciesIDs.txt
    out_dir: &Path,             // synima_orthofinder_out
) -> Result<HashMap<String, String>, String> {

    let suffix = wanted_suffix_for(alignment_type)?;
    let blast_dir = blast::ensure_blast_dir(out_dir)?;

    // Build species -> fasta path map once
    let species_to_fasta = build_species_to_fasta_map(repo, species_ids, suffix)?;

    // Sequence mapping (original_token -> "sid_idx") and rows for SequenceIDs.txt
    let mut seq_map: HashMap<String, String> = HashMap::new();
    let mut seq_index_rows: Vec<(usize, usize, String)> = Vec::new(); // (sid, idx, original_token)

    // Rewrite each species fasta to Blast/Species<SID>.fa
    for (species, sid) in species_ids {
        let in_fa = species_to_fasta.get(species).ok_or_else(|| {
            format!("Internal: missing FASTA path for species '{}'", species)
        })?;
        let out_fa = blast_dir.join(format!("Species{}.fa", sid));
        rewrite_one_species_fasta(in_fa, &out_fa, *sid, &mut seq_map, &mut seq_index_rows)?;
    }

    // Write SequenceIDs.txt
    write_sequence_ids_txt(&blast_dir, &mut seq_index_rows)?;

    Ok(seq_map)
}
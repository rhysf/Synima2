use crate::logger::Logger;
use crate::read_repo::RepoEntry;
use crate::read_gff::MatchFieldCriteria;

use std::fs::{self};
use std::collections::{HashMap};
use std::path::Path;
//use std::fs::File;
//use std::process;

#[derive(Clone, Debug)]
pub struct Fasta {
    pub id:String,
    pub desc:String,
    pub seq:String,
}

fn read_fasta(path: &Path, logger: &Logger) -> Vec<Fasta> {
    println!("read_fasta: processing file: {}", path.display());

    // read file
    let fasta_file = fs::read_to_string(path).unwrap_or_else(|error| {
        logger.error(&format!("read_fasta: Error reading {}: {}", path.display(), error));
        std::process::exit(1);
    });

    // separate out the columns
    let mut last_id = "";
    let mut last_desc = "";
    let mut last_sequence = String::from("");
    let mut fasta: Vec<Fasta> = Vec::new();
    for line in fasta_file.lines() {

        // ID and Description
        if line.starts_with(">") {
            if last_id != "" {
                fasta.push(Fasta { id: last_id.to_string(), desc: last_desc.to_string(), seq: last_sequence });
                //fasta.push(Fasta { id: last_id.to_string(), seq: last_sequence });
            }
            last_sequence = String::from("");

            match line.find(" ") {
                Some(index) => {
                    last_id = &line[1..index];
                    last_desc = &line[index+1..];
                },
                None => { 
                    last_id = &line[1..];
                    last_desc = "";
                }
            };
            //println!("id and desc: {} {}", last_id, last_desc);
        }
        else {
            last_sequence.push_str(line);
        }
    }
    fasta.push(Fasta { id: last_id.to_string(), desc: last_desc.to_string(), seq: last_sequence }); 
    //fasta.push(Fasta { id: last_id.to_string(), seq: last_sequence }); 
    logger.information(&format!("read_fasta: Loaded {} sequences", fasta.len()));

    return fasta;
}

fn load_fasta_by_type(repo_entries: &[RepoEntry], file_type: &str, logger: &Logger) -> Vec<(String, Fasta)> {
    let mut all_sequences = Vec::new();

    for entry in repo_entries {
        let genome_name = &entry.name;

        match entry.files.get(file_type) {
            Some(file) => {
                let path = Path::new(&file.path);
                let sequences = read_fasta(path, logger);

                for fasta in sequences {
                    all_sequences.push((
                        genome_name.clone(),
                        Fasta {
                            id: fasta.id,
                            desc: fasta.desc,
                            seq: fasta.seq,
                        },
                    ));
                }
            }
            None => {logger.warning(&format!("load_fasta_by_type: No '{}' file found for genome '{}'", file_type, genome_name));
            }
        }
    }
    //logger.information("──────────────────────────────");
    all_sequences
}

//pub fn load_alignment_fastas(repo_entries: &[RepoEntry], alignment_type: &str, logger: &Logger) -> Vec<(String, Fasta)> {
//    load_fasta_by_type(repo_entries, alignment_type, logger)
//}

pub fn load_genomic_fastas(repo_entries: &[RepoEntry], logger: &Logger) -> HashMap<String, HashMap<String, String>> {
    let records = load_fasta_by_type(repo_entries, "genome", logger);

    let mut genomes: HashMap<String, HashMap<String, String>> = HashMap::new();
    for (genome, fasta) in records {
        genomes
            .entry(genome)
            .or_insert_with(HashMap::new)
            .insert(fasta.id, fasta.seq);
    }

    genomes
}

// remove quotes ("), square brackets ([ and ]).
// Splits the cleaned string on | if present. Otherwise, on whitespace (spaces, tabs).
// Returns index => (source, key, value)
pub fn split_fasta_id_and_desc_into_fields(id: &str, desc: &str) -> HashMap<usize, (String, String, String)> {
    
    let mut fields = HashMap::new();

    // Clean and split ID
    let cleaned_id = id.replace('"', "").replace('[', "").replace(']', "");
    for (i, part) in cleaned_id
        .split(|c: char| c == '|' || c.is_whitespace())
        .filter(|s| !s.trim().is_empty())
        .enumerate()
    {
        let trimmed = part.trim();
        let (key, val) = if let Some((k, v)) = trimmed.split_once('=') {
            (k.trim().to_string(), v.trim().to_string())
        } else {
            (format!("field_{}", i), trimmed.to_string())
        };
        fields.insert(i, ("id".to_string(), key, val));
    }

    // Clean and split DESC
    let offset = fields.len(); // Continue indexing from where ID left off
    let cleaned_desc = desc.replace('"', "").replace('[', "").replace(']', "");
    for (i, part) in cleaned_desc
        .split(|c: char| c == '|' || c.is_whitespace())
        .filter(|s| !s.trim().is_empty())
        .enumerate()
    {
        let trimmed = part.trim();
        let (key, val) = if let Some((k, v)) = trimmed.split_once('=') {
            (k.trim().to_string(), v.trim().to_string())
        } else {
            (format!("field_{}", offset + i), trimmed.to_string())
        };
        fields.insert(offset + i, ("desc".to_string(), key, val));
    }
    fields
}

pub fn build_fasta_index<'a>(
    fasta_records: &'a [Fasta],
    criteria: &Option<MatchFieldCriteria>,
    _logger: &Logger
) -> HashMap<String, Vec<&'a Fasta>> {
    let mut map: HashMap<String, Vec<&'a Fasta>> = HashMap::new();

    if let Some(c) = criteria {
        //logger.warning("criteria?");
        for fasta in fasta_records {
            let parts = split_fasta_id_and_desc_into_fields(&fasta.id, &fasta.desc);
            //for (i, triple) in parts.iter() {
            //    println!("Index {} => {:?}", i, triple);
            //}
            //logger.warning(&format!("FASTA parts: {:?}", parts));
            //logger.warning(&format!("Expected fasta_field_index: {}", c.fasta_field_index));
            if let Some((_, _, value)) = parts.get(&c.fasta_field_index) {
                if !value.trim().is_empty() {
                    map.entry(value.clone()).or_default().push(fasta);
                } 
                //else {
                //    logger.warning(&format!("Empty value at index {}: {:?}", c.fasta_field_index, parts));
                //}
            } 
            //else {
            //    logger.warning(&format!("Index {} missing in FASTA parts: {:?}", c.fasta_field_index, parts));
            //}
        }
    }
    //logger.information(&format!("Built FASTA index with {} unique keys", map.len()));

    //for (key, vals) in map.iter().take(5) {
    //    logger.information(&format!("Index key: '{}', record count: {}", key, vals.len()));
    //}
    map
}

pub fn read_fasta_for_genome(
    entry: &RepoEntry,
    file_type: &str,
    logger: &Logger,
) -> Vec<Fasta> {
    match entry.files.get(file_type) {
        Some(file) => {
            let path = Path::new(&file.path);
            read_fasta(path, logger)
        }
        None => {
            logger.warning(&format!("No '{}' file found for '{}'", file_type, entry.name));
            Vec::new()
        }
    }
}
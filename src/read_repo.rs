use crate::logger::Logger;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
//use std::process;
//use std::collections::HashMap;


/// Holds a single genome + annotation pair from the repo spec
#[derive(Debug)]
pub struct RepoFile {
    pub file_type: String, // "cds", "pep", "genome", "gff"
    pub path: String,
}

#[derive(Debug)]
pub struct RepoEntry {
    pub name: String,
    pub base_dir: Option<String>, // from 'dir' row, if provided
    pub files: HashMap<String, RepoFile>,
}

/// Read a repo spec file in the format:
///
/// <name>    <type>    <location>
/// where:
/// - `<name>` is the genome identifier (e.g., CNB2)
/// - `<type>` is one of: genome, cds, pep, gff, dir
/// - `<location>` is either a full path or a filename relative to a prior 'dir' entry
///
/// Returns a vector of `RepoEntry` structs grouped by genome name.
/// If a `dir` is provided, all other file paths are checked or completed relative to it.
pub fn read_repo_spec(file: &str, alignment_type: &str, logger: &Logger) -> Vec<RepoEntry> {
    logger.information(&format!("read_repo_spec: Reading repo spec file: {}", file));

    let content = fs::read_to_string(file).unwrap_or_else(|error| {
        logger.error(&format!("read_repo_spec: Failed to read file '{}': {}", file, error));
        std::process::exit(1);
    });

    let spec_path = Path::new(file);
    let spec_dir = spec_path.parent().unwrap_or_else(|| Path::new("."));

    let mut entries: HashMap<String, RepoEntry> = HashMap::new();

    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let line_parts: Vec<&str> = trimmed.split_whitespace().collect();
        if line_parts.len() != 3 {
            logger.error(&format!("read_repo_spec: Invalid format at line {}: '{}'. Expected 3 tab-delimited columns (name, type, location).", index + 1, trimmed));
            std::process::exit(1);
        }

        let name = line_parts[0].trim().to_string();
        let file_type = line_parts[1].trim().to_lowercase();
        let location = line_parts[2].trim().to_string();

        // Get or create a RepoEntry for this name
        let entry = entries.entry(name.clone()).or_insert(RepoEntry {
            name: name.clone(),
            base_dir: None,
            files: HashMap::new(),
        });

        // Handle "dir" row
        if file_type == "dir" {
            entry.base_dir = Some(location.clone());
            continue;
        }

        // Build the full path using spec_dir and optional base_dir
        let full_path = if Path::new(&location).is_absolute() {
            location.clone()
        } else {
            let mut combined = PathBuf::from(spec_dir);

            if let Some(base) = &entry.base_dir {
                combined.push(base);
            }

            combined.push(&location);
            combined.to_string_lossy().to_string()
        };

        // Check file existence
        if !Path::new(&full_path).exists() {
            logger.error(&format!("read_repo_spec: File not found for {} (type: {}): {}", name, file_type, full_path));
            std::process::exit(1);
        }

        // Skip sequence files of no interest
        if file_type == "pep" && alignment_type != "pep" {
            // Skipping pep if user requested CDS alignment
            continue;
        }
        if file_type == "cds" && alignment_type != "cds" {
            // Skipping cds if user requested PEP alignment
            continue;
        }

        // Insert this file type
        if entry.files.contains_key(&file_type) {
            logger.warning(&format!("read_repo_spec: Duplicate entry for type '{}' in genome '{}'. Ignoring file: {}", file_type, name, full_path));
        } else {
            entry.files.insert(
                file_type.clone(),
                RepoFile {
                    file_type: file_type.clone(),
                    path: full_path,
                },
            );
        }
    }

    // Convert HashMap to Vec
    let repo_entries: Vec<RepoEntry> = entries.into_values().collect();

    // Validation: must have at least two genomes
    if repo_entries.is_empty() {
        logger.error("read_repo_spec: No valid entries found in the repo spec file.");
        std::process::exit(1);
    }

    if repo_entries.len() == 1 {
        logger.error("read_repo_spec: Only one genome entry found in the repo spec. At least two are required for comparative analysis.");
        std::process::exit(1);
    }

    logger.information(&format!("read_repo_spec: Parsed {} genome entries", repo_entries.len()));

    // Optional: warn if common file types missing
    let required_types = vec!["genome", "gff"]; // Always required

    //match alignment_type {
    //    "cds" => required_types.push("cds"),
    //    "pep" => required_types.push("pep"),
    //    _ => {
    //        logger.error(&format!("read_repo_spec: Unknown alignment type '{}'. Expected 'cds' or 'pep'.", alignment_type));
    //        std::process::exit(1);
    //    }
    //}

    for entry in &repo_entries {
        for &req in &required_types {
            if !entry.files.contains_key(req) {
                logger.error(&format!("read_repo_spec: Entry '{}' is missing expected file type '{}'", entry.name, req));
                std::process::exit(1);
            }
        }
    }

    repo_entries
}

pub fn update_repo_with_parsed_files(repo: &mut Vec<RepoEntry>, repo_root: &Path, logger: &Logger) {
    logger.information("update_repo_with_parsed_files...");

    for entry in repo.iter_mut() {
        //logger.information(&format!("update_repo_with_parsed_files: Checking genome: {}", entry.name));

         let Some(base_dir_str) = &entry.base_dir else {
            logger.warning(&format!("update_repo_with_parsed_files: Skipped entry {}: no base_dir set", entry.name));
            continue;
        };

        let base_dir = repo_root.join(base_dir_str);
        //logger.information(&format!("🔍 Searching base_dir: {}", base_dir.display()));

        // Step 1: Look for synima-parsed.* inside <base_dir>/<genome_name>
        //let genome_dir = base_dir.join(&entry.name);
        //if let Ok(genome_entries) = fs::read_dir(&genome_dir) {
        if let Ok(genome_entries) = fs::read_dir(&base_dir) {
            for file in genome_entries.flatten() {
                let path = file.path();
                if !path.is_file() {
                    continue;
                }

                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    let key = match filename {
                        f if f.ends_with("synima-parsed.pep") => "pep_parsed",
                        f if f.ends_with("synima-parsed.cds") => "cds_parsed",
                        f if f.ends_with("synima-parsed.gff3") => "gff_parsed",
                        _ => continue,
                    };
                    //logger.information(&format!("✅ Found {} file: {}", key, path.display()));
                    entry.files.insert(
                        key.to_string(),
                        RepoFile {
                            file_type: key.to_string(), // or a more specific type if needed
                            path: path.to_string_lossy().to_string(),
                        },
                    );
                }
            }
        } else {
            logger.warning(&format!("update_repo_with_parsed_files: Could not open genome dir for {}", entry.name));
        }
    }

    // Step 2: Handle repo-wide all.* files into a synthetic 'synima_all' entry (all.cds, all.pep, all.gff3)
    //logger.information(&format!("📦 Searching repo_root for all.* files: {}", repo_root.display()));
    let mut synima_all_files = HashMap::new();

    if let Ok(repo_files) = fs::read_dir(repo_root) {
        for file in repo_files.flatten() {
            let path = file.path();
            if !path.is_file() {
                continue;
            }

            if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                let key = match filename {
                    f if f.ends_with(".all.pep") => "pep_all",
                    f if f.ends_with(".all.cds") => "cds_all",
                    f if f.ends_with(".all.gff3") => "gff_all",
                    _ => continue,
                };

                //logger.information(&format!("📦 Found {} file in repo_root: {}", key, path.display()));

                synima_all_files.insert(
                    key.to_string(),
                    RepoFile {
                        file_type: key.to_string(),
                        path: path.to_string_lossy().to_string(),
                    },
                );
            }
        }
    } else {
        logger.warning(&format!("update_repo_with_parsed_files: Could not open repo_root: {}", repo_root.display()));
    }

    // Only push synthetic genome if we found any all.* files
    if !synima_all_files.is_empty() {
        repo.push(RepoEntry {
            name: "synima_all".to_string(),
            base_dir: Some(repo_root.to_string_lossy().to_string()),
            files: synima_all_files,
        });
    }
}
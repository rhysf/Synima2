use clap::Parser;
use std::path::Path;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::fs;

mod args;
mod logger;
mod read_repo;
mod read_fasta;
mod read_gff;
mod write_fasta;
mod write_gff;
mod read_fasta_and_gff;
mod blast;
mod external_tools;
mod parse_dna_and_peptide;

//use read_fasta::{read_fasta, Fasta};
use args::{Args, SynimaStep};
use logger::Logger;
use read_fasta::{Fasta};
use read_repo::{RepoEntry};
use read_gff::{GffFeature};
//use read_repo::{read_repo_spec, RepoEntry};

fn main() -> Result<(), Box<dyn std::error::Error>> {

    let args = Args::parse();
    let logger = Logger;

    // Validate steps
    validate_step_sequence(&args.synima_step, &logger);

    // Read the repo_spec file
    let mut repo = read_repo::read_repo_spec(&args.repo_spec, &args.alignment_type, &logger);
    let repo_spec_path = Path::new(&args.repo_spec);
    let repo_base_dir = repo_spec_path.parent().unwrap_or_else(|| Path::new("."));
    let repo_basename = Path::new(&args.repo_spec).file_name().and_then(|s| s.to_str()).unwrap_or("repo_spec.txt");

    // Create main out dir
    let main_output_dir = repo_base_dir.join(args.output_dir);
    fs::create_dir_all(&main_output_dir).map_err(|e| format!("Failed to create output directory {}: {}", main_output_dir.display(), e))?;

    // Set output subdirectories
    let blast_out_dir = main_output_dir.join("blast_out");
    let omcl_out_dir = main_output_dir.join("omcl_out");

    if args.synima_step.contains(&SynimaStep::CreateRepoDb) {
        logger.information("──────────────────────────────");
        logger.information("Running Step 1: create-repo-db");
        logger.information("──────────────────────────────");

        // Save all GFF's to memory
        let all_features = read_gff::save_all_features(&repo, &logger);

        // Save genome fasta to memory
        let all_genome_sequences = read_fasta::load_genomic_fastas(&repo, &logger);

        // Extract gene sequences either from GFF & genome, or match GFF & CDS/PEP
        let (all_filtered_fastas, all_filtered_gffs) = process_alignment_sequences_per_genome(&repo, &args.alignment_type, args.match_threshold, args.genetic_code, &all_features, &all_genome_sequences, &logger)?; // &path_map, 

        // Write combined output files (e.g. repo_spec.txt.all.PEP and .GFF3)
        let combined_output_dir = Path::new(&args.repo_spec).parent().unwrap_or_else(|| Path::new("."));

        // Construct final output filenames
        let combined_fasta_filename = format!("{}.all.{}", repo_basename, args.alignment_type.to_lowercase());
        let combined_gff_filename = format!("{}.all.gff3", repo_basename);

        // Combine with output path
        let combined_fasta_path = combined_output_dir.join(combined_fasta_filename);
        let combined_gff_path = combined_output_dir.join(combined_gff_filename);

        // Write files
        write_fasta::write_combined_fasta_file(&combined_fasta_path, &all_filtered_fastas, &logger)?;
        write_gff::write_combined_gff_file(&combined_gff_path, &all_filtered_gffs, &logger)?;

        logger.information("──────────────────────────────");
    }

    // Update repo (only do once)
    read_repo::update_repo_with_parsed_files(&mut repo, repo_base_dir, &logger);
    
    if args.synima_step.contains(&SynimaStep::BlastGrid) {
        logger.information("──────────────────────────");
        logger.information("Running Step 2: blast-grid");
        logger.information("──────────────────────────");

        // Get makeblastdb or formatdb
        let blast_tools = blast::get_blast_binaries(&logger);

        // Create BLAST databases
        blast::create_all_blast_dbs(&repo, &args.alignment_type, &blast_tools.db_tool, &blast_tools.version, &logger)?;

        // Run all-vs-all BLAST
        blast::run_all_vs_all_blast(&repo, &blast_tools.blast_tool, &blast_tools.version, &args.alignment_type, &args.evalue, &blast_out_dir, args.threads, &logger)?;
    }

    if args.synima_step.contains(&SynimaStep::BlastToOrthomcl) {
        logger.information("─────────────────────────────────");
        logger.information("Running Step 3: blast-to-orthomcl");
        logger.information("─────────────────────────────────");

        // make output director
        std::fs::create_dir_all(&omcl_out_dir).map_err(|e| format!("Failed to create output directory: {}", e))?;

        // Concatenate BLAST results (only 1 direction, thereby avoiding redundant hits)
        let all_vs_all_path = omcl_out_dir.join("all_vs_all.out");
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, &logger)?;

    }

    logger.information("Synima: All requested steps completed.");
    Ok(())
}

/// Validate that steps are sequential and mutually exclusive where needed
fn validate_step_sequence(steps: &[SynimaStep], logger: &Logger) {
    use SynimaStep::*;

    // Check that only one of the alternative orthology steps is included
    let orthology_steps = [
        BlastToOrthomcl,
        BlastToRbh,
        BlastToOrthofinder,
    ];

    let selected_orthology_steps: Vec<_> = steps.iter().filter(|step| orthology_steps.contains(step)).collect();

    if selected_orthology_steps.len() > 1 {
        logger.error("Only one of blast_to_orthomcl, blast_to_rbh, or blast_to_orthofinder may be used.");
        std::process::exit(1);
    }

    // Build expected step order dynamically
    let mut expected_order = vec![CreateRepoDb, BlastGrid];

    if let Some(step) = selected_orthology_steps.first() {
        expected_order.push((*step).clone());
    }

    expected_order.extend([OrthologSummary, Dagchainer, Synima]);

    // Now check that user steps appear in order, without skipping ahead
    let mut expected_idx = 0;

    for user_step in steps {
        while expected_idx < expected_order.len() && expected_order[expected_idx] != *user_step {
            expected_idx += 1;
        }

        if expected_idx == expected_order.len() {
            logger.error(&format!("Step {:?} is out of sequence or unexpected.", user_step));
            std::process::exit(1);
        }

        expected_idx += 1; // move forward for next step
    }
}

pub fn process_alignment_sequences_per_genome(
    repo: &[RepoEntry],
    alignment_type: &str,
    match_threshold: u8,
    genetic_code: usize, 
    all_features: &HashMap<String, Vec<GffFeature>>,
    all_genome_sequences: &HashMap<String, HashMap<String, String>>, 
    logger: &Logger) -> Result<(Vec<Fasta>, Vec<String>), std::io::Error> {

    logger.information("process_alignment_sequences_per_genome: Determine if gene FASTA provided");

    let mut all_filtered_fastas = Vec::new();
    let mut all_filtered_gffs = Vec::new();

    for entry in repo {
        let genome = &entry.name;
        let has_sequences = entry.files.contains_key(alignment_type);

        // get parsed Vec<GffFeature> from that file, already in memory
        let features = match all_features.get(genome) {
            Some(f) => f,
            None => {
                logger.warning(&format!("process_alignment_sequences_per_genome: No GFF features found for '{}'", genome));
                continue;
            }
        };

        // get gff path
        let Some(gff_file) = entry.files.get("gff") else {
            logger.error(&format!("process_alignment_sequences_per_genome: No GFF file found for '{}'", genome));
            std::process::exit(1);
        };
        let gff_path = PathBuf::from(&gff_file.path);

        if has_sequences {

            // load FASTA
            let fasta_list = read_fasta::read_fasta_for_genome(entry, alignment_type, logger);

            // Step 1: Evaluate mapping between GFF features and FASTA records
            let mapping = read_fasta_and_gff::evaluate_gff_fasta_mappings(features, &fasta_list, genome, logger);

            // Step 2: Unwrap best mapping result (skip this genome if no match)
            let Some(best_parent) = &mapping.0 else {
                continue;
            };

            // Step 3: Get output paths for filtered FASTA
            let Some(fasta_file) = entry.files.get(alignment_type) else {
                logger.error(&format!("process_alignment_sequences_per_genome: No {} file found for '{}'", alignment_type, genome));
                std::process::exit(1);
            };
            let fasta_path = PathBuf::from(&fasta_file.path);

            // Step 4: Tag each FASTA record with its genome name
            let fasta_for_genome: Vec<(String, Fasta)> = fasta_list.iter().map(|f| (genome.clone(), f.clone())).collect();

            // Step 5: Perform extraction + write output files for this genome
            let Ok((filtered_fasta, filtered_gff, match_pct)) = read_fasta_and_gff::extract_and_write_selected_features(
                best_parent,
                all_features,
                &fasta_for_genome,
                &fasta_path,
                &gff_path,
                alignment_type,
                match_threshold,
                logger,
            ) else {
                logger.error(&format!("process_alignment_sequences_per_genome: Error writing filtered files for '{}'", genome));
                std::process::exit(1);
            };

            // Step 6: Append results to global output collections (if its > match_threshold)
            if match_pct >= (match_threshold as f32) {
                all_filtered_fastas.extend(filtered_fasta);
                all_filtered_gffs.extend(filtered_gff);
                continue; // Go on to next genome
            }
        } 
        
        // fallback: applies if no FASTA or match_pct was too low
        {
            // Step 5a: extract directly from GFF + genome FASTA
            let Some(contigs) = all_genome_sequences.get(genome) else {
                logger.error(&format!("process_alignment_sequences_per_genome: No genome FASTA found for '{}'", genome));
                std::process::exit(1);
            };

            // Extract sequences
            let (extracted, parent_feature_type, gff_key_used) = read_fasta_and_gff::extract_genes_from_genome_specified_in_gff(genome, features, contigs, alignment_type, genetic_code, logger);

            // Build set of IDs (needed to filter GFF lines. Split because the id's now have genome|id)
            let extracted_ids: HashSet<String> = extracted.iter().map(|f| {
                f.id.split('|').nth(1).unwrap_or(&f.id).to_string()
            }).collect();

            // Rewrite GFF lines exactly like in extract_and_write_selected_features
            // • Keep only features whose ID/Parent ∈ extracted_ids
            // • Replace attribute column with genome|ID
            let rewritten_gff_lines = read_gff::filter_and_rewrite_gff_lines(
                features,
                genome,
                &parent_feature_type,
                &extracted_ids,
                &gff_key_used, 
            );

            //write_fasta::write_filtered_fasta(&extracted, &fasta_path, logger)?;
            write_fasta::write_filtered_fasta(&extracted, &gff_path, alignment_type, logger)?;
            write_gff::write_filtered_gff(&rewritten_gff_lines, &gff_path, logger)?;

            // Step 6: Append results to global output collections
            all_filtered_fastas.extend(extracted);
            all_filtered_gffs.extend(rewritten_gff_lines);
        }
    }

    Ok((all_filtered_fastas, all_filtered_gffs))
}
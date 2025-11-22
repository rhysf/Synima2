use clap::Parser;
use std::path::Path;
//use std::collections::{HashMap, HashSet};
//use std::path::PathBuf;
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
mod omcl;
mod blast_rbh;

//use read_fasta::{read_fasta, Fasta};
use args::{Args, SynimaStep};
use logger::Logger;
//use read_fasta::{Fasta};
use read_repo::{RepoEntry};
//use read_gff::{GffFeature};
//use read_repo::{read_repo_spec, RepoEntry};

fn main() -> Result<(), Box<dyn std::error::Error>> {

    let args = Args::parse();
    let logger = Logger;

    // Validate steps
    args::validate_step_sequence(&args.synima_step, &logger);

    // Read the repo_spec file
    let mut repo = read_repo::read_repo_spec(&args.repo_spec, &args.alignment_type, &logger);
    let repo_spec_path = Path::new(&args.repo_spec);
    let repo_base_dir = repo_spec_path.parent().unwrap_or_else(|| Path::new("."));
    let repo_basename = Path::new(&args.repo_spec).file_name().and_then(|s| s.to_str()).unwrap_or("repo_spec.txt");

    // Create main out dir
    let main_output_dir = repo_base_dir.join(&args.output_dir);
    fs::create_dir_all(&main_output_dir).map_err(|e| format!("Failed to create output directory {}: {}", main_output_dir.display(), e))?;

    // combined data
    let combined_fasta_filename = format!("{}.all.{}", repo_basename, &args.alignment_type);
    let combined_gff_filename = format!("{}.all.gff", repo_basename);
    let combined_fasta_path = main_output_dir.join(combined_fasta_filename);
    let combined_gff_path = main_output_dir.join(combined_gff_filename);

    // Set input subdirs
    let bin_dir = Path::new("bin");

    // Set output subdirs
    let blast_out_dir = main_output_dir.join("synima_blast_out");
    let omcl_out_dir = main_output_dir.join("synima_omcl_out");
    let rbh_out_dir = main_output_dir.join("synima_rbh_out");

    if args.synima_step.contains(&SynimaStep::CreateRepoDb) {
        logger.information("──────────────────────────────");
        logger.information("Running Step 1: create-repo-db");
        logger.information("──────────────────────────────");

        // Save all GFF's to memory
        let all_features = read_gff::save_all_features(&repo, &logger);

        // Save genome fasta to memory
        let all_genome_sequences = read_fasta::load_genomic_fastas(&repo, &logger);

        // Extract gene sequences either from GFF & genome, or match GFF & CDS/PEP
        let (per_genome_fastas, per_genome_gffs, all_filtered_fastas, all_filtered_gffs) = read_fasta_and_gff::match_or_extract_genes_from_gff(&repo, &args, &all_features, &all_genome_sequences, &logger)?;

        // Write individual output files
        for genome in per_genome_fastas.keys() {
            let fasta_entries = &per_genome_fastas[genome];
            let gff_entries = &per_genome_gffs[genome];

            // Create output dir: main_output_dir/genome/
            let genome_dir = main_output_dir.join(genome);
            fs::create_dir_all(&genome_dir)?;

            // Write outputs
            let fasta_path = genome_dir.join(format!("{genome}.synima-parsed.{}", args.alignment_type));
            let gff_path = genome_dir.join(format!("{genome}.synima-parsed.gff"));
            write_fasta::write_filtered_fasta(fasta_entries, &fasta_path, &logger)?;
            write_gff::write_filtered_gff(gff_entries, &gff_path, &logger)?;
        }

        // Write combined output files (e.g. repo_spec.txt.all.pep and .gff3)
        write_fasta::write_combined_fasta_file(&combined_fasta_path, &all_filtered_fastas, &logger)?;
        write_gff::write_combined_gff_file(&combined_gff_path, &all_filtered_gffs, &logger)?;

        logger.information("──────────────────────────────");
    }

    // Update repo (only do once)
    read_repo::update_repo_with_parsed_files(&mut repo, &main_output_dir, &logger);
    
    if args.synima_step.contains(&SynimaStep::BlastGrid) {
        logger.information("──────────────────────────");
        logger.information("Running Step 2: blast-grid");
        logger.information("──────────────────────────");

        // Get makeblastdb or formatdb
        let blast_tools = blast::get_blast_binaries(&bin_dir, &logger);

        // Create BLAST databases
        blast::create_all_blast_dbs(&repo, &args.alignment_type, &blast_tools.db_tool, &blast_tools.version, &main_output_dir, &logger)?;

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
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, "orthomcl", &logger)?;

        // Assign genome codes to genes for omcl
        let genome_set = omcl::parse_genome_map_from_gff(&combined_gff_path, &logger)?;
        let code_out_path = omcl_out_dir.join("genome_codes.tsv");
        let genome_to_code = omcl::assign_genome_codes(&genome_set, &code_out_path, &logger)?;
        let blast_m8_output_path = omcl_out_dir.join("all_vs_all.gcoded.m8");
        omcl::write_gcoded_m8_and_sort(&genome_to_code, &all_vs_all_path, &blast_m8_output_path, &logger)?;

        let omcl_prefix = omcl_out_dir.join("omcl_in"); // will create omcl_in.bpo and omcl_in.gg
        let (bpo_path, gg_path) = omcl::convert_m8_to_orthomcl_format(&blast_m8_output_path, &omcl_prefix, &genome_to_code, &logger)?;

        // run OrthoMCL
        let orthomcl_script = std::env::current_dir().expect("Could not get current dir").join("bin").join("OrthoMCL.pl");
        let omcl_log_path = omcl_out_dir.join("omcl.log");
        omcl::run_orthomcl_clustering(&orthomcl_script, &bpo_path, &gg_path, &omcl_log_path, &logger)?;
    }

    if args.synima_step.contains(&SynimaStep::BlastToRbh) {
        logger.information("────────────────────────────");
        logger.information("Running Step 3: blast-to-rbh");
        logger.information("────────────────────────────");

        // get slclust
        let (_found_slclust, slclust_path) = external_tools::find_executable_with_fallback("slclust", &bin_dir, &logger);
        let slclust_path = slclust_path.as_ref().ok_or("slclust binary not found")?;

        // make output director
        std::fs::create_dir_all(&rbh_out_dir).map_err(|e| format!("Failed to create output directory: {}", e))?;

        // Concatenate BLAST results (both directions)
        let all_vs_all_path = rbh_out_dir.join("all_vs_all.out");
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, "rbh", &logger)?;

        // Save just the first 2 columns
        let rbh_pairs_path = blast_rbh::write_blast_pairs(&all_vs_all_path)?;

        // Run slclust
        let slclust_output = blast_rbh::run_slclust_on_pairs(&slclust_path, &rbh_pairs_path, &logger)?;

        // Parse clusters and map genes to their cluster IDs
        let cluster_map = blast_rbh::parse_clusters(&slclust_output)?;
        let gene_to_cluster = blast_rbh::map_gene_to_cluster_id(&cluster_map);

        // Get top BLAST score per orthologous gene
        let gene_to_top_ortho_blast_score = blast_rbh::get_top_ortho_blast_score(&repo, &blast_out_dir, &logger)?;

        // Get Inparalogs (paralogs within a genome)
        let cluster_id_to_in_paralogs = blast_rbh::get_inparalogs(&repo, &blast_out_dir, &gene_to_top_ortho_blast_score, &gene_to_cluster, &logger)?;
    
        let gene_to_struct = read_repo::build_gene_struct_map(&repo, &logger);
        let out_file = rbh_out_dir.join(format!("{}.RBH.OrthoClusters", args.alignment_type));
        blast_rbh::write_final_rbh_clusters(&out_file, &cluster_map, &cluster_id_to_in_paralogs, &gene_to_struct, &logger)?;
    }

    if args.synima_step.contains(&SynimaStep::BlastToOrthofinder) {
        logger.information("────────────────────────────────────");
        logger.information("Running Step 3: blast-to-orthofinder");
        logger.information("────────────────────────────────────");
    }

    logger.information("Synima: All requested steps completed.");
    Ok(())
}
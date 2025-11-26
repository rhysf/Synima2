use clap::Parser;
use std::path::Path;
//use std::collections::{HashMap, HashSet};
//use std::path::PathBuf;
use std::fs;
use std::process::Command;
use std::process::Stdio;

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
mod orthofinder;

use args::{Args, SynimaStep};
use logger::Logger;
use read_repo::{RepoEntry};

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
    let (bin_name, bin_dir) = external_tools::locate_bin_folder("bin", &logger)?;
    logger.information(&format!("Bin name and path: {} and {}", bin_name, bin_dir.display()));
    //let bin_dir = Path::new("bin");

    // Set output subdirs
    let blast_out_dir = main_output_dir.join("synima_blast_out");
    let omcl_out_dir = main_output_dir.join("synima_omcl_out");
    let rbh_out_dir = main_output_dir.join("synima_rbh_out");
    let orthofinder_out_dir = main_output_dir.join("synima_orthofinder_out");
    let gene_clusters_out_dir = main_output_dir.join("synima_gene_clusters_out");

    if args.synima_step.contains(&SynimaStep::CreateRepoDb) {
        logger.information("──────────────────────────────");
        logger.information("Running Step 1: create-repo-db");
        logger.information("──────────────────────────────");

        // Save GFF's and genome FASTA's to memory
        let all_features = read_gff::save_all_features(&repo, &logger);
        let all_genome_sequences = read_fasta::load_genomic_fastas(&repo, &logger);

        // Extract gene sequences either from GFF & genome, or match GFF & CDS/PEP
        let (per_genome_fastas, per_genome_gffs, all_filtered_fastas, all_filtered_gffs) = read_fasta_and_gff::match_or_extract_genes_from_gff(&repo, &args, &all_features, &all_genome_sequences, &logger)?;

        // Write individual output files
        for genome in per_genome_fastas.keys() {

            // Create output dir: main_output_dir/genome/
            let genome_dir = main_output_dir.join(genome);
            if let Err(e) = fs::create_dir_all(&genome_dir) {
                logger.error(&format!("Failed to create database directory {}: {}", genome_dir.display(), e));
                std::process::exit(1);
            }

            // Write outputs
            let fasta_entries = &per_genome_fastas[genome];
            let gff_entries = &per_genome_gffs[genome];
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

        // Create BLAST databases (diamond, makeblastdb or formatdb) (tools.db_builder and tools.searcher)
        let tools = blast::resolve_aligner_tools(&args.aligner, &args.alignment_type,  &bin_dir, &logger);
        blast::create_all_dbs(&repo, &args.alignment_type, tools.db_builder, &blast_out_dir, &logger);

        // Run all-vs-all BLAST
        blast::run_all_vs_all(&repo, &tools.searcher, &args, &blast_out_dir, &logger);
    }

    if args.synima_step.contains(&SynimaStep::BlastToOrthomcl) {
        logger.information("─────────────────────────────────");
        logger.information("Running Step 3: blast-to-orthomcl");
        logger.information("─────────────────────────────────");

        // make output directory
        if let Err(e) = fs::create_dir_all(&omcl_out_dir) {
            logger.error(&format!("Failed to create database directory {}: {}", omcl_out_dir.display(), e));
            std::process::exit(1);
        }

        // output files
        let all_vs_all_path = omcl_out_dir.join("all_vs_all.out");
        let code_out_path = omcl_out_dir.join("genome_codes.tsv");
        let blast_m8_output_path = omcl_out_dir.join("all_vs_all.gcoded.m8");
        let omcl_prefix = omcl_out_dir.join("omcl_in"); // will create omcl_in.bpo and omcl_in.gg
        let omcl_log_path = omcl_out_dir.join("omcl.log");

        // Concatenate BLAST results (only 1 direction, thereby avoiding redundant hits)
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, "orthomcl", &logger)?;

        // Assign genome codes to genes for omcl
        let genome_set = omcl::parse_genome_map_from_gff(&combined_gff_path, &logger)?;
        let genome_to_code = omcl::assign_genome_codes(&genome_set, &code_out_path, &logger)?;
        omcl::write_gcoded_m8_and_sort(&genome_to_code, &all_vs_all_path, &blast_m8_output_path, &logger)?;
        let (bpo_path, gg_path) = omcl::convert_m8_to_orthomcl_format(&blast_m8_output_path, &omcl_prefix, &genome_to_code, &logger)?;

        // run OrthoMCL
        let orthomcl_script = std::env::current_dir().expect("Could not get current dir").join("bin").join("OrthoMCL.pl");
        omcl::run_orthomcl_clustering(&orthomcl_script, &bpo_path, &gg_path, &omcl_log_path, &logger)?;
    }
 
    if args.synima_step.contains(&SynimaStep::BlastToRbh) {
        logger.information("────────────────────────────");
        logger.information("Running Step 3: blast-to-rbh");
        logger.information("────────────────────────────");

        // get slclust
        let slclust_path = external_tools::find_executable("slclust", &bin_dir, &logger);

        // make output directory
        if let Err(e) = fs::create_dir_all(&rbh_out_dir) {
            logger.error(&format!("Failed to create database directory {}: {}", rbh_out_dir.display(), e));
            std::process::exit(1);
        }

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
        let out_file = slclust_output.with_file_name(format!("{}{}", slclust_output.file_name().unwrap().to_string_lossy(), ".OrthoClusters"));
        blast_rbh::write_final_rbh_clusters(&out_file, &cluster_map, &cluster_id_to_in_paralogs, &gene_to_struct, &logger);
    }

    if args.synima_step.contains(&SynimaStep::BlastToOrthofinder) {
        logger.information("────────────────────────────────────");
        logger.information("Running Step 3: blast-to-orthofinder");
        logger.information("────────────────────────────────────");

        // get orthofinder
        let orthofinder_path = external_tools::find_executable("orthofinder", &bin_dir, &logger);

        // make output director
        if let Err(e) = fs::create_dir_all(&orthofinder_out_dir) {
            logger.error(&format!("Failed to create database directory {}: {}", orthofinder_out_dir.display(), e));
            std::process::exit(1);
        }

        // Prepare Orthofinder input folder
        if let Err(e) = orthofinder::prepare_orthofinder_blast(&repo, &args.alignment_type, &blast_out_dir, &orthofinder_out_dir, &logger) {
            logger.error(&format!("Error: unable to prepare orthofinder BLAST folder: {}", e));
            std::process::exit(1);
        }

        // Run Orthofinder
        logger.information(&format!("Run orthofinder: {}" , &orthofinder_out_dir.display()));

        let output = Command::new(&orthofinder_path)
            .arg("-b")
            .arg(orthofinder_out_dir.join("Blast"))
            .arg("-og")  // stop after orthogroups
            // .current_dir(&orthofinder_out_dir)  // optional, if you want cwd there
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("run orthofinder: {}", e))?;

        // Convert to strings
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Log what OrthoFinder said
        if !stdout.trim().is_empty() {
            logger.information(&format!("orthofinder stdout:\n{}", stdout));
        }
        if !stderr.trim().is_empty() {
            logger.warning(&format!("orthofinder stderr:\n{}", stderr));
        }

        // Fail hard if OrthoFinder did not succeed
        if !output.status.success() {
            logger.error(&format!("orthofinder exited with status {:?}", output.status.code()));
            // optional: include stderr again if you want it very visible
            if !stderr.trim().is_empty() {
                logger.error("orthofinder stderr was logged above");
            }
            std::process::exit(1);
        }
    
        // For harvest_orthogroups, keep the combined string
        let combined = format!("{}{}", stdout, stderr);

        // regardless of success, try to harvest if the path was printed
        match orthofinder::harvest_orthogroups(&combined, &orthofinder_out_dir) {
            Ok(path) => logger.information(&format!("Orthogroups.tsv saved to {}", path.display())),
            Err(e) => logger.information(&format!("Did not find Orthogroups.tsv: {}", e)),
        }
    }

    if args.synima_step.contains(&SynimaStep::OrthologSummary) {
        logger.information("────────────────────────────────");
        logger.information("Running Step 4: ortholog-summary");
        logger.information("────────────────────────────────");

        // make output director
        if let Err(e) = fs::create_dir_all(&gene_clusters_out_dir) {
            logger.error(&format!("Failed to create database directory {}: {}", gene_clusters_out_dir.display(), e));
            std::process::exit(1);
        }

        

    }

    logger.information("Synima: All requested steps completed.");
    Ok(())
}

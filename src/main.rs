use clap::Parser;
use std::path::Path;
use std::collections::{HashMap};
use std::fs;
use std::process::Command;
use std::process::Stdio;
use std::path::PathBuf;
use rayon::prelude::*;

mod args;
mod logger;
mod util;
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
mod ortholog_summary;
mod ortholog_summary_plot;
mod tree;
mod dagchainer;
mod synima;
mod write_repo_from_ncbi;

use args::{Args, SynimaStep}; //
use logger::Logger;
use read_repo::{RepoEntry};
use crate::ortholog_summary::OrthologySource;
use crate::util::mkdir;
use crate::synima::OrthoParams;
use crate::synima::{MethodsData};

fn main() -> Result<(), Box<dyn std::error::Error>> {

    let mut args = Args::parse();
    let logger = Logger;

    // Validate steps
    args::validate_step_sequence(&args.synima_step, &logger);

    // Validate aligner vs alignment_type compatibility
    args::validate_alignment_compatibility(&args, &logger);

    // Set input subdirs
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().unwrap();
    let bin_dir = exe_dir.join("bin");

    // Ensure bin/ exists and is populated
    util::extract_embedded_bin(&bin_dir)?;
    
    let (bin_name, bin_dir) = external_tools::locate_bin_folder(bin_dir, &logger);
    logger.information(&format!("Bin name and path: {} and {}", bin_name, bin_dir.display()));

    // Step0: Download from NCBI if -w was provided
    if let Some(accession_str) = &args.genbank_accessions {
        if args.synima_step.contains(&SynimaStep::DownloadFromNcbi) {
            let accs: Vec<String> = accession_str
                .split(',')
                .map(|x| x.trim().to_string())
                .filter(|x| !x.is_empty())
                .collect();

            write_repo_from_ncbi::run_step0_download_genbank(&accs, &logger)?;

            // ensure downstream steps know which file to use
            args.repo_spec = Some("Synima_repo_spec.txt".to_string());
        } else {
            logger.error("You used --genbank_accessions but did not select the download-from-ncbi step.");
            std::process::exit(1);
        }
    }

    // Read the repo_spec file
    let repo_spec_file = match &args.repo_spec {
        Some(path) => path,
        None => {
            logger.error("No repo spec provided. Use either --repo_spec or --genbank_accessions.");
            std::process::exit(1);
        }
    };
    let mut repo = read_repo::read_repo_spec(repo_spec_file, &args.alignment_type, &logger);
    let repo_spec_path = Path::new(repo_spec_file);
    let repo_base_dir = repo_spec_path.parent().unwrap_or_else(|| Path::new("."));
    let repo_basename = repo_spec_path.file_name().and_then(|s| s.to_str()).unwrap_or("repo_spec.txt");

    // Output dirs
    let main_output_dir = repo_base_dir.join(&args.output_dir);
    let repo_out_dir = main_output_dir.join("synima_step1_create-repo");
    let blast_out_dir = main_output_dir.join("synima_step2-align-all");
    let rbh_out_dir = main_output_dir.join("synima_step3-rbh");
    let omcl_out_dir = main_output_dir.join("synima_step3-orthomcl");
    let orthofinder_out_dir = main_output_dir.join("synima_step3-orthofinder");
    let gene_clusters_out_dir = main_output_dir.join("synima_step4-ortholog-summary");
    let tree_out_dir = main_output_dir.join("synima_step5-tree");
    let dagchainer_out_dir = main_output_dir.join("synima_step6-dagchainer");
    let synima_out_dir = main_output_dir.join("synima_step7-synima");
    mkdir(&main_output_dir, &logger, "main");

    // Input/Output filenames
    let combined_fasta_filename = format!("{}.all.{}", repo_basename, &args.alignment_type);
    let combined_gff_filename = format!("{}.all.gff", repo_basename);
    let combined_fasta_path = repo_out_dir.join(combined_fasta_filename);
    let combined_gff_path = repo_out_dir.join(combined_gff_filename);
    let combined_aligncoords = dagchainer_out_dir.join(format!("{repo_basename}.dagchainer.aligncoords"));
    let combined_spans = dagchainer_out_dir.join(format!("{repo_basename}.dagchainer.aligncoords.spans"));

    // Save genomes to memory (need for steps 1 and 4)
    let genomes = read_fasta::load_genomic_fastas(&repo, &logger);

    // Orthology step for ortholog-summaries and steps after
    let preferred_method = ortholog_summary::infer_preferred_method(&args.synima_step);

    if args.synima_step.contains(&SynimaStep::CreateRepoDb) {
        logger.information("──────────────────────────────");
        logger.information("Running Step 1: create-repo-db");
        logger.information("──────────────────────────────");

        // Save GFF's and genome FASTA's to memory
        let features = read_gff::save_all_features(&repo, &logger);

        // Extract gene sequences either from GFF & genome, or match GFF & CDS/PEP
        let (genome_to_genes, genome_to_features, all_genes, all_features) = read_fasta_and_gff::match_or_extract_genes_from_gff(&repo, &args, &features, &genomes, &logger);

        // Write individual output files
        for genome in genome_to_genes.keys() {

            // Create output dir: main_output_dir/genome/
            let genome_dir = repo_out_dir.join(genome);
            mkdir(&genome_dir, &logger, "main (reate-repo-db)");

            // Write outputs
            let fasta_entries = &genome_to_genes[genome];
            let gff_entries = &genome_to_features[genome];
            let fasta_path = genome_dir.join(format!("{genome}.synima-parsed.{}", args.alignment_type));
            let gff_path = genome_dir.join(format!("{genome}.synima-parsed.gff"));
            write_fasta::write_filtered_fasta(fasta_entries, &fasta_path, &logger)?;
            write_gff::write_filtered_gff(gff_entries, &gff_path, &logger)?;
        }

        // Write combined output files (e.g. repo_spec.txt.all.pep and .gff3)
        write_fasta::write_combined_fasta_file(&combined_fasta_path, &all_genes, &logger)?;
        write_gff::write_combined_gff_file(&combined_gff_path, &all_features, &logger)?;

        logger.information("──────────────────────────────");
    } 

    // Update repo (only do once)
    read_repo::update_repo_with_parsed_files(&mut repo, &repo_out_dir, &logger);
    
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
        mkdir(&omcl_out_dir, &logger, "main (blast-to-orthomcl)");

        // output files
        let all_vs_all_path = omcl_out_dir.join("all_vs_all.out");
        let code_out_path = omcl_out_dir.join("genome_codes.tsv");
        let blast_m8_output_path = omcl_out_dir.join("all_vs_all.gcoded.m8");
        let omcl_prefix = omcl_out_dir.join("omcl_in"); // will create omcl_in.bpo and omcl_in.gg
        let omcl_log_path = omcl_out_dir.join("omcl.log");

        // Concatenate BLAST results
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, &logger);

        // Assign genome codes to genes for omcl
        let genome_set = omcl::parse_genome_map_from_gff(&combined_gff_path, &logger)?;
        let genome_to_code = omcl::assign_genome_codes(&genome_set, &code_out_path, &logger)?;
        omcl::write_gcoded_m8_and_sort(&genome_to_code, &all_vs_all_path, &blast_m8_output_path, &logger);
        let (bpo_path, gg_path) = omcl::convert_m8_to_orthomcl_format(&blast_m8_output_path, &omcl_prefix, &genome_to_code, &logger)?;

        // run OrthoMCL
        let orthomcl_script = bin_dir.join("../OrthoMCL.pl");
        omcl::run_orthomcl_clustering(&orthomcl_script, &bpo_path, &gg_path, &omcl_log_path, &logger)?;
    }
 
    if args.synima_step.contains(&SynimaStep::BlastToRbh) {
        logger.information("────────────────────────────");
        logger.information("Running Step 3: blast-to-rbh");
        logger.information("────────────────────────────");

        // get slclust
        let slclust_path = external_tools::find_executable("slclust", &bin_dir, &logger);

        // make output directory
        mkdir(&rbh_out_dir, &logger, "main (blast-to-rbh)");

        // Concatenate BLAST results
        let all_vs_all_path = rbh_out_dir.join("all_vs_all.out");
        blast::concatenate_unique_blast_pairs(&blast_out_dir, &all_vs_all_path, &logger);

        // Save just the first 2 columns
        let rbh_pairs_path = blast_rbh::write_blast_pairs(&all_vs_all_path, &logger)?;

        // Run slclust
        let slclust_output = blast_rbh::run_slclust_on_pairs(&slclust_path, &rbh_pairs_path, &logger)?;

        // Parse clusters and map genes to their cluster IDs
        let cluster_map = blast_rbh::parse_clusters(&slclust_output.as_ref(), &logger)?;
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
        mkdir(&orthofinder_out_dir, &logger, "main (blast-to-orthofinder)");

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

        // Fail if OrthoFinder did not succeed
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
        mkdir(&gene_clusters_out_dir, &logger, "main (ortholog-summary)");

        // Get all features
        let all_features = read_gff::load_parsed_gff(&combined_gff_path, &logger);

        // Detect which ortholog clustering was used:
        let source = ortholog_summary::detect_orthology_source(preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
        let method_label = source.method_label();

        let clusters_and_unique = match &source {
            OrthologySource::OrthoFinder(dir) => {
                ortholog_summary::from_orthofinder(dir, &args.alignment_type, &gene_clusters_out_dir, &all_features, &logger)
            }
            OrthologySource::OrthoMcl(dir) => {
                ortholog_summary::from_orthomcl(dir, &args.alignment_type, &gene_clusters_out_dir, &all_features, &logger)
            }
            OrthologySource::Rbh(dir) => {
                ortholog_summary::from_rbh(dir, &args.alignment_type, &gene_clusters_out_dir, &all_features, &logger)
            }
        };

        // Write cluster dist per genome
        let cluster_dist_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.cluster_dist_per_genome.txt", &args.alignment_type, method_label));
        ortholog_summary::write_cluster_dist_per_genome(&clusters_and_unique, &cluster_dist_path, &logger);

        // barchart of orthologs
        ortholog_summary_plot::write_cluster_dist_stats_and_plot(&cluster_dist_path, &gene_clusters_out_dir, &logger);

    }

    if args.synima_step.contains(&SynimaStep::Tree) {
        logger.information("────────────────────");
        logger.information("Running Step 5: tree");
        logger.information("────────────────────");

        // make output directory
        mkdir(&tree_out_dir, &logger, "main (tree)");

        // Save clusters
        let source = ortholog_summary::detect_orthology_source(preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
        let method_label = source.method_label();

        //let cluster_dist_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.cluster_dist_per_genome.txt", &args.alignment_type, method_label));
        let clusters_and_unique_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.clusters_and_uniques", args.alignment_type, method_label));
        if !clusters_and_unique_path.is_file() {
            logger.error(&format!("Tree step requires {}. Run --synima_step ortholog-summary first.", clusters_and_unique_path.display()));
            std::process::exit(1);
        }
        let (cluster_to_genes, genomes_parsed) = dagchainer::save_gene_ids_from_ortholog_file(&clusters_and_unique_path, &logger);

        // make MALIGN output directory
        let malign = PathBuf::from(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.clusters_and_uniques.MALIGN_DIR", args.alignment_type, method_label));
        let malign_outdir = tree_out_dir.join(malign);
        mkdir(&malign_outdir, &logger, "main (tree)");

        // Load genes
        let all_fasta = read_fasta::read_fasta(&combined_fasta_path, &logger);
        let mut pep_by_id: HashMap<String, String> = HashMap::new();
        for rec in all_fasta {
            pep_by_id.insert(rec.id.clone(), rec.seq.clone());
        }

        // Write MALIGN cds/pep files
        tree::write_malign_files(&cluster_to_genes, &args.alignment_type, &pep_by_id, &malign_outdir, &genomes_parsed, &logger);

        // Run MUSCLE on all cluster pep files, in parallel
        let muscle_path = external_tools::find_executable("muscle", &bin_dir, &logger);
        tree::run_muscle_on_clusters(&malign_outdir, &muscle_path, &args, &logger);

        // Concatenate into a single fasta and build a tree
        let concat_out_path = tree_out_dir.join(format!("SC_core_concat.{}.{}.mfa", args.alignment_type, method_label));
        let alignment_suffix = format!(".{}.mfa", &args.alignment_type);
        tree::concatenate_alignments_and_write(&malign_outdir, &genomes_parsed, &alignment_suffix, &concat_out_path, &logger);
        logger.information(&format!("Concatenated core single-copy alignment written to {}", concat_out_path.display()));
        let fasttree_path = external_tools::find_executable("fasttree", &bin_dir, &logger);
        let is_nt = args.alignment_type == "cds";
        tree::run_fasttree_on_alignment(&fasttree_path, &concat_out_path, is_nt, &logger);

    }

    if args.synima_step.contains(&SynimaStep::Dagchainer) {
        logger.information("──────────────────────────");
        logger.information("Running Step 6: dagchainer");
        logger.information("──────────────────────────");

        // make output directory
        mkdir(&dagchainer_out_dir, &logger, "dagchainer");
        let dagchainer_out_subdir = dagchainer_out_dir.join("pairwise_comparisons");
        mkdir(&dagchainer_out_subdir, &logger, "dagchainer");

        // Save clusters
        let source = ortholog_summary::detect_orthology_source(preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
        let method_label = source.method_label();

        //let cluster_dist_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.cluster_dist_per_genome.txt", &args.alignment_type, method_label));
        let clusters_and_unique_path = gene_clusters_out_dir.join(format!("GENE_CLUSTERS_SUMMARIES.{}.{}.clusters_and_uniques", args.alignment_type, method_label));
        if !clusters_and_unique_path.is_file() {
            logger.error(&format!("Dagchainer step requires {}. Run --synima_step ortholog-summary first.", clusters_and_unique_path.display()));
            std::process::exit(1);
        }
        let (cluster_to_genes, genomes_parsed) = dagchainer::save_gene_ids_from_ortholog_file(&clusters_and_unique_path, &logger);

        // Save genome_pair_to_gene_pairs{genome_A}{genome_B} = [
        //    [ "CA1280:7000010362857299", "CNB2:7000010424362572" ],
        //    [ "CA1280:...", "IND107:..." ],
        //    ...
        //    ]
        let genome_pair_to_gene_pairs = dagchainer::process_orthocluster_results_into_hit_pairs(&cluster_to_genes, &logger);

        // Save genome paths from repo
        let genome_paths = dagchainer::save_genome_paths_for_dagchainer(&repo, &logger);

        // DAGchainer wrapper scripts
        let dagchainer_wrapper = bin_dir.join("../run_DAG_chainer.pl");
        let dagchainer_wrapper2 = bin_dir.join("../dagchainer_to_chain_spans.pl");

        let dagchainer_cmds = dagchainer::write_dagchainer_conf_file(
            &dagchainer_out_subdir,
            &dagchainer_wrapper,
            &genomes_parsed,
            &genome_paths,
            &genome_pair_to_gene_pairs,
            "-v n", // not verbose
            args.dagchainer_chains,
            &logger,
        );

        // Run DAGchainer commands in parallel
        let total_threads = args.threads.max(1);

        logger.information(&format!("dagchainer: running {} DAGchainer jobs in parallel (rayon threads = {})", dagchainer_cmds.len(), total_threads));

        rayon::ThreadPoolBuilder::new()
            .num_threads(total_threads)
            .build()
            .expect("dagchainer: failed to build Rayon thread pool")
            .install(|| {
                dagchainer_cmds.par_iter().for_each(|cmd| {
                    util::run_shell_cmd(cmd, &logger, "dagchainer");
                });});

        // Concatenate
        dagchainer::concatenate_aligncoords_and_make_spans(&dagchainer_out_subdir, &dagchainer_out_dir, Path::new(repo_spec_file), &dagchainer_wrapper2, &logger);
    }

    if args.synima_step.contains(&SynimaStep::Synima) {
        logger.information("──────────────────────────");
        logger.information("Running Step 7: synima");
        logger.information("──────────────────────────");

        // make output directory and web template
        mkdir(&synima_out_dir, &logger, "synima");
        synima::copy_web_template(&synima_out_dir)?;
        let index_path = synima_out_dir.join("index.html");

        // update orthologs
        let params = OrthoParams {
            aligner: args.aligner.clone(),
            max_target_seqs: args.max_target_seqs,
            diamond_sensitivity: args.diamond_sensitivity.clone(),
            evalue: args.evalue.clone(),
            dagchainer_chains: args.dagchainer_chains,
            genetic_code: args.genetic_code,
        };
        synima::process_ortholog_summaries(&gene_clusters_out_dir, &index_path, params)?;

        // update tree
        if tree_out_dir.is_dir() {
            synima::process_tree_files(&tree_out_dir, &index_path)?;
        }

        // update methods
        let tools = external_tools::build_tools_vector(&args, preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
        let citations = external_tools::build_citations_vector(&args, preferred_method);
        let json = serde_json::to_string(&MethodsData { tools, citations })?;
        synima::inject_json_into_html(&index_path, "data-methods", &json)?;

        // Determine the genome order from the tree
        let source = ortholog_summary::detect_orthology_source(preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
        let method_label = source.method_label();
        let tree_file = tree_out_dir.join(format!("SC_core_concat.{}.{}.mfa.tree", args.alignment_type, method_label));
        let newick = fs::read_to_string(tree_file)?;
        let leaf_order = tree::extract_leaf_order_from_newick(&newick);

        // synteny plot
        let aligncoords_text = std::fs::read_to_string(&combined_aligncoords).unwrap_or_else(|_| String::new());
        let aligncoords_spans_text = std::fs::read_to_string(&combined_spans).unwrap_or_else(|_| String::new());
        let synteny_config = synima::build_synteny_config(&repo, &leaf_order, &aligncoords_spans_text, &logger)?;

        let json = serde_json::json!({
            "synteny_config": synteny_config,
            "aligncoords": aligncoords_text,
            "aligncoords_spans": aligncoords_spans_text
        });

        synima::inject_json_into_html(
            &index_path,
            "data-synteny",
            &serde_json::to_string(&json)?
        )?;

    }

    logger.information("Synima: All requested steps completed.");
    Ok(())
}

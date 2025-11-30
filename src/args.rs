use crate::Logger;

use clap::{Parser, ValueEnum};
//use num_cpus;

// setting up the command line parameters
#[derive(Parser, Debug)]
#[command(name = "Synima")]
#[command(version = "2.0")]
#[command(about = "Synima (Synteny Imager) is an orthology prediction pipeline and synteny viewer.", long_about = None)]

pub struct Args {

    #[arg(
        short='w',
        long="genbank_accessions",
        help="Comma separated NCBI accessions",
        required_unless_present="repo_spec",
        conflicts_with="repo_spec"
    )]
    pub genbank_accessions: Option<String>,

    #[arg(
        short='r', 
        long="repo_spec",
        help = r#"Repository specification file describing all genomes to be compared.

            Format (whitespace or tab-separated):
            <name>    <type>    <location>

            Where:
            <name> = Genome identifier (e.g., CNB2)
            <type> = One of: dir, genome, gff, cds (optional), pep (optional)
            <location> = Either a full path, or a filename relative to a preceding 'dir' entry for the same genome

            E.g.,:
            CNB2    dir     /data/genomes/CNB2
            CNB2    genome  genome.fa
            CNB2    gff     annotation.gff

            Cryp_gatt_IND107_V2    genome  /data/genomes/IND107/genome.fa
            Cryp_gatt_IND107_V2    gff     /data/genomes/IND107/annotation.gff
            Cryp_gatt_IND107_V2    cds     /data/genomes/IND107/cds.fa
            Cryp_gatt_IND107_V2    pep     /data/genomes/IND107/pep.fa
            "#,
            required_unless_present="genbank_accessions",
            conflicts_with="genbank_accessions"
        )]
        pub repo_spec: Option<String>, 

    /// Pipeline steps to run (comma separated). See possible values below.
    /// Example:
    ///   --synima_step create-repo-db,blast-grid,blast-to-orthofinder
    #[arg(
        short = 's',
        long = "synima_step",
        value_enum,
        value_delimiter = ',',
        default_values = [
            "download-from-ncbi",
            "create-repo-db",
            "blast-grid",
            "blast-to-orthomcl",
            "ortholog-summary",
            "tree",
            "dagchainer",
            "synima"
        ],
        long_help = "Run one or more Synima pipeline steps in order. \
                     Accepts a comma separated list."
    )]
    pub synima_step: Vec<SynimaStep>,

    /// Type of sequence to use for alignment: either "pep" (protein) or "cds" (nucleotide) [default: pep]
    #[arg(short = 'a', long = "alignment_type", default_value = "pep", value_parser = ["pep", "cds"])]
    pub alignment_type: String,

    /// Match threshold between GFF and CDS/PEP FASTA specified in Repo
    #[arg(long, default_value = "90")]
    pub match_threshold: u8,

    /// Aligner to use for Step 2 all-vs-all
    /// Options: auto, diamond, blastplus, legacy
    #[arg(long = "aligner", default_value = "diamond")]
    pub aligner: String,

    /// Max targets per query for diamond or BLAST
    #[arg(long = "max_target_seqs", default_value_t = 250)]
    pub max_target_seqs: usize,

    /// DIAMOND sensitivity preset (empty for default; examples: "fast", "sensitive", "very-sensitive")
    #[arg(long = "diamond_sensitivity", default_value = "fast")]
    pub diamond_sensitivity: String,

    /// BLAST e-value cutoff (default: 1e-10)
    #[arg(short = 'e', long, default_value = "1e-10")]
    pub evalue: String,

    /// Number of DAGchainer chains
    #[arg(long = "dagchainer_chains", default_value_t = 4)]
    pub dagchainer_chains: usize,

    /// 1. The Standard Code
    /// 2. The Vertebrate Mitochondrial Code
    /// 3. The Yeast Mitochondrial Code
    /// 4. The Mold, Protozoan, and Coelenterate Mitochondrial Code and the Mycoplasma/Spiroplasma Code
    /// 5. The Invertebrate Mitochondrial Code
    /// 6. The Ciliate, Dasycladacean and Hexamita Nuclear Code
    /// 9. The Echinoderm and Flatworm Mitochondrial Code
    /// 10. The Euplotid Nuclear Code
    /// 11. The Bacterial, Archaeal and Plant Plastid Code
    /// 12. The Alternative Yeast Nuclear Code
    #[arg(short = 'g', long, default_value_t = 1)]
    pub genetic_code: usize,

    #[arg(short = 't', long, default_value = "8")]
    pub threads: usize,

    /// Output directory 
    #[arg(short='o', long="output_dir", default_value="synima_output")]
    pub output_dir: String,

}

/// Steps of the Synima pipeline, in execution order.
/// Only one of the 'blast_to_*' options (3a/3b/3c) should be used in a given run.
#[derive(Debug, Clone, ValueEnum, PartialEq, Eq)]
#[clap(rename_all = "kebab-case")]
pub enum SynimaStep {

    #[value(
        name = "download-from-ncbi",
        alias = "download-ncbi",
        alias = "ncbi",
        help = "Download genome FASTA and GFF from NCBI and write a repo spec"
    )]
    DownloadFromNcbi,

    #[value(name = "create-repo", alias = "create-repo-db", help = "Parse repo spec, validate GFF and FASTA, and write parsed .pep/.cds files")]
    CreateRepoDb,

    #[value(name = "align-all", alias = "blast-grid", help = "Run all-vs-all BLAST on parsed sequences and write tabular results")]
    BlastGrid,

    #[value(name = "orthofinder", alias = "blast-to-orthofinder", help = "Rewrite FASTA and BLAST to OrthoFinder format, run OrthoFinder")]
    BlastToOrthofinder,

    #[value(name = "orthomcl", alias = "blast-to-orthomcl", help = "Format BLAST output for use with OrthoMCL, run OrthoMCL")]
    BlastToOrthomcl,

    /// Step 3b: Format BLAST output for use with a Reciprocal Best Hit (RBH) pipeline.
    #[value(name = "rbh", alias = "blast-to-rbh", help = "Format BLAST output to use with a Reciprocal Best Hit (RBH) pipeline")]
    BlastToRbh,

    #[value(name = "ortholog-summary", help = "Collect Orthogroups.tsv and produce orthology summaries")]
    OrthologSummary,

    #[value(name = "tree", help = "Construct a phylogenetic tree with FastTree")]
    Tree,

    #[value(name = "dagchainer", help = "Run DAGChainer to call synteny blocks")]
    Dagchainer,

    #[value(name = "synima", help = "Generate Synima plots from orthology and synteny results")]
    Synima,
}

/// Validate that steps are in logical pipeline order,
/// and that at most one orthology method is selected.
pub fn validate_step_sequence(steps: &[SynimaStep], logger: &Logger) {
    use SynimaStep::*;

    if steps.is_empty() {
        logger.error("No pipeline steps selected via --synima_step.");
        std::process::exit(1);
    }

    // 1. Orthology-step mutual exclusivity (for now)
    let orthology_steps = [BlastToOrthomcl, BlastToRbh, BlastToOrthofinder];

    let selected_orthology_steps: Vec<_> = steps
        .iter()
        .filter(|s| orthology_steps.contains(s))
        .collect();

    if selected_orthology_steps.len() > 1 {
        logger.error(
            "Only one of blast-to-orthomcl, blast-to-rbh, or blast-to-orthofinder \
             may be used at a time in a single run.",
        );
        std::process::exit(1);
    }

    // 2. Canonical pipeline order, including Tree
    let pipeline_order = [
        DownloadFromNcbi,
        CreateRepoDb,
        BlastGrid,
        BlastToOrthomcl,
        BlastToRbh,
        BlastToOrthofinder,
        OrthologSummary,
        Tree,
        Dagchainer,
        Synima,
    ];

    let index_of = |step: &SynimaStep| -> usize {
        pipeline_order
            .iter()
            .position(|s| s == step)
            .unwrap_or_else(|| {
                logger.error(&format!("Internal error: step {:?} not found in pipeline_order.", step));
                std::process::exit(1);
            })
    };

    // Enforce non-decreasing indices
    let mut last_idx = 0usize;
    for step in steps {
        let idx = index_of(step);
        if idx < last_idx {
            logger.error(&format!(
                "Step {:?} appears out of order in --synima_step. \
                 The allowed order is: create-repo-db -> blast-grid -> \
                 blast-to-(orthofinder|orthomcl|rbh) -> ortholog-summary -> \
                 tree -> dagchainer -> synima.",
                step
            ));
            std::process::exit(1);
        }
        last_idx = idx;
    }

    // 3. Optional “sanity” warning for Tree without ortholog-summary
    let has_tree = steps.contains(&Tree);
    let has_orthosummary = steps.contains(&OrthologSummary);

    if has_tree && !has_orthosummary {
        logger.warning(
            "Tree step selected without ortholog-summary. \
             Tree step will probably fail because it expects orthology summaries.",
        );
    }
}

/// Validate logical compatibility between aligner and alignment_type.
/// Abort with clear error messages when combinations are unsupported.
pub fn validate_alignment_compatibility(args: &Args, logger: &Logger) {
    let aligner = args.aligner.as_str();
    let alignment_type = args.alignment_type.as_str();

    match (aligner, alignment_type) {
        ("diamond", "cds") => {
            logger.error(
                "Invalid configuration: DIAMOND does not support CDS searches. \
                 Use --alignment-type pep or select --aligner blastplus/blastlegacy when using CDS.",);
            std::process::exit(1);
        }
        _ => {}
    }
}
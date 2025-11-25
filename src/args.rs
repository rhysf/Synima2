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
            "#)]
        pub repo_spec: String, 

    /// Pipeline steps to run (comma separated). See possible values below.
    ///
    /// Example:
    ///   --synima_step create-repo-db,blast-grid,blast-to-orthofinder
    #[arg(
        short = 's',
        long = "synima_step",
        value_enum,
        value_delimiter = ',',
        default_values = [
            "create-repo-db",
            "blast-grid",
            "blast-to-orthofinder",
            "ortholog-summary",
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

    #[arg(short = 't', long, default_value = "4")]
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
    #[value(name = "create-repo-db", help = "Parse repo spec, validate GFF and FASTA, and write parsed .pep/.cds files")]
    CreateRepoDb,

    #[value(name = "blast-grid", help = "Run all-vs-all BLAST on parsed sequences and write tabular results")]
    BlastGrid,

    #[value(name = "blast-to-orthofinder", help = "Rewrite FASTA and BLAST to OrthoFinder format, run OrthoFinder")]
    BlastToOrthofinder,

    #[value(name = "blast-to-orthomcl", help = "Format BLAST output for use with OrthoMCL, run OrthoMCL")]
    BlastToOrthomcl,

    /// Step 3b: Format BLAST output for use with a Reciprocal Best Hit (RBH) pipeline.
    #[value(name = "blast-to-rbh", help = "Format BLAST output to use with a Reciprocal Best Hit (RBH) pipeline")]
    BlastToRbh,

    #[value(name = "ortholog-summary", help = "Collect Orthogroups.tsv and produce orthology summaries")]
    OrthologSummary,

    #[value(name = "dagchainer", help = "Run DAGChainer to call synteny blocks")]
    Dagchainer,

    #[value(name = "synima", help = "Generate Synima plots from orthology and synteny results")]
    Synima,
}


/// Validate that steps are sequential and mutually exclusive where needed
pub fn validate_step_sequence(steps: &[SynimaStep], logger: &Logger) {
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
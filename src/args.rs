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

    /// Step(s) of the Synima pipeline to run (comma-separated).
    /// e.g., --synima_step create_repo_db,blast_grid,blast_to_orthomcl
    #[arg(short = 's', long = "synima_step", value_delimiter = ',', default_value = "create-repo-db,blast-grid,blast-to-orthomcl,ortholog-summary,dagchainer,synima")]
    pub synima_step: Vec<SynimaStep>,

    /// Type of sequence to use for alignment: either "pep" (protein) or "cds" (nucleotide) [default: pep]
    #[arg(short = 'a', long = "alignment_type", default_value = "pep", value_parser = ["pep", "cds"])]
    pub alignment_type: String,

    /// Match threshold between GFF and CDS/PEP FASTA specified in Repo
    #[arg(long, default_value = "90")]
    pub match_threshold: u8,

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
pub enum SynimaStep {
    /// Step 1: Create full sequence databases for all genomes defined in the repo spec.
    CreateRepoDb,

    /// Step 2: Perform an all-vs-all BLAST using a grid-based approach.
    BlastGrid,

    /// Step 3a: Format BLAST output for use with OrthoMCL.
    BlastToOrthomcl,

    /// Step 3b: Format BLAST output for use with a Reciprocal Best Hit (RBH) pipeline.
    BlastToRbh,

    /// Step 3c: Format BLAST output for use with OrthoFinder.
    BlastToOrthofinder,

    /// Step 4: Summarize ortholog predictions into a unified cluster file.
    OrthologSummary,

    /// Step 5: Run DAGchainer on gene clusters to identify syntenic blocks.
    Dagchainer,

    /// Step 6: Generate synteny alignment visualizations with Synima.
    Synima,
}
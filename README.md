<p align="center">
<img src="https://github.com/rhysf/Synima/blob/master/resources/logo2.png?raw=true" width="200" height="200" />
</p>

## Introduction

Synima (Synteny Imager) is an orthology prediction pipeline and synteny viewer. The key features are:

* Orthologous genes are infered by either reciprocal best hits (RBH) from BLAST, OrthoMCL or Orthofinder. 
* Synteny is determined using DAGchainer and plotted using R
* All prerequisite programs are bundled with Synima
* Synima 2 is a complete re-write in rust, which has a range of improvements, including:
	- All steps are now taken by default in a single command
	- Output files are ordered in a more intuitive way
	- CDS/PEP files are optional in the repo spec and the repo spec is a simpler layout. 
	- If CDS/PEP are included and ID's do not match the GFF, Synima will extract the genes from the GFF. Updated logic for automatically identifying the IDs that match the CDS/PEP and GFF

## Documentation

All documentation for Synima can be found at https://github.com/rhysf/Synima2

## Support

For issues, questions, comments or feature requests, please check or post to the issues tab on github: https://github.com/rhysf/Synima2/issues

## Version / History

* 20th Nov 2025 - Initial, albeit incomplete version

## Prerequisites

To build and run Synima2, you’ll need:

- [Rust](https://www.rust-lang.org/tools/install) (stable, installed via `rustup`).  
  - Verify install with:  
    ```bash
    rustc --version
    cargo --version
    ```
    
---

## Installation
Clone the repo and install with Cargo:

```bash
git clone https://github.com/rhysf/Synima.git
cd Synima
cargo install --path .
```

If you installed Rust with rustup, ~/.cargo/bin is normally already in your $PATH.
If not, you can add it:

```bash
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

You can now run:

```bash
Synima --help
```

Alternative (manual install): If you prefer to place the binary in ~/.local/bin

```bash
cargo build --release
cp target/release/phylorust ~/.local/bin/
```

## Prerequisites

* Perl
* Bio-Perl
* Python
* R
* (optional) Legacy-BLAST or BLAST+ in $PATH

## Getting started / examples

Synima -r examples/repo_spec.txt

## Description of the pipeline (Creating a sequence database)

* Synima visualises the output files from DAGChainer (aligncoords and aligncoords.spans files), which are tab delimited text files detailing the coordinates of sub-genomic regions of 
synteny between two or more genomes. 
* Having cloned a local copy of all the code using git clone, and navigated to the examples sub-folder, the first step is to create a 'repo sequence database'. 
* Create_full_repo_sequence_databases.pl reads in a Repository specification file (example Repo_spec file provided in examples) and outputs two fasta files 
(Repo_spec.txt.all.cds and Repo_spec.txt.all.pep) which are merged from 
each of the genome folders and used later.
* This first step is the most tricky - requiring that IDs in the GFF match the FASTA files. Warnings will alert the user to what ID's are being matched, and how many are matching. This step may need to be re-run until the correct settings or formatted files have been used.

The Input Repo_spec files take the format of:

    CNB2    dir     CNB2/
    CNB2    genome  CNB2.genome.fa
    CNB2    gff     CNB2_FINAL_CALLGENES_1.annotation.gff3

    IND107  dir     Cryp_gatt_IND107_V2/
    IND107  genome  Cryp_gatt_IND107_V2.genome.fa
    IND107  gff     Cryp_gatt_IND107_V2_FINAL_CALLGENES_1.annotation.gff3
    IND107  pep     Cryp_gatt_IND107_V2_FINAL_CALLGENES_1.annotation.pep

    CA1280  dir     Cryp_gatt_CA1280_V1/
    CA1280  genome  Cryp_gatt_CA1280_V1.genome.fa
    CA1280  gff     Cryp_gatt_CA1280_V1_FINAL_CALLGENES_1.annotation.gff3

## Description of the pipeline (Predicting orthologous genes)

* With the sequence database made, the second step is to run all vs all BLAST hits using Blast_grid_all_vs_all.pl.

* Peptide or nucleotide alignments are possible, although peptide is generally recommended.

* BLAST searches can take a long time (especially with many genomes, or many predicted gene or proteins. Therefore, the option of distributing jobs 
to a cluster via LSF, SGE and UGE is provided (if available). 

* This step will create folders in each of the genome folders called RBH_blast_[PEP/CDS]. This 
step requires BLAST+ (makeblastdb and blastn/p) or BLAST legacy (formatdb and blastall) 
to be in $PATH.

* Next run either OrthoMCL, ORthofinder or reciprocal best hits (RBH) on the BLAST output 
using Blast_all_vs_all_repo_to_OrthoMCL.pl, Blast_all_vs_all_repo_to_Orthofinder.pl or Blast_all_vs_all_repo_to_RBH.pl,
respectively. 

* This will create an OMCL_outdir or RBH_outdir, containing all_orthomcl.out or PEP.RBH.OrthoClusters. 

* RBH will likely be less accurate than OrthoMCL or Orthofinder, but OrthoMCL at least has a limited number of genomes/genes that can be compared 
due to memory constraints.

* Next, summarise the OrthoMCL output (OMCL_outdir/all_orthomcl.out), 
or RBH output (RBH_outdir/PEP.RBH.OrthoClusters) or Orthofinder output (Orthofinder_outdir/
Orthogroups.csv) using Orthologs_to_summary.pl. 

* This step will create ortholog predictions in the output folders GENE_CLUSTERS_SUMMARIES.OMCL or 
GENE_CLUSTERS_SUMMARIES.RBH or GENE_CLUSTERS_SUMMARIES.Orthofinder respectively.

* The output of this step will also include some summary plots of the orthologs identified, and useful files for phylogenetics etc.

## Description of the pipeline (Visualising synteny)

* Run DAGChainer on the ortholog summary using DAGchainer_from_gene_clusters.pl.

* The final step is to run SynIma.pl on the aligncoords and aligncoords.spans output from DAGChainer. 

## Description of the pipeline (refining synteny plot)

* Once you have identified orthologs with the previous steps 1-5, you can re-run 
only this step with updated parameters to generate new figures. 

* If Synima finds the config.txt file (generated from the first time run, and in the same folder as
the figure, by default SynIma-output/config.txt), it will run using the parameters 
specified in this file (rather than use any updated parameters on the command 
line). 

* Config.txt includes a number of parameters that can change the appearance or layout
of the figure. It is recommended plotting both chromosome/contig synteny (c) and gene synteny (g)
separately, as either can give greater clarity depending on the input. 

* By default, synteny is shown as a partially transparent (alpha factor 0.5) azure4, although this can be changed to 
any other R color (E.g. http://www.stat.columbia.edu/~tzheng/files/Rcolor.pdf). Due to the 
color transparency, overlapping synteny will appear shaded. 

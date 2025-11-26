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
- Python3 (used only for the OrthoFinder step: Note, OrthoMCL and RBH do not require Python)

  Synima2 ships with its own Python site-packages for OrthoFinder under
  `orthofinder_runtime/<platform>/lib/python3.X/site-packages`.  
  You only need a system Python whose major.minor matches the runtime that is
  bundled for your platform:

  - macOS arm64 and x86_64: Python **3.11** on `PATH`
  - Linux x86_64: Python **3.12** on `PATH`

  The bundled `bin/<platform>/orthofinder` wrapper will check this and print an
  error if the version does not match.  
  If you install a different Python version and want to use that instead, you
  will need to rebuild the corresponding `orthofinder_runtime/<platform>` tree.

- R

  Required for the plotting / downstream visualisation steps.

- Optional dependencies

  - Perl with modules `File::Basename` and `Bio::SearchIO`  
    Only needed if you want to run the OrthoMCL pipeline.

  - External aligners and search tools (BLAST, DIAMOND, etc.)

    Synima2 bundles several binaries under `bin/<platform>` and will try those
    first. If a bundled binary is not available or fails, Synima2 falls back to
    tools found on `PATH`. You may therefore want to ensure at least one of the
    following is available on your system:

    - BLAST+ or legacy BLAST (for `--aligner blastplus` or `--aligner blastlegacy`)
    - DIAMOND (for `--aligner diamond`)
    - MAFFT, FastTree, MCL, etc, if you plan to run OrthoFinder outside of the
      bundled setup or extend the workflow
    
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

## Getting started / examples

Synima -r examples/repo_spec.txt

## Pipeline overview

Synima2 takes annotated genomes, calls orthologous genes, and then visualises synteny blocks between genomes.

The high level stages are:
	1.	Prepare a repository of genomes and parsed feature FASTA files.
	2.	Run an all vs all sequence search (BLAST or DIAMOND).
	3.	Infer orthologous groups with OrthoFinder, OrthoMCL, or an RBH pipeline, and summarise them.
	4.	Run DAGChainer on the orthologs to call synteny blocks and generate Synima plots.

All of these stages can be run using: Synima -r Repo_spec.txt -s <step-name> or Synima -r Repo_spec.txt -s <step-name1>,<step-name2>,...

## Preparing the repository

Synima2 works from a repository specification file that tells it where each genome and its annotations live.

Example Repo_spec.txt:

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

Each genome is given a short code (first column) and one or more entries that define:

	•	dir - directory containing that genome
	•	genome - genomic FASTA
	•	gff - annotation in GFF3 format
	•	optional pep or cds FASTA files if you already have them

Run the repository preparation step:

Synima -r Repo_spec.txt -s create-repo

This will:
	•	read and validate the repo spec
	•	match features in the GFF to the genome FASTA
	•	extract and write parsed .pep and/or .cds FASTA files in a standard layout

Getting this step correct is the most important part of the pipeline. The tool will log which GFF attributes are used for matching, how many genes are successfully mapped, and will warn about any missing or mismatched IDs. You can fix the input GFF or FASTA, or adjust the repo spec, and rerun create-repo until the parsing statistics look sane.

## Orthology inference and summary

Once the parsed FASTA files exist, run an all vs all sequence search:

Synima -r Repo_spec.txt -s align-all

This step:
	•	chooses the appropriate aligner based on --aligner (BLAST+, legacy BLAST, or DIAMOND) and --alignment-type (pep or cds)
	•	builds per species databases
	•	runs all vs all searches and writes tabular output (.out) for each genome pair

For peptide data DIAMOND or BLASTP are recommended. For nucleotide data BLASTN is used.

Next, choose an orthology method:

# OrthoFinder (default and recommended for many genomes)
Synima -r Repo_spec.txt -s orthofinder

# OrthoMCL
Synima -r Repo_spec.txt -s orthomcl

# Reciprocal best hits
Synima -r Repo_spec.txt -s rbh

These steps:
	•	reformat the all vs all search output as needed for the chosen method
	•	run OrthoFinder, OrthoMCL, or the RBH pipeline
	•	write orthology results into method specific output folders

Next, summarise orthologs into a common format used by the downstream synteny and plotting steps:

Synima -r Repo_spec.txt -s ortholog-summary

The ortholog-summary step will:
	•	detect which orthology output is present (OrthoFinder first, then OrthoMCL, then RBH)
	•	parse the corresponding orthogroup or cluster files
	•	produce a set of summary tables and basic plots in a GENE_CLUSTERS_SUMMARIES.* output directory, suitable for phylogenetic and synteny analysis

Finally, identify chains of orthologs using dagchainer

Synima -r Repo_spec.txt -s dagchainer

The output from dachainer will then be used to generate the final visualisations.

## Visualising synteny

* The final step is to run SynIma.pl on the aligncoords and aligncoords.spans output from DAGChainer. 

## Refining synteny plot

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

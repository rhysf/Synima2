<p align="center">
<img src="https://github.com/rhysf/Synima2/blob/main/src/web-template/assets/logo.png" height="125" />
</p>

## Introduction

Synima (Synteny Imager) is an orthology prediction pipeline and synteny viewer. The key features are:

* Orthologous genes are infered by either reciprocal best hits (RBH) from BLAST, OrthoMCL or Orthofinder. 
* Synteny is determined using DAGchainer and plotted using Javascript.
* All prerequisite programs are bundled with Synima
* Synima 2 is a complete re-write in rust, which has a range of improvements, including:
	- All steps are now taken by default in a single command
  - New command (-w) to download and run on genbank accessions (separated by comma) of annotated genome assemblies
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

To build and run Synima2, you’ll only need Rust installed:

- [Rust](https://www.rust-lang.org/tools/install) (stable, installed via `rustup`).  
  - Verify install with:  
    ```bash
    rustc --version
    cargo --version
    ```

- Optional dependencies

  - Perl with modules `File::Basename` and `Bio::SearchIO`  
    Only needed if you want to run the OrthoMCL pipeline.

  - Python3 (Only if OrthoFinder used)

  - R (Required for the plotting files outside of main synima output page).

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

## Pipeline overview

Synima2 takes annotated genomes, calls orthologous genes, and then visualises synteny blocks between genomes.

The high level stages are:
	1.	Prepare a repository of genomes and parsed feature FASTA files.
	2.	Run an all vs all sequence search (BLAST or DIAMOND).
	3.	Infer orthologous groups with OrthoFinder, OrthoMCL, or an RBH pipeline, and summarise them.
	4.	Run DAGChainer on the orthologs to call synteny blocks and generate Synima plots.

All of these stages can be run using: Synima -r Repo_spec.txt -s <step-name> or Synima -r Repo_spec.txt -s <step-name1>,<step-name2>,...

## Getting started / example 1 (human, bonobo, chimp, gorilla, gibbon and orangutan)

Synima -w GCA_000001405.29,GCA_029281585.3,GCA_028858775.3,GCA_029289425.3,GCA_028885655.3,GCA_009828535.3

## Getting started / examples 2 (local files)

Synima -r examples/repo_spec.txt

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

To run only the repository preparation step:

```
Synima -r Repo_spec.txt -s create-repo
```

This will:
	•	read and validate the repo spec
	•	match features in the GFF to the genome FASTA
	•	extract and write parsed .pep and/or .cds FASTA files in a standard layout

## Orthology inference and summary

Once the parsed FASTA files exist, you can run an all vs all sequence search using:

```
Synima -r Repo_spec.txt -s align-all
```

This step:
	•	chooses the appropriate aligner based on --aligner (BLAST+, legacy BLAST, or DIAMOND) and --alignment-type (pep or cds)
	•	builds per species databases
	•	runs all vs all searches and writes tabular output (.out) for each genome pair

For peptide data DIAMOND or BLASTP are recommended. For nucleotide data BLASTN is used.

Next, choose an orthology method:

# OrthoFinder (default and recommended for many genomes)
```
Synima -r Repo_spec.txt -s orthofinder
```

# OrthoMCL
```
Synima -r Repo_spec.txt -s orthomcl
```

# Reciprocal best hits
```
Synima -r Repo_spec.txt -s rbh
```

These steps:
	•	reformat the all vs all search output as needed for the chosen method
	•	run OrthoFinder, OrthoMCL, or the RBH pipeline
	•	write orthology results into method specific output folders

Next, summarise orthologs into a common format used by the downstream synteny and plotting steps:

```
Synima -r Repo_spec.txt -s ortholog-summary
```

The ortholog-summary step will:
	•	detect which orthology output is present (OrthoFinder first, then OrthoMCL, then RBH)
	•	parse the corresponding orthogroup or cluster files
	•	produce a set of summary tables and basic plots in a GENE_CLUSTERS_SUMMARIES.* output directory, suitable for phylogenetic and synteny analysis

Next, identify chains of orthologs using dagchainer

```
Synima -r Repo_spec.txt -s dagchainer
```

The output from dachainer will then be used to generate the final visualisations.

## Visualising synteny

* The final step is to produce the Synima summary page located in synima_step7-synima/Synima.html

```
Synima -r Repo_spec.txt -s synima
```
* The output webpage can be opened in any web browser (Chrome, Firefox etc.).

* There are 5 tabs at the top, which take you different pages (Orthologs, Tree, Synteny, Methods, About).

* The orthologs tab gives details about the methods used to compute orthologs, and a javascript generated stacked barchart, that can be downloaded at SVG or PNG. Note: If R is installed, there will also be an R generated plot in the synima_step4-ortholog-summary/ folder. The R code to generate that plot is also provided.

* The tree tab gives details about how the phylogenetic tree was generated, the tree in newick format, and a tree generated in javascript. Default settings are midpoint rooted. The tree can be downloaded as an external SVG or PNG. There are various options below, which include

  - Increase the height of the tree using the expansion option.
  - Align tip labes (default on)
  - Various graphical options including branch line weight, background colour, taxa label colour, and branch colour.
  - Rooting is midpoint by default. However, "user selection" will remove midpoint rooting. The dropdown menu provides options to root by any of the taxa, and by clicking on a taxa label, this will bring up that taxa in dropdown menu to 'apply'.
  - The font size of the tip labels can be changed, as can the name. By clicking on any taxa and then the 'annotate' button, or by clicking on the 'annotate' button and then clicking on the taxa, will bring up a new box to replace that taxa name.
  - A reset button to reset all user defined changes.

* The synteny tab will show a synteny browser. The main details are:

  -The tree, and all settings used in the tree tab will be generated here, and define the order of genomes and aesthetics of the tree on the right.
  - A hoverover mouse dropdown provides details about any given syntenic block or contig. By clicking on a contig rectangle, an editor box comes up to change the name, colour, or to reverse compliment that contig.
  - Various graphical options are provided below, which include ]
    - Data: plotting the contig synteny (defined by aligncoords.spans) or the gene synteny (higher resolution and defined by aligncoords).
    - Layout and size: the tree width, contig font size, contig box height and contig gap
    - Colours: Options to change the colour of all contigs, including several palettes, the contig outline colour and synteny block colour, the synteny opacity, the background colour and label colour
    - Scale bar: The scale bar can be turned on or off, with options to change the units, the maximum number, the intervals shown, the axis font and label font sizes, the line width, and the label text.
  - Once any graphical changes have been made, a figure can be downloaded as either PNG or SVG of just the synteny, or a PNG or SVG of both the synteny and the tree.

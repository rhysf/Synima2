use crate::Logger;

use std::fs;
use std::io::{Read, Write};
use std::path::{Path}; //, PathBuf
use std::io::{BufRead, BufReader};
use std::collections::HashMap;

use anyhow::{anyhow, Result}; // Context, 
use zip::read::ZipArchive;
use std::io::Cursor;
//use serde::Deserialize;

#[derive(Debug)]
struct AssemblyMapping {
    genbank_to_refseq: std::collections::HashMap<String, String>,
}

/// Download and parse the NCBI RefSeq assembly summary table.
/// URL: https://ftp.ncbi.nlm.nih.gov/genomes/ASSEMBLY_REPORTS/assembly_summary_refseq.txt
fn load_refseq_assembly_mappings(logger: &Logger) -> Result<AssemblyMapping> {

    let url = "https://ftp.ncbi.nlm.nih.gov/genomes/refseq/assembly_summary_refseq.txt";
    //let url = "https://ftp.ncbi.nlm.nih.gov/genomes/ASSEMBLY_REPORTS/assembly_summary_refseq.txt";

    logger.information("Downloading RefSeq assembly summary…");

    let response = ureq::get(url).call().map_err(|e| anyhow!("Failed to fetch assembly summary: {e}"))?;

    if response.status() != 200 {
        return Err(anyhow!("Failed to fetch assembly summary (HTTP {}).", response.status()));
    }

    logger.information("Streaming and parsing RefSeq assembly summary…");

    let reader = BufReader::new(response.into_reader());

    // Save the downloaded file for debugging
    //let debug_path = std::path::Path::new("Synima_assembly_summary.txt");
    //if let Ok(mut debug_file) = std::fs::File::create(debug_path) {
    //    if let Ok(reader_for_debug) = ureq::get(url).call() {
    //        if let Ok(mut stream) = reader_for_debug.into_reader().bytes().collect::<Result<Vec<_>, _>>() {
    //            let _ = debug_file.write_all(&stream);
    //        }
    //    }
    //}

    let mut gb_to_rf = HashMap::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() {
            continue;
        }

        let refseq_acc = parts[0].trim(); // always column 0

        if !refseq_acc.starts_with("GCF_") {
            continue;
        }

        // Find any field starting with GCA_
        let genbank_acc_opt = parts.iter()
            .map(|s| s.trim())
            .find(|s| s.starts_with("GCA_"));

        if let Some(genbank_acc) = genbank_acc_opt {
            gb_to_rf.insert(genbank_acc.to_string(), refseq_acc.to_string());
        }
    }

    logger.information(&format!(
        "Parsed {} GenBank→RefSeq mappings",
        gb_to_rf.len()
    ));

    Ok(AssemblyMapping {
        genbank_to_refseq: gb_to_rf,
    })
}

const FASTA_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id={ID}&rettype=fasta&retmode=text";
const GFF_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id={ID}&rettype=gff&retmode=text";

/// Entry point for Step0
/// Called from main.rs before Step1 (CreateRepoDb)
pub fn run_step0_download_genbank(accessions: &[String], logger: &Logger) -> Result<()> {

    if accessions.is_empty() {
        return Ok(());
    }

    let mappings = load_refseq_assembly_mappings(logger)?;

    let cwd = std::env::current_dir()?;

    for acc in accessions {
        let acc_trim = acc.trim();
        if acc_trim.is_empty() { continue; }

        let out_dir = cwd.join(acc_trim);
        fs::create_dir_all(&out_dir)?;

        logger.information(&format!("run_step0_download_genbank: Downloading data for {}", acc_trim));

        download_from_ncbi(acc_trim, &out_dir, logger, &mappings)?;
    }

    // Write repo spec as before…
    let spec_path = cwd.join("Synima_repo_spec.txt");
    write_repo_spec(accessions, &spec_path)?;
    Ok(())
}

/// Decide whether to use efetch or the Datasets API.
fn download_from_ncbi(accession: &str, out_dir: &Path, logger: &Logger, mappings: &AssemblyMapping) -> Result<()> {
    
    // Case 1: RefSeq directly
    if accession.starts_with("GCF_") {
        logger.information(&format!("download_from_ncbi: {} is RefSeq. Using Datasets API.", accession));
        return download_via_datasets_api(accession, out_dir, logger);
    }

    // Case 2: GenBank assembly, try mapping
    if accession.starts_with("GCA_") {
        logger.information(&format!("download_from_ncbi: {} is GenBank. Checking RefSeq mapping table",accession));

        if let Some(refseq_equiv) = mappings.genbank_to_refseq.get(accession) {
            logger.information(&format!("download_from_ncbi: Found RefSeq counterpart: {} -> {}", accession, refseq_equiv));

            match download_via_datasets_api(refseq_equiv, out_dir, logger) {
                Ok(()) => {
                    logger.information(&format!("download_from_ncbi: Successfully used RefSeq {} for {}", refseq_equiv, accession));
                    return Ok(());
                }
                Err(e) => {
                    logger.warning(&format!("download_from_ncbi: RefSeq {} failed for {}: {:?}", refseq_equiv, accession, e));
                }
            }
        } else {
            logger.warning(&format!("download_from_ncbi: No RefSeq mapping found for {} in assembly summary.", accession));
        }

        // Try naive fallback (same version)
        let naive = accession.replacen("GCA_", "GCF_", 1);
        logger.information(&format!("download_from_ncbi: Trying naive RefSeq: {}", naive));
        if download_via_datasets_api(&naive, out_dir, logger).is_ok() {
            return Ok(());
        }

        // Try original GCA
        logger.information(&format!("download_from_ncbi: Trying original GenBank: {}", accession));
        return download_via_datasets_api(accession, out_dir, logger);
    }

    // Case 3: simple nucleotide accession → efetch
    logger.information(&format!("download_from_ncbi: {} appears to be a single-sequence accession. Using efetch.", accession));
    download_via_efetch(accession, out_dir, logger)
}

/// Simple efetch based downloader for single sequence accessions.
fn download_via_efetch(accession: &str, out_dir: &Path, logger: &Logger) -> Result<()> {

    logger.information(&format!("download_via_efetch: Fetching FASTA for {} via efetch", accession));

    let fasta_url = FASTA_URL.replace("{ID}", accession);
    let gff_url = GFF_URL.replace("{ID}", accession);

    let fasta_text = ureq::get(&fasta_url)
        .call()
        .map_err(|e| anyhow!("FASTA request failed for {}: {}", accession, e))?
        .into_string()
        .map_err(|e| anyhow!("Failed to convert FASTA response for {}: {}", accession, e))?;

    if !fasta_text.starts_with('>') {
        return Err(anyhow!("FASTA download for {} does not look like FASTA", accession));
    }

    fs::write(out_dir.join("genome.fa"), fasta_text)?;

    let gff_text = ureq::get(&gff_url)
        .call()
        .map_err(|e| anyhow!("GFF request failed for {}: {}", accession, e))?
        .into_string()
        .map_err(|e| anyhow!("Failed to convert GFF response for {}: {}", accession, e))?;

    if !gff_text.contains("##gff-version") && !gff_text.contains("\tgene\t") {
        return Err(anyhow!("GFF download for {} does not look like GFF", accession));
    }

    fs::write(out_dir.join("annotation.gff"), gff_text)?;

    Ok(())
}

/// Use NCBI Datasets API for GCA_ / GCF_ assembly accessions.
/// Downloads a zip, extracts all .fna into genome.fa and one .gff into annotation.gff.
fn download_via_datasets_api(accession: &str, out_dir: &Path, logger: &Logger) -> Result<()> {

    logger.information(&format!("Requesting ZIP archive from NCBI Datasets API for {}", accession));

    let url = format!("https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/{}/download?include_annotation_type=GENOME_FASTA,GENOME_GFF", accession);

    let response = ureq::get(&url).call().map_err(|e| anyhow!("Datasets API request failed for {}: {}", accession, e))?;

    let status = response.status();
    if status != 200 {
        let msg = response.into_string().unwrap_or_else(|_| "<no body>".to_string());
        return Err(anyhow!("Datasets API returned status {} for {}: {}", status, accession, msg));
    }

    // Read zip into memory
    let mut zip_bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut zip_bytes)
        .map_err(|e| anyhow!("Failed to read zip response for {}: {}", accession, e))?;

    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| anyhow!("Failed to open zip archive for {}: {}", accession, e))?;

    let fasta_out_path = out_dir.join("genome.fa");
    let gff_out_path = out_dir.join("annotation.gff");

    let mut fasta_out = fs::File::create(&fasta_out_path)
        .map_err(|e| anyhow!("Failed to create {}: {}", fasta_out_path.display(), e))?;
    let mut gff_out = fs::File::create(&gff_out_path)
        .map_err(|e| anyhow!("Failed to create {}: {}", gff_out_path.display(), e))?;

    let mut found_fasta = false;
    let mut found_gff = false;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| anyhow!("Failed to read zip entry {} for {}: {}", i, accession, e))?;
        let name = file.name().to_string();

        // Skip directories
        if file.is_dir() {
            continue;
        }

        // FASTA: accept .fna, .fa, .fasta
        if name.ends_with(".fna") || name.ends_with(".fa") || name.ends_with(".fasta") {
            if found_fasta {
                // Separate chunks with a newline just in case
                writeln!(fasta_out)?;
            }
            std::io::copy(&mut file, &mut fasta_out)
                .map_err(|e| anyhow!("Failed to copy FASTA from {} for {}: {}", name, accession, e))?;
            found_fasta = true;
            continue;
        }

        // GFF: accept .gff or .gff3
        if name.ends_with(".gff") || name.ends_with(".gff3") {
            if found_gff {
                // If more than one GFF appears, append with newline
                writeln!(gff_out)?;
            }
            std::io::copy(&mut file, &mut gff_out)
                .map_err(|e| anyhow!("Failed to copy GFF from {} for {}: {}", name, accession, e))?;
            found_gff = true;
            continue;
        }
    }

    if !found_fasta {
        return Err(anyhow!(
            "Datasets API archive for {} did not contain any FASTA (.fna/.fa/.fasta) files",
            accession
        ));
    }

    if !found_gff {
        return Err(anyhow!(
            "Datasets API archive for {} did not contain any GFF (.gff/.gff3) files",
            accession
        ));
    }

    Ok(())
}

/// Write Synima_repo_spec.txt for the downloaded accessions
fn write_repo_spec(accessions: &[String], spec_path: &Path) -> Result<()> {
    let mut s = String::new();

    for acc in accessions {
        let name = acc.trim();
        if name.is_empty() {
            continue;
        }

        s.push_str(&format!("{name}\tdir\t./{name}\n"));
        s.push_str(&format!("{name}\tgenome\tgenome.fa\n"));
        s.push_str(&format!("{name}\tgff\tannotation.gff\n"));
    }

    let mut f = fs::File::create(spec_path)?;
    f.write_all(s.as_bytes())?;

    Ok(())
}
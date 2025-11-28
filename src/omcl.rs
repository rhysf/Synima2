use crate::Logger;
use crate::util::{open_bufread, open_bufwrite}; //mkdir,open_file_read,open_file_write

use std::path::Path;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::{BufRead, Write};
//use std::process::{Command, Stdio};
use std::path::PathBuf;
use regex::Regex;
use std::process;

// for OMCL
pub fn parse_genome_map_from_gff(gff_path: &Path, logger: &Logger) -> Result<HashSet<String>, String> {

    //let mut trans_id_to_genome = HashMap::new();
    let mut genome_set = HashSet::new();

    logger.information(&format!("parse_id_to_genome_map_from_gff: {}",gff_path.display()));

    // input
    let reader = open_bufread(&gff_path, &logger, "parse_genome_map_from_gff");

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Read error: {}", e))?;
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 9 {
            return Err("parse_id_to_genome_map_from_gff: Corrupt GFF line; expected 9 columns".to_string());
        }

        let attr = fields[8].trim();

        let (genome, _id) = match attr.split_once('|') {
            Some((genome_part, id_part)) => (genome_part.to_string(), id_part.to_string()),
            None => {
                return Err(format!("parse_id_to_genome_map_from_gff: Attribute field missing '|': {}", attr));
            }
        };

        genome_set.insert(genome.clone());
        //trans_id_to_genome.insert(id, genome);
    }

    //Ok((trans_id_to_genome, genome_set))
    Ok(genome_set)
}

pub fn assign_genome_codes<P: AsRef<Path>>(genome_set: &HashSet<String>, output_path: P, logger: &Logger) -> Result<HashMap<String, String>, String> {
    
    let mut genome_to_code = HashMap::new();
    let mut sorted_genomes: Vec<_> = genome_set.iter().cloned().collect();
    sorted_genomes.sort();

    // Output file
    let path = output_path.as_ref();
    let mut file = open_bufwrite(path, logger, "assign_genome_codes");

    for (i, genome) in sorted_genomes.iter().enumerate() {
        let code = format!("G{:03}", i + 1);
        logger.information(&format!("assign_genome_codes: {} -> {}", genome, code));
        genome_to_code.insert(genome.clone(), code.clone());
        writeln!(file, "{}\t{}", genome, code).map_err(|e| format!("Write error: {}", e))?;
    }

    if genome_to_code.is_empty() {
        logger.error("assign_genome_codes: No genome codes assigned");
        std::process::exit(1);
    }

    Ok(genome_to_code)
}

pub fn write_gcoded_m8_and_sort<P: AsRef<Path>>(
    genome_to_code: &HashMap<String, String>,
    m8_input_path: P,
    m8_output_path: P,
    logger: &Logger,
) {

    // input/output
    let input_path = m8_input_path.as_ref();
    let output_path = m8_output_path.as_ref();
    let tmp_path = output_path.with_extension("tmp");
    let reader = open_bufread(&input_path, &logger, "write_gcoded_m8_and_sort");
    let mut writer = open_bufwrite(&tmp_path, &logger, "write_gcoded_m8_and_sort");

    logger.information(&format!("write_gcoded_m8_and_sort: {}", input_path.display()));

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("write_gcoded_m8_and_sort: Error reading m8: {}", e));
                std::process::exit(1);
            }
        };

        let mut fields: Vec<String> = line.split('\t').map(|s| s.to_string()).collect();
        if fields.len() < 12 {
            continue;
        }

        let acc_a = fields[0].clone();
        let acc_b = fields[1].clone();

        // Split field[0] into genome|id
        let (genome_a, gene_id_a) = match acc_a.split_once('|') {
            Some(t) => t,
            None => {
                logger.error(&format!("write_gcoded_m8_and_sort: invalid query ID format: {}", fields[0]));
                continue;
            }
        };

        let (genome_b, gene_id_b) = match acc_b.split_once('|') {
            Some(t) => t,
            None => {
                logger.error(&format!("write_gcoded_m8_and_sort: invalid subject ID format: {}", fields[1]));
                continue;
            }
        };

        // Look up code for genome
        let code_a = match genome_to_code.get(genome_a) {
            Some(c) => c,
            None => {
                logger.error(&format!("write_gcoded_m8_and_sort: missing genome code for {}", genome_a));
                continue;
            }
        };

        let code_b = match genome_to_code.get(genome_b) {
            Some(c) => c,
            None => {
                logger.error(&format!("write_gcoded_m8_and_sort: missing genome code for {}", genome_b));
                continue;
            }
        };

        // Replace with Gcoded format: G001|gene_id
        fields[0] = format!("{}|{}", code_a, gene_id_a);
        fields[1] = format!("{}|{}", code_b, gene_id_b);

        if let Err(e) = writeln!(writer, "{}", fields.join("\t")) {
            logger.error(&format!("write_gcoded_m8_and_sort: write error to {}: {}", tmp_path.display(), e));
            std::process::exit(1);
        }
    }

    drop(writer); // flush temp file

    // Sort: col1 (ID), col12 (bit score) descending
    logger.information("write_gcoded_m8_and_sort: sorting Gcoded m8 file...");

    let tmp_path_str = tmp_path.to_string_lossy();
    let out_path_str = m8_output_path.as_ref().to_string_lossy();
    let sort_cmd = format!("sort -T . -S 2G -k1,1 -k12,12gr {} > {}", tmp_path_str, out_path_str);

    let status = match std::process::Command::new("sh").arg("-c").arg(&sort_cmd).status() {
        Ok(s) => s,
        Err(e) => {
            logger.error(&format!("write_gcoded_m8_and_sort: failed to run sort: {}", e));
            std::process::exit(1);
        }
    };

    if !status.success() {
        logger.error("write_gcoded_m8_and_sort: sort command failed");
        std::process::exit(1);
    }

    std::fs::remove_file(tmp_path).ok();
    logger.information(&format!("write_gcoded_m8_and_sort: Finished with {}", out_path_str));
}

pub fn convert_m8_to_orthomcl_format(
    m8_path: &Path,
    out_prefix: &Path,
    _genome_to_code: &HashMap<String, String>, // kept only to match call-site
    logger: &Logger,
) -> Result<(PathBuf, PathBuf), String> {

    logger.information(&format!("convert_m8_to_orthomcl_format: reading {}", m8_path.display()));

    // Input/Output
    let reader = open_bufread(&m8_path, &logger, "convert_m8_to_orthomcl_format");
    let bpo_path = out_prefix.with_extension("bpo");
    let gg_path = out_prefix.with_extension("gg");
    let mut bpo_writer = open_bufwrite(&bpo_path, &logger, "convert_m8_to_orthomcl_format");
    let mut gg_writer = open_bufwrite(&gg_path, &logger, "convert_m8_to_orthomcl_format");

    // For .gg: genome code -> set of gene IDs
    let mut org_to_accs: HashMap<String, HashSet<String>> = HashMap::new();

    // For deduping m8 rows
    let mut seen: HashSet<String> = HashSet::new();

    let mut sim_counter: u64 = 0;

    //let org_code_len = genome_to_code.values().next().ok_or("convert_m8_to_orthomcl_format: No genome codes available")?.len();

    for (lineno, line_res) in reader.lines().enumerate() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("convert_m8_to_orthomcl_format: error reading m8 at line {} in {}: {}", lineno + 1, m8_path.display(), e));
                std::process::exit(1);
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 12 {
            logger.warning(&format!("convert_m8_to_orthomcl_format: skipping malformed m8 line {} ({} columns)", lineno + 1, fields.len()));
            continue;
        }

        // m8 fields:
        // 0 qseqid, 1 sseqid, 2 pident, 3 length, 10 evalue, 11 bitscore
        let acc_a = fields[0];
        let acc_b = fields[1];
        let aln_len = fields[3];     // numeric
        let evalue = fields[10];     // "1e-50", "0.0", etc
        let bit_score = fields[11];  // numeric

        // Deduplicate exact q/s pairs
        let key = format!("{acc_a}\0{acc_b}");
        if !seen.insert(key) {
            continue;
        }

        // Record genes for .gg (we assume write_gcoded_m8_and_sort has already
        // turned CNB2|id into G00X|id, so "genome code" is the prefix before '|').
        if let Some((gcode, _)) = acc_a.split_once('|') {
            org_to_accs.entry(gcode.to_string()).or_default().insert(acc_a.to_string());
        }
        if let Some((gcode, _)) = acc_b.split_once('|') {
            org_to_accs.entry(gcode.to_string()).or_default().insert(acc_b.to_string());
        }

        sim_counter += 1;

        // Keep all the fields numeric (OrthoMCL expects them to be numeric)
        // id ; q_id ; q_idx ; s_id ; s_idx ; pval ; bitscore ; aln_len
        let bpo_line = format!("{};{};0;{};0;{};{};{}", sim_counter, acc_a, acc_b, evalue, bit_score, aln_len);

        if let Err(e) = writeln!(bpo_writer, "{bpo_line}") {
            logger.error(&format!("convert_m8_to_orthomcl_format: write error to {}: {}", bpo_path.display(), e));
            std::process::exit(1);
        }
    }

    // Write .gg in a deterministic order
    for (org, accs) in org_to_accs {
        let mut genes: Vec<String> = accs.into_iter().collect();
        genes.sort();
        if let Err(e) = writeln!(gg_writer, "{}: {}", org, genes.join(" ")) {
            logger.error(&format!("convert_m8_to_orthomcl_format: write error to {}: {}", gg_path.display(), e));
            std::process::exit(1);
        }
    }

    logger.information(&format!("convert_m8_to_orthomcl_format: OMCL .bpo and .gg written to {}.*", out_prefix.display()));

    Ok((bpo_path, gg_path))
}

pub fn run_orthomcl_clustering<P: AsRef<Path>>(
    orthomcl_script: &Path,
    bpo_path: &Path,
    gg_path: P,
    log_path: &Path,
    logger: &Logger,
) -> Result<(), String> {

    // Convert full paths to filenames for in-place output
    let bpo_file = bpo_path.file_name().ok_or("Invalid BPO file path")?;
    let gg_file = gg_path.as_ref().file_name().ok_or("Invalid GG file path")?;

    logger.information(&format!("run_orthomcl_clustering: {} and {}", bpo_file.to_string_lossy(), gg_file.to_string_lossy()));

    // Build command
    let mut cmd = std::process::Command::new("perl");
    cmd.arg(orthomcl_script)
        .arg("--mode")
        .arg("4")
        .arg("--bpo_file").arg(bpo_file)
        .arg("--gg_file").arg(gg_file);

    let work_dir = bpo_path.parent().ok_or("bpo_path has no parent directory")?;
    cmd.current_dir(work_dir).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());

    // Run and capture output
    let output = cmd.output().map_err(|e| format!("Failed to run OrthoMCL: {}", e))?;

    // Write stdout and stderr to the log
    let mut log_file = File::create(&log_path).map_err(|e| format!("Cannot write log file: {}", e))?;
    let _ = log_file.write_all(&output.stdout);
    let _ = log_file.write_all(&output.stderr);

    //logger.information(&format!("OrthoMCL clustering complete. See log: {}", log_path.as_ref().display()));
    let log_contents = fs::read_to_string(&log_path).unwrap_or_else(|_| "[Unable to read log output]".to_string());
    logger.information(&format!("OrthoMCL output:\n{}", log_contents));

    // read the log output to find location of output, and then move file and delete tmp folder
    let reader = open_bufread(&log_path, &logger, "run_orthomcl_clustering");

    let mut orthomcl_out_path: Option<PathBuf> = None;
    let pattern = Regex::new(r"Final ORTHOMCL Result: (\S+)").unwrap();

    for line in reader.lines().flatten() {
        if let Some(captures) = pattern.captures(&line) {
            orthomcl_out_path = Some(work_dir.join(&captures[1]));
            break;
        }
    }

    // Use the path extracted from the log
    let orthomcl_out_path = orthomcl_out_path.ok_or("Failed to extract final .out file from OrthoMCL log")?;
    let final_filename = orthomcl_out_path.file_name().ok_or("Failed to extract final .out filename")?;
    let tmp_dir = &work_dir.join(
    orthomcl_out_path.parent().and_then(|p| p.file_name()).ok_or("Cannot resolve tmp dir from output path")?);

    let final_destination = work_dir.join(final_filename);

    // Move the result file
    fs::rename(&orthomcl_out_path, &final_destination)
        .map_err(|e| format!("Failed to move {} to {}: {}", orthomcl_out_path.display(), final_destination.display(), e))?;

    logger.information(&format!("Relocated {} to {}", orthomcl_out_path.display(), final_destination.display()));

    // Clean up the tmp subdirectory
    if tmp_dir != work_dir {
        fs::remove_dir_all(tmp_dir).map_err(|e| format!("Failed to remove temporary directory {}: {}", tmp_dir.display(), e))?;
        logger.information(&format!("Cleaned up temporary OrthoMCL directory: {}", tmp_dir.display()));
    }

    Ok(())
}

/// Load genome code → genome name mapping from genome_codes.tsv.
/// Expected format: `CNB2<TAB>G001` (additional columns ignored).
pub fn load_genome_codes(codes_path: &Path, logger: &Logger) -> HashMap<String, String> {

    // Input
    let reader = open_bufread(&codes_path, &logger, "load_genome_codes");

    let mut map = HashMap::<String, String>::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("from_orthomcl: read error in {}: {}", codes_path.display(), e));
                process::exit(1);
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Allow either strict TSV or generic whitespace-separated
        let parts: Vec<&str> = trimmed.split('\t').collect();
        let parts = if parts.len() >= 2 {
            parts
        } else {
            trimmed.split_whitespace().collect()
        };

        if parts.len() < 2 {
            logger.error(&format!("from_orthomcl: expected at least 2 columns in genome_codes.tsv, got: {}", trimmed));
            process::exit(1);
        }

        let genome = parts[0].to_string();
        let code = parts[1].to_string();

        map.insert(code, genome);
    }

    if map.is_empty() {
        logger.error(&format!("from_orthomcl: genome_codes.tsv at {} parsed as empty", codes_path.display()));
        process::exit(1);
    }

    map
}
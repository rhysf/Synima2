use crate::Logger;

use std::path::Path;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader, Write, BufWriter};
//use std::process::{Command, Stdio};
use std::path::PathBuf;
use regex::Regex;

// for OMCL
pub fn parse_genome_map_from_gff<P: AsRef<Path>>(
    gff_path: P,
    logger: &Logger,
) -> Result<HashSet<String>, String> {

    //let mut trans_id_to_genome = HashMap::new();
    let mut genome_set = HashSet::new();

    logger.information(&format!("parse_id_to_genome_map_from_gff: {}",gff_path.as_ref().display()));

    let file = File::open(&gff_path).map_err(|e| format!("Cannot open GFF: {}", e))?;
    let reader = BufReader::new(file);

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

pub fn assign_genome_codes<P: AsRef<Path>>(
    genome_set: &HashSet<String>,
    output_path: P,
    logger: &Logger,
) -> Result<HashMap<String, String>, String> {
    

    let mut genome_to_code = HashMap::new();
    let mut sorted_genomes: Vec<_> = genome_set.iter().cloned().collect();
    sorted_genomes.sort();

    let mut file = File::create(&output_path).map_err(|e| format!("assign_genome_codes: Failed to write genome code file: {}", e))?;

    for (i, genome) in sorted_genomes.iter().enumerate() {
        let code = format!("G{:03x}", i + 1);
        logger.information(&format!("assign_genome_codes: {} -> {}", genome, code));
        genome_to_code.insert(genome.clone(), code.clone());
        writeln!(file, "{}\t{}", genome, code).map_err(|e| format!("Write error: {}", e))?;
    }

    if genome_to_code.is_empty() {
        return Err("assign_genome_codes: No genome codes assigned.".to_string());
    }

    Ok(genome_to_code)
}

pub fn write_gcoded_m8_and_sort<P: AsRef<Path>>(
    genome_to_code: &HashMap<String, String>,
    m8_input_path: P,
    m8_output_path: P,
    logger: &Logger,
) -> Result<(), String> {

    let input_path = m8_input_path.as_ref();
    let output_path = m8_output_path.as_ref();
    let tmp_path = output_path.with_extension("tmp");

    // Open input
    let input_file = File::open(input_path).map_err(|e| {
        logger.error(&format!("write_gcoded_m8_and_sort: Cannot open BLAST m8 input: {}", e));
        format!("Cannot open BLAST m8 input {}: {}", input_path.display(), e)
    })?;

    // Create temp output file
    let output_file = File::create(&tmp_path).map_err(|e| {
        logger.error(&format!("write_gcoded_m8_and_sort: Cannot create temp output: {}", e));
        format!("Cannot create temp output {}: {}", tmp_path.display(), e)
    })?;

    let reader = BufReader::new(input_file);
    let mut writer = BufWriter::new(output_file);

    //logger.information(&format!("write_gcoded_m8_and_sort: {} -> {} (tmp {})", input_path.display(), output_path.display(), tmp_path.display()));
    logger.information(&format!("write_gcoded_m8_and_sort: {}", input_path.display()));

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Error reading m8: {}", e))?;
        let mut fields: Vec<String> = line.split('\t').map(|s| s.to_string()).collect();
        if fields.len() < 12 {
            continue;
        }

        let acc_a = fields[0].clone();
        let acc_b = fields[1].clone();

       // Split field[0] into genome|id
        let (genome_a, gene_id_a) = acc_a.split_once('|').ok_or_else(|| format!("Invalid format in query ID: {}", fields[0]))?;
        let (genome_b, gene_id_b) = acc_b.split_once('|').ok_or_else(|| format!("Invalid format in subject ID: {}", fields[1]))?;

        // Look up code for genome
        let code_a = genome_to_code.get(genome_a).ok_or_else(|| format!("Missing genome code for genome: {}", genome_a))?;
        let code_b = genome_to_code.get(genome_b).ok_or_else(|| format!("Missing genome code for genome: {}", genome_b))?;

        // Replace with Gcoded format: G001|gene_id
        fields[0] = format!("{}|{}", code_a, gene_id_a);
        fields[1] = format!("{}|{}", code_b, gene_id_b);

        writeln!(writer, "{}", fields.join("\t")).map_err(|e| format!("Write error: {}", e))?;
    }

    drop(writer); // flush temp file

    // Sort: col1 (ID), col12 (bit score) descending
    logger.information("write_gcoded_m8_and_sort:sorting Gcoded m8 file...");

    let tmp_path_str = tmp_path.to_string_lossy();
    let out_path_str = m8_output_path.as_ref().to_string_lossy();
    let sort_cmd = format!("sort -T . -S 2G -k1,1 -k12,12gr {} > {}", tmp_path_str, out_path_str);

    let status = std::process::Command::new("sh").arg("-c").arg(&sort_cmd).status().map_err(|e| format!("Failed to run sort: {}", e))?;

    if !status.success() {
        return Err("write_gcoded_m8_and_sort: sort command failed".to_string());
    }

    std::fs::remove_file(tmp_path).ok();
    logger.information(&format!("write_gcoded_m8_and_sort: Finished with {}", out_path_str));

    Ok(())
}

pub fn convert_m8_to_orthomcl_format(
    m8_path: &Path,
    out_prefix: &Path,
    genome_to_code: &HashMap<String, String>,
    logger: &Logger,
) -> Result<(PathBuf, PathBuf), String> {

    logger.information(&format!("convert_m8_to_orthomcl_format: reading {}", m8_path.display()));

    let org_code_len = genome_to_code.values().next().ok_or("convert_m8_to_orthomcl_format: No genome codes available")?.len();

    let input = File::open(m8_path).map_err(|e| format!("convert_m8_to_orthomcl_format: Failed to open m8 input: {}", e))?;
    let reader = BufReader::new(input);

    let bpo_path = out_prefix.with_extension("bpo");
    let bpo_file = File::create(&bpo_path).map_err(|e| format!("convert_m8_to_orthomcl_format: Failed to create bpo output: {}", e))?;
    let mut bpo_writer = BufWriter::new(bpo_file);

    let gg_path = out_prefix.with_extension("gg");
    let gg_file = File::create(&gg_path).map_err(|e| format!("convert_m8_to_orthomcl_format: Failed to create gg output: {}", e))?;
    let mut gg_writer = BufWriter::new(gg_file);

    let mut seen = HashSet::new();
    let mut org_to_accs: HashMap<String, HashSet<String>> = HashMap::new();
    let mut sim_counter = 0;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("convert_m8_to_orthomcl_format: Error reading m8 file: {}", e))?;
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 12 {
            continue;
        }

        let acc_a = fields[0];
        let acc_b = fields[1];
        let per_id: f32 = fields[2].parse().unwrap_or(0.0);
        let lend_a = fields[6];
        let rend_a = fields[7];
        let lend_b = fields[8];
        let rend_b = fields[9];
        let evalue = fields[10];

        let key = format!("{}{}{}", acc_a, '\0', acc_b);
        if !seen.insert(key) {
            continue; // duplicate
        }

        let org_a = &acc_a[0..org_code_len.min(acc_a.len())];
        let org_b = &acc_b[0..org_code_len.min(acc_b.len())];

        org_to_accs.entry(org_a.to_string()).or_default().insert(acc_a.to_string());
        org_to_accs.entry(org_b.to_string()).or_default().insert(acc_b.to_string());

        let per_id_int = (per_id + 0.5).floor() as u32;

        sim_counter += 1;
        writeln!(bpo_writer, "{};{};0;{};0;{};{};1:{}-{}:{}-{}", sim_counter, acc_a, acc_b, evalue, per_id_int, lend_a, rend_a, lend_b, rend_b)
        .map_err(|e| format!("Failed to write to bpo: {}", e))?;
    }

    for (org, accs) in org_to_accs {
        let mut genes: Vec<_> = accs.into_iter().collect();
        genes.sort();
        writeln!(gg_writer, "{}: {}", org, genes.join(" ")).map_err(|e| format!("Failed to write to gg: {}", e))?;
    }

    logger.information(&format!("convert_m8_to_orthomcl_format: OMCL .bpo and .gg written to {}.*", out_prefix.display()));

    Ok((bpo_path, gg_path))
}

pub fn run_orthomcl_clustering<P: AsRef<Path>>(
    orthomcl_script: P,
    bpo_path: P,
    gg_path: P,
    log_path: P,
    logger: &Logger,
) -> Result<(), String> {

    // Convert full paths to filenames for in-place output
    let bpo_file = bpo_path.as_ref().file_name().ok_or("Invalid BPO file path")?;
    let gg_file = gg_path.as_ref().file_name().ok_or("Invalid GG file path")?;

    logger.information(&format!("run_orthomcl_clustering: {} and {}", bpo_file.to_string_lossy(), gg_file.to_string_lossy()));

    // Build command
    let mut cmd = std::process::Command::new("perl");
    cmd.arg(orthomcl_script.as_ref())
    .arg("--mode")
    .arg("4")
    .arg("--bpo_file").arg(bpo_file)
    .arg("--gg_file").arg(gg_file);

    let work_dir = bpo_path.as_ref().parent().ok_or("bpo_path has no parent directory")?;
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
    let log_file = File::open(&log_path).map_err(|e| format!("Cannot re-read log file: {}", e))?;
    let reader = BufReader::new(log_file);

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
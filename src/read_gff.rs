use crate::logger::Logger;
use crate::{read_fasta, read_repo};
use crate::read_fasta::Fasta;

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, BufRead};
use std::path::Path;
//use std::io::BufReader;

use read_repo::{RepoEntry};

#[derive(Clone)]
pub struct MatchDetail {
    //pub gff_line_index: usize,
    pub gff_field_index: usize,
    pub gff_field_name: String,
    pub fasta_field_index: usize,
    pub fasta_source: String, // "id" or "desc"
    pub fasta_field_name: String, // e.g., "gene_id"
    pub matched_value: String,
    //pub is_parent_feature: bool,
    //pub is_subfeature: bool,
}

#[derive(Debug, Clone)]
pub struct MatchFieldCriteria {
    pub gff_field_index: usize,
    pub gff_key: String,
    pub fasta_field_index: usize,
    pub fasta_source: String, // "id" or "desc"
    pub fasta_key: String, // name (e.g., "gene" or "ID"),
}

#[derive(Clone)]
pub struct MatchResult {
    pub genome: String,
    pub feature_type: String,
    //pub total_matches: usize,
    pub unique_matches: usize,
    pub match_details: Vec<MatchDetail>,
    pub matched_values: HashSet<String>,
}

#[derive(Debug)]
pub struct GffFeature {
    pub seqid: String,                 // contig
    pub feature_type: String,         // gene, mRNA, CDS, etc.
    pub start: usize,
    pub end: usize,
    pub strand: char,                 // '+' or '-'
    pub attributes: HashMap<String, String>,
    pub original_line: String
}

// used to return HashMap<String, HashMap<String, Vec<String>>>
// now returns HashMap<String, Vec<GffFeature>>  // genome_name -> features
pub fn save_all_features(repo_entries: &[RepoEntry], logger: &Logger,) -> HashMap<String, Vec<GffFeature>> {
    let mut all_gff_maps: HashMap<String, Vec<GffFeature>> = HashMap::new();
    //let mut all_gff_maps: HashMap<String, HashMap<String, Vec<String>>> = HashMap::new();

    logger.information("──────────────────────────────");
    for entry in repo_entries {
        let genome_name = &entry.name;

        if let Some(gff_file) = entry.files.get("gff") {
            let gff_path = Path::new(&gff_file.path);

            let features = save_features(gff_path, logger).unwrap_or_else(|e| {
                    logger.error(&format!("save_all_features: Failed to read GFF for genome '{}': {}", genome_name, e));
                    Vec::new()
                });

            //logger.information(&format!("Loaded {} feature types from genome '{}'", feature_map.len(), genome_name));

            //let mut counts: Vec<_> = feature_map.iter().map(|(feature, entries)| (feature, entries.len())).collect();

            // Sort descending by count
            //counts.sort_by(|a, b| b.1.cmp(&a.1));

            // Count features by type
            let mut counts: HashMap<String, usize> = HashMap::new();
            for f in &features {
                *counts.entry(f.feature_type.clone()).or_insert(0) += 1;
            }

            let mut counts_vec: Vec<_> = counts.into_iter().collect();
            counts_vec.sort_by(|a, b| b.1.cmp(&a.1)); // descending by count

            // Build log message
            let relevant = ["gene", "mRNA", "CDS", "exon"];
            for (feature, count) in counts_vec {
                if relevant.contains(&feature.as_str()) {
                    logger.information(&format!("save_all_features: {} encodes {} {}'s", genome_name, count, feature));
                }
            }

            all_gff_maps.insert(genome_name.clone(), features);
        } else {
            logger.warning(&format!("No GFF file found for genome '{}'",genome_name));
        }
        //logger.information("");
    }
    logger.information("──────────────────────────────");

    all_gff_maps
}

pub fn prepare_gff_sample(gff_lines: &[String], sample_only: bool) -> Vec<(usize, &String)> {
    if sample_only {
        gff_lines.iter().enumerate().take(20).collect()
    } else {
        gff_lines.iter().enumerate().collect()
    }
}

/* 
fn classify_feature(gff_parts: &HashMap<String, String>, feature_type: &str) -> (bool, bool) {
    let has_id = gff_parts.contains_key("ID") || gff_parts.contains_key("Alias");
    let has_parent = gff_parts.contains_key("Parent");
    let ft = feature_type.to_lowercase();

    let is_parent = (ft == "gene" || ft == "mrna") && has_id;
    let is_sub = (ft == "cds" || ft == "exon" || ft == "utr") && has_parent;

    (is_parent, is_sub)
}*/

pub fn process_gff_line(
    gff_line_index: usize,
    line: &str,
    fasta_index: &HashMap<String, Vec<&Fasta>>,
    fasta_records: &[Fasta],
    feature_type: &str,
    match_criteria: &Option<MatchFieldCriteria>,
    _logger: &Logger,
) -> (Vec<MatchDetail>, HashSet<String>) {

    let mut details = Vec::new();
    let mut matched_vals = HashSet::new();

    // only process valid lines with feature of interest
    let parts: Vec<&str> = line.trim().split('\t').collect();
    if parts.len() < 9 || parts[2].to_lowercase() != feature_type.to_lowercase() { return (vec![], HashSet::new()); }

    let gff_parts = parse_gff_attributes(parts[8]);
    let mut sorted_attrs: Vec<(String, String)> = gff_parts.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    sorted_attrs.sort_by(|a, b| a.0.cmp(&b.0));

    let gff_indexed: HashMap<usize, (String, String)> = sorted_attrs.into_iter().enumerate().collect();
    //let (is_parent_feature, is_subfeature) = classify_feature(&gff_parts, feature_type);

    // Handle the indexed match mode (with match_criteria)
    if let Some(criteria) = &match_criteria {
        if let Some(val) = gff_parts.get(&criteria.gff_key) {
           
            // lookup FASTA list using the matched value
            if let Some(fasta_list) = fasta_index.get(val) {
                for fasta in fasta_list {

                    let fasta_parts = read_fasta::split_fasta_id_and_desc_into_fields(&fasta.id, &fasta.desc);
                    let matches = if let Some(criteria) = match_criteria {
                        match_specific_fields(&gff_parts, &fasta_parts, criteria)
                    } else {
                        extract_matching_values(&gff_parts, &fasta_parts)
                    };
                    let match_set: HashSet<String> = matches.into_iter().collect();

                     if !match_set.is_empty() {
                        let match_data = find_matching_parts(gff_line_index, &gff_indexed, &fasta_parts, &match_set, match_criteria);

                        for &(_gff_idx, gff_field_idx, ref gff_field_name, fasta_idx, ref fasta_src, ref fasta_field_name, ref val) in &match_data {
                            details.push(MatchDetail {
                                //gff_line_index: gff_idx,
                                gff_field_index: gff_field_idx,
                                gff_field_name: gff_field_name.clone(),
                                fasta_field_index: fasta_idx,
                                fasta_source: fasta_src.clone(),
                                fasta_field_name: fasta_field_name.clone(),
                                matched_value: val.clone(),
                                //is_parent_feature,
                                //is_subfeature,
                            });
                            matched_vals.insert(val.clone());
                        }

                        //break; // early exit after first matching fasta
                    }
                } 
                //else {
                    //logger.warning(&format!("No fasta_list for val '{}'", val));
                //}
            }
        }
    } else {
        // Handle fallback mode (no criteria; scan all FASTA records)
        for fasta in fasta_records {
            let fasta_parts = read_fasta::split_fasta_id_and_desc_into_fields(&fasta.id, &fasta.desc);
            let matching_values = extract_matching_values(&gff_parts, &fasta_parts);

            if !matching_values.is_empty() {

                let match_set: HashSet<String> = matching_values.into_iter().collect();

                let match_data = find_matching_parts(gff_line_index, &gff_indexed, &fasta_parts, &match_set, match_criteria);

                for (_gff_idx, gff_field_idx, gff_field_name, fasta_idx, fasta_src, fasta_field_name, matched_value) in match_data {
                    matched_vals.insert(matched_value.clone());
                    details.push(MatchDetail {
                        //gff_line_index: gff_idx,
                        gff_field_index: gff_field_idx,
                        gff_field_name,
                        fasta_field_index: fasta_idx,
                        fasta_source: fasta_src,
                        fasta_field_name,
                        matched_value,
                        //is_parent_feature,
                        //is_subfeature,
                    });
                }

                break; // stop after first match
            }
        }
    }

    (details, matched_vals)
}

fn match_specific_fields(
    gff: &HashMap<String, String>, 
    fasta: &HashMap<usize, (String, String, String)>,
    criteria: &MatchFieldCriteria
) -> Vec<String> {
    let mut matches = HashSet::new();
    
    // GFF lookup MUST use the actual key string, NOT the index
    if let Some(gff_val) = gff.get(&criteria.gff_key) {

        // FASTA lookup still uses numeric index
        if let Some((_, fasta_key, fasta_val)) = fasta.get(&criteria.fasta_field_index) {

            if fasta_key == &criteria.fasta_key && gff_val == fasta_val {
                matches.insert(gff_val.clone());
            }
        }
    }

    matches.into_iter().collect()
}

pub fn parse_gff_attributes(attr_field: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for pair in attr_field.split(';') {
        let kv: Vec<&str> = pair.trim().splitn(2, '=').collect();
        if kv.len() == 2 {
            map.insert(kv[0].trim().to_string(), kv[1].trim().to_string());
        }
    }
    map
}

pub fn extract_matching_values(
    gff_parts: &HashMap<String, String>,
    fasta_parts: &HashMap<usize, (String, String, String)>
) -> Vec<String> {
    let gff_values: HashSet<_> = gff_parts
        .values()
        .map(|val| val.trim().to_string())
        .collect();

    let fasta_values: HashSet<_> = fasta_parts
        .values()
        .map(|(_, _, val)| val.trim().to_string())
        .collect();

    gff_values.intersection(&fasta_values).cloned().collect()
}

fn find_matching_parts(
    gff_line_index: usize,
    gff_parts: &HashMap<usize, (String, String)>,
    fasta_parts: &HashMap<usize, (String, String, String)>,
    matching_values: &HashSet<String>,
    match_criteria: &Option<MatchFieldCriteria>, // NEW
) -> Vec<(usize, usize, String, usize, String, String, String)> {
    let mut match_details = Vec::new();

    for (gff_field_index, (gff_key, gff_val)) in gff_parts {
        if matching_values.contains(gff_val) {
            for (fasta_field_index, (fasta_source, fasta_key, fasta_val)) in fasta_parts {
                if gff_val == fasta_val && gff_val.len() >= 2 {
                    
                    // Only allow match if criteria match, OR if no criteria set
                    // following conditions are allowed to pass through:
                    //   • The current GFF field index matches `criteria.gff_field_index`
                    //   • The current GFF key (e.g. "ID", "Alias", "Parent") matches `criteria.gff_key`
                    //   • The current FASTA field index matches `criteria.fasta_field_index`
                    //   • The FASTA source ("id" or "desc") matches `criteria.fasta_source`
                    //   • The FASTA key (e.g. "gene_id", "locus") matches `criteria.fasta_key`
                    if let Some(criteria) = match_criteria {
                        if *gff_field_index != criteria.gff_field_index
                            || gff_key != &criteria.gff_key
                            || *fasta_field_index != criteria.fasta_field_index
                            || fasta_source != &criteria.fasta_source
                            || fasta_key != &criteria.fasta_key
                        {
                            continue; // Skip non-matching fields
                        }
                    }

                    match_details.push((
                        gff_line_index,
                        *gff_field_index,
                        gff_key.clone(),
                        *fasta_field_index,
                        fasta_source.clone(),
                        fasta_key.clone(),
                        gff_val.clone(),
                    ));
                }
            }
        }
    }

    match_details
}

/// Parses a GFF3 file and groups lines by feature type (e.g., "gene", "mRNA")
/// Returns a HashMap where keys are feature types and values are vectors of full lines.
fn save_features(gff_path: &Path, logger: &Logger) -> io::Result<Vec<GffFeature>> {

    logger.information(&format!("read_gff_by_feature: {}", gff_path.display()));

    let file = File::open(gff_path)?;
    let reader = io::BufReader::new(file);
    //let mut features_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut features: Vec<GffFeature> = Vec::new();

    for line_result in reader.lines() {
        let line = line_result?;
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }

        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 9 {
            logger.warning(&format!("Skipping malformed GFF line (expected 9 fields): {}", line));
            continue; // Skip malformed lines
        }

        //let feature_type = fields[2].to_string();
        //features_map.entry(feature_type).or_default().push(line);
        // Parse coordinates
        let start = match fields[3].parse::<usize>() {
            Ok(v) => v,
            Err(_) => {
                logger.warning(&format!("Invalid start coordinate: {}", fields[3]));
                continue;
            }
        };

        let end = match fields[4].parse::<usize>() {
            Ok(v) => v,
            Err(_) => {
                logger.warning(&format!("Invalid end coordinate: {}", fields[4]));
                continue;
            }
        };

        let strand_char = fields[6].chars().next().unwrap_or('.');

        let attributes = parse_gff_attributes(fields[8]);

        features.push(GffFeature {
            seqid: fields[0].to_string(),
            feature_type: fields[2].to_string(),
            start,
            end,
            strand: strand_char,
            attributes,
            original_line: line.clone()
        });
    }

    Ok(features)
}

/// Given a parent ID, return its feature type (e.g. mRNA, gene) if found in the GFF list
pub fn find_parent_feature_type<'a>(
    parent_id: &str,
    features: &'a [GffFeature],
) -> Option<&'a str> {
    for f in features {
        if let Some(id) = f.attributes.get("ID") {
            if id == parent_id {
                return Some(f.feature_type.as_str());
            }
        }
    }
    None
}

/// Filters and rewrites GFF lines to use genome|ID as the attribute field.
pub fn filter_and_rewrite_gff_lines(
    features: &[GffFeature],
    genome: &str,
    feature_type: &str,
    matching_ids: &HashSet<String>,
    match_key: &str,
) -> Vec<String> {
    features
        .iter()
        .filter(|f| f.feature_type == feature_type)
        .filter_map(|f| {
            if let Some(val) = f.attributes.get(match_key) {
                if matching_ids.contains(val) {
                    Some(format!(
                        "{}\t{}\t{}\t{}\t{}\t.\t{}\t.\t{}|{}",
                        f.seqid,
                        ".", // source left as placeholder
                        f.feature_type,
                        f.start,
                        f.end,
                        f.strand,
                        genome,
                        val
                    ))
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect()
}


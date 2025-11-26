use crate::logger::Logger;
use crate::Args;
use crate::{read_fasta};
use crate::read_fasta::Fasta;
use crate::read_gff;
use crate::parse_dna_and_peptide;
use crate::read_repo;
use crate::read_gff::MatchResult;
use crate::read_gff::MatchFieldCriteria;

//use core::num;
use std::collections::{HashMap, HashSet};
//use std::path::Path;
//use std::path::PathBuf;

use read_repo::{RepoEntry};
use read_gff::{GffFeature};

pub fn evaluate_gff_fasta_mappings(
    gff_features: &[GffFeature],
    fasta_records: &[Fasta],
    genome_name: &String,
    logger: &Logger,
) -> (Option<MatchResult>, Option<MatchResult>) {
    logger.information("evaluate_gff_fasta_mappings: Evaluating feature types...");

    let parent_types = vec!["gene", "mRNA"];
    let subfeature_types = vec!["CDS", "exon", "UTR"];

    // Group features by type
    let mut feature_map: HashMap<String, Vec<&GffFeature>> = HashMap::new();
    for feature in gff_features {
        feature_map.entry(feature.feature_type.clone()).or_default().push(feature);
    }

    let mut parent_candidates = Vec::new();
    let mut subfeature_candidates = Vec::new();

    for (feature_type, features) in &feature_map {
        let gff_lines: Vec<String> = features.iter().map(|f| f.original_line.clone()).collect();

        let result = test_gff_and_fasta_mapping(
            &gff_lines,
            fasta_records,
            genome_name,
            feature_type,
            true,
            None,
            logger,
        )
        .pop()
        .unwrap_or_else(|| MatchResult {
            genome: genome_name.clone(),
            feature_type: feature_type.clone(),
            //total_matches: 0,
            unique_matches: 0,
            match_details: vec![],
            matched_values: HashSet::new(),
        });

        if parent_types.iter().any(|t| t.eq_ignore_ascii_case(feature_type)) {
            parent_candidates.push(result);
        } else if subfeature_types.iter().any(|t| t.eq_ignore_ascii_case(feature_type)) {
            subfeature_candidates.push(result);
        }
    }

    fn sort_results(results: &mut Vec<MatchResult>) {
        results.sort_by(|a, b| {
            let a_priority = a.match_details.get(0).map_or(3, |d| match d.gff_field_name.as_str() {
                "ID" if d.gff_field_index == 0 => 0,
                "ID" => 1,
                "Parent" => 2,
                _ => 3,
            });

            let b_priority = b.match_details.get(0).map_or(3, |d| match d.gff_field_name.as_str() {
                "ID" if d.gff_field_index == 0 => 0,
                "ID" => 1,
                "Parent" => 2,
                _ => 3,
            });

            a_priority.cmp(&b_priority)
                .then(b.unique_matches.cmp(&a.unique_matches))
                .then(a.feature_type.cmp(&b.feature_type)) // final tie-breaker
        });
    }

    sort_results(&mut parent_candidates);
    sort_results(&mut subfeature_candidates);

    let best_parent_result = parent_candidates.first().cloned();
    let best_subfeature_result = subfeature_candidates.first().cloned();

    match &best_parent_result {
        //Some(best) => logger.information(&format!("evaluate_gff_fasta_mappings: Best parent feature: '{}' with {} matches", best.feature_type, best.unique_matches)),
        Some(best) => logger.information(&format!("evaluate_gff_fasta_mappings: Best parent feature: '{}'", best.feature_type)),
        None => logger.warning("No parent feature type matched."),
    }

    match &best_subfeature_result {
        //Some(best) => logger.information(&format!("evaluate_gff_fasta_mappings: Best subfeature feature: '{}' with {} matches", best.feature_type, best.unique_matches)),
        Some(best) => logger.information(&format!("evaluate_gff_fasta_mappings: Best subfeature feature: '{}'", best.feature_type)),
        None => logger.warning("No subfeature feature type matched."),
    }

    logger.information("──────────────────────────────");

    (best_parent_result, best_subfeature_result)
}

fn test_gff_and_fasta_mapping(
    gff_lines: &[String],
    fasta_records: &[Fasta],
    genome_name: &String,
    feature_type: &String,
    sample_only: bool,
    match_criteria: Option<MatchFieldCriteria>,
    logger: &Logger
) -> Vec<MatchResult> {

    //logger.information(&format!("test_gff_and_fasta_mapping: Process {} feature type={}, sample only={}", genome_name, feature_type, sample_only));

    let gff_sample = read_gff::prepare_gff_sample(gff_lines, sample_only);
    let fasta_index = read_fasta::build_fasta_index(fasta_records, &match_criteria, &logger);
    //logger.information(&format!("Built FASTA index with {} unique keys", fasta_index.len()));

    let mut all_details = Vec::new();
    //let mut all_matched_values = HashSet::new();

    for (gff_line_index, line) in gff_sample {
        if line.starts_with('#') { continue; }

        let (details, _matches) = read_gff::process_gff_line(
            gff_line_index,
            line,
            &fasta_index,
            fasta_records,
            feature_type,
            &match_criteria,
            &logger,
        );

        all_details.extend(details);
        //all_matched_values.extend(matches);
    }

    // Define your stopword set
    let stopwords: HashSet<&str> = ["mRNA", "tRNA", "rRNA", "region", "gene", "transcript"].into_iter().collect();

    all_details
        .into_iter()
        .filter(|m| !stopwords.contains(m.matched_value.as_str()))
        .map(|detail| {
            let matched_value = detail.matched_value.clone();
            let matched_values = [matched_value.clone()].into_iter().collect();

            MatchResult {
                genome: genome_name.clone(),
                feature_type: feature_type.clone(),
                //total_matches: 1,
                unique_matches: 1,
                match_details: vec![detail],
                matched_values,
            }
        })
        .collect()
}

fn group_features_by_parent<'a>(features: &'a [GffFeature], logger: &Logger) -> (HashMap<String, Vec<&'a GffFeature>>, String) {
    let mut grouped: HashMap<String, Vec<&GffFeature>> = HashMap::new();

    // Try CDS first
    for f in features {
        if f.feature_type.eq_ignore_ascii_case("CDS") {
            if let Some(parent) = f.attributes.get("Parent") {
                grouped.entry(parent.clone()).or_default().push(f);
            }
        }
    }

    // Fallback to exon if CDS not found
    if grouped.is_empty() {
        logger.warning("group_features_by_parent: No CDS found, falling back to exon");

        for f in features {
            if f.feature_type.eq_ignore_ascii_case("exon") {
                if let Some(parent) = f.attributes.get("Parent") {
                    grouped.entry(parent.clone()).or_default().push(f);
                }
            }
        }

        if grouped.is_empty() {
            logger.error("group_features_by_parent: No exon features found either.");
            std::process::exit(1);
        }
    }

    // At this point, grouped contains: parent_id => Vec<&GffFeature>
    let inferred_parent_type = grouped.keys().filter_map(|id| read_gff::find_parent_feature_type(id, features)).next().unwrap_or("gene").to_string();

    (grouped, inferred_parent_type)
}

/// Extract CDS or PEP sequences directly from GFF + genome FASTA.
/// This is used when no PEP/CDS FASTA file exists for a genome.
/// Returns a Vec<Fasta> representing extracted sequences.
pub fn extract_genes_from_genome_specified_in_gff(
    genome: &str,
    features: &[GffFeature],
    genome_seqs: &HashMap<String, String>, // contig -> sequence
    alignment_type: &str,                 // "cds" or "pep"
    genetic_code: usize, 
    logger: &Logger,
) -> (Vec<Fasta>, String, String) {

    // 1. Determine which feature type to extract: prefer CDS, fallback to exon
    let (grouped, inferred_parent_type) = group_features_by_parent(features, logger);

    // Try to determine which GFF attribute key was used to match the parent ID
    let gff_key_used = features
        .iter()
        .find(|f| f.feature_type == inferred_parent_type && f.attributes.values().any(|v| grouped.contains_key(v)))
        .and_then(|f| {
            f.attributes.iter().find_map(|(k, v)| {
                if grouped.contains_key(v) {
                    Some(k.clone())
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| "ID".to_string()); // fallback

    let mut extracted_fastas = Vec::new();

    // 2. For each gene (Parent), extract concatenated CDS
    for (parent_id, cds_list) in grouped {
        let mut cds_list_sorted = cds_list.clone();

        // Sort by genomic position
        cds_list_sorted.sort_by_key(|f| f.start);

        // Extract all exons in order
        let mut nucleotide_seq = String::new();
        let mut strand: char = '+';

        for cds in &cds_list_sorted {
            strand = cds.strand;

            let contig = &cds.seqid;

            // Genome must contain the contig sequence
            let Some(contig_seq) = genome_seqs.get(contig) else {
                logger.warning(&format!("extract_alignment_from_gff: contig '{}' not found for CDS '{}'", contig, parent_id));
                continue;
            };

            // Ensure coordinates are valid
            if cds.end > contig_seq.len() || cds.start == 0 || cds.start > cds.end {
                logger.warning(&format!("extract_alignment_from_gff: invalid coordinates {}..{} on contig {}",cds.start, cds.end, contig));
                continue;
            }

            // Extract subsequence. Convert 1-based to 0-based.
            let start = cds.start - 1;
            let end = cds.end;

            let subseq = &contig_seq[start..end];
            nucleotide_seq.push_str(subseq);
        }

        // Reverse complement if needed
        let nucleotide_seq = if strand == '-' {
            parse_dna_and_peptide::reverse_complement(&nucleotide_seq)
        } else {
            nucleotide_seq
        };

        // Convert to uppercase
        let nucleotide_seq = nucleotide_seq.to_uppercase();

        // 3. Translate to peptide if requested
        let final_seq = if alignment_type == "pep" {
            parse_dna_and_peptide::translate_dna_to_peptide(&nucleotide_seq, parent_id.as_str(), genetic_code, logger)
        } else {
            nucleotide_seq.clone()
        };

        // 4. Add to results
        extracted_fastas.push(Fasta {
            id: format!("{}|{}", genome, parent_id),
            desc: String::new(),
            seq: final_seq,
        });
    }

    (extracted_fastas, inferred_parent_type, gff_key_used)
}

fn extract_features(
    entry: &RepoEntry,
    features: &[GffFeature],
    all_features: &HashMap<String, Vec<GffFeature>>,
    alignment_type: &str,
    match_threshold: u8,
    logger: &Logger,
) -> Option<(Vec<Fasta>, Vec<String>, f32)> {
    let genome = &entry.name;

    // Load FASTA
    let fasta_list = read_fasta::read_fasta_for_genome(entry, alignment_type, logger);

    // Evaluate mapping between GFF features and FASTA records
    let mapping = evaluate_gff_fasta_mappings(features, &fasta_list, genome, logger);

    // Unwrap best mapping result (skip if no match)
    let Some(best_parent) = &mapping.0 else { return None; };

    // Tag each FASTA record with genome name
    let fasta_for_genome: Vec<(String, Fasta)> = fasta_list.iter().map(|f| (genome.clone(), f.clone())).collect();

    // Extract and write filtered features
    let Ok((filtered_fasta, filtered_gff, match_pct)) =
        extract_selected_features(best_parent, all_features, &fasta_for_genome, match_threshold, logger)
    else {
        logger.error(&format!("process_genome_with_aligned_fasta: Error writing filtered files for '{}'", genome));
        std::process::exit(1);
    };

    Some((filtered_fasta, filtered_gff, match_pct))
}

fn extract_selected_features(
    match_result: &MatchResult,
    all_features: &HashMap<String, Vec<GffFeature>>,
    all_sequences: &[(String, Fasta)],
    match_threshold: u8,
    logger: &Logger,
) -> Result<(Vec<Fasta>, Vec<String>, f32), std::io::Error> {

    let genome = &match_result.genome;
    let feature_type = &match_result.feature_type;

    logger.information(&format!("extract_selected_features: Extracting all matched data for genome '{}' and feature '{}'", genome, feature_type));

    // 0. Retrieve the list of GffFeature entries for this specific genome
    let features = match all_features.get(genome) {
        Some(f) => f,
        None => {
            logger.error(&format!("extract_selected_features: No features found for genome '{}'", genome));
            std::process::exit(1);
        }
    };

    // 1. Get all GFF lines for this genome and this feature type (e.g., gene)
    let gff_features: Vec<&GffFeature> = features.iter().filter(|f| f.feature_type == *feature_type).collect();

    // Convert GffFeature → original GFF lines
    let gff_lines: Vec<String> = gff_features.iter().map(|f| f.original_line.clone()).collect(); 

    logger.information(&format!("extract_selected_features: gff has {} number of lines", gff_lines.len())); 

    // 2. Get all relevant FASTA records
    let fasta_records: Vec<Fasta> = all_sequences.iter().filter(|(g, _)| g == genome).map(|(_, f)| f.clone()).collect();
    logger.information(&format!("extract_selected_features: fasta has {} number of entries", fasta_records.len())); 

    // 3. Derive match criteria from match_result
    let mut sorted_details = match_result.match_details.clone();
    sorted_details.sort_by(|a, b| {
        let a_score = match a.gff_field_name.as_str() {
            "ID" if a.gff_field_index == 0 => 0,
            "ID" => 1,
            "Parent" => 2,
            _ => 3,
        };
        let b_score = match b.gff_field_name.as_str() {
            "ID" if b.gff_field_index == 0 => 0,
            "ID" => 1,
            "Parent" => 2,
            _ => 3,
        };
        a_score.cmp(&b_score)
    });
    let first_detail = sorted_details.first().expect("No match details found");

    let criteria = MatchFieldCriteria {
        gff_field_index: first_detail.gff_field_index,
        gff_key: first_detail.gff_field_name.clone(),
        fasta_field_index: first_detail.fasta_field_index,
        fasta_source: first_detail.fasta_source.clone(),
        fasta_key: first_detail.fasta_field_name.clone(),
    };

    logger.information(&format!(
        "extract_selected_features: criteria used is gff_field_index={}, gff_key={}, fasta_field_index={}, fasta_source={}, fasta_key={}",
        criteria.gff_field_index,
        criteria.gff_key,
        criteria.fasta_field_index,
        criteria.fasta_source,
        criteria.fasta_key
    ));

    // 4. Run full mapping with full GFF + derived criteria
    let full_results = test_gff_and_fasta_mapping(
        &gff_lines,
        &fasta_records,
        genome,
        feature_type,
        false, // full run, not sample
        Some(criteria.clone()),
        &logger,
    );

    // 5. Collect matched IDs
    let matched_ids: HashSet<String> = full_results.iter().flat_map(|r| r.matched_values.iter().cloned()).collect();
    logger.information(&format!("extract_selected_features: Matched {} unique values (key = {})", matched_ids.len(), criteria.gff_key));

    // 6. Filter GFF lines using exact match key
    let filtered_gff = read_gff::filter_and_rewrite_gff_lines(features, genome, feature_type, &matched_ids, &criteria.gff_key);
    logger.information(&format!("extract_selected_features: Retained {} filtered GFF lines", filtered_gff.len()));

    // 7. Filter FASTA records
    let filtered_fasta: Vec<Fasta> = fasta_records
        .clone()
        .into_iter()
        .filter(|record| {
            matched_ids.contains(&record.id)
                || matched_ids.iter().any(|id| record.desc.contains(id))
        })
        .map(|mut f| {
            f.id = format!("{}|{}", genome, f.id); // Optional: prefix ID
            f
        })
        .collect();

    logger.information(&format!("extract_selected_features: Retained {} filtered FASTA entries", filtered_fasta.len()));

    // Check its above the threshold set
    let fasta_count = filtered_fasta.len();
    let total_records = fasta_records.len();

    let match_pct = if total_records == 0 {
        0.0
    } else {
        (fasta_count as f32 / total_records as f32) * 100.0
    };

    if match_pct < match_threshold as f32 {
        logger.warning(&format!("extract_selected_features: GFF and FASTA match rate was below threshold ({} < {}%).", match_pct.round(), match_threshold));
        logger.warning("Skipping FASTA/GFF output. Will attempt extraction from GFF/genome only.");
        return Ok((vec![], vec![], match_pct));
    }

    // (Optional) Store or return results
    Ok((filtered_fasta, filtered_gff, match_pct))
}

pub fn match_or_extract_genes_from_gff(
    repo: &[RepoEntry],
    args: &Args,
    all_features: &HashMap<String, Vec<GffFeature>>,
    all_genome_sequences: &HashMap<String, HashMap<String, String>>, 
    logger: &Logger) -> Result<(HashMap<String, Vec<Fasta>>, HashMap<String, Vec<String>>, Vec<Fasta>, Vec<String>), std::io::Error> {

    logger.information("match_or_extract_genes_from_gff: Determine if gene FASTA provided");

    let alignment_type = &args.alignment_type;
    let match_threshold = args.match_threshold;
    let genetic_code = args.genetic_code;

    let mut all_filtered_fastas = Vec::new();
    let mut all_filtered_gffs = Vec::new();
    let mut per_genome_fastas: HashMap<String, Vec<Fasta>> = HashMap::new();
    let mut per_genome_gffs: HashMap<String, Vec<String>> = HashMap::new();

    for entry in repo {
        let genome = &entry.name;

        if genome == "synima_all" {
            continue;
        }

        let has_sequences = entry.files.contains_key(alignment_type);

        // get parsed Vec<GffFeature> from that file, already in memory
        let features = match all_features.get(genome) {
            Some(f) => f,
            None => {
                logger.warning(&format!("match_or_extract_genes_from_gff: No GFF features found for '{}'", genome));
                continue;
            }
        };

        if has_sequences {
            if let Some((mut filtered_fasta, mut filtered_gff, mut match_pct)) = extract_features(entry, features, all_features, alignment_type, match_threshold, logger) {

                // Load original peptide FASTA
                //let full_pep_fasta = read_fasta::read_fasta_for_genome(entry, alignment_type, logger);

                // Check for unmatched peptides and append them to the filtered results
                let (unmatched_fasta, unmatched_gff) = check_for_unmatched_peptide_ids(entry, &filtered_fasta, all_features, alignment_type, logger);

                // Merge results
                match_pct += (unmatched_fasta.len() as f32 / (filtered_fasta.len() + unmatched_fasta.len()) as f32) * 100.0;
                filtered_fasta.extend(unmatched_fasta);
                filtered_gff.extend(unmatched_gff);

                if match_pct >= (match_threshold as f32) {

                    // Append results to global output collections (if its > match_threshold)
                    all_filtered_fastas.extend(filtered_fasta.clone());
                    all_filtered_gffs.extend(filtered_gff.clone());

                    // append to per-genome
                    per_genome_fastas.insert(genome.clone(), filtered_fasta);
                    per_genome_gffs.insert(genome.clone(), filtered_gff);

                    // Go on to next genome
                    continue; 
                } else {
                    logger.warning(&format!("{}: Match percentage {:.2}% < threshold {}", genome, match_pct, match_threshold));
                }
            }
        } 
        
        // fallback: applies if no FASTA or match_pct was too low
        {
            // Step 5a: extract directly from GFF + genome FASTA
            let Some(contigs) = all_genome_sequences.get(genome) else {
                logger.error(&format!("process_alignment_sequences_per_genome: No genome FASTA found for '{}'", genome));
                std::process::exit(1);
            };

            // Extract sequences
            let (extracted_fasta, parent_feature_type, gff_key_used) = extract_genes_from_genome_specified_in_gff(genome, features, contigs, alignment_type, genetic_code, logger);

            // Build set of IDs (needed to filter GFF lines. Split because the id's now have genome|id)
            let extracted_ids: HashSet<String> = extracted_fasta.iter().map(|f| {
                f.id.split('|').nth(1).unwrap_or(&f.id).to_string()
            }).collect();

            // Rewrite GFF lines exactly like in extract_and_write_selected_features
            // • Keep only features whose ID/Parent ∈ extracted_ids
            // • Replace attribute column with genome|ID
            let rewritten_gff_lines = read_gff::filter_and_rewrite_gff_lines(
                features,
                genome,
                &parent_feature_type,
                &extracted_ids,
                &gff_key_used, 
            );

            // Append results to global output collections
            all_filtered_fastas.extend(extracted_fasta.clone());
            all_filtered_gffs.extend(rewritten_gff_lines.clone());

            //write individual fasta's
            //write_fasta::write_filtered_fasta(&extracted_fasta, &gff_path, alignment_type, logger)?;
            //write_gff::write_filtered_gff(&rewritten_gff_lines, &gff_path, logger)?;
            
            // append to per-genome
            per_genome_fastas.insert(genome.clone(), extracted_fasta);
            per_genome_gffs.insert(genome.clone(), rewritten_gff_lines);

        }
    }

    Ok((per_genome_fastas, per_genome_gffs, all_filtered_fastas, all_filtered_gffs))
}

fn check_for_unmatched_peptide_ids(
    entry: &RepoEntry,
    matched_fastas: &[Fasta],
    all_features: &HashMap<String, Vec<GffFeature>>,
    alignment_type: &str,
    logger: &Logger,
) -> (Vec<Fasta>, Vec<String>) {

    let genome = &entry.name;
    logger.information(&format!("check_for_unmatched_peptide_ids: Checking unmatched peptides for genome '{}'", genome));

    // Load full FASTA
    let full_fasta_list = read_fasta::read_fasta_for_genome(entry, alignment_type, logger);

    // Get all GFF features for this genome
    let Some(features) = all_features.get(genome) else {
        logger.warning(&format!("check_for_unmatched_peptide_ids: No GFF features found for genome '{}'", genome));
        return (Vec::new(), Vec::new());
    };

    // Prepare lookup sets that were already matched in extract_features
    let matched_ids: HashSet<_> = matched_fastas.iter().map(|f| f.id.clone()).collect();
    let all_fasta_ids: HashMap<_, _> = full_fasta_list.iter().map(|f| (f.id.clone(), f)).collect();

    let allowed_types = ["gene", "mRNA"];
    
    // Build a lookup for GFF features by gene ID
    let all_gff_ids: HashMap<String, &GffFeature> = features.iter()
        .filter(|f| allowed_types.contains(&f.feature_type.to_lowercase().as_str()))
        .filter_map(|f| {

        // There should only be one attribute entry per parsed GFF
        let attr = f.attributes.values().next()?; // safely get the first (and only) value

        // Try '=' first
        let value = if let Some((_, val)) = attr.split_once('=') { val } else { attr };

        // Now try to split on '|'
        let id_candidate = value.split('|').nth(1).unwrap_or(value);

        Some((id_candidate.to_string(), f))
    }).collect();

    let mut extra_fastas = Vec::new();
    let mut extra_gffs = Vec::new();

    // Iterate over all unmatched FASTA IDs
    for (id, fasta) in all_fasta_ids.iter().filter(|(id, _)| !matched_ids.contains(*id)) {
        if let Some(feature) = all_gff_ids.get(id) {
            logger.information(&format!("check_for_unmatched_peptide_ids: Adding unmatched peptide and GFF for ID '{}'", id));
            
            // update fasta
            let mut updated_fasta = (*fasta).clone();
            updated_fasta.id = format!("{}|{}", genome, id);
            //updated_fasta.desc = Some(updated_fasta.id.clone());
            extra_fastas.push(updated_fasta);

            // updated gff
            let standardized_line = format!(
                "{}\t.\t{}\t{}\t{}\t.\t{}\t.\t{}|{}",
                feature.seqid,
                feature.feature_type,
                feature.start,
                feature.end,
                feature.strand,
                genome,
                id
            );
            extra_gffs.push(standardized_line);
        } 
        //else {
        //    logger.warning(&format!("check_for_unmatched_peptide_ids: Unmatched peptide ID '{}' has no GFF entry", id));
        //}
    }

    // Log unmatched peptide count
    logger.information(&format!("check_for_unmatched_peptide_ids: {} unmatched peptide sequences without matches", extra_fastas.len()));

    // Log unmatched GFF count
    let unmatched_gff_count = all_gff_ids.keys().filter(|id| !all_fasta_ids.contains_key(*id)).count();
    logger.information(&format!("check_for_unmatched_peptide_ids: {} unmatched GFF features without peptide matches", unmatched_gff_count));

    (extra_fastas, extra_gffs)
}
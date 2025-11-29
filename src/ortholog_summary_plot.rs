use crate::logger::Logger;
use crate::util::{open_bufwrite};

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf}; // 
use std::process::Command;

pub fn write_cluster_dist_stats_and_plot(cluster_counts_file: &Path, _output_dir: &Path, logger: &Logger) {

    // First produce the *.summary file (and single copy ortholog count) and get its path
    let summary_path = write_cluster_dist_summary(cluster_counts_file, logger);

    logger.information(&format!("write_cluster_dist_stats_and_plot: reading {}", cluster_counts_file.display()));

    // Open counts file
    let infile = match File::open(&summary_path) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("write_cluster_dist_stats_and_plot: failed to open summary {}: {}", summary_path.display(), e));
            std::process::exit(1);
        }
    };
    let mut lines = BufReader::new(infile).lines();

    // First line: "#genome\tcore\taux\tunique"
    let header = match lines.next() {
        Some(Ok(line)) => line,
        Some(Err(e)) => {
            logger.error(&format!("write_cluster_dist_stats_and_plot: error reading summary header: {}", e));
            std::process::exit(1);
        }
        None => {
            logger.error("write_cluster_dist_stats_and_plot: summary file is empty");
            std::process::exit(1);
        }
    };

    if !header.starts_with("#genome") {
        logger.warning(&format!("write_cluster_dist_stats_and_plot: unexpected summary header: {}", header));
    }

    let mut genomes: Vec<String> = Vec::new();
    let mut core1_counts: Vec<u64> = Vec::new();
    let mut corem_counts: Vec<u64> = Vec::new();
    let mut aux_counts: Vec<u64> = Vec::new();
    let mut uniq_counts: Vec<u64> = Vec::new();

    // Parse each line in summary
    for line_res in lines {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("write_cluster_dist_stats_and_plot: error reading summary data {}", e));
                std::process::exit(1);
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Stop at the classifications section;
        if trimmed.starts_with("// Classifications") {
            break;
        }

        let cols: Vec<&str> = trimmed.split('\t').collect();
        if cols.len() != 5 {
            logger.error(&format!("write_cluster_dist_stats_and_plot: skipping malformed summary line: {}", trimmed));
            continue
        }

        let genome = cols[0].to_string();
        let core1 = cols[1].parse::<u64>().unwrap_or(0);
        let corem = cols[2].parse::<u64>().unwrap_or(0);
        let aux   = cols[3].parse::<u64>().unwrap_or(0);
        let uniq  = cols[4].parse::<u64>().unwrap_or(0);

        genomes.push(genome);
        core1_counts.push(core1);
        corem_counts.push(corem);
        aux_counts.push(aux);
        uniq_counts.push(uniq);
    }

    // Log what we are about to plot
    logger.information("write_cluster_dist_stats_and_plot: values going into R plot:");
    for i in 0..genomes.len() {
        let g = &genomes[i];
        let c1 = core1_counts[i];
        let cm = corem_counts[i];
        let a  = aux_counts[i];
        let u  = uniq_counts[i];
        let total = c1 + cm + a + u;

        logger.information(&format!("  {}: core_1to1={}, core_multi={}, aux={}, unique={}, total={}", g, c1, cm, a, u, total));
    }

    // Open ggplot2 Rscript that makes a PDF
    let rscript_path = summary_path.with_extension("summary_plot.R");
    let mut rscript_writer = open_bufwrite(&rscript_path, &logger, "write_cluster_dist_stats_and_plot");
    logger.information(&format!("write_cluster_dist_stats_and_plot: writing R script to {}", rscript_path.display()));

    // Write Rscript
    let core1_str = core1_counts.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", ");
    let corem_str = corem_counts.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", ");
    let aux_str = aux_counts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(", ");
    let uniq_str = uniq_counts.iter().map(|c| c.to_string()).collect::<Vec<_>>().join(", ");
    let genomes_str = genomes.iter().map(|g| format!("'{}'", g)).collect::<Vec<_>>().join(", ");

    //let pdf_path = summary_path.join("cluster_dist.pdf");
    let pdf_path = summary_path.with_extension("summary_plot.pdf");
    let png_path = summary_path.with_extension("summary_plot.png");
    let pdf_path_str = pdf_path.to_string_lossy().replace('\\', "/");
    let png_path_str = png_path.to_string_lossy().replace('\\', "/");

    let r_code = format!(
        r#"core1_counts <- c({core1})
corem_counts <- c({corem})
aux_counts <- c({aux})
uniq_counts <- c({uniq})
genomes <- c({genomes})

library(ggplot2)

df <- data.frame(
  genome = rep(genomes, times = 4),
  class = factor(
    rep(c("core_1to1", "core_multi", "aux", "unique"), each = length(genomes)),
    levels = c("core_1to1", "core_multi", "aux", "unique")
  ),
  count  = c(core1_counts, corem_counts, aux_counts, uniq_counts)
)

p <- ggplot(df, aes(x = genome, y = count, fill = class)) +
  geom_bar(
    stat = "identity", 
    position = position_stack(reverse = TRUE)
  ) +
  theme_minimal(base_size = 12) +
  theme(
    axis.text.x = element_text(angle = 45, hjust = 1),
    legend.position = "right"
  ) +
  labs(
    title = "Distribution of core (1:1 and multi), accessory, and unique genes",
    x = "Genome Assembly",
    y = "Number of genes",
    fill = "Class"
  ) +
  scale_fill_brewer(
    palette = "Set2",
    guide = guide_legend(reverse = TRUE)
  )

# PDF output
ggsave(filename = "{pdf}", 
plot = p, width = 7, height = 5)

# PNG output
ggsave(filename = "{png}", 
plot = p, width = 7, height = 5, dpi = 300)
"#,
        core1 = core1_str,
        corem = corem_str,
        aux = aux_str,
        uniq = uniq_str,
        genomes = genomes_str,
        pdf = pdf_path_str,
        png = png_path_str
    );

    if let Err(e) = rscript_writer.write_all(r_code.as_bytes()) {
        logger.error(&format!("write_cluster_dist_stats_and_plot: failed to write R script: {}", e));
        std::process::exit(1);
    }
    drop(rscript_writer);

    // Finally, try to run Rscript. If not available, just warn and continue.
    logger.information("write_cluster_dist_stats_and_plot: checking for Rscript to generate PDF and PNG");
    let status = Command::new("Rscript").arg(&rscript_path).status();

    match status {
        Ok(s) if s.success() => {
            logger.information(&format!("write_cluster_dist_stats_and_plot: cluster distribution plot written to {}", pdf_path.display()));
        }
        Ok(s) => {
            logger.warning(&format!("write_cluster_dist_stats_and_plot: Rscript exited with status {}. Skipping plot.", s));
        }
        Err(e) => {
            logger.warning(&format!("write_cluster_dist_stats_and_plot: Rscript not found or failed to start ({}). Skipping plot.", e));
        }
    }
}

/// Read GENE_CLUSTERS_SUMMARIES.*.cluster_dist_per_genome.txt
/// and write GENE_CLUSTERS_SUMMARIES.*.cluster_dist_per_genome.summary.
/// Returns the path of the summary file.
fn write_cluster_dist_summary(cluster_counts_file: &Path, logger: &Logger) -> PathBuf {

    logger.information(&format!("write_cluster_dist_summary: reading {}", cluster_counts_file.display()));

    // Open counts file
    let infile = match File::open(cluster_counts_file) {
        Ok(f) => f,
        Err(e) => {
            logger.error(&format!("write_cluster_dist_summary: failed to open {}: {}", cluster_counts_file.display(), e));
            std::process::exit(1);
        }
    };
    let mut reader = BufReader::new(infile).lines();

    // First line: "#genome1=n1\tgenome2=n2\t..."
    let first_line = match reader.next() {
        Some(Ok(line)) => line,
        Some(Err(e)) => {
            logger.error(&format!("write_cluster_dist_summary: error reading first line of {}: {}", cluster_counts_file.display(), e));
            std::process::exit(1);
        }
        None => {
            logger.error(&format!("write_cluster_dist_summary: file {} is empty", cluster_counts_file.display()));
            std::process::exit(1);
        }
    };

    let mut genome_total_counts: HashMap<String, u64> = HashMap::new();
    if first_line.starts_with('#') {
        for field in first_line.trim_start_matches('#').split('\t') {
            if field.is_empty() {
                continue;
            }
            let parts: Vec<&str> = field.split('=').collect();
            if parts.len() != 2 {
                continue;
            }
            let genome = parts[0].to_string();
            let count = parts[1].parse::<u64>().unwrap_or(0);
            genome_total_counts.insert(genome, count);
        }
    } else {
        logger.warning("write_cluster_dist_summary: first line does not start with '#', assuming missing totals header");
    }

    // Second line: "#cluster_id\tname\tgenome1\tgenome2\t..."
    let header_line = match reader.next() {
        Some(Ok(line)) => line,
        Some(Err(e)) => {
            logger.error(&format!("write_cluster_dist_summary: error reading header line: {}", e));
            std::process::exit(1);
        }
        None => {
            logger.error("write_cluster_dist_summary: missing header line");
            std::process::exit(1);
        }
    };

    let header_cols: Vec<&str> = header_line.split('\t').collect();
    if header_cols.len() < 3 {
        logger.error(&format!("write_cluster_dist_summary: header has < 3 columns: {}", header_line));
        std::process::exit(1);
    }

    // cluster_id, name, then one column per genome
    let genomes: Vec<String> = header_cols[2..].iter().map(|s| s.to_string()).collect();

    // Data structures as in Perl version
    let mut genome_to_class_count: HashMap<String, HashMap<String, u64>> = HashMap::new();
    let mut genome_type_to_cluster_ids: HashMap<String, HashMap<String, HashSet<String>>> = HashMap::new();

    // Parse each cluster row
    for line_res in reader {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                logger.error(&format!("write_cluster_dist_summary: error reading {}: {}", cluster_counts_file.display(), e));
                std::process::exit(1);
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let cols: Vec<&str> = trimmed.split('\t').collect();
        if cols.len() < 2 + genomes.len() {
            logger.error(&format!("write_cluster_dist_summary: expected at least {} columns, got {}: {}", 2 + genomes.len(), cols.len(), trimmed));
            std::process::exit(1);
        }

        let cluster_id = cols[0].to_string();
        let _name = cols[1].to_string();

        let mut counts_for_cluster: Vec<(String, u64)> = Vec::new();
        for (idx, genome) in genomes.iter().enumerate() {
            let raw = cols[2 + idx];
            let count = raw.parse::<u64>().unwrap_or(0);
            counts_for_cluster.push((genome.clone(), count));
        }

        let counts_gt_zero: Vec<&(String, u64)> = counts_for_cluster.iter().filter(|(_, c)| *c > 0).collect();

        let classification = if !counts_for_cluster.is_empty() && counts_gt_zero.len() == counts_for_cluster.len() {
            // CORE (present in all genomes)
            let all_one = counts_for_cluster.iter().all(|(_, c)| *c == 1);

            if all_one {
                "core_1to1"
            } else {
                "core_multi"
            }
        } else if counts_gt_zero.len() == 1 {
            "unique"
        } else {
            "aux"
        };

        for (genome, count) in counts_for_cluster {
            if count == 0 {
                continue;
            }
            let class_counts = genome_to_class_count.entry(genome.clone()).or_insert_with(HashMap::new);
            *class_counts.entry(classification.to_string()).or_insert(0) += count;

            let type_map = genome_type_to_cluster_ids.entry(genome.clone()).or_insert_with(HashMap::new);
            let set = type_map.entry(classification.to_string()).or_insert_with(HashSet::new);
            set.insert(cluster_id.clone());
        }
    }

    // Open summary file
    let summary_path = cluster_counts_file.with_extension("summary");
    let mut summary_writer = open_bufwrite(&summary_path, &logger, "write_cluster_dist_summary");
    logger.information(&format!("write_cluster_dist_summary: writing summary to {}",summary_path.display()));

    // Write summary file: one line per genome with core / aux / unique counts
    if let Err(e) = writeln!(summary_writer, "#genome\tcore_1to1\tcore_multi\taux\tunique") {
        logger.error(&format!("write_cluster_dist_summary: write error (summary header): {}", e));
        std::process::exit(1);
    }

    // Also log the values we are going to use for plotting
    logger.information("write_cluster_dist_summary: per genome counts (core + aux + unique):");

    for genome in &genomes {
        let class_counts_opt = genome_to_class_count.get(genome);
        let core_1to1 = class_counts_opt.and_then(|m| m.get("core_1to1")).copied().unwrap_or(0);
        let core_multi = class_counts_opt.and_then(|m| m.get("core_multi")).copied().unwrap_or(0);
        let aux = class_counts_opt.and_then(|m| m.get("aux")).copied().unwrap_or(0);
        let uniq = class_counts_opt.and_then(|m| m.get("unique")).copied().unwrap_or(0);
        let total = core_1to1 + core_multi + aux + uniq;

        logger.information(&format!("  {}: core_1to1={}, core_multi={}, aux={}, unique={}, total={}", genome, core_1to1, core_multi, aux, uniq, total));

        if let Err(e) = writeln!(summary_writer, "{}\t{}\t{}\t{}\t{}", genome, core_1to1, core_multi , aux, uniq) {
            logger.error(&format!("write_cluster_dist_summary: write error (summary row): {}", e));
            std::process::exit(1);
        }
    }

    // Optional classification listing, as in Perl
    if let Err(e) = writeln!(summary_writer, "// Classifications:") {
        logger.error(&format!("write_cluster_dist_summary: write error (summary footer): {}", e));
        std::process::exit(1);
    }

    for (genome, type_map) in &genome_type_to_cluster_ids {
        for (class, cluster_ids) in type_map {
            for cluster_id in cluster_ids {
                if let Err(e) =
                    writeln!(summary_writer, "{}\t{}\t{}", genome, class, cluster_id)
                {
                    logger.error(&format!("write_cluster_dist_summary: write error (classification line): {}", e));
                    std::process::exit(1);
                }
            }
        }
    }

    summary_path
}

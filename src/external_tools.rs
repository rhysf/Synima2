use crate::logger::Logger;
use crate::Args;
use crate::synima::{ToolInfo, CitationInfo};
use crate::util;
use crate::ortholog_summary;
use crate::ortholog_summary::OrthologyMethod;

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::process::Command;
use std::fs;

fn run_and_capture(cmd: &str, args: &[&str], logger: &Logger) -> String {
    let output = Command::new(cmd).args(args).output();

    let output = match output {
        Ok(o) => o,
        Err(_) => {
            logger.error(&format!("run_and_capture: unable to run {}", cmd));
            std::process::exit(1);
        }
    };

    if !output.status.success() {
        logger.error(&format!("run_and_capture: command failed {}", cmd));
        std::process::exit(1);
    }

    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// Locates "<outdir>/<OS>.<ARCH>" and returns the folder name and full path.
pub fn locate_bin_folder(outdir: impl AsRef<Path>, logger: &Logger) -> (String, PathBuf) {
    let os = run_and_capture("uname", &[], &logger);       // Example: "Darwin"
    let arch = run_and_capture("uname", &["-m"], &logger); // Example: "arm64"

    let folder_name = format!("{os}.{arch}");
    let full_path = outdir.as_ref().join(&folder_name);

    if !full_path.exists() {
        logger.error(&format!("locate_bin_folder: Path not found {}", full_path.display()));
        std::process::exit(1);
    }

    (folder_name, full_path)
}

pub fn find_executable(program: &str, bin_dir: &Path, logger: &Logger) -> PathBuf {

    logger.information(&format!("find_executable: {}", program));

    // 1. Try bundled binary first
    let bundled_path = bin_dir.join(program);

    if bundled_path.exists() && bundled_path.is_file() {
        let result = Command::new(&bundled_path).arg("--help").stdout(Stdio::null()).stderr(Stdio::null()).status();

        match result {
            Ok(_status) => {
                // We were able to spawn the program, so accept it
                logger.information(&format!("find_executable: using bundled {} at {}", program, bundled_path.display()));
                return bundled_path;
            }
            Err(e) => {
                logger.warning(&format!("find_executable: failed to run bundled {} at {}: {}, will try PATH", program, bundled_path.display(), e));
            }
        }
    } else {
        logger.information(&format!("find_executable: no bundled {} at {}", program, bundled_path.display()));
    }

    // 2. Fallback to PATH
    if let Ok(output) = Command::new("which").arg(program).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if fs::metadata(&path).is_ok() {
                logger.information(&format!("find_executable: using {} from PATH: {}", program, path));
                return PathBuf::from(path);
            }
        }
    }

    // 3. Nothing found
    logger.error(&format!("find_executable: could not find {} in bundled bin dir or PATH", program));
    std::process::exit(1);
}

/// Build the `tools[]` vector for the Methods page
pub fn build_tools_vector(
    args: &Args,
    preferred_method: Option<OrthologyMethod>,
    orthofinder_out_dir: &Path,
    omcl_out_dir: &Path,
    rbh_out_dir: &Path,
    logger: &Logger) -> Vec<ToolInfo> {

    let synima_version = "2.0.0".to_string();
    let fasttree_version = "2.1.11 SSE3".to_string(); // bundled version
    let muscle_version_raw   = util::get_version("muscle", &["-version"]).unwrap_or_else(|| "Unknown".into());
    let muscle_version = util::clean_muscle_version(&muscle_version_raw);
    let diamond_version_raw  = util::get_version("diamond", &["--version"]).unwrap_or_else(|| "Unknown".into());
    let diamond_version = util::clean_diamond_version(&diamond_version_raw);
    let blastp_version_raw   = util::get_version("blastp", &["-version"]).unwrap_or_else(|| "Unknown".into());
    let blastp_version = util::clean_blast_version(&blastp_version_raw);

    // Orthology method
    let source = ortholog_summary::detect_orthology_source(preferred_method, &orthofinder_out_dir, &omcl_out_dir, &rbh_out_dir, &logger);
    let method_label = source.method_label();
    let orthology_version = util::get_orthology_tool_version(method_label);

    // BUILD THE tools[] VECTOR
    let mut tools: Vec<ToolInfo> = Vec::new();

    // Pipeline
    tools.push(ToolInfo {
        category: "Pipeline".into(),
        name: "Synima".into(),
        version: synima_version,
    });

    // Sequence type
    tools.push(ToolInfo {
        category: "Sequence type".into(),
        name: args.alignment_type.clone(),     // "cds" or "pep"
        version: "N/A".into(),
    });

    // Aligner + versions
    let aligner_version = match args.aligner.as_str() {
        "diamond"    => diamond_version.clone(),
        "blastplus"  => blastp_version.clone(),
        "legacy"     => "Legacy BLAST (no version reporting)".into(),
        _            => "Unknown".into(),
    };

    tools.push(ToolInfo {
        category: "Aligner".into(),
        name: args.aligner.clone(),
        version: aligner_version,
    });

    // Aligner parameters
    tools.push(ToolInfo {
        category: "Aligner parameters".into(),
        name: "max_target_seqs".into(),
        version: args.max_target_seqs.to_string(),
    });

    tools.push(ToolInfo {
        category: "Aligner parameters".into(),
        name: "evalue".into(),
        version: args.evalue.clone(),
    });

    tools.push(ToolInfo {
        category: "Orthology tool".into(),
        name: method_label.to_string(),
        version: orthology_version,
    });

    if args.aligner == "diamond" {
        tools.push(ToolInfo {
            category: "Aligner parameters".into(),
            name: "diamond_sensitivity".into(),
            version: args.diamond_sensitivity.clone(),
        });
    }

    tools.push(ToolInfo {
        category: "Multiple aligner".into(),
        name: "MUSCLE".into(),
        version: muscle_version.clone(),
    });

    tools.push(ToolInfo {
        category: "Tree builder".into(),
        name: "FastTree".into(),
        version: fasttree_version,
    });

    tools.push(ToolInfo {
        category: "Synteny chaining".into(),
        name: "DAGChainer".into(),
        version: "N/A".to_string(),
    });

    // Synteny chaining parameters
    tools.push(ToolInfo {
        category: "Synteny chaining parameters".into(),
         name: "dagchainer_chains".into(),
        version: args.dagchainer_chains.to_string(),
    });
    tools
}

/// Build the `citations[]` vector for the Methods page
pub fn build_citations_vector(args: &Args, preferred_method: Option<OrthologyMethod>) -> Vec<CitationInfo> {

    let method_label = match preferred_method {
        Some(m) => m.as_str(),
        None    => "auto",
    };

    let mut citations = Vec::<CitationInfo>::new();

    // Always cite Synima
    citations.push(CitationInfo {
        tool: "Synima".into(),
        citation: "Farrer RA, BMC Bioinformatics 18:507 (2017)".into(),
        link: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5697234/".into(),
    });

    // --- Aligner citations ---
    match args.aligner.as_str() {
        "diamond" => {
            citations.push(CitationInfo {
                tool: "DIAMOND".into(),
                citation: "Buchfink B et al., Nat Methods (2015)".into(),
                link: "https://pubmed.ncbi.nlm.nih.gov/25402007/".into(),
            });
        }

        "blastplus" | "legacy" => {
            citations.push(CitationInfo {
                tool: "BLAST+".into(),
                citation: "Camacho C et al., BMC Bioinformatics (2009)".into(),
                link: "https://pubmed.ncbi.nlm.nih.gov/20003500/".into(),
            });
        }
        _ => {}
    }

    // --- Orthology tool citations ---
    match method_label.to_lowercase().as_str() {
        "orthomcl" => {
            citations.push(CitationInfo {
                tool: "OrthoMCL".into(),
                citation: "Li L et al., Genome Res (2003)".into(),
                link: "https://pubmed.ncbi.nlm.nih.gov/12952885/".into(),
            });
        }

        "orthofinder" => {
            citations.push(CitationInfo {
                tool: "OrthoFinder".into(),
                citation: "Emms DM & Kelly S. Genome Biol. (2019)".into(),
                link: "https://pubmed.ncbi.nlm.nih.gov/31727128/".into(),
            });
        }

        "rbh" => {
            // No citation needed; part of Synima2
        }

        _ => {}
    }

    // FastTree
    citations.push(CitationInfo {
        tool: "FastTree".into(),
        citation: "Price MN et al., PLoS ONE (2010)".into(),
        link: "https://pubmed.ncbi.nlm.nih.gov/20224823/".into(),
    });

    // muscle
    citations.push(CitationInfo {
        tool: "MUSCLE".into(),
        citation: "Edgar RC et al., Nat Commun. (2022)".into(),
        link: "https://pubmed.ncbi.nlm.nih.gov/36379955/".into(),
    });

    // DAGChainer
    citations.push(CitationInfo {
        tool: "DAGChainer".into(),
        citation: "Haas BJ et al., Bioinformatics (2004)".into(),
        link: "https://pubmed.ncbi.nlm.nih.gov/15247098/".into(),
    });
    
    citations
}
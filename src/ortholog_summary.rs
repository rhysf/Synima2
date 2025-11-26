use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use crate::logger::Logger;

pub enum OrthologySource {
    OrthoFinder(PathBuf),
    OrthoMcl(PathBuf),
    Rbh(PathBuf),
}

pub fn detect_orthology_source(
    orthofinder_out_dir: &Path,
    omcl_out_dir: &Path,
    rbh_out_dir: &Path,
    logger: &Logger,
) -> OrthologySource {
    // 1. OrthoFinder first
    let of_marker = orthofinder_out_dir.join("Orthogroups.tsv"); // or your harvested file name
    if fs::metadata(&of_marker).is_ok() {
        logger.information(&format!(
            "ortholog-summary: using OrthoFinder output at {}",
            of_marker.display()
        ));
        return OrthologySource::OrthoFinder(of_marker);
    }

    // 2. OrthoMCL
    let omcl_marker = omcl_out_dir.join("orthomcl_orthologs.tsv"); // adjust to your real file
    if fs::metadata(&omcl_marker).is_ok() {
        logger.information(&format!(
            "ortholog-summary: using OrthoMCL output at {}",
            omcl_marker.display()
        ));
        return OrthologySource::OrthoMcl(omcl_marker);
    }

    // 3. RBH
    let rbh_marker = rbh_out_dir.join("rbh_orthologs.tsv"); // adjust to your real file
    if fs::metadata(&rbh_marker).is_ok() {
        logger.information(&format!(
            "ortholog-summary: using RBH output at {}",
            rbh_marker.display()
        ));
        return OrthologySource::Rbh(rbh_marker);
    }

    // 4. Nothing found - fail loudly
    logger.error(
        "ortholog-summary: could not find any orthology output.\n\
         Expected one of:\n\
         - Orthofinder at Orthogroups.tsv in orthofinder_out_dir\n\
         - OrthoMCL output in omcl_out_dir\n\
         - RBH output in rbh_out_dir",
    );
    process::exit(1);
}
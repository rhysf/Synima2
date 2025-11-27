use crate::util::open_bufwrite;

use std::io::{Write};
use std::path::Path;

use crate::logger::Logger;

pub fn write_filtered_gff(
    filtered_lines: &[String],
    output_path: &Path,
    logger: &Logger,
) -> Result<(), std::io::Error> {

    // Output
    let mut writer = open_bufwrite(&output_path, &logger, "write_filtered_gff");

    for line in filtered_lines {
        writeln!(writer, "{}", line)?;
    }

    logger.information(&format!("write_filtered_gff: Wrote parsed GFF to {}", output_path.display()));
    Ok(())
}

pub fn write_combined_gff_file(
    output_path: &Path,
    all_gff_lines: &[String],
    logger: &Logger,
) -> std::io::Result<()> {

    // Output
    let mut writer = open_bufwrite(&output_path, &logger, "write_combined_gff_file");

    for line in all_gff_lines {
        writeln!(writer, "{}", line)?;
    }

    logger.information(&format!("write_combined_gff_file: Wrote combined GFF to {:?}", output_path));
    Ok(())
}
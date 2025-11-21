use std::fs::{File};
use std::io::{Write, BufWriter};
use std::path::Path;

use crate::logger::Logger;

pub fn write_filtered_gff(
    filtered_lines: &[String],
    output_path: &Path,
    logger: &Logger,
) -> Result<(), std::io::Error> {
    //let new_path = original_gff_path.with_extension("gff3.synima-parsed.gff3");
    let mut writer = BufWriter::new(File::create(&output_path)?);

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
    let mut file = File::create(output_path)?;
    for line in all_gff_lines {
        writeln!(file, "{}", line)?;
    }

    logger.information(&format!("write_combined_gff_file: Wrote combined GFF to {:?}", output_path));
    Ok(())
}
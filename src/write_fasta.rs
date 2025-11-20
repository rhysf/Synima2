use std::fs::{File};
use std::io::{Write, BufWriter};
use std::path::Path;

use crate::read_fasta::Fasta;
use crate::logger::Logger;

pub fn write_filtered_fasta(
    filtered_records: &[Fasta],
    original_fasta_path: &Path,
    sequence_type: &str,
    logger: &Logger,
) -> Result<(), std::io::Error> {
    //let new_path = original_fasta_path.with_extension(".synima-parsed.pep"); // or .pep
    let original_filename = original_fasta_path.file_name().unwrap().to_string_lossy();
    let new_filename = format!("{}.synima-parsed.{}", original_filename, sequence_type);
    let new_path = original_fasta_path.with_file_name(new_filename);

    let mut writer = BufWriter::new(File::create(&new_path)?);

    for fasta in filtered_records {
        writeln!(writer, ">{}", fasta.id)?;
        writeln!(writer, "{}", fasta.seq)?;
    }

    logger.information(&format!("write_filtered_fasta: Wrote parsed FASTA to {}", new_path.display()));
    Ok(())
}

pub fn write_combined_fasta_file(
    output_path: &Path,
    all_fasta: &[Fasta],
    logger: &Logger,
) -> std::io::Result<()> {
    let mut file = File::create(output_path)?;

    for fasta in all_fasta {
        writeln!(file, ">{}", fasta.id)?;
        let wrapped_seq = fasta.seq.as_bytes().chunks(60);
        for chunk in wrapped_seq {
            writeln!(file, "{}", std::str::from_utf8(chunk).unwrap())?;
        }
    }

    logger.information(&format!("write_combined_fasta_file: Wrote combined FASTA to {:?}", output_path));
    Ok(())
}
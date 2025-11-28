use crate::logger::Logger;
use crate::Path;
use crate::fs;


use std::fmt;
use std::process;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::process::Command;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "bin/"]  // folder in your source
struct BinAssets;

pub fn extract_embedded_bin(bin_dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(bin_dir)?;
    for file in BinAssets::iter() {
        let relative = file.as_ref();
        let out_path = bin_dir.join(relative);

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let data = BinAssets::get(relative).unwrap();
        fs::write(out_path, data.data)?;
    }

    Ok(())
}

//#[derive(RustEmbed)]
//#[folder = "orthofinder_runtime/"]  // folder in your source
//struct OrthoFinderAssets;

pub fn mkdir(path: &Path, logger: &Logger, context: &str) {
    fs::create_dir_all(path).log_or_exit(logger, |e| {
        format!("{context}: failed to create directory {}: {}", path.display(), e)
    });
}

pub fn open_file_read(path: &Path, logger: &Logger, context: &str) -> File {
    File::open(path).log_or_exit(logger, |e| {
        format!("{context}: failed to open for reading {}: {}", path.display(), e)
    })
}

pub fn open_file_write(path: &Path, logger: &Logger, context: &str) -> File {
    File::create(path).log_or_exit(logger, |e| {
        format!("{context}: failed to open for writing {}: {}", path.display(), e)
    })
}

pub fn open_bufread(path: &Path, logger: &Logger, context: &str) -> BufReader<File> {
    let file = open_file_read(path, logger, context);
    BufReader::new(file)
}

pub fn open_bufwrite(path: &Path, logger: &Logger, context: &str) -> BufWriter<File> {
    let file = open_file_write(path, logger, context);
    BufWriter::new(file)
}

pub fn run_shell_cmd(cmd: &str, logger: &Logger, context: &str) {
    logger.information(&format!("{context}: running: {cmd}"));

    let status = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .status()
        .log_or_exit(logger, |e| {
            format!("{context}: failed to start '{cmd}': {e}")
        });

    if !status.success() {
        logger.error(&format!(
            "{context}: command failed with status {status}: {cmd}"
        ));
        std::process::exit(1);
    }
}

// log_or_exit functionality
pub trait LogResultExt<T> {
    fn log_or_exit<F>(self, logger: &Logger, make_msg: F) -> T
    where
        F: FnOnce(&dyn fmt::Display) -> String;
}

impl<T, E> LogResultExt<T> for Result<T, E>
where
    E: fmt::Display,
{
    fn log_or_exit<F>(self, logger: &Logger, make_msg: F) -> T
    where
        F: FnOnce(&dyn fmt::Display) -> String,
    {
        match self {
            Ok(v) => v,
            Err(e) => {
                logger.error(&make_msg(&e));
                process::exit(1);
            }
        }
    }
}

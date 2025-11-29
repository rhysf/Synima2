use crate::logger::Logger;
use crate::Path;
use crate::fs;
//use crate::external_tools;

use std::fmt;
use std::process;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::process::Command;
use std::os::unix::fs::PermissionsExt;
use rust_embed::RustEmbed;
use regex::Regex;

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
        fs::write(&out_path, data.data)?;

        // Set permissions: 0o755 for directories and executables
        // We assume everything in bin/ is executable
        let mut perms = fs::metadata(&out_path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&out_path, perms)?;
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

pub fn get_version(tool: &str, args: &[&str]) -> Option<String> {
    match std::process::Command::new(tool)
        .args(args)
        .output()
    {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            if text.trim().is_empty() {
                let text = String::from_utf8_lossy(&out.stderr).to_string();
                if !text.trim().is_empty() {
                    Some(text)
                } else {
                    None
                }
            } else {
                Some(text)
            }
        }
        Err(_) => None,
    }
}

pub fn get_orthology_tool_version(method: &str) -> String {
    match method.to_lowercase().as_str() {
        "orthofinder" => {
            // OrthoFinder uses: orthofinder -h (version printed at top)
            if let Some(v) = crate::util::get_version("orthofinder", &["-h"]) {
                return v;
            }
            // Older OrthoFinder prints version with --version
            if let Some(v) = crate::util::get_version("orthofinder", &["--version"]) {
                return v;
            }
            "Unknown (orthofinder not found)".into()
        }

        "orthomcl" => {
            // Synima always uses OrthoMCL v1.4
            "1.4".into()
        }

        "rbh" => {
            // Synima built-in RBH pipeline
            "Part of Synima2 pipeline".into()
        }

        other => format!("Unknown method '{}'", other),
    }
}

pub fn clean_blast_version(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // strip leading "blastp:", "blastn:", etc
    if let Some(idx) = s.find(':') {
        let after = s[(idx + 1)..].trim().to_string();
        if after.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            s = after;
        }
    }

    // remove everything after "Package:"
    if let Some(idx) = s.to_lowercase().find("package") {
        s = s[..idx].trim().to_string();
    }

    s
}

pub fn clean_muscle_version(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // remove leading "muscle"
    if s.to_lowercase().starts_with("muscle") {
        s = s["muscle".len()..].trim().to_string();
    }

    // remove commit hash like [cfc3eee]
    let re_hash = Regex::new(r"\[[^\]]+\]").unwrap();
    s = re_hash.replace_all(&s, "").trim().to_string();

    // remove "Built XXXXX"
    if let Some(idx) = s.to_lowercase().find("built") {
        s = s[..idx].trim().to_string();
    }

    s
}

pub fn clean_diamond_version(raw: &str) -> String {
    let s = raw.trim();

    // Try: "diamond version 2.1.6"
    if let Some(rest) = s.strip_prefix("diamond version ") {
        return rest.trim().to_string();
    }

    // Try: "diamond v2.1.6"
    if let Some(rest) = s.strip_prefix("diamond ") {
        return rest.trim().to_string();
    }

    // Try: split on whitespace and look for something that starts with digits
    for token in s.split_whitespace() {
        if token.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            return token.to_string();
        }
    }

    // Fallback: return cleaned string
    s.to_string()
}
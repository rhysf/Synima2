use crate::logger::Logger;
use crate::Path;
use crate::fs;

use std::fmt;
use std::process;
use std::fs::File;
use std::io;
use std::io::{BufReader, BufWriter};
use std::process::Command;
use rust_embed::RustEmbed;
use regex::Regex;

#[derive(RustEmbed)]
#[folder = "synima_dependencies/common/"]
struct CommonAssets;

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
#[derive(RustEmbed)]
#[folder = "synima_dependencies/Windows.x86_64/"]
struct BinAssets;

#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
#[derive(RustEmbed)]
#[folder = "synima_dependencies/Windows.arm64/"]
struct BinAssets;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[derive(RustEmbed)]
#[folder = "synima_dependencies/Darwin.arm64/"]
struct BinAssets;

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
#[derive(RustEmbed)]
#[folder = "synima_dependencies/Darwin.x86_64/"]
struct BinAssets;

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
#[derive(RustEmbed)]
#[folder = "synima_dependencies/Linux.x86_64/"]
struct BinAssets;

fn extract_assets<T: RustEmbed>(dest_dir: &Path, logger: &Logger) {
    for file in T::iter() {
        let relative = file.as_ref();
        let out_path = dest_dir.join(relative);

        if let Some(parent) = out_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                logger.error(&format!("extract_assets: error creating {}: {e}", parent.display()));
                std::process::exit(1);
            }
        }

        let data = match T::get(relative) {
            Some(d) => d,
            None => {
                logger.error(&format!("extract_assets: missing embedded asset {relative}"));
                std::process::exit(1);
            }
        };

        if let Err(e) = std::fs::write(&out_path, data.data) {
            logger.error(&format!("extract_assets: error writing {}: {e}", out_path.display()));
            std::process::exit(1);
        }

        if let Err(e) = set_executable_if_supported(&out_path) {
            logger.error(&format!("extract_assets: error setting permissions {}: {e}", out_path.display()));
            std::process::exit(1);
        }
    }
}

pub fn extract_embedded_bin(bin_dir: &Path, logger: &Logger) {
    if let Err(e) = std::fs::create_dir_all(bin_dir) {
        logger.error(&format!("extract_embedded_bin: error creating {}: {e}", bin_dir.display()));
        std::process::exit(1);
    }

    // Extract system-agnostic scripts/tools
    extract_assets::<CommonAssets>(bin_dir, logger);

    // Extract platform-specific binaries
    extract_assets::<BinAssets>(bin_dir, logger);
}

fn set_executable_if_supported(path: &Path) -> io::Result<()> {
    // Unix: mark as executable (755)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(e) => return Err(e),
        };

        let mut perms = metadata.permissions();
        perms.set_mode(0o755);

        if let Err(e) = fs::set_permissions(path, perms) {
            return Err(e);
        }

        return Ok(());
    }

    // Windows: no-op for executability, but you can clear readonly if desired
    #[cfg(windows)]
    {
        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(e) => return Err(e),
        };

        let mut perms = metadata.permissions();
        perms.set_readonly(false);

        if let Err(e) = fs::set_permissions(path, perms) {
            return Err(e);
        }

        return Ok(());
    }

    // Other targets: do nothing
    #[cfg(not(any(unix, windows)))]
    {
        return Ok(());
    }
}

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

    let status_res = if cfg!(windows) {
        // Use cmd.exe on Windows
        Command::new("cmd").arg("/C").arg(cmd).status()
    } else {
        // Use sh on Unix
        Command::new("sh").arg("-c").arg(cmd).status()
    };

    let status = match status_res {
        Ok(s) => s,
        Err(e) => {
            logger.error(&format!("{context}: failed to start '{cmd}': {e}"));
            std::process::exit(1);
        }
    };

    if !status.success() {
        logger.error(&format!("{context}: command failed with status {status}: {cmd}"));
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


pub fn recreate_dir(path: &Path, logger: &Logger, context: &str) {
    if path.exists() {
        if let Err(e) = fs::remove_dir_all(path) {
            logger.error(&format!(
                "{context}: failed to remove existing directory {}: {e}",
                path.display()
            ));
            std::process::exit(1);
        }
    }

    if let Err(e) = fs::create_dir_all(path) {
        logger.error(&format!(
            "{context}: failed to create directory {}: {e}",
            path.display()
        ));
        std::process::exit(1);
    }
}
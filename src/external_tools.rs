use crate::logger::Logger;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;

pub fn find_executable_with_fallback(
    program: &str,
    fallback_bin_dir: &Path,
    logger: &Logger,
) -> (bool, Option<PathBuf>) {

    // 1. Try PATH
    if let Ok(output) = Command::new("which").arg(program).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if fs::metadata(&path).is_ok() {
                logger.information(&format!("find_executable_with_fallback: Found {} in PATH: {}", program, path));
                return (true, Some(PathBuf::from(path)));
            }
        }
    }

    // 2. Fallback path
    let uname = std::env::consts::OS;
    let suffix = match uname {
        "macos" => "Darwin",
        "linux" => "Linux",
        other => {
            logger.warning(&format!("find_executable_with_fallback: OS '{}' not supported for fallback binaries", other));
            return (false, None);
        }
    };

    let fallback_binary = fallback_bin_dir.join(format!("{}.{}", program, suffix));
        if fallback_binary.exists() && fallback_binary.is_file() {
            let result = Command::new(&fallback_binary)
            .arg("--help")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        match result {
            Ok(_) => {
                logger.information(&format!("find_executable_with_fallback: Found {} in {}", program, fallback_binary.display()));
                return (true, Some(fallback_binary));
            }
            Err(e) => {
                logger.error(&format!("find_executable_with_fallback: Failed to run fallback binary {}: {}", fallback_binary.display(), e));
            }
        }
    }
    (false, None)
}
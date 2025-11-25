use crate::logger::Logger;
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
pub fn locate_bin_folder(outdir: impl AsRef<Path>, logger: &Logger) -> std::io::Result<(String, PathBuf)> {
    let os = run_and_capture("uname", &[], &logger);       // Example: "Darwin"
    let arch = run_and_capture("uname", &["-m"], &logger); // Example: "arm64"

    let folder_name = format!("{os}.{arch}");
    let full_path = outdir.as_ref().join(&folder_name);

    if !full_path.exists() {
        logger.error(&format!("create_platform_folder: Path not found {}", full_path.display()));
        std::process::exit(1);
    }

    Ok((folder_name, full_path))
}

pub fn find_executable(program: &str, bin_dir: &Path, logger: &Logger) -> PathBuf {

    logger.information(&format!("find_executable_with_fallback: {}", program));

    // 1. Try bundled binary first
    let bundled_path = bin_dir.join(program);

    if bundled_path.exists() && bundled_path.is_file() {
        let result = Command::new(&bundled_path).arg("--help").stdout(Stdio::null()).stderr(Stdio::null()).status();

        match result {
            Ok(_status) => {
                // We were able to spawn the program, so accept it
                logger.information(&format!("find_executable_with_fallback: using bundled {} at {}", program, bundled_path.display()));
                return bundled_path;
            }
            Err(e) => {
                logger.warning(&format!("find_executable_with_fallback: failed to run bundled {} at {}: {}, will try PATH", program, bundled_path.display(), e));
            }
        }
    } else {
        logger.information(&format!("find_executable_with_fallback: no bundled {} at {}", program, bundled_path.display()));
    }

    // 2. Fallback to PATH
    if let Ok(output) = Command::new("which").arg(program).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if fs::metadata(&path).is_ok() {
                logger.information(&format!("find_executable_with_fallback: using {} from PATH: {}", program, path));
                return PathBuf::from(path);
            }
        }
    }

    // 3. Nothing found
    logger.error(&format!("find_executable_with_fallback: could not find {} in bundled bin dir or PATH", program));
    std::process::exit(1);
}
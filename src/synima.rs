use regex::Regex;
use anyhow::Result;
use std::path::Path;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "src/web-template/"]
struct WebTemplate;

pub fn copy_web_template(output_dir: &Path) -> Result<()> {
    for file in WebTemplate::iter() {
        let data = WebTemplate::get(&file).unwrap().data;

        let dest = output_dir.join(&file.to_string());
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }

        std::fs::write(dest, &*data)?;
    }

    Ok(())
}

pub fn inject_json_into_html(path: &Path, id: &str, json: &str) -> Result<()> {
    let html = std::fs::read_to_string(path)?;

    let re = Regex::new(&format!(
        r#"<script[^>]*id="\Q{}\E"[^>]*type="application/json"[^>]*>(?s).*?</script>"#,
        id
    ))?;

    let replacement = format!(
        r#"<script id="{}" type="application/json">{}</script>"#,
        id, json
    );

    let new_html = re.replace(&html, replacement.as_str()).to_string();

    std::fs::write(path, new_html)?;
    Ok(())
}
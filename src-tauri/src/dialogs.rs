use crate::{fail, Host};
use std::path::PathBuf;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

#[cfg(feature = "safety-tests")]
fn fixture(host: &Host, kind: &str) -> Option<serde_json::Value> {
    let file = host.storage.root.join("native-dialog-fixtures.json");
    let mut value = crate::storage::read_json(&file)?;
    let result = value[kind].as_array_mut()?.first()?.clone();
    value[kind].as_array_mut()?.remove(0);
    crate::storage::write_json(&file, &value).ok()?;
    Some(result)
}
pub fn pick(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    kind: &str,
    extensions: &[&str],
    suggested: &str,
) -> Result<Option<PathBuf>, String> {
    #[cfg(feature = "safety-tests")]
    if crate::background_test() {
        use std::io::Write;
        if let Ok(mut log) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(host.storage.root.join("dialog-trace.jsonl"))
        {
            let _ = writeln!(
                log,
                "{}",
                serde_json::json!({"kind":kind,"extensions":extensions,"suggested":suggested})
            );
        }
    }
    #[cfg(feature = "safety-tests")]
    if let Some(value) = fixture(host, kind) {
        if value.is_null() {
            return Ok(None);
        }
        let target = PathBuf::from(value.as_str().ok_or("Invalid fixture path")?);
        let parent = target
            .parent()
            .ok_or("Invalid fixture path")?
            .canonicalize()
            .map_err(fail)?;
        let case = host
            .storage
            .root
            .parent()
            .ok_or("Invalid fixture root")?
            .canonicalize()
            .map_err(fail)?;
        if !target.is_absolute()
            || target
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
            || !parent.starts_with(case)
        {
            return Err("Fixture path outside isolated case".into());
        }
        return Ok(Some(target));
    }
    if crate::background_test() {
        return Err(format!("Background test requires a {kind} dialog fixture"));
    }
    let _ = host;
    let mut builder = app.dialog().file().set_parent(window);
    if !extensions.is_empty() {
        builder = builder.add_filter("Document", extensions);
    }
    if !suggested.is_empty() {
        builder = builder.set_file_name(suggested);
    }
    let chosen = match kind {
        "save" => builder.blocking_save_file(),
        "folder" => builder.blocking_pick_folder(),
        _ => builder.blocking_pick_file(),
    };
    chosen.map(|p| p.into_path().map_err(fail)).transpose()
}
pub fn confirm(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    message: &str,
) -> bool {
    #[cfg(feature = "safety-tests")]
    if let Some(value) = fixture(host, "confirm") {
        return value.as_bool().unwrap_or(false);
    }
    if crate::background_test() {
        return false;
    }
    app.dialog()
        .message(host.storage.text(message))
        .title("wuffi")
        .parent(window)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}
pub fn pick_many(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
) -> Result<Vec<PathBuf>, String> {
    #[cfg(feature = "safety-tests")]
    if host
        .storage
        .root
        .join("native-dialog-fixtures.json")
        .exists()
        || crate::background_test()
    {
        return Ok(
            pick(app, window, host, "open", &["md", "markdown", "txt"], "")?
                .into_iter()
                .collect(),
        );
    }
    let _ = host;
    app.dialog()
        .file()
        .set_parent(window)
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.into_path().map_err(fail))
        .collect()
}
pub fn file_name(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect::<String>();
    if cleaned.is_empty() {
        "Untitled".into()
    } else {
        cleaned
    }
}

pub fn background_close_confirmed(host: &Host) -> bool {
    #[cfg(feature = "safety-tests")]
    if crate::background_test() {
        return fixture(host, "close")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    }
    let _ = host;
    false
}

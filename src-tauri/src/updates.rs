use crate::{background_test, fail, Host};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates { pending: tokio::sync::Mutex<Option<Update>> }

fn ensure_saved(host: &Host) -> Result<(), String> {
    if host.document_states.lock().map_err(fail)?.values().any(|(dirty, _)| *dirty) {
        return Err("請先儲存所有視窗中的文件，再安裝更新。Please save all documents before installing.".into());
    }
    Ok(())
}

pub async fn action(app: &tauri::AppHandle, host: &Host, action: &str) -> Result<Value, String> {
    let current = app.package_info().version.to_string();
    if action == "status" { return Ok(json!({"currentVersion":current})); }
    if background_test() { return Err("Updates are disabled during background tests".into()); }
    let mut pending = host.updates.pending.try_lock().map_err(|_| "更新作業進行中。Update already in progress.")?;
    match action {
        "check" => {
            let update = app.updater_builder().timeout(Duration::from_secs(60)).build().map_err(fail)?.check().await.map_err(fail)?;
            if let Some(ref update) = update {
                if update.download_url.scheme() != "https" || update.download_url.host_str() != Some("github.com") || !update.download_url.path().starts_with("/gary0122g/wuffi/releases/download/") {
                    return Err("更新下載來源無效。Invalid update source.".into());
                }
            }
            let result = match update.as_ref() {
                Some(update) => json!({"currentVersion":current,"available":true,"version":update.version,"notes":update.body}),
                None => json!({"currentVersion":current,"available":false}),
            };
            *pending = update;
            Ok(result)
        }
        "install" => {
            if cfg!(debug_assertions) { return Err("開發預覽版不會安裝更新，請使用正式安裝版。Updates install only in release builds.".into()); }
            ensure_saved(host)?;
            let update = pending.as_ref().ok_or("請先檢查更新。Check for updates first.")?;
            let mut received = 0_u64;
            let mut last = Instant::now() - Duration::from_secs(1);
            let bytes = update.download(|chunk,total| {
                received += chunk as u64;
                if last.elapsed() >= Duration::from_millis(200) {
                    let _ = app.emit("updater:progress",json!({"received":received,"total":total}));
                    last = Instant::now();
                }
            }, || {}).await.map_err(fail)?;
            ensure_saved(host)?;
            let _ = app.emit("updater:progress",json!({"received":bytes.len(),"total":bytes.len(),"installing":true}));
            update.install(bytes).map_err(fail)?;
            Ok(json!({"installed":true}))
        }
        _ => Err("Unknown update action".into()),
    }
}

use crate::{fail, field, menus, platform, storage, Host};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{fs, path::Path};
#[cfg(feature = "safety-tests")]
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
pub fn handle(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    data: Value,
) -> Result<Value, String> {
    let path = host.storage.root.join("desktop-settings.json");
    match field(&data, "action") {
        "menus" => Ok(menus::rows()),
        "menu" => menus::popup(app, window, host, &data),
        #[cfg(feature = "safety-tests")]
        "inspectMenu" => menus::inspect(
            app,
            host,
            data["index"].as_u64().ok_or("Invalid menu")? as usize,
        ),
        #[cfg(feature = "safety-tests")]
        "inspectRuntime" => Ok(
            json!({"background":crate::background_test(),"visible":window.is_visible().map_err(fail)?,"windows":app.webview_windows().into_values().map(|w|json!({"label":w.label(),"visible":w.is_visible().unwrap_or(false)})).collect::<Vec<_>>()}),
        ),
        #[cfg(feature = "safety-tests")]
        "activateMenuItem" => menus::activate_for_test(app, window, host, &data),
        "get" => {
            let mut settings = host.storage.settings.lock().unwrap().clone();
            settings["uploadToken"] = json!(if platform::read_secret(
                &host.storage.root.join("upload-token.json")
            )?
            .filter(|v| v.as_str().map(|v| !v.is_empty()).unwrap_or(false))
            .is_some()
            {
                "••••••••"
            } else {
                ""
            });
            Ok(settings)
        }
        "save" => {
            let mut settings = host.storage.settings.lock().unwrap();
            if matches!(field(&data, "language"), "zh-TW" | "en") {
                settings["language"] = data["language"].clone();
            }
            if matches!(field(&data, "uploadProvider"), "https" | "picgo") {
                settings["uploadProvider"] = data["uploadProvider"].clone();
            }
            if let Some(url) = data["uploadURL"].as_str() {
                if !url.is_empty() && !url.starts_with("https://") {
                    return Err("請先設定 HTTPS 圖片上傳端點".into());
                }
                settings["uploadURL"] = json!(url);
            }
            if let Some(token) = data["uploadToken"].as_str().filter(|t| *t != "••••••••")
            {
                platform::write_secret(
                    &host.storage.root.join("upload-token.json"),
                    if token.is_empty() {
                        &Value::Null
                    } else {
                        &data["uploadToken"]
                    },
                )?;
            }
            storage::write_json(&path, &settings)?;
            Ok(json!(true))
        }
        "shortcuts" => Ok(menus::shortcuts(host)),
        "shortcut" => menus::change_shortcut(host, &data),
        "resetShortcuts" => {
            let mut settings = host.storage.settings.lock().unwrap();
            settings["shortcuts"] = json!({});
            storage::write_json(&path, &settings)?;
            Ok(json!(true))
        }
        "themeFolder" => {
            if crate::background_test() {
                return Err("Opening Explorer requires visible desktop verification".into());
            }
            app.opener()
                .open_path(
                    host.storage.root.join("themes").to_string_lossy(),
                    None::<&str>,
                )
                .map_err(fail)?;
            Ok(Value::Null)
        }
        "themes" => Ok(json!(fs::read_dir(host.storage.root.join("themes"))
            .map_err(fail)?
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.ends_with(".css"))
            .collect::<Vec<_>>())),
        "theme" => {
            let name = field(&data, "name");
            if !name.ends_with(".css")
                || Path::new(name).file_name().and_then(|v| v.to_str()) != Some(name)
            {
                return Err("Invalid theme".into());
            }
            let root = host
                .storage
                .root
                .join("themes")
                .canonicalize()
                .map_err(fail)?;
            let mut css = fs::read_to_string(root.join(name))
                .map_err(fail)?
                .replace("#write", "#milkdown-root .milkdown .ProseMirror");
            let regex = regex::Regex::new(r#"url\(['\"]?([^)'\"\s]+)['\"]?\)"#).unwrap();
            let matches = regex
                .captures_iter(&css)
                .map(|c| (c[0].to_string(), c[1].to_string()))
                .collect::<Vec<_>>();
            for (original, url) in matches {
                if url.starts_with("https:") || url.starts_with("http:") || url.starts_with("data:")
                {
                    continue;
                }
                let decoded = percent_encoding::percent_decode_str(&url)
                    .decode_utf8()
                    .map_err(fail)?;
                let Ok(target) = root.join(decoded.as_ref()).canonicalize() else {
                    continue;
                };
                if !target.starts_with(&root) {
                    continue;
                }
                let mime = match target.extension().and_then(|v| v.to_str()) {
                    Some("woff2") => "font/woff2",
                    Some("woff") => "font/woff",
                    Some("ttf") => "font/ttf",
                    _ => crate::image_mime(&target).unwrap_or(""),
                };
                if !mime.is_empty() {
                    if let Ok(bytes) = fs::read(target) {
                        css = css.replace(
                            &original,
                            &format!("url(data:{mime};base64,{})", STANDARD.encode(bytes)),
                        );
                    }
                }
            }
            Ok(json!(css))
        }
        _ => Err("Unknown setting action".into()),
    }
}

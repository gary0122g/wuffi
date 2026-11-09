#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod agent;
mod cloud;
mod conversion;
mod dialogs;
mod integrations;
mod menus;
mod native_windows;
mod platform;
mod printing;
mod settings;
mod storage;
mod updates;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use storage::{Record, Storage};
use tauri::{Emitter, Manager, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;
use tokio_util::sync::CancellationToken;

struct Host {
    updates: updates::Updates,
    cloud: cloud::Cloud,
    conversion_lock: tokio::sync::Mutex<()>,
    conversion_cancel: Mutex<Option<CancellationToken>>,
    storage: Storage,
    client: reqwest::Client,
    active: Mutex<HashMap<String, (String, CancellationToken)>>,
    document_states: Mutex<HashMap<String, (bool, bool)>>,
    menu_owner: Mutex<Option<String>>,
    images: Mutex<HashSet<PathBuf>>,
    benchmark: bool,
}
fn field<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn arg(name: &str) -> Option<String> {
    std::env::args().skip_while(|a| a != name).nth(1)
}
fn background_test() -> bool {
    cfg!(feature = "safety-tests") && std::env::args().any(|a| a == "--background-test")
}
fn fail(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn document_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "md" | "markdown" | "txt"
    )
}
fn navigation(app: &tauri::AppHandle, url: &tauri::Url) -> bool {
    if url.host_str() == Some("tauri.localhost") || url.scheme() == "tauri" {
        return true;
    }
    if matches!(url.scheme(), "http" | "https") {
        if background_test() {
            return false;
        }
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
    false
}
fn connection(host: &Host) -> agent::Connection {
    storage::read_json(&host.storage.root.join("writing-agent.json"))
        .and_then(|v| agent::validate(v).ok())
        .unwrap_or_default()
}
fn unknown_method() -> Result<Value, String> {
    Err("未知的桌面指令。Unknown desktop method.".into())
}
fn route_menu_command(app: &tauri::AppHandle, id: &str) {
    let owner = app.state::<Host>().menu_owner.lock().unwrap().clone();
    if let Some(window) = owner
        .and_then(|label| app.get_webview_window(&label))
        .or_else(|| {
            app.webview_windows()
                .into_values()
                .find(|w| w.is_focused().unwrap_or(false))
        })
        .or_else(|| app.get_webview_window("main"))
    {
        let _ = window.emit("desktop:command", id);
    }
}
fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}
#[tauri::command]
async fn desktop_call(
    app: tauri::AppHandle,
    window: WebviewWindow,
    host: State<'_, Host>,
    method: String,
    data: Value,
) -> Result<Value, String> {
    if window.label() != "main" && !window.label().starts_with("writer-") {
        return Err("Invalid window".into());
    }
    match method.as_str() {
        "updates" => return updates::action(&app, &host, field(&data,"action")).await,
        "settings" => return settings::handle(&app, &window, &host, data),
        "newWindow" => {
            let id = uuid::Uuid::new_v4().to_string();
            let links = app.clone();
            let mut builder = tauri::WebviewWindowBuilder::new(
                &app,
                format!("writer-{id}"),
                tauri::WebviewUrl::App(format!("index.html?window={id}").into()),
            )
            .title("wuffi")
            .decorations(false)
            .inner_size(1000.0, 760.0)
            .min_inner_size(600.0, 420.0)
            .data_directory(host.storage.root.join("webview"))
            .on_navigation(move |url| navigation(&links, url));
            if background_test() {
                builder = builder
                    .visible(false)
                    .focused(false)
                    .initialization_script("window.__WUFFI_BACKGROUND_TEST__=true;window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;");
            }
            #[cfg(windows)]
            if let Some(port) = arg("--cdp-port") {
                builder = builder.additional_browser_args(&format!(
                    "--remote-debugging-port={port} --remote-debugging-address=127.0.0.1"
                ));
            }
            let new = builder.build().map_err(fail)?;
            new.center().map_err(fail)?;
            return Ok(json!({"window":id}));
        }
        "convert" | "importDocument" | "renderMarkdown" | "exportTemplates" => {
            return conversion::handle(&app, &window, &host, &method, data).await
        }
        "cancelConversion" => {
            if let Some(token) = host.conversion_cancel.lock().unwrap().as_ref() {
                token.cancel();
            }
            return Ok(json!(true));
        }
        "fileOperation" => return integrations::file_operation(&app, &window, &host, data).await,
        "uploadImage" => return integrations::upload(&host, data).await,
        "pickImage" => return integrations::pick_image(&app, &window, &host, data).await,
        "resolveImage" => return integrations::resolve_image(&host, data).await,
        "exportDocument" => return printing::export(&app, &window, &host, data).await,
        "searchFolder" => return integrations::search(&host, &data),
        "recentFolder" => {
            let path = host.storage.settings.lock().unwrap()["recentFolders"]
                [data["index"].as_u64().ok_or("Invalid index")? as usize]
                .as_str()
                .map(PathBuf::from)
                .ok_or("Invalid recent folder")?;
            return integrations::folder(&host, path);
        }
        "clearRecent" => {
            let mut settings = host.storage.settings.lock().unwrap();
            settings["recentExcluded"] = json!(host
                .storage
                .files
                .lock()
                .unwrap()
                .keys()
                .collect::<Vec<_>>());
            settings["recentTokens"] = json!([]);
            settings["recentFolders"] = json!([]);
            storage::write_json(&host.storage.root.join("desktop-settings.json"), &settings)?;
            return Ok(Value::Null);
        }
        "initialFiles" => {
            let mut records = vec![];
            if window.label() == "main" {
                for path in std::env::args()
                    .skip(1)
                    .filter(|p| document_path(Path::new(p)))
                {
                    let record = host.storage.authorize(PathBuf::from(path))?;
                    integrations::recent(&host, &record)?;
                    records.push(record);
                }
            }
            return Ok(json!(records));
        }
        "readClipboard" => {
            let html = arboard::Clipboard::new()
                .ok()
                .and_then(|mut c| c.get().html().ok())
                .unwrap_or_default();
            return Ok(json!({"text":app.clipboard().read_text().unwrap_or_default(),"html":html}));
        }
        _ => {}
    }
    match method.as_str() {
        "drafts" => {
            let expected = window.label().strip_prefix("writer-").unwrap_or("");
            if field(&data, "window") != expected {
                return Err("Invalid draft window".into());
            }
            host.storage.drafts(&data)
        }
        "cloudAccount" => {
            let action = field(&data, "action");
            if action == "website" {
                app.opener().open_url(cloud::ORIGIN, None::<&str>).map_err(fail)?;
                return Ok(Value::Null);
            }
            let value = host.cloud.action(&host.client, action).await?;
            if action == "start" {
                app.opener().open_url(value["browserUrl"].as_str().ok_or("登入網址無效")?, None::<&str>).map_err(fail)?;
            }
            if action == "poll" && value["signedIn"] == true { let _=window.unminimize();let _=window.set_focus(); }
            Ok(value)
        }
        "agentConnection" => match field(&data, "action") {
            "save" => {
                let value = agent::validate(data)?;
                storage::write_json(&host.storage.root.join("writing-agent.json"), &json!(value))?;
                Ok(json!(value))
            }
            "test" => {
                let c = agent::validate(data)?;
                let response = host
                    .client
                    .get(format!("{}/models", c.base_url))
                    .timeout(Duration::from_secs(8))
                    .send()
                    .await
                    .map_err(|_| "無法連線至本機 AI")?;
                let value = agent::response_json(response).await?;
                Ok(
                    json!({"models":value["data"].as_array().unwrap_or(&vec![]).iter().map(|v|v["id"].as_str().unwrap_or("")).collect::<Vec<_>>(),"configured":c.model}),
                )
            }
            _ => Ok(json!(connection(&host))),
        },
        "agentCancel" => {
            if let Some((_, token)) = host.active.lock().unwrap().get(window.label()) {
                token.cancel();
            }
            Ok(json!(true))
        }
        "agentRequest" => {
            let token = CancellationToken::new();
            let id = uuid::Uuid::new_v4().to_string();
            if let Some((_, previous)) = host
                .active
                .lock()
                .unwrap()
                .insert(window.label().into(), (id.clone(), token.clone()))
            {
                previous.cancel();
            }
            // Register before starting HTTP work so Stop cancels this request.
            let request = async {
                if token.is_cancelled() {
                    return Err("請求已停止或逾時".into());
                }
                if field(&data, "provider") == "cloud" {
                    let credential = host.cloud.token()?;
                    cloud::call(&host.client, "agent", Some(&credential), Some(data)).await
                } else {
                    agent::request(&host.client, connection(&host), data).await
                }
            };
            let result = tokio::select! {biased;_=token.cancelled()=>Err("請求已停止或逾時".into()),r=request=>r};
            let mut active = host.active.lock().unwrap();
            if active
                .get(window.label())
                .map(|(current, _)| current == &id)
                .unwrap_or(false)
            {
                active.remove(window.label());
            }
            result
        }
        "open" => {
            let mut records = Vec::new();
            for path in dialogs::pick_many(&app, &window, &host)? {
                let record = host.storage.authorize(path)?;
                integrations::recent(&host, &record)?;
                records.push(record);
            }
            Ok(json!(records))
        }
        "save" => {
            let _guard = host.storage.io.lock().unwrap();
            let content = data["content"].as_str().ok_or("Invalid document")?;
            if content.len() > 10_000_000 {
                return Err("文件超過 10 MB".into());
            }
            let existing = host
                .storage
                .files
                .lock()
                .unwrap()
                .get(field(&data, "token"))
                .cloned();
            let record = if data["saveAs"] == true || existing.is_none() {
                let title = field(&data, "title")
                    .chars()
                    .map(|c| if "\\/:*?\"<>|".contains(c) { '-' } else { c })
                    .collect::<String>();
                let default = existing.as_ref().map(|r| r.path.clone()).unwrap_or(format!(
                    "{}.{}",
                    if title.is_empty() { "Untitled" } else { &title },
                    match field(&data, "extension") {
                        "markdown" => "markdown",
                        "txt" => "txt",
                        _ => "md",
                    }
                ));
                let Some(path) = dialogs::pick(
                    &app,
                    &window,
                    &host,
                    "save",
                    &["md", "markdown", "txt"],
                    &default,
                )?
                else {
                    return Ok(Value::Null);
                };
                Record {
                    token: uuid::Uuid::new_v4().to_string(),
                    title: path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                    path: path.to_string_lossy().into(),
                    content: content.into(),
                }
            } else {
                let mut record = existing.as_ref().unwrap().clone();
                record.content = content.into();
                record
            };
            let expected = if data["saveAs"] == true || existing.is_none() {
                fs::read_to_string(&record.path).ok()
            } else {
                data["expectedContent"]
                    .as_str()
                    .map(String::from)
                    .or_else(|| existing.as_ref().map(|r| r.content.clone()))
            };
            if !storage::save_article(
                Path::new(&record.path),
                content,
                expected.as_deref(),
                &host
                    .storage
                    .root
                    .join("article-backups")
                    .join(format!("{}.md", record.token)),
                || {
                    if background_test() {
                        return false;
                    }
                    app.dialog()
                        .message(host.storage.text("檔案已被其他程式修改或移除"))
                        .title("wuffi")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            host.storage.text("覆寫"),
                            host.storage.text("取消"),
                        ))
                        .blocking_show()
                },
            )? {
                return Ok(Value::Null);
            }
            host.storage
                .files
                .lock()
                .unwrap()
                .insert(record.token.clone(), record.clone());
            host.storage.persist()?;
            integrations::recent(&host, &record)?;
            Ok(json!({"token":record.token,"path":record.path,"title":record.title}))
        }
        "inspect" => {
            let r = host.storage.record(field(&data, "token"))?;
            match field(&data, "action") {
                "reload" => {
                    let mut r = r;
                    r.content =
                        String::from_utf8_lossy(&fs::read(&r.path).map_err(fail)?).into_owned();
                    host.storage
                        .files
                        .lock()
                        .unwrap()
                        .insert(r.token.clone(), r.clone());
                    host.storage.persist()?;
                    Ok(json!(r))
                }
                "reveal" => {
                    if background_test() {
                        return Err("Opening Explorer requires visible desktop verification".into());
                    }
                    app.opener().reveal_item_in_dir(&r.path).map_err(fail)?;
                    Ok(Value::Null)
                }
                "info" => {
                    let meta = fs::metadata(&r.path).map_err(fail)?;
                    Ok(
                        json!({"path":r.path,"size":meta.len(),"modified":meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|t|t.as_millis()).unwrap_or(0),"created":meta.created().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|t|t.as_millis()).unwrap_or(0)}),
                    )
                }
                _ => Err("Invalid file operation".into()),
            }
        }
        "openFolder" => {
            let Some(path) = dialogs::pick(&app, &window, &host, "folder", &[], "")? else {
                return Ok(Value::Null);
            };
            integrations::folder(&host, path)
        }
        "listFolder" | "readFolderFile" => {
            let path = host
                .storage
                .folders
                .lock()
                .unwrap()
                .get(field(&data, "token"))
                .cloned()
                .ok_or("未授權的資料夾項目")?;
            if method == "listFolder" {
                host.storage.list_folder(&path)
            } else {
                Ok(json!(host.storage.authorize(path)?))
            }
        }
        "preferences" => {
            if let Some(zoom) = data["zoom"].as_f64() {
                window.set_zoom(zoom.clamp(0.5, 2.0)).map_err(fail)?;
            }
            let mut settings = host.storage.settings.lock().unwrap();
            for key in ["showHidden", "rememberRecent", "theme", "status", "toolbar"] {
                if let Some(v) = data.get(key) {
                    settings[key] = v.clone();
                }
            }
            storage::write_json(&host.storage.root.join("desktop-settings.json"), &settings)?;
            Ok(Value::Null)
        }
        "state" => {
            host.document_states.lock().unwrap().insert(
                window.label().into(),
                (data["dirty"] == true, data["draftSafe"] != false),
            );
            let title = field(&data, "title");
            window
                .set_title(&format!(
                    "{}{} - wuffi",
                    title,
                    if data["activeDirty"] == true {
                        " •"
                    } else {
                        ""
                    }
                ))
                .map_err(fail)?;
            Ok(Value::Null)
        }
        "clipboard" => {
            if data["action"] == "read" {
                Ok(json!(app.clipboard().read_text().unwrap_or_default()))
            } else {
                let text = field(&data, "text");
                if let Some(html) = data["html"].as_str() {
                    app.clipboard().write_html(html, Some(text)).map_err(fail)?;
                } else {
                    app.clipboard().write_text(text).map_err(fail)?;
                }
                Ok(json!(""))
            }
        }
        "window" => {
            if background_test() && !matches!(field(&data, "action"), "reload" | "close") {
                return Err("Window controls require visible desktop verification".into());
            }
            match field(&data, "action") {
                "minimize" => window.minimize().map_err(fail)?,
                "maximize" => {
                    if window.is_maximized().map_err(fail)? {
                        window.unmaximize().map_err(fail)?
                    } else {
                        window.maximize().map_err(fail)?
                    }
                }
                "close" => window.close().map_err(fail)?,
                "fullscreen" => window
                    .set_fullscreen(!window.is_fullscreen().map_err(fail)?)
                    .map_err(fail)?,
                "alwaysOnTop" => window
                    .set_always_on_top(!window.is_always_on_top().map_err(fail)?)
                    .map_err(fail)?,
                "devtools" => native_windows::toggle_devtools(&window).await?,
                "reload" => window.eval("location.reload()").map_err(fail)?,
                _ => return Err("Invalid window action".into()),
            }
            Ok(Value::Null)
        }
        "message" => {
            let message = field(&data, "message");
            if message.len() > 16 * 1024 {
                return Err("Message too long".into());
            }
            if data["confirm"] == true {
                return Ok(json!(dialogs::confirm(&app, &window, &host, message)));
            }
            if !background_test() {
                app.dialog()
                    .message(message)
                    .title("wuffi")
                    .parent(&window)
                    .show(|_| {});
            }
            Ok(Value::Null)
        }
        "nativeContext" => {
            if background_test() {
                return Err("Native context menus are disabled during background tests".into());
            }
            use tauri::menu::{Menu, PredefinedMenuItem};
            let menu = Menu::with_items(
                &app,
                &[
                    &PredefinedMenuItem::cut(&app, None).map_err(fail)?,
                    &PredefinedMenuItem::copy(&app, None).map_err(fail)?,
                    &PredefinedMenuItem::paste(&app, None).map_err(fail)?,
                    &PredefinedMenuItem::select_all(&app, None).map_err(fail)?,
                ],
            )
            .map_err(fail)?;
            window.popup_menu(&menu).map_err(fail)?;
            Ok(Value::Null)
        }
        "editorContext" => Ok(Value::Null),
        "benchmark:quit" if host.benchmark => {
            app.exit(0);
            Ok(Value::Null)
        }
        "benchmark:ready" if host.benchmark => {
            storage::write_json(&host.storage.root.join("benchmark-ready.json"), &data)?;
            Ok(json!(true))
        }
        _ => unknown_method(),
    }
}
fn main() {
    // Fail closed if a background test accidentally targets a production build.
    if std::env::args().any(|a| a == "--background-test") && !cfg!(feature = "safety-tests") {
        eprintln!("--background-test requires a safety-tests build");
        std::process::exit(2);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let root = if let Some(profile) = arg("--profile") {
                PathBuf::from(profile)
            } else {
                let current = app.path().app_data_dir()?;
                let previous = app.path().data_dir()?.join("dev.liubai.tauri.prototype");
                if !current.exists() && previous.exists() {
                    previous
                } else {
                    current
                }
            };
            let data_dir = root.join("webview");
            let storage = Storage::new(root).map_err(std::io::Error::other)?;
            let images = storage::read_json(&storage.root.join("image-access.json"))
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            app.manage(Host {
                updates: updates::Updates::default(),
                cloud: cloud::Cloud::default(),
                conversion_lock: tokio::sync::Mutex::new(()),
                conversion_cancel: Mutex::new(None),
                storage,
                client: reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .build()?,
                active: Mutex::new(HashMap::new()),
                document_states: Mutex::new(HashMap::new()),
                menu_owner: Mutex::new(None),
                images: Mutex::new(images),
                benchmark: std::env::args().any(|a| a == "--benchmark"),
            });
            let links = app.handle().clone();
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("wuffi")
            .decorations(false)
            .inner_size(1184.0, 704.0)
            .min_inner_size(600.0, 420.0)
            .data_directory(data_dir)
            .initialization_script(if std::env::args().any(|a| a == "--benchmark") {
                "window.__LIUBAI_BENCHMARK__=true;"
            } else if background_test() {
                "window.__WUFFI_BACKGROUND_TEST__=true;window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;"
            } else {
                ""
            })
            .on_navigation(move |url| navigation(&links, url));
            if background_test() {
                builder = builder.visible(false).focused(false);
            }
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone())?;
            }
            #[cfg(target_os = "windows")]
            if let Some(port) = arg("--cdp-port") {
                if port.parse::<u16>().is_ok() {
                    builder = builder.additional_browser_args(&format!(
                        "--remote-debugging-port={} --remote-debugging-address=127.0.0.1",
                        port
                    ));
                }
            }
            let window = builder.build()?;
            integrations::start_watching(app.handle().clone());
            let benchmark = std::env::args().any(|a| a == "--benchmark");
            if let Some(monitor) = if benchmark {
                window.primary_monitor()?
            } else {
                window.current_monitor()?
            } {
                let a = monitor.work_area();
                let factor = monitor.scale_factor();
                let width = a.size.width as f64 / factor;
                let height = a.size.height as f64 / factor;
                let scale = (width / 2560.0)
                    .min(height / 1380.0)
                    .max((600.0_f64 / 1480.0).max(420.0 / 880.0))
                    .min((width / 1480.0).min(height / 880.0));
                let (window_width, window_height) = if benchmark {
                    (1184.0, 704.0)
                } else {
                    ((1480.0 * scale).round(), (880.0 * scale).round())
                };
                window.set_size(tauri::LogicalSize::new(window_width, window_height))?;
                window.set_position(tauri::LogicalPosition::new(
                    a.position.x as f64 / factor + (width - window_width) / 2.0,
                    a.position.y as f64 / factor + (height - window_height) / 2.0,
                ))?;
            }
            Ok(())
        })
        .on_menu_event(|app, event| route_menu_command(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let host = window.state::<Host>();
                if window.label().starts_with("export-") {
                    return;
                }
                let (dirty, safe) = host
                    .document_states
                    .lock()
                    .unwrap()
                    .get(window.label())
                    .cloned()
                    .unwrap_or((false, true));
                if background_test() {
                    if dirty && (!safe || !dialogs::background_close_confirmed(&host)) {
                        api.prevent_close();
                    }
                    return;
                }
                if !safe && dirty {
                    api.prevent_close();
                    window
                        .dialog()
                        .message(
                            host.storage
                                .text("草稿尚未安全寫入，請稍候或先儲存至 Markdown 檔案"),
                        )
                        .parent(window)
                        .show(|_| {});
                    return;
                }
                if dirty {
                    api.prevent_close();
                    let target = window.clone();
                    window
                        .dialog()
                        .message(if host.storage.english() {
                            "Unsaved drafts are kept locally. Close this window?"
                        } else {
                            "未儲存的草稿會保留在本機。要關閉視窗嗎？"
                        })
                        .parent(window)
                        .buttons(MessageDialogButtons::OkCancel)
                        .show(move |ok| {
                            if ok {
                                let _ = target.destroy();
                            }
                        });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![desktop_call])
        .run(tauri::generate_context!())
        .expect("Unable to start wuffi");
}

use crate::{dialogs, fail, field, image_mime, platform, storage, Host, Record};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{Emitter, Manager};

pub fn recent(host: &Host, record: &Record) -> Result<(), String> {
    let mut settings = host.storage.settings.lock().unwrap();
    let key = if settings["rememberRecent"] == false {
        "recentExcluded"
    } else {
        "recentTokens"
    };
    let mut values = settings[key].as_array().cloned().unwrap_or_default();
    values.retain(|v| v != &record.token);
    values.push(json!(record.token));
    if values.len() > 100 {
        values.remove(0);
    }
    settings[key] = json!(values);
    storage::write_json(&host.storage.root.join("desktop-settings.json"), &settings)
}
pub fn folder(host: &Host, path: PathBuf) -> Result<Value, String> {
    let path = path.canonicalize().map_err(fail)?;
    let token = uuid::Uuid::new_v4().to_string();
    host.storage
        .folders
        .lock()
        .unwrap()
        .insert(token.clone(), path.clone());
    {
        let mut settings = host.storage.settings.lock().unwrap();
        if settings["rememberRecent"] != false {
            let mut history = settings["recentFolders"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            history.retain(|p| p != &json!(path));
            history.insert(0, json!(path));
            history.truncate(15);
            settings["recentFolders"] = json!(history);
            storage::write_json(&host.storage.root.join("desktop-settings.json"), &settings)?;
        }
    }
    Ok(
        json!({"token":token,"path":path,"name":path.file_name().unwrap_or_default().to_string_lossy(),"entries":host.storage.list_folder(&path)?}),
    )
}
pub fn search(host: &Host, data: &Value) -> Result<Value, String> {
    let root = host
        .storage
        .folders
        .lock()
        .unwrap()
        .get(field(data, "token"))
        .cloned()
        .ok_or("未授權的資料夾")?;
    if !root.is_dir() {
        return Err("Invalid folder".into());
    }
    let query = field(data, "query").trim().to_lowercase();
    if query.is_empty() {
        return Ok(json!([]));
    }
    let hidden = host.storage.settings.lock().unwrap()["showHidden"] == true;
    let mut result = vec![];
    let mut visited = 0;
    fn visit(
        host: &Host,
        root: &Path,
        dir: &Path,
        query: &str,
        hidden: bool,
        depth: usize,
        visited: &mut usize,
        result: &mut Vec<Value>,
    ) -> Result<(), String> {
        if depth > 30 || *visited >= 10000 || result.len() >= 500 {
            return Ok(());
        }
        for entry in fs::read_dir(dir).map_err(fail)?.flatten() {
            let ty = entry.file_type().map_err(fail)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if ty.is_symlink()
                || matches!(name.as_str(), "node_modules" | ".git")
                || (!hidden && name.starts_with('.'))
            {
                continue;
            }
            let path = entry.path();
            if ty.is_dir() {
                visit(host, root, &path, query, hidden, depth + 1, visited, result)?;
            } else if crate::document_path(&path) {
                *visited += 1;
                if entry.metadata().map_err(fail)?.len() > 2 * 1024 * 1024 {
                    continue;
                }
                let text = String::from_utf8_lossy(&fs::read(&path).map_err(fail)?).into_owned();
                for (index, line) in text.lines().enumerate() {
                    if line.to_lowercase().contains(query) {
                        let token = uuid::Uuid::new_v4().to_string();
                        host.storage
                            .folders
                            .lock()
                            .unwrap()
                            .insert(token.clone(), path.clone());
                        result.push(json!({"token":token,"path":path.strip_prefix(root).unwrap_or(&path),"line":index+1,"text":line.chars().take(240).collect::<String>()}));
                        if result.len() >= 500 {
                            return Ok(());
                        }
                    }
                }
            }
            if *visited >= 10000 || result.len() >= 500 {
                break;
            }
        }
        Ok(())
    }
    visit(
        host,
        &root,
        &root,
        &query,
        hidden,
        0,
        &mut visited,
        &mut result,
    )?;
    Ok(json!(result))
}
pub async fn file_operation(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    data: Value,
) -> Result<Value, String> {
    let record = host.storage.record(field(&data, "token"))?;
    let path = PathBuf::from(&record.path);
    match field(&data, "action") {
        "encoding" => {
            let label = field(&data, "encoding");
            if ![
                "utf-8",
                "utf-16le",
                "utf-16be",
                "big5",
                "gb18030",
                "shift_jis",
                "windows-1252",
            ]
            .contains(&label)
            {
                return Err("Invalid encoding".into());
            }
            let encoding =
                encoding_rs::Encoding::for_label(label.as_bytes()).ok_or("Invalid encoding")?;
            let bytes = fs::read(&path).map_err(fail)?;
            let (content, _, _) = encoding.decode(&bytes);
            Ok(
                json!({"token":record.token,"path":record.path,"title":record.title,"content":content}),
            )
        }
        "trash" => {
            if !dialogs::confirm(app, window, host, "將檔案移至資源回收筒？") {
                return Ok(Value::Null);
            }
            let source = PathBuf::from(&record.path);
            tokio::task::spawn_blocking(move || platform::recycle(source))
                .await
                .map_err(fail)??;
            host.storage
                .files
                .lock()
                .unwrap()
                .retain(|_, r| r.path != record.path);
            host.storage.persist()?;
            let _ = app.emit(
                "desktop:file-changed",
                json!({"type":"delete","token":record.token,"path":record.path}),
            );
            Ok(json!({"deleted":true}))
        }
        "move" => {
            let Some(target) = dialogs::pick(
                app,
                window,
                host,
                "save",
                &["md", "markdown", "txt"],
                &record.path,
            )?
            else {
                return Ok(Value::Null);
            };
            if target == path {
                return Ok(Value::Null);
            }
            let mut source = fs::File::open(&path).map_err(fail)?;
            let mut output = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&target)
                .map_err(fail)?;
            if let Err(e) = std::io::copy(&mut source, &mut output) {
                drop(output);
                let _ = fs::remove_file(&target);
                return Err(fail(e));
            }
            output.sync_all().map_err(fail)?;
            drop(output);
            drop(source);
            fs::remove_file(&path).map_err(|_| "新位置已建立副本，但原檔無法移除")?;
            let title = target
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            for r in host.storage.files.lock().unwrap().values_mut() {
                if r.path == record.path {
                    r.path = target.to_string_lossy().into();
                    r.title = title.clone();
                }
            }
            host.storage.persist()?;
            let _=app.emit("desktop:file-changed",json!({"type":"rename","token":record.token,"oldPath":record.path,"path":target,"title":title}));
            Ok(json!({"token":record.token,"path":target,"title":title}))
        }
        _ => Err("Invalid file operation".into()),
    }
}
pub async fn pick_image(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    data: Value,
) -> Result<Value, String> {
    let Some(mut target) = dialogs::pick(
        app,
        window,
        host,
        "open",
        &["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"],
        "",
    )?
    else {
        return Ok(Value::Null);
    };
    target = target.canonicalize().map_err(fail)?;
    let record = host.storage.record(field(&data, "token")).ok();
    if data["copy"] == true {
        if let Some(ref record) = record {
            let source = Path::new(&record.path);
            let directory = source.parent().ok_or("Invalid document")?.join(format!(
                "{}.assets",
                source.file_stem().unwrap_or_default().to_string_lossy()
            ));
            fs::create_dir_all(&directory).map_err(fail)?;
            let dest = directory.join(format!(
                "{}-{}",
                uuid::Uuid::new_v4(),
                target.file_name().unwrap_or_default().to_string_lossy()
            ));
            let mut input = fs::File::open(&target).map_err(fail)?;
            let mut out = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&dest)
                .map_err(fail)?;
            std::io::copy(&mut input, &mut out).map_err(fail)?;
            target = dest;
        }
    }
    host.images.lock().unwrap().insert(target.clone());
    storage::write_json(
        &host.storage.root.join("image-access.json"),
        &json!(host.images.lock().unwrap().iter().collect::<Vec<_>>()),
    )?;
    let value = if data["relative"] == true {
        record
            .and_then(|r| PathBuf::from(r.path).parent().map(Path::to_path_buf))
            .and_then(|p| pathdiff(&p, &target))
            .unwrap_or(target)
    } else {
        target
    };
    Ok(json!(value.to_string_lossy().replace('\\', "/")))
}
fn pathdiff(base: &Path, target: &Path) -> Option<PathBuf> {
    let b = base.components().collect::<Vec<_>>();
    let t = target.components().collect::<Vec<_>>();
    if b.first() != t.first() {
        return None;
    }
    let common = b.iter().zip(&t).take_while(|(a, b)| a == b).count();
    let mut path = PathBuf::new();
    for _ in common..b.len() {
        path.push("..");
    }
    for c in &t[common..] {
        path.push(c.as_os_str());
    }
    Some(path)
}
pub async fn resolve_image(host: &Host, data: Value) -> Result<Value, String> {
    let src = field(&data, "src");
    if (src.starts_with("http:") || src.starts_with("https:")) && data["embed"] == true {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(fail)?;
        let mut response = client
            .get(src)
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|_| "Image download failed")?;
        if !response.status().is_success() {
            return Err("Image download failed".into());
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .to_string();
        if ![
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
            "image/svg+xml",
            "image/bmp",
        ]
        .contains(&mime.as_str())
        {
            return Err("Unsupported image response".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(fail)? {
            if bytes.len() + chunk.len() > 30 * 1024 * 1024 {
                return Err("Image exceeds 30 MB".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(json!(format!(
            "data:{mime};base64,{}",
            STANDARD.encode(bytes)
        )));
    }
    if ["http:", "https:", "data:", "blob:"]
        .iter()
        .any(|prefix| src.starts_with(prefix))
    {
        return Ok(json!(src));
    }
    let raw = percent_encoding::percent_decode_str(src)
        .decode_utf8()
        .map_err(fail)?;
    let record = host.storage.record(field(&data, "token")).ok();
    let target = if Path::new(raw.as_ref()).is_absolute() {
        PathBuf::from(raw.as_ref())
    } else {
        Path::new(&record.as_ref().ok_or("請先儲存文章或選擇圖片")?.path)
            .parent()
            .ok_or("Invalid path")?
            .join(raw.as_ref())
    }
    .canonicalize()
    .map_err(fail)?;
    let allowed = host.images.lock().unwrap().contains(&target)
        || record
            .as_ref()
            .and_then(|r| Path::new(&r.path).parent()?.canonicalize().ok())
            .map(|p| target.starts_with(p))
            .unwrap_or(false);
    if !allowed {
        return Err("圖片不在已授權的文章資料夾內".into());
    }
    let mime = image_mime(&target).ok_or("Unsupported image")?;
    if fs::metadata(&target).map_err(fail)?.len() > 30 * 1024 * 1024 {
        return Err("Image exceeds 30 MB".into());
    }
    Ok(json!(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(fs::read(target).map_err(fail)?)
    )))
}
pub async fn upload(host: &Host, data: Value) -> Result<Value, String> {
    let image = field(&data, "image");
    if image.len() > 30 * 1024 * 1024 {
        return Err("Invalid image".into());
    }
    let (header, body) = image.split_once(',').ok_or("Invalid image")?;
    let mime = header
        .strip_prefix("data:")
        .and_then(|v| v.strip_suffix(";base64"))
        .filter(|v| ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(v))
        .ok_or("Invalid image")?;
    let bytes = STANDARD.decode(body).map_err(|_| "Invalid image")?;
    let settings = host.storage.settings.lock().unwrap().clone();
    let token = platform::read_secret(&host.storage.root.join("upload-token.json"))?
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();
    let picgo = settings["uploadProvider"] == "picgo";
    #[allow(unused_mut)]
    let mut picgo_url = "http://127.0.0.1:36677/upload".to_string();
    #[cfg(feature = "safety-tests")]
    if let Some(url) = crate::arg("--picgo-test-url") {
        if reqwest::Url::parse(&url)
            .ok()
            .map(|u| matches!(u.host_str(), Some("127.0.0.1" | "localhost")))
            .unwrap_or(false)
        {
            picgo_url = url;
        }
    }
    let target = host.storage.root.join(format!(
        ".upload-{}.{}",
        uuid::Uuid::new_v4(),
        mime.split('/').nth(1).unwrap_or("png")
    ));
    let result = async {
        let mut request = if picgo {
            fs::write(&target, &bytes).map_err(fail)?;
            host.client.post(&picgo_url).json(&json!({"list":[target]}))
        } else {
            let url = reqwest::Url::parse(field(&settings, "uploadURL"))
                .map_err(|_| "請先設定 HTTPS 圖片上傳端點")?;
            if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
                return Err("請先設定 HTTPS 圖片上傳端點".into());
            }
            let part = reqwest::multipart::Part::bytes(bytes)
                .file_name(format!("image.{}", mime.split('/').nth(1).unwrap_or("png")))
                .mime_str(mime)
                .map_err(fail)?;
            host.client
                .post(url)
                .multipart(reqwest::multipart::Form::new().part("image", part))
        };
        if !token.is_empty() {
            request = request.bearer_auth(token);
        }
        let response = request
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|_| "圖片上傳失敗")?;
        if !response.status().is_success() {
            return Err(format!("上傳失敗：HTTP {}", response.status().as_u16()));
        }
        let value = response
            .json::<Value>()
            .await
            .map_err(|_| "上傳回應格式不正確")?;
        let url = if picgo {
            value["result"][0].as_str()
        } else {
            value["url"]
                .as_str()
                .or_else(|| value["data"]["url"].as_str())
        }
        .ok_or("上傳回應沒有有效圖片網址")?;
        if picgo && value["success"] != true {
            return Err("PicGo 沒有回傳有效圖片網址".into());
        }
        let parsed = reqwest::Url::parse(url).map_err(|_| "上傳回應沒有有效圖片網址")?;
        if !matches!(parsed.scheme(), "https" | "http") {
            return Err("上傳回應沒有有效圖片網址".into());
        }
        Ok(json!(url))
    }
    .await;
    if picgo {
        let _ = fs::remove_file(target);
    }
    result
}

fn path_key(path: &Path) -> String {
    let value = path.to_string_lossy().replace('/', "\\");
    #[cfg(windows)]
    {
        return value.strip_prefix(r"\\?\").unwrap_or(&value).to_lowercase();
    }
    #[cfg(not(windows))]
    {
        value
    }
}
fn file_identity(path: &Path) -> Option<(u64, u64)> {
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::{
            Foundation::HANDLE,
            Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION},
        };
        let file = fs::File::open(path).ok()?;
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        unsafe {
            GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info).ok()?;
        }
        Some((
            info.dwVolumeSerialNumber as u64,
            ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
        ))
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let info = fs::metadata(path).ok()?;
        Some((info.dev(), info.ino()))
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = path;
        None
    }
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn file_identity_survives_rename_and_distinguishes_articles() {
        let root = std::env::temp_dir().join(format!("wuffi-identities-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let a = root.join("one.md");
        let b = root.join("two.md");
        fs::write(&a, "same content").unwrap();
        fs::write(&b, "same content").unwrap();
        let first = file_identity(&a).unwrap();
        assert_ne!(Some(first), file_identity(&b));
        let moved = root.join("renamed.md");
        fs::rename(&a, &moved).unwrap();
        assert_eq!(Some(first), file_identity(&moved));
        assert!(file_identity(&a).is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
pub fn start_watching(app: tauri::AppHandle) {
    use notify::Watcher;
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let Ok(mut watcher) = notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        }) else {
            return;
        };
        let mut watched = std::collections::HashSet::new();
        let mut observed = std::collections::HashMap::<String, String>::new();
        let mut identities = std::collections::HashMap::<String, (u64, u64)>::new();
        let mut rename_from: Option<(PathBuf, std::time::Instant)> = None;
        loop {
            if app.webview_windows().is_empty() {
                break;
            }
            let host = app.state::<Host>();
            let records = host
                .storage
                .files
                .lock()
                .unwrap()
                .values()
                .map(|r| (r.token.clone(), PathBuf::from(&r.path)))
                .collect::<Vec<_>>();
            let folders = host.storage.folders.lock().unwrap().clone();
            for (token, path) in &records {
                if !identities.contains_key(token) {
                    if let Some(id) = file_identity(path) {
                        identities.insert(token.clone(), id);
                    }
                }
            }
            for directory in records
                .iter()
                .filter_map(|(_, p)| p.parent().map(Path::to_path_buf))
                .chain(folders.values().filter(|p| p.is_dir()).cloned())
            {
                if !watched.contains(&directory)
                    && watcher
                        .watch(&directory, notify::RecursiveMode::Recursive)
                        .is_ok()
                {
                    watched.insert(directory);
                }
            }
            let event = match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(e)) => e,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) if rename_from.is_some() => {
                    notify::Event::new(notify::EventKind::Any)
                        .add_path(rename_from.take().unwrap().0)
                }
                _ => continue,
            };
            // Windows supplies separate From/To events. Defer transient deletion
            // and match destinations by volume/file ID, never by event ordering:
            // concurrent renames must not exchange two articles' file tokens.
            if matches!(
                event.kind,
                notify::EventKind::Modify(notify::event::ModifyKind::Name(
                    notify::event::RenameMode::From
                ))
            ) {
                rename_from = event
                    .paths
                    .first()
                    .cloned()
                    .map(|p| (p, std::time::Instant::now()));
                continue;
            }
            if matches!(
                event.kind,
                notify::EventKind::Modify(notify::event::ModifyKind::Name(_))
            ) && !event.paths.is_empty()
            {
                let new = event.paths.last().unwrap();
                let id = file_identity(new);
                rename_from = None;
                let mut changed = vec![];
                for r in host.storage.files.lock().unwrap().values_mut() {
                    let previous = Path::new(&r.path);
                    let case_only = path_key(previous) == path_key(new)
                        && previous.file_name() != new.file_name();
                    if id.is_some()
                        && identities.get(&r.token) == id.as_ref()
                        && (!previous.exists() || case_only)
                    {
                        let old = r.path.clone();
                        r.path = new.to_string_lossy().into();
                        r.title = new.file_stem().unwrap_or_default().to_string_lossy().into();
                        changed.push((old, r.clone()));
                    }
                }
                if !changed.is_empty() {
                    let _ = host.storage.persist();
                    for (old, r) in changed {
                        let _=app.emit("desktop:file-changed",json!({"type":"rename","token":r.token,"oldPath":old,"path":r.path,"title":r.title}));
                    }
                }
            }
            for record in host.storage.files.lock().unwrap().values() {
                let record_key = path_key(Path::new(&record.path));
                if !event.paths.iter().any(|p| {
                    let key = path_key(p);
                    record_key == key || record_key.starts_with(&(key + "\\"))
                }) {
                    continue;
                }
                if let Some(id) = file_identity(Path::new(&record.path)) {
                    identities.insert(record.token.clone(), id);
                }
                let content = match fs::read(&record.path) {
                    Ok(bytes) if bytes.len() <= 10 * 1024 * 1024 => {
                        String::from_utf8_lossy(&bytes).into_owned()
                    }
                    Ok(_) => continue,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        if observed
                            .get(&record.path)
                            .map(|v| v != "deleted")
                            .unwrap_or(true)
                        {
                            let _ = app.emit(
                                "desktop:file-changed",
                                json!({"type":"delete","token":record.token,"path":record.path}),
                            );
                            observed.insert(record.path.clone(), "deleted".into());
                        }
                        continue;
                    }
                    Err(_) => continue,
                };
                let fingerprint = format!("{:x}", Sha256::digest(content.as_bytes()));
                if content != record.content && observed.get(&record.path) != Some(&fingerprint) {
                    let _=app.emit("desktop:file-changed",json!({"type":"change","token":record.token,"path":record.path,"content":content}));
                }
                observed.insert(record.path.clone(), fingerprint);
            }
            for (token, path) in folders {
                if path.is_dir()
                    && event
                        .paths
                        .iter()
                        .any(|p| path_key(p).starts_with(&(path_key(&path) + "\\")))
                {
                    let _ = app.emit("desktop:folder-changed", json!({"token":token,"path":path}));
                }
            }
        }
    });
}

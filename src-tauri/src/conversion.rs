use crate::{dialogs, fail, field, platform, storage, Host};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

pub fn manifest() -> Value {
    serde_json::from_str(include_str!("../../resources/pandoc-release.json"))
        .expect("Pandoc manifest")
}
pub fn verify(directory: &Path, release: &Value) -> Result<bool, String> {
    for file in release["files"]
        .as_array()
        .ok_or("Invalid Pandoc manifest")?
    {
        let path = directory.join(field(file, "name"));
        let meta = match fs::symlink_metadata(&path) {
            Ok(v) => v,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(fail(e)),
        };
        if !meta.is_file()
            || meta.file_type().is_symlink()
            || Some(meta.len()) != file["bytes"].as_u64()
        {
            return Ok(false);
        }
        let mut input = fs::File::open(path).map_err(fail)?;
        let mut hash = Sha256::new();
        let mut bytes = [0; 65536];
        loop {
            let n = input.read(&mut bytes).map_err(fail)?;
            if n == 0 {
                break;
            }
            hash.update(&bytes[..n]);
        }
        if format!("{:x}", hash.finalize()) != field(file, "sha256") {
            return Ok(false);
        }
    }
    Ok(true)
}
struct Stage(PathBuf);
impl Drop for Stage {
    fn drop(&mut self) {
        if self
            .0
            .file_name()
            .map(|n| n.to_string_lossy().starts_with(".install-"))
            .unwrap_or(false)
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
pub async fn ensure(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
) -> Result<PathBuf, String> {
    let _guard = host.conversion_lock.lock().await;
    let release = manifest();
    let root = host.storage.root.join("components/pandoc");
    let installed = root.join(field(&release, "directory"));
    if verify(&installed, &release)? {
        return Ok(installed.join("pandoc.exe"));
    }
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("轉檔工具目前僅支援 Windows x64".into());
    }
    if !dialogs::confirm(
        app,
        window,
        host,
        "下載約 40 MiB，安裝後約佔 225 MiB。完成後可離線匯入、匯出及列印，不會上傳文章內容。",
    ) {
        return Err("已取消轉檔工具下載".into());
    }
    fs::create_dir_all(&root).map_err(fail)?;
    let stage = Stage(root.join(format!(".install-{}", uuid::Uuid::new_v4())));
    fs::create_dir(&stage.0).map_err(fail)?;
    let token = CancellationToken::new();
    *host.conversion_cancel.lock().unwrap() = Some(token.clone());
    let result = async {
        let _ = window.emit(
            "desktop:component-progress",
            json!({"phase":"downloading","received":0,"total":release["bytes"]}),
        );
        let mut url = reqwest::Url::parse(field(&release, "url")).map_err(fail)?;
        let mut response;
        let mut redirects = 0;
        loop {
            if url.scheme() != "https"
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
                || !matches!(
                    url.host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                )
            {
                return Err("轉檔工具下載網址不受信任".into());
            }
            response = tokio::select! {
                result=host.client.get(url.clone()).timeout(Duration::from_secs(300)).send()=>result.map_err(|_|"無法下載轉檔工具，請檢查網路後重試")?,
                _=token.cancelled()=>return Err("已取消轉檔工具下載".into())
            };
            if !response.status().is_redirection() {
                break;
            }
            redirects += 1;
            if redirects > 5 {
                return Err("轉檔工具下載重新導向失敗".into());
            }
            url = url
                .join(
                    response
                        .headers()
                        .get("location")
                        .and_then(|v| v.to_str().ok())
                        .ok_or("下載重新導向失敗")?,
                )
                .map_err(fail)?;
        }
        if !response.status().is_success() {
            return Err("轉檔工具下載失敗".into());
        }
        let expected = release["bytes"].as_u64().ok_or("Invalid manifest")?;
        if response
            .content_length()
            .map(|n| n != expected)
            .unwrap_or(false)
        {
            return Err("轉檔工具下載大小不符".into());
        }
        let archive = stage.0.join("pandoc.zip");
        let mut output = tokio::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&archive)
            .await
            .map_err(fail)?;
        let mut hash = Sha256::new();
        let mut received = 0u64;
        let mut last_progress = std::time::Instant::now();
        loop {
            let next = tokio::select! {result=response.chunk()=>result.map_err(|_|"轉檔工具下載中斷，請重試")?,_=token.cancelled()=>return Err("已取消轉檔工具下載".into())};
            let Some(chunk) = next else {
                break;
            };
            if token.is_cancelled() {
                return Err("已取消轉檔工具下載".into());
            }
            received += chunk.len() as u64;
            if received > expected {
                return Err("轉檔工具下載大小不符".into());
            }
            hash.update(&chunk);
            output.write_all(&chunk).await.map_err(fail)?;
            if last_progress.elapsed() > Duration::from_millis(100) {
                let _ = window.emit(
                    "desktop:component-progress",
                    json!({"phase":"downloading","received":received,"total":expected}),
                );
                last_progress = std::time::Instant::now();
            }
        }
        output.flush().await.map_err(fail)?;
        drop(output);
        if received != expected || format!("{:x}", hash.finalize()) != field(&release, "sha256") {
            return Err("轉檔工具下載驗證失敗，請重試".into());
        }
        let _ = window.emit(
            "desktop:component-progress",
            json!({"phase":"installing","received":received,"total":expected}),
        );
        let payload = stage.0.join("payload");
        fs::create_dir(&payload).map_err(fail)?;
        let request = json!({"archive":archive,"directory":payload,"files":release["files"]});
        tokio::task::spawn_blocking(move || platform::run("extract", request))
            .await
            .map_err(fail)??;
        if token.is_cancelled() {
            return Err("已取消轉檔工具下載".into());
        }
        if !verify(&payload, &release)? {
            return Err("轉檔工具安裝驗證失敗".into());
        }
        if !verify(&installed, &release)? {
            if installed.exists() {
                fs::rename(&installed, stage.0.join("previous")).map_err(fail)?;
            }
            if let Err(e) = fs::rename(&payload, &installed) {
                if !verify(&installed, &release)? {
                    return Err(fail(e));
                }
            }
        }
        Ok(installed.join("pandoc.exe"))
    };
    // Let extraction finish before removing staging; aborting spawn_blocking
    // would otherwise leave a helper writing into an already removed folder.
    let result = result.await;
    *host.conversion_cancel.lock().unwrap() = None;
    let _ = window.emit("desktop:component-progress", json!({"phase":"done"}));
    result
}
pub async fn run(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    args: Vec<String>,
    input: String,
    cwd: Option<PathBuf>,
) -> Result<String, String> {
    let executable = ensure(app, window, host).await?;
    let mut cmd = tokio::process::Command::new(executable);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    let mut child = cmd.spawn().map_err(fail)?;
    let mut stdin = child.stdin.take().ok_or("Unable to open converter")?;
    let writer = tokio::spawn(async move { stdin.write_all(input.as_bytes()).await });
    let output = tokio::time::timeout(Duration::from_secs(60), child.wait_with_output())
        .await
        .map_err(|_| "轉換超過 60 秒")?
        .map_err(fail)?;
    let _ = writer.await;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(4000)
            .collect());
    }
    String::from_utf8(output.stdout).map_err(fail)
}
fn format(extension: &str) -> Option<&str> {
    match extension {
        "docx" | "odt" | "rtf" | "epub" | "rst" | "textile" | "opml" => Some(extension),
        "tex" => Some("latex"),
        "wiki" => Some("mediawiki"),
        "html" | "htm" => Some("html5"),
        _ => None,
    }
}
fn markdown(data: &Value) -> String {
    let mut result = "markdown".to_string();
    for (key, extension) in [
        ("highlight", "mark"),
        ("inlineMath", "tex_math_dollars"),
        ("subscript", "subscript"),
        ("superscript", "superscript"),
        ("autoLink", "autolink_bare_uris"),
        ("latexDelimiters", "tex_math_single_backslash"),
    ] {
        if let Some(on) = data["syntax"][key].as_bool() {
            result.push(if on { '+' } else { '-' });
            result.push_str(extension);
        }
    }
    result
}
pub async fn handle(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    host: &Host,
    method: &str,
    data: Value,
) -> Result<Value, String> {
    let templates = host.storage.root.join("export-templates.json");
    let mut saved = storage::read_json(&templates)
        .filter(|v| v.is_object())
        .unwrap_or(json!({}));
    if method == "exportTemplates" {
        match field(&data, "action") {
            "list" => return Ok(saved),
            "clear" | "choose" => {
                let extension = field(&data, "format");
                format(extension).ok_or("Invalid format")?;
                if data["action"] == "clear" {
                    saved.as_object_mut().unwrap().remove(extension);
                } else {
                    let filters = if matches!(extension, "docx" | "odt") {
                        vec![extension]
                    } else {
                        vec![]
                    };
                    let Some(path) = dialogs::pick(app, window, host, "open", &filters, "")? else {
                        return Ok(saved);
                    };
                    if fs::metadata(&path).map_err(fail)?.len() > 30 * 1024 * 1024 {
                        return Err("模板必須小於 30 MB".into());
                    }
                    if matches!(extension, "docx" | "odt")
                        && path
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|s| !s.eq_ignore_ascii_case(extension))
                            .unwrap_or(true)
                    {
                        return Err("參考文件格式不符".into());
                    }
                    saved[extension] = json!(path);
                }
                storage::write_json(&templates, &saved)?;
                return Ok(saved);
            }
            _ => return Err("Invalid template action".into()),
        }
    }
    if method == "renderMarkdown" {
        let html = run(
            app,
            window,
            host,
            vec![
                format!("--from={}", markdown(&data)),
                "--to=html5".into(),
                "--mathml".into(),
                "--wrap=none".into(),
            ],
            field(&data, "markdown").into(),
            None,
        )
        .await?;
        return Ok(json!(html));
    }
    if method == "convert" {
        let extension = field(&data, "format");
        let to = format(extension).ok_or("Invalid conversion")?;
        let Some(target) = dialogs::pick(
            app,
            window,
            host,
            "save",
            &[extension],
            &format!(
                "{}.{}",
                dialogs::file_name(field(&data, "title")),
                extension
            ),
        )?
        else {
            return Ok(Value::Null);
        };
        let mut content = field(&data, "markdown").to_string();
        let mut args = vec![
            format!("--from={}", markdown(&data)),
            format!("--to={to}"),
            "--standalone".into(),
            "--output".into(),
            target.to_string_lossy().into(),
        ];
        if content
            .lines()
            .any(|line| line.eq_ignore_ascii_case("[toc]"))
        {
            args.push("--toc".into());
            content = content
                .lines()
                .filter(|line| !line.eq_ignore_ascii_case("[toc]"))
                .collect::<Vec<_>>()
                .join("\n");
        }
        if let Some(template) = saved[extension].as_str() {
            args.extend([
                if matches!(extension, "docx" | "odt") {
                    "--reference-doc"
                } else {
                    "--template"
                }
                .into(),
                template.into(),
            ]);
        }
        let cwd = host
            .storage
            .record(field(&data, "token"))
            .ok()
            .and_then(|r| PathBuf::from(r.path).parent().map(Path::to_path_buf));
        if let Some(ref cwd) = cwd {
            args.extend(["--resource-path".into(), cwd.to_string_lossy().into()]);
        }
        return match run(app, window, host, args, content, cwd).await {
            Ok(_) => Ok(json!(target)),
            Err(e) if e == "已取消轉檔工具下載" => Ok(Value::Null),
            Err(e) => Err(e),
        };
    }
    let Some(source) = dialogs::pick(
        app,
        window,
        host,
        "open",
        &[
            "docx", "odt", "epub", "html", "htm", "tex", "rst", "textile", "opml",
        ],
        "",
    )?
    else {
        return Ok(Value::Null);
    };
    let extension = source
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();
    let from = if matches!(extension.as_str(), "html" | "htm") {
        "html"
    } else {
        format(&extension).ok_or("Invalid import")?
    };
    let stage = Stage(
        host.storage
            .root
            .join(format!(".install-import-{}", uuid::Uuid::new_v4())),
    );
    fs::create_dir_all(&stage.0).map_err(fail)?;
    let media = stage.0.join("media");
    fs::create_dir(&media).map_err(fail)?;
    let mut result = match run(
        app,
        window,
        host,
        vec![
            format!("--from={from}"),
            "--to=markdown".into(),
            "--wrap=none".into(),
            format!("--extract-media={}", media.display()),
            source.to_string_lossy().into(),
        ],
        String::new(),
        source.parent().map(Path::to_path_buf),
    )
    .await
    {
        Ok(v) => v,
        Err(e) if e == "已取消轉檔工具下載" => return Ok(Value::Null),
        Err(e) => return Err(e),
    };
    fn embed(root: &Path, directory: &Path, result: &mut String) -> Result<(), String> {
        for entry in fs::read_dir(directory).map_err(fail)? {
            let entry = entry.map_err(fail)?;
            let path = entry.path();
            let meta = entry.file_type().map_err(fail)?;
            if meta.is_symlink() {
                continue;
            }
            if meta.is_dir() {
                embed(root, &path, result)?;
            } else if let Some(mime) = crate::image_mime(&path) {
                if fs::metadata(&path).map_err(fail)?.len() > 30 * 1024 * 1024 {
                    return Err("匯入圖片超過 30 MB".into());
                }
                let uri = format!(
                    "data:{mime};base64,{}",
                    STANDARD.encode(fs::read(&path).map_err(fail)?)
                );
                *result = result
                    .replace(path.to_string_lossy().as_ref(), &uri)
                    .replace(&path.to_string_lossy().replace('\\', "/"), &uri);
                let mixed = format!(
                    "{}/{}",
                    root.display(),
                    path.strip_prefix(root)
                        .map_err(fail)?
                        .to_string_lossy()
                        .replace('\\', "/")
                );
                *result = result
                    .replace(&mixed, &uri)
                    .replace(&mixed.replace('\\', "\\\\"), &uri)
                    .replace(&mixed.replace(' ', "%20"), &uri);
                const ESCAPES: &percent_encoding::AsciiSet = &percent_encoding::CONTROLS
                    .add(b' ')
                    .add(b'"')
                    .add(b'<')
                    .add(b'>')
                    .add(b'`')
                    .add(b'(')
                    .add(b')')
                    .add(b'#');
                let forward = path.to_string_lossy().replace('\\', "/");
                *result = result.replace(
                    &percent_encoding::utf8_percent_encode(&forward, ESCAPES).to_string(),
                    &uri,
                );
                if let Ok(url) = reqwest::Url::from_file_path(&path) {
                    *result = result.replace(url.as_str(), &uri);
                }
            }
        }
        Ok(())
    }
    embed(&media, &media, &mut result)?;
    result = regex::Regex::new(r"\]\(<(data:image/[^>]+)>\)")
        .map_err(fail)?
        .replace_all(&result, "]($1)")
        .into_owned();
    result = regex::Regex::new(r"(\]\(data:image/[^)]+\))\{[^}]*\}")
        .map_err(fail)?
        .replace_all(&result, "$1")
        .into_owned();
    Ok(json!({"title":source.file_stem().unwrap_or_default().to_string_lossy(),"content":result}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pinned_manifest_and_corrupt_cache() {
        let release = manifest();
        assert_eq!(field(&release, "version"), "3.12.1");
        let dir = std::env::temp_dir().join(format!("wuffi-pandoc-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        assert!(!verify(&dir, &release).unwrap());
        fs::write(dir.join("pandoc.exe"), b"invalid").unwrap();
        assert!(!verify(&dir, &release).unwrap());
        fs::remove_dir_all(dir).unwrap();
    }
}

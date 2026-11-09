use crate::{dialogs, fail, field, Host};
use serde_json::{json, Value};
use std::{fs, path::Path, time::Duration};
use tauri::WebviewWindow;

#[cfg(windows)]
async fn pdf(window: &WebviewWindow, path: &Path, data: Value) -> Result<(), String> {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PrintToPdfCompletedHandler};
    use windows::core::{Interface, HSTRING};
    let (tx, rx) = tokio::sync::oneshot::channel();
    let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let target = path.to_string_lossy().into_owned();
    window
        .with_webview(move |webview| {
            let complete = sender.clone();
            let result = (|| -> windows::core::Result<()> {
                unsafe {
                    let core = webview
                        .controller()
                        .CoreWebView2()?
                        .cast::<ICoreWebView2_7>()?;
                    let settings = webview
                        .environment()
                        .cast::<ICoreWebView2Environment6>()?
                        .CreatePrintSettings()?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    settings
                        .SetScaleFactor(data["scale"].as_f64().unwrap_or(1.0).clamp(0.5, 2.0))?;
                    let (w, h) = match field(&data, "paperSize") {
                        "A3" => (11.69, 16.54),
                        "A5" => (5.83, 8.27),
                        "Letter" => (8.5, 11.0),
                        "Legal" => (8.5, 14.0),
                        "Tabloid" => (11.0, 17.0),
                        _ => (8.27, 11.69),
                    };
                    settings.SetPageWidth(w)?;
                    settings.SetPageHeight(h)?;
                    settings.SetOrientation(if data["landscape"] == true {
                        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
                    } else {
                        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
                    })?;
                    let margin = data["margin"].as_f64().unwrap_or(20.0).clamp(0.0, 80.0) / 25.4;
                    settings.SetMarginTop(margin)?;
                    settings.SetMarginBottom(margin)?;
                    settings.SetMarginLeft(margin)?;
                    settings.SetMarginRight(margin)?;
                    let callback =
                        PrintToPdfCompletedHandler::create(Box::new(move |status, success| {
                            if let Some(tx) = complete.lock().unwrap().take() {
                                let _ = tx.send(if status.is_ok() && success {
                                    Ok(())
                                } else {
                                    Err("PDF 匯出失敗".to_string())
                                });
                            }
                            Ok(())
                        }));
                    core.PrintToPdf(&HSTRING::from(target), &settings, &callback)
                }
            })();
            if result.is_err() {
                if let Some(tx) = sender.lock().unwrap().take() {
                    let _ = tx.send(Err("PDF 匯出失敗".to_string()));
                }
            }
        })
        .map_err(fail)?;
    tokio::time::timeout(Duration::from_secs(60), rx)
        .await
        .map_err(|_| "PDF 匯出逾時")?
        .map_err(|_| "PDF 匯出失敗")?
}
#[cfg(not(windows))]
async fn pdf(_window: &WebviewWindow, _path: &Path, _data: Value) -> Result<(), String> {
    Err("PDF 匯出目前僅支援 Windows".into())
}

async fn ready(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::ExecuteScriptCompletedHandler;
        use windows::core::HSTRING;
        for _ in 0..200 {
            let (tx, rx) = tokio::sync::oneshot::channel();
            window.with_webview(move|webview|{unsafe{if let Ok(core)=webview.controller().CoreWebView2(){let cb=ExecuteScriptCompletedHandler::create(Box::new(move|_,value|{let _=tx.send(value=="true");Ok(())}));let _=core.ExecuteScript(&HSTRING::from("document.readyState==='complete'&&document.fonts.status==='loaded'&&Array.from(document.images).every(i=>i.complete)"),&cb);}}}).map_err(fail)?;
            if tokio::time::timeout(Duration::from_secs(2), rx)
                .await
                .ok()
                .and_then(Result::ok)
                == Some(true)
            {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        return Err("等待匯出文件排版逾時".into());
    }
    #[cfg(not(windows))]
    {
        tokio::time::sleep(Duration::from_secs(1)).await;
        Ok(())
    }
}
pub async fn export(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    host: &Host,
    data: Value,
) -> Result<Value, String> {
    let format = field(&data, "format");
    if crate::background_test() && format == "print" {
        return Err("System printing requires visible desktop verification".into());
    }
    if !["pdf", "html", "print"].contains(&format) {
        return Err("Invalid export format".into());
    }
    let html = field(&data, "html");
    if html.len() > 100 * 1024 * 1024 {
        return Err("Export document too large".into());
    }
    let target = if format == "print" {
        None
    } else {
        let Some(path) = dialogs::pick(
            app,
            window,
            host,
            "save",
            &[format],
            &format!("{}.{}", dialogs::file_name(field(&data, "title")), format),
        )?
        else {
            return Ok(Value::Null);
        };
        Some(path)
    };
    if format == "html" {
        crate::storage::atomic_write(target.as_ref().unwrap(), html.as_bytes())?;
        return Ok(json!(target));
    }
    let id = format!("export-{}", uuid::Uuid::new_v4());
    let temporary = host.storage.root.join(format!("{id}.html"));
    let css_string = |text: &str| {
        serde_json::to_string(text)
            .unwrap_or_default()
            .replace('<', "\\3c ")
            .replace('>', "\\3e ")
    };
    let footer = if data["pageNumbers"] == true {
        format!(
            "{} ' ' counter(page) ' / ' counter(pages)",
            css_string(field(&data, "footer"))
        )
    } else {
        css_string(field(&data, "footer"))
    };
    let protected=format!("<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;\">{html}<style>@page{{@top-center{{content:{}}}@bottom-center{{content:{footer}}}}}</style>",css_string(field(&data,"header")));
    fs::write(&temporary, protected).map_err(fail)?;
    let url = tauri::Url::from_file_path(&temporary).map_err(|_| "Invalid print path")?;
    let export_window =
        tauri::WebviewWindowBuilder::new(app, &id, tauri::WebviewUrl::External(url.clone()))
            .title("wuffi — Print")
            .visible(false)
            .on_navigation(move |next| next == &url)
            .build()
            .map_err(fail)?;
    let result = async {
        ready(&export_window).await?;
        if format == "print" {
            export_window.show().map_err(fail)?;
            export_window.print().map_err(fail)?;
            Ok(Value::Null)
        } else {
            let target = target.as_ref().unwrap();
            let staging = target.with_file_name(format!(".wuffi-{}.pdf", uuid::Uuid::new_v4()));
            let result = pdf(&export_window, &staging, data.clone()).await;
            if let Err(error) = result {
                let _ = fs::remove_file(&staging);
                return Err(error);
            }
            fs::rename(&staging, target).map_err(fail)?;
            Ok(json!(target))
        }
    }
    .await;
    if format != "print" || result.is_err() {
        let _ = export_window.destroy();
    }
    let _ = fs::remove_file(&temporary);
    result
}

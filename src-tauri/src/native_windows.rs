use crate::fail;
use tauri::WebviewWindow;

#[cfg(windows)]
pub async fn toggle_devtools(window: &WebviewWindow) -> Result<(), String> {
    use windows::core::BOOL;
    use windows::Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
        },
    };
    struct Search {
        process: u32,
        title: String,
        found: Option<HWND>,
    }
    unsafe extern "system" fn visit(hwnd: HWND, parameter: LPARAM) -> BOOL {
        let search = &mut *(parameter.0 as *mut Search);
        let mut process = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process));
        if process == search.process {
            let mut title = [0u16; 2048];
            let length = GetWindowTextW(hwnd, &mut title) as usize;
            if String::from_utf16_lossy(&title[..length]) == search.title {
                search.found = Some(hwnd);
            }
        }
        BOOL(1)
    }
    let url = window.url().map_err(fail)?;
    let title = format!(
        "DevTools - {}",
        url.as_str()
            .trim_start_matches("http://")
            .trim_start_matches("https://")
    );
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<bool, String> {
                unsafe {
                    let mut process = 0;
                    webview
                        .controller()
                        .CoreWebView2()
                        .map_err(fail)?
                        .BrowserProcessId(&mut process)
                        .map_err(fail)?;
                    let mut search = Search {
                        process,
                        title,
                        found: None,
                    };
                    EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize))
                        .map_err(fail)?;
                    if let Some(hwnd) = search.found {
                        // Wry's Windows close/is_open methods are unsupported. Close
                        // only this WebView browser process's inspector for this URL.
                        PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)).map_err(fail)?;
                        Ok(true)
                    } else {
                        Ok(false)
                    }
                }
            })();
            let _ = sender.send(result);
        })
        .map_err(fail)?;
    if !receiver.await.map_err(fail)?? {
        window.open_devtools();
    }
    Ok(())
}

#[cfg(not(windows))]
pub async fn toggle_devtools(window: &WebviewWindow) -> Result<(), String> {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
    Ok(())
}

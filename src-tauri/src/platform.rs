use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    io::Write,
    process::{Command, Stdio},
};

// Fixed script with base64 UTF-8 JSON over stdin. Neither paths nor secrets are
// interpolated into code or command-line arguments. All helpers stay hidden.
const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
try {
 $r = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
 switch ($r.operation) {
  'protect' {
   Add-Type -AssemblyName System.Security
   $b = [Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String($r.data),[Text.Encoding]::UTF8.GetBytes('Wuffi Windows user storage v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
   [Console]::Out.Write([Convert]::ToBase64String($b))
  }
  'unprotect' {
   Add-Type -AssemblyName System.Security
   $b = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($r.data),[Text.Encoding]::UTF8.GetBytes('Wuffi Windows user storage v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
   [Console]::Out.Write([Convert]::ToBase64String($b))
  }
  'extract' {
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   $zip = [IO.Compression.ZipFile]::OpenRead($r.archive)
   try { foreach ($f in $r.files) {
    $e = $zip.GetEntry($f.entry)
    if ($null -eq $e -or $e.Length -ne $f.bytes) { throw 'Invalid entry' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($e,[IO.Path]::Combine($r.directory,$f.name))
   }} finally { $zip.Dispose() }
  }
  default { throw 'Invalid operation' }
 }
} catch { exit 1 }
"#;

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn windows_secret_roundtrip_and_corruption() {
        let root = std::env::temp_dir().join(format!("wuffi-crypto-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let file = root.join("secret.json");
        let value = json!({"text":"中文 🐕","key":"FAKE-TEST-KEY-ONLY"});
        write_secret(&file, &value).unwrap();
        let raw = std::fs::read_to_string(&file).unwrap();
        assert!(!raw.contains("FAKE-TEST-KEY-ONLY"));
        assert_eq!(read_secret(&file).unwrap(), Some(value));
        std::fs::write(&file, "{broken").unwrap();
        assert!(read_secret(&file).is_err());
        write_secret(&file, &Value::Null).unwrap();
        assert!(read_secret(&file).unwrap().is_none());
        std::fs::remove_dir(root).unwrap();
    }
}

pub fn run(operation: &str, mut data: Value) -> Result<Vec<u8>, String> {
    #[cfg(not(windows))]
    {
        let _ = (operation, data);
        return Err("此桌面功能目前僅支援 Windows".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        data["operation"] = json!(operation);
        let executable = std::path::PathBuf::from(
            std::env::var_os("SystemRoot").unwrap_or("C:\\Windows".into()),
        )
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let mut child = Command::new(executable)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                SCRIPT,
            ])
            .creation_flags(0x08000000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Windows helper unavailable")?;
        child
            .stdin
            .take()
            .ok_or("Windows helper unavailable")?
            .write_all(
                STANDARD
                    .encode(serde_json::to_vec(&data).map_err(|_| "Invalid request")?)
                    .as_bytes(),
            )
            .map_err(|_| "Windows helper failed")?;
        let started = std::time::Instant::now();
        while child
            .try_wait()
            .map_err(|_| "Windows helper failed")?
            .is_none()
        {
            if started.elapsed() > std::time::Duration::from_secs(60) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Windows helper timed out".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let output = child
            .wait_with_output()
            .map_err(|_| "Windows helper failed")?;
        if !output.status.success() {
            return Err("Windows helper failed".into());
        }
        Ok(output.stdout)
    }
}

pub fn read_secret(path: &std::path::Path) -> Result<Option<Value>, String> {
    let bytes = match std::fs::read(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("storage_error".into()),
    };
    let envelope: Value = serde_json::from_slice(&bytes).map_err(|_| "storage_error")?;
    if envelope["version"] != 1 || envelope["backend"] != "windows-dpapi" {
        return Err("storage_error".into());
    }
    let plaintext =
        run("unprotect", json!({"data":envelope["encrypted"]})).map_err(|_| "storage_error")?;
    let decoded = STANDARD.decode(plaintext).map_err(|_| "storage_error")?;
    serde_json::from_slice(&decoded)
        .map(Some)
        .map_err(|_| "storage_error".into())
}

pub fn recycle(path: std::path::PathBuf) -> Result<(), String> {
    #[cfg(windows)]
    {
        // IFileOperation accepts normal shell paths, not canonical \\?\ paths.
        // RECYCLEONDELETE explicitly requests recycling instead of permanent deletion.
        std::thread::spawn(move || unsafe {
            use windows::{
                core::HSTRING,
                Win32::{System::Com::*, UI::Shell::*},
            };
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(crate::fail)?;
            let result = (|| -> windows::core::Result<()> {
                let text = path.to_string_lossy();
                let display = if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
                    format!(r"\\{unc}")
                } else {
                    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
                };
                let operation: IFileOperation =
                    CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)?;
                operation.SetOperationFlags(
                    FOF_NO_UI | FOF_ALLOWUNDO | FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE,
                )?;
                let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(display), None)?;
                operation.DeleteItem(&item, None)?;
                operation.PerformOperations()?;
                if operation.GetAnyOperationsAborted()?.as_bool() {
                    return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                        0x80004004u32 as i32,
                    )));
                }
                Ok(())
            })();
            CoUninitialize();
            result.map_err(|_| "無法完成資源回收筒操作，請檢查原檔位置".into())
        })
        .join()
        .map_err(|_| "資源回收筒操作失敗")?
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("資源回收筒目前僅支援 Windows".into())
    }
}

pub fn write_secret(path: &std::path::Path, value: &Value) -> Result<(), String> {
    if value.is_null() {
        return match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("storage_error".into()),
        };
    }
    let encrypted = run(
        "protect",
        json!({"data":STANDARD.encode(serde_json::to_vec(value).map_err(|_| "storage_error")?)}),
    )
    .map_err(|_| "storage_error")?;
    let encrypted = String::from_utf8(encrypted).map_err(|_| "storage_error")?;
    crate::storage::write_json(
        path,
        &json!({"version":1,"backend":"windows-dpapi","encrypted":encrypted}),
    )
    .map_err(|_| "storage_error".into())
}

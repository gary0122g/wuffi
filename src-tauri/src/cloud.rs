//! Optional hosted services. The sign-in is kept encrypted for the current
//! Windows user (DPAPI) so it survives restarts; it never reaches renderer state.
use reqwest::Client;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex, time::Duration};

pub const ORIGIN: &str = "https://app.wuffi.app";
/// The server rejected the stored sign-in (expired or revoked).
const SIGNED_OUT: &str = "登入已過期，請重新登入 wuffi；Local AI 不需要登入";

#[derive(Default)]
pub struct Cloud {
    pub state: Mutex<Session>,
    /// Where the encrypted sign-in lives; None keeps it in memory only.
    file: Option<PathBuf>,
}
#[derive(Default)]
pub struct Session {
    pub generation: u64,
    pub device: Option<String>,
    pub token: Option<String>,
    loaded: bool,
}

pub async fn call(client: &Client, path: &str, token: Option<&str>, data: Option<Value>) -> Result<Value, String> {
    let mut request = if let Some(data) = data {
        client.post(format!("{ORIGIN}/api/desktop/{path}")).json(&data)
    } else {
        client.get(format!("{ORIGIN}/api/desktop/{path}"))
    };
    if let Some(token) = token { request = request.bearer_auth(token); }
    let response = request.timeout(Duration::from_secs(if path == "agent" { 150 } else { 15 }))
        .send().await.map_err(|_| "無法連線至 wuffi 雲端，仍可使用本機編輯與 Local AI")?;
    let status = response.status();
    if status.as_u16() == 401 && token.is_some() { return Err(SIGNED_OUT.into()); }
    if status.as_u16() == 404 { return Err("雲端桌面連線尚未部署，請稍後再試；Local AI 不受影響".into()); }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "雲端回覆中斷")? {
        if bytes.len() + chunk.len() > 2_000_000 { return Err("雲端回覆過大".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "雲端回覆格式錯誤")?;
    if !status.is_success() {
        return Err(value["error"].as_str().unwrap_or("雲端請求失敗，請重新登入或稍後再試").chars().take(500).collect());
    }
    Ok(value)
}

impl Cloud {
    pub fn new(file: PathBuf) -> Self {
        Cloud { state: Mutex::default(), file: Some(file) }
    }
    /// Reads the saved sign-in once, on first use, so startup stays fast.
    fn load(&self) {
        if self.state.lock().unwrap().loaded { return; }
        let saved = self.file.as_deref().and_then(|file| crate::platform::read_secret(file).ok().flatten())
            .and_then(|value| value["token"].as_str().map(str::to_owned));
        let mut state = self.state.lock().unwrap();
        if !state.loaded { state.loaded = true; if state.token.is_none() { state.token = saved; } }
    }
    fn save(&self, token: Option<&str>) {
        if let Some(file) = &self.file {
            let _ = crate::platform::write_secret(file, &token.map_or(Value::Null, |token| json!({"token":token})));
        }
    }
    /// Forgets a sign-in the server no longer accepts.
    pub fn rejected(&self, error: &str, token: &str) {
        if error != SIGNED_OUT { return; }
        let mut state = self.state.lock().unwrap();
        if state.token.as_deref() == Some(token) { state.token = None; drop(state); self.save(None); }
    }
    pub fn token(&self) -> Result<String, String> {
        self.load();
        self.state.lock().unwrap().token.clone().ok_or("請先登入 wuffi；Local AI 不需要登入".into())
    }
    pub async fn action(&self, client: &Client, action: &str) -> Result<Value, String> {
        match action {
            "start" => {
                let generation = { let mut s = self.state.lock().unwrap(); s.generation += 1; s.device = None; s.generation };
                let value = call(client, "device", None, Some(json!({}))).await?;
                if value["verification_uri"] != format!("{ORIGIN}/auth/desktop") { return Err("登入網址不正確".into()); }
                let device = value["device_code"].as_str().ok_or("登入回覆無效")?.to_owned();
                let mut state = self.state.lock().unwrap();
                if state.generation != generation { return Err("登入已取消".into()); }
                state.device = Some(device);
                let code=value["user_code"].as_str().ok_or("登入回覆無效")?;
                if code.len()!=12 || !code.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("登入回覆無效".into()); }
                Ok(json!({"browserUrl":format!("{ORIGIN}/auth/desktop?code={code}"),"expiresIn":value["expires_in"]}))
            }
            "poll" => {
                let (device, generation) = { let s = self.state.lock().unwrap(); (s.device.clone().ok_or("請重新登入")?, s.generation) };
                let value = call(client, "token", None, Some(json!({"device_code":device}))).await?;
                let mut state = self.state.lock().unwrap();
                if state.generation != generation { return Err("登入已取消".into()); }
                if value["pending"] == true { return Ok(json!({"pending":true})); }
                let token = value["access_token"].as_str().ok_or("登入回覆無效")?.to_owned();
                state.token = Some(token.clone());
                state.loaded = true;
                state.device = None;
                drop(state);
                self.save(Some(&token));
                Ok(json!({"signedIn":true}))
            }
            "status" => match self.token() {
                Ok(token) => match call(client, "session", Some(&token), None).await {
                    Err(error) if error == SIGNED_OUT => { self.rejected(&error, &token); Ok(json!({"signedIn":false})) }
                    result => result,
                },
                Err(_) => Ok(json!({"signedIn":false})),
            },
            "logout" => {
                self.load();
                let token = { let mut s = self.state.lock().unwrap(); s.generation += 1; s.device = None; s.token.take() };
                self.save(None);
                if let Some(token) = token { call(client, "logout", Some(&token), Some(json!({}))).await?; }
                Ok(json!({"signedIn":false}))
            }
            _ => Err("未知的會員操作".into()),
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn sign_in_survives_restart_until_rejected() {
        let root = std::env::temp_dir().join(format!("wuffi-cloud-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let file = root.join("cloud-session.json");
        let first = Cloud::new(file.clone());
        assert!(first.token().is_err(), "nothing saved yet");
        first.state.lock().unwrap().token = Some("FAKE-DESKTOP-TOKEN".into());
        first.save(Some("FAKE-DESKTOP-TOKEN"));
        assert!(!std::fs::read_to_string(&file).unwrap().contains("FAKE-DESKTOP-TOKEN"), "stored encrypted");
        let restarted = Cloud::new(file.clone());
        assert_eq!(restarted.token().unwrap(), "FAKE-DESKTOP-TOKEN");
        restarted.rejected("network down", "FAKE-DESKTOP-TOKEN");
        assert!(restarted.token().is_ok(), "only a server rejection signs out");
        restarted.rejected(SIGNED_OUT, "FAKE-DESKTOP-TOKEN");
        assert!(restarted.token().is_err());
        assert!(!file.exists(), "rejected sign-in is removed from disk");
        std::fs::remove_dir(root).unwrap();
    }
}

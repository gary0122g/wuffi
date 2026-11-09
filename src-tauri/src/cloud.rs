//! Optional hosted services. Credentials stay in process memory, never renderer state.
use reqwest::Client;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};

pub const ORIGIN: &str = "https://app.wuffi.app";
#[derive(Default)]
pub struct Cloud {
    pub state: Mutex<Session>,
}
#[derive(Default)]
pub struct Session {
    pub generation: u64,
    pub device: Option<String>,
    pub token: Option<String>,
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
    pub fn token(&self) -> Result<String, String> {
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
                Ok(json!({"code":value["user_code"],"expiresIn":value["expires_in"]}))
            }
            "poll" => {
                let (device, generation) = { let s = self.state.lock().unwrap(); (s.device.clone().ok_or("請重新登入")?, s.generation) };
                let value = call(client, "token", None, Some(json!({"device_code":device}))).await?;
                let mut state = self.state.lock().unwrap();
                if state.generation != generation { return Err("登入已取消".into()); }
                if value["pending"] == true { return Ok(json!({"pending":true})); }
                state.token = Some(value["access_token"].as_str().ok_or("登入回覆無效")?.to_owned());
                state.device = None;
                Ok(json!({"signedIn":true}))
            }
            "status" => match self.token() {
                Ok(token) => call(client, "session", Some(&token), None).await,
                Err(_) => Ok(json!({"signedIn":false})),
            },
            "logout" => {
                let token = { let mut s = self.state.lock().unwrap(); s.generation += 1; s.device = None; s.token.take() };
                if let Some(token) = token { call(client, "logout", Some(&token), Some(json!({}))).await?; }
                Ok(json!({"signedIn":false}))
            }
            _ => Err("未知的會員操作".into()),
        }
    }
}

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{net::IpAddr, time::Duration};

fn local_or_private_host(host: &str) -> bool {
    if host == "localhost" {
        return true;
    }
    match host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
    {
        Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
        Ok(IpAddr::V6(ip)) => {
            ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local()
        }
        Err(_) => false,
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Connection {
    #[serde(rename = "baseURL")]
    pub base_url: String,
    pub model: String,
}
impl Default for Connection {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:8080/v1".into(),
            model: "qwen3.8-flash-next-iq3_xxs".into(),
        }
    }
}
pub fn validate(value: Value) -> Result<Connection, String> {
    let mut config: Connection = serde_json::from_value(value).map_err(|_| "AI 連線格式不正確")?;
    let url = Url::parse(&config.base_url).map_err(|_| "AI 位址格式不正確")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.scheme(), "http" | "https")
    {
        return Err("AI 位址格式不正確".into());
    }
    if url.scheme() == "http" && !url.host_str().is_some_and(local_or_private_host) {
        return Err("HTTP 僅限本機或區域網路 AI 服務；公網服務請使用 HTTPS".into());
    }
    config.model = config.model.trim().to_string();
    if config.model.is_empty() || config.model.chars().count() > 200 {
        return Err("請填入模型名稱".into());
    }
    config.base_url = url.to_string().trim_end_matches('/').to_string();
    Ok(config)
}
pub async fn response_json(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(if status.as_u16() == 503 {
            "模型仍在載入，請稍後重試".into()
        } else {
            format!("AI 服務回應 {}", status.as_u16())
        });
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "讀取 AI 回覆失敗")? {
        if body.len() + chunk.len() > 2_000_000 {
            return Err("AI 回覆過大".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "AI 服務回傳無效 JSON".into())
}
pub async fn request(
    client: &Client,
    connection: Connection,
    data: Value,
) -> Result<Value, String> {
    let prompt = data["prompt"].as_str().ok_or("請輸入有效的需求")?;
    if prompt.trim().is_empty() || prompt.chars().count() > 12_000 {
        return Err("請輸入有效的需求（最多 12,000 字）".into());
    }
    if data.to_string().chars().count() > 350_000 {
        return Err("文章或對話過長，請縮小選取範圍或開始新對話".into());
    }
    let context = &data["context"];
    let scope = data["scope"].as_str().ok_or("文章內容格式不正確")?;
    if !matches!(scope, "document" | "selection")
        || !context["markdown"].is_string()
        || !context["selection"]["markdown"].is_string()
    {
        return Err("文章內容格式不正確".into());
    }
    let system = format!(
        "{}Current scope: {}. Available capabilities: {}. Current preferences: {}.",
        include_str!("agent-system.txt"),
        scope,
        data["capabilities"],
        data["preferences"]
    );
    let mut messages = vec![json!({"role":"system","content":system})];
    if let Some(history) = data["history"].as_array() {
        for item in history.iter().skip(history.len().saturating_sub(12)) {
            if matches!(item["role"].as_str(), Some("user" | "assistant")) {
                if let Some(text) = item["content"].as_str() {
                    messages.push(json!({"role":item["role"],"content":text.chars().take(20000).collect::<String>()}));
                }
            }
        }
    }
    messages.push(json!({"role":"user","content":json!({"request":prompt,"editor":{"mode":context["mode"],"readonly":context["readonly"],"focus":context["focus"],"typewriter":context["typewriter"]},"document":{"title":context["title"],"statistics":context["statistics"],"scope":scope,"content":if scope=="selection" { &context["selection"]["markdown"] } else { &context["markdown"] }}}).to_string()}));
    let response = client.post(format!("{}/chat/completions", connection.base_url)).json(&json!({"model":connection.model,"messages":messages,"stream":false,"temperature":0.4,"max_tokens":4096,"response_format":{"type":"json_object"}})).timeout(Duration::from_secs(180)).send().await.map_err(|_| "無法連線至本機 AI；模型可能還在載入，請稍後重試")?;
    let result = response_json(response).await?;
    let mut text = result["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("模型未回傳文字，請確認模型已載入")?
        .to_string();
    while let Some(start) = text.find("<think>") {
        if let Some(end) = text[start..].find("</think>") {
            text.replace_range(start..start + end + 8, "");
        } else {
            break;
        }
    }
    let mut clean = text.trim();
    if clean.starts_with("```") {
        clean = clean
            .strip_prefix("```json")
            .or_else(|| clean.strip_prefix("```"))
            .unwrap()
            .trim()
            .strip_suffix("```")
            .unwrap_or(clean)
            .trim();
    }
    serde_json::from_str(clean).map_err(|_| "模型回覆不是有效的操作提案，請重試或換一種說法".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn connection_scope() {
        for url in [
            "http://127.0.0.1:8080/v1",
            "http://localhost:8080/v1",
            "http://192.168.0.120:8080/v1",
            "http://10.0.0.1:8080/v1",
            "http://172.16.0.1:8080/v1",
            "http://172.31.255.254:8080/v1",
            "http://169.254.1.2:8080/v1",
            "http://127.0.0.2:8080/v1",
            "http://[::1]:8080/v1",
            "http://[fd12::1]:8080/v1",
            "http://[fe80::1]:8080/v1",
            "https://example.com/v1",
        ] {
            assert!(validate(json!({"baseURL":url,"model":"test"})).is_ok());
        }
        for url in [
            "http://example.com/v1",
            "http://192.168.0.120.example.com:8080/v1",
            "http://172.15.0.1:8080/v1",
            "http://172.32.0.1:8080/v1",
            "http://192.169.0.1:8080/v1",
            "http://8.8.8.8/v1",
            "http://0.0.0.0:8080/v1",
            "http://[2001:4860:4860::8888]/v1",
            "file:///etc/passwd",
            "https://user:pass@example.com/v1",
            "https://example.com/v1?key=secret",
        ] {
            assert!(validate(json!({"baseURL":url,"model":"test"})).is_err());
        }
    }
}

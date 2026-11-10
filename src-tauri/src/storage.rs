use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct Record {
    pub token: String,
    pub path: String,
    pub title: String,
    pub content: String,
}

#[cfg(test)]
mod safety_tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("wuffi-safety-{}", Uuid::new_v4()));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn atomic_save_conflicts_and_backup() {
        let f = Fixture::new();
        let path = f.0.join("article.md");
        let backup = f.0.join("backup/old.md");
        atomic_write(&path, "原文 🐕\r\nEnglish".as_bytes()).unwrap();
        assert!(save_article(
            &path,
            "新版",
            Some("原文 🐕\r\nEnglish"),
            &backup,
            || panic!("No conflict")
        )
        .unwrap());
        assert_eq!(fs::read_to_string(&backup).unwrap(), "原文 🐕\r\nEnglish");
        assert!(!save_article(&path, "錯誤覆蓋", Some("舊版"), &backup, || false).unwrap());
        assert!(save_article(&path, "錯誤覆蓋", Some("舊版"), &backup, || {
            fs::write(&path, "確認期間修改").unwrap();
            true
        })
        .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "確認期間修改");
        fs::remove_file(&path).unwrap();
        assert!(!save_article(&path, "不得重建", Some("確認期間修改"), &backup, || false).unwrap());
        assert!(!path.exists());
    }
    #[test]
    fn failed_atomic_replace_keeps_target() {
        let f = Fixture::new();
        let path = f.0.join("directory");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("keep.md"), "保留").unwrap();
        assert!(atomic_write(&path, b"never replace directory").is_err());
        assert_eq!(fs::read_to_string(path.join("keep.md")).unwrap(), "保留");
        assert_eq!(fs::read_dir(&f.0).unwrap().count(), 1);
    }
    #[test]
    fn draft_journal_recovers_corruption_and_isolates_windows() {
        let f = Fixture::new();
        let storage = Storage::new(f.0.clone()).unwrap();
        let one = json!({"savedAt":1,"active":"a","documents":[{"id":"a","title":"文章","content":"草稿 A","updatedAt":1}]});
        let mut two = one.clone();
        two["savedAt"] = json!(2);
        two["documents"][0]["content"] = json!("草稿 B");
        for snapshot in [&one, &two] {
            storage
                .drafts(&json!({"action":"write","window":"","snapshot":snapshot}))
                .unwrap();
        }
        assert_eq!(
            storage
                .drafts(&json!({"action":"read","window":""}))
                .unwrap(),
            two
        );
        fs::write(f.0.join("drafts/main.json"), "{broken").unwrap();
        assert_eq!(
            storage
                .drafts(&json!({"action":"read","window":""}))
                .unwrap(),
            one
        );
        storage
            .drafts(&json!({"action":"write","window":"second","snapshot":two}))
            .unwrap();
        assert_eq!(
            storage
                .drafts(&json!({"action":"read","window":"second"}))
                .unwrap(),
            two
        );
        assert!(storage
            .drafts(&json!({"action":"write","window":"../escape","snapshot":one}))
            .is_err());
        assert!(storage
            .drafts(&json!({"action":"write","window":"","snapshot":{"documents":[{}]}}))
            .is_err());
    }
    #[test]
    fn draft_backup_rotates_without_trusting_foreign_files() {
        let f = Fixture::new();
        let snapshot = |n: u64| json!({"savedAt":n,"active":"a","documents":[{"id":"a","title":"文章","content":format!("草稿 {n}"),"updatedAt":n}]});
        let write = |storage: &Storage, n: u64| {
            storage
                .drafts(&json!({"action":"write","window":"","snapshot":snapshot(n)}))
                .unwrap()
        };
        let main = f.0.join("drafts/main.json");
        let backup = f.0.join("drafts/main.json.backup");
        let storage = Storage::new(f.0.clone()).unwrap();
        for n in 1..=3 {
            write(&storage, n);
        }
        // Each write keeps the previous draft as the backup.
        assert_eq!(read_json(&main), Some(snapshot(3)));
        assert_eq!(read_json(&backup), Some(snapshot(2)));
        // A draft damaged outside this process never replaces a good backup.
        fs::write(&main, "{broken").unwrap();
        write(&storage, 4);
        assert_eq!(read_json(&main), Some(snapshot(4)));
        assert_eq!(read_json(&backup), Some(snapshot(2)));
        // A new process validates the draft it finds before keeping it.
        let restarted = Storage::new(f.0.clone()).unwrap();
        write(&restarted, 5);
        assert_eq!(read_json(&backup), Some(snapshot(4)));
        assert_eq!(read_json(&main), Some(snapshot(5)));
        assert_eq!(fs::read_dir(f.0.join("drafts")).unwrap().count(), 2);
    }
}
pub struct Storage {
    pub root: PathBuf,
    pub files: Mutex<HashMap<String, Record>>,
    pub folders: Mutex<HashMap<String, PathBuf>>,
    pub settings: Mutex<Value>,
    pub io: Mutex<()>,
    registry_io: Mutex<()>,
    /// Draft files this process wrote, with the size and time it left them at.
    drafts_written: Mutex<HashMap<PathBuf, (u64, SystemTime)>>,
}
fn file_stamp(path: &Path) -> Option<(u64, SystemTime)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()?))
}
pub fn read_json(path: &Path) -> Option<Value> {
    fs::read(path)
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
}
pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(
        path,
        &serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
}
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let temporary = path.with_file_name(format!(
        ".{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        Uuid::new_v4()
    ));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        if let Ok(meta) = fs::metadata(path) {
            fs::set_permissions(&temporary, meta.permissions()).map_err(|e| e.to_string())?;
        }
        file.write_all(content).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(&temporary);
    result
}
fn read_text(path: &Path) -> Result<Option<String>, String> {
    match fs::read(path) {
        Ok(value) => Ok(Some(String::from_utf8_lossy(&value).into_owned())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
pub fn save_article(
    path: &Path,
    content: &str,
    expected: Option<&str>,
    backup: &Path,
    confirm: impl FnOnce() -> bool,
) -> Result<bool, String> {
    let before = read_text(path)?;
    if before.as_deref() != expected && !confirm() {
        return Ok(false);
    }
    if read_text(path)? != before {
        return Err("檔案在確認期間再次變更，請重新儲存".into());
    }
    if let Some(previous) = before.filter(|text| text != content) {
        if let Some(parent) = backup.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        atomic_write(backup, previous.as_bytes())?;
    }
    atomic_write(path, content.as_bytes())?;
    Ok(true)
}
fn valid_draft(value: &Value) -> bool {
    value["savedAt"].as_u64().is_some()
        && value["active"].is_string()
        && value["documents"].as_array().is_some_and(|docs| {
            !docs.is_empty()
                && docs.iter().all(|d| {
                    d["id"].is_string()
                        && d["title"].is_string()
                        && d["content"].is_string()
                        && d["updatedAt"].is_number()
                })
        })
}
impl Storage {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("themes")).map_err(|e| e.to_string())?;
        let mut settings = json!({"windowStyle":"seamless","chromeVersion":2,"language":"zh-TW","shortcuts":{},"uploadURL":"","uploadProvider":"https","rememberRecent":true,"showHidden":false,"recentFolders":[],"recentTokens":[],"recentExcluded":[]});
        if let Some(saved) =
            read_json(&root.join("desktop-settings.json")).and_then(|v| v.as_object().cloned())
        {
            for (key, value) in saved {
                settings[&key] = value;
            }
        }
        settings["windowStyle"] = json!("seamless");
        settings["chromeVersion"] = json!(2);
        let files: Vec<Record> = read_json(&root.join("file-access.json"))
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        Ok(Self {
            root,
            settings: Mutex::new(settings),
            files: Mutex::new(files.into_iter().map(|r| (r.token.clone(), r)).collect()),
            folders: Mutex::new(HashMap::new()),
            io: Mutex::new(()),
            registry_io: Mutex::new(()),
            drafts_written: Mutex::new(HashMap::new()),
        })
    }
    pub fn drafts(&self, data: &Value) -> Result<Value, String> {
        // Drafts only touch the drafts folder: saving an article (which holds
        // `io`) never waits behind the continuous draft writes while typing.
        let mut written = self.drafts_written.lock().unwrap();
        let window = data["window"].as_str().ok_or("Invalid draft window")?;
        if window.len() > 80
            || !window
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("Invalid draft window".into());
        }
        let path = self.root.join("drafts").join(format!(
            "{}.json",
            if window.is_empty() { "main" } else { window }
        ));
        let backup = path.with_extension("json.backup");
        if data["action"] == "read" {
            for candidate in [&path, &backup] {
                if let Some(value) = read_json(candidate).filter(valid_draft) {
                    return Ok(value);
                }
            }
            return Ok(Value::Null);
        }
        let snapshot = &data["snapshot"];
        if data["action"] != "write" || !valid_draft(snapshot) {
            return Err("Invalid draft snapshot".into());
        }
        let content = serde_json::to_vec_pretty(snapshot).map_err(|e| e.to_string())?;
        if content.len() > 64 * 1024 * 1024 {
            return Err("Draft snapshot is too large".into());
        }
        // Drafts are written on every keystroke. A draft this process wrote
        // itself (same size and time) is known to be valid, so it becomes the
        // backup by renaming instead of being read, parsed and written again.
        // Anything else is validated first, so a damaged file never replaces
        // a good backup.
        if written.get(&path).is_some_and(|known| file_stamp(&path).as_ref() == Some(known)) {
            fs::rename(&path, &backup).map_err(|e| e.to_string())?;
        } else if let Some(previous) = read_json(&path).filter(valid_draft) {
            write_json(&backup, &previous)?;
        }
        fs::create_dir_all(self.root.join("drafts")).map_err(|e| e.to_string())?;
        atomic_write(&path, &content)?;
        match file_stamp(&path) {
            Some(stamp) => written.insert(path, stamp),
            None => written.remove(&path),
        };
        Ok(json!(true))
    }
    pub fn english(&self) -> bool {
        self.settings.lock().unwrap()["language"] == "en"
    }
    pub fn text(&self, value: &str) -> String {
        if self.english() {
            let dictionary: Value =
                serde_json::from_str(include_str!("../../resources/locales/en.json"))
                    .unwrap_or_default();
            dictionary[value].as_str().unwrap_or(value).to_string()
        } else {
            value.to_string()
        }
    }
    pub fn record(&self, token: &str) -> Result<Record, String> {
        self.files
            .lock()
            .unwrap()
            .get(token)
            .cloned()
            .ok_or("未授權的檔案".into())
    }
    pub fn authorize(&self, path: PathBuf) -> Result<Record, String> {
        let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 10_000_000 {
            return Err("檔案超過 10 MB 上限".into());
        }
        let record = Record {
            token: Uuid::new_v4().to_string(),
            title: path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            path: path.to_string_lossy().into(),
            content: String::from_utf8_lossy(&fs::read(&path).map_err(|e| e.to_string())?)
                .into_owned(),
        };
        self.files
            .lock()
            .unwrap()
            .insert(record.token.clone(), record.clone());
        self.persist()?;
        Ok(record)
    }
    pub fn persist(&self) -> Result<(), String> {
        let _guard = self.registry_io.lock().unwrap();
        write_json(
            &self.root.join("file-access.json"),
            &json!(self.files.lock().unwrap().values().collect::<Vec<_>>()),
        )
    }
    pub fn list_folder(&self, folder: &Path) -> Result<Value, String> {
        let hidden = self.settings.lock().unwrap()["showHidden"]
            .as_bool()
            .unwrap_or(false);
        let mut rows = Vec::new();
        for entry in fs::read_dir(folder).map_err(|e| e.to_string())?.take(2000) {
            let entry = entry.map_err(|e| e.to_string())?;
            let metadata = entry.file_type().map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if metadata.is_symlink()
                || (!hidden && name.starts_with('.'))
                || matches!(name.as_str(), "node_modules" | ".git")
            {
                continue;
            }
            if !metadata.is_dir()
                && !matches!(
                    entry
                        .path()
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase()
                        .as_str(),
                    "md" | "markdown" | "txt"
                )
            {
                continue;
            }
            let token = Uuid::new_v4().to_string();
            self.folders
                .lock()
                .unwrap()
                .insert(token.clone(), entry.path());
            rows.push(json!({"token":token,"name":name,"directory":metadata.is_dir()}));
        }
        rows.sort_by_key(|r| {
            (
                !r["directory"].as_bool().unwrap_or(false),
                r["name"].as_str().unwrap_or("").to_lowercase(),
            )
        });
        Ok(json!(rows))
    }
}

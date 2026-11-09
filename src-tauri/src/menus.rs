use crate::{fail, field, storage, Host};
use serde_json::{json, Value};
use tauri::{
    menu::{CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, LogicalPosition, WebviewWindow,
};
pub fn groups() -> Value {
    serde_json::from_str(include_str!("menu.json")).expect("Desktop menu")
}
pub fn rows() -> Value {
    json!(groups().as_array().unwrap().iter().enumerate().map(|(index,row)|json!({"index":index,"label":field(row,"label").split('(').next().unwrap_or("")})).collect::<Vec<_>>())
}
pub fn shortcuts(host: &Host) -> Value {
    fn walk(rows: &[Value], host: &Host, settings: &Value, result: &mut Vec<Value>) {
        for row in rows {
            if let Some(children) = row["items"].as_array() {
                walk(children, host, settings, result);
            } else if row["command"].is_string() {
                let key = field(row, "key");
                let label = key
                    .split('/')
                    .filter(|s| !s.is_empty())
                    .map(|s| host.storage.text(s.split('(').next().unwrap_or(s)))
                    .collect::<Vec<_>>()
                    .join("/");
                result.push(json!({"key":key,"label":label,"command":row["command"],"defaultAccelerator":row["accelerator"],"accelerator":settings["shortcuts"][key].as_str().unwrap_or(field(row,"accelerator"))}));
            }
        }
    }
    let settings = host.storage.settings.lock().unwrap().clone();
    let mut result = vec![];
    walk(groups().as_array().unwrap(), host, &settings, &mut result);
    json!(result)
}
pub fn normalize(value: &str) -> String {
    let value = value
        .to_lowercase()
        .replace("cmdorctrl", "ctrl")
        .replace("control", "ctrl");
    let mut parts = value.split('+').collect::<Vec<_>>();
    parts.sort_unstable();
    parts.join("+")
}
pub fn change_shortcut(host: &Host, data: &Value) -> Result<Value, String> {
    let key = field(data, "key");
    let accelerator = field(data, "accelerator");
    let rows = shortcuts(host);
    let rows = rows.as_array().unwrap();
    if !rows.iter().any(|r| r["key"] == key) {
        return Err("Invalid shortcut".into());
    }
    if !accelerator.is_empty() {
        let pattern=regex::Regex::new(r"(?i)^(?:(?:Ctrl|Control|CmdOrCtrl|Alt|Shift|Super)\+)*(?:[A-Z0-9]|F\d{1,2}|Space|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|[,.\/\\=\-\[\]`])$").unwrap();
        if !pattern.is_match(accelerator) {
            return Err("快捷鍵格式不正確".into());
        }
        if rows.iter().any(|r| {
            r["key"] != key && normalize(field(r, "accelerator")) == normalize(accelerator)
        }) {
            return Err("快捷鍵已被其他指令使用".into());
        }
    }
    let mut settings = host.storage.settings.lock().unwrap();
    if !settings["shortcuts"].is_object() {
        settings["shortcuts"] = json!({});
    }
    settings["shortcuts"][key] = json!(accelerator);
    storage::write_json(&host.storage.root.join("desktop-settings.json"), &settings)?;
    Ok(json!(true))
}
fn populate(
    app: &AppHandle,
    menu: &Submenu<tauri::Wry>,
    host: &Host,
    rows: &[Value],
) -> Result<(), String> {
    for row in rows {
        if row["separator"] == true {
            menu.append(&PredefinedMenuItem::separator(app).map_err(fail)?)
                .map_err(fail)?;
            continue;
        }
        let label = host.storage.text(field(row, "label"));
        if let Some(children) = row["items"].as_array() {
            let submenu = Submenu::new(app, label, true).map_err(fail)?;
            if field(row, "label") == "開啟最近的檔案" {
                let settings = host.storage.settings.lock().unwrap().clone();
                let excluded = settings["recentExcluded"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                let files = host.storage.files.lock().unwrap();
                let mut seen = std::collections::HashSet::new();
                let mut count = 0;
                let mut records = files.values().collect::<Vec<_>>();
                let order = settings["recentTokens"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                records.sort_by_key(|r| {
                    std::cmp::Reverse(order.iter().position(|t| t == &r.token).unwrap_or(0))
                });
                if settings["rememberRecent"] != false {
                    for r in records {
                        if excluded.iter().any(|t| t == &r.token) || !seen.insert(&r.path) {
                            continue;
                        }
                        submenu
                            .append(
                                &MenuItem::with_id(
                                    app,
                                    format!("recent:{}", r.token),
                                    &r.path,
                                    true,
                                    None::<&str>,
                                )
                                .map_err(fail)?,
                            )
                            .map_err(fail)?;
                        count += 1;
                        if count == 15 {
                            break;
                        }
                    }
                }
                if count == 0 {
                    submenu
                        .append(
                            &MenuItem::new(
                                app,
                                host.storage.text("沒有最近的檔案"),
                                false,
                                None::<&str>,
                            )
                            .map_err(fail)?,
                        )
                        .map_err(fail)?;
                }
            } else if field(row, "label") == "開啟最近的資料夾" {
                // text() reads the language setting too. Release the lock before
                // translating the empty-history label or constructing native UI.
                let settings = host.storage.settings.lock().unwrap().clone();
                let history = settings["recentFolders"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                if history.is_empty() {
                    submenu
                        .append(
                            &MenuItem::new(
                                app,
                                host.storage.text("沒有最近的資料夾"),
                                false,
                                None::<&str>,
                            )
                            .map_err(fail)?,
                        )
                        .map_err(fail)?;
                } else {
                    for (index, path) in history.iter().enumerate() {
                        submenu
                            .append(
                                &MenuItem::with_id(
                                    app,
                                    format!("recentFolder:{index}"),
                                    path.as_str().unwrap_or(""),
                                    true,
                                    None::<&str>,
                                )
                                .map_err(fail)?,
                            )
                            .map_err(fail)?;
                    }
                }
            } else {
                populate(app, &submenu, host, children)?;
            }
            menu.append(&submenu).map_err(fail)?;
        } else {
            match field(row, "command") {
                command => {
                    if command.starts_with("theme:")
                        || matches!(
                            command,
                            "readonly"
                                | "focus"
                                | "typewriter"
                                | "status"
                                | "toolbar"
                                | "alwaysOnTop"
                        )
                    {
                        let settings = host.storage.settings.lock().unwrap().clone();
                        let checked = if let Some(theme) = command.strip_prefix("theme:") {
                            settings["theme"].as_str().unwrap_or("light") == theme
                        } else {
                            settings[command] == true
                        };
                        menu.append(
                            &CheckMenuItem::with_id(
                                app,
                                command,
                                label,
                                true,
                                checked,
                                None::<&str>,
                            )
                            .map_err(fail)?,
                        )
                        .map_err(fail)?;
                        continue;
                    }
                    menu.append(
                        &MenuItem::with_id(
                            app,
                            if command.is_empty() {
                                "disabled"
                            } else {
                                command
                            },
                            label,
                            row["enabled"] != false && !command.is_empty(),
                            None::<&str>,
                        )
                        .map_err(fail)?,
                    )
                    .map_err(fail)?;
                }
            }
        }
    }
    Ok(())
}
fn build(app: &AppHandle, host: &Host, index: usize) -> Result<Submenu<tauri::Wry>, String> {
    let groups = groups();
    let row = groups
        .as_array()
        .and_then(|r| r.get(index))
        .ok_or("Invalid menu")?;
    let menu = Submenu::new(
        app,
        host.storage
            .text(field(row, "label").split('(').next().unwrap_or("")),
        true,
    )
    .map_err(fail)?;
    populate(
        app,
        &menu,
        host,
        row["items"].as_array().ok_or("Invalid menu")?,
    )?;
    Ok(menu)
}

// Exercise real native menu construction without a modal popup stealing focus
// from the user's desktop. This entry is absent from ordinary builds.
#[cfg(feature = "safety-tests")]
pub fn inspect(app: &AppHandle, host: &Host, index: usize) -> Result<Value, String> {
    let menu = build(app, host, index)?;
    let items = menu.items().map_err(fail)?;
    Ok(
        json!({"label":menu.text().map_err(fail)?,"ids":items.iter().map(|item|item.id().as_ref().to_string()).collect::<Vec<_>>()}),
    )
}

#[cfg(feature = "safety-tests")]
pub fn activate_for_test(
    app: &AppHandle,
    window: &WebviewWindow,
    host: &Host,
    data: &Value,
) -> Result<Value, String> {
    use tauri::menu::MenuItemKind;
    fn contains(menu: &Submenu<tauri::Wry>, id: &str) -> Result<bool, String> {
        for item in menu.items().map_err(fail)? {
            if item.id().as_ref() == id {
                return Ok(true);
            }
            if let MenuItemKind::Submenu(submenu) = item {
                if contains(&submenu, id)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
    let menu = build(
        app,
        host,
        data["index"].as_u64().ok_or("Invalid menu")? as usize,
    )?;
    let command = field(data, "command");
    if !contains(&menu, command)? {
        return Err("Command not present in native menu".into());
    }
    *host.menu_owner.lock().unwrap() = Some(window.label().into());
    crate::route_menu_command(app, command);
    Ok(json!(true))
}

pub fn popup(
    app: &AppHandle,
    window: &WebviewWindow,
    host: &Host,
    data: &Value,
) -> Result<Value, String> {
    if crate::background_test() {
        return Err("Native popup requires visible desktop verification".into());
    }
    let always_on_top = window.is_always_on_top().unwrap_or(false);
    {
        let mut settings = host.storage.settings.lock().unwrap();
        for key in ["readonly", "focus", "typewriter"] {
            if let Some(value) = data["uiState"].get(key) {
                settings[key] = value.clone();
            }
        }
        settings["alwaysOnTop"] = json!(always_on_top);
    }
    *host.menu_owner.lock().unwrap() = Some(window.label().into());
    let index = data["index"].as_u64().ok_or("Invalid menu")? as usize;
    let menu = build(app, host, index)?;
    let size = window.inner_size().map_err(fail)?;
    let factor = window.scale_factor().map_err(fail)?;
    window
        .popup_menu_at(
            &menu,
            LogicalPosition::new(
                data["x"]
                    .as_f64()
                    .unwrap_or(0.0)
                    .clamp(0.0, size.width as f64 / factor),
                data["y"]
                    .as_f64()
                    .unwrap_or(68.0)
                    .clamp(0.0, size.height as f64 / factor),
            ),
        )
        .map_err(fail)?;
    Ok(Value::Null)
}

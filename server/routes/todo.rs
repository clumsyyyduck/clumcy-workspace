use crate::{
    app::{AppState, Shared, emit},
    error::{AppError, AppResult},
    file_mutation::{FileMutation, content_hash},
    media,
};
use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

pub(crate) const TODO_SUFFIX: &str = ".todo.json";

pub(crate) fn ensure_folder(config: &crate::config::Config) {
    let Some(folder) = &config.todo_folder else {
        return;
    };
    if let Ok(resolved) = media::resolve(config, folder)
        && let Err(error) = std::fs::create_dir_all(&resolved.full)
    {
        eprintln!("Failed to create TODO folder {folder}: {error}");
    }
}

fn folder(state: &AppState) -> AppResult<&str> {
    state
        .config
        .todo_folder
        .as_deref()
        .ok_or_else(|| AppError::not_found("TODO folder is not configured"))
}

fn list_name(path: &str) -> String {
    let name = media::name(path);
    name.strip_suffix(TODO_SUFFIX).unwrap_or(&name).to_string()
}

fn list_paths(state: &AppState) -> AppResult<Vec<String>> {
    let folder = folder(state)?;
    let resolved = media::resolve(&state.config, folder)?;
    let Ok(entries) = std::fs::read_dir(&resolved.full) else {
        return Ok(Vec::new());
    };
    let mut paths: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.to_ascii_lowercase().ends_with(TODO_SUFFIX))
        .map(|name| format!("{folder}/{name}"))
        .collect();
    paths.sort_by(|a, b| natord::compare_ignore_case(a, b));
    Ok(paths)
}

fn tasks(document: &Value) -> impl Iterator<Item = &Value> {
    document
        .get("tasks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}

fn flag(task: &Value, key: &str) -> bool {
    task.get(key).and_then(Value::as_bool).unwrap_or(false)
}

async fn read_document(state: &AppState, path: &str) -> AppResult<Option<(Value, Vec<u8>)>> {
    let bytes = match FileMutation::new(state).read_file(path).await {
        Ok(bytes) => bytes,
        Err(error) if error.0 == axum::http::StatusCode::NOT_FOUND => return Ok(None),
        Err(error) => return Err(error),
    };
    let document = if bytes.iter().all(u8::is_ascii_whitespace) {
        json!({"version":1,"tasks":[]})
    } else {
        serde_json::from_slice(&bytes)
            .map_err(|error| AppError::bad(format!("{path} is not valid JSON: {error}")))?
    };
    Ok(Some((document, bytes)))
}

async fn lists(State(state): State<Shared>) -> AppResult<Json<Value>> {
    let folder = folder(&state)?.to_string();
    let mut lists = Vec::new();
    for path in list_paths(&state)? {
        let Ok(Some((document, _))) = read_document(&state, &path).await else {
            continue;
        };
        let (done, open): (Vec<&Value>, Vec<&Value>) =
            tasks(&document).partition(|task| flag(task, "done"));
        lists.push(json!({
            "name": list_name(&path),
            "path": path,
            "open": open.len(),
            "done": done.len(),
        }));
    }
    Ok(Json(json!({"folder":folder,"lists":lists})))
}

async fn reminders(State(state): State<Shared>) -> AppResult<Json<Value>> {
    if state.config.todo_folder.is_none() {
        return Ok(Json(json!({"reminders":[]})));
    }
    let mut reminders = Vec::new();
    for path in list_paths(&state)? {
        let Ok(Some((document, _))) = read_document(&state, &path).await else {
            continue;
        };
        for task in tasks(&document) {
            let due = task.get("due").and_then(Value::as_str).unwrap_or_default();
            if due.is_empty()
                || !flag(task, "remind")
                || flag(task, "done")
                || flag(task, "reminderAcknowledged")
            {
                continue;
            }
            reminders.push(json!({
                "path": path,
                "list": list_name(&path),
                "taskId": task.get("id").cloned().unwrap_or(Value::Null),
                "title": task.get("title").cloned().unwrap_or(Value::Null),
                "due": due,
            }));
        }
    }
    Ok(Json(json!({"reminders":reminders})))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddTaskBody {
    list: String,
    title: String,
    description: Option<String>,
    due: Option<String>,
    #[serde(default)]
    remind: bool,
    #[serde(default)]
    checklist: Vec<String>,
}

fn valid_due(value: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").is_ok()
        || chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").is_ok()
        || chrono::DateTime::parse_from_rfc3339(value).is_ok()
}

fn list_path(state: &AppState, list: &str) -> AppResult<String> {
    let list = list.trim().replace('\\', "/");
    if list.is_empty() {
        return Err(AppError::bad("List is required"));
    }
    if list.contains('/') {
        if !list.to_ascii_lowercase().ends_with(TODO_SUFFIX) {
            return Err(AppError::bad("List path must end with .todo.json"));
        }
        return Ok(list);
    }
    let name = list.strip_suffix(TODO_SUFFIX).unwrap_or(&list);
    if name.is_empty() || name.starts_with('.') {
        return Err(AppError::bad("List name is invalid"));
    }
    Ok(format!("{}/{name}{TODO_SUFFIX}", folder(state)?))
}

async fn add_task(
    State(state): State<Shared>,
    Json(body): Json<AddTaskBody>,
) -> AppResult<Json<Value>> {
    let title = body.title.trim();
    if title.is_empty() {
        return Err(AppError::bad("Title is required"));
    }
    let due = body
        .due
        .as_deref()
        .map(str::trim)
        .filter(|due| !due.is_empty());
    if let Some(due) = due
        && !valid_due(due)
    {
        return Err(AppError::bad("Due must look like 2026-10-05T14:00"));
    }
    let path = list_path(&state, &body.list)?;
    if !media::editable(&state.config, &path) {
        return Err(AppError::forbidden("Path is not in an editable folder"));
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    let mut task = json!({
        "id": id,
        "title": title,
        "done": false,
        "createdAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    });
    if let Some(description) = body.description.as_deref().map(str::trim)
        && !description.is_empty()
    {
        task["description"] = json!(description);
    }
    if let Some(due) = due {
        task["due"] = json!(due);
        task["remind"] = json!(body.remind);
    }
    let checklist: Vec<Value> = body
        .checklist
        .iter()
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .map(
            |text| json!({"id":uuid::Uuid::new_v4().simple().to_string(),"text":text,"done":false}),
        )
        .collect();
    if !checklist.is_empty() {
        task["checklist"] = Value::Array(checklist);
    }

    let mutation = FileMutation::new(&state);
    match read_document(&state, &path).await? {
        Some((mut document, previous)) => {
            if !document.is_object() {
                return Err(AppError::bad(format!("{path} is not a todo list")));
            }
            match document.get_mut("tasks").and_then(Value::as_array_mut) {
                Some(tasks) => tasks.push(task.clone()),
                None => document["tasks"] = json!([task.clone()]),
            }
            let data = serde_json::to_vec_pretty(&document)
                .map_err(|error| AppError::internal(error.to_string()))?;
            mutation
                .edit_file(&path, &data, Some(&content_hash(&previous)), None)
                .await?;
        }
        None => {
            let document = json!({"version":1,"tasks":[task.clone()]});
            let data = serde_json::to_vec_pretty(&document)
                .map_err(|error| AppError::internal(error.to_string()))?;
            mutation.create_file(&path, &data).await?;
        }
    }
    emit(&state, &path);
    Ok(Json(json!({"path":path,"task":task})))
}

pub fn router() -> Router<Shared> {
    Router::new()
        .route("/api/todo/lists", get(lists))
        .route("/api/todo/reminders", get(reminders))
        .route("/api/todo/tasks", post(add_task))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_formats() {
        assert!(valid_due("2026-10-05T14:00"));
        assert!(valid_due("2026-10-05T14:00:30"));
        assert!(valid_due("2026-10-05T14:00:00+03:00"));
        assert!(!valid_due("tomorrow"));
        assert!(!valid_due("2026-10-05"));
    }

    #[test]
    fn list_names_strip_suffix() {
        assert_eq!(list_name("thoughts/TODO/work.todo.json"), "work");
        assert_eq!(list_name("thoughts/TODO/notes.json"), "notes.json");
    }
}

use crate::{
    app::Shared,
    error::{AppError, AppResult},
    file_mutation::{FileMutation, content_hash},
    media,
};
use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

pub(crate) const GOAL_SUFFIX: &str = ".goal.json";
/// Virtual entry on the library root that opens the overview of all goals.
pub(crate) const BOARD_NAME: &str = "Goals.goals-board";
pub(crate) const BOARD_EXTENSION: &str = "goals-board";

async fn goals(State(state): State<Shared>) -> AppResult<Json<Value>> {
    let folder = state
        .config
        .goals_folder
        .as_deref()
        .ok_or_else(|| AppError::not_found("Goals folder is not configured"))?;
    let resolved = media::resolve(&state.config, folder)?;
    let mut names: Vec<String> = std::fs::read_dir(&resolved.full)
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| name.to_ascii_lowercase().ends_with(GOAL_SUFFIX))
                .collect()
        })
        .unwrap_or_default();
    names.sort_by(|a, b| natord::compare_ignore_case(a, b));

    let mut goals = Vec::new();
    for name in names {
        let path = format!("{folder}/{name}");
        let Ok(bytes) = FileMutation::new(&state).read_file(&path).await else {
            continue;
        };
        let Ok(content) = String::from_utf8(bytes.clone()) else {
            continue;
        };
        goals.push(json!({"path":path,"content":content,"version":content_hash(&bytes)}));
    }
    Ok(Json(json!({
        "folder": folder,
        "board": format!("{folder}/{BOARD_NAME}"),
        "editable": media::editable(&state.config, folder),
        "goals": goals,
    })))
}

pub fn router() -> Router<Shared> {
    Router::new().route("/api/goals", get(goals))
}

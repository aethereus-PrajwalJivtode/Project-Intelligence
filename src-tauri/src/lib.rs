pub mod models;
pub mod db;
pub mod keychain;
pub mod jira;
pub mod commands;

use db::DbState;
use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle();
            let db_path = match app_handle.path().app_data_dir() {
                Ok(mut p) => {
                    p.push("project_intelligence.db");
                    p
                }
                Err(_) => PathBuf::from("project_intelligence.db"),
            };

            let db_state = DbState::new(db_path).unwrap_or_else(|_| {
                DbState::new_in_memory().expect("Failed to initialize in-memory database")
            });
            // Starts clean and logged out by default
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_auth_status,
            commands::connect_jira,
            commands::disconnect_jira,
            commands::connect_copilot,
            commands::disconnect_copilot,
            commands::get_projects,
            commands::get_epics,
            commands::get_issues_for_epic,
            commands::get_epic_context,
            commands::build_epic_context,
            commands::get_ticket_drafts,
            commands::approve_ticket_draft,
            commands::reject_ticket_draft,
            commands::create_jira_ticket,
            commands::seed_demo_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

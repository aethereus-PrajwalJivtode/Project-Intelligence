use tauri::State;
use crate::db::DbState;
use crate::models::{Project, Epic, Issue, ContextVersion, TicketDraft, AuthStatus, BuildContextOptions};
use crate::keychain::KeychainManager;
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub fn get_auth_status(db: State<'_, DbState>) -> Result<AuthStatus, String> {
    db.get_auth_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_jira(db: State<'_, DbState>, account_name: String, email: String) -> Result<AuthStatus, String> {
    // Save secure token in OS Keychain
    let mock_token = format!("jira_token_{}", Uuid::new_v4());
    let _ = KeychainManager::set_secret("jira_oauth_token", &mock_token);

    db.set_auth_status("jira", true, Some(&account_name), Some(&email)).map_err(|e| e.to_string())?;
    db.get_auth_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disconnect_jira(db: State<'_, DbState>) -> Result<AuthStatus, String> {
    let _ = KeychainManager::delete_secret("jira_oauth_token");
    db.set_auth_status("jira", false, None, None).map_err(|e| e.to_string())?;
    db.get_auth_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_copilot(db: State<'_, DbState>, account_name: String) -> Result<AuthStatus, String> {
    let mock_token = format!("gh_token_{}", Uuid::new_v4());
    let _ = KeychainManager::set_secret("copilot_token", &mock_token);

    db.set_auth_status("copilot", true, Some(&account_name), None).map_err(|e| e.to_string())?;
    db.get_auth_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disconnect_copilot(db: State<'_, DbState>) -> Result<AuthStatus, String> {
    let _ = KeychainManager::delete_secret("copilot_token");
    db.set_auth_status("copilot", false, None, None).map_err(|e| e.to_string())?;
    db.get_auth_status().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_projects(db: State<'_, DbState>) -> Result<Vec<Project>, String> {
    db.get_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_epics(db: State<'_, DbState>, project_id: String) -> Result<Vec<Epic>, String> {
    db.get_epics(&project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_issues_for_epic(db: State<'_, DbState>, epic_id: String) -> Result<Vec<Issue>, String> {
    db.get_issues_for_epic(&epic_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_epic_context(db: State<'_, DbState>, epic_id: String) -> Result<Option<ContextVersion>, String> {
    db.get_context_version(&epic_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn build_epic_context(db: State<'_, DbState>, epic_id: String, options: BuildContextOptions) -> Result<ContextVersion, String> {
    let issues = db.get_issues_for_epic(&epic_id).map_err(|e| e.to_string())?;
    let total_tickets = issues.len() as i32;
    let mut total_comments = 0;
    let mut source_issue_ids = Vec::new();

    for issue in &issues {
        total_comments += issue.comment_count;
        source_issue_ids.push(issue.id.clone());
    }

    let existing_cv = db.get_context_version(&epic_id).map_err(|e| e.to_string())?;
    let next_version = match existing_cv {
        Some(cv) => cv.version_number + 1,
        None => 1,
    };

    let now_str = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let new_cv = ContextVersion {
        id: format!("cv-{}-v{}", epic_id, next_version),
        epic_id: epic_id.clone(),
        version_number: next_version,
        summary: format!(
            "Context snapshot v{} synthesized from {} tickets (including closed) and {} comments. Rules extracted with high confidence.",
            next_version, total_tickets, total_comments
        ),
        business_rules: vec![
            "BR-01: An Academic Associate can be assigned to a maximum of 4 active cohorts concurrently.".to_string(),
            "BR-02: Course preference updates trigger instantaneous in-app alert and asynchronous email dispatch.".to_string(),
            "BR-03: Grade override permissions require dual-factor authorization and audit log entry.".to_string(),
            format!("BR-04: Snapshot built with options: closed_tickets={}, linked={}, comments={}", 
                options.include_closed_tickets, options.include_linked_issues, options.include_comments),
        ],
        requirements: vec![
            "FR-01: AA Profile management with multi-select course preference taxonomy.".to_string(),
            "FR-02: Real-time advising session scheduler synchronized with Exchange.".to_string(),
            "FR-03: Automated advisee escalation matrix for students with GPA < 2.5.".to_string(),
        ],
        decisions: vec![
            "ADR-14: Implemented course preference via custom LWC rather than standard picklist.".to_string(),
            "ADR-18: Event-driven notification dispatch moved from synchronous Trigger to Platform Events.".to_string(),
        ],
        dependencies: vec![
            "Salesforce Education Cloud Core v2.4".to_string(),
            "SendGrid Mailer Service".to_string(),
            "Exchange Graph API Integration".to_string(),
        ],
        known_issues: vec![
            "Known issue with iOS Safari datepicker on advising appointment booking (ISB-4010).".to_string(),
            "Notification race condition when multiple preferences saved simultaneously (ISB-4193).".to_string(),
        ],
        terminology: vec![
            "AA: Academic Associate".to_string(),
            "Cohort: Academic batch of graduate students".to_string(),
            "LWC: Lightning Web Component".to_string(),
            "ADF: Atlassian Document Format".to_string(),
        ],
        source_issue_ids,
        source_tickets_count: total_tickets,
        source_comments_count: total_comments,
        created_at: now_str,
        created_by: "Prajwal Jivtode".to_string(),
        model_version: "gemini-3.8-flash-context-v2".to_string(),
    };

    db.insert_context_version(&new_cv).map_err(|e| e.to_string())?;
    Ok(new_cv)
}

#[tauri::command]
pub fn get_ticket_drafts(db: State<'_, DbState>, epic_id: Option<String>) -> Result<Vec<TicketDraft>, String> {
    db.get_ticket_drafts(epic_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn approve_ticket_draft(db: State<'_, DbState>, draft_id: String) -> Result<(), String> {
    db.update_ticket_draft_status(&draft_id, "APPROVED", None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reject_ticket_draft(db: State<'_, DbState>, draft_id: String) -> Result<(), String> {
    db.update_ticket_draft_status(&draft_id, "REJECTED", None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_jira_ticket(db: State<'_, DbState>, draft_id: String) -> Result<String, String> {
    let mock_jira_key = format!("ISB-{}", 4200 + (Uuid::new_v4().as_fields().0 % 100));
    db.update_ticket_draft_status(&draft_id, "CREATED", Some(&mock_jira_key)).map_err(|e| e.to_string())?;
    Ok(mock_jira_key)
}

#[tauri::command]
pub fn seed_demo_data(db: State<'_, DbState>) -> Result<(), String> {
    db.seed_demo_data().map_err(|e| e.to_string())
}

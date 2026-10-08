use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub jira_project_id: String,
    pub jira_project_key: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Epic {
    pub id: String,
    pub project_id: String,
    pub jira_issue_id: String,
    pub jira_key: String,
    pub name: String,
    pub summary: Option<String>,
    pub status: String,
    pub context_status: String, // "unbuilt" | "building" | "built" | "stale"
    pub active_context_version: i32,
    pub total_tickets: i32,
    pub closed_tickets: i32,
    pub open_tickets: i32,
    pub last_context_build: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: String,
    pub project_id: String,
    pub epic_id: Option<String>,
    pub jira_issue_id: String,
    pub jira_key: String,
    pub issue_type: String, // "Requirement" | "Story" | "Bug" | "Task" | "Enhancement"
    pub summary: String,
    pub description: Option<String>,
    pub status: String, // "Done" | "Closed" | "In Progress" | "To Do"
    pub is_closed: bool,
    pub priority: String,
    pub labels: Vec<String>,
    pub comment_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueComment {
    pub id: String,
    pub issue_id: String,
    pub jira_comment_id: String,
    pub author_name: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextVersion {
    pub id: String,
    pub epic_id: String,
    pub version_number: i32,
    pub summary: String,
    pub business_rules: Vec<String>,
    pub requirements: Vec<String>,
    pub decisions: Vec<String>,
    pub dependencies: Vec<String>,
    pub known_issues: Vec<String>,
    pub terminology: Vec<String>,
    pub source_issue_ids: Vec<String>,
    pub source_tickets_count: i32,
    pub source_comments_count: i32,
    pub created_at: String,
    pub created_by: String,
    pub model_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketDraft {
    pub id: String,
    pub source_id: Option<String>,
    pub epic_id: String,
    pub epic_name: String,
    pub draft_type: String, // "Story" | "Bug" | "Task" | "Requirement"
    pub summary: String,
    pub description: String,
    pub labels: Vec<String>,
    pub confidence: f32,
    pub status: String, // "NEEDS_REVIEW" | "APPROVED" | "CREATED" | "REJECTED"
    pub reason: String,
    pub classification_category: String, // "NEW_REQUIREMENT" | "BUG" | "ENHANCEMENT" | "DUPLICATE"
    pub is_confirmed_from_source: bool,
    pub source_evidence: String,
    pub potential_duplicate_key: Option<String>,
    pub duplicate_similarity: Option<f32>,
    pub created_jira_key: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub jira_connected: bool,
    pub jira_account_name: Option<String>,
    pub jira_account_email: Option<String>,
    pub copilot_connected: bool,
    pub copilot_account_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildContextOptions {
    pub include_closed_tickets: bool,
    pub include_comments: bool,
    pub include_linked_issues: bool,
    pub include_jira_history: bool,
    pub include_github_prs: bool,
}

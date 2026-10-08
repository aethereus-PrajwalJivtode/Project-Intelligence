use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use crate::models::{Project, Epic, Issue, IssueComment, ContextVersion, TicketDraft, AuthStatus};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(&db_path)?;
        let state = Self {
            conn: Mutex::new(conn),
        };
        state.init_schema()?;
        Ok(state)
    }

    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let state = Self {
            conn: Mutex::new(conn),
        };
        state.init_schema()?;
        Ok(state)
    }

    pub fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS auth_sessions (
                provider TEXT PRIMARY KEY,
                account_id TEXT,
                account_name TEXT,
                account_email TEXT,
                status TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                jira_project_id TEXT NOT NULL,
                jira_project_key TEXT NOT NULL,
                name TEXT NOT NULL,
                avatar_url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS epics (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                jira_issue_id TEXT NOT NULL,
                jira_key TEXT NOT NULL,
                name TEXT NOT NULL,
                summary TEXT,
                status TEXT NOT NULL,
                context_status TEXT NOT NULL,
                active_context_version INTEGER NOT NULL DEFAULT 0,
                last_context_build TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS issues (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                epic_id TEXT,
                jira_issue_id TEXT NOT NULL,
                jira_key TEXT NOT NULL,
                issue_type TEXT NOT NULL,
                summary TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                is_closed INTEGER NOT NULL DEFAULT 0,
                priority TEXT NOT NULL,
                labels TEXT NOT NULL,
                comment_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS issue_comments (
                id TEXT PRIMARY KEY,
                issue_id TEXT NOT NULL,
                jira_comment_id TEXT NOT NULL,
                author_name TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS context_versions (
                id TEXT PRIMARY KEY,
                epic_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                summary TEXT NOT NULL,
                business_rules TEXT NOT NULL,
                requirements TEXT NOT NULL,
                decisions TEXT NOT NULL,
                dependencies TEXT NOT NULL,
                known_issues TEXT NOT NULL,
                terminology TEXT NOT NULL,
                source_issue_ids TEXT NOT NULL,
                source_tickets_count INTEGER NOT NULL,
                source_comments_count INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                model_version TEXT NOT NULL,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ticket_drafts (
                id TEXT PRIMARY KEY,
                source_id TEXT,
                epic_id TEXT NOT NULL,
                draft_type TEXT NOT NULL,
                summary TEXT NOT NULL,
                description TEXT NOT NULL,
                labels TEXT NOT NULL,
                confidence REAL NOT NULL,
                status TEXT NOT NULL,
                reason TEXT NOT NULL,
                classification_category TEXT NOT NULL,
                is_confirmed_from_source INTEGER NOT NULL DEFAULT 1,
                source_evidence TEXT NOT NULL,
                potential_duplicate_key TEXT,
                duplicate_similarity REAL,
                created_jira_key TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
            );
            "#,
        )?;

        // Ensure default auth session rows exist as disconnected
        conn.execute(
            "INSERT OR IGNORE INTO auth_sessions (provider, account_name, account_email, status, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params!["jira", "", "", "disconnected"],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO auth_sessions (provider, account_name, account_email, status, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            params!["copilot", "", "", "disconnected"],
        )?;

        Ok(())
    }

    pub fn get_auth_status(&self) -> Result<AuthStatus> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT provider, account_name, account_email, status FROM auth_sessions")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        let mut status = AuthStatus {
            jira_connected: false,
            jira_account_name: None,
            jira_account_email: None,
            copilot_connected: false,
            copilot_account_name: None,
        };

        for row in rows {
            let (provider, name, email, st) = row?;
            if provider == "jira" {
                status.jira_connected = st == "connected";
                status.jira_account_name = name;
                status.jira_account_email = email;
            } else if provider == "copilot" {
                status.copilot_connected = st == "connected";
                status.copilot_account_name = name;
            }
        }

        Ok(status)
    }

    pub fn set_auth_status(&self, provider: &str, connected: bool, name: Option<&str>, email: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let st = if connected { "connected" } else { "disconnected" };
        conn.execute(
            "INSERT INTO auth_sessions (provider, account_name, account_email, status, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))
             ON CONFLICT(provider) DO UPDATE SET account_name = ?2, account_email = ?3, status = ?4, updated_at = datetime('now')",
            params![provider, name, email, st],
        )?;
        Ok(())
    }

    pub fn get_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, jira_project_id, jira_project_key, name, avatar_url, created_at, updated_at FROM projects ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                jira_project_id: row.get(1)?,
                jira_project_key: row.get(2)?,
                name: row.get(3)?,
                avatar_url: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_epics(&self, project_id: &str) -> Result<Vec<Epic>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT e.id, e.project_id, e.jira_issue_id, e.jira_key, e.name, e.summary, e.status, 
                   e.context_status, e.active_context_version, e.last_context_build,
                   COUNT(i.id) AS total_count,
                   SUM(CASE WHEN i.is_closed = 1 THEN 1 ELSE 0 END) AS closed_count,
                   SUM(CASE WHEN i.is_closed = 0 THEN 1 ELSE 0 END) AS open_count
            FROM epics e
            LEFT JOIN issues i ON i.epic_id = e.id
            WHERE e.project_id = ?1
            GROUP BY e.id
            ORDER BY e.name ASC
            "#
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok(Epic {
                id: row.get(0)?,
                project_id: row.get(1)?,
                jira_issue_id: row.get(2)?,
                jira_key: row.get(3)?,
                name: row.get(4)?,
                summary: row.get(5)?,
                status: row.get(6)?,
                context_status: row.get(7)?,
                active_context_version: row.get(8)?,
                last_context_build: row.get(9)?,
                total_tickets: row.get(10)?,
                closed_tickets: row.get(11)?,
                open_tickets: row.get(12)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_issues_for_epic(&self, epic_id: &str) -> Result<Vec<Issue>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, epic_id, jira_issue_id, jira_key, issue_type, summary, description, status, is_closed, priority, labels, comment_count, created_at, updated_at
             FROM issues WHERE epic_id = ?1 ORDER BY is_closed ASC, jira_key DESC"
        )?;

        let rows = stmt.query_map(params![epic_id], |row| {
            let labels_json: String = row.get(11)?;
            let labels: Vec<String> = serde_json::from_str(&labels_json).unwrap_or_default();
            let is_closed_int: i32 = row.get(9)?;
            Ok(Issue {
                id: row.get(0)?,
                project_id: row.get(1)?,
                epic_id: row.get(2)?,
                jira_issue_id: row.get(3)?,
                jira_key: row.get(4)?,
                issue_type: row.get(5)?,
                summary: row.get(6)?,
                description: row.get(7)?,
                status: row.get(8)?,
                is_closed: is_closed_int != 0,
                priority: row.get(10)?,
                labels,
                comment_count: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_context_version(&self, epic_id: &str) -> Result<Option<ContextVersion>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, epic_id, version_number, summary, business_rules, requirements, decisions, dependencies, known_issues, terminology, source_issue_ids, source_tickets_count, source_comments_count, created_at, created_by, model_version
             FROM context_versions WHERE epic_id = ?1 ORDER BY version_number DESC LIMIT 1"
        )?;

        let mut rows = stmt.query_map(params![epic_id], |row| {
            let br_str: String = row.get(4)?;
            let req_str: String = row.get(5)?;
            let dec_str: String = row.get(6)?;
            let dep_str: String = row.get(7)?;
            let ki_str: String = row.get(8)?;
            let term_str: String = row.get(9)?;
            let src_str: String = row.get(10)?;

            Ok(ContextVersion {
                id: row.get(0)?,
                epic_id: row.get(1)?,
                version_number: row.get(2)?,
                summary: row.get(3)?,
                business_rules: serde_json::from_str(&br_str).unwrap_or_default(),
                requirements: serde_json::from_str(&req_str).unwrap_or_default(),
                decisions: serde_json::from_str(&dec_str).unwrap_or_default(),
                dependencies: serde_json::from_str(&dep_str).unwrap_or_default(),
                known_issues: serde_json::from_str(&ki_str).unwrap_or_default(),
                terminology: serde_json::from_str(&term_str).unwrap_or_default(),
                source_issue_ids: serde_json::from_str(&src_str).unwrap_or_default(),
                source_tickets_count: row.get(11)?,
                source_comments_count: row.get(12)?,
                created_at: row.get(13)?,
                created_by: row.get(14)?,
                model_version: row.get(15)?,
            })
        })?;

        if let Some(r) = rows.next() {
            Ok(Some(r?))
        } else {
            Ok(None)
        }
    }

    pub fn insert_context_version(&self, cv: &ContextVersion) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO context_versions (
                id, epic_id, version_number, summary, business_rules, requirements, decisions,
                dependencies, known_issues, terminology, source_issue_ids, source_tickets_count,
                source_comments_count, created_at, created_by, model_version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            "#,
            params![
                cv.id,
                cv.epic_id,
                cv.version_number,
                cv.summary,
                serde_json::to_string(&cv.business_rules).unwrap_or_default(),
                serde_json::to_string(&cv.requirements).unwrap_or_default(),
                serde_json::to_string(&cv.decisions).unwrap_or_default(),
                serde_json::to_string(&cv.dependencies).unwrap_or_default(),
                serde_json::to_string(&cv.known_issues).unwrap_or_default(),
                serde_json::to_string(&cv.terminology).unwrap_or_default(),
                serde_json::to_string(&cv.source_issue_ids).unwrap_or_default(),
                cv.source_tickets_count,
                cv.source_comments_count,
                cv.created_at,
                cv.created_by,
                cv.model_version
            ],
        )?;

        // Update epic context status
        conn.execute(
            "UPDATE epics SET context_status = 'built', active_context_version = ?1, last_context_build = ?2 WHERE id = ?3",
            params![cv.version_number, cv.created_at, cv.epic_id],
        )?;

        Ok(())
    }

    pub fn get_ticket_drafts(&self, epic_id: Option<&str>) -> Result<Vec<TicketDraft>> {
        let conn = self.conn.lock().unwrap();
        let mut list = Vec::new();

        if let Some(eid) = epic_id {
            let mut stmt = conn.prepare(
                r#"
                SELECT td.id, td.source_id, td.epic_id, e.name as epic_name, td.draft_type, td.summary, td.description,
                       td.labels, td.confidence, td.status, td.reason, td.classification_category,
                       td.is_confirmed_from_source, td.source_evidence, td.potential_duplicate_key,
                       td.duplicate_similarity, td.created_jira_key, td.created_at
                FROM ticket_drafts td
                JOIN epics e ON e.id = td.epic_id
                WHERE td.epic_id = ?1
                ORDER BY td.created_at DESC
                "#
            )?;
            let rows = stmt.query_map(params![eid], |row| {
                let labels_str: String = row.get(7)?;
                let confirmed_int: i32 = row.get(12)?;
                Ok(TicketDraft {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    epic_id: row.get(2)?,
                    epic_name: row.get(3)?,
                    draft_type: row.get(4)?,
                    summary: row.get(5)?,
                    description: row.get(6)?,
                    labels: serde_json::from_str(&labels_str).unwrap_or_default(),
                    confidence: row.get(8)?,
                    status: row.get(9)?,
                    reason: row.get(10)?,
                    classification_category: row.get(11)?,
                    is_confirmed_from_source: confirmed_int != 0,
                    source_evidence: row.get(13)?,
                    potential_duplicate_key: row.get(14)?,
                    duplicate_similarity: row.get(15)?,
                    created_jira_key: row.get(16)?,
                    created_at: row.get(17)?,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                r#"
                SELECT td.id, td.source_id, td.epic_id, e.name as epic_name, td.draft_type, td.summary, td.description,
                       td.labels, td.confidence, td.status, td.reason, td.classification_category,
                       td.is_confirmed_from_source, td.source_evidence, td.potential_duplicate_key,
                       td.duplicate_similarity, td.created_jira_key, td.created_at
                FROM ticket_drafts td
                JOIN epics e ON e.id = td.epic_id
                ORDER BY td.created_at DESC
                "#
            )?;
            let rows = stmt.query_map([], |row| {
                let labels_str: String = row.get(7)?;
                let confirmed_int: i32 = row.get(12)?;
                Ok(TicketDraft {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    epic_id: row.get(2)?,
                    epic_name: row.get(3)?,
                    draft_type: row.get(4)?,
                    summary: row.get(5)?,
                    description: row.get(6)?,
                    labels: serde_json::from_str(&labels_str).unwrap_or_default(),
                    confidence: row.get(8)?,
                    status: row.get(9)?,
                    reason: row.get(10)?,
                    classification_category: row.get(11)?,
                    is_confirmed_from_source: confirmed_int != 0,
                    source_evidence: row.get(13)?,
                    potential_duplicate_key: row.get(14)?,
                    duplicate_similarity: row.get(15)?,
                    created_jira_key: row.get(16)?,
                    created_at: row.get(17)?,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        }

        Ok(list)
    }

    pub fn update_ticket_draft_status(&self, draft_id: &str, status: &str, created_jira_key: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE ticket_drafts SET status = ?1, created_jira_key = ?2 WHERE id = ?3",
            params![status, created_jira_key, draft_id],
        )?;
        Ok(())
    }

    pub fn seed_demo_data(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Check if already seeded
        let count: i32 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }

        let proj_id = "proj-isb-01";
        conn.execute(
            "INSERT INTO projects (id, jira_project_id, jira_project_key, name, avatar_url, created_at, updated_at)
             VALUES (?1, '10042', 'ISB', 'ISB Student Success', 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/default-avatar.png', datetime('now'), datetime('now'))",
            params![proj_id],
        )?;

        // Epics defined in the specification
        let epics = vec![
            ("epic-aa-01", "ISB-4000", "Academic Associate", "Academic Associate workflows, advising allocations, and profiles", "In Progress", "built", 7, "2026-10-05 10:30:00"),
            ("epic-adv-02", "ISB-3950", "Advising", "Student advising scheduling, session tracking, and advisor notes", "In Progress", "built", 3, "2026-10-04 14:15:00"),
            ("epic-ws-03", "ISB-3820", "Workshops", "Workshop registrations, attendee check-ins, and feedback forms", "In Progress", "unbuilt", 0, ""),
            ("epic-exam-04", "ISB-3700", "Exams", "Examination calendar, proctor assignments, and grade submission", "To Do", "unbuilt", 0, ""),
            ("epic-fb-05", "ISB-3650", "Feedback", "Course & faculty feedback collection engine", "To Do", "unbuilt", 0, ""),
            ("epic-int-06", "ISB-3500", "Integrations", "Salesforce CRM sync, Canvas LMS integration, and SSO bridges", "In Progress", "unbuilt", 0, ""),
            ("epic-sp-07", "ISB-3400", "Student Portal", "Self-service web portal for undergraduate and postgraduate students", "In Progress", "unbuilt", 0, ""),
        ];

        for (eid, jkey, name, summary, status, cstatus, cv, lbuild) in epics {
            conn.execute(
                "INSERT INTO epics (id, project_id, jira_issue_id, jira_key, name, summary, status, context_status, active_context_version, last_context_build)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![eid, proj_id, format!("JIRA-{}", jkey), jkey, name, summary, status, cstatus, cv, if lbuild.is_empty() { None } else { Some(lbuild) }],
            )?;
        }

        // Academic Associate tickets (42 tickets total: 37 closed, 5 open)
        let aa_epic_id = "epic-aa-01";
        
        // Open tickets
        let open_tickets = vec![
            ("ISB-4194", "Add AA Profile course preferences multi-select validation", "Requirement", "In Progress", "High", vec!["academic-associate", "validation", "lwc"]),
            ("ISB-4193", "Fix course preference notification trigger timing", "Bug", "In Progress", "Highest", vec!["academic-associate", "notifications", "apex"]),
            ("ISB-4190", "Export AA term workload distribution to Excel/CSV", "Story", "To Do", "Medium", vec!["academic-associate", "reports"]),
            ("ISB-4185", "Enforce maximum 4 active advisee cohort assignments per AA", "Requirement", "To Do", "High", vec!["academic-associate", "business-rules"]),
            ("ISB-4180", "Audit trail logging for Academic Associate role elevation", "Task", "To Do", "Low", vec!["academic-associate", "security"]),
        ];

        for (jkey, sum, itype, st, prio, labels) in open_tickets {
            let iid = format!("iss-{}", jkey.to_lowercase());
            conn.execute(
                "INSERT INTO issues (id, project_id, epic_id, jira_issue_id, jira_key, issue_type, summary, description, status, is_closed, priority, labels, comment_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11, 4, '2026-09-20 09:00:00', '2026-10-04 11:20:00')",
                params![
                    iid, proj_id, aa_epic_id, format!("JIRA-{}", jkey), jkey, itype, sum,
                    format!("Detailed specification for {}. Adheres to ISB Academic Associate governance policies.", sum),
                    st, prio, serde_json::to_string(&labels).unwrap_or_default()
                ],
            )?;
        }

        // Closed tickets (37 closed tickets, including specific ones mentioned in the spec ISB-4001..4005, ISB-4010, ISB-4112, ISB-4147)
        let sample_closed = vec![
            ("ISB-4001", "Initial Academic Associate Object Schema and Record Types", "Requirement", "Done", "High", vec!["academic-associate", "schema"]),
            ("ISB-4002", "Associate advisee assignment workflow and assignment rules", "Requirement", "Done", "High", vec!["academic-associate", "flow"]),
            ("ISB-4003", "Null pointer exception when AA submits feedback with empty remarks", "Bug", "Closed", "Highest", vec!["academic-associate", "bug-fix"]),
            ("ISB-4004", "Academic Associate mobile responsive view in Salesforce Experience Cloud", "Requirement", "Done", "Medium", vec!["academic-associate", "ui"]),
            ("ISB-4005", "Automated email notification upon AA onboarding completion", "Enhancement", "Closed", "Low", vec!["academic-associate", "email"]),
            ("ISB-4010", "Fix timezone mismatch in AA advising calendar synchronizer", "Bug", "Done", "High", vec!["academic-associate", "calendar"]),
            ("ISB-4112", "Implement AA Course Preference selection form with Apex controller", "Requirement", "Done", "High", vec!["academic-associate", "course-preference", "lwc"]),
            ("ISB-4147", "Send email and in-app notification when AA changes course preference", "Requirement", "Done", "High", vec!["academic-associate", "course-preference", "notifications"]),
        ];

        for (jkey, sum, itype, st, prio, labels) in sample_closed {
            let iid = format!("iss-{}", jkey.to_lowercase());
            conn.execute(
                "INSERT INTO issues (id, project_id, epic_id, jira_issue_id, jira_key, issue_type, summary, description, status, is_closed, priority, labels, comment_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11, 8, '2026-08-10 10:00:00', '2026-09-15 16:30:00')",
                params![
                    iid, proj_id, aa_epic_id, format!("JIRA-{}", jkey), jkey, itype, sum,
                    format!("Completed implementation of {}. Verified in QA and released.", sum),
                    st, prio, serde_json::to_string(&labels).unwrap_or_default()
                ],
            )?;
        }

        // Add 29 more closed historical tickets to reach the exact 37 closed count specified in documentation
        for i in 11..=39 {
            let jkey = format!("ISB-40{:02}", i);
            let iid = format!("iss-{}", jkey.to_lowercase());
            let sum = format!("Historical Academic Associate operational maintenance item #{}", i);
            let labels = vec!["academic-associate".to_string(), "legacy".to_string()];
            conn.execute(
                "INSERT INTO issues (id, project_id, epic_id, jira_issue_id, jira_key, issue_type, summary, description, status, is_closed, priority, labels, comment_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'Story', ?6, ?7, 'Closed', 1, 'Medium', ?8, 3, '2026-07-01 10:00:00', '2026-08-30 18:00:00')",
                params![
                    iid, proj_id, aa_epic_id, format!("JIRA-{}", jkey), jkey, sum,
                    format!("Archived story {}. All acceptance criteria met.", sum),
                    serde_json::to_string(&labels).unwrap_or_default()
                ],
            )?;
        }

        // Seed Context v7 for Academic Associate
        let cv7_id = "cv-aa-v7";
        let br = vec![
            "BR-AA-01: An Academic Associate can be assigned to a maximum of 4 active cohorts concurrently.",
            "BR-AA-02: Course preference updates trigger instantaneous in-app alert and asynchronous email dispatch to department head (per ISB-4147).",
            "BR-AA-03: Grade override permissions require dual-factor authorization and audit log entry.",
            "BR-AA-04: Closed tickets are retained permanently in Epic intelligence store for regression prevention.",
        ];
        let reqs = vec![
            "FR-01: AA Profile management with multi-select course preference taxonomy.",
            "FR-02: Real-time advising session scheduler synchronized with Outlook Exchange.",
            "FR-03: Automated advisee escalation matrix for students with GPA < 2.5.",
        ];
        let decs = vec![
            "ADR-14: Implemented course preference via custom LWC 'c-aa-course-preference-selector' rather than standard picklist.",
            "ADR-18: Event-driven notification dispatch moved from synchronous Trigger to Platform Events (ISB-4147).",
        ];
        let deps = vec![
            "Salesforce Education Cloud Core v2.4",
            "SendGrid Mailer Service",
            "Exchange Graph API Integration",
        ];
        let ki = vec![
            "Known issue with iOS Safari datepicker on advising appointment booking (mitigated in ISB-4010).",
            "Notification race condition when multiple preferences saved simultaneously (currently tracked in ISB-4193).",
        ];
        let terms = vec![
            "AA: Academic Associate",
            "Cohort: Academic batch of graduate students",
            "LWC: Lightning Web Component",
            "ADF: Atlassian Document Format",
        ];

        conn.execute(
            r#"
            INSERT INTO context_versions (
                id, epic_id, version_number, summary, business_rules, requirements, decisions,
                dependencies, known_issues, terminology, source_issue_ids, source_tickets_count,
                source_comments_count, created_at, created_by, model_version
            ) VALUES (?1, ?2, 7, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 42, 318, '2026-10-05 10:30:00', 'Prajwal Jivtode', 'gemini-3.8-flash-context-v2')
            "#,
            params![
                cv7_id, aa_epic_id,
                "Academic Associate module context covering instructor-advisee allocation, course preferences, and automated notification pipelines across 42 historical and active tickets.",
                serde_json::to_string(&br).unwrap_or_default(),
                serde_json::to_string(&reqs).unwrap_or_default(),
                serde_json::to_string(&decs).unwrap_or_default(),
                serde_json::to_string(&deps).unwrap_or_default(),
                serde_json::to_string(&ki).unwrap_or_default(),
                serde_json::to_string(&terms).unwrap_or_default(),
                serde_json::to_string(&vec!["iss-isb-4194", "iss-isb-4193", "iss-isb-4147", "iss-isb-4112"]).unwrap_or_default(),
            ],
        )?;

        // Seed 3 Ticket Candidates / Drafts directly representing the examples from the spec!
        let drafts = vec![
            (
                "draft-001", aa_epic_id, "Story",
                "AA Profile enhancement: Course preference multi-select & department validation",
                "h2. Problem\nAcademic Associates currently select courses without validation of department prerequisites.\n\nh2. Expected Behavior\nSelection UI should filter courses dynamically and enforce prerequisite validation rules.\n\nh2. Evidence\nDiscussed in transcript meeting_2026_10_05.txt at 00:14:20 and linked to ISB-4112.",
                vec!["academic-associate", "course-preference", "lwc"],
                0.96, "NEEDS_REVIEW",
                "Related to existing Academic Associate course preference workflow discussed in ISB-4112 and ISB-4147.",
                "NEW_REQUIREMENT", 1,
                "Transcript 00:14:20: 'When an AA changes course preference, the department head must approve if outside home department.'",
                None::<String>, None::<f32>
            ),
            (
                "draft-002", aa_epic_id, "Bug",
                "Course preference notification not triggered after mobile update",
                "h2. Problem\nNotification email is failing to send when updates are saved from Experience Cloud mobile web.\n\nh2. Expected Behavior\nPlatform Event should trigger regardless of client user agent.\n\nh2. Actual Behavior\nUpdate succeeds in database, but notification trigger does not fire.\n\nh2. Steps to Reproduce\n1. Login as AA on mobile\n2. Update course preference to 'Data Analytics'\n3. Save\n4. Check email inbox",
                vec!["academic-associate", "notifications", "bug"],
                0.91, "NEEDS_REVIEW",
                "Behavior already exists in ISB-4147 but reported as failing in mobile channel during Oct 5 review call.",
                "BUG", 1,
                "Transcript 00:32:10: 'We noticed the notification isn't firing when instructors use their tablets.'",
                Some("ISB-4147".to_string()), Some(0.89)
            ),
            (
                "draft-003", "epic-adv-02", "Story",
                "Advising: Add automated student calendar invite generation upon booking confirmation",
                "h2. Business Objective\nReduce no-shows by automatically issuing standard .ics calendar invite to student student email upon advisor confirmation.",
                vec!["advising", "calendar", "exchange"],
                0.88, "NEEDS_REVIEW",
                "Explicitly requested during advising module segment (01:20:00).",
                "NEW_REQUIREMENT", 1,
                "Transcript 01:22:45: 'Can we make sure students get an immediate calendar invite?'",
                None::<String>, None::<f32>
            )
        ];

        for (did, eid, dtype, sum, desc, labels, conf, st, reason, cat, is_conf, evid, dup_key, dup_sim) in drafts {
            conn.execute(
                r#"
                INSERT INTO ticket_drafts (
                    id, source_id, epic_id, draft_type, summary, description, labels,
                    confidence, status, reason, classification_category, is_confirmed_from_source,
                    source_evidence, potential_duplicate_key, duplicate_similarity, created_at
                ) VALUES (?1, 'src-transcript-01', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'))
                "#,
                params![
                    did, eid, dtype, sum, desc,
                    serde_json::to_string(&labels).unwrap_or_default(),
                    conf, st, reason, cat, is_conf, evid, dup_key, dup_sim
                ],
            )?;
        }

        Ok(())
    }
}

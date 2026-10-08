use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraOAuthConfig {
    pub client_id: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

impl Default for JiraOAuthConfig {
    fn default() -> Self {
        Self {
            client_id: "project_intelligence_desktop".to_string(),
            redirect_uri: "http://localhost:8234/callback".to_string(),
            scopes: vec![
                "read:jira-work".to_string(),
                "write:jira-work".to_string(),
                "read:jira-user".to_string(),
                "offline_access".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdfDocument {
    pub version: i32,
    #[serde(rename = "type")]
    pub doc_type: String,
    pub content: Vec<AdfNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdfNode {
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<AdfNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

impl AdfDocument {
    pub fn from_plain_text(text: &str) -> Self {
        let paragraphs: Vec<AdfNode> = text
            .split("\n\n")
            .map(|para| AdfNode {
                node_type: "paragraph".to_string(),
                content: Some(vec![AdfNode {
                    node_type: "text".to_string(),
                    content: None,
                    text: Some(para.to_string()),
                }]),
                text: None,
            })
            .collect();

        Self {
            version: 1,
            doc_type: "doc".to_string(),
            content: paragraphs,
        }
    }
}

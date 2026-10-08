export interface Project {
  id: string;
  jira_project_id: string;
  jira_project_key: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Epic {
  id: string;
  project_id: string;
  jira_issue_id: string;
  jira_key: string;
  name: string;
  summary?: string;
  status: string;
  context_status: 'unbuilt' | 'building' | 'built' | 'stale';
  active_context_version: number;
  total_tickets: number;
  closed_tickets: number;
  open_tickets: number;
  last_context_build?: string;
}

export interface Issue {
  id: string;
  project_id: string;
  epic_id?: string;
  jira_issue_id: string;
  jira_key: string;
  issue_type: string;
  summary: string;
  description?: string;
  status: string;
  is_closed: boolean;
  priority: string;
  labels: string[];
  comment_count: number;
  assignee?: string;
  reporter?: string;
  jira_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ContextSubsystem {
  name: string;
  description: string;
  tickets: string[];
}

export interface ContextWorkflow {
  persona: string;
  app: string;
  tab: string;
  title: string;
  steps: string[];
  invariants?: string[];
}

export interface ContextTicketReference {
  jira_key: string;
  summary: string;
  description?: string;
  status: string;
  issue_type: string;
  priority: string;
  jira_url?: string;
}

export interface ContextVersion {
  id: string;
  epic_id: string;
  version_number: number;
  summary: string;
  business_rules: string[];
  requirements: string[];
  decisions: string[];
  dependencies: string[];
  known_issues: string[];
  terminology: string[];
  source_issue_ids: string[];
  source_tickets_count: number;
  source_comments_count: number;
  created_at: string;
  created_by: string;
  model_version: string;
  documentation_markdown?: string;
  subsystems?: ContextSubsystem[];
  workflows?: ContextWorkflow[];
  module_analysis?: string;
  source_tickets?: ContextTicketReference[];
}

export interface TicketDraft {
  id: string;
  source_id?: string;
  epic_id: string;
  epic_name: string;
  draft_type: 'Story' | 'Bug' | 'Task' | 'Requirement' | 'Epic';
  summary: string;
  description: string;
  labels: string[];
  priority?: string;
  confidence: number;
  status: 'NEEDS_REVIEW' | 'APPROVED' | 'CREATED' | 'REJECTED';
  reason: string;
  classification_category: 'NEW_REQUIREMENT' | 'BUG' | 'ENHANCEMENT' | 'DUPLICATE' | 'QUESTION';
  is_confirmed_from_source: boolean;
  source_evidence: string;
  potential_duplicate_key?: string;
  duplicate_similarity?: number;
  created_jira_key?: string;
  created_at: string;
}

export type RequirementCategory = 'requirement' | 'bug' | 'enhancement' | 'decision' | 'question';
export type RecommendedIssueType = 'Story' | 'Bug' | 'Task' | 'Enhancement' | 'None';
export type AnalysisConfidence = 'high' | 'medium' | 'low';

export interface RequirementEvidence {
  sourceName: string;
  location: string;
  quote: string;
}

export interface RelatedJiraIssue {
  key: string;
  summary: string;
  status: string;
  reason: string;
}

export interface RequirementFinding {
  id: string;
  title: string;
  description: string;
  category: RequirementCategory;
  recommendedIssueType: RecommendedIssueType;
  epicKey?: string;
  epicName?: string;
  classificationConfidence: AnalysisConfidence;
  epicConfidence: AnalysisConfidence;
  evidence: RequirementEvidence[];
  relatedIssues: RelatedJiraIssue[];
  ambiguity?: string;
  disposition: 'pending' | 'ticket' | 'duplicate' | 'ignored' | 'clarification';
}

export interface RequirementAnalysisResult {
  overallUnderstanding: string;
  identifiedEpics: Array<{ key: string; name: string; findingIds: string[] }>;
  findings: RequirementFinding[];
  clarificationQuestions: string[];
  ticketEstimate: number;
  jiraCoverage: string;
}

export interface ChatAttachmentReference {
  id: string;
  name: string;
  mediaType: 'text' | 'docx' | 'pdf';
  size: number;
}

export interface AuthStatus {
  jira_connected: boolean;
  jira_account_name?: string;
  jira_account_email?: string;
  copilot_connected: boolean;
  copilot_account_name?: string;
  copilot_token?: string;
}

export interface CopilotChatMessage {
  id: string;
  sender: 'user' | 'copilot';
  text: string;
  timestamp: string;
  codeSnippet?: string;
  verdict?: 'APPROVED' | 'CONFLICT_DETECTED' | 'REDUNDANCY_DETECTED';
  draftProposal?: TicketDraft;
  creationStatus?: 'idle' | 'creating' | 'created' | 'error';
  createdKey?: string;
  errorMessage?: string;
  isLiveCopilotApi?: boolean;
}

export interface CopilotChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  project_key?: string;
  messages: CopilotChatMessage[];
}

export interface BuildContextOptions {
  include_closed_tickets: boolean;
  include_comments: boolean;
  include_linked_issues: boolean;
  include_jira_history: boolean;
  include_github_prs: boolean;
}

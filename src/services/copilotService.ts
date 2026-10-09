/**
 * GitHub Copilot Service
 * Connects directly to GitHub Copilot API / GitHub Models and manages persistent chat sessions.
 */
import {
  ChatAttachmentReference,
  ContextVersion,
  Epic,
  Issue,
  Project,
  RequirementAnalysisResult,
  TicketDraft,
} from '../types';
import { getUserStorageItem, removeUserStorageItem, setUserStorageItem } from './userStorage';
import { jiraService } from './jiraService';

export interface CopilotEpicContextAnalysis {
  summary: string;
  module_analysis: string;
  business_rules: string[];
  requirements: string[];
  decisions: string[];
  dependencies: string[];
  known_issues: string[];
  terminology: string[];
  ticket_relationships: string[];
  subsystems: Array<{ name: string; description: string; tickets: string[] }>;
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
  attachments?: ChatAttachmentReference[];
  requirementAnalysis?: RequirementAnalysisResult;
}

export interface CopilotConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  requirementAnalysis?: RequirementAnalysisResult;
}

export interface CopilotChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  project_key?: string;
  messages: CopilotChatMessage[];
}

export type ChatHistorySyncState = 'local' | 'syncing' | 'synced' | 'unavailable';

type ChatHistorySyncListener = (state: ChatHistorySyncState, message?: string) => void;

const STORAGE_KEYS = {
  SESSIONS: 'copilot_chat_sessions_v2',
  ACTIVE_SESSION_ID: 'copilot_active_session_id_v2',
  GITHUB_TOKEN: 'copilot_github_token_v2',
  COPILOT_ENDPOINT: 'copilot_custom_endpoint_v2',
  DELETED_SESSIONS: 'copilot_deleted_sessions_v1',
};

class CopilotService {
  private historySyncListeners = new Set<ChatHistorySyncListener>();
  private historyWriteQueue: Promise<void> = Promise.resolve();

  public subscribeChatHistorySync(listener: ChatHistorySyncListener): () => void {
    this.historySyncListeners.add(listener);
    return () => this.historySyncListeners.delete(listener);
  }

  private emitChatHistorySync(state: ChatHistorySyncState, message?: string): void {
    for (const listener of this.historySyncListeners) listener(state, message);
  }

  private isWebApp(): boolean {
    return typeof window !== 'undefined'
      && !(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  }

  private getDeletedSessions(): Record<string, string> {
    try {
      return JSON.parse(getUserStorageItem(STORAGE_KEYS.DELETED_SESSIONS) || '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }

  private saveDeletedSessions(deleted: Record<string, string>): void {
    setUserStorageItem(STORAGE_KEYS.DELETED_SESSIONS, JSON.stringify(deleted));
  }

  private async enqueueHistoryWrite(write: () => Promise<void>): Promise<void> {
    const nextWrite = this.historyWriteQueue.catch(() => undefined).then(write);
    this.historyWriteQueue = nextWrite;
    return nextWrite;
  }

  private async sendHistoryRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const authHeaders = jiraService.getChatHistoryAuthHeaders();
    if (!authHeaders || !this.isWebApp()) throw new Error('Jira account is not available for chat history sync.');
    const headers = new Headers(authHeaders);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
      let message = `Chat history sync failed (${response.status}).`;
      try {
        const body = await response.json() as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based message when the response is not JSON.
      }
      throw new Error(message);
    }
    return response;
  }

  private persistSessionsToServer(sessions: CopilotChatSession[]): Promise<void> {
    return this.enqueueHistoryWrite(async () => {
      this.emitChatHistorySync('syncing');
      await this.sendHistoryRequest('/api/chat-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      });
      this.emitChatHistorySync('synced');
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Chat history could not be synced.';
      this.emitChatHistorySync('unavailable', message);
      throw error;
    });
  }

  public async syncSessionsWithServer(localSessions: CopilotChatSession[]): Promise<CopilotChatSession[]> {
    if (!this.isWebApp() || !jiraService.getChatHistoryAuthHeaders()) {
      this.emitChatHistorySync('local', 'Chat history is stored only in this browser.');
      return localSessions;
    }

    this.emitChatHistorySync('syncing');
    try {
      const response = await this.sendHistoryRequest('/api/chat-sessions');
      const remote = await response.json() as {
        sessions: CopilotChatSession[];
        deleted: Array<{ id: string; deletedAt: string }>;
      };
      const tombstones = this.getDeletedSessions();
      const remoteDeleted = new Set<string>();
      for (const entry of remote.deleted || []) {
        remoteDeleted.add(entry.id);
        if (!tombstones[entry.id] || Date.parse(entry.deletedAt) > Date.parse(tombstones[entry.id])) {
          tombstones[entry.id] = entry.deletedAt;
        }
      }

      const sessionsById = new Map<string, CopilotChatSession>();
      for (const session of [...localSessions, ...(remote.sessions || [])]) {
        const current = sessionsById.get(session.id);
        if (!current || Date.parse(session.updated_at) >= Date.parse(current.updated_at)) {
          sessionsById.set(session.id, session);
        }
      }
      const merged = [...sessionsById.values()].filter((session) => !tombstones[session.id]);
      this.saveDeletedSessions(tombstones);
      for (const [sessionId, deletedAt] of Object.entries(tombstones)) {
        if (!remoteDeleted.has(sessionId)) await this.deleteSessionFromServer(sessionId, deletedAt);
      }
      await this.persistSessionsToServer(merged);
      this.saveSessionsLocally(merged);
      this.emitChatHistorySync('synced');
      return merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat history could not be synced.';
      this.emitChatHistorySync('unavailable', message);
      throw error;
    }
  }

  private deleteSessionFromServer(sessionId: string, deletedAt: string): Promise<void> {
    return this.enqueueHistoryWrite(async () => {
      await this.sendHistoryRequest(`/api/chat-sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'X-Deleted-At': deletedAt },
      });
    });
  }

  public getGithubToken(): string {
    return getUserStorageItem(STORAGE_KEYS.GITHUB_TOKEN) || '';
  }

  public setGithubToken(token: string) {
    setUserStorageItem(STORAGE_KEYS.GITHUB_TOKEN, token.trim());
  }

  public clearGithubToken() {
    removeUserStorageItem(STORAGE_KEYS.GITHUB_TOKEN);
  }

  public isConnected(): boolean {
    return Boolean(this.getGithubToken().length > 0);
  }

  public getCustomEndpoint(): string {
    return getUserStorageItem(STORAGE_KEYS.COPILOT_ENDPOINT) || '';
  }

  public setCustomEndpoint(endpoint: string) {
    setUserStorageItem(STORAGE_KEYS.COPILOT_ENDPOINT, endpoint.trim());
  }

  // --- Session Management ---

  public getSessions(): CopilotChatSession[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = getUserStorageItem(STORAGE_KEYS.SESSIONS);
      if (data) {
        return JSON.parse(data) as CopilotChatSession[];
      }
    } catch (e) {
      console.warn('Failed to parse copilot chat sessions:', e);
    }
    return [];
  }

  public saveSessions(sessions: CopilotChatSession[]): void {
    if (typeof window === 'undefined') return;
    this.saveSessionsLocally(sessions);
    if (this.isWebApp() && jiraService.getChatHistoryAuthHeaders()) {
      void this.persistSessionsToServer(sessions).catch(() => undefined);
    }
  }

  private saveSessionsLocally(sessions: CopilotChatSession[]): void {
    try {
      setUserStorageItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save copilot sessions:', e);
    }
  }

  public getActiveSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return getUserStorageItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
  }

  public setActiveSessionId(id: string): void {
    if (typeof window === 'undefined') return;
    setUserStorageItem(STORAGE_KEYS.ACTIVE_SESSION_ID, id);
  }

  public getOrCreateActiveSession(projectKey: string = 'ISB'): CopilotChatSession {
    const sessions = this.getSessions();
    const activeId = this.getActiveSessionId();

    if (activeId) {
      const found = sessions.find((s) => s.id === activeId);
      if (found) return found;
    }

    if (sessions.length > 0) {
      this.setActiveSessionId(sessions[0].id);
      return sessions[0];
    }

    const newSession = this.createNewSession(projectKey, 'Requirement Delivery Analysis');
    return newSession;
  }

  public createNewSession(projectKey: string = 'ISB', title?: string): CopilotChatSession {
    const sessions = this.getSessions();
    const newSession: CopilotChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: title || 'New Delivery Session',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_key: projectKey,
      messages: [
        {
          id: `m-init-${Date.now()}`,
          sender: 'copilot',
          text: 'Hi! Select an epic and I can analyze its tickets or help draft a new one.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    };

    const updated = [newSession, ...sessions];
    this.saveSessions(updated);
    this.setActiveSessionId(newSession.id);
    return newSession;
  }

  public saveSessionMessages(sessionId: string, messages: CopilotChatMessage[]): void {
    const sessions = this.getSessions();
    const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].messages = messages;
      sessions[sessionIndex].updated_at = new Date().toISOString();

      // Auto-update title if it's still default and there's a user message
      if (sessions[sessionIndex].title === 'New Delivery Session' || sessions[sessionIndex].title === 'Requirement Delivery Analysis') {
        const firstUserMsg = messages.find((m) => m.sender === 'user');
        if (firstUserMsg) {
          const clean = firstUserMsg.text.slice(0, 42).replace(/[\r\n]+/g, ' ').trim();
          sessions[sessionIndex].title = clean + (firstUserMsg.text.length > 42 ? '...' : '');
        }
      }

      this.saveSessions(sessions);
    }
  }

  public deleteSession(sessionId: string): CopilotChatSession[] {
    const sessions = this.getSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    const deleted = this.getDeletedSessions();
    const deletedAt = new Date().toISOString();
    deleted[sessionId] = deletedAt;
    this.saveDeletedSessions(deleted);
    if (this.isWebApp() && jiraService.getChatHistoryAuthHeaders()) {
      void this.deleteSessionFromServer(sessionId, deletedAt).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Chat history deletion could not be synced.';
        this.emitChatHistorySync('unavailable', message);
      });
    }
    this.saveSessions(filtered);
    if (this.getActiveSessionId() === sessionId) {
      if (filtered.length > 0) {
        this.setActiveSessionId(filtered[0].id);
      } else {
        removeUserStorageItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
      }
    }
    return filtered;
  }

  // --- GitHub Copilot Live Chat API Integration ---

  public async getAvailableModels(): Promise<string[]> {
    const token = this.getGithubToken();
    if (!token) return [];

    try {
      const res = await fetch('/api/copilot-models', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const models = await res.json();
        return Array.isArray(models) ? models : [];
      }
    } catch (e) {
      console.warn('Failed to fetch dynamic copilot models', e);
    }
    return [];
  }

  public async validateGithubToken(token: string): Promise<string[]> {
    const response = await fetch('/api/copilot-models', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const models: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = typeof models === 'object' && models !== null && 'error' in models
        ? String((models as { error: unknown }).error)
        : `Copilot validation failed (${response.status})`;
      throw new Error(message);
    }
    if (!Array.isArray(models) || models.length === 0) {
      throw new Error('GitHub returned no Copilot models. Use a fine-grained personal access token with the account permission "Copilot Requests".');
    }
    return models as string[];
  }

  /**
   * Build comprehensive module-level context using Copilot SDK by analyzing all epic tickets.
   * Generates rich documentation covering ticket-wise details, epic-wise summary, and architectural references.
   */
  public async buildEpicContextWithCopilot(
    epic: Epic,
    tickets: Issue[],
    project: Project | null,
    model?: string
  ): Promise<CopilotEpicContextAnalysis> {
    const token = this.getGithubToken();
    if (!token) throw new Error('Connect GitHub Copilot before building epic context.');

    const response = await fetch('/api/copilot-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitHubToken: token,
        projectName: project?.name || 'Project Intelligence',
        epicKey: epic.jira_key,
        epicName: epic.name,
        epicSummary: epic.summary,
        model,
        tickets: tickets.map((ticket) => ({
          jira_key: ticket.jira_key,
          summary: ticket.summary,
          description: ticket.description || '',
          status: ticket.status,
          issue_type: ticket.issue_type,
          priority: ticket.priority,
          labels: ticket.labels || [],
          jira_url: ticket.jira_url,
        })),
      }),
    });
    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = typeof result === 'object' && result !== null && 'error' in result
        ? String((result as { error: unknown }).error)
        : `Copilot context build failed (${response.status})`;
      throw new Error(message);
    }

    if (typeof result !== 'object' || result === null || !('module_analysis' in result) || typeof result.module_analysis !== 'string') {
      throw new Error('Copilot returned an incomplete epic context. Rebuild the context before continuing.');
    }

    return result as CopilotEpicContextAnalysis;
  }

  /**
   * Execute chat completion via GitHub Copilot Agent API.
   */
  public async callCopilotAgent(
    userPrompt: string,
    context: {
      project: Project | null;
      selectedEpic: Epic | null;
      epics: Epic[];
      drafts: TicketDraft[];
      model?: string;
      epicContext: ContextVersion | null;
      attachments?: Array<ChatAttachmentReference & { content: string }>;
      analyzeAttachments?: boolean;
      conversationHistory?: CopilotConversationTurn[];
      epicSearchIndex: Array<{
        id: string;
        jira_key: string;
        name: string;
        summary: string;
        tickets: Array<{
          jira_key: string;
          summary: string;
          description: string;
          status: string;
          issue_type: string;
          priority: string;
        }>;
      }>;
    }
  ): Promise<{
    analysisText: string;
    draft?: TicketDraft;
    requirementAnalysis?: RequirementAnalysisResult;
    isLiveApi: boolean;
    targetEpicName: string;
    rawResponse?: string;
  }> {
    const ghToken = this.getGithubToken();
    const projectKey = context.project?.jira_project_key || 'ISB';
    const projectName = context.project?.name || 'Project Intelligence';
    const epicName = context.selectedEpic?.name || 'No single Epic selected';
    const knownEpicNames = context.epics.map((e) => e.name);

    // Call server-side /api/copilot-sdk endpoint (powered by @github/copilot-sdk in Node)
    try {
      const res = await fetch('/api/copilot-sdk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          gitHubToken: ghToken || undefined,
          projectKey,
          projectName,
          epicName,
          knownEpics: knownEpicNames,
          epicSearchIndex: context.epicSearchIndex,
          attachments: context.attachments,
          analyzeAttachments: context.analyzeAttachments,
          conversationHistory: context.conversationHistory,
          model: context.model,
          epicContext: context.epicContext,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const isLive = data.source === 'github-copilot-sdk';
        
        if (!isLive) {
          throw new Error('Copilot SDK was unable to generate a response. Please check your GitHub token.');
        }

        if (data.requirement_analysis && typeof data.requirement_analysis === 'object') {
          const analysis = data.requirement_analysis as RequirementAnalysisResult;
          const epicCount = analysis.identifiedEpics.length;
          const findingCount = analysis.findings.length;
          const analysisText = `**Attachment analysis complete**\n\n${analysis.overallUnderstanding}\n\n${epicCount} Epic${epicCount === 1 ? '' : 's'} mapped · ${findingCount} finding${findingCount === 1 ? '' : 's'} · ${analysis.ticketEstimate} possible Jira ticket${analysis.ticketEstimate === 1 ? '' : 's'}\n\n${analysis.identifiedEpics.map((epic) => `• ${epic.name} (${epic.key}) · ${epic.findingIds.length} item${epic.findingIds.length === 1 ? '' : 's'}`).join('\n') || '• No Epic mapping was sufficiently supported'}\n\n${analysis.jiraCoverage}`;
          return {
            analysisText,
            requirementAnalysis: analysis,
            isLiveApi: true,
            targetEpicName: analysis.identifiedEpics[0]?.name || epicName,
          };
        }

        if (typeof data.response_text === 'string') {
          return {
            analysisText: data.response_text,
            isLiveApi: true,
            targetEpicName: context.selectedEpic?.name || epicName,
          };
        }

        const draft: TicketDraft = {
          id: `draft-cp-${Date.now()}`,
          epic_id: data.draft_type === 'Epic' ? 'NEW_EPIC' : context.selectedEpic?.id || 'GENERAL',
          epic_name: data.target_epic_name || epicName,
          draft_type: data.draft_type || 'Story',
          summary: data.summary,
          description: data.description,
          labels: data.labels || [projectKey.toLowerCase(), 'copilot-verified'],
          priority: data.priority || 'High',
          confidence: 0.99,
          status: 'NEEDS_REVIEW',
          reason: 'Synthesized live by GitHub Copilot Agent (@github/copilot-sdk).',
          classification_category: data.draft_type === 'Bug' ? 'BUG' : 'NEW_REQUIREMENT',
          is_confirmed_from_source: true,
          source_evidence: `Direct Copilot SDK synthesis for: "${userPrompt}"`,
          created_at: new Date().toISOString(),
        };

        if (data.clarifying_questions && data.clarifying_questions.length > 0) {
          data.clarifying_questions.map((q: string, i: number) => `${i + 1}. **${q}**`).join('\n');
        }

        const sourceLabel = '✨ **Live GitHub Copilot Agent Response** (`@github/copilot-sdk`)';

        const analysisText = `${sourceLabel}

${data.analysis_overview || ''}

- **Summary**: ${data.summary}
- **Type**: \`${data.draft_type}\`
- **Target Epic**: \`${data.target_epic_name || epicName}\`
- **Domain Labels**: ${draft.labels.map((l: string) => `\`${l}\``).join(', ')}

*Review the generated details in the card below before publishing to Jira:*`;

        return {
          analysisText,
          draft,
          isLiveApi: true,
          targetEpicName: data.target_epic_name || epicName,
        };
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Copilot API returned status ${res.status}`);
      }
    } catch (err) {
      console.warn('Call to /api/copilot-sdk failed:', err);
      throw new Error(err instanceof Error ? err.message : 'Unable to reach Copilot API');
    }
  }




}

export const copilotService = new CopilotService();

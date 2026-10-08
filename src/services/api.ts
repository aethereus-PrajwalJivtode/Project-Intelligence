import { Project, Epic, Issue, ContextVersion, TicketDraft, AuthStatus, BuildContextOptions } from '../types';
import { jiraService } from './jiraService';

let tauriInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
}

async function getInvoke() {
  if (!isTauri()) return null;
  if (tauriInvoke) return tauriInvoke;
  try {
    const core = await import('@tauri-apps/api/core');
    tauriInvoke = core.invoke;
    return tauriInvoke;
  } catch {
    return null;
  }
}

const DRAFTS_STORAGE_KEY = 'project_intelligence_ticket_drafts_v1';

function getStoredDrafts(): TicketDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredDrafts(drafts: TicketDraft[]): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.warn('Failed to persist drafts to localStorage:', e);
  }
}

export const api = {
  async getAuthStatus(): Promise<AuthStatus> {
    const isJiraAuth = jiraService.isAuthenticated();
    const creds = jiraService.getCredentials();
    return {
      jira_connected: isJiraAuth,
      jira_account_name: creds?.email?.split('@')[0],
      jira_account_email: creds?.email,
      copilot_connected: true,
      copilot_account_name: 'copilot-user',
    };
  },

  async getProjects(): Promise<Project[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<Project[]>('get_projects');
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }

    if (jiraService.isAuthenticated()) {
      return await jiraService.fetchProjects();
    }

    return [];
  },

  async getEpics(projectId: string): Promise<Epic[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<Epic[]>('get_epics', { projectId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }

    if (jiraService.isAuthenticated()) {
      const cleanKey = projectId.replace(/^proj-/, '').toUpperCase();
      return await jiraService.fetchEpics(cleanKey);
    }

    return [];
  },

  async getIssuesForEpic(epicId: string): Promise<Issue[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<Issue[]>('get_issues_for_epic', { epicId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }

    if (jiraService.isAuthenticated()) {
      const creds = jiraService.getCredentials();
      if (creds) {
        const cleanEpicKey = epicId.replace(/^epic-/, '').toUpperCase();
        return await jiraService.fetchIssues(cleanEpicKey);
      }
    }

    return [];
  },

  async getEpicContext(_epicId: string): Promise<ContextVersion | null> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<ContextVersion | null>('get_epic_context', { epicId: _epicId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }
    return null;
  },

  async buildEpicContext(_epicId: string, _options: BuildContextOptions): Promise<ContextVersion> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<ContextVersion>('build_epic_context', { epicId: _epicId, options: _options });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }
    throw new Error('Please build context through the Context Store engine.');
  },

  async getTicketDrafts(epicId?: string): Promise<TicketDraft[]> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        return await invoke<TicketDraft[]>('get_ticket_drafts', { epicId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }

    const drafts = getStoredDrafts();
    if (epicId) return drafts.filter((d) => d.epic_id === epicId);
    return drafts;
  },

  async saveTicketDraft(draft: TicketDraft): Promise<void> {
    const current = getStoredDrafts();
    const updated = [draft, ...current.filter((d) => d.id !== draft.id)];
    saveStoredDrafts(updated);
  },

  async approveTicketDraft(draftId: string): Promise<void> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        await invoke('approve_ticket_draft', { draftId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }
    const current = getStoredDrafts();
    const target = current.find((d) => d.id === draftId);
    if (target) {
      target.status = 'APPROVED';
      saveStoredDrafts(current);
    }
  },

  async rejectTicketDraft(draftId: string): Promise<void> {
    const invoke = await getInvoke();
    if (invoke) {
      try {
        await invoke('reject_ticket_draft', { draftId });
      } catch (err) {
        console.warn('Tauri invoke failed:', err);
      }
    }
    const current = getStoredDrafts();
    const target = current.find((d) => d.id === draftId);
    if (target) {
      target.status = 'REJECTED';
      saveStoredDrafts(current);
    }
  },

  async createJiraTicket(draftId: string): Promise<string> {
    const current = getStoredDrafts();
    const target = current.find((d) => d.id === draftId);
    if (!target) throw new Error(`Draft ${draftId} not found`);

    if (!jiraService.isAuthenticated()) {
      throw new Error('Jira Cloud credentials are not configured. Please connect Jira in Header.');
    }

    const isEpic = target.draft_type === 'Epic';
    const projectKey = target.epic_name ? target.epic_name.split('-')[0].trim() : 'ISB';

    let createdKey = '';
    if (isEpic) {
      createdKey = await jiraService.createEpic(
        projectKey,
        target.summary,
        target.description,
        target.labels
      );
    } else {
      createdKey = await jiraService.createIssue(
        projectKey,
        target.summary,
        target.description,
        target.draft_type === 'Bug' ? 'Bug' : 'Story',
        target.epic_id ? target.epic_id.replace(/^epic-/, '') : undefined,
        target.labels
      );
    }

    target.status = 'CREATED';
    target.created_jira_key = createdKey;
    saveStoredDrafts(current);
    return createdKey;
  },
};

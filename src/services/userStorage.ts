let activeUserScope: string | null = null;
const LEGACY_USER_STORAGE_KEYS = [
  'jira_cloud_credentials',
  'project_intelligence_ticket_drafts_v1',
  'project_intelligence_context_history_v1',
  'copilot_chat_sessions_v2',
  'copilot_active_session_id_v2',
  'copilot_github_token_v2',
  'copilot_custom_endpoint_v2',
];

export function purgeLegacyUserStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_USER_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('Could not remove unscoped legacy data from browser storage:', error);
  }
}

export function activateUserStorageScope(accountId: string, domain: string): string {
  const normalizedAccountId = accountId.trim();
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedAccountId || !normalizedDomain) {
    throw new Error('A verified Jira account and domain are required for user storage.');
  }

  activeUserScope = `${normalizedDomain}:${normalizedAccountId}`;
  return activeUserScope;
}

export function clearUserStorageScope(): void {
  activeUserScope = null;
}

export function getUserStorageScope(): string | null {
  return activeUserScope;
}

function scopedKey(key: string): string | null {
  if (!activeUserScope) return null;
  return `project-intelligence:user:${encodeURIComponent(activeUserScope)}:${key}`;
}

export function getUserStorageItem(key: string): string | null {
  const storageKey = scopedKey(key);
  if (!storageKey || typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey);
}

export function setUserStorageItem(key: string, value: string): void {
  const storageKey = scopedKey(key);
  if (!storageKey || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, value);
}

export function removeUserStorageItem(key: string): void {
  const storageKey = scopedKey(key);
  if (!storageKey || typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey);
}
import { Project, Epic, Issue } from '../types';

export interface JiraCredentials {
  domain: string; // e.g. "mycompany.atlassian.net"
  email: string;
  apiToken: string;
}

export interface JiraUserProfile {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl?: string;
  timeZone?: string;
}

export function normalizeDomain(raw: string): string {
  let d = (raw || '').trim();
  d = d.replace(/^https?:\/\//i, '');
  d = d.replace(/\/+$/, '');
  d = d.split('/')[0];
  if (d && !d.includes('.')) {
    d += '.atlassian.net';
  }
  return d;
}

class JiraService {
  private credentials: JiraCredentials | null = null;
  private readonly STORAGE_KEY = 'jira_cloud_credentials';

  constructor() {
    this.loadStoredCredentials();
  }

  public loadStoredCredentials(): JiraCredentials | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.credentials = JSON.parse(stored);
        if (this.credentials?.domain) {
          this.credentials.domain = normalizeDomain(this.credentials.domain);
        }
        return this.credentials;
      }
    } catch (e) {
      console.warn('Failed to parse stored Jira credentials:', e);
    }
    return null;
  }

  public saveCredentials(creds: JiraCredentials) {
    const cleanDomain = normalizeDomain(creds.domain);
    this.credentials = {
      domain: cleanDomain,
      email: creds.email.trim(),
      apiToken: creds.apiToken.trim(),
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.credentials));
  }

  public clearCredentials() {
    this.credentials = null;
    localStorage.removeItem(this.STORAGE_KEY);
  }

  public getCredentials(): JiraCredentials | null {
    return this.credentials;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.credentials?.domain && this.credentials?.email && this.credentials?.apiToken);
  }

  private getAuthHeader(creds?: JiraCredentials): string {
    const c = creds || this.credentials;
    if (!c) throw new Error('Jira credentials not configured');
    const token = btoa(`${c.email}:${c.apiToken}`);
    return `Basic ${token}`;
  }

  private buildUrl(path: string, creds?: JiraCredentials): string {
    const c = creds || this.credentials;
    if (!c) throw new Error('Jira domain not configured');
    const domain = normalizeDomain(c.domain);
    const targetUrl = `https://${domain}${path.startsWith('/') ? path : '/' + path}`;
    // Route through local proxy to avoid browser CORS constraints
    return `/api/jira-proxy?target=${encodeURIComponent(targetUrl)}`;
  }

  /**
   * Validates credentials against Jira Cloud /rest/api/3/myself
   */
  public async testConnection(creds: JiraCredentials): Promise<JiraUserProfile> {
    const cleanDomain = normalizeDomain(creds.domain);
    const cleanCreds: JiraCredentials = {
      domain: cleanDomain,
      email: creds.email.trim(),
      apiToken: creds.apiToken.trim(),
    };

    const url = this.buildUrl('/rest/api/3/myself', cleanCreds);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader(cleanCreds),
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = `Authentication failed (${response.status}): ${response.statusText}`;

      if (response.status === 401) {
        msg = `Authentication failed (401): Invalid email or API token for ${cleanDomain}. Please check your API token.`;
      } else if (response.status === 403) {
        msg = `Access forbidden (403): Account does not have permission to query Jira Cloud REST APIs.`;
      } else if (response.status === 404) {
        msg = `Domain not found (404): Could not reach Jira workspace at https://${cleanDomain}.`;
      } else if (response.status === 502) {
        try {
          const parsed = JSON.parse(errorText);
          msg = `Gateway connection error (502): ${parsed.details || parsed.error || 'Network error connecting to Atlassian'}`;
        } catch {
          msg = `Bad Gateway (502): Network proxy failure reaching https://${cleanDomain}.`;
        }
      } else {
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.errorMessages?.length) {
            msg = errJson.errorMessages.join(', ');
          } else if (errJson.message) {
            msg = errJson.message;
          }
        } catch {
          // keep fallback
        }
      }
      throw new Error(msg);
    }

    const data = await response.json();
    return {
      accountId: data.accountId,
      displayName: data.displayName,
      emailAddress: data.emailAddress || cleanCreds.email,
      avatarUrl: data.avatarUrls?.['48x48'] || data.avatarUrls?.['32x32'],
      timeZone: data.timeZone,
    };
  }

  /**
   * Fetches all projects visible to authenticated user across all spaces
   */
  public async fetchProjects(): Promise<Project[]> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated with Jira');

    // Strategy 1: GET /rest/api/3/project (returns all visible projects directly)
    try {
      const url = this.buildUrl('/rest/api/3/project?expand=description,lead');
      const res = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return list.map((p: any) => ({
            id: `proj-${p.key.toLowerCase()}`,
            jira_project_id: p.id,
            jira_project_key: p.key,
            name: p.name,
            avatar_url: p.avatarUrls?.['48x48'] || p.avatarUrls?.['32x32'],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
        }
      }
    } catch (e) {
      console.warn('GET /rest/api/3/project failed, trying project/search:', e);
    }

    // Strategy 2: GET /rest/api/3/project/search?maxResults=100
    const url = this.buildUrl('/rest/api/3/project/search?maxResults=100');
    const res = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader(),
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to load Jira projects: ${res.statusText}`);
    }

    const data = await res.json();
    const list = data.values || data;
    return (list || []).map((p: any) => ({
      id: `proj-${p.key.toLowerCase()}`,
      jira_project_id: p.id,
      jira_project_key: p.key,
      name: p.name,
      avatar_url: p.avatarUrls?.['48x48'] || p.avatarUrls?.['32x32'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }

  /**
   * Executes a JQL search using Atlassian's current /rest/api/3/search/jql endpoint
   * with backward-compatible fallbacks.
   */
  public async executeSearch(
    jql: string,
    fields: string[] = [
      'summary',
      'description',
      'status',
      'priority',
      'issuetype',
      'labels',
      'comment',
      'created',
      'updated',
      'assignee',
      'reporter',
      'parent',
    ],
    maxResults: number = 50,
    nextPageToken?: string
  ): Promise<{ issues: any[]; nextPageToken?: string; isLast?: boolean; total?: number }> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated with Jira');

    // Strategy 1: POST /rest/api/3/search/jql (Standard modern Jira Cloud API)
    try {
      const url = this.buildUrl('/rest/api/3/search/jql');
      const payload: any = {
        jql,
        maxResults,
        fields,
      };
      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          issues: data.issues || [],
          nextPageToken: data.nextPageToken,
          isLast: data.isLast,
          total: data.total ?? (data.issues ? data.issues.length : 0),
        };
      }

      const errText = await res.text();
      console.warn(`POST /rest/api/3/search/jql returned ${res.status}:`, errText);
    } catch (e) {
      console.warn('POST /rest/api/3/search/jql error:', e);
    }

    // Strategy 2: GET /rest/api/3/search/jql
    try {
      let getUrl = this.buildUrl(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${encodeURIComponent(fields.join(','))}`
      );
      if (nextPageToken) {
        getUrl += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
      }

      const res = await fetch(getUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          issues: data.issues || [],
          nextPageToken: data.nextPageToken,
          isLast: data.isLast,
          total: data.total ?? (data.issues ? data.issues.length : 0),
        };
      }
    } catch (e) {
      console.warn('GET /rest/api/3/search/jql error:', e);
    }

    // Strategy 3: Legacy GET /rest/api/3/search
    try {
      const legacyUrl = this.buildUrl(
        `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${encodeURIComponent(fields.join(','))}`
      );
      const res = await fetch(legacyUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          issues: data.issues || [],
          total: data.total,
        };
      }
    } catch (e) {
      console.warn('Legacy /rest/api/3/search failed:', e);
    }

    return { issues: [] };
  }

  /**
   * Fetches all Epics in a Jira project (supports both Team-managed and Company-managed software projects)
   */
  public async fetchEpics(projectKey: string): Promise<Epic[]> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated with Jira');

    const epics: Epic[] = [];
    const seenEpicKeys = new Set<string>();

    const addEpic = (iss: any) => {
      if (!iss || !iss.key || seenEpicKeys.has(iss.key)) return;
      seenEpicKeys.add(iss.key);
      epics.push({
        id: `epic-${iss.key.toLowerCase()}`,
        project_id: `proj-${projectKey.toLowerCase()}`,
        jira_issue_id: iss.id,
        jira_key: iss.key,
        name: iss.fields?.summary || iss.key,
        summary: iss.fields?.summary,
        status: iss.fields?.status?.name || 'In Progress',
        context_status: 'unbuilt',
        active_context_version: 0,
        total_tickets: 0,
        closed_tickets: 0,
        open_tickets: 0,
      });
    };

    // Method 1: Check project issue types for hierarchyLevel === 1 or name 'Epic'
    try {
      const projUrl = this.buildUrl(`/rest/api/3/project/${projectKey}`);
      const projRes = await fetch(projUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });

      if (projRes.ok) {
        const projData = await projRes.json();
        const issueTypes = projData.issueTypes || [];
        const epicTypes = issueTypes.filter(
          (t: any) =>
            t.hierarchyLevel === 1 ||
            t.name.toLowerCase() === 'epic' ||
            t.name.toLowerCase().includes('epic')
        );

        for (const et of epicTypes) {
          const res = await this.executeSearch(
            `project = "${projectKey}" AND issuetype = "${et.name}" ORDER BY created DESC`,
            ['summary', 'status', 'issuetype'],
            100
          );
          for (const iss of res.issues) {
            addEpic(iss);
          }
        }
      }
    } catch (e) {
      console.warn('Project metadata check failed:', e);
    }

    // Method 2: Standard JQL search if no epics found yet
    if (epics.length === 0) {
      const res = await this.executeSearch(
        `project = "${projectKey}" AND issuetype in (Epic, "Epic") ORDER BY created DESC`,
        ['summary', 'status', 'issuetype'],
        100
      );
      for (const iss of res.issues) {
        addEpic(iss);
      }
    }

    // Method 3: Fallback scan of issues in the project
    if (epics.length === 0) {
      const resAll = await this.executeSearch(
        `project = "${projectKey}" ORDER BY updated DESC`,
        ['summary', 'status', 'issuetype', 'parent'],
        100
      );
      for (const iss of resAll.issues) {
        const typeName = (iss.fields?.issuetype?.name || '').toLowerCase();
        const isHierarchyEpic =
          iss.fields?.issuetype?.hierarchyLevel === 1 ||
          typeName === 'epic' ||
          typeName.includes('epic');

        if (isHierarchyEpic) {
          addEpic(iss);
        }
      }
    }

    return epics;
  }

  /**
   * Fetches ALL tickets for a project or specific Epic
   * Note: Covers all users/assignees and includes closed tickets as per specification!
   */
  public async fetchIssues(
    projectKey: string,
    epicKey?: string,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<Issue[]> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated with Jira');

    // Build safe JQL query
    let jqlQuery = `project = "${projectKey}"`;
    if (epicKey && !epicKey.endsWith('-GENERAL') && !epicKey.endsWith('-CORE')) {
      jqlQuery += ` AND (parent = "${epicKey}")`;
    }
    jqlQuery += ' ORDER BY updated DESC';

    const fieldsList = [
      'summary',
      'description',
      'status',
      'priority',
      'issuetype',
      'labels',
      'comment',
      'created',
      'updated',
      'assignee',
      'reporter',
      'parent',
    ];

    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 15; // up to 750 issues
    const allFetched: Issue[] = [];
    const domain = this.credentials?.domain || '';

    do {
      let pageResult = await this.executeSearch(jqlQuery, fieldsList, 50, nextPageToken);

      // If specific parent JQL failed, fallback to project-wide search
      if (pageResult.issues.length === 0 && epicKey && pageCount === 0) {
        console.warn(`Query with parent=${epicKey} returned 0. Retrying project-wide search.`);
        jqlQuery = `project = "${projectKey}" ORDER BY updated DESC`;
        pageResult = await this.executeSearch(jqlQuery, fieldsList, 50);
      }

      const issues = pageResult.issues || [];

      for (const raw of issues) {
        const statusName = raw.fields?.status?.name || 'To Do';
        const isClosed = ['done', 'closed', 'resolved', 'complete', 'completed'].some(
          (s) => statusName.toLowerCase().includes(s)
        );

        let descText = '';
        if (typeof raw.fields?.description === 'string') {
          descText = raw.fields.description;
        } else if (raw.fields?.description?.content) {
          descText = this.flattenAdf(raw.fields.description);
        }

        // Multi-strategy parent/Epic detection
        let detectedParentKey = raw.fields?.parent?.key || raw.fields?.epic?.key;
        if (!detectedParentKey && raw.fields) {
          for (const [k, v] of Object.entries(raw.fields)) {
            if (k.startsWith('customfield_')) {
              if (typeof v === 'string' && /^[A-Z0-9]+-\d+$/i.test(v)) {
                detectedParentKey = v;
                break;
              } else if (v && typeof v === 'object' && (v as any).key) {
                detectedParentKey = (v as any).key;
                break;
              }
            }
          }
        }

        const parentId = detectedParentKey
          ? `epic-${detectedParentKey.toLowerCase()}`
          : (epicKey ? `epic-${epicKey.toLowerCase()}` : undefined);

        const assigneeName = raw.fields?.assignee?.displayName || raw.fields?.assignee?.name;
        const reporterName = raw.fields?.reporter?.displayName || raw.fields?.reporter?.name;
        const jiraUrl = domain ? `https://${domain}/browse/${raw.key}` : undefined;

        allFetched.push({
          id: `iss-${raw.key.toLowerCase()}`,
          project_id: `proj-${projectKey.toLowerCase()}`,
          epic_id: parentId,
          jira_issue_id: raw.id,
          jira_key: raw.key,
          issue_type: raw.fields?.issuetype?.name || 'Story',
          summary: raw.fields?.summary || '',
          description: descText,
          status: statusName,
          is_closed: isClosed,
          priority: raw.fields?.priority?.name || 'Medium',
          labels: raw.fields?.labels || [],
          comment_count: raw.fields?.comment?.total || (raw.fields?.comment?.comments ? raw.fields.comment.comments.length : 0),
          assignee: assigneeName,
          reporter: reporterName,
          jira_url: jiraUrl,
          created_at: raw.fields?.created || new Date().toISOString(),
          updated_at: raw.fields?.updated || new Date().toISOString(),
        });
      }

      nextPageToken = pageResult.nextPageToken;
      pageCount++;

      if (onProgress) onProgress(allFetched.length, pageResult.total || allFetched.length);

      if (!nextPageToken || issues.length === 0 || pageCount >= maxPages || pageResult.isLast) {
        break;
      }
    } while (nextPageToken);

    return allFetched;
  }

  /**
   * Helper to convert plain text / markdown paragraphs into Atlassian Document Format (ADF)
   */
  private formatTextToAdf(text: string) {
    const raw = (text || '').trim();
    if (!raw) {
      return {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No description provided.' }] }],
      };
    }

    const paragraphs = raw.split(/\n\n+/).filter(Boolean);
    return {
      type: 'doc',
      version: 1,
      content: paragraphs.map((p) => ({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: p.replace(/\r\n/g, '\n'),
          },
        ],
      })),
    };
  }

  /**
   * Creates an issue directly in Jira Cloud using Atlassian Document Format (ADF)
   */
  public async createIssue(
    projectKey: string,
    summary: string,
    description: string,
    issueType: string = 'Story',
    epicKey?: string,
    labels: string[] = []
  ): Promise<string> {
    if (!this.isAuthenticated()) throw new Error('Not authenticated with Jira');

    const cleanLabels = (labels || [])
      .map((l) => l.trim().replace(/\s+/g, '-').toLowerCase())
      .filter(Boolean);

    const isEpic = issueType.toLowerCase() === 'epic';

    const payload: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary: summary.trim(),
        issuetype: {
          name: isEpic ? 'Epic' : issueType,
        },
        description: this.formatTextToAdf(description),
        labels: cleanLabels,
      },
    };

    if (epicKey && !isEpic) {
      payload.fields.parent = { key: epicKey };
    }

    const url = this.buildUrl('/rest/api/3/issue');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errorMsg = `Failed to create Jira issue (${res.status}): ${errText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.errors) {
          const detail = Object.entries(parsed.errors)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
          errorMsg = `Jira creation error: ${detail}`;
        } else if (parsed.errorMessages?.length) {
          errorMsg = parsed.errorMessages.join(', ');
        }
      } catch {
        // use raw
      }

      // If parent link failed (e.g. team-managed vs company-managed field mismatch), retry without parent
      if (epicKey && errorMsg.toLowerCase().includes('parent')) {
        console.warn('Retrying Jira ticket creation without parent field...');
        delete payload.fields.parent;
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (retryRes.ok) {
          const retryResult = await retryRes.json();
          return retryResult.key;
        }
      }

      throw new Error(errorMsg);
    }

    const result = await res.json();
    return result.key;
  }

  /**
   * Creates a new Epic directly in Jira Cloud
   */
  public async createEpic(
    projectKey: string,
    summary: string,
    description: string,
    labels: string[] = []
  ): Promise<string> {
    return this.createIssue(projectKey, summary, description, 'Epic', undefined, labels);
  }

  /**
   * Fetches real comments for a specific issue from Jira Cloud
   */
  public async fetchIssueComments(issueKey: string): Promise<{ id: string; author: string; body: string; created: string }[]> {
    if (!this.isAuthenticated()) return [];
    try {
      const url = this.buildUrl(`/rest/api/3/issue/${issueKey}/comment?expand=renderedBody`);
      const res = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        return (data.comments || []).map((c: any) => ({
          id: c.id,
          author: c.author?.displayName || c.author?.name || 'Unknown',
          body: typeof c.body === 'string' ? c.body : (c.renderedBody || this.flattenAdf(c.body)),
          created: c.created || new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn(`Failed to fetch comments for issue ${issueKey}:`, e);
    }
    return [];
  }

  private flattenAdf(adf: any): string {
    if (!adf) return '';
    let out = '';
    const walk = (node: any) => {
      if (node.text) out += node.text;
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          walk(child);
        }
        if (node.type === 'paragraph' || node.type === 'heading') {
          out += '\n\n';
        }
      }
    };
    walk(adf);
    return out.trim();
  }
}

export const jiraService = new JiraService();

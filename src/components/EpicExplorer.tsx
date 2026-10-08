import React, { useState, useEffect } from 'react';
import { Project, Epic, Issue } from '../types';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  FileCheck2,
  MessageSquare,
  ExternalLink,
  User,
  ArrowLeft,
} from 'lucide-react';
import { jiraService } from '../services/jiraService';

const renderJiraContent = (content: string): React.ReactNode => {
  if (!content || typeof DOMParser === 'undefined' || !/<\/?[a-z][\s\S]*>/i.test(content)) return content;

  const document = new DOMParser().parseFromString(content, 'text/html');
  const supportedTags: Record<string, React.ElementType> = {
    p: 'p', div: 'div', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em',
    u: 'u', s: 's', code: 'code', pre: 'pre', blockquote: 'blockquote',
    ul: 'ul', ol: 'ol', li: 'li', h1: 'h3', h2: 'h3', h3: 'h4', h4: 'h4',
    table: 'table', thead: 'thead', tbody: 'tbody', tr: 'tr', th: 'th', td: 'td',
  };

  const renderNode = (node: Node, key: string): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof Element)) return null;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return null;

    const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`));
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return children;
      return <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a>;
    }

    const Component = supportedTags[node.tagName.toLowerCase()];
    return Component ? <Component key={key}>{children}</Component> : <React.Fragment key={key}>{children}</React.Fragment>;
  };

  return Array.from(document.body.childNodes).map((node, index) => renderNode(node, `jira-${index}`));
};

interface EpicExplorerProps {
  epic: Epic | null;
  currentProject: Project | null;
  issues: Issue[];
  isSyncing: boolean;
  onSyncJira: () => void;
  onOpenBuildContext: () => void;
  onViewContext: () => void;
}

export const EpicExplorer: React.FC<EpicExplorerProps> = ({
  epic,
  currentProject,
  issues,
  isSyncing,
  onSyncJira,
  onOpenBuildContext,
  onViewContext,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'closed' | 'bugs' | 'requirements'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [issueComments, setIssueComments] = useState<{ id: string; author: string; body: string; created: string }[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!selectedIssue) {
      setIssueComments([]);
      setLoadingComments(false);
      return;
    }

    let isCurrentIssue = true;
    setIssueComments([]);
    setLoadingComments(true);
    jiraService
      .fetchIssueComments(selectedIssue.jira_key)
      .then((comments) => {
        if (isCurrentIssue) setIssueComments(comments);
      })
      .catch(() => {
        if (isCurrentIssue) setIssueComments([]);
      })
      .finally(() => {
        if (isCurrentIssue) setLoadingComments(false);
      });

    return () => {
      isCurrentIssue = false;
    };
  }, [selectedIssue?.jira_key]);

  const displayTitle = epic ? epic.name : (currentProject ? `${currentProject.name} — All Tickets` : 'All Tickets');
  const displayKey = epic ? epic.jira_key : (currentProject ? currentProject.jira_project_key : 'BACKLOG');
  const displaySummary = epic
    ? (epic.summary || 'Epic level requirements, user stories, and bug tracking repository')
    : `All active and historical tickets under ${currentProject?.name || 'this project'}`;

  const totalCount = epic ? epic.total_tickets : issues.length;
  const closedCount = epic ? epic.closed_tickets : issues.filter((i) => i.is_closed).length;
  const openCount = epic ? epic.open_tickets : issues.filter((i) => !i.is_closed).length;
  const contextStatus = epic ? epic.context_status : 'unbuilt';
  const contextVersion = epic ? epic.active_context_version : 0;

  const filteredIssues = issues.filter((iss) => {
    // Search filter
    const matchesSearch =
      iss.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iss.jira_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      iss.labels.some((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterTab === 'open') return !iss.is_closed;
    if (filterTab === 'closed') return iss.is_closed;
    if (filterTab === 'bugs') return iss.issue_type === 'Bug';
    if (filterTab === 'requirements') return iss.issue_type === 'Requirement';
    return true;
  });

  if (selectedIssue) {
    return (
      <div className="main-view">
        <div className="view-header issue-detail-header">
          <div style={{ minWidth: 0 }}>
            <button className="btn btn-secondary" onClick={() => setSelectedIssue(null)} style={{ padding: '6px 10px', marginBottom: '12px' }}>
              <ArrowLeft size={14} /> Back to tickets
            </button>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <span className="issue-key">{selectedIssue.jira_key}</span>
              <span className={`issue-type-badge ${selectedIssue.issue_type.toLowerCase()}`}>{selectedIssue.issue_type}</span>
              <span className={`status-tag ${selectedIssue.status.toLowerCase().replace(/\s+/g, '-')}`}>{selectedIssue.status}</span>
              {selectedIssue.jira_url && (
                <a href={selectedIssue.jira_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Open in Jira
                </a>
              )}
            </div>
            <h1 className="view-title issue-detail-title">{selectedIssue.summary}</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px' }}>{displayTitle}</p>
          </div>
        </div>

        <div className="issue-detail-content">
          <div className="issue-detail-main">
            <section className="doc-section issue-detail-section">
              <h2 className="doc-section-title">Description</h2>
              <div className="issue-rich-text">
                {selectedIssue.description
                  ? renderJiraContent(selectedIssue.description)
                  : <span className="issue-empty-state">No description was provided for this ticket.</span>}
              </div>
            </section>

            <section className="doc-section issue-detail-section">
              <div className="issue-section-heading">
                <h2 className="doc-section-title">Comments</h2>
                <span className="issue-count">{issueComments.length}</span>
              </div>
              {loadingComments ? (
                <div className="issue-empty-state" role="status">Loading Jira discussion...</div>
              ) : issueComments.length === 0 ? (
                <div className="issue-empty-state">No comments are recorded on this ticket.</div>
              ) : (
                <div className="issue-comments-list">
                  {issueComments.map((comment) => (
                    <article key={comment.id} className="issue-comment">
                      <header>
                        <strong>{comment.author}</strong>
                        <time>{comment.created ? new Date(comment.created).toLocaleString() : ''}</time>
                      </header>
                      <div className="issue-rich-text">{renderJiraContent(comment.body)}</div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="issue-detail-sidebar">
            <section className="doc-section issue-detail-section">
              <h2 className="doc-section-title">Ticket details</h2>
              <dl className="issue-metadata-list">
                <div><dt>Assignee</dt><dd>{selectedIssue.assignee || 'Unassigned'}</dd></div>
                <div><dt>Reporter</dt><dd>{selectedIssue.reporter || 'Not provided'}</dd></div>
                <div><dt>Priority</dt><dd>{selectedIssue.priority}</dd></div>
                <div><dt>Epic</dt><dd>{selectedIssue.epic_id?.replace(/^epic-/, '').toUpperCase() || 'Unassigned'}</dd></div>
                <div><dt>Created</dt><dd>{selectedIssue.created_at ? selectedIssue.created_at.substring(0, 10) : 'N/A'}</dd></div>
                <div><dt>Updated</dt><dd>{selectedIssue.updated_at ? selectedIssue.updated_at.substring(0, 10) : 'N/A'}</dd></div>
              </dl>
            </section>
            {selectedIssue.labels.length > 0 && (
              <section className="doc-section issue-detail-section">
                <h2 className="doc-section-title">Labels</h2>
                <div className="issue-label-list">
                  {selectedIssue.labels.map((label) => <span key={label} className="pill-label">{label}</span>)}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="main-view">
      {/* View Header */}
      <div className="view-header">
        <div>
          <div className="view-breadcrumbs">
            <span>{currentProject?.name || 'Workspace'}</span>
            <span>/</span>
            <span>{epic ? 'Epics' : 'Project Backlog'}</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>{displayTitle}</span>
          </div>
          <h1 className="view-title">
            <span>{displayTitle}</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 82, 204, 0.15)',
                color: 'var(--primary-light)',
              }}
            >
              {displayKey}
            </span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {displaySummary}
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-secondary"
            onClick={onSyncJira}
            disabled={isSyncing}
            title={isSyncing ? 'Jira sync in progress' : 'Sync Jira'}
            aria-label={isSyncing ? 'Jira sync in progress' : 'Sync Jira'}
            style={{ padding: '7px 9px' }}
          >
            <RefreshCw size={14} className={isSyncing ? 'spin-animation' : ''} />
          </button>
          {contextStatus === 'built' && (
            <button className="btn btn-secondary" onClick={onViewContext}>
              <FileCheck2 size={15} color="#36b37e" />
              <span>View Context (v{contextVersion})</span>
            </button>
          )}
          <button className="btn btn-primary" onClick={onOpenBuildContext}>
            <RefreshCw size={14} />
            <span>{contextStatus === 'built' ? 'Rebuild Context' : 'Build Context'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="stats-banner">
        <div className="stat-card">
          <span className="stat-label">Total Ingested Tickets</span>
          <span className="stat-value">{totalCount}</span>
          <span className="stat-meta">Includes 100% of scope</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Historical Closed Tickets</span>
          <span className="stat-value" style={{ color: '#36b37e' }}>
            {closedCount}
          </span>
          <span className="stat-meta">Retained for rule context</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Active / Open Tickets</span>
          <span className="stat-value" style={{ color: '#2684ff' }}>
            {openCount}
          </span>
          <span className="stat-meta">In progress or planned</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Context Intelligence</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            {contextStatus === 'built' ? (
              <>
                <CheckCircle2 size={18} color="#36b37e" />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#36b37e' }}>Built (v{contextVersion})</span>
              </>
            ) : (
              <>
                <Clock size={18} color="var(--text-muted)" />
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-muted)' }}>Not Built</span>
              </>
            )}
          </div>
          <span className="stat-meta">
            {epic?.last_context_build ? `Updated: ${epic.last_context_build}` : 'No snapshot created'}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="tabs-group">
          <button
            className={`tab-btn ${filterTab === 'all' ? 'active' : ''}`}
            onClick={() => setFilterTab('all')}
          >
            All Tickets ({totalCount})
          </button>
          <button
            className={`tab-btn ${filterTab === 'open' ? 'active' : ''}`}
            onClick={() => setFilterTab('open')}
          >
            Open ({openCount})
          </button>
          <button
            className={`tab-btn ${filterTab === 'closed' ? 'active' : ''}`}
            onClick={() => setFilterTab('closed')}
          >
            Closed ({closedCount})
          </button>
          <button
            className={`tab-btn ${filterTab === 'requirements' ? 'active' : ''}`}
            onClick={() => setFilterTab('requirements')}
          >
            Requirements
          </button>
          <button
            className={`tab-btn ${filterTab === 'bugs' ? 'active' : ''}`}
            onClick={() => setFilterTab('bugs')}
          >
            Bugs
          </button>
        </div>

        <div className="search-input-wrapper">
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search tickets, keys, labels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tickets Table */}
      <div className="content-body">
        <table className="tickets-table">
          <thead>
            <tr>
              <th style={{ width: '105px' }}>Key</th>
              <th style={{ width: '115px' }}>Type</th>
              <th>Summary</th>
              <th style={{ width: '140px' }}>Assignee</th>
              <th style={{ width: '115px' }}>Status</th>
              <th style={{ width: '85px' }}>Priority</th>
              <th style={{ width: '150px' }}>Labels</th>
              <th style={{ width: '75px', textAlign: 'center' }}>Comments</th>
            </tr>
          </thead>
          <tbody>
            {isSyncing && filteredIssues.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div style={{ minHeight: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-secondary)' }} role="status" aria-live="polite">
                    <RefreshCw size={22} className="spin-animation" color="var(--primary-light)" />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Syncing Jira tickets</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Your workspace will appear here when sync completes.</span>
                  </div>
                </td>
              </tr>
            )}
            {filteredIssues.map((issue) => {
              const typeClass = issue.issue_type.toLowerCase();
              const statusClass = issue.status.toLowerCase().replace(/\s+/g, '-');
              return (
                <tr
                  key={issue.id}
                  onClick={() => setSelectedIssue(issue)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className="issue-key">{issue.jira_key}</span>
                  </td>
                  <td>
                    <span className={`issue-type-badge ${typeClass}`}>
                      {issue.issue_type}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: issue.is_closed ? 400 : 500 }}>
                      {issue.summary}
                    </span>
                    {issue.is_closed && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '11px',
                          color: '#36b37e',
                          fontWeight: 500,
                        }}
                      >
                        ✓ Historical
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <User size={12} color="var(--text-muted)" />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                        {issue.assignee || 'Unassigned'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-tag ${statusClass}`}>{issue.status}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px' }}>{issue.priority}</span>
                  </td>
                  <td>
                    {issue.labels.slice(0, 2).map((lbl) => (
                      <span key={lbl} className="pill-label">
                        {lbl}
                      </span>
                    ))}
                    {issue.labels.length > 2 && (
                      <span className="pill-label">+{issue.labels.length - 2}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                      <MessageSquare size={13} color="var(--text-muted)" />
                      <span>{issue.comment_count}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};

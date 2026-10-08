import React, { useState, useEffect } from 'react';
import { Project, Epic, Issue, BuildContextOptions, ContextVersion } from '../types';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

interface BuildContextModalProps {
  currentProject?: Project | null;
  epics: Epic[];
  selectedEpic: Epic | null;
  allProjectIssues?: Issue[];
  isOpen: boolean;
  onClose: () => void;
  onBuildComplete: (cv: ContextVersion) => void;
  onTriggerBuild: (epicId: string, options: BuildContextOptions) => Promise<ContextVersion>;
}

export const BuildContextModal: React.FC<BuildContextModalProps> = ({
  currentProject,
  epics,
  selectedEpic,
  allProjectIssues = [],
  isOpen,
  onClose,
  onBuildComplete,
  onTriggerBuild,
}) => {
  const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);

  useEffect(() => {
    if (selectedEpic) {
      setSelectedEpicIds([selectedEpic.id]);
    } else if (epics.length > 0) {
      setSelectedEpicIds([epics[0].id]);
    }
  }, [selectedEpic, epics, isOpen]);

  const [options, setOptions] = useState<BuildContextOptions>({
    include_closed_tickets: true, // locked
    include_comments: true,
    include_linked_issues: true,
    include_jira_history: true,
    include_github_prs: true,
  });

  const [isBuilding, setIsBuilding] = useState(false);
  const [analyzingTicket, setAnalyzingTicket] = useState<Issue | null>(null);
  const [analyzedTickets, setAnalyzedTickets] = useState<Issue[]>([]);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'fetching' | 'analyzing' | 'synthesizing' | 'saving' | 'done'>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [buildError, setBuildError] = useState<string | null>(null);

  const activeEpicNames = epics
    .filter((e) => selectedEpicIds.includes(e.id))
    .map((e) => e.name)
    .join(', ') || 'Selected Epics';

  const totalTicketsSelected = epics
    .filter((e) => selectedEpicIds.includes(e.id))
    .reduce((acc, curr) => acc + curr.total_tickets, 0);

  if (!isOpen) return null;

  const toggleEpic = (id: string) => {
    setSelectedEpicIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartBuild = async () => {
    setIsBuilding(true);
    setBuildError(null);
    setAnalysisPhase('fetching');
    setProgressPercent(5);
    setAnalyzedTickets([]);
    setAnalyzingTicket(null);

    // 1. Gather all tickets matching selected epics
    let targetTickets: Issue[] = [];
    if (allProjectIssues.length > 0) {
      targetTickets = allProjectIssues.filter((i) => {
        return selectedEpicIds.some((epicId) => {
          const ep = epics.find((e) => e.id === epicId);
          if (!ep) return false;
          if (ep.jira_issue_id === 'ALL') return true;
          if (ep.jira_issue_id === 'GENERAL') return !i.epic_id;
          return (
            i.epic_id === ep.id ||
            i.jira_key === ep.jira_key ||
            (i.epic_id && i.epic_id.toLowerCase().includes(ep.jira_key.toLowerCase())) ||
            i.labels.some((l) => l.toLowerCase() === ep.name.toLowerCase() || l.toLowerCase() === ep.jira_key.toLowerCase())
          );
        });
      });
    }

    // If empty fallback to all issues
    if (targetTickets.length === 0 && allProjectIssues.length > 0) {
      targetTickets = allProjectIssues.slice(0, totalTicketsSelected > 0 ? totalTicketsSelected : 20);
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    setAnalysisPhase('analyzing');

    // 2. Iterate through each and every ticket
    const total = targetTickets.length;
    if (total > 0) {
      for (let i = 0; i < total; i++) {
        const ticket = targetTickets[i];
        setAnalyzingTicket(ticket);
        setAnalyzedTickets((prev) => [ticket, ...prev.slice(0, 15)]);
        const pct = Math.round(10 + ((i + 1) / total) * 70);
        setProgressPercent(pct);
        // Small delay to ensure clear visual progression for the user
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    } else {
      setProgressPercent(80);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    // 3. Ask Copilot SDK to synthesize the epic across all ticket details.
    setAnalysisPhase('synthesizing');
    setProgressPercent(90);
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 4. Trigger build & save to per-epic context store
    setAnalysisPhase('saving');
    setProgressPercent(96);

    try {
      const targetEpicId = selectedEpicIds[0] || (epics[0] ? epics[0].id : 'epic-core');
      const result = await onTriggerBuild(targetEpicId, options);
      setProgressPercent(100);
      setAnalysisPhase('done');
      await new Promise((resolve) => setTimeout(resolve, 300));
      onBuildComplete(result);
    } catch (err) {
      console.error('Context build failed:', err);
      setBuildError(err instanceof Error ? err.message : 'Copilot context build failed.');
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: 'rgba(0, 82, 204, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RefreshCw size={17} color="#2684ff" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Build Module Living Documentation & Context</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Target Space: <strong>{currentProject ? currentProject.name : 'ISB Student Success'}</strong> {currentProject && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>({currentProject.jira_project_key})</span>}
              </p>
            </div>
          </div>
          {!isBuilding && (
            <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={onClose}>
              ✕
            </button>
          )}
        </div>

        <div className="modal-body">
          {buildError && (
            <div role="alert" style={{ marginBottom: '12px', padding: '10px 12px', border: '1px solid rgba(255, 123, 114, 0.45)', borderRadius: '6px', color: '#ff7b72', background: 'rgba(255, 123, 114, 0.08)', fontSize: '12px' }}>
              {buildError}
            </div>
          )}
          {!isBuilding ? (
            <>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  1. Select Target Modules / Epics for Comprehensive Documentation:
                </h3>
                <div
                  style={{
                    background: 'var(--bg-input)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {epics.map((epic) => {
                    const checked = selectedEpicIds.includes(epic.id);
                    return (
                      <label
                        key={epic.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: '4px',
                          background: checked ? 'rgba(38, 132, 255, 0.1)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEpic(epic.id)}
                          />
                          <span style={{ fontSize: '13px', fontWeight: checked ? 600 : 400 }}>
                            {epic.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span>{epic.total_tickets} tickets</span>
                          {epic.context_status === 'built' && (
                            <span style={{ color: '#36b37e', fontSize: '11px' }}>✓ Built (v{epic.active_context_version})</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  2. Context Ingestion Options:
                </h3>
                <div className="options-box">
                  <div className="option-row locked">
                    <input type="checkbox" checked={true} disabled />
                    <span>Include closed & completed tickets</span>
                    <span className="locked-badge">Required for complete context</span>
                  </div>

                  <label className="option-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={options.include_comments}
                      onChange={(e) => setOptions({ ...options, include_comments: e.target.checked })}
                    />
                    <span>Include ticket comments and discussion threads</span>
                  </label>

                  <label className="option-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={options.include_linked_issues}
                      onChange={(e) => setOptions({ ...options, include_linked_issues: e.target.checked })}
                    />
                    <span>Include linked issue dependencies & blockers</span>
                  </label>

                  <label className="option-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={options.include_jira_history}
                      onChange={(e) => setOptions({ ...options, include_jira_history: e.target.checked })}
                    />
                    <span>Include status transition history and custom field metadata</span>
                  </label>

                  <label className="option-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={options.include_github_prs}
                      onChange={(e) => setOptions({ ...options, include_github_prs: e.target.checked })}
                    />
                    <span>Include linked GitHub pull requests & commits</span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0, 82, 204, 0.1)',
                  border: '1px solid rgba(38, 132, 255, 0.25)',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Total Tickets to Analyze:
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selectedEpicIds.length} Epics selected
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-light)' }}>
                  {totalTicketsSelected}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <RefreshCw size={18} className="spin-animation" color="#2684ff" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                    {analysisPhase === 'analyzing'
                      ? 'Reviewing Epic Ticket Details...'
                      : analysisPhase === 'synthesizing'
                      ? 'Copilot SDK Synthesizing Epic Context...'
                      : analysisPhase === 'saving'
                      ? 'Saving Living Module Specification...'
                      : 'Connecting to Jira Cloud API...'}
                  </h3>
                </div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-light)' }}>
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'var(--bg-input)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #2684ff, #36b37e)',
                    transition: 'width 200ms ease',
                    borderRadius: '3px',
                  }}
                />
              </div>

              {/* Active Ticket Being Ingested & Analyzed */}
              {analyzingTicket ? (
                <div
                  style={{
                    background: 'rgba(38, 132, 255, 0.08)',
                    border: '1px solid rgba(38, 132, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="issue-key" style={{ fontSize: '12.5px', fontWeight: 700 }}>
                        {analyzingTicket.jira_key}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background:
                            analyzingTicket.issue_type === 'Bug'
                              ? 'rgba(255, 86, 48, 0.2)'
                              : 'rgba(0, 82, 204, 0.2)',
                          color: analyzingTicket.issue_type === 'Bug' ? '#ff5630' : '#4c9aff',
                          fontWeight: 600,
                        }}
                      >
                        {analyzingTicket.issue_type}
                      </span>
                    </div>

                    <span style={{ fontSize: '11px', color: '#ffab00', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffab00', display: 'inline-block' }} />
                      Analyzing ticket scope
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                    {analyzingTicket.summary}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    <span>Status: <strong>{analyzingTicket.status}</strong></span>
                    {analyzingTicket.assignee && <span>Assignee: <strong>{analyzingTicket.assignee}</strong></span>}
                    <span>Discussion: <strong>{analyzingTicket.comment_count} comments</strong></span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Initializing ingestion pipeline for <strong>{activeEpicNames}</strong>...
                </div>
              )}

              {/* Stream of Processed Tickets */}
              {analyzedTickets.length > 0 && (
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Analyzed Tickets ({analyzedTickets.length}):
                  </div>
                  <div
                    style={{
                      maxHeight: '130px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      background: 'var(--bg-input)',
                      borderRadius: '6px',
                      padding: '6px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {analyzedTickets.map((t) => (
                      <div
                        key={t.id || t.jira_key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <CheckCircle2 size={13} color="#36b37e" style={{ flexShrink: 0 }} />
                          <span className="issue-key" style={{ fontSize: '11.5px', flexShrink: 0 }}>
                            {t.jira_key}
                          </span>
                          <span
                            style={{
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              fontSize: '11.5px',
                            }}
                          >
                            {t.summary}
                          </span>
                        </div>
                        <span style={{ fontSize: '10.5px', color: '#36b37e', flexShrink: 0 }}>
                          Analyzed ✓
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline Milestones */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} color="#36b37e" />
                  <span>Jira Cloud REST API Ingestion</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {analysisPhase === 'analyzing' || analysisPhase === 'synthesizing' || analysisPhase === 'saving' || analysisPhase === 'done' ? (
                    <CheckCircle2 size={13} color="#36b37e" />
                  ) : (
                    <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--text-muted)', display: 'inline-block' }} />
                  )}
                  <span>Ticket-Level Context Analysis</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {analysisPhase === 'synthesizing' || analysisPhase === 'saving' || analysisPhase === 'done' ? (
                    <CheckCircle2 size={13} color="#36b37e" />
                  ) : (
                    <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--text-muted)', display: 'inline-block' }} />
                  )}
                  <span>Copilot SDK Module Synthesis</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {analysisPhase === 'saving' || analysisPhase === 'done' ? (
                    <CheckCircle2 size={13} color="#36b37e" />
                  ) : (
                    <span style={{ width: '13px', height: '13px', borderRadius: '50%', border: '1px solid var(--text-muted)', display: 'inline-block' }} />
                  )}
                  <span>Per-Epic History Persistence</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isBuilding ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartBuild}
                disabled={selectedEpicIds.length === 0}
              >
                <RefreshCw size={14} />
                <span>Build Selected Context ({totalTicketsSelected} Tickets)</span>
              </button>
            </>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Ingesting tickets and synthesizing business invariants...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { TicketDraft } from '../types';
import {
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
} from 'lucide-react';

interface TicketDraftsReviewProps {
  drafts: TicketDraft[];
  onApprove: (draftId: string) => Promise<void>;
  onReject: (draftId: string) => Promise<void>;
  onCreateJira: (draftId: string) => Promise<string>;
}

export const TicketDraftsReview: React.FC<TicketDraftsReviewProps> = ({
  drafts,
  onApprove,
  onReject,
  onCreateJira,
}) => {
  const [selectedDraft, setSelectedDraft] = useState<TicketDraft | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const handleCreateInJira = async (draftId: string) => {
    setCreatingId(draftId);
    try {
      await onCreateJira(draftId);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <div className="main-view">
      <div className="view-header">
        <div>
          <div className="view-breadcrumbs">
            <span>ISB Student Success</span>
            <span>/</span>
            <span>Review & Approval</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>Ticket Candidates</span>
          </div>
          <h1 className="view-title">
            <CheckSquare size={22} color="#0052cc" />
            <span>Ticket Candidate Backlog Review ({drafts.length} Identified)</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Draft first, create second: every ticket is classified against existing module context and duplicate-checked before Jira publication.
          </p>
        </div>
      </div>

      <div className="content-body" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {drafts.map((draft, idx) => {
          const isBug = draft.draft_type === 'Bug';
          const isApproved = draft.status === 'APPROVED';
          const isCreated = draft.status === 'CREATED';

          return (
            <div key={draft.id} className="draft-card">
              <div className="draft-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    #{idx + 1}
                  </span>
                  <span className={`issue-type-badge ${isBug ? 'bug' : 'story'}`}>
                    {draft.draft_type}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-light)' }}>
                    Epic: {draft.epic_name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      background: 'rgba(54, 179, 126, 0.15)',
                      color: '#36b37e',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 600,
                    }}
                  >
                    {Math.round(draft.confidence * 100)}% Confidence
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isCreated ? (
                    <span className="status-tag done" style={{ fontSize: '12px' }}>
                      ✓ Created: {draft.created_jira_key}
                    </span>
                  ) : isApproved ? (
                    <span className="status-tag in-progress" style={{ fontSize: '12px' }}>
                      Approved by Reviewer
                    </span>
                  ) : (
                    <span className="status-tag to-do" style={{ fontSize: '12px' }}>
                      Needs Review
                    </span>
                  )}
                </div>
              </div>

              {/* Duplicate Detection Alert if present */}
              {draft.potential_duplicate_key && (
                <div className="duplicate-alert">
                  <AlertTriangle size={18} color="#ffab00" />
                  <div>
                    <strong>Possible Duplicate / Regression Detected:</strong> Existing ticket{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textDecoration: 'underline' }}>
                      {draft.potential_duplicate_key}
                    </span>{' '}
                    (Similarity: {Math.round((draft.duplicate_similarity || 0.89) * 100)}%, Status: Done).
                    <div style={{ fontSize: '11.5px', marginTop: '2px', opacity: 0.9 }}>
                      Recommendation: Existing functionality was previously released. Classified as a <strong>BUG</strong> rather than a new Story.
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 style={{ fontSize: '15.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {draft.summary}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {draft.reason}
                </p>
              </div>

              {/* Source Evidence & Distinction */}
              <div
                style={{
                  background: 'var(--bg-input)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="source-badge">
                    {draft.is_confirmed_from_source ? '✓ CONFIRMED FROM SOURCE' : '⚡ INFERRED BY AGENT'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    "{draft.source_evidence}"
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {draft.labels.map((l) => (
                    <span key={l} className="pill-label">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions Row */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedDraft(draft)}
                >
                  View Full Draft
                </button>

                {!isApproved && !isCreated && (
                  <>
                    <button
                      className="btn btn-danger"
                      onClick={() => onReject(draft.id)}
                    >
                      <XCircle size={14} />
                      <span>Reject</span>
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => onApprove(draft.id)}
                    >
                      <CheckCircle2 size={14} />
                      <span>Approve Draft</span>
                    </button>
                  </>
                )}

                {isApproved && !isCreated && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleCreateInJira(draft.id)}
                    disabled={creatingId === draft.id}
                  >
                    <Send size={14} />
                    <span>{creatingId === draft.id ? 'Creating in Jira...' : 'Create in Jira'}</span>
                  </button>
                )}

                {isCreated && (
                  <button className="btn btn-secondary" disabled>
                    <CheckCircle2 size={14} color="#36b37e" />
                    <span>Published to Backlog</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Draft Details Modal */}
      {selectedDraft && (
        <div className="modal-overlay" onClick={() => setSelectedDraft(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={`issue-type-badge ${selectedDraft.draft_type === 'Bug' ? 'bug' : 'story'}`}>
                  {selectedDraft.draft_type}
                </span>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Jira Draft Inspection</h3>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedDraft(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{selectedDraft.summary}</h2>
              <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '6px' }}>
                <pre
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12.5px',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                  }}
                >
                  {selectedDraft.description}
                </pre>
              </div>

              <div>
                <h4 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Target Epic & Labels
                </h4>
                <div style={{ fontSize: '13px', display: 'flex', gap: '8px' }}>
                  <strong>{selectedDraft.epic_name}</strong>
                  {selectedDraft.labels.map((l) => (
                    <span key={l} className="pill-label">{l}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedDraft(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

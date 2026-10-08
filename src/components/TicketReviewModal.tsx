import React, { useState, useEffect } from 'react';
import { Project, Epic, TicketDraft } from '../types';
import {
  CheckCircle2,
  X,
  Tag,
  FolderPlus,
  Send,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface TicketReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  epics: Epic[];
  initialDraft?: Partial<TicketDraft> | null;
  isEpicCreation?: boolean;
  onConfirmCreateJira: (draft: TicketDraft) => Promise<string>;
  onSaveAsDraft: (draft: TicketDraft) => void;
}

export const TicketReviewModal: React.FC<TicketReviewModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  epics,
  initialDraft,
  isEpicCreation = false,
  onConfirmCreateJira,
  onSaveAsDraft,
}) => {
  const [draftType, setDraftType] = useState<'Story' | 'Bug' | 'Task' | 'Epic'>(
    isEpicCreation ? 'Epic' : (initialDraft?.draft_type as any) || 'Story'
  );
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [priority, setPriority] = useState('High');
  const [selectedEpicId, setSelectedEpicId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftType(isEpicCreation ? 'Epic' : (initialDraft?.draft_type as any) || 'Story');
      setSummary(initialDraft?.summary || '');
      setDescription(initialDraft?.description || '');
      setLabels(initialDraft?.labels && initialDraft.labels.length > 0 ? initialDraft.labels : ['slcm-finance', 'validation']);
      setPriority(initialDraft?.priority || 'High');
      setSelectedEpicId(initialDraft?.epic_id || (epics[0] ? epics[0].id : ''));
      setCreatedKey(null);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialDraft, isEpicCreation, epics]);

  if (!isOpen) return null;

  const handleAddLabel = () => {
    const val = newLabelInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (val && !labels.includes(val)) {
      setLabels([...labels, val]);
      setNewLabelInput('');
    }
  };

  const handleRemoveLabel = (labelToRemove: string) => {
    setLabels(labels.filter((l) => l !== labelToRemove));
  };

  const handleCreateInJira = async () => {
    if (!summary.trim()) {
      setErrorMsg('Please enter a ticket summary.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);

    const targetEpic = epics.find((e) => e.id === selectedEpicId);

    const draftPayload: TicketDraft = {
      id: initialDraft?.id || `draft-${Date.now()}`,
      epic_id: draftType === 'Epic' ? 'NEW_EPIC' : (targetEpic ? targetEpic.id : 'GENERAL'),
      epic_name: draftType === 'Epic' ? summary : (targetEpic ? targetEpic.name : 'General'),
      draft_type: draftType,
      summary: summary.trim(),
      description: description.trim(),
      labels,
      priority,
      confidence: 0.95,
      status: 'APPROVED',
      reason: 'Created via Copilot Delivery Review',
      classification_category: draftType === 'Bug' ? 'BUG' : 'NEW_REQUIREMENT',
      is_confirmed_from_source: true,
      source_evidence: 'User reviewed and confirmed via Project Intelligence Console',
      created_at: new Date().toISOString(),
    };

    try {
      const key = await onConfirmCreateJira(draftPayload);
      setCreatedKey(key);
    } catch (err: any) {
      console.error('Failed to create ticket in Jira:', err);
      setErrorMsg(err.message || 'Failed to create item in Jira Cloud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraftOnly = () => {
    if (!summary.trim()) {
      setErrorMsg('Please enter a ticket summary.');
      return;
    }
    const targetEpic = epics.find((e) => e.id === selectedEpicId);
    const draftPayload: TicketDraft = {
      id: initialDraft?.id || `draft-${Date.now()}`,
      epic_id: draftType === 'Epic' ? 'NEW_EPIC' : (targetEpic ? targetEpic.id : 'GENERAL'),
      epic_name: draftType === 'Epic' ? summary : (targetEpic ? targetEpic.name : 'General'),
      draft_type: draftType,
      summary: summary.trim(),
      description: description.trim(),
      labels,
      priority,
      confidence: 0.95,
      status: 'NEEDS_REVIEW',
      reason: 'Drafted via Copilot for team review',
      classification_category: draftType === 'Bug' ? 'BUG' : 'NEW_REQUIREMENT',
      is_confirmed_from_source: true,
      source_evidence: 'Generated via Copilot Delivery Review',
      created_at: new Date().toISOString(),
    };
    onSaveAsDraft(draftPayload);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '680px', width: '95%' }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: draftType === 'Epic' ? 'linear-gradient(135deg, #6554c0, #8777d9)' : 'linear-gradient(135deg, #0052cc, #2684ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              {draftType === 'Epic' ? <FolderPlus size={17} /> : <FileText size={17} />}
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>
                {createdKey ? 'Item Published Successfully!' : draftType === 'Epic' ? 'Review & Create Jira Epic' : 'Review & Create Jira Ticket'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Target Space: <strong>{currentProject ? currentProject.name : 'ISB'}</strong> ({currentProject?.jira_project_key || 'ISB'}) • Review all details before live creation
              </p>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto', padding: '18px 24px' }}>
          {createdKey ? (
            /* Success State */
            <div style={{ padding: '24px 12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'rgba(54, 179, 126, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#36b37e',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {draftType === 'Epic' ? 'Jira Epic Created!' : 'Jira Ticket Created!'}
              </h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', maxWidth: '420px', margin: 0 }}>
                Successfully published to Jira Cloud space <strong>{currentProject?.jira_project_key}</strong> with identifier:
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--primary-light)',
                  background: 'rgba(38, 132, 255, 0.15)',
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: '1px solid rgba(38, 132, 255, 0.3)',
                }}
              >
                {createdKey}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Review Form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {errorMsg && (
                <div className="duplicate-alert" style={{ background: 'rgba(255, 86, 48, 0.12)', borderColor: 'rgba(255, 86, 48, 0.3)', color: '#ff5630' }}>
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Type & Epic Selector Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    ISSUE TYPE
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['Story', 'Bug', 'Task', 'Epic'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDraftType(t)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: draftType === t ? '1px solid var(--primary-light)' : '1px solid var(--border-subtle)',
                          background: draftType === t ? 'rgba(38, 132, 255, 0.2)' : 'var(--bg-input)',
                          color: draftType === t ? 'var(--primary-light)' : 'var(--text-secondary)',
                          transition: 'all 120ms ease',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {draftType !== 'Epic' ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      PARENT EPIC LINK
                    </label>
                    <select
                      value={selectedEpicId}
                      onChange={(e) => setSelectedEpicId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    >
                      {epics.map((ep) => (
                        <option key={ep.id} value={ep.id}>
                          {ep.name} ({ep.jira_key})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      PRIORITY
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '12.5px',
                        outline: 'none',
                      }}
                    >
                      <option value="Highest">Highest</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Summary Input */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {draftType === 'Epic' ? 'EPIC NAME & SUMMARY *' : 'TICKET SUMMARY *'}
                </label>
                <input
                  type="text"
                  placeholder={draftType === 'Epic' ? 'e.g. Scholarship Management & Interview Portal' : 'e.g. [Org B] Fix Installment Fee Breakage Discrepancy on Student Portal Checkout'}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    outline: 'none',
                  }}
                />
              </div>

              {/* Description Textarea */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  DESCRIPTION & ACCEPTANCE CRITERIA
                </label>
                <textarea
                  rows={9}
                  placeholder="Enter detailed description, user story, acceptance criteria, or steps to reproduce..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-mono)',
                    lineHeight: 1.5,
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Labels Row */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  LABELS
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                  {labels.map((lbl) => (
                    <span
                      key={lbl}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(38, 132, 255, 0.15)',
                        color: 'var(--primary-light)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                      }}
                    >
                      <Tag size={10} />
                      <span>{lbl}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(lbl)}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '12px', marginLeft: '2px' }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Add label (e.g. slcm-finance, org-b)..."
                    value={newLabelInput}
                    onChange={(e) => setNewLabelInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLabel())}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                  <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleAddLabel}>
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!createdKey && (
          <div className="modal-footer" style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={handleSaveDraftOnly} disabled={isSubmitting}>
                Save as Candidate Draft
              </button>

              <button
                className="btn btn-primary"
                onClick={handleCreateInJira}
                disabled={isSubmitting || !summary.trim()}
                style={{ gap: '6px' }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={13} className="spin-animation" />
                    <span>Publishing to Jira...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Confirm & Create in Jira</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

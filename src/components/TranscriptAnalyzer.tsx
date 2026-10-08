import React, { useState } from 'react';
import { FileText, Sparkles, UploadCloud, Split, FileCheck2, ArrowRight } from 'lucide-react';

interface TranscriptAnalyzerProps {
  onProceedToDrafts: () => void;
}

export const TranscriptAnalyzer: React.FC<TranscriptAnalyzerProps> = ({ onProceedToDrafts }) => {
  const [sourceType, setSourceType] = useState<'transcript' | 'document' | 'text'>('transcript');
  const [fileName] = useState('meeting_2026_10_05.txt');
  const [showRaw, setShowRaw] = useState(false);
  const [instruction, setInstruction] = useState(
    'Identify the changes requested by the business and determine whether they are new requirements or bugs against our Academic Associate context.'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(true);

  const sampleTranscript = `[00:00:15] Speaker 1 (Dean Sharma): Good morning team. Let's review the Academic Associate workflow updates.
[00:05:20] Speaker 2 (Prajwal): In the AA module, instructors asked for validation on course preferences. Currently they can pick courses across terms without prerequisite checks.
[00:14:20] Speaker 1: Yes, when an Academic Associate changes their course preference, the department head must approve if it is outside their primary cohort. Also, can we make sure students receive an automatic notification?
[00:20:45] Speaker 3 (Advising Lead): Moving to Advising—students complained they are not receiving immediate calendar invites upon booking confirmation.
[00:32:10] Speaker 2: Also on mobile, instructors noticed that course preference notification isn't firing when saved from Experience Cloud tablets. We already implemented notification in ISB-4147, so this looks like a bug in the mobile event trigger.
[00:50:00] Speaker 1: Back to AA, please ensure cohort allocation limit of 4 advisees remains strictly enforced.
[01:05:00] Speaker 4 (Workshops): Quick note on Workshops: attendees need QR code check-ins.`;

  const timelineSplits = [
    { time: '00:05', epic: 'Academic Associate', topic: 'Course preference prerequisite validation', type: 'Requirement' },
    { time: '00:20', epic: 'Advising', topic: 'Automated calendar invite dispatch upon booking', type: 'Requirement' },
    { time: '00:32', epic: 'Academic Associate', topic: 'Mobile notification failure (Regression on ISB-4147)', type: 'Bug' },
    { time: '00:50', epic: 'Academic Associate', topic: 'Re-affirm cohort 4 limit invariant', type: 'Business Rule' },
    { time: '01:05', epic: 'Workshops', topic: 'Attendee check-in QR workflow', type: 'Requirement' },
  ];

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setHasAnalyzed(true);
    }, 800);
  };

  return (
    <div className="main-view">
      <div className="view-header">
        <div>
          <div className="view-breadcrumbs">
            <span>ISB Student Success</span>
            <span>/</span>
            <span>Intelligence Pipeline</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>Transcript & Requirement Ingestion</span>
          </div>
          <h1 className="view-title">
            <FileText size={22} color="#0052cc" />
            <span>Unstructured Input Analysis</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Transforms multi-topic transcripts into structured 12-section specification documents and validated ticket candidates.
          </p>
        </div>

        <div className="view-actions">
          {hasAnalyzed && (
            <button className="btn btn-primary" onClick={onProceedToDrafts}>
              <span>Review 3 Ticket Candidates</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="content-body" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Input Configuration Card */}
        <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="radio" checked={sourceType === 'transcript'} onChange={() => setSourceType('transcript')} />
              <span>Call Transcript (.txt / .vtt)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="radio" checked={sourceType === 'document'} onChange={() => setSourceType('document')} />
              <span>Document (PDF / DOCX)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="radio" checked={sourceType === 'text'} onChange={() => setSourceType('text')} />
              <span>Plain Text / Notes</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                TRANSCRIPT FILE
              </label>
              <div
                style={{
                  background: 'var(--bg-input)',
                  border: '1px dashed var(--border-strong)',
                  padding: '12px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <UploadCloud size={20} color="var(--primary-light)" />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{fileName}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>(Loaded)</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                DIRECTIVE & INSTRUCTIONS
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? 'Hide Raw Audio Transcript' : 'Preview Raw Audio Transcript'}
            </button>
            <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing}>
              <Sparkles size={14} />
              <span>{isAnalyzing ? 'Analyzing Transcript...' : 'Analyze in Project Context'}</span>
            </button>
          </div>

          {showRaw && (
            <div style={{ marginTop: '12px', background: 'var(--bg-input)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                {sampleTranscript}
              </pre>
            </div>
          )}
        </div>

        {/* Multi-topic Timeline Breakdown */}
        {hasAnalyzed && (
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Split size={17} color="#2684ff" />
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>
                Intelligent Epic & Topic Decomposition
              </h3>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              The system automatically parsed the 90-minute call and partitioned discussion segments into their respective Epic boundaries:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {timelineSplits.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-input)',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        background: 'var(--bg-tertiary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {item.time}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.epic}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      — {item.topic}
                    </span>
                  </div>

                  <span
                    className={`issue-type-badge ${item.type.toLowerCase().replace(/\s+/g, '-')}`}
                    style={{ fontSize: '11px' }}
                  >
                    {item.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 12-Section Intermediate Requirement Specification Document */}
        {hasAnalyzed && (
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '24px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck2 size={18} color="#36b37e" />
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                  Generated Requirement Analysis Document
                </h3>
              </div>
              <span className="brand-badge">Traceable Source Artifact</span>
            </div>

            <div style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>1. Executive Summary</h4>
                <p>Meeting held on Oct 5, 2026. Discussion centered on enhancements to the Academic Associate course allocation interface and resolution of a mobile event regression.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>2. Business Objective</h4>
                <p>Prevent out-of-department course assignments without supervisory approval and restore real-time mobile push notifications for instructors.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>3. Existing Process</h4>
                <p>AA selects courses using LWC built under ISB-4112. Notifications were implemented in ISB-4147 via Platform Events.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>4. Requested Changes</h4>
                <p><strong>Change 1:</strong> Implement prerequisite rule check in LWC before submission.<br />
                   <strong>Change 2:</strong> Fix notification trigger failure on Experience Cloud mobile tablet clients.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>5. Functional Requirements</h4>
                <p><strong>FR-001:</strong> When course preference is updated, evaluate applicant department against course catalog.<br />
                   <strong>FR-002:</strong> Dispatch instant calendar invite (.ics) to student when advising appointment is booked.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>6. Business Rules</h4>
                <p><strong>BR-AA-01:</strong> Maximum 4 active cohorts per Academic Associate (re-affirmed).<br />
                   <strong>BR-AA-02:</strong> Out-of-department course selections require dean approval flag.</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>7. Confirmed vs Inferred Evidence</h4>
                <p>• <strong>CONFIRMED:</strong> Mobile notification bug discussed at 00:32:10.<br />
                   • <strong>INFERRED:</strong> Likely related to touch event handler bypass in mobile Experience Cloud.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

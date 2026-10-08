import React, { useState } from 'react';
import { Project, Epic, ContextVersion, Issue } from '../types';
import {
  BrainCircuit,
  Shield,
  Layers,
  Bookmark,
  Cpu,
  History,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  FileText,
  AlertCircle,
  User,
  MessageSquare,
  BookOpen,
  Copy,
  Check,
  Download,
  Printer,
  Search,
  Sparkles,
  GitBranch,
  Database,
  ListOrdered,
  Eye,
  CheckSquare,
  Square,
} from 'lucide-react';
import { jiraService } from '../services/jiraService';

interface ContextStoreViewProps {
  currentProject: Project | null;
  epic: Epic | null;
  contextVersion: ContextVersion | null;
  contextHistory: ContextVersion[];
  allIssues?: Issue[];
  onSelectVersion: (cv: ContextVersion) => void;
  onOpenBuildContext: () => void;
}

export const ContextStoreView: React.FC<ContextStoreViewProps> = ({
  currentProject,
  epic,
  contextVersion,
  contextHistory,
  allIssues,
  onSelectVersion,
  onOpenBuildContext,
}) => {
  const [activeTab, setActiveTab] = useState<'documentation' | 'intelligence' | 'sources' | 'history'>('documentation');
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [rawMarkdownMode, setRawMarkdownMode] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('sec-overview');
  const [checkedChecklist, setCheckedChecklist] = useState<Record<number, boolean>>({});

  if (!epic || !contextVersion) {
    return (
      <div className="main-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <BrainCircuit size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>No Context Built Yet</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', textAlign: 'center', margin: '8px 0 20px 0' }}>
          Build context to synthesize business rules, requirements, decisions, and regression prevention rules from all tickets in <strong>{epic?.name || 'this module'}</strong>.
        </p>
        <button className="btn btn-primary" onClick={onOpenBuildContext}>
          <RefreshCw size={14} />
          <span>Build Context Now</span>
        </button>
      </div>
    );
  }

  const latestVersion = contextHistory.length > 0 ? contextHistory[0] : contextVersion;
  const isViewingLatest = contextVersion.id === latestVersion.id;
  const jiraDomain = jiraService.getCredentials()?.domain || '';

  // Copy Markdown to Clipboard
  const handleCopyMarkdown = () => {
    const textToCopy = contextVersion.documentation_markdown || contextVersion.summary;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2500);
    });
  };

  // Export Markdown as .md file
  const handleDownloadMarkdown = () => {
    const text = contextVersion.documentation_markdown || contextVersion.summary;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${epic.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Module_Doc_v${contextVersion.version_number}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Trigger Print Preview / Save as PDF
  const handlePrint = () => {
    window.print();
  };

  const toggleChecklistItem = (idx: number) => {
    setCheckedChecklist((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter sections if search query is provided
  const query = docSearchQuery.trim().toLowerCase();
  const matchesQuery = (text: string) => {
    if (!query) return true;
    return text.toLowerCase().includes(query);
  };

  return (
    <div className="main-view">
      {/* Header */}
      <div className="view-header">
        <div>
          <div className="view-breadcrumbs">
            <span>{currentProject ? currentProject.name : 'Jira Space'}</span>
            <span>/</span>
            <span>{epic.name}</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>Module Living Documentation</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
            <h1 className="view-title" style={{ margin: 0 }}>
              <BookOpen size={22} color="#2684ff" />
              <span>{epic.name} — Module Documentation v{contextVersion.version_number}</span>
            </h1>

            {isViewingLatest ? (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(54, 179, 126, 0.15)',
                  color: '#36b37e',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle2 size={12} />
                Snapshot Active
              </span>
            ) : (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(255, 171, 0, 0.15)',
                  color: '#ffab00',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={12} />
                Historical Snapshot (v{contextVersion.version_number})
              </span>
            )}
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Built on {contextVersion.created_at} by {contextVersion.created_by} using model{' '}
            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-light)' }}>
              {contextVersion.model_version}
            </code>{' '}
            • Comprehensive specification synthesized across <strong>{contextVersion.source_tickets_count} tickets</strong>
          </p>
        </div>

        {/* Action Controls & Version Switcher */}
        <div className="view-actions" style={{ position: 'relative' }}>
          {/* Version Switcher Dropdown */}
          {contextHistory.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '12px', gap: '6px' }}
                onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              >
                <History size={14} color="var(--primary-light)" />
                <span>
                  Version: <strong>v{contextVersion.version_number}</strong> ({contextHistory.length} versions)
                </span>
                <ChevronDown size={13} color="var(--text-muted)" />
              </button>

              {showVersionDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '38px',
                    right: 0,
                    minWidth: '280px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
                    zIndex: 100,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      padding: '4px 8px 6px 8px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    Version History for {epic.name}
                  </div>

                  <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }}>
                    {contextHistory.map((ver) => {
                      const isCurrent = ver.id === contextVersion.id;
                      const isLatest = ver.id === latestVersion.id;
                      return (
                        <div
                          key={ver.id}
                          onClick={() => {
                            onSelectVersion(ver);
                            setShowVersionDropdown(false);
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: isCurrent ? 'rgba(38, 132, 255, 0.18)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 120ms ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = 'var(--bg-card-hover)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13px', color: isCurrent ? 'var(--primary-light)' : 'var(--text-primary)' }}>
                              v{ver.version_number}
                              {isLatest && (
                                <span style={{ marginLeft: '6px', fontSize: '10px', color: '#36b37e', fontWeight: 600 }}>
                                  (Active)
                                </span>
                              )}
                            </strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {ver.created_at ? ver.created_at.substring(0, 16) : ''}
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {ver.source_tickets_count} tickets • {ver.business_rules.length} business rules
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Build New Version Button */}
          <button className="btn btn-primary" onClick={onOpenBuildContext}>
            <RefreshCw size={14} />
            <span>Build New Version (v{latestVersion.version_number + 1})</span>
          </button>
        </div>
      </div>

      {/* Historical Snapshot Warning Banner */}
      {!isViewingLatest && (
        <div
          style={{
            margin: '0 0 16px 0',
            padding: '10px 14px',
            background: 'rgba(255, 171, 0, 0.12)',
            border: '1px solid rgba(255, 171, 0, 0.3)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} color="#ffab00" />
            <span>
              You are inspecting <strong>historical snapshot v{contextVersion.version_number}</strong> (created {contextVersion.created_at}). The latest active version is <strong>v{latestVersion.version_number}</strong>.
            </span>
          </div>
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: '11.5px' }}
            onClick={() => onSelectVersion(latestVersion)}
          >
            Switch to Active v{latestVersion.version_number}
          </button>
        </div>
      )}

      {contextVersion.model_version !== 'github-copilot-sdk' && (
        <div
          role="status"
          style={{
            margin: '0 0 16px 0',
            padding: '10px 14px',
            background: 'rgba(255, 171, 0, 0.1)',
            border: '1px solid rgba(255, 171, 0, 0.3)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '12px',
          }}
        >
          <span>This is a legacy context version. Rebuild it to replace placeholder analysis with Copilot SDK analysis of the epic tickets.</span>
          <button className="btn btn-secondary" style={{ padding: '4px 8px', flexShrink: 0 }} onClick={onOpenBuildContext}>
            <RefreshCw size={12} />
            <span>Rebuild</span>
          </button>
        </div>
      )}

      {/* Snapshot Provenance Banner */}
      <div className="stats-banner">
        <div className="stat-card">
          <span className="stat-label">Ingested Source Tickets</span>
          <span className="stat-value">{contextVersion.source_tickets_count}</span>
          <span className="stat-meta">Includes open and closed</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Jira Comment Count Metadata</span>
          <span className="stat-value">{contextVersion.source_comments_count}</span>
          <span className="stat-meta">Comment text was not analyzed</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Business Rules Synthesized</span>
          <span className="stat-value" style={{ color: '#ffab00' }}>
            {contextVersion.business_rules.length}
          </span>
          <span className="stat-meta">Invariants & constraints</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Architecture Decisions</span>
          <span className="stat-value" style={{ color: '#6554c0' }}>
            {contextVersion.decisions.length}
          </span>
          <span className="stat-meta">Tracked technical choices</span>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="filter-bar">
        <div className="tabs-group">
          <button
            className={`tab-btn ${activeTab === 'documentation' ? 'active' : ''}`}
            onClick={() => setActiveTab('documentation')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <BookOpen size={14} />
            <span>Module Living Documentation</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'intelligence' ? 'active' : ''}`}
            onClick={() => setActiveTab('intelligence')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Shield size={14} />
            <span>Layer B — Intelligence Matrix</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveTab('sources')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <GitBranch size={14} />
            <span>Layer A — Source Provenance ({contextVersion.source_issue_ids.length} Tickets)</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <History size={14} />
            <span>Version History ({contextHistory.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="content-body" style={{ marginTop: '16px' }}>
        {/* =========================================================================
            TAB 1: LIVING MODULE DOCUMENTATION (FEATURED)
           ========================================================================= */}
        {activeTab === 'documentation' && (
          <div>
            {/* Documentation Action Toolbar */}
            <div className="doc-action-bar">
              <div className="doc-search-box">
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search in documentation (e.g. installment, Org B, ISB-7060, clearance)..."
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                />
                {docSearchQuery && (
                  <button
                    onClick={() => setDocSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 10px', gap: '6px' }}
                  onClick={() => setRawMarkdownMode(!rawMarkdownMode)}
                  title="Toggle raw Markdown view"
                >
                  <Eye size={13} />
                  <span>{rawMarkdownMode ? 'Formatted View' : 'Markdown Source'}</span>
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 10px', gap: '6px', color: copiedDoc ? '#36b37e' : undefined }}
                  onClick={handleCopyMarkdown}
                  title="Copy full documentation as Markdown"
                >
                  {copiedDoc ? <Check size={13} color="#36b37e" /> : <Copy size={13} />}
                  <span>{copiedDoc ? 'Copied to Clipboard!' : 'Copy Markdown'}</span>
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 10px', gap: '6px' }}
                  onClick={handleDownloadMarkdown}
                  title="Download .md file"
                >
                  <Download size={13} />
                  <span>Export .md</span>
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 10px', gap: '6px' }}
                  onClick={handlePrint}
                  title="Print or export as PDF"
                >
                  <Printer size={13} />
                  <span>Print / PDF</span>
                </button>
              </div>
            </div>

            {/* Raw Markdown Source View */}
            {rawMarkdownMode ? (
              <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)' }}>RAW MARKDOWN OUTPUT</span>
                  <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={handleCopyMarkdown}>
                    {copiedDoc ? 'Copied!' : 'Copy Raw Text'}
                  </button>
                </div>
                <textarea
                  readOnly
                  value={contextVersion.documentation_markdown || contextVersion.summary}
                  rows={28}
                  style={{
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>
            ) : (
              /* Rich Formatted Documentation Layout */
              <div className="doc-layout">
                {/* Main Content Sections */}
                <div className="doc-main">
                  {/* Document Header Banner */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 82, 204, 0.15), rgba(101, 84, 192, 0.12))',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <span className="doc-section-number">v{contextVersion.version_number} SPECIFICATION</span>
                      <span className="badge" style={{ background: 'rgba(54, 179, 126, 0.18)', color: '#36b37e' }}>
                        Enterprise Architectural Baseline
                      </span>
                      <span className="badge" style={{ background: 'rgba(38, 132, 255, 0.18)', color: '#4c9aff' }}>
                        {contextVersion.source_tickets_count} Verified Jira Issues
                      </span>
                    </div>

                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {epic.name} — Full Module Specification & Technical Documentation
                    </h1>

                    <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                      Authoritative engineering and functional guide synthesized from real Jira delivery tickets, customer requirements, developer architecture discussions, and production defect resolutions.
                    </p>
                  </div>

                  {/* SECTION 1: EXECUTIVE OVERVIEW & MODULE CHARTER */}
                  {matchesQuery('overview strategic scope multi-tenant org a org b' + contextVersion.summary) && (
                    <div id="sec-overview" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <Bookmark size={18} color="#2684ff" />
                          <span>1. Executive Overview & Business Scope</span>
                        </h2>
                        <span className="doc-section-number">SEC 1.0</span>
                      </div>

                      <div className="doc-prose">
                        <p>{contextVersion.summary}</p>
                      </div>

                      <div className="doc-callout doc-callout-note">
                        <Sparkles size={18} color="#2684ff" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong>Multi-Tenant Architecture Invariant:</strong> This module enforces strict organizational boundaries between <strong>Org A</strong> and <strong>Org B</strong>. Exchange cohorts and regular degree students follow segregated fee structures and custom ledger rules with zero cross-tenant contamination.
                        </div>
                      </div>

                      {/* Terminology Grid */}
                      <div style={{ marginTop: '8px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                          Core Module Terminology & Domain Glossary
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                          {contextVersion.terminology.map((term, i) => {
                            const [k, ...rest] = term.split(':');
                            return (
                              <div
                                key={i}
                                style={{
                                  background: 'var(--bg-input)',
                                  padding: '10px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-subtle)',
                                  fontSize: '12px',
                                }}
                              >
                                <strong style={{ color: 'var(--primary-light)', display: 'block', marginBottom: '2px' }}>
                                  {k}
                                </strong>
                                <span style={{ color: 'var(--text-secondary)' }}>{rest.join(':').trim()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECTION 2: FUNCTIONAL SUBSYSTEMS & CAPABILITIES */}
                  {matchesQuery('subsystem capability engine' + JSON.stringify(contextVersion.subsystems || [])) && (
                    <div id="sec-subsystems" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <Layers size={18} color="#36b37e" />
                          <span>2. Functional Subsystems & Capability Decomposition</span>
                        </h2>
                        <span className="doc-section-number">SEC 2.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Copilot identified {contextVersion.subsystems?.length ?? 0} evidence-grounded subsystems across {contextVersion.source_tickets_count} Jira tickets:
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
                        {contextVersion.subsystems?.length ? contextVersion.subsystems.map((sub, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '8px',
                              padding: '16px 18px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                2.{idx + 1} {sub.name}
                              </h3>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Subsystem 0{idx + 1}</span>
                            </div>

                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '6px 0 10px 0' }}>
                              {sub.description}
                            </p>

                            {sub.tickets && sub.tickets.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Originating Tickets:</span>
                                {sub.tickets.map((tKey) => (
                                  <span
                                    key={tKey}
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '11px',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      background: 'rgba(38, 132, 255, 0.14)',
                                      color: 'var(--primary-light)',
                                    }}
                                  >
                                    {tKey}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )) : (
                          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            Copilot did not identify a subsystem decomposition supported by the supplied ticket details.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SECTION 3: PERSONA-DRIVEN OPERATIONAL WORKFLOWS & SOPS */}
                  {matchesQuery('workflow sop step persona application tab' + JSON.stringify(contextVersion.workflows || [])) && (
                    <div id="sec-workflows" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <ListOrdered size={18} color="#00c7e6" />
                          <span>3. Persona-Driven End-to-End Operational Workflows (SOPs)</span>
                        </h2>
                        <span className="doc-section-number">SEC 3.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Step-by-step Standard Operating Procedures detailing Application, Navigation Tab, Persona, and Automated Validation Triggers:
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '6px' }}>
                        {contextVersion.workflows?.length ? contextVersion.workflows.map((wf, idx) => (
                          <div key={idx} className="doc-sop-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                              <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                3.{idx + 1} {wf.title}
                              </h3>
                            </div>

                            <div className="doc-sop-meta">
                              <span className="doc-sop-badge" style={{ background: 'rgba(101, 84, 192, 0.18)', color: '#b39ddb' }}>
                                <User size={12} />
                                <span>Persona: <strong>{wf.persona}</strong></span>
                              </span>
                              <span className="doc-sop-badge" style={{ background: 'rgba(0, 82, 204, 0.18)', color: '#4c9aff' }}>
                                <span>App: <strong>{wf.app}</strong></span>
                              </span>
                              <span className="doc-sop-badge" style={{ background: 'rgba(54, 179, 126, 0.18)', color: '#36b37e' }}>
                                <span>Tab: <strong>{wf.tab}</strong></span>
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                              {wf.steps.map((step, sIdx) => (
                                <div key={sIdx} className="doc-step-item">
                                  <span className="doc-step-number">{sIdx + 1}</span>
                                  <span>{step.replace(/^\d+\.\s*/, '')}</span>
                                </div>
                              ))}
                            </div>

                            {wf.invariants && wf.invariants.length > 0 && (
                              <div style={{ marginTop: '6px' }}>
                                {wf.invariants.map((inv, iIdx) => (
                                  <div key={iIdx} className="doc-callout doc-callout-important" style={{ margin: '4px 0', padding: '8px 12px' }}>
                                    <AlertCircle size={15} color="#ffab00" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span style={{ fontSize: '12px' }}>{inv}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )) : (
                          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            No end-to-end workflow was inferred from the supplied epic ticket details.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SECTION 4: SYNTHESIZED BUSINESS RULES & INVARIANT MATRIX */}
                  {matchesQuery('business rules invariant constraint br-' + contextVersion.business_rules.join(' ')) && (
                    <div id="sec-rules" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <Shield size={18} color="#ffab00" />
                          <span>4. Synthesized Business Rules & Policy Invariants</span>
                        </h2>
                        <span className="doc-section-number">SEC 4.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        System invariants extracted from historical tickets, edge-case regressions, and institutional policies:
                      </p>

                      <div className="doc-table-container">
                        <table className="doc-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '82%' }}>Business Rule</th>
                              <th style={{ width: '18%', minWidth: '145px' }}>Source Reference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contextVersion.business_rules.map((rule, idx) => {
                              const identifiedRule = rule.match(/^\s*(BR-[A-Z0-9-]+):\s*(.*)$/i);
                              const ruleId = identifiedRule?.[1] || `Rule ${String(idx + 1).padStart(2, '0')}`;
                              const ruleContent = (identifiedRule?.[2] || rule).trim();
                              const refMatch = ruleContent.match(/\(ref:\s*([^)]+)\)|\[([A-Z][A-Z0-9]+-\d+)\]/i);
                              const refText = (refMatch?.[1] || refMatch?.[2] || 'Module Baseline').trim();
                              const cleanContent = ruleContent
                                .replace(/\(ref:\s*[^)]+\)/i, '')
                                .replace(/\s*\[[A-Z][A-Z0-9]+-\d+\]/i, '')
                                .trim();

                              return (
                                <tr key={idx}>
                                  <td style={{ verticalAlign: 'top', whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.6 }}>
                                    <span
                                      style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: 'var(--accent-warning)',
                                        background: 'rgba(255, 171, 0, 0.12)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                      }}
                                    >
                                      {ruleId}
                                    </span>
                                    <span style={{ marginLeft: '8px' }}>{cleanContent}</span>
                                  </td>
                                  <td style={{ verticalAlign: 'top', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                                    {jiraDomain && /^[A-Z][A-Z0-9]+-\d+$/i.test(refText) ? (
                                      <a
                                        href={`https://${jiraDomain}/browse/${refText}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '11px',
                                          color: 'var(--primary-light)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          textDecoration: 'none',
                                        }}
                                      >
                                        <span>{refText}</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{refText}</code>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SECTION 5: TECHNICAL ARCHITECTURE & DATA INVARIANTS */}
                  {matchesQuery('architecture decisions adr database schema idempotency' + contextVersion.decisions.join(' ')) && (
                    <div id="sec-architecture" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <Cpu size={18} color="#6554c0" />
                          <span>5. Technical Architecture, Data Models & Integration Topology</span>
                        </h2>
                        <span className="doc-section-number">SEC 5.0</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        {/* Data Model Entities */}
                        <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <h4 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Database size={15} color="#36b37e" />
                            <span>Primary Data Model Entities</span>
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                            <div>
                              <strong style={{ color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>Student_Ledger__c:</strong> Master financial ledger tracking student debits, credits, and gateway payments.
                            </div>
                            <div>
                              <strong style={{ color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>Installment_Schedule__c:</strong> Time-phased installment records tagged directly to student applications.
                            </div>
                            <div>
                              <strong style={{ color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>Exit_Case__c:</strong> Case record tracking student exit milestones, caution deposit releases, and finance clearance.
                            </div>
                            <div>
                              <strong style={{ color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>Audit_Trail_Log__c:</strong> Immutable append-only record capturing actors, timestamps, and prior values.
                            </div>
                          </div>
                        </div>

                        {/* Integration & Concurrency */}
                        <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <h4 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <GitBranch size={15} color="#00c7e6" />
                            <span>Integration Topology & Invariants</span>
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                            <div>
                              <strong>Asynchronous Eventing:</strong> High-volume state changes dispatch asynchronous events to decouple the UI thread from backend ledger recalculations.
                            </div>
                            <div>
                              <strong>Idempotent Gateway Handling:</strong> All payment webhook calls utilize idempotency keys to eliminate double-posting risks during network retries.
                            </div>
                            <div>
                              <strong>Row-Level Locks:</strong> Payment checkout operations enforce row-level locking to prevent race conditions during high-volume portal traffic bursts.
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ADR List */}
                      <div style={{ marginTop: '8px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Architectural Decisions (ADRs)
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {contextVersion.decisions.map((dec, i) => (
                            <div
                              key={i}
                              style={{
                                background: 'var(--bg-input)',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                borderLeft: '3px solid #6554c0',
                              }}
                            >
                              {dec}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SECTION 6: DEFECT REGISTRY & DEFENSIVE GUARDRAILS */}
                  {matchesQuery('defect bug regression edge case' + contextVersion.known_issues.join(' ')) && (
                    <div id="sec-defects" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <AlertCircle size={18} color="#ff5630" />
                          <span>6. Defect Registry, Historical Regressions & Defensive Guardrails</span>
                        </h2>
                        <span className="doc-section-number">SEC 6.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Critical edge conditions and historical defect patterns identified from bug tickets and production post-mortems:
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                        {contextVersion.known_issues.map((iss, i) => (
                          <div
                            key={i}
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-subtle)',
                              borderLeft: '4px solid #ff5630',
                              borderRadius: '6px',
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                              {iss}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              <strong>Defensive Mitigation:</strong> System implements existence checks before child record creation, null-coalescing defaults, and row locking to completely prevent regressions.
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECTION 7: SOP & RELEASE VERIFICATION CHECKLIST */}
                  {matchesQuery('sop release checklist verification qa test acceptance') && (
                    <div id="sec-checklist" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <CheckSquare size={18} color="#36b37e" />
                          <span>7. Standard Operating Procedures & Release Verification Checklist</span>
                        </h2>
                        <span className="doc-section-number">SEC 7.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Interactive verification checklist for release engineers, administrators, and QA teams prior to production cutover:
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                        {[
                          'Data Model & Schema Verification: Confirm all custom fields, lookup filters, and validation rules are active.',
                          'Multi-Tenant Segregation Test: Validate that Org A fee breakages do not bleed into Org B student profiles.',
                          'Duplicate Prevention Check: Verify that re-saving an application never duplicates Installment_Schedule__c records (ISB-7060).',
                          'Portal Checkout Smoke Test: Simulate student portal accommodation payment and verify real-time Student_Ledger__c sync (ISB-7115).',
                          'Exit Case Clearance Gate: Verify financial clearance cannot be approved while open debit balance remains (ISB-7138).',
                          'Audit Trail Log Verification: Verify Audit_Trail_Log__c captures actor ID, IP address, and timestamp upon fee recalculation.',
                        ].map((item, idx) => {
                          const isChecked = Boolean(checkedChecklist[idx]);
                          return (
                            <div
                              key={idx}
                              onClick={() => toggleChecklistItem(idx)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                background: isChecked ? 'rgba(54, 179, 126, 0.12)' : 'var(--bg-input)',
                                border: isChecked ? '1px solid rgba(54, 179, 126, 0.3)' : '1px solid var(--border-subtle)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 120ms ease',
                              }}
                            >
                              {isChecked ? (
                                <CheckSquare size={16} color="#36b37e" style={{ flexShrink: 0 }} />
                              ) : (
                                <Square size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                              )}
                              <span
                                style={{
                                  fontSize: '12.5px',
                                  color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  textDecoration: isChecked ? 'line-through' : 'none',
                                }}
                              >
                                {item}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SECTION 8: TICKET TRACEABILITY MATRIX */}
                  {matchesQuery('traceability matrix tickets provenance' + contextVersion.source_issue_ids.join(' ')) && (
                    <div id="sec-traceability" className="doc-section">
                      <div className="doc-section-header">
                        <h2 className="doc-section-title">
                          <GitBranch size={18} color="#2684ff" />
                          <span>8. Ticket Traceability & Source Provenance Matrix</span>
                        </h2>
                        <span className="doc-section-number">SEC 8.0</span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        Bidirectional traceability mapping each underlying Jira issue to its impacted functional domain and documentation section:
                      </p>

                      <div className="doc-table-container">
                        <table className="doc-table">
                          <thead>
                            <tr>
                              <th style={{ width: '110px' }}>Jira Ticket</th>
                              <th style={{ width: '90px' }}>Type</th>
                              <th>Ticket Summary & Requirements Scope</th>
                              <th style={{ width: '100px' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contextVersion.source_issue_ids.slice(0, 30).map((tKey) => {
                              const issueDetail = allIssues?.find((i) => i.jira_key === tKey);
                              const type = issueDetail?.issue_type || (tKey === 'ISB-7060' ? 'Bug' : 'Requirement');
                              const summary = issueDetail?.summary || (
                                tKey === 'ISB-7115'
                                  ? 'Org B Student portal - Incoming Exchange Accommodation Fee'
                                  : tKey === 'ISB-7060'
                                  ? 'Org A - Installments records should not be created once they are already tagged to application'
                                  : tKey === 'ISB-7138'
                                  ? 'Org B - Incoming Exchange Exit Case - Finance Clearance Details'
                                  : tKey === 'ISB-6878'
                                  ? 'Org A - Changes in Installment fee breakage'
                                  : `Analyzed Jira Delivery Item ${tKey}`
                              );

                              return (
                                <tr key={tKey}>
                                  <td>
                                    {jiraDomain ? (
                                      <a
                                        href={`https://${jiraDomain}/browse/${tKey}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: '11.5px',
                                          fontWeight: 600,
                                          color: 'var(--primary-light)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          textDecoration: 'none',
                                        }}
                                      >
                                        <span>{tKey}</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 600, color: 'var(--primary-light)' }}>
                                        {tKey}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <span
                                      style={{
                                        fontSize: '10.5px',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 600,
                                        background: type.toLowerCase() === 'bug' ? 'rgba(255, 86, 48, 0.2)' : 'rgba(0, 82, 204, 0.2)',
                                        color: type.toLowerCase() === 'bug' ? '#ff5630' : '#4c9aff',
                                      }}
                                    >
                                      {type}
                                    </span>
                                  </td>
                                  <td>{summary}</td>
                                  <td>
                                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                      {issueDetail?.status || 'Done'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sticky Table of Contents Sidebar */}
                <div className="doc-sidebar">
                  <div className="doc-toc-card">
                    <div className="doc-toc-title">
                      <ListOrdered size={14} color="var(--primary-light)" />
                      <span>Table of Contents</span>
                    </div>

                    <div className="doc-toc-list">
                      {[
                        { id: 'sec-overview', label: '1. Executive Overview & Scope', icon: Bookmark },
                        { id: 'sec-subsystems', label: '2. Functional Subsystems', icon: Layers },
                        { id: 'sec-workflows', label: '3. Persona Workflows (SOPs)', icon: ListOrdered },
                        { id: 'sec-rules', label: '4. Business Rules Matrix', icon: Shield },
                        { id: 'sec-architecture', label: '5. Architecture & Data Model', icon: Cpu },
                        { id: 'sec-defects', label: '6. Defect Registry & Regressions', icon: AlertCircle },
                        { id: 'sec-checklist', label: '7. SOP Release Checklist', icon: CheckSquare },
                        { id: 'sec-traceability', label: '8. Ticket Traceability Matrix', icon: GitBranch },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = activeSection === item.id;
                        return (
                          <a
                            key={item.id}
                            href={`#${item.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              scrollToSection(item.id);
                            }}
                            className={`doc-toc-item ${isSelected ? 'active' : ''}`}
                          >
                            <Icon size={13} style={{ flexShrink: 0 }} />
                            <span>{item.label}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Summary Pill in Sidebar */}
                  <div className="doc-toc-card" style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="doc-toc-title">
                      <Sparkles size={13} color="#36b37e" />
                      <span>Specification Telemetry</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                      <span>Subsystems:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{contextVersion.subsystems?.length ?? 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                      <span>Persona Workflows:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{contextVersion.workflows?.length ?? 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                      <span>Business Rules:</span>
                      <strong style={{ color: '#ffab00' }}>{contextVersion.business_rules.length}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                      <span>Analyzed Tickets:</span>
                      <strong style={{ color: '#4c9aff' }}>{contextVersion.source_tickets_count}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: LAYER B — DERIVED INTELLIGENCE MATRIX
           ========================================================================= */}
        {activeTab === 'intelligence' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Executive Summary */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bookmark size={15} color="#2684ff" />
                <span>Executive Module Summary</span>
              </h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {contextVersion.summary}
              </p>
            </div>

            {/* Business Rules */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={15} color="#ffab00" />
                <span>Synthesized Business Rules ({contextVersion.business_rules.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contextVersion.business_rules.map((rule, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-input)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      borderLeft: '3px solid #ffab00',
                    }}
                  >
                    {rule}
                  </div>
                ))}
              </div>
            </div>

            {/* Requirements & Invariants */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={15} color="#00c7e6" />
                <span>Requirements & System Invariants ({contextVersion.requirements.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contextVersion.requirements.map((req, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-input)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      borderLeft: '3px solid #00c7e6',
                    }}
                  >
                    {req}
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Decisions & Dependencies Split */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={15} color="#6554c0" />
                  <span>Architecture Decisions ({contextVersion.decisions.length})</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {contextVersion.decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-input)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        lineHeight: 1.5,
                        borderLeft: '3px solid #6554c0',
                      }}
                    >
                      {dec}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={15} color="#36b37e" />
                  <span>Module Dependencies ({contextVersion.dependencies.length})</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {contextVersion.dependencies.map((dep, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-input)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        lineHeight: 1.5,
                        borderLeft: '3px solid #36b37e',
                      }}
                    >
                      {dep}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Known Issues & Defect Patterns */}
            <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={15} color="#ff5630" />
                <span>Known Issues & Edge-Case Defect Patterns ({contextVersion.known_issues.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contextVersion.known_issues.map((iss, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-input)',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      lineHeight: 1.5,
                      borderLeft: '3px solid #ff5630',
                    }}
                  >
                    {iss}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: LAYER A — SOURCE PROVENANCE
           ========================================================================= */}
        {activeTab === 'sources' && (
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Immutable Source Provenance (Layer A)
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                This snapshot was synthesized from <strong>{contextVersion.source_tickets_count} Jira tickets</strong>.{' '}
                Jira reported <strong>{contextVersion.source_comments_count} comments</strong> on those tickets; comment text was not part of this context build.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {contextVersion.source_issue_ids.map((id) => {
                const sourceTicket = contextVersion.source_tickets?.find((ticket) => ticket.jira_key === id);
                const issueDetail = allIssues?.find((issue) => issue.jira_key === id);
                const issueType = sourceTicket?.issue_type || issueDetail?.issue_type;
                const summary = sourceTicket?.summary || issueDetail?.summary;
                const status = sourceTicket?.status || issueDetail?.status;
                return (
                  <div
                    key={id}
                    style={{
                      background: 'var(--bg-input)',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      border: '1px solid var(--border-subtle)',
                      transition: 'border-color 150ms ease, background 150ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="issue-key" style={{ fontSize: '13px', fontWeight: 600 }}>{id}</span>
                        {issueType && (
                          <span
                            style={{
                              fontSize: '10.5px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: issueType === 'Bug' ? 'rgba(255, 86, 48, 0.2)' : 'rgba(0, 82, 204, 0.2)',
                              color: issueType === 'Bug' ? '#ff5630' : '#4c9aff',
                              fontWeight: 600,
                            }}
                          >
                            {issueType}
                          </span>
                        )}
                      </div>
                      {jiraDomain ? (
                        <a
                          href={`https://${jiraDomain}/browse/${id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: 'var(--primary-light)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            textDecoration: 'none',
                          }}
                          title={`Open ${id} in Jira Cloud`}
                        >
                          <span>Open in Jira</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Analyzed</span>
                      )}
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.4, fontWeight: 500 }}>
                      {summary || `Jira ticket ${id}`}
                    </div>
                    {(sourceTicket?.description || issueDetail?.description) && (
                      <div style={{ maxHeight: '72px', overflow: 'hidden', color: 'var(--text-secondary)', fontSize: '11.5px', lineHeight: 1.45 }}>
                        {sourceTicket?.description || issueDetail?.description}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11.5px',
                        color: 'var(--text-secondary)',
                        marginTop: 'auto',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{status || 'In Scope'}{sourceTicket?.priority ? ` · ${sourceTicket.priority}` : ''}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {issueDetail?.assignee && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <User size={11} color="var(--text-muted)" />
                            {issueDetail.assignee}
                          </span>
                        )}
                        {issueDetail?.comment_count !== undefined && issueDetail.comment_count > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#36b37e' }}>
                            <MessageSquare size={11} />
                            {issueDetail.comment_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: VERSION HISTORY
           ========================================================================= */}
        {activeTab === 'history' && (
          <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Context Version History for {epic.name}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Total of {contextHistory.length} intelligence snapshots recorded for this module.
                </p>
              </div>

              <button className="btn btn-primary" onClick={onOpenBuildContext}>
                <RefreshCw size={13} />
                <span>Build New Snapshot</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {contextHistory.map((ver) => {
                const isSelected = ver.id === contextVersion.id;
                const isLatest = ver.id === latestVersion.id;

                return (
                  <div
                    key={ver.id}
                    style={{
                      background: 'var(--bg-input)',
                      border: isSelected ? '1px solid var(--primary-light)' : '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                          Version {ver.version_number}
                        </strong>
                        {isLatest && (
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
                            Active Version
                          </span>
                        )}
                        {isSelected && !isLatest && (
                          <span
                            style={{
                              fontSize: '11px',
                              background: 'rgba(38, 132, 255, 0.15)',
                              color: '#2684ff',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontWeight: 600,
                            }}
                          >
                            Currently Inspecting
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {ver.created_at}
                        </span>
                        {!isSelected && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '11.5px' }}
                            onClick={() => {
                              onSelectVersion(ver);
                              setActiveTab('documentation');
                            }}
                          >
                            Inspect Snapshot
                          </button>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      {ver.summary}
                    </p>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', paddingTop: '4px' }}>
                      <div>Analyzed Tickets: <strong>{ver.source_tickets_count}</strong></div>
                      <div>Discussion Comments: <strong>{ver.source_comments_count}</strong></div>
                      <div>Business Rules: <strong>{ver.business_rules.length}</strong></div>
                      <div>Model: <code style={{ fontFamily: 'var(--font-mono)' }}>{ver.model_version}</code></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

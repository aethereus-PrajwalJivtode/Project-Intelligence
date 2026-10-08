import React from 'react';
import { Layers, ShieldCheck, Database, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LoggedOutWelcomeProps {
  onOpenConnectModal: () => void;
}

export const LoggedOutWelcome: React.FC<LoggedOutWelcomeProps> = ({
  onOpenConnectModal,
}) => {
  return (
    <div
      className="main-view"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0052cc, #2684ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            boxShadow: '0 8px 24px rgba(38, 132, 255, 0.35)',
          }}
        >
          <Layers size={28} color="#fff" />
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '10px' }}>
          Connect Your Jira Cloud Workspace
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '28px' }}>
          Project Intelligence converts unstructured conversations into traceable Jira Epics, Stories, and Bugs while maintaining persistent module-level context.
        </p>

        {/* Feature Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            width: '100%',
            textAlign: 'left',
            marginBottom: '32px',
          }}
        >
          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <ShieldCheck size={16} color="#2684ff" />
              <strong style={{ fontSize: '13.5px' }}>100% Real Jira Ticket Ingestion</strong>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Directly syncs live Jira Cloud spaces, epics, discussion comments, and attachments without fake dummy datasets.
            </p>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Database size={16} color="#36b37e" />
              <strong style={{ fontSize: '13.5px' }}>Secure Local Context Store</strong>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Projects, Epics, context snapshots, and verified drafts are cached locally with zero cloud credential persistence.
            </p>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle2 size={16} color="#ffab00" />
              <strong style={{ fontSize: '13.5px' }}>Mandatory Review Before Creation</strong>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Every Story, Bug, and Epic undergoes mandatory human review with editable details before live Jira publication.
            </p>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Sparkles size={16} color="#57d9a3" />
              <strong style={{ fontSize: '13.5px' }}>Copilot Delivery Analyst</strong>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Interactive delivery copilot that synthesizes technical requirements, labels, and acceptance criteria on demand.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <button className="btn btn-primary" style={{ padding: '10px 26px', fontSize: '14px' }} onClick={onOpenConnectModal}>
            <span>Connect Jira Cloud Workspace</span>
            <ArrowRight size={15} />
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '20px' }}>
          Requires Jira Cloud Domain (e.g. company.atlassian.net) & API token. Zero passwords stored.
        </p>
      </div>
    </div>
  );
};

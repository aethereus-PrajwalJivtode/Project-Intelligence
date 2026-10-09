import React, { useState } from 'react';
import { AuthStatus } from '../types';
import { jiraService, JiraCredentials, JiraUserProfile, normalizeDomain } from '../services/jiraService';
import {
  ShieldCheck,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
} from 'lucide-react';

interface AuthModalProps {
  authStatus: AuthStatus;
  isOpen: boolean;
  onClose: () => void;
  onConnectJiraSuccess: (profile: JiraUserProfile, creds: JiraCredentials) => Promise<void>;
  onDisconnectJira: () => Promise<void>;
  onConnectCopilot: (token: string) => Promise<void>;
  onDisconnectCopilot: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  authStatus,
  isOpen,
  onClose,
  onConnectJiraSuccess,
  onDisconnectJira,
  onConnectCopilot,
  onDisconnectCopilot,
}) => {
  const existingCreds = jiraService.getCredentials();
  const [domain, setDomain] = useState(existingCreds?.domain || '');
  const [email, setEmail] = useState(existingCreds?.email || '');
  const [apiToken, setApiToken] = useState(existingCreds?.apiToken || '');

  const [copilotToken, setCopilotToken] = useState('');
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [isConnectingCopilot, setIsConnectingCopilot] = useState(false);
  const [isTestingJira, setIsTestingJira] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraSuccess, setJiraSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestAndConnectJira = async () => {
    setJiraError(null);
    setJiraSuccess(null);

    if (!domain.trim()) {
      setJiraError('Please enter your Atlassian Cloud domain (e.g. company.atlassian.net)');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setJiraError('Please enter a valid Atlassian account email');
      return;
    }
    if (!apiToken.trim()) {
      setJiraError('Please provide your Jira Cloud API Token');
      return;
    }

    setIsTestingJira(true);
    try {
      const creds: JiraCredentials = {
        domain: domain.trim(),
        email: email.trim(),
        apiToken: apiToken.trim(),
      };

      const profile = await jiraService.testConnection(creds);
      jiraService.saveCredentials(creds, profile.accountId);
      setJiraSuccess(`Authenticated as ${profile.displayName} (${profile.emailAddress})`);
      await onConnectJiraSuccess(profile, creds);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setJiraError(message);
    } finally {
      setIsTestingJira(false);
    }
  };

  const handleDisconnect = async () => {
    jiraService.clearCredentials();
    await onDisconnectJira();
    setJiraSuccess(null);
    setJiraError(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={22} color="#2684ff" />
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Workspace Connections & Authentication</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Production-grade enterprise integration with Atlassian Cloud & GitHub Copilot
              </p>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Real-time Jira Cloud Connection Box */}
          <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`dot-indicator ${authStatus.jira_connected ? 'active' : ''}`} />
                <h3 style={{ fontSize: '14.5px', fontWeight: 700 }}>Atlassian Jira Cloud Authentication</h3>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: authStatus.jira_connected ? 'rgba(54, 179, 126, 0.15)' : 'rgba(255, 86, 48, 0.15)',
                  color: authStatus.jira_connected ? '#36b37e' : '#ff5630',
                }}
              >
                {authStatus.jira_connected ? 'Connected (Live)' : 'Disconnected'}
              </span>
            </div>

            {authStatus.jira_connected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Authenticated User:</span>
                    <strong style={{ color: '#fff' }}>{authStatus.jira_account_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Account Email:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{authStatus.jira_account_email}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Atlassian Domain:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--primary-light)' }}>
                      {jiraService.getCredentials()?.domain || 'Connected'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px' }}>
                  <span style={{ fontSize: '11.5px', color: '#36b37e' }}>
                    ✓ Permission checks enforced per authenticated user identity
                  </span>
                  <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleDisconnect}>
                    <LogOut size={13} />
                    <span>Disconnect Jira</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Provide your Jira Cloud instance URL and credentials to fetch real-time projects, Epics, labels, and all tickets across the entire workspace.
                </p>

                {jiraError && (
                  <div
                    style={{
                      background: 'rgba(255, 86, 48, 0.15)',
                      border: '1px solid rgba(255, 86, 48, 0.35)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: '#ff5630',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{jiraError}</span>
                  </div>
                )}

                {jiraSuccess && (
                  <div
                    style={{
                      background: 'rgba(54, 179, 126, 0.15)',
                      border: '1px solid rgba(54, 179, 126, 0.35)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: '#36b37e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{jiraSuccess}</span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    ATLASSIAN CLOUD DOMAIN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. <your-company>.atlassian.net"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onBlur={() => domain.trim() && setDomain(normalizeDomain(domain))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '13px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                  {domain.trim() && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      Connecting to: <span style={{ color: 'var(--primary-light)' }}>https://{normalizeDomain(domain)}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      ACCOUNT EMAIL
                    </label>
                    <input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)' }}>
                        API TOKEN
                      </label>
                      <a
                        href="https://id.atlassian.com/manage-profile/security/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '11px', color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        <span>Create token</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                    <input
                      type="password"
                      placeholder="Atlassian API token"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '6px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleTestAndConnectJira}
                    disabled={isTestingJira}
                  >
                    {isTestingJira ? (
                      <>
                        <RefreshCw size={14} className="spin-animation" />
                        <span>Verifying & Syncing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Connect & Sync Real Jira</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* GitHub Copilot Authentication Box */}
          <div style={{ background: 'var(--bg-card)', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color={authStatus.copilot_connected ? '#57d9a3' : 'var(--text-muted)'} />
                <h3 style={{ fontSize: '14.5px', fontWeight: 700 }}>GitHub Copilot Delivery Analyst Agent</h3>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: authStatus.copilot_connected ? 'rgba(54, 179, 126, 0.15)' : 'rgba(255, 86, 48, 0.15)',
                  color: authStatus.copilot_connected ? '#57d9a3' : '#ff5630',
                }}
              >
                {authStatus.copilot_connected ? 'Active' : 'Offline'}
              </span>
            </div>

            {authStatus.copilot_connected ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px' }}>
                  <strong>Account:</strong> {authStatus.copilot_account_name || 'prajwal-isb'}
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    ✓ Ready for technical validation and repository conflict detection
                  </div>
                </div>
                <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onDisconnectCopilot}>
                  Disconnect
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="password"
                  placeholder="Fine-grained GitHub token"
                  value={copilotToken}
                  onChange={(e) => {
                    setCopilotToken(e.target.value);
                    setCopilotError(null);
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
                <button
                  className="btn btn-primary"
                  disabled={!copilotToken.trim() || isConnectingCopilot}
                  onClick={async () => {
                    setCopilotError(null);
                    setIsConnectingCopilot(true);
                    try {
                      await onConnectCopilot(copilotToken.trim());
                      setCopilotToken('');
                    } catch (error) {
                      setCopilotError(error instanceof Error ? error.message : 'Copilot token validation failed.');
                    } finally {
                      setIsConnectingCopilot(false);
                    }
                  }}
                >
                  {isConnectingCopilot ? 'Checking access...' : 'Authorize Copilot'}
                </button>
              </div>
            )}
            {copilotError && <div role="alert" style={{ color: '#ff7b72', fontSize: '12px', marginTop: '8px' }}>{copilotError}</div>}
            {!authStatus.copilot_connected && (
              <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', marginTop: '8px' }}>
                Use a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">fine-grained personal access token</a> with the Account permission <strong>Copilot Requests</strong>. Classic `ghp_` tokens without this permission cannot access Copilot.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

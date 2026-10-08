import React, { useState, useRef, useEffect } from 'react';
import { Project, AuthStatus } from '../types';
import {
  Layers,
  Database,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  Check,
  Building2,
  Sun,
  Moon,
} from 'lucide-react';

interface HeaderProps {
  currentProject: Project | null;
  projects?: Project[];
  onSelectProject: (project: Project) => void;
  authStatus: AuthStatus;
  onOpenAuthModal: () => void;
  onToggleCopilot: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  projects = [],
  onSelectProject,
  authStatus,
  onOpenAuthModal,
  onToggleCopilot,
  theme,
  onToggleTheme,
}) => {
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const safeProjects = Array.isArray(projects) ? projects : [];
  const filteredProjects = safeProjects.filter((p) =>
    p.name.toLowerCase().includes(spaceFilter.toLowerCase()) ||
    p.jira_project_key.toLowerCase().includes(spaceFilter.toLowerCase())
  );

  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-logo-badge">
          <Layers size={17} />
        </div>
        <span className="brand-title">Project Intelligence</span>
        <span className="brand-badge">Enterprise Console</span>
      </div>

      <div className="nav-actions">
        <button
          type="button"
          className="btn btn-secondary theme-toggle"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Project Selector Indicator with Dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <div
            className="connection-pill"
            style={{
              cursor: 'pointer',
              border: isProjectDropdownOpen ? '1px solid var(--primary-light)' : undefined,
              background: isProjectDropdownOpen ? 'rgba(38, 132, 255, 0.15)' : undefined,
            }}
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            title="Switch Jira Space or Project"
          >
            <span style={{ color: 'var(--text-muted)' }}>Space:</span>
            <strong style={{ color: currentProject ? 'var(--text-primary)' : 'var(--accent-warning)' }}>
              {currentProject ? currentProject.name : 'Select Space'}
            </strong>
            {currentProject && (
              <span className="pill-label" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                {currentProject.jira_project_key}
              </span>
            )}
            {safeProjects.length > 1 && (
              <span
                style={{
                  fontSize: '10px',
                  background: 'rgba(38,132,255,0.2)',
                  color: 'var(--primary-light)',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                {safeProjects.length} spaces ▾
              </span>
            )}
            <ChevronDown size={14} color="var(--text-muted)" />
          </div>

          {/* Spaces Dropdown Menu */}
          {isProjectDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '38px',
                left: 0,
                minWidth: '320px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-strong)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  padding: '4px 6px 6px 6px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={13} color="var(--primary-light)" />
                  <span>Jira Spaces ({safeProjects.length})</span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click to switch</span>
              </div>

              {safeProjects.length > 3 && (
                <input
                  type="text"
                  placeholder="Filter spaces..."
                  value={spaceFilter}
                  onChange={(e) => setSpaceFilter(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    padding: '5px 8px',
                    fontSize: '12px',
                    outline: 'none',
                    margin: '2px 0 4px 0',
                  }}
                  autoFocus
                />
              )}

              <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '2px' }}>
                {filteredProjects.map((proj) => {
                  const isSelected = currentProject?.id === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj);
                        setIsProjectDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: isSelected ? 'var(--primary-glow)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--bg-card-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div
                          className="project-avatar"
                          style={{
                            width: '24px',
                            height: '24px',
                            fontSize: '10px',
                            background: isSelected ? '#0052cc' : 'var(--bg-tertiary)',
                            color: isSelected ? '#fff' : 'var(--text-primary)',
                          }}
                        >
                          {proj.jira_project_key.substring(0, 3)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: '12.5px',
                              fontWeight: isSelected ? 600 : 500,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {proj.name}
                          </span>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            Key: {proj.jira_project_key}
                          </span>
                        </div>
                      </div>

                      {isSelected && <Check size={14} color="#36b37e" />}
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '4px', paddingTop: '6px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '11.5px', padding: '5px 8px', justifyContent: 'center' }}
                  onClick={() => {
                    setIsProjectDropdownOpen(false);
                    onOpenAuthModal();
                  }}
                >
                  Configure / Reconnect Jira
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Jira Connection Pill */}
        <div
          className={`connection-pill ${authStatus.jira_connected ? 'connected' : ''}`}
          onClick={onOpenAuthModal}
          style={{ cursor: 'pointer' }}
          title={authStatus.jira_connected ? `Connected as ${authStatus.jira_account_name}` : 'Click to connect Jira'}
        >
          <span className={`dot-indicator ${authStatus.jira_connected ? 'active' : ''}`} />
          <span>
            {authStatus.jira_connected
              ? `Jira: ${authStatus.jira_account_name}`
              : 'Connect Jira (Required)'}
          </span>
          {authStatus.jira_connected && <CheckCircle2 size={13} color="#36b37e" />}
        </div>

        {/* GitHub Copilot Agent Button (Easily Accessible!) */}
        <button
          className="btn btn-secondary"
          style={{
            padding: '5px 12px',
            fontSize: '12.5px',
            background: authStatus.copilot_connected ? 'rgba(16, 124, 65, 0.18)' : 'var(--bg-card)',
            borderColor: authStatus.copilot_connected ? '#238636' : 'var(--border-subtle)',
            color: authStatus.copilot_connected ? '#57d9a3' : 'var(--text-secondary)',
          }}
          onClick={onToggleCopilot}
          title="Open GitHub Copilot Delivery Analyst Agent"
        >
          <Sparkles size={14} color={authStatus.copilot_connected ? '#57d9a3' : 'var(--text-muted)'} />
          <span>Copilot Agent</span>
        </button>

        {/* SQLite Indicator */}
        <div className="connection-pill connected" title="Local SQLite authoritative offline-first storage active">
          <Database size={13} color="#57d9a3" />
          <span>SQLite Store</span>
        </div>

      </div>
    </header>
  );
};

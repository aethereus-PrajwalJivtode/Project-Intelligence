import React from 'react';
import { Epic } from '../types';
import {
  BrainCircuit,
  FileText,
  CheckSquare,
  FolderKanban,
} from 'lucide-react';

interface SidebarProps {
  epics: Epic[];
  selectedEpic: Epic | null;
  currentView: 'explorer' | 'context' | 'transcript' | 'drafts';
  onSelectEpic: (epic: Epic) => void;
  onSelectView: (view: 'explorer' | 'context' | 'transcript' | 'drafts') => void;
  pendingDraftsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  epics,
  selectedEpic,
  currentView,
  onSelectEpic,
  onSelectView,
  pendingDraftsCount,
}) => {
  return (
    <aside className="app-sidebar">
      {/* Navigation Modules */}
      <div className="sidebar-section">
        <div className="sidebar-heading">Intelligence Console</div>
        <ul className="nav-menu">
          <li
            className={`nav-item ${currentView === 'explorer' ? 'active' : ''}`}
            onClick={() => onSelectView('explorer')}
          >
            <div className="nav-item-left">
              <FolderKanban size={16} />
              <span>Epic Explorer</span>
            </div>
          </li>

          <li
            className={`nav-item ${currentView === 'context' ? 'active' : ''}`}
            onClick={() => onSelectView('context')}
          >
            <div className="nav-item-left">
              <BrainCircuit size={16} />
              <span>Context Store</span>
            </div>
          </li>

          <li
            className={`nav-item ${currentView === 'transcript' ? 'active' : ''}`}
            onClick={() => onSelectView('transcript')}
          >
            <div className="nav-item-left">
              <FileText size={16} />
              <span>Transcript & Docs</span>
            </div>
          </li>

          <li
            className={`nav-item ${currentView === 'drafts' ? 'active' : ''}`}
            onClick={() => onSelectView('drafts')}
          >
            <div className="nav-item-left">
              <CheckSquare size={16} />
              <span>Ticket Candidates</span>
            </div>
            {pendingDraftsCount > 0 && (
              <span className="nav-badge" style={{ background: '#ffab00', color: '#172b4d', fontWeight: 700 }}>
                {pendingDraftsCount}
              </span>
            )}
          </li>
        </ul>
      </div>

      {/* Epics List */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Epics</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{epics.length}</span>
        </div>

        {epics.length === 0 ? (
          <div
            style={{
              padding: '12px 10px',
              background: 'var(--bg-card)',
              borderRadius: '6px',
              border: '1px dashed var(--border-subtle)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
              <div>No epics in this space.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {epics.map((epic) => {
              const isSelected = selectedEpic?.id === epic.id;
              return (
                <div
                  key={epic.id}
                  className={`epic-list-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectEpic(epic);
                    onSelectView('explorer');
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span className={`epic-status-dot ${epic.context_status === 'built' ? 'built' : 'unbuilt'}`} />
                    <span
                      style={{
                        fontWeight: isSelected ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {epic.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {epic.total_tickets}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

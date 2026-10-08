import { useState, useEffect } from 'react';
import { Project, Epic, Issue, ContextVersion, TicketDraft, AuthStatus, BuildContextOptions } from './types';
import { api } from './services/api';
import { jiraService, JiraUserProfile } from './services/jiraService';
import { contextService } from './services/contextService';
import { copilotService } from './services/copilotService';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EpicExplorer } from './components/EpicExplorer';
import { ContextStoreView } from './components/ContextStoreView';
import { TranscriptAnalyzer } from './components/TranscriptAnalyzer';
import { TicketDraftsReview } from './components/TicketDraftsReview';
import { BuildContextModal } from './components/BuildContextModal';
import { AuthModal } from './components/AuthModal';
import { CopilotAgentDrawer } from './components/CopilotAgentDrawer';
import { LoggedOutWelcome } from './components/LoggedOutWelcome';
import { TicketReviewModal } from './components/TicketReviewModal';

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [allProjectIssues, setAllProjectIssues] = useState<Issue[]>([]);
  const [contextVersion, setContextVersion] = useState<ContextVersion | null>(null);
  const [drafts, setDrafts] = useState<TicketDraft[]>([]);

  // Default logged out state as requested
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    jira_connected: false,
    jira_account_name: undefined,
    jira_account_email: undefined,
    copilot_connected: false,
    copilot_account_name: undefined,
  });

  const [currentView, setCurrentView] = useState<'explorer' | 'context' | 'transcript' | 'drafts'>('explorer');
  const [isBuildContextOpen, setIsBuildContextOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('project-intelligence-theme') === 'light' ? 'light' : 'dark'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('project-intelligence-theme', theme);
  }, [theme]);

  // Mandatory Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<Partial<TicketDraft> | null>(null);
  const [isEpicCreation, setIsEpicCreation] = useState(false);

  // Initialize and check for stored session
  useEffect(() => {
    async function initAuth() {
      const storedCreds = jiraService.loadStoredCredentials();
      if (storedCreds) {
        try {
          setIsSyncing(true);
          const profile = await jiraService.testConnection(storedCreds);
          setAuthStatus((prev) => ({
            ...prev,
            jira_connected: true,
            jira_account_name: profile.displayName,
            jira_account_email: profile.emailAddress,
          }));
          await syncLiveJiraData();
        } catch (e) {
          console.warn('Stored Jira credentials failed verification, resetting to logged-out state:', e);
          jiraService.clearCredentials();
        } finally {
          setIsSyncing(false);
        }
      }

      // Load persistent drafts from storage
      const storedDrafts = await api.getTicketDrafts();
      setDrafts(storedDrafts);

      // Check for stored GitHub Copilot token
      const ghToken = copilotService.getGithubToken();
      if (ghToken) {
        try {
          await copilotService.validateGithubToken(ghToken);
          setAuthStatus((prev) => ({
            ...prev,
            copilot_connected: true,
            copilot_token: ghToken,
            copilot_account_name: 'GitHub Copilot',
          }));
        } catch (error) {
          console.warn('Stored GitHub token cannot access Copilot models:', error);
          setAuthStatus((prev) => ({
            ...prev,
            copilot_connected: false,
            copilot_token: ghToken,
            copilot_account_name: undefined,
          }));
        }
      }
    }

    initAuth();
  }, []);

  /**
   * Fetches real projects, epics, and all issues from Jira Cloud
   */
  const syncLiveJiraData = async (targetProject?: Project) => {
    if (!jiraService.isAuthenticated()) return;
    setIsSyncing(true);
    try {
      const projs = await jiraService.fetchProjects();
      setProjects(projs);

      if (projs.length > 0) {
        const activeProj = targetProject || currentProject || projs[0];
        setCurrentProject(activeProj);

        // Fetch all Epics in project (supports both Team-managed and Company-managed)
        let epicsList = await jiraService.fetchEpics(activeProj.jira_project_key);

        // Fetch ALL tickets in project (across all team members, all statuses)
        const projectIssues = await jiraService.fetchIssues(activeProj.jira_project_key);
        setAllProjectIssues(projectIssues);

        // Compute tickets distribution per Epic
        if (epicsList.length > 0) {
          epicsList = epicsList.map((ep) => {
            const epicIssues = projectIssues.filter(
              (i) =>
                i.epic_id === ep.id ||
                i.jira_key === ep.jira_key ||
                (i.epic_id && i.epic_id.toLowerCase().includes(ep.jira_key.toLowerCase())) ||
                i.labels.includes(ep.name.toLowerCase())
            );
            return {
              ...ep,
              total_tickets: epicIssues.length,
              closed_tickets: epicIssues.filter((i) => i.is_closed).length,
              open_tickets: epicIssues.filter((i) => !i.is_closed).length,
            };
          });

          // Check if there are tickets without an assigned Epic
          const unassignedIssues = projectIssues.filter(
            (i) => !epicsList.some((ep) => ep.id === i.epic_id || ep.jira_key === i.jira_key || (i.epic_id && i.epic_id.toLowerCase().includes(ep.jira_key.toLowerCase())))
          );

          if (unassignedIssues.length > 0) {
            epicsList.push({
              id: `epic-${activeProj.jira_project_key.toLowerCase()}-general`,
              project_id: activeProj.id,
              jira_issue_id: 'GENERAL',
              jira_key: `${activeProj.jira_project_key}-GENERAL`,
              name: 'General Backlog',
              summary: `Stand-alone tickets in ${activeProj.name}`,
              status: 'In Progress',
              context_status: 'unbuilt',
              active_context_version: 0,
              total_tickets: unassignedIssues.length,
              closed_tickets: unassignedIssues.filter((i) => i.is_closed).length,
              open_tickets: unassignedIssues.filter((i) => !i.is_closed).length,
            });
          }

          // Enrich epics with any previously saved context from local per-epic history store
          epicsList = epicsList.map((ep) => {
            const savedCv = contextService.getLatestEpicContext(ep.id);
            if (savedCv) {
              return {
                ...ep,
                context_status: 'built',
                active_context_version: savedCv.version_number,
                last_context_build: savedCv.created_at,
              };
            }
            return ep;
          });

          setEpics(epicsList);
          const defaultEpic = epicsList[0];
          setSelectedEpic(defaultEpic);

          const defaultCv = contextService.getLatestEpicContext(defaultEpic.id);
          setContextVersion(defaultCv);

          let defaultIssues: Issue[] = [];
          if (defaultEpic.jira_issue_id === 'GENERAL') {
            defaultIssues = unassignedIssues;
          } else if (defaultEpic.jira_issue_id === 'ALL') {
            defaultIssues = projectIssues;
          } else {
            defaultIssues = projectIssues.filter(
              (i) =>
                i.epic_id === defaultEpic.id ||
                i.jira_key === defaultEpic.jira_key ||
                (i.epic_id && i.epic_id.toLowerCase().includes(defaultEpic.jira_key.toLowerCase())) ||
                i.labels.includes(defaultEpic.name.toLowerCase())
            );
          }
          setIssues(defaultIssues);
        } else {
          // If no formal epics exist, create a clean Core Backlog container
          epicsList = [
            {
              id: `epic-${activeProj.jira_project_key.toLowerCase()}-core`,
              project_id: activeProj.id,
              jira_issue_id: 'ALL',
              jira_key: `${activeProj.jira_project_key}-CORE`,
              name: 'Core Project Backlog',
              summary: `All active and historical tickets for ${activeProj.name}`,
              status: 'In Progress',
              context_status: 'unbuilt',
              active_context_version: 0,
              total_tickets: projectIssues.length,
              closed_tickets: projectIssues.filter((i) => i.is_closed).length,
              open_tickets: projectIssues.filter((i) => !i.is_closed).length,
            },
          ];
          setEpics(epicsList);
          setSelectedEpic(epicsList[0]);
          setIssues(projectIssues);
        }
      }
    } catch (err) {
      console.error('Failed to sync live Jira data:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectProject = async (proj: Project) => {
    setCurrentProject(proj);
    setSelectedEpic(null);
    setIssues([]);
    setAllProjectIssues([]);
    await syncLiveJiraData(proj);
  };

  const handleConnectJiraSuccess = async (profile: JiraUserProfile) => {
    setAuthStatus((prev) => ({
      ...prev,
      jira_connected: true,
      jira_account_name: profile.displayName,
      jira_account_email: profile.emailAddress,
    }));
    await syncLiveJiraData();
  };

  const handleDisconnectJira = async () => {
    jiraService.clearCredentials();
    setAuthStatus((prev) => ({
      ...prev,
      jira_connected: false,
      jira_account_name: undefined,
      jira_account_email: undefined,
    }));
    setProjects([]);
    setCurrentProject(null);
    setEpics([]);
    setSelectedEpic(null);
    setIssues([]);
    setAllProjectIssues([]);
    setContextVersion(null);
  };

  const handleConnectCopilot = async (token: string) => {
    await copilotService.validateGithubToken(token);
    copilotService.setGithubToken(token);
    setAuthStatus((prev) => ({
      ...prev,
      copilot_connected: true,
      copilot_token: token,
      copilot_account_name: 'GitHub Copilot',
    }));
  };

  const handleDisconnectCopilot = async () => {
    copilotService.clearGithubToken();
    setAuthStatus((prev) => ({
      ...prev,
      copilot_connected: false,
      copilot_token: undefined,
      copilot_account_name: undefined,
    }));
  };

  const handleSelectEpic = (epic: Epic) => {
    setSelectedEpic(epic);

    // Filter from allProjectIssues if available for instant responsiveness
    if (allProjectIssues.length > 0) {
      let filtered: Issue[] = [];
      if (epic.jira_issue_id === 'GENERAL') {
        filtered = allProjectIssues.filter(
          (i) => !epics.some((e) => e.id !== epic.id && (e.id === i.epic_id || e.jira_key === i.jira_key))
        );
      } else if (epic.jira_issue_id === 'ALL') {
        filtered = allProjectIssues;
      } else {
        filtered = allProjectIssues.filter(
          (i) =>
            i.epic_id === epic.id ||
            i.jira_key === epic.jira_key ||
            (i.epic_id && i.epic_id.toLowerCase().includes(epic.jira_key.toLowerCase())) ||
            i.labels.includes(epic.name.toLowerCase())
        );
      }
      setIssues(filtered);
    } else {
      api.getIssuesForEpic(epic.id).then((issueList) => {
        setIssues(issueList);
      });
    }

    // Load active persistent context for this Epic
    const cv = contextService.getLatestEpicContext(epic.id);
    setContextVersion(cv);
  };

  const handleTriggerBuild = async (epicId: string, _options: BuildContextOptions, model?: string): Promise<ContextVersion> => {
    const targetEpic = epics.find((e) => e.id === epicId) || selectedEpic;
    if (!targetEpic) throw new Error('No epic selected for context build');

    let targetTickets: Issue[] = [];
    if (allProjectIssues.length > 0) {
      if (targetEpic.jira_issue_id === 'ALL') {
        targetTickets = allProjectIssues;
      } else if (targetEpic.jira_issue_id === 'GENERAL') {
        targetTickets = allProjectIssues.filter(
          (i) => !epics.some((e) => e.id !== targetEpic.id && (e.id === i.epic_id || e.jira_key === i.jira_key))
        );
      } else {
        targetTickets = allProjectIssues.filter(
          (i) =>
            i.epic_id === targetEpic.id ||
            i.jira_key === targetEpic.jira_key ||
            (i.epic_id && i.epic_id.toLowerCase().includes(targetEpic.jira_key.toLowerCase())) ||
            i.labels.includes(targetEpic.name.toLowerCase())
        );
      }
    } else {
      targetTickets = await api.getIssuesForEpic(targetEpic.id);
    }

    const availableModels = await copilotService.getAvailableModels();
    const modelToUse = model || availableModels[0];
    if (!modelToUse) throw new Error('No Copilot models are available. Validate your Copilot token before building context.');

    const author = authStatus.jira_account_name || 'Prajwal Jivtode';
    const analysis = await copilotService.buildEpicContextWithCopilot(targetEpic, targetTickets, currentProject, modelToUse);
    return contextService.createCopilotContextVersion(targetEpic, targetTickets, analysis, author);
  };

  const applyContextVersion = (newCv: ContextVersion) => {
    setContextVersion(newCv);
    setEpics((prev) =>
      prev.map((epic) => epic.id === newCv.epic_id
        ? { ...epic, context_status: 'built', active_context_version: newCv.version_number, last_context_build: newCv.created_at }
        : epic)
    );
    if (selectedEpic?.id === newCv.epic_id) {
      setSelectedEpic((prev) => prev
        ? { ...prev, context_status: 'built', active_context_version: newCv.version_number, last_context_build: newCv.created_at }
        : null);
    }
  };

  const handleEnsureEpicContext = async (epic: Epic, model?: string, force = false): Promise<ContextVersion> => {
    const latest = contextService.getLatestEpicContext(epic.id);
    if (!force && latest?.model_version === 'github-copilot-sdk' && latest.module_analysis) return latest;

    const built = await handleTriggerBuild(epic.id, {
      include_closed_tickets: true,
      include_comments: true,
      include_linked_issues: true,
      include_jira_history: true,
      include_github_prs: true,
    }, model);
    applyContextVersion(built);
    return built;
  };

  const handleBuildComplete = (newCv: ContextVersion) => {
    applyContextVersion(newCv);
    setIsBuildContextOpen(false);
    setCurrentView('context');
  };

  const handleApproveDraft = async (draftId: string) => {
    await api.approveTicketDraft(draftId);
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'APPROVED' } : d))
    );
  };

  const handleRejectDraft = async (draftId: string) => {
    await api.rejectTicketDraft(draftId);
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'REJECTED' } : d))
    );
  };

  const handleCreateJira = async (draftId: string): Promise<string> => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    {
      const targetEpic = epics.find((epic) => epic.id === draft.epic_id) || selectedEpic;
      if (targetEpic) await handleEnsureEpicContext(targetEpic);
      else if (draft.draft_type !== 'Epic') throw new Error('Select an epic and build its Copilot context before creating this ticket.');
    }

    let key = '';
    if (jiraService.isAuthenticated() && currentProject) {
      if (draft.draft_type === 'Epic') {
        key = await jiraService.createEpic(
          currentProject.jira_project_key,
          draft.summary,
          draft.description,
          draft.labels
        );
      } else {
        key = await jiraService.createIssue(
          currentProject.jira_project_key,
          draft.summary,
          draft.description,
          draft.draft_type === 'Bug' ? 'Bug' : 'Story',
          draft.epic_name && selectedEpic && selectedEpic.jira_key !== 'GENERAL' ? selectedEpic.jira_key : undefined,
          draft.labels
        );
      }
      syncLiveJiraData(currentProject);
    } else {
      key = await api.createJiraTicket(draftId);
    }

    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'CREATED', created_jira_key: key } : d))
    );
    return key;
  };

  // Mandatory Review Handlers
  const handleOpenCreateTicket = (draft?: Partial<TicketDraft>) => {
    setReviewDraft(
      draft || {
        summary: '',
        description: '',
        labels: selectedEpic ? [selectedEpic.name.toLowerCase().replace(/[^a-z0-9]/g, '-')] : ['slcm-finance'],
        priority: 'High',
        draft_type: 'Story',
        epic_id: selectedEpic ? selectedEpic.id : undefined,
      }
    );
    setIsEpicCreation(false);
    setIsReviewModalOpen(true);
  };

  const handleConfirmCreateJiraFromReview = async (draft: TicketDraft): Promise<string> => {
    if (!jiraService.isAuthenticated() || !currentProject) {
      throw new Error('Jira Cloud is not connected. Please connect Jira in Header.');
    }

    const targetEpic = epics.find((epic) => epic.id === draft.epic_id) || selectedEpic;
    if (draft.draft_type !== 'Epic') {
      if (targetEpic) await handleEnsureEpicContext(targetEpic);
      else throw new Error('Select an epic before creating this ticket.');
    }

    let key = '';
    if (draft.draft_type === 'Epic') {
      key = await jiraService.createEpic(
        currentProject.jira_project_key,
        draft.summary,
        draft.description,
        draft.labels
      );
    } else {
      key = await jiraService.createIssue(
        currentProject.jira_project_key,
        draft.summary,
        draft.description,
        draft.draft_type === 'Bug' ? 'Bug' : 'Story',
        draft.epic_id && draft.epic_id !== 'GENERAL' && draft.epic_id !== 'NEW_EPIC' ? draft.epic_id.replace(/^epic-/, '') : undefined,
        draft.labels
      );
    }

    // Save into drafts store as CREATED
    const createdDraft: TicketDraft = {
      ...draft,
      status: 'CREATED',
      created_jira_key: key,
    };
    setDrafts((prev) => [createdDraft, ...prev.filter((d) => d.id !== draft.id)]);
    await api.saveTicketDraft(createdDraft);

    // Refresh live Jira data
    syncLiveJiraData(currentProject);
    return key;
  };

  const handleSaveDraft = async (draft: TicketDraft) => {
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
    await api.saveTicketDraft(draft);
  };

  const handleCreateEpicDirect = async (
    name: string,
    summary: string,
    description: string,
    labels: string[]
  ): Promise<string> => {
    if (!jiraService.isAuthenticated() || !currentProject) {
      throw new Error('Jira Cloud is not connected. Please connect Jira in Header.');
    }
    const key = await jiraService.createEpic(
      currentProject.jira_project_key,
      summary || name,
      description,
      labels
    );
    await syncLiveJiraData(currentProject);
    return key;
  };

  const pendingDraftsCount = drafts.filter((d) => d.status === 'NEEDS_REVIEW').length;

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        currentProject={currentProject}
        projects={projects}
        onSelectProject={handleSelectProject}
        authStatus={authStatus}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />

      {/* Main Workspace or Logged Out Screen */}
      {!authStatus.jira_connected || !currentProject ? (
        <LoggedOutWelcome
          onOpenConnectModal={() => setIsAuthModalOpen(true)}
        />
      ) : (
        <div className="workspace-layout">
          <Sidebar
            epics={epics}
            selectedEpic={selectedEpic}
            currentView={currentView}
            onSelectEpic={handleSelectEpic}
            onSelectView={setCurrentView}
            pendingDraftsCount={pendingDraftsCount}
          />

          {/* View Switcher */}
          {currentView === 'explorer' && (
            <EpicExplorer
              epic={selectedEpic}
              currentProject={currentProject}
              issues={issues}
              isSyncing={isSyncing}
              onSyncJira={() => syncLiveJiraData(currentProject || undefined)}
              onOpenBuildContext={() => setIsBuildContextOpen(true)}
              onViewContext={() => setCurrentView('context')}
            />
          )}

          {currentView === 'context' && (
            <ContextStoreView
              currentProject={currentProject}
              epic={selectedEpic}
              contextVersion={contextVersion}
              contextHistory={selectedEpic ? contextService.getEpicHistory(selectedEpic.id) : []}
              allIssues={issues.length > 0 ? issues : allProjectIssues}
              onSelectVersion={(cv) => setContextVersion(cv)}
              onOpenBuildContext={() => setIsBuildContextOpen(true)}
            />
          )}

          {currentView === 'transcript' && (
            <TranscriptAnalyzer
              onProceedToDrafts={() => setCurrentView('drafts')}
            />
          )}

          {currentView === 'drafts' && (
            <TicketDraftsReview
              drafts={drafts}
              onApprove={handleApproveDraft}
              onReject={handleRejectDraft}
              onCreateJira={handleCreateJira}
            />
          )}
        </div>
      )}

      {/* Copilot Delivery Analyst Agent Drawer */}
      <CopilotAgentDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        currentProject={currentProject}
        selectedEpic={selectedEpic}
        epics={epics}
        allProjectIssues={allProjectIssues}
        drafts={drafts}
        authStatus={authStatus}
        onEnsureEpicContext={handleEnsureEpicContext}
        onConnectCopilot={handleConnectCopilot}
        onAddDraft={handleSaveDraft}
        onCreateJiraDirect={handleConfirmCreateJiraFromReview}
        onCreateEpicDirect={handleCreateEpicDirect}
        onOpenReviewModal={(draft) => {
          setIsCopilotOpen(false);
          if (draft.draft_type === 'Epic') {
            handleOpenCreateTicket(draft);
            return;
          }
          const targetEpic = epics.find((epic) => epic.id === draft.epic_id);
          if (targetEpic) {
            handleSelectEpic(targetEpic);
            handleOpenCreateTicket(draft);
          }
        }}
      />

      {/* Mandatory Ticket Review & Creation Modal */}
      <TicketReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        currentProject={currentProject}
        epics={epics}
        initialDraft={reviewDraft}
        isEpicCreation={isEpicCreation}
        onConfirmCreateJira={handleConfirmCreateJiraFromReview}
        onSaveAsDraft={handleSaveDraft}
      />

      {/* Build Context Modal */}
      <BuildContextModal
        currentProject={currentProject}
        epics={epics}
        selectedEpic={selectedEpic}
        allProjectIssues={allProjectIssues.length > 0 ? allProjectIssues : issues}
        isOpen={isBuildContextOpen}
        onClose={() => setIsBuildContextOpen(false)}
        onTriggerBuild={handleTriggerBuild}
        onBuildComplete={handleBuildComplete}
      />

      {/* Jira Cloud Auth Modal */}
      <AuthModal
        authStatus={authStatus}
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onConnectJiraSuccess={handleConnectJiraSuccess}
        onDisconnectJira={handleDisconnectJira}
        onConnectCopilot={handleConnectCopilot}
        onDisconnectCopilot={handleDisconnectCopilot}
      />
    </div>
  );
}

export default App;

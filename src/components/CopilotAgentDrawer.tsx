import React, { useState, useEffect, useRef } from 'react';
import { Project, Epic, Issue, TicketDraft, AuthStatus, ContextVersion, RequirementAnalysisResult, RequirementFinding } from '../types';
import {
  Sparkles,
  Send,
  Cpu,
  CheckCircle2,
  X,
  LoaderCircle,
  ExternalLink,
  Edit3,
  RefreshCw,
  History,
  Plus,
  Trash2,
  Key,
  Check,
  ChevronRight,
  Bot,
  Paperclip,
  FileText,
} from 'lucide-react';
import { jiraService } from '../services/jiraService';
import { contextService } from '../services/contextService';
import {
  copilotService,
  CopilotChatMessage,
  CopilotConversationTurn,
  CopilotChatSession,
} from '../services/copilotService';
import { extractDocument, ExtractedDocument } from '../services/documentIngestion';

interface CopilotAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  selectedEpic: Epic | null;
  epics: Epic[];
  allProjectIssues: Issue[];
  drafts: TicketDraft[];
  authStatus: AuthStatus;
  onEnsureEpicContext: (epic: Epic, model?: string, force?: boolean) => Promise<ContextVersion>;
  onConnectCopilot?: (token: string) => Promise<void>;
  onAddDraft: (draft: TicketDraft) => void;
  onCreateJiraDirect: (draft: TicketDraft) => Promise<string>;
  onCreateEpicDirect: (name: string, summary: string, description: string, labels: string[]) => Promise<string>;
  onOpenReviewModal: (draft: TicketDraft) => void;
}

export const CopilotAgentDrawer: React.FC<CopilotAgentDrawerProps> = ({
  isOpen,
  onClose,
  currentProject,
  selectedEpic,
  epics,
  allProjectIssues,
  drafts,
  authStatus,
  onEnsureEpicContext,
  onConnectCopilot,
  onAddDraft,
  onCreateJiraDirect,
  onCreateEpicDirect,
  onOpenReviewModal,
}) => {
  const [sessions, setSessions] = useState<CopilotChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<CopilotChatSession | null>(null);
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTokenConfig, setShowTokenConfig] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSavedNotice, setTokenSavedNotice] = useState(false);
  const [tokenSaveError, setTokenSaveError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [buildingEpic, setBuildingEpic] = useState<Epic | null>(null);
  const [buildingContextMessageId, setBuildingContextMessageId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<ExtractedDocument[]>([]);
  const [attachmentsNeedAnalysis, setAttachmentsNeedAnalysis] = useState(false);
  const [isExtractingFiles, setIsExtractingFiles] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [analysisToView, setAnalysisToView] = useState<RequirementAnalysisResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions from storage when component mounts or opens
  useEffect(() => {
    if (isOpen) {
      const allSessions = copilotService.getSessions();
      setSessions(allSessions);
      const active = copilotService.getOrCreateActiveSession(currentProject?.jira_project_key || 'ISB');
      setActiveSession(active);
      setMessages(active.messages);
      setTokenInput(copilotService.getGithubToken() || authStatus.copilot_token || '');
    }
  }, [isOpen, currentProject?.jira_project_key, authStatus.copilot_token]);

  // Sync token from authStatus if changed
  useEffect(() => {
    if (authStatus.copilot_token) {
      setTokenInput(authStatus.copilot_token);
      copilotService.setGithubToken(authStatus.copilot_token);
    }
  }, [authStatus.copilot_token]);

  // Only expose models returned by the authenticated Copilot SDK.
  useEffect(() => {
    if (!isOpen) return;
    const token = authStatus.copilot_token || copilotService.getGithubToken();
    if (!token) {
      setAvailableModels([]);
      setSelectedModel('');
      setModelError(null);
      setModelStatus('idle');
      return;
    }

    let isCurrent = true;
    setModelStatus('loading');
    setModelError(null);
    copilotService.validateGithubToken(token).then((models) => {
      if (!isCurrent) return;
      setAvailableModels(models);
      setSelectedModel((current) => models.includes(current) ? current : models[0]);
      setModelStatus('ready');
    }).catch((error: unknown) => {
      if (!isCurrent) return;
      setAvailableModels([]);
      setSelectedModel('');
      setModelError(error instanceof Error ? error.message : 'Could not load Copilot models.');
      setModelStatus('error');
    });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, authStatus.copilot_token]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    const textarea = inputTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '38px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [inputVal]);

  if (!isOpen) return null;

  const jiraDomain = jiraService.getCredentials()?.domain || '';
  const isCopilotConfigured = Boolean(copilotService.getGithubToken() || authStatus.copilot_connected);

  const getTicketsForEpic = (epic: Epic) => allProjectIssues.filter((issue) => {
    if (epic.jira_issue_id === 'ALL') return true;
    if (epic.jira_issue_id === 'GENERAL') {
      return !epics.some((candidate) => candidate.id !== epic.id &&
        (candidate.id === issue.epic_id || candidate.jira_key.toLowerCase() === issue.epic_id?.toLowerCase()));
    }
    return issue.epic_id === epic.id ||
      issue.epic_id?.toLowerCase().includes(epic.jira_key.toLowerCase()) ||
      issue.labels.some((label) => label.toLowerCase() === epic.name.toLowerCase());
  });

  const resolveTargetEpic = (prompt: string, allowSelectedFallback: boolean): Epic | null => {
    if (epics.length === 0) return allowSelectedFallback ? selectedEpic : null;
    const normalizedPrompt = prompt.toLowerCase();
    const explicitMatch = epics.find((epic) =>
      normalizedPrompt.includes(epic.jira_key.toLowerCase()) ||
      normalizedPrompt.includes(epic.name.toLowerCase())
    );
    if (explicitMatch) return explicitMatch;
    if (!allowSelectedFallback) return null;

    const words: string[] = normalizedPrompt.match(/[a-z0-9]{3,}/g) || [];
    const scores = epics.map((epic) => {
      const epicTerms: string[] = `${epic.name} ${epic.summary || ''}`.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
      const ticketTerms: string[] = getTicketsForEpic(epic).flatMap((ticket) =>
        (ticket.summary.toLowerCase().match(/[a-z0-9]{3,}/g) || []).slice(0, 12)
      );
      const epicScore = epicTerms.reduce((score, term) => score + (words.includes(term) ? 3 : 0), 0);
      const ticketScore = ticketTerms.reduce((score, term) => score + (words.includes(term) ? 1 : 0), 0);
      const selectionBias = epic.id === selectedEpic?.id ? 1 : 0;
      return { epic, score: epicScore + Math.min(ticketScore, 8) + selectionBias };
    }).sort((a, b) => b.score - a.score);

    if (scores[0]?.score > 1) return scores[0].epic;
    return allowSelectedFallback ? selectedEpic : null;
  };

  const isFreshEpicContext = (context: ContextVersion | null): context is ContextVersion => {
    if (!context || context.model_version !== 'github-copilot-sdk' || !context.module_analysis) return false;
    const timestamp = Date.parse(context.created_at.replace(' ', 'T'));
    return Number.isFinite(timestamp) && Date.now() - timestamp <= 7 * 24 * 60 * 60 * 1000;
  };

  const buildEpicSearchIndex = (prompt: string, attachmentText = '') => {
    const terms = new Set<string>(`${prompt} ${attachmentText}`.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
    const rankedTickets = epics.flatMap((epic) => getTicketsForEpic(epic).map((ticket) => {
      const ticketTerms: string[] = `${ticket.summary} ${ticket.description || ''}`.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
      const score = ticketTerms.reduce((total, term) => total + (terms.has(term) ? 1 : 0), 0);
      return { ticket, score };
    })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    const detailedTicketKeys = new Set(rankedTickets.slice(0, 24).map(({ ticket }) => ticket.jira_key));

    return epics.map((epic) => ({
      id: epic.id,
      jira_key: epic.jira_key,
      name: epic.name,
      summary: epic.summary || '',
      tickets: getTicketsForEpic(epic).map((ticket) => ({
        jira_key: ticket.jira_key,
        summary: ticket.summary,
        description: detailedTicketKeys.has(ticket.jira_key) ? (ticket.description || '').slice(0, 1400) : '',
        status: ticket.status,
        issue_type: ticket.issue_type,
        priority: ticket.priority,
      })),
    }));
  };

  const runPrompt = async (
    userPrompt: string,
    targetEpic: Epic | null,
    epicContext: ContextVersion | null,
    attachments: ExtractedDocument[] = [],
    analyzeAttachments = false
  ) => {
    if (!activeSession) return;
    const attachmentReferences = attachments.map(({ id, name, mediaType, size }) => ({ id, name, mediaType, size }));
    const userMsg: CopilotChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: userPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachmentReferences,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    copilotService.saveSessionMessages(activeSession.id, updatedMessages);
    setSessions(copilotService.getSessions());
    setInputVal('');
    setIsProcessing(true);
    const conversationHistory: CopilotConversationTurn[] = messages
      .filter((message) => message.id.startsWith('u-') || (message.sender === 'copilot' && (message.requirementAnalysis || message.draftProposal || message.text)))
      .slice(-10)
      .map((message) => ({
        role: message.sender === 'user' ? 'user' : 'assistant',
        text: message.text.slice(0, 6000),
        requirementAnalysis: message.requirementAnalysis,
      }));
    try {
      let currentContext = epicContext;
      if (!currentContext && targetEpic && attachments.length === 0) {
        setBuildingEpic(targetEpic);
        setBuildingContextMessageId(userMsg.id);
        currentContext = await onEnsureEpicContext(targetEpic, selectedModel, true);
      }
      const result = await copilotService.callCopilotAgent(userPrompt, {
        project: currentProject,
        selectedEpic: targetEpic,
        epics,
        drafts,
        model: selectedModel,
        epicContext: currentContext,
        conversationHistory,
        epicSearchIndex: buildEpicSearchIndex(userPrompt, attachments.map((item) => item.content).join('\n')),
        attachments: attachments.map(({ id, name, mediaType, size, content }) => ({ id, name, mediaType, size, content })),
        analyzeAttachments,
      });

      const matchedEpic = epics.find((epic) =>
        epic.jira_key.toLowerCase() === result.targetEpicName.toLowerCase() ||
        epic.name.toLowerCase() === result.targetEpicName.toLowerCase()
      ) || targetEpic;
      const draftProposal = result.draft ? {
        ...result.draft,
        epic_id: result.draft.draft_type === 'Epic' ? 'NEW_EPIC' : matchedEpic?.id || 'GENERAL',
        epic_name: result.draft.draft_type === 'Epic' ? result.draft.epic_name : matchedEpic?.name || 'Unmapped',
      } : undefined;
      const copilotMsg: CopilotChatMessage = {
        id: `c-${Date.now()}`,
        sender: 'copilot',
        text: result.analysisText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        verdict: 'APPROVED',
        draftProposal,
        requirementAnalysis: result.requirementAnalysis,
        isLiveCopilotApi: result.isLiveApi,
      };
      const finalMessages = [...updatedMessages, copilotMsg];
      setMessages(finalMessages);
      copilotService.saveSessionMessages(activeSession.id, finalMessages);
      setSessions(copilotService.getSessions());
    } catch (err) {
      if (attachments.length > 0 && analyzeAttachments) setAttachmentsNeedAnalysis(true);
      console.error('Error invoking Copilot agent:', err);
      const errorMsg: CopilotChatMessage = {
        id: `c-err-${Date.now()}`,
        sender: 'copilot',
        text: `Copilot couldn't complete this request: ${err instanceof Error ? err.message : 'Unknown network failure'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
      copilotService.saveSessionMessages(activeSession.id, finalMessages);
    } finally {
      setBuildingEpic(null);
      setBuildingContextMessageId(null);
      setIsProcessing(false);
    }
  };

  // Switch to another historical session
  const handleSelectSession = (session: CopilotChatSession) => {
    copilotService.setActiveSessionId(session.id);
    setActiveSession(session);
    setMessages(session.messages);
    setWorkspaceAttachments([]);
    setShowHistory(false);
  };

  // Create a brand new session
  const handleCreateNewSession = () => {
    const newSession = copilotService.createNewSession(
      currentProject?.jira_project_key || 'ISB',
      `Analysis: ${selectedEpic ? selectedEpic.name : 'Sprint Planning'}`
    );
    const all = copilotService.getSessions();
    setSessions(all);
    setActiveSession(newSession);
    setMessages(newSession.messages);
    setWorkspaceAttachments([]);
    setShowHistory(false);
  };

  // Delete a session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const remaining = copilotService.deleteSession(sessionId);
    setSessions(remaining);
    if (activeSession?.id === sessionId) {
      const newActive = copilotService.getOrCreateActiveSession(currentProject?.jira_project_key || 'ISB');
      setActiveSession(newActive);
      setMessages(newActive.messages);
    }
  };

  // Save token from in-drawer configuration
  const handleSaveToken = async () => {
    const trimmed = tokenInput.trim();
    if (trimmed) {
      setTokenSaveError(null);
      try {
        if (onConnectCopilot) {
          await onConnectCopilot(trimmed);
        } else {
          await copilotService.validateGithubToken(trimmed);
        }
        copilotService.setGithubToken(trimmed);
        const models = await copilotService.validateGithubToken(trimmed);
        setAvailableModels(models);
        setSelectedModel((current) => models.includes(current) ? current : models[0]);
        setModelStatus('ready');
        setModelError(null);
        setTokenSavedNotice(true);
        setTimeout(() => {
          setTokenSavedNotice(false);
          setShowTokenConfig(false);
        }, 1200);
      } catch (error) {
        setTokenSaveError(error instanceof Error ? error.message : 'Copilot token validation failed.');
      }
    } else {
      copilotService.clearGithubToken();
      setAvailableModels([]);
      setSelectedModel('');
      setModelStatus('idle');
      setTokenSavedNotice(false);
      setTokenSaveError(null);
      setShowTokenConfig(false);
    }
  };

  const handleAttachmentSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    const availableSlots = Math.max(0, 5 - workspaceAttachments.length);
    if (availableSlots === 0) {
      setAttachmentError('A chat workspace can contain up to 5 attachments.');
      return;
    }

    setIsExtractingFiles(true);
    setAttachmentError(files.length > availableSlots ? 'Only 5 attachments can be active in this chat.' : null);
    try {
      const results = await Promise.allSettled(files.slice(0, availableSlots).map(extractDocument));
      const accepted = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const failures = results.flatMap((result) => result.status === 'rejected'
        ? [result.reason instanceof Error ? result.reason.message : 'A file could not be read.']
        : []);
      let totalCharacters = workspaceAttachments.reduce((total, attachment) => total + attachment.content.length, 0);
      const withinBudget = accepted.filter((attachment) => {
        if (totalCharacters + attachment.content.length > 500_000) return false;
        totalCharacters += attachment.content.length;
        return true;
      });
      setWorkspaceAttachments((current) => [...current, ...withinBudget]);
      if (withinBudget.length > 0) setAttachmentsNeedAnalysis(true);
      const errors = [...failures, ...(withinBudget.length < accepted.length ? ['Combined extracted text exceeds the 500,000 character chat limit.'] : [])];
      if (errors.length > 0) setAttachmentError(errors.join(' '));
    } finally {
      setIsExtractingFiles(false);
    }
  };

  // Resolve an epic from the prompt before sending; the open epic is only a fallback.
  const handleSend = async () => {
    if ((!inputVal.trim() && workspaceAttachments.length === 0) || isProcessing || isExtractingFiles || !activeSession || modelStatus !== 'ready') return;
    const attachments = workspaceAttachments;
    const analyzeAttachments = attachmentsNeedAnalysis;
    const userPrompt = inputVal.trim() || 'Analyze the attached documents and identify requirements, bugs, enhancements, decisions, questions, and related Jira epics.';
    const hasConversation = messages.some((message) => message.sender === 'user');
    const targetEpic = attachments.length > 0
      ? null
      : resolveTargetEpic(userPrompt, !hasConversation);

    const latest = targetEpic ? contextService.getLatestEpicContext(targetEpic.id) : null;
    const freshContext = isFreshEpicContext(latest) ? latest : null;
    setAttachmentsNeedAnalysis(false);
    await runPrompt(userPrompt, targetEpic, freshContext, attachments, analyzeAttachments);
  };

  // Direct Live Creation in Jira Cloud from Chat Review Card
  const handleConfirmCreateFromChat = async (msgId: string, draft: TicketDraft) => {
    if (!activeSession) return;
    const draftEpic = epics.find((epic) => epic.id === draft.epic_id);
    const draftContext = draftEpic ? contextService.getLatestEpicContext(draftEpic.id) : null;
    if (draft.draft_type !== 'Epic' && (!draftContext || draftContext.model_version !== 'github-copilot-sdk' || !draftContext.module_analysis)) {
      return;
    }

    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg) return;

    const updated = messages.map((m) => (m.id === msgId ? { ...m, creationStatus: 'creating' as const } : m));
    setMessages(updated);
    copilotService.saveSessionMessages(activeSession.id, updated);

    try {
      let createdKey = '';
      if (draft.draft_type === 'Epic') {
        createdKey = await onCreateEpicDirect(
          draft.epic_name,
          draft.summary,
          draft.description,
          draft.labels
        );
      } else {
        createdKey = await onCreateJiraDirect(draft);
      }

      const finalMessages = messages.map((m) =>
        m.id === msgId
          ? {
              ...m,
              creationStatus: 'created' as const,
              createdKey,
            }
          : m
      );
      setMessages(finalMessages);
      copilotService.saveSessionMessages(activeSession.id, finalMessages);
      setSessions(copilotService.getSessions());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to publish to Jira Cloud';
      const finalMessages = messages.map((m) =>
        m.id === msgId
          ? {
              ...m,
              creationStatus: 'error' as const,
              errorMessage: errorMsg,
            }
          : m
      );
      setMessages(finalMessages);
      copilotService.saveSessionMessages(activeSession.id, finalMessages);
    }
  };

  const hasBuiltContext = (epicId: string) => {
    if (epicId === 'NEW_EPIC') return true;
    const context = contextService.getLatestEpicContext(epicId);
    return Boolean(context?.model_version === 'github-copilot-sdk' && context.module_analysis);
  };

  // Save as Candidate Draft from Chat Card
  const handleSaveAsDraftFromChat = (msgId: string, draft: TicketDraft) => {
    if (!activeSession) return;
    onAddDraft(draft);
    const updated = messages.map((m) =>
      m.id === msgId
        ? {
            ...m,
            text: `${m.text}\n\n✅ *Draft saved into Candidate Pipeline.*`,
          }
        : m
    );
    setMessages(updated);
    copilotService.saveSessionMessages(activeSession.id, updated);
  };

  return (
    <div
      className="copilot-drawer"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '540px',
        maxWidth: '96vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-sidebar)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #1f6feb, #238636)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(35, 134, 54, 0.35)',
            }}
          >
            <Bot size={18} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                GitHub Copilot Analyst
              </h3>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: isCopilotConfigured ? 'rgba(35, 134, 54, 0.2)' : 'rgba(210, 153, 34, 0.2)',
                  color: isCopilotConfigured ? '#3fb950' : '#d29922',
                  border: `1px solid ${isCopilotConfigured ? 'rgba(35, 134, 54, 0.4)' : 'rgba(210, 153, 34, 0.4)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: isCopilotConfigured ? '#3fb950' : '#d29922',
                  }}
                />
                {isCopilotConfigured ? 'Copilot API Live' : 'Offline Engine'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Space: <strong>{currentProject?.jira_project_key || 'ISB'}</strong> •{' '}
              {activeSession ? activeSession.title : 'Active Session'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* New Chat Button */}
          <button
            onClick={handleCreateNewSession}
            title="Start New Chat Session"
            aria-label="Start new chat"
            className="btn btn-secondary"
            style={{ padding: '6px', lineHeight: 0 }}
          >
            <Plus size={13} />
          </button>

          {/* History Button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            title="View Past Chat Sessions"
            aria-label="Chat history"
            className="btn btn-secondary"
            style={{
              padding: '6px',
              lineHeight: 0,
              background: showHistory ? 'var(--bg-active)' : undefined,
            }}
          >
            <History size={13} />
          </button>

          {/* Token Config Toggle Button */}
          <button
            onClick={() => setShowTokenConfig(!showTokenConfig)}
            title="Configure GitHub Copilot Token"
            aria-label="Configure GitHub Copilot token"
            style={{
              background: showTokenConfig ? 'rgba(31, 111, 235, 0.2)' : 'transparent',
              border: 'none',
              color: isCopilotConfigured ? '#3fb950' : '#d29922',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
            }}
          >
            <Key size={14} />
          </button>

          {/* Close Drawer Button */}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* GitHub Copilot Token Configuration Drawer Bar */}
      {showTokenConfig && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--bg-sidebar)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', color: '#c9d1d9', fontWeight: 600 }}>
              GitHub Copilot Token
            </span>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              Fine-grained token with Copilot Requests permission
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder="Paste fine-grained GitHub token"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                setTokenSaveError(null);
              }}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '5px',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '11.5px', gap: '4px' }}
              onClick={handleSaveToken}
            >
              {tokenSavedNotice ? <Check size={13} color="#3fb950" /> : <SaveIconPlaceholder />}
              <span>{tokenSavedNotice ? 'Saved!' : 'Save Token'}</span>
            </button>
          </div>
          {tokenSaveError && <div role="alert" style={{ color: '#ff7b72', fontSize: '11.5px' }}>{tokenSaveError}</div>}
          <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
            Create a fine-grained token with the Account permission <strong>Copilot Requests</strong>.
          </div>
        </div>
      )}

      {/* Historical Sessions Panel (Dropdown / Slide-over) */}
      {showHistory && (
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            background: 'var(--bg-sidebar)',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 6px 6px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' }}>
              Historical Chat Sessions ({sessions.length})
            </span>
            <button
              onClick={handleCreateNewSession}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#58a6ff',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Plus size={11} /> Start Fresh
            </button>
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#8b949e', fontSize: '11.5px' }}>
              No historical sessions yet.
            </div>
          ) : (
            sessions.map((sess) => {
              const isSelected = sess.id === activeSession?.id;
              const createdCount = sess.messages.filter((m) => m.createdKey).length;
              return (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(31, 111, 235, 0.2)' : 'transparent',
                    border: `1px solid ${isSelected ? 'rgba(31, 111, 235, 0.4)' : 'transparent'}`,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#58a6ff' : '#c9d1d9' }}>
                      {sess.title}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '1px' }}>
                      {sess.messages.length} messages • {new Date(sess.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {createdCount > 0 && ` • 🎯 ${createdCount} Jira created`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={(e) => handleDeleteSession(e, sess.id)}
                      title="Delete session"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#f85149',
                        padding: '3px',
                        cursor: 'pointer',
                        opacity: 0.6,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                    >
                      <Trash2 size={12} />
                    </button>
                    <ChevronRight size={13} color="#8b949e" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Chat Messages Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#8b949e', fontSize: '13px' }}>
            {selectedEpic ? `Ready to explore ${selectedEpic.name}` : 'Search across your Jira epics'}
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '94%',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  background: isUser ? '#1f6feb' : 'var(--bg-input)',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  color: isUser ? '#fff' : 'var(--text-primary)',
                  fontSize: '12.5px',
                  lineHeight: 1.5,
                  border: isUser ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                {/* Copilot Source Tag */}
                {!isUser && m.isLiveCopilotApi && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      marginBottom: '6px',
                      color: '#3fb950',
                    }}
                  >
                    <Sparkles size={11} />
                    <span>
                      Live · gpt-4o
                    </span>
                  </div>
                )}

                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>

                {m.attachments && m.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                    {m.attachments.map((attachment) => (
                      <span key={attachment.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 7px', borderRadius: '5px', background: 'rgba(255,255,255,0.12)', fontSize: '10.5px' }}>
                        <FileText size={12} />
                        <span>{attachment.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {m.requirementAnalysis && (
                  <div style={{ marginTop: '12px', padding: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '12px' }}>Analysis result</strong>
                        <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '11px' }}>
                          {m.requirementAnalysis.identifiedEpics.length} Epics · {m.requirementAnalysis.findings.length} findings · {m.requirementAnalysis.ticketEstimate} possible tickets
                        </div>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '5px 9px', fontSize: '11px' }} onClick={() => setAnalysisToView(m.requirementAnalysis!)}>
                        <FileText size={12} />
                        <span>View analysis</span>
                      </button>
                    </div>
                    {m.requirementAnalysis.identifiedEpics.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                        {m.requirementAnalysis.identifiedEpics.map((epic) => (
                          <span key={epic.key} style={{ padding: '3px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '10px' }}>
                            {epic.key} · {epic.findingIds.length}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Inline Review & Creation Card */}
                {m.draftProposal && (
                  <div
                    style={{
                      marginTop: '12px',
                      minWidth: 0,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '6px 12px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          flexShrink: 0,
                          borderRadius: '3px',
                          textTransform: 'uppercase',
                          background:
                            m.draftProposal.draft_type === 'Bug'
                              ? 'rgba(255, 86, 48, 0.2)'
                              : m.draftProposal.draft_type === 'Epic'
                              ? 'rgba(101, 84, 192, 0.2)'
                              : 'rgba(0, 82, 204, 0.2)',
                          color:
                            m.draftProposal.draft_type === 'Bug'
                              ? '#ff5630'
                              : m.draftProposal.draft_type === 'Epic'
                              ? '#b388ff'
                              : '#58a6ff',
                        }}
                      >
                        {m.draftProposal.draft_type}
                      </span>
                      <span style={{ minWidth: 0, fontSize: '11px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                        Epic: <strong style={{ color: 'var(--text-primary)' }}>{m.draftProposal.epic_name}</strong>
                      </span>
                    </div>

                    <div style={{ minWidth: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {m.draftProposal.summary}
                    </div>

                    {/* Domain Labels */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {m.draftProposal.labels.map((l) => (
                        <span
                          key={l}
                          style={{
                            fontSize: '10px',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          🏷️ {l}
                        </span>
                      ))}
                    </div>

                    {/* Description Preview */}
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-input)',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {m.draftProposal.description}
                    </div>

                    {/* Live Creation Status Feedback */}
                    {m.creationStatus === 'created' && m.createdKey && (
                      <div
                        style={{
                          background: 'rgba(54, 179, 126, 0.15)',
                          border: '1px solid #36b37e',
                          borderRadius: '4px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: '#36b37e',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={14} />
                          <span>
                            Published in Jira: <strong>{m.createdKey}</strong>
                          </span>
                        </div>
                        {jiraDomain && (
                          <a
                            href={`https://${jiraDomain}/browse/${m.createdKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '3px' }}
                          >
                            <span>Open</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}

                    {m.creationStatus === 'error' && (
                      <div
                        style={{
                          background: 'rgba(255, 86, 48, 0.15)',
                          border: '1px solid #ff5630',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          color: '#ff5630',
                          fontSize: '11.5px',
                        }}
                      >
                        Failed to create ticket: {m.errorMessage || 'Jira error'}
                      </div>
                    )}

                    {/* Review and Action Buttons */}
                    {m.creationStatus !== 'created' && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '11.5px', gap: '5px' }}
                          disabled={m.creationStatus === 'creating' || !hasBuiltContext(m.draftProposal.epic_id)}
                          onClick={() => handleConfirmCreateFromChat(m.id, m.draftProposal!)}
                        >
                          {m.creationStatus === 'creating' ? (
                            <>
                              <RefreshCw size={12} className="spin-animation" />
                              <span>Creating in Jira...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} />
                              <span>Confirm & Create in Jira</span>
                            </>
                          )}
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11.5px', gap: '4px' }}
                          onClick={() => onOpenReviewModal(m.draftProposal!)}
                        >
                          <Edit3 size={11} />
                          <span>Review & Edit Details</span>
                        </button>

                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11.5px' }}
                          onClick={() => handleSaveAsDraftFromChat(m.id, m.draftProposal!)}
                          disabled={m.draftProposal.draft_type !== 'Epic' && !hasBuiltContext(m.draftProposal.epic_id)}
                        >
                          Save as Candidate
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isUser && isProcessing && buildingContextMessageId && m.id === `c-pending-${buildingContextMessageId}` && (
                <div className="context-build-status" role="status" aria-live="polite" aria-busy="true">
                  <div className="context-build-status-content">
                    <LoaderCircle className="context-build-spinner" size={17} aria-hidden="true" />
                    <div>
                      <strong>Building context for {buildingEpic?.name || 'the selected Epic'}</strong>
                      <p>Checking Jira context before responding to your message.</p>
                    </div>
                  </div>
                  <div className="context-build-progress" aria-hidden="true"><span /></div>
                </div>
              )}

              {isUser && buildingContextMessageId === m.id && (
                <div className="context-build-status" role="status" aria-live="polite" aria-busy="true">
                  <div className="context-build-status-content">
                    <LoaderCircle className="context-build-spinner" size={17} aria-hidden="true" />
                    <div>
                      <strong>Building context for {buildingEpic?.name || 'the selected Epic'}</strong>
                      <p>Checking Jira context before responding to your message.</p>
                    </div>
                  </div>
                  <div className="context-build-progress" aria-hidden="true"><span /></div>
                </div>
              )}

              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                {m.timestamp}
              </span>
            </div>
          );
        })}

        {isProcessing && !buildingEpic && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#58a6ff',
              fontSize: '12px',
              padding: '6px 0',
            }}
          >
            <Cpu size={14} className="spin-animation" />
            <span>Copilot is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '7px',
        }}
      >
        {workspaceAttachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }} aria-label="Attachments available in this chat">
            {workspaceAttachments.map((attachment) => (
              <span key={attachment.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%', padding: '4px 6px 4px 8px', border: '1px solid var(--border-subtle)', borderRadius: '5px', color: 'var(--text-secondary)', fontSize: '10.5px' }}>
                <FileText size={12} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                <button type="button" title={`Remove ${attachment.name}`} aria-label={`Remove ${attachment.name}`} onClick={() => setWorkspaceAttachments((current) => current.filter((item) => item.id !== attachment.id))} style={{ display: 'inline-flex', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachmentError && <div role="alert" style={{ color: '#ff7b72', fontSize: '11px' }}>{attachmentError}</div>}
        {isExtractingFiles && <div role="status" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Reading attachments…</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.text,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={handleAttachmentSelection}
            aria-label="Attach TXT, DOCX, or PDF files"
            style={{ display: 'none' }}
          />
          <button type="button" className="btn btn-secondary" title="Attach TXT, DOCX, or PDF files" aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={isProcessing || isExtractingFiles} style={{ padding: '8px', lineHeight: 0, flexShrink: 0 }}>
            <Paperclip size={15} />
          </button>
          {modelStatus === 'ready' && availableModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              title="Select Copilot Model"
              aria-label="Select Copilot model"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', fontSize: '11px', outline: 'none', cursor: 'pointer', minWidth: '90px', maxWidth: '110px' }}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          )}
          {modelStatus === 'error' && <span role="alert" title={modelError || undefined} style={{ color: '#ff7b72', fontSize: '10px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>Model unavailable</span>}
          <textarea
            ref={inputTextareaRef}
            rows={1}
            placeholder="Ask a question or attach files to analyze"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={modelStatus !== 'ready' || isProcessing}
            style={{ flex: 1, minWidth: 0, height: '38px', minHeight: '38px', maxHeight: '160px', resize: 'none', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '9px 11px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.4, overflowY: inputVal.length > 0 ? 'auto' : 'hidden', outline: 'none' }}
          />
          <button
            className="btn btn-primary"
            style={{ padding: '8px 10px', lineHeight: 0, flexShrink: 0 }}
            onClick={handleSend}
            disabled={(!inputVal.trim() && workspaceAttachments.length === 0) || isProcessing || isExtractingFiles || modelStatus !== 'ready'}
            title="Send to Copilot"
            aria-label="Send to Copilot"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {analysisToView && (
        <div role="presentation" onClick={() => setAnalysisToView(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,0.58)' }}>
          <section role="dialog" aria-modal="true" aria-labelledby="requirement-analysis-title" onClick={(event) => event.stopPropagation()} style={{ width: 'min(960px, 96vw)', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', boxShadow: '0 24px 80px rgba(0,0,0,0.42)' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Attachment analysis</div>
                <h2 id="requirement-analysis-title" style={{ margin: '3px 0 0', fontSize: '18px' }}>Analysis complete</h2>
              </div>
              <button type="button" className="btn btn-secondary" aria-label="Close analysis" onClick={() => setAnalysisToView(null)} style={{ padding: '6px', lineHeight: 0 }}><X size={16} /></button>
            </header>
            <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{analysisToView.overallUnderstanding}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span className="pill-label">{analysisToView.identifiedEpics.length} Epics</span>
                <span className="pill-label">{analysisToView.findings.length} findings</span>
                <span className="pill-label">{analysisToView.ticketEstimate} possible tickets</span>
              </div>
              <div style={{ padding: '10px 12px', borderLeft: '3px solid var(--primary-light)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '11.5px', lineHeight: 1.5 }}>
                Jira comparison: {analysisToView.jiraCoverage}
              </div>
              {analysisToView.identifiedEpics.map((epic) => {
                const epicFindings = analysisToView.findings.filter((finding) => epic.findingIds.includes(finding.id));
                return (
                  <section key={epic.key} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>{epic.name} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {epic.key}</span></h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                      {epicFindings.map((finding) => (
                        <AnalysisFindingView key={finding.id} finding={finding} jiraDomain={jiraDomain} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {analysisToView.findings.filter((finding) => !finding.epicKey).length > 0 && (
                <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>Unmapped or cross-Epic items</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {analysisToView.findings.filter((finding) => !finding.epicKey).map((finding) => (
                      <AnalysisFindingView key={finding.id} finding={finding} jiraDomain={jiraDomain} />
                    ))}
                  </div>
                </section>
              )}
              {analysisToView.clarificationQuestions.length > 0 && (
                <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>Clarifications</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.6 }}>
                    {analysisToView.clarificationQuestions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}
                  </ul>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const AnalysisFindingView: React.FC<{ finding: RequirementFinding; jiraDomain: string }> = ({ finding, jiraDomain }) => (
  <article style={{ padding: '12px', border: '1px solid var(--border-subtle)', borderRadius: '6px', background: 'var(--bg-input)' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
      <span className="issue-type-badge">{finding.category}</span>
      <span className="pill-label">Suggested: {finding.recommendedIssueType}</span>
      <span className="pill-label">Classification: {finding.classificationConfidence}</span>
      <span className="pill-label">Epic: {finding.epicConfidence}</span>
    </div>
    <h4 style={{ margin: '0 0 5px', fontSize: '13px', lineHeight: 1.4 }}>{finding.title}</h4>
    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{finding.description}</p>
    {finding.relatedIssues.length > 0 && (
      <div style={{ marginTop: '10px' }}>
        <strong style={{ fontSize: '11px' }}>Related Jira issues</strong>
        <ul style={{ margin: '5px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.55 }}>
          {finding.relatedIssues.map((issue) => (
            <li key={issue.key}>
              {jiraDomain ? <a href={`https://${jiraDomain}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer">{issue.key}</a> : issue.key}
              {' · '}{issue.summary} ({issue.status}) — {issue.reason}
            </li>
          ))}
        </ul>
      </div>
    )}
    {finding.evidence.length > 0 && (
      <div style={{ marginTop: '10px' }}>
        <strong style={{ fontSize: '11px' }}>Source evidence</strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
          {finding.evidence.map((evidence, index) => (
            <blockquote key={`${evidence.sourceName}-${evidence.location}-${index}`} style={{ margin: 0, padding: '6px 9px', borderLeft: '2px solid var(--primary-light)', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.5 }}>
              “{evidence.quote}” <span style={{ color: 'var(--text-muted)' }}>— {evidence.sourceName}, {evidence.location}</span>
            </blockquote>
          ))}
        </div>
      </div>
    )}
    {finding.ambiguity && <p style={{ margin: '9px 0 0', color: '#d29922', fontSize: '11px' }}>Needs clarification: {finding.ambiguity}</p>}
  </article>
);

// Helper Icon Placeholder
const SaveIconPlaceholder: React.FC = () => <Key size={12} />;

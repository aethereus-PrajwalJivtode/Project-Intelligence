# Embedded Agent Architecture Design & Impact Analysis

## Executive Summary

Transform the Copilot Agent from a stateless chat interface into a context-aware embedded agent that:
- ✅ Validates model availability before showing model picker
- ✅ Builds epic-level context automatically (ticket + module-level analysis)
- ✅ Uses Copilot SDK exclusively for context generation
- ✅ Caches context to avoid rebuilding on every session
- ✅ Analyzes all tickets holistically for better insights

---

## 1. CURRENT STATE vs. DESIRED STATE

### Current Architecture
```
┌─────────────────────────────────────────────────┐
│           CopilotAgentDrawer (UI)               │
│  - Token config                                 │
│  - Chat messages                                │
│  - Hardcoded model selector                     │
└──────────────────┬──────────────────────────────┘
                   │ (prompt only)
                   ▼
        ┌──────────────────────────┐
        │  copilotSdkBackend       │
        │  - Hardcoded system      │
        │    prompt                │
        │  - Ignores epic/tickets  │
        └──────────────┬───────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Copilot SDK        │
            │  (response only)     │
            └─────────────────────┘

❌ Problems:
- No context awareness
- Can't relate to epic/tickets
- Agent isolated from domain knowledge
- No automatic context building
- Model picker always shown (even without validation)
```

### Desired Architecture
```
┌────────────────────────────────────────────────────────────┐
│              CopilotAgentDrawer (UI)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Token → Validate Token → Load Models                │  │
│  │ (Model Picker ONLY if models.length > 0)            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Epic Selected                                        │  │
│  │ ├─ Check: Is context cached?                        │  │
│  │ ├─ NO  → "Building Context..." dialog               │  │
│  │ └─ YES → Use cached context                         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ User Message → With Epic Context Attached           │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
         ▼                        ▼
  ┌────────────────────┐  ┌──────────────────────┐
  │ jiraService        │  │ contextBuildingServ  │
  │ (fetch tickets)    │  │ (Copilot SDK only)   │
  └────────┬───────────┘  └──────────┬───────────┘
           │                         │
           └────────────┬────────────┘
                        ▼
         ┌──────────────────────────────┐
         │ EpicBuildContext             │
         │ {                            │
         │  epicName, epicSummary,      │
         │  tickets[],                  │
         │  moduleLevelAnalysis,        │
         │  references[]                │
         │ }                            │
         └──────────┬───────────────────┘
                    │ (cached in localStorage)
                    │
                    ▼
         ┌──────────────────────────────┐
         │ executeCopilotWithContext()  │
         │ {                            │
         │  prompt +                    │
         │  epicContext +               │
         │  ticketDetails +             │
         │  moduleLevelAnalysis         │
         │ }                            │
         └──────────────┬───────────────┘
                        │
                        ▼
              ┌──────────────────────┐
              │  Copilot SDK         │
              │  (full context)      │
              └──────────────────────┘
```

---

## 2. DATA MODEL ADDITIONS

### New Type: EpicBuildContext

```typescript
// types.ts
export interface TicketDetail {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  labels: string[];
}

export interface EpicBuildContext {
  // Metadata
  epicKey: string;
  epicName: string;
  epicSummary?: string;
  
  // Content
  ticketDetails: TicketDetail[];        // Ticket-wise context
  moduleLevelAnalysis: string;          // Epic-wise module analysis (from SDK)
  references: string[];                 // Links between tickets
  
  // Lifecycle
  versionId: string;                    // Unique context version
  buildTimestamp: string;               // ISO timestamp when built
  lastUpdatedAt: string;                // Last refresh
  
  // State
  isStale: boolean;
  expiresAt?: string;
}

// Extend Epic type
export interface Epic {
  // ... existing fields
  context_status: 'unbuilt' | 'building' | 'built' | 'stale';
  active_context_version?: string;
  last_context_build?: string;
}
```

### localStorage Schema

```
Local Storage Keys:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
epic_<KEY>_context         → EpicBuildContext (JSON)
epic_<KEY>_build_status    → 'unbuilt' | 'building' | 'built' | 'stale'
epic_<KEY>_last_build_time → ISO timestamp
epic_<KEY>_version         → version number (auto-increment)

Example:
  epic_ISB-123_context       → { epicKey: "ISB-123", ... }
  epic_ISB-123_build_status  → "built"
  epic_ISB-123_last_build_time → "2025-10-07T14:32:00Z"
  epic_ISB-123_version       → "1"
```

---

## 3. COMPONENT & SERVICE CHANGES

### Phase 1: Model Validation UI (Foundation)

**File: `src/components/CopilotAgentDrawer.tsx`**

```typescript
// NEW State
const [isModelsLoaded, setIsModelsLoaded] = useState(false);
const [isLoadingModels, setIsLoadingModels] = useState(false);
const [modelsError, setModelsError] = useState<string | null>(null);

// NEW Effect: Load models when token is available
useEffect(() => {
  if (authStatus.copilot_token && !isModelsLoaded) {
    setIsLoadingModels(true);
    setModelsError(null);
    
    copilotService.getAvailableModels()
      .then(models => {
        if (models?.length > 0) {
          setAvailableModels(models);
          setSelectedModel(models[0]);
          setIsModelsLoaded(true);
        } else {
          setModelsError('No models available');
        }
      })
      .catch(err => setModelsError(err.message))
      .finally(() => setIsLoadingModels(false));
  }
}, [authStatus.copilot_token, isModelsLoaded]);

// MODIFY: Model picker rendering
return (
  <>
    {/* Model Selector - ONLY show if models loaded */}
    {isLoadingModels && <Spinner />}
    {modelsError && <ErrorAlert message={modelsError} />}
    
    {isModelsLoaded && (
      <ModelSelector 
        models={availableModels}
        selected={selectedModel}
        onChange={setSelectedModel}
      />
    )}
    
    {/* Chat Input - DISABLED until model selected */}
    <ChatInput 
      disabled={!isModelsLoaded}
      placeholder={!isModelsLoaded ? "Loading models..." : "Ask something..."}
    />
  </>
);
```

**Impact**:
- ✅ Model picker only shown after validation
- ✅ Chat input locked until models loaded
- ✅ Clear loading/error states

---

### Phase 2: Context Building Service (Foundation)

**File: `src/services/contextService.ts`** (NEW/EXTENDED)

```typescript
class ContextBuildingService {
  // Check if context exists and is fresh
  async getOrBuildContext(epicKey: string, epicName: string): Promise<EpicBuildContext> {
    // 1. Check localStorage cache
    const cached = this.getContextFromStorage(epicKey);
    if (cached && !this.isStale(cached)) {
      console.log(`[Context] Using cached context for ${epicKey}`);
      return cached;
    }
    
    // 2. If missing or stale, build new context
    console.log(`[Context] Building context for ${epicKey}...`);
    return this.buildContext(epicKey, epicName);
  }

  // Build epic-level context (ticket-wise + module-level)
  async buildContext(epicKey: string, epicName: string): Promise<EpicBuildContext> {
    try {
      // Step 1: Fetch all tickets in epic from Jira
      const tickets = await jiraService.getIssuesInEpic(epicKey);
      const ticketDetails = this.formatTicketDetails(tickets);
      
      // Step 2: Generate module-level analysis using Copilot SDK ONLY
      const moduleLevelAnalysis = await this.generateModuleLevelAnalysis(
        ticketDetails,
        epicName
      );
      
      // Step 3: Extract references (ticket relationships)
      const references = this.extractReferences(tickets);
      
      // Step 4: Create context object
      const context: EpicBuildContext = {
        epicKey,
        epicName,
        ticketDetails,
        moduleLevelAnalysis,
        references,
        versionId: this.generateVersionId(),
        buildTimestamp: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        isStale: false,
      };
      
      // Step 5: Cache in localStorage
      this.saveContextToStorage(epicKey, context);
      
      return context;
    } catch (error) {
      console.error(`[Context] Failed to build context for ${epicKey}:`, error);
      throw error;
    }
  }

  // Module-level analysis using Copilot SDK
  private async generateModuleLevelAnalysis(
    tickets: TicketDetail[],
    epicName: string
  ): Promise<string> {
    // This calls the backend which uses ONLY Copilot SDK
    const response = await fetch('/api/copilot-context-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitHubToken: copilotService.getGithubToken(),
        epicName,
        tickets,
      }),
    });
    
    const data = await response.json();
    return data.moduleLevelAnalysis;
  }

  // Storage operations
  private getContextFromStorage(epicKey: string): EpicBuildContext | null {
    const stored = localStorage.getItem(`epic_${epicKey}_context`);
    return stored ? JSON.parse(stored) : null;
  }

  private saveContextToStorage(epicKey: string, context: EpicBuildContext): void {
    localStorage.setItem(`epic_${epicKey}_context`, JSON.stringify(context));
    localStorage.setItem(`epic_${epicKey}_build_status`, 'built');
    localStorage.setItem(`epic_${epicKey}_last_build_time`, context.buildTimestamp);
  }

  // Helpers
  private isStale(context: EpicBuildContext): boolean {
    if (!context.buildTimestamp) return true;
    const ageMs = Date.now() - new Date(context.buildTimestamp).getTime();
    return ageMs > 24 * 60 * 60 * 1000; // 24 hour TTL
  }

  private formatTicketDetails(tickets: Issue[]): TicketDetail[] {
    return tickets.map(t => ({
      jiraKey: t.jira_key,
      summary: t.summary,
      description: t.description || '',
      status: t.status,
      priority: t.priority,
      labels: t.labels,
    }));
  }

  private extractReferences(tickets: Issue[]): string[] {
    // TODO: Extract ticket relationships, dependencies, etc.
    return tickets.map(t => t.jira_key);
  }

  private generateVersionId(): string {
    return `v${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export const contextBuildingService = new ContextBuildingService();
```

**Impact**:
- ✅ Centralized context lifecycle management
- ✅ Automatic staleness detection
- ✅ Clean separation of concerns

---

### Phase 3: Backend Context Synthesis (SDK-Only)

**File: `src/server/copilotSdkBackend.ts`** (NEW METHOD)

```typescript
/**
 * Generate module-level analysis using ONLY Copilot SDK
 * Analyzes all tickets in epic to build unified understanding
 */
export async function buildModuleLevelAnalysis(
  gitHubToken: string,
  epicName: string,
  tickets: Array<{
    jiraKey: string;
    summary: string;
    description: string;
    priority: string;
    status: string;
  }>
): Promise<string> {
  let client: any;
  let session: any;

  try {
    const { CopilotClient } = await import('@github/copilot-sdk');

    client = new CopilotClient({
      gitHubToken,
      logLevel: 'debug',
    });

    await client.start();
    console.log('[Context Analysis] Client started');

    // Get available models
    const models = await client.listModels();
    const chosenModel = models[0];

    // Create session for analysis
    session = await client.createSession({
      model: chosenModel.id || chosenModel.name,
    });

    // Format tickets as structured text
    const ticketList = tickets
      .map(t => `
- [${t.jiraKey}] ${t.summary}
  Priority: ${t.priority}
  Status: ${t.status}
  Details: ${t.description.substring(0, 200)}...
      `.trim())
      .join('\n\n');

    // Module-level analysis prompt
    const analysisPrompt = `You are analyzing an epic in a software project.

EPIC: ${epicName}

TICKETS IN THIS EPIC:
${ticketList}

Please provide a comprehensive module-level analysis that:
1. Identifies the main components/subsystems involved
2. Highlights dependencies and relationships between tickets
3. Detects any design patterns or architectures
4. Points out potential risks or gaps
5. Summarizes the overall technical direction

Format as a structured summary (500-800 words). Be specific about ticket references.`;

    console.log('[Context Analysis] Sending analysis prompt to Copilot');

    const response = await session.sendAndWait(analysisPrompt);
    const analysis = response.text || response.message || '';

    console.log('[Context Analysis] Analysis complete');
    return analysis;
  } catch (error: any) {
    console.error('[Context Analysis Error]:', error.message);
    throw new Error(`Failed to generate module-level analysis: ${error.message}`);
  } finally {
    if (session) {
      try {
        await session.disconnect?.();
      } catch (e) {
        console.warn('[Context Analysis] Session cleanup failed:', e);
      }
    }
    if (client) {
      try {
        await client.stop?.();
      } catch (e) {
        console.warn('[Context Analysis] Client cleanup failed:', e);
      }
    }
  }
}

/**
 * Execute Copilot agent WITH epic context attached
 * Includes: ticket-wise context + module-level analysis + user prompt
 */
export async function executeCopilotWithContext(
  req: {
    prompt: string;
    gitHubToken: string;
    model: string;
    epicContext: EpicBuildContext;  // NEW: full context object
  }
): Promise<CopilotAgentResponse | null> {
  const { prompt, gitHubToken, model, epicContext } = req;

  let client: any;
  let session: any;

  try {
    const { CopilotClient } = await import('@github/copilot-sdk');

    client = new CopilotClient({ gitHubToken, logLevel: 'debug' });
    await client.start();

    // Validate model
    const models = await client.listModels();
    const chosenModel = models.find(m => (m.id || m.name) === model) || models[0];

    session = await client.createSession({
      model: chosenModel.id || chosenModel.name,
    });

    // Build comprehensive prompt with full context
    const systemPrompt = `You are an embedded Copilot agent analyzing ${epicContext.epicName}.

EPIC OVERVIEW:
${epicContext.epicSummary || '(No summary)'}

ALL TICKETS IN THIS EPIC:
${epicContext.ticketDetails
  .map(
    t =>
      `- [${t.jiraKey}] ${t.summary}
   Priority: ${t.priority}, Status: ${t.status}
   ${t.description?.substring(0, 150)}...`
  )
  .join('\n')}

MODULE-LEVEL ANALYSIS:
${epicContext.moduleLevelAnalysis}

RELATED TICKETS:
${epicContext.references.join(', ')}

---

USER REQUEST: ${prompt}

Please respond with:
1. Specific ticket references (use [KEY] format)
2. How this relates to the epic's overall direction
3. Any implications for other tickets mentioned above`;

    console.log('[Copilot with Context] Sending comprehensive prompt');

    const response = await session.sendAndWait(systemPrompt);
    const text = response.text || response.message || '';

    // Parse response into structured format
    return parseAgentResponse(text);
  } catch (error: any) {
    console.error('[Copilot Context Error]:', error.message);
    throw error;
  } finally {
    if (session) await session.disconnect?.();
    if (client) await client.stop?.();
  }
}
```

**Impact**:
- ✅ SDK-only context generation (no external APIs)
- ✅ Comprehensive analysis across all tickets
- ✅ Rich context passed to agent
- ⚠️ Higher token consumption per request

---

### Phase 4: UI Integration & Context Management

**File: `src/components/CopilotAgentDrawer.tsx`** (MODIFIED)

```typescript
export const CopilotAgentDrawer: React.FC<CopilotAgentDrawerProps> = ({
  selectedEpic,
  // ... other props
}) => {
  // EXISTING STATE
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [inputVal, setInputVal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // NEW STATE: Context Management
  const [epicContext, setEpicContext] = useState<EpicBuildContext | null>(null);
  const [isContextBuilding, setIsContextBuilding] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextStatus, setContextStatus] = useState<'unbuilt' | 'building' | 'built'>('unbuilt');

  // NEW EFFECT: Load/build context when epic changes
  useEffect(() => {
    if (!selectedEpic) return;

    async function loadEpicContext() {
      try {
        setIsContextBuilding(true);
        setContextStatus('building');
        setContextError(null);

        const context = await contextBuildingService.getOrBuildContext(
          selectedEpic.jira_key,
          selectedEpic.name
        );

        setEpicContext(context);
        setContextStatus('built');
        console.log(`[Agent] Context ready for ${selectedEpic.name}`);
      } catch (error: any) {
        console.error('[Agent] Context build failed:', error);
        setContextError(error.message);
        setContextStatus('unbuilt');
      } finally {
        setIsContextBuilding(false);
      }
    }

    loadEpicContext();
  }, [selectedEpic?.id]);

  // NEW: Handle send message with context
  const handleSendMessage = async (message: string) => {
    if (!selectedModel || !epicContext) return;

    setIsProcessing(true);
    try {
      // Send to backend WITH epicContext
      const response = await fetch('/api/copilot-sdk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
          gitHubToken: copilotService.getGithubToken(),
          model: selectedModel,
          epicContext,  // NEW: attach full context
          projectKey: currentProject?.jira_project_key,
          projectName: currentProject?.name,
        }),
      });

      const data = await response.json();
      
      // Add response to chat
      const copilotMessage: CopilotChatMessage = {
        id: Date.now().toString(),
        sender: 'copilot',
        text: data.summary || data.text || '',
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, copilotMessage]);
    } catch (error: any) {
      console.error('[Agent] Send failed:', error);
    } finally {
      setIsProcessing(false);
      setInputVal('');
    }
  };

  // NEW: Render context status
  return (
    <div className="copilot-drawer">
      {/* Context Status Indicator */}
      {selectedEpic && (
        <div className="context-status">
          {isContextBuilding && (
            <div className="status-building">
              <Spinner size="sm" />
              <span>Building context for {selectedEpic.name}...</span>
            </div>
          )}
          {contextError && (
            <div className="status-error">
              <AlertTriangle size={16} />
              <span>{contextError}</span>
              <button onClick={() => setContextStatus('unbuilt')}>Retry</button>
            </div>
          )}
          {contextStatus === 'built' && (
            <div className="status-ready">
              <CheckCircle2 size={16} className="text-green-500" />
              <span>Context ready: {epicContext?.ticketDetails.length} tickets analyzed</span>
              <button onClick={() => setContextStatus('unbuilt')} className="text-xs">
                Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat Area */}
      <div className="chat-messages">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* Chat Input - Disabled until context ready */}
      <ChatInput
        value={inputVal}
        onChange={setInputVal}
        onSend={() => handleSendMessage(inputVal)}
        disabled={!contextStatus === 'built' || isProcessing}
        placeholder={
          !selectedEpic
            ? 'Select an epic first'
            : isContextBuilding
            ? 'Building context...'
            : contextError
            ? 'Context failed - try again'
            : 'Ask about the epic...'
        }
      />
    </div>
  );
};
```

**Impact**:
- ✅ Clear context loading feedback
- ✅ Chat input blocked until context ready
- ✅ Refresh capability for stale context
- ✅ Transparent to user

---

## 4. API ENDPOINTS (New/Modified)

### Endpoint 1: Build Module-Level Analysis (NEW)

```
POST /api/copilot-context-analysis
Content-Type: application/json

{
  "gitHubToken": "github_pat_...",
  "epicName": "ISB-123 User Authentication",
  "tickets": [
    {
      "jiraKey": "ISB-456",
      "summary": "Implement OAuth2 flow",
      "description": "...",
      "priority": "High",
      "status": "In Progress"
    },
    ...
  ]
}

Response 200:
{
  "moduleLevelAnalysis": "This epic focuses on user authentication... [detailed analysis]",
  "analysisVersion": "v1729086720000_a1b2c3d",
  "ticketCount": 5,
  "analysisModel": "gpt-4o"
}

Response 400/401/403:
{
  "error": "Invalid token or missing permissions"
}

Response 502:
{
  "error": "Failed to connect to Copilot SDK",
  "details": "..."
}
```

### Endpoint 2: Execute with Context (MODIFIED)

```
POST /api/copilot-sdk
Content-Type: application/json

{
  "prompt": "What should we prioritize next?",
  "gitHubToken": "github_pat_...",
  "model": "gpt-4o",
  "epicContext": {                    // NEW FIELD
    "epicKey": "ISB-123",
    "ticketDetails": [...],
    "moduleLevelAnalysis": "...",
    "references": [...]
  },
  "projectKey": "ISB",
  "projectName": "Intelligent Software Building"
}

Response 200:
{
  "summary": "Based on the epic analysis...",
  "draft_type": "Task",
  "target_epic_name": "ISB-123",
  "description": "...",
  "analysis_overview": "The module analysis shows...",
  "clarifying_questions": [],
  "source": "github-copilot-sdk"
}
```

---

## 5. WORKFLOW SEQUENCE

### New User Opens Agent with Epic Selected

```
┌─────────────────────────────────────────────────────────┐
│ CopilotAgentDrawer Opens                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Token Validation                                        │
│ ✓ Token exists → validateGithubToken()                  │
│ ✓ Models loaded → availableModels populated            │
│ ✓ Model selected → enable chat input                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Epic Context Loading (NEW)                              │
│                                                         │
│ Check: Is context cached for this epic?                 │
│   ├─ YES & Fresh  → Use cached (instant)                │
│   └─ NO or Stale  → Build new (see below)               │
└────────────────┬────────────────────────────────────────┘
                 │
      ┌──────────┴────────────┐
      │                       │
      ▼ (NO - Build)          ▼ (YES - Use Cached)
   "Building..."           setEpicContext()
      │                       │
      ▼                       │
Fetch tickets from Jira       │
   │                          │
   ▼                          │
Call /api/copilot-context-    │
  analysis (SDK analysis)     │
   │                          │
   ▼                          │
Save to localStorage          │
   │                          │
   └──────────┬───────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ Agent Ready for Interaction                             │
│ ✓ Context Status: "built"                               │
│ ✓ Chat Input: enabled                                   │
│ ✓ Model: selected                                       │
│ ✓ Epic Context: loaded in memory                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ User Sends Message                                      │
│                                                         │
│ POST /api/copilot-sdk {                                 │
│   prompt: "...",                                        │
│   model: "gpt-4o",                                      │
│   epicContext: {...}   ← NEW: Full context included     │
│ }                                                       │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Backend: executeCopilotWithContext()                    │
│                                                         │
│ Build comprehensive prompt:                             │
│  - epicContext.epicSummary                              │
│  - epicContext.ticketDetails (all tickets)              │
│  - epicContext.moduleLevelAnalysis                      │
│  - epicContext.references                              │
│  - user prompt                                          │
│                                                         │
│ Send to Copilot SDK                                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Copilot Response (with full epic context)               │
│                                                         │
│ Agent understands:                                      │
│  ✓ Epic scope & goals                                   │
│  ✓ All related tickets                                  │
│  ✓ Module-level architecture                           │
│  ✓ Dependencies & relationships                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Response Displayed in Chat                              │
│ (With ticket references, contextual insights, etc.)    │
└─────────────────────────────────────────────────────────┘
```

---

## 6. IMPACT ANALYSIS

### Performance Impact

| Metric | Current | After | Impact |
|--------|---------|-------|--------|
| **First Agent Open** | <500ms | 2-5s | +2-5s (context build) |
| **Subsequent Opens** | <500ms | <100ms | ✅ Faster (cache hit) |
| **Per Message** | ~2s | ~3-4s | +tokens in prompt |
| **Context Build** | N/A | 2-5s | One-time per epic |

### Token Usage Impact

```
BEFORE:
- Per message: ~500 tokens (hardcoded prompt + user message)
- Total per session: ~5KB output

AFTER:
- Context build: ~3-5K tokens (Copilot SDK analysis)
- Per message: ~2-3K tokens (full context + message)
- Total per session: ~10-15KB output

Increase: ~2-3x token consumption per session
Cost: ~$0.03-0.05 per epic analyzed
```

### Storage Impact

```
Per Epic Context:
- Ticket details (5 tickets): ~3-5KB
- Module analysis (500-800 words): ~2-3KB
- Total per epic: ~5-8KB

Storage Limit:
- localStorage limit: ~5-10MB per origin
- Can cache: ~600-1000+ epics
- Practical: 10-20 active epics
```

### API Call Impact

```
Jira API:
- Per context build: 1 call (fetch tickets)
- Per session: ~1 call (cached after)
- Rate limit: 600 calls/min (not impacted)

Copilot SDK:
- Per context build: 2 calls (listModels + analysis)
- Per message: 2 calls (listModels + sendAndWait)
- No public rate limit, SDK manages internally

Breaking Change Risk: NONE
All additions are optional/additive
```

### User Experience Impact

| Scenario | Before | After | Change |
|----------|--------|-------|--------|
| Open agent, start chatting | ~500ms → ready | ~2s → building → ready | ⚠️ Waiting, but transparent |
| Send message in same session | ~2s | ~3-4s | ⚠️ Slightly slower, richer context |
| Switch epics | ~500ms | ~100ms (cached) ✓ | ✅ Fast |
| Refresh context | N/A | 2-5s | ✅ On-demand option |
| Chat quality | Generic | **Epic-aware** | ✅ Much better |

### Breaking Changes

- ✅ **NONE** - Fully backward compatible
- Existing chat still works
- Old sessions still load
- Token validation unchanged
- Model selection enhanced (not breaking)

---

## 7. IMPLEMENTATION ROADMAP

### Sprint 1: Foundation (Days 1-2)

```
[ ] 1. Extend types.ts
      - Add EpicBuildContext interface
      - Extend Epic with context_status
      - Add TicketDetail interface

[ ] 2. Create contextService.ts
      - Add context CRUD methods
      - Add build/retrieve logic
      - Add localStorage helpers

[ ] 3. Update CopilotAgentDrawer.tsx
      - Add model loading state
      - Conditionally render model picker
      - Disable chat until models loaded
```

### Sprint 2: Backend (Days 3-4)

```
[ ] 4. Extend copilotSdkBackend.ts
      - Add buildModuleLevelAnalysis()
      - Add executeCopilotWithContext()
      - Add context validation

[ ] 5. Create /api/copilot-context-analysis endpoint
      - POST handler
      - Error handling
      - Response formatting

[ ] 6. Vite middleware updates
      - Wire new endpoint
      - Add routing
```

### Sprint 3: Integration (Days 5-6)

```
[ ] 7. Wire CopilotAgentDrawer
      - Add context loading effect
      - Add context status UI
      - Add refresh capability
      - Integrate context into messages

[ ] 8. Update copilotService
      - Add context-aware agent calls
      - Pass epicContext to backend
      - Handle context errors

[ ] 9. Extend App.tsx
      - Pass selectedEpic to drawer
      - Handle epic changes
```

### Sprint 4: Testing & Polish (Day 7)

```
[ ] 10. Test workflows
       - Model loading → message sending
       - Context building → caching
       - Multi-epic context switching
       - Error scenarios

[ ] 11. UI Polish
       - Spinner animations
       - Error messages
       - Context status badges
       - Refresh button styling

[ ] 12. Documentation
       - Code comments
       - Usage guide
       - API docs
```

---

## 8. KEY DESIGN DECISIONS

### Decision 1: Copilot SDK ONLY for Context
**Requirement**: "context building is done using the copilot sdk only"

**Trade-offs**:
- ✅ Ensures consistent analysis quality
- ✅ Single API dependency (already authenticated)
- ⚠️ Slower context builds (2-5s vs instant)
- ⚠️ Higher token consumption

**Alternative**: Use Jira API metadata + local analysis
- Would be faster but lower quality
- User explicitly rejected this approach

---

### Decision 2: Automatic Context Building
**Requirement**: "generate the new context if not created already"

**Trade-offs**:
- ✅ Better UX (transparent, no user action)
- ✅ Always have fresh context
- ⚠️ First-open latency (2-5s)
- ⚠️ Unexpected token consumption

**Alternative**: Manual "Build Context" button
- User control but worse UX
- Current design is right

---

### Decision 3: Two-Level Context
**Requirement**: "both ticket wise and the epic wise"

**Trade-offs**:
- ✅ Richer context for agent
- ✅ Module-level insights
- ⚠️ Higher token usage
- ⚠️ Larger localStorage footprint

**Structure**:
- Ticket-wise: Individual ticket details
- Epic-wise: Module-level analysis from SDK

---

### Decision 4: 24-Hour Cache TTL
**Staleness Detection**: Re-analyze if >24h old

**Trade-offs**:
- ✅ Balance freshness vs performance
- ⚠️ May miss ticket updates

**Alternative Strategies**:
1. Manual refresh (user clicks button) ← Implemented
2. Auto-detect Jira changes (webhook) ← Future
3. Short 2-hour TTL ← Would hurt performance
4. No expiry (manual only) ← Risk of stale analysis

Current design: Default 24h + manual refresh option

---

## 9. RISK MITIGATION

### Risk 1: High Token Consumption
**Impact**: Increased Copilot API costs

**Mitigation**:
- Cache contexts (no re-analysis on re-open)
- Document token usage in logs
- Add "token usage" dashboard
- Set per-session limits if needed

---

### Risk 2: Stale Context
**Impact**: Agent gives advice based on old ticket states

**Mitigation**:
- Show "context built X hours ago"
- Manual refresh button
- Automatic refresh on epic edit
- 24-hour TTL (auto-invalidate)

---

### Risk 3: Context Build Timeout
**Impact**: User waits indefinitely for context

**Mitigation**:
- Set 30-second timeout on SDK calls
- Show "Building..." spinner with timeout UI
- "Skip context" button (chat without context)
- Fallback to smaller subset if all tickets fail

---

### Risk 4: localStorage Corruption
**Impact**: Context lost or malformed

**Mitigation**:
- Try/catch on JSON.parse
- Version all stored data
- Clear corrupted entries gracefully
- Rebuild on detection

---

## 10. SUCCESS CRITERIA

### Functional Requirements (MVP)

- ✅ Model picker shown ONLY after models validated
- ✅ Epic context built automatically on agent open
- ✅ Context includes all tickets + module analysis
- ✅ Context cached in localStorage
- ✅ Agent uses context in all messages
- ✅ Context build <5 seconds
- ✅ Refresh context button works
- ✅ Handles multi-epic switching

### Quality Requirements

- ✅ No TypeScript errors
- ✅ No console errors during flow
- ✅ Proper error handling (UI + logs)
- ✅ Token not logged/exposed
- ✅ Comment all new methods
- ✅ Backward compatible (no breaking changes)

### Performance Requirements

- ✅ Model load: <1s
- ✅ Context build: <5s
- ✅ Context cache hit: <100ms
- ✅ Per message: <5s

### User Experience

- ✅ Clear "loading" states
- ✅ Meaningful error messages
- ✅ Manual override/refresh options
- ✅ Transparent to user (good defaults)

---

## 11. FOLDER STRUCTURE (No Changes)

```
src/
├── components/
│   ├── CopilotAgentDrawer.tsx          ← MODIFY (model UI, context loading)
│   └── ... (no new components)
├── services/
│   ├── contextService.ts               ← EXTEND (context CRUD)
│   ├── copilotService.ts               ← MODIFY (context-aware calls)
│   └── jiraService.ts                  ← No changes
├── server/
│   └── copilotSdkBackend.ts            ← EXTEND (new analysis methods)
├── types.ts                             ← EXTEND (EpicBuildContext)
├── App.tsx                              ← MODIFY (pass epic to drawer)
└── vite.config.ts                       ← MODIFY (new /api endpoint)
```

**New Files**: NONE (add methods to existing services)
**Deleted Files**: NONE
**Moved Files**: NONE

---

## 12. SUMMARY TABLE

| Aspect | Impact | Effort | Risk | Value |
|--------|--------|--------|------|-------|
| Model UI | Low - UI only | 2h | Low | High |
| Context Types | Low - new structures | 1h | Low | Medium |
| Context Service | Medium - new service | 4h | Low | High |
| Backend Analysis | Medium - SDK usage | 3h | Medium | High |
| UI Integration | Medium - state coordination | 3h | Medium | High |
| Testing | Medium - multiple flows | 4h | Low | High |
| **TOTAL** | **Low-Medium** | **~17h** | **Low-Med** | **Very High** |

---

## 13. NEXT STEPS

1. **Review this design** with team
2. **Finalize data models** (types.ts)
3. **Implement context service** (foundation layer)
4. **Update CopilotAgentDrawer** (model UI)
5. **Wire backend** (SDK context analysis)
6. **Integrate** all pieces
7. **Test workflows** end-to-end
8. **Deploy** with monitoring

---

**Design Document Version**: 1.0  
**Last Updated**: 2025-10-07  
**Status**: Ready for Implementation


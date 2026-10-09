# Project Intelligence — Delivery & Requirement Intelligence System

**Project Intelligence** is a project-aware requirements intelligence desktop platform that converts unstructured business inputs (call transcripts, meeting recordings, documents, emails) into structured, reviewable Jira Epics, Stories, Tasks, and Bugs while continuously maintaining module- and Epic-level persistent context.

---

## 🛠 Tech Stack

- **Desktop Shell**: [Tauri v2](https://tauri.app) (Rust Backend + OS Webview)
- **Frontend**: [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org), [Vite 8](https://vitejs.dev), [Lucide React](https://lucide.dev)
- **Design System**: Atlassian/Jira enterprise design language with custom CSS tokens (dark/light themes, elevation, status tags, pill badges)
- **Persistence**: Local [SQLite](https://sqlite.org) (`rusqlite`) for offline-first authoritative local data
- **Security**: OS Secure Credential Storage via `keyring` (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- **Jira Integration**: OAuth 2.0 PKCE 3LO with Atlassian Document Format (ADF) schema generator
- **AI / Copilot**: GitHub Copilot SDK scaffolding & LLM context synthesis pipeline

---

## 🚀 Key Modules & Capabilities

1. **Jira Project Explorer**
   - Projects, Boards, and Epics hierarchy.
   - Preserves 100% of candidate pool tickets: **Closed tickets are never excluded**.
   - Filters: All, Open, Closed, Requirements, Bugs.
2. **Explicit Context Engine (Build Context)**
   - User-driven Epic selection for predictable token usage and boundaries.
   - Locked setting: `Include closed & completed tickets` (required for regression prevention).
   - Real-time build step progress animation.
3. **Structured Context Store**
   - **Layer A (Source Records)**: Immutable raw tickets, comments, and commit hashes.
   - **Layer B (Derived Intelligence)**: Synthesized Business Rules, Architecture Decisions (ADRs), Dependencies, Known Issues, and Domain Terminology.
   - Context snapshot versioning ($v1, v2, v3\dots$).
4. **Transcript Ingestion & 12-Section Specification Document**
   - Automated timeline decomposition into Epic boundaries (e.g. 90-min call split into Academic Associate, Advising, Exams, Workshops).
   - Intermediate 12-section Requirement Analysis Document prior to ticket drafting.
5. **Ticket Candidate Review & Duplicate Detection**
   - Bug vs. Story classification.
   - Explicit distinction: **Confirmed from Source** vs. **Inferred by AI**.
   - Semantic duplicate and regression detection (e.g., duplicate warning with ISB-4147 89% similarity).
   - Human approval workflow $\rightarrow$ Direct creation in Jira with audit trail.

---

## 💻 Running the Application

### 1. Web Console (Dev Server)
```powershell
cd C:\Users\202328\.gemini\antigravity-ide\scratch\project-intelligence
npm run dev
```
Open [http://localhost:1420](http://localhost:1420) in your browser.

### 2. Desktop Native App (Tauri)
```powershell
npm run tauri dev
```
*Note: Compiling the native Windows desktop binary with Rust requires Microsoft Visual C++ Build Tools (`link.exe`).*

## Publish as a Web App

The repository includes a Render Blueprint. To publish it, connect the GitHub repository to Render and create a Blueprint instance from `render.yaml`. Render builds the Vite frontend and starts the Node web server, which serves the app and its API routes from the same origin. Subsequent pushes to `main` deploy automatically.

The hosted app keeps Jira credentials only in the current browser tab's session storage. Copilot credentials, chat history, drafts, and context are stored in local storage under a namespace derived from the verified Jira site and account ID. These values do not sync between browsers or devices. Sign out before handing a shared browser to someone else; browser storage is not a server-side account vault and remains accessible to someone using that same browser profile. The production Jira proxy only accepts HTTPS Jira Cloud API v3 requests on `*.atlassian.net`; custom Jira domains are not currently supported. Render's free service may sleep when idle and take a little longer to respond on the first visit.

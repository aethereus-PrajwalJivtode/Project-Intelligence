import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';
import { extname, resolve, sep } from 'node:path';
import { Pool } from 'pg';
import {
  buildEpicContextViaCopilotSdk,
  executeCopilotViaNode,
  fetchCopilotModels,
  type CopilotAgentRequest,
  type CopilotContextBuildRequest,
} from '../src/server/copilotSdkBackend';

const distDirectory = resolve(process.cwd(), 'dist');
const maxBodyBytes = 12 * 1024 * 1024;
const chatHistoryPool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let chatHistorySchemaReady: Promise<void> | null = null;

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function sendJson(res: ServerResponse, statusCode: number, value: unknown): void {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > maxBodyBytes) throw new HttpError(413, 'Request body is too large.');
    chunks.push(data);
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'Expected a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON request body.');
  }
}

function validJiraTarget(target: URL): boolean {
  const labels = target.hostname.toLowerCase().split('.');
  return target.protocol === 'https:'
    && !target.username
    && !target.password
    && (!target.port || target.port === '443')
    && labels.length >= 3
    && labels.slice(-2).join('.') === 'atlassian.net'
    && labels.slice(0, -2).every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    && /^\/rest\/api\/3\//.test(target.pathname);
}

function validJiraDomain(domain: string): boolean {
  const labels = domain.toLowerCase().split('.');
  return labels.length >= 3
    && labels.slice(-2).join('.') === 'atlassian.net'
    && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

async function ensureChatHistorySchema(): Promise<void> {
  if (!chatHistoryPool) {
    throw new HttpError(503, 'Cloud chat history is not configured. Set DATABASE_URL on the server.');
  }
  chatHistorySchemaReady ??= chatHistoryPool.query(`
    CREATE TABLE IF NOT EXISTS copilot_chat_sessions (
      jira_domain TEXT NOT NULL,
      jira_account_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_data JSONB,
      updated_at TIMESTAMPTZ NOT NULL,
      deleted_at TIMESTAMPTZ,
      PRIMARY KEY (jira_domain, jira_account_id, session_id)
    )
  `).then(() => undefined).catch((error: unknown) => {
    chatHistorySchemaReady = null;
    throw error;
  });
  await chatHistorySchemaReady;
}

async function verifyJiraAccount(req: IncomingMessage): Promise<{ domain: string; accountId: string }> {
  const authorization = req.headers.authorization || '';
  const domain = String(req.headers['x-jira-domain'] || '').trim().toLowerCase();
  if (!/^Basic\s+\S+$/i.test(authorization) || !validJiraDomain(domain)) {
    throw new HttpError(401, 'Valid Jira Cloud credentials are required.');
  }

  let response: Response;
  try {
    response = await fetch(`https://${domain}/rest/api/3/myself`, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, 'Could not verify the Jira account for chat history.');
  }
  if (!response.ok) throw new HttpError(401, 'Jira credentials could not be verified.');

  const profile = await response.json() as { accountId?: unknown };
  if (typeof profile.accountId !== 'string' || !profile.accountId) {
    throw new HttpError(502, 'Jira did not return an account identity.');
  }
  return { domain, accountId: profile.accountId };
}

function validateChatSessions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 200) {
    throw new HttpError(400, 'Expected at most 200 chat sessions.');
  }
  return value.map((session) => {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw new HttpError(400, 'Invalid chat session.');
    }
    const candidate = session as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0 || candidate.id.length > 160
      || typeof candidate.title !== 'string' || candidate.title.length > 300
      || typeof candidate.updated_at !== 'string' || !Number.isFinite(Date.parse(candidate.updated_at))
      || !Array.isArray(candidate.messages) || candidate.messages.length > 500) {
      throw new HttpError(400, 'Invalid chat session fields.');
    }
    return candidate;
  });
}

async function handleChatHistory(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  await ensureChatHistorySchema();
  const { domain, accountId } = await verifyJiraAccount(req);
  const pool = chatHistoryPool!;

  if (pathname === '/api/chat-sessions' && req.method === 'GET') {
    const result = await pool.query(
      `SELECT session_id, session_data, deleted_at
       FROM copilot_chat_sessions
       WHERE jira_domain = $1 AND jira_account_id = $2`,
      [domain, accountId],
    );
    sendJson(res, 200, {
      sessions: result.rows.filter((row) => row.deleted_at === null).map((row) => row.session_data),
      deleted: result.rows
        .filter((row) => row.deleted_at !== null)
        .map((row) => ({ id: row.session_id, deletedAt: new Date(row.deleted_at).toISOString() })),
    });
    return;
  }

  if (pathname === '/api/chat-sessions' && req.method === 'PUT') {
    const body = await readJson(req);
    const sessions = validateChatSessions(body.sessions);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const session of sessions) {
        await client.query(
          `INSERT INTO copilot_chat_sessions
             (jira_domain, jira_account_id, session_id, session_data, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, NULL)
           ON CONFLICT (jira_domain, jira_account_id, session_id) DO UPDATE
             SET session_data = EXCLUDED.session_data,
                 updated_at = EXCLUDED.updated_at
           WHERE copilot_chat_sessions.deleted_at IS NULL
             AND EXCLUDED.updated_at > copilot_chat_sessions.updated_at`,
          [domain, accountId, session.id, JSON.stringify(session), session.updated_at],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    sendJson(res, 200, { saved: sessions.length });
    return;
  }

  const deleteMatch = pathname.match(/^\/api\/chat-sessions\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    let sessionId: string;
    try {
      sessionId = decodeURIComponent(deleteMatch[1]);
    } catch {
      throw new HttpError(400, 'Invalid chat session ID.');
    }
    await pool.query(
      `INSERT INTO copilot_chat_sessions
         (jira_domain, jira_account_id, session_id, session_data, updated_at, deleted_at)
       VALUES ($1, $2, $3, NULL, NOW(), NOW())
       ON CONFLICT (jira_domain, jira_account_id, session_id) DO UPDATE
         SET session_data = NULL, updated_at = NOW(), deleted_at = NOW()`,
      [domain, accountId, sessionId],
    );
    sendJson(res, 200, { deleted: true });
    return;
  }

  throw new HttpError(405, 'Method not allowed.');
}

function proxyJira(req: IncomingMessage, res: ServerResponse, target: URL): void {
  const method = req.method || 'GET';
  if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method)) {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const authorization = req.headers.authorization || req.headers['x-jira-auth'];
  if (!authorization) {
    sendJson(res, 401, { error: 'Jira authorization is required.' });
    return;
  }

  const headers: Record<string, string> = {
    Accept: String(req.headers.accept || 'application/json'),
    Authorization: String(authorization),
    'User-Agent': 'Project-Intelligence-Web/1.0',
  };
  if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);

  const upstream = https.request({
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method,
    headers,
    rejectUnauthorized: true,
    timeout: 30_000,
  }, (upstreamResponse) => {
    const statusCode = upstreamResponse.statusCode || 502;
    if (statusCode >= 300 && statusCode < 400) {
      upstreamResponse.resume();
      sendJson(res, 502, { error: 'Jira returned an unexpected redirect.' });
      return;
    }

    res.writeHead(statusCode, {
      'Cache-Control': 'no-store',
      'Content-Type': upstreamResponse.headers['content-type'] || 'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    upstreamResponse.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('Jira request timed out.')));
  upstream.on('error', (error) => {
    console.error('[Jira proxy]', error.message);
    if (!res.headersSent) sendJson(res, 502, { error: 'Could not connect to Jira Cloud.' });
  });

  if (method === 'GET' || method === 'HEAD') upstream.end();
  else req.pipe(upstream);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, search: string): Promise<void> {
  if (pathname === '/api/chat-sessions' || pathname.startsWith('/api/chat-sessions/')) {
    await handleChatHistory(req, res, pathname);
    return;
  }

  if (pathname === '/api/copilot-models') {
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    if (!token) throw new HttpError(401, 'GitHub token is required.');
    sendJson(res, 200, await fetchCopilotModels(token));
    return;
  }

  if (pathname === '/api/jira-proxy') {
    const targetValue = new URLSearchParams(search).get('target');
    if (!targetValue) throw new HttpError(400, 'Missing Jira target.');
    let target: URL;
    try {
      target = new URL(targetValue);
    } catch {
      throw new HttpError(400, 'Invalid Jira target.');
    }
    if (!validJiraTarget(target)) throw new HttpError(403, 'Only Jira Cloud REST API v3 endpoints are allowed.');
    proxyJira(req, res, target);
    return;
  }

  if (pathname === '/api/copilot-context' || pathname === '/api/copilot-sdk') {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const body = await readJson(req);

    if (pathname === '/api/copilot-context') {
      const context = await buildEpicContextViaCopilotSdk(body as unknown as CopilotContextBuildRequest);
      sendJson(res, 200, context);
      return;
    }

    if (typeof body.prompt !== 'string' || typeof body.gitHubToken !== 'string' || !body.gitHubToken) {
      throw new HttpError(400, 'A prompt and GitHub token are required.');
    }
    const result = await executeCopilotViaNode(body as unknown as CopilotAgentRequest);
    if (!result || 'error' in result) throw new HttpError(502, 'Copilot could not generate a response.');
    sendJson(res, 200, result);
    return;
  }

  throw new HttpError(404, 'API route not found.');
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  return types[extname(path).toLowerCase()] || 'application/octet-stream';
}

async function serveFile(res: ServerResponse, pathname: string, method: string): Promise<void> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Invalid URL path.');
  }

  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html';
  let filePath = resolve(distDirectory, relativePath);
  if (filePath !== distDirectory && !filePath.startsWith(`${distDirectory}${sep}`)) {
    throw new HttpError(403, 'Forbidden.');
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
  } catch {
    filePath = resolve(distDirectory, 'index.html');
  }

  res.writeHead(200, {
    'Cache-Control': filePath.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': (await fs.stat(filePath)).size,
    'Content-Type': contentType(filePath),
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') res.end();
  else createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  try {
    if (requestUrl.pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, requestUrl.pathname, requestUrl.search);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'Method not allowed.');
    }
    await serveFile(res, requestUrl.pathname, req.method);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    const statusCode = error instanceof HttpError ? error.statusCode : 502;
    if (!(error instanceof HttpError)) console.error('[Web API]', error);
    sendJson(res, statusCode, { error: error instanceof HttpError ? error.message : 'The request could not be completed.' });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Project Intelligence web server listening on ${port}`);
});
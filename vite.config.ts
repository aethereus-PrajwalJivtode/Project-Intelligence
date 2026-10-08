import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import https from "node:https";
import http from "node:http";
import { buildEpicContextViaCopilotSdk, executeCopilotViaNode, fetchCopilotModels } from "./src/server/copilotSdkBackend";

const host = process.env.TAURI_DEV_HOST;
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: "copilot-sdk-agent",
      configureServer(server) {
        server.middlewares.use("/api/copilot-context", (req, res) => {
          if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            res.end();
            return;
          }

          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          let bodyStr = "";
          req.on("data", (chunk) => {
            bodyStr += chunk;
          });
          req.on("end", async () => {
            try {
              const body = JSON.parse(bodyStr || "{}");
              const context = await buildEpicContextViaCopilotSdk(body);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify(context));
            } catch (err: any) {
              console.error("[Copilot Epic Context Error]", err);
              res.statusCode = err.message?.includes("token is required") ? 400 : 502;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ error: err.message || "Failed to build epic context with Copilot SDK." }));
            }
          });
        });

        server.middlewares.use("/api/copilot-sdk", (req, res) => {
          if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.end();
            return;
          }

          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          let bodyStr = "";
          req.on("data", (chunk) => {
            bodyStr += chunk;
          });
          req.on("end", async () => {
            try {
              const body = JSON.parse(bodyStr || "{}");
              const { prompt, gitHubToken, projectKey, projectName, epicName, knownEpics, epicSearchIndex, attachments, conversationHistory, model, epicContext } = body;

              // Step 1: Attempt GitHub Copilot via SDK / Node HTTP
              let result = null;
              if (gitHubToken) {
                result = await executeCopilotViaNode({
                  prompt,
                  gitHubToken,
                  projectKey: projectKey || "ISB",
                  projectName: projectName || "ISB Platform",
                  epicName: epicName || "General",
                  knownEpics: knownEpics || [],
                  epicSearchIndex: epicSearchIndex || [],
                  attachments: Array.isArray(attachments) ? attachments : [],
                  conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
                  model,
                  epicContext,
                });
              }

              // Step 2: If live Copilot call was unavailable or token invalid, return an error
              if (!result || (result as any).error) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(JSON.stringify({ error: (result as any)?.error || "Copilot SDK failed to generate a response. Please verify your token." }));
                return;
              }
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify(result));
            } catch (err: any) {
              console.error("[Copilot SDK Agent Server Error]", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        });

        server.middlewares.use("/api/copilot-models", async (req, res) => {
          if (req.method === "OPTIONS") {
            res.statusCode = 200;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
            res.end();
            return;
          }

          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          const token = req.headers["authorization"]?.split(" ")[1] || "";
          
          try {
            const models = await fetchCopilotModels(token);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(models));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      },
    },
    {
      name: "jira-cors-proxy",
      configureServer(server) {
        server.middlewares.use("/api/jira-proxy", (req, res) => {
          try {
            const urlObj = new URL(req.url || "", "http://localhost:1420");
            const target = urlObj.searchParams.get("target");
            if (!target) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing ?target query parameter" }));
              return;
            }

            const targetParsed = new URL(target);
            const isHttps = targetParsed.protocol === "https:";
            const client = isHttps ? https : http;

            const headers: Record<string, string> = {
              "Accept": "application/json",
              "User-Agent": "Project-Intelligence-Desktop/1.0",
              "Host": targetParsed.host,
            };

            const incomingAuth = req.headers["authorization"] || req.headers["x-jira-auth"];
            if (incomingAuth) {
              headers["Authorization"] = String(incomingAuth);
            }
            if (req.headers["content-type"]) {
              headers["Content-Type"] = String(req.headers["content-type"]);
            }

            const requestOptions: https.RequestOptions = {
              hostname: targetParsed.hostname,
              port: targetParsed.port || (isHttps ? 443 : 80),
              path: targetParsed.pathname + targetParsed.search,
              method: req.method || "GET",
              headers,
              agent: isHttps ? insecureHttpsAgent : undefined,
            };

            const proxyReq = client.request(requestOptions, (proxyRes) => {
              res.statusCode = proxyRes.statusCode || 200;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Headers", "*");
              res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
              if (proxyRes.headers["content-type"]) {
                res.setHeader("Content-Type", proxyRes.headers["content-type"]);
              }

              proxyRes.pipe(res);
            });

            proxyReq.on("error", (err) => {
              console.error("[Jira Proxy Error]", err.message);
              if (!res.headersSent) {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(JSON.stringify({ error: "Proxy connection failure", details: err.message }));
              }
            });

            // Handle preflight
            if (req.method === "OPTIONS") {
              res.statusCode = 200;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Access-Control-Allow-Headers", "*");
              res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
              res.end();
              return;
            }

            // Pipe request body if POST / PUT
            if (req.method !== "GET" && req.method !== "HEAD") {
              req.pipe(proxyReq);
            } else {
              proxyReq.end();
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[Jira Proxy Middleware Error]", message);
            if (!res.headersSent) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ error: "Proxy failure", details: message }));
            }
          }
        });
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

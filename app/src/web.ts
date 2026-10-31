import { NextFunction, Request, Response } from "express";
import { TokenSummary } from "./identity";

// Configuration comes entirely from the environment (12-factor). App Service
// sets these as app settings - see 6-app-service.tf.
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`the environment variable ${name} must be set`);
  }
  return value;
}

// Terraform hands over the namespace's endpoint URL ("https://<name>.servicebus.windows.net:443/");
// the Service Bus client wants just its hostname.
export function servicebusHostname(): string {
  return new URL(required("SERVICEBUS_ENDPOINT")).hostname;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTokenSummary(title: string, summary: TokenSummary | Error): string {
  if (summary instanceof Error) {
    return `<section class="token"><h2>${escapeHtml(title)}</h2><p class="error">${escapeHtml(summary.message)}</p></section>`;
  }
  const rows: [string, string][] = [
    ["Audience (aud)", summary.audience],
    ["Issuer (iss)", summary.issuer],
    ["Object ID (oid)", summary.objectId],
    ["App ID (appid)", summary.appId],
    ["Expires (exp)", summary.expiresAt],
  ];
  return `<section class="token">
    <h2>${escapeHtml(title)}</h2>
    <dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd><code>${escapeHtml(v)}</code></dd>`).join("")}</dl>
  </section>`;
}

export function renderPage(title: string, body: string, refreshSeconds?: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ""}
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
    form.send { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    form.send input { flex: 1; padding: 0.4rem; }
    .flow { color: #555; }
    .notice { background: #eef7ee; border: 1px solid #9c9; padding: 0.5rem 0.75rem; }
    .error { background: #fbeeee; border: 1px solid #c99; padding: 0.5rem 0.75rem; }
    section.token { margin-top: 2rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    dt { color: #666; }
    dd { margin: 0; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; padding: 0.4rem; border-bottom: 1px solid #ddd; vertical-align: top; }
    td small { color: #666; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

// Express 4 doesn't forward rejected promises from async handlers, so route
// any error to the error handler.
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
export const handle = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  res.status(500).send("Internal Server Error");
}

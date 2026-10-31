import type { AccessToken, TokenCredential } from "@azure/core-auth";

// ---------------------------------------------------------------------------
// The App Service managed identity endpoint.
//
// App Service injects two environment variables into every container whose
// web app has a managed identity:
//
//   IDENTITY_ENDPOINT - a local URL that issues Entra access tokens for it.
//   IDENTITY_HEADER   - a secret that must accompany each request, which proves
//                       the caller is running inside the container (it guards
//                       against server-side request forgery).
//
// DefaultAzureCredential from @azure/identity does exactly this under the hood.
// It's spelled out here instead so the whole hop is visible: one HTTP GET, and
// back comes a token for the requested resource.
// ---------------------------------------------------------------------------
const IDENTITY_API_VERSION = "2019-08-01";

interface IdentityEndpointResponse {
  access_token: string;
  // Seconds since the Unix epoch, as a string.
  expires_on: string;
  resource: string;
  token_type: string;
  client_id: string;
}

export class ManagedIdentityEndpointCredential implements TokenCredential {
  private readonly endpoint: string;
  private readonly secret: string;
  private readonly cache = new Map<string, AccessToken>();

  // clientId selects which of the web app's user-assigned identities the token
  // is issued for; a web app can have several attached.
  constructor(private readonly clientId?: string) {
    const endpoint = process.env.IDENTITY_ENDPOINT;
    const secret = process.env.IDENTITY_HEADER;
    if (!endpoint || !secret) {
      throw new Error(
        "IDENTITY_ENDPOINT and IDENTITY_HEADER are not set - is this running in an App Service with a managed identity?",
      );
    }
    this.endpoint = endpoint;
    this.secret = secret;
  }

  // The Azure SDKs ask for tokens by scope ("https://servicebus.azure.net/.default");
  // the identity endpoint takes the resource the scope belongs to.
  async getToken(scopes: string | string[]): Promise<AccessToken> {
    const scope = Array.isArray(scopes) ? scopes[0] : scopes;
    const resource = scope.replace(/\/\.default$/, "");

    // Reuse a cached token until five minutes before it expires, so this isn't
    // a round trip for every operation.
    const cached = this.cache.get(resource);
    if (cached && cached.expiresOnTimestamp - Date.now() > 5 * 60 * 1000) {
      return cached;
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("api-version", IDENTITY_API_VERSION);
    url.searchParams.set("resource", resource);
    if (this.clientId) {
      url.searchParams.set("client_id", this.clientId);
    }

    const response = await fetch(url, {
      headers: { "X-IDENTITY-HEADER": this.secret },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(
        `managed identity endpoint returned ${response.status} for resource ${resource}: ${await response.text()}`,
      );
    }
    const body = (await response.json()) as IdentityEndpointResponse;
    const token: AccessToken = {
      token: body.access_token,
      expiresOnTimestamp: Number(body.expires_on) * 1000,
    };
    this.cache.set(resource, token);
    return token;
  }
}

// The claims shown on each app's page - enough to see who the token was issued
// to, by whom, and for what, without printing the token itself (it's a bearer
// credential: anyone holding it can use it until it expires).
export interface TokenSummary {
  audience: string;
  issuer: string;
  objectId: string;
  appId: string;
  expiresAt: string;
}

export function summariseToken(token: string): TokenSummary {
  // A JWT is header.payload.signature; the payload is base64url-encoded JSON.
  // Decoding it doesn't verify it - that's the receiving service's job.
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return {
    audience: String(payload.aud ?? ""),
    issuer: String(payload.iss ?? ""),
    objectId: String(payload.oid ?? ""),
    appId: String(payload.appid ?? payload.azp ?? ""),
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : "",
  };
}

// The resources (audiences) each service accepts Entra access tokens for.
export const SERVICEBUS_SCOPE = "https://servicebus.azure.net/.default";
export const STORAGE_SCOPE = "https://storage.azure.com/.default";

import { Agent, fetch as undiciFetch } from "undici";

export interface UnifiClientConfig {
  /** Base URL of the UniFi OS console, e.g. https://192.168.1.1 */
  host: string;
  /** API key generated in UniFi OS: Settings > Control Plane > Integrations */
  apiKey: string;
  /** Default site name (the short "name" field, not the friendly desc). Defaults to "default". */
  defaultSite?: string;
  /** Allow self-signed certificates, common on local UniFi OS consoles. */
  allowInsecureTls?: boolean;
}

export class UnifiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "UnifiApiError";
  }
}

/**
 * Thin client for the UniFi OS local Network application API
 * (`/proxy/network/api/...`), authenticated with a UniFi OS API key
 * instead of a session cookie.
 */
export class UnifiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultSite: string;
  private readonly agent: Agent;

  constructor(config: UnifiClientConfig) {
    this.baseUrl = config.host.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultSite = config.defaultSite ?? "default";
    this.agent = new Agent({
      connect: { rejectUnauthorized: !config.allowInsecureTls },
    });
  }

  resolveSite(site?: string): string {
    return site && site.trim().length > 0 ? site : this.defaultSite;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await undiciFetch(url, {
      method,
      headers: {
        "X-API-KEY": this.apiKey,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: this.agent,
    });

    const text = await res.text();
    const data = text.length > 0 ? safeJsonParse(text) : undefined;

    if (!res.ok) {
      throw new UnifiApiError(
        `UniFi API request failed: ${method} ${path} -> ${res.status} ${res.statusText}`,
        res.status,
        data,
      );
    }

    return data as T;
  }

  // ---- Sites & devices --------------------------------------------------

  async listSites(): Promise<unknown[]> {
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      "/proxy/network/api/self/sites",
    );
    return data.data;
  }

  async listDevices(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/device`,
    );
    return data.data;
  }

  async getDevice(mac: string, site?: string): Promise<unknown> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/device/${encodeURIComponent(mac)}`,
    );
    return data.data?.[0] ?? null;
  }

  // ---- Clients ------------------------------------------------------------

  async listActiveClients(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/sta`,
    );
    return data.data;
  }

  async listKnownClients(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/rest/user`,
    );
    return data.data;
  }

  async clientCommand(
    cmd: "block-sta" | "unblock-sta" | "kick-sta",
    mac: string,
    site?: string,
  ): Promise<unknown> {
    const s = this.resolveSite(site);
    return this.request(
      "POST",
      `/proxy/network/api/s/${encodeURIComponent(s)}/cmd/stamgr`,
      { cmd, mac: mac.toLowerCase() },
    );
  }

  // ---- Network config -----------------------------------------------------

  async listNetworks(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/rest/networkconf`,
    );
    return data.data;
  }

  async listWlans(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/rest/wlanconf`,
    );
    return data.data;
  }

  async listPortForwards(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/rest/portforward`,
    );
    return data.data;
  }

  async listFirewallRules(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/rest/firewallrule`,
    );
    return data.data;
  }

  // ---- Stats & alerts -------------------------------------------------------

  async getSiteHealth(site?: string): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "GET",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/health`,
    );
    return data.data;
  }

  async listEvents(site?: string, limit = 50): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "POST",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/event`,
      { _limit: limit },
    );
    return data.data;
  }

  async listAlerts(site?: string, archived = false, limit = 50): Promise<unknown[]> {
    const s = this.resolveSite(site);
    const data = await this.request<{ data: unknown[] }>(
      "POST",
      `/proxy/network/api/s/${encodeURIComponent(s)}/stat/alarm`,
      { archived, _limit: limit },
    );
    return data.data;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

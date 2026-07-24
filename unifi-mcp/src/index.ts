#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UnifiClient } from "./unifi-client.js";
import { registerUnifiTools } from "./tools.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function main() {
  const host = requireEnv("UNIFI_HOST");
  const apiKey = requireEnv("UNIFI_API_KEY");
  const defaultSite = process.env.UNIFI_DEFAULT_SITE;
  const allowInsecureTls = process.env.UNIFI_ALLOW_INSECURE_TLS === "true";

  const client = new UnifiClient({ host, apiKey, defaultSite, allowInsecureTls });

  const server = new McpServer({
    name: "unifi-mcp",
    version: "0.1.0",
  });

  registerUnifiTools(server, client);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start unifi-mcp server:", err);
    process.exit(1);
  });
}

main();

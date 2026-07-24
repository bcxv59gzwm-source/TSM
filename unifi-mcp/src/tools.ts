import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UnifiClient } from "./unifi-client.js";

const siteParam = z
  .string()
  .optional()
  .describe(
    "UniFi site short name (the internal 'name' field from list_sites, not the friendly description). Omit to use the server's configured default site.",
  );

function json(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function jsonError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function registerUnifiTools(server: McpServer, client: UnifiClient): void {
  // ---- Sites & devices ----------------------------------------------------

  server.registerTool(
    "list_sites",
    {
      title: "List UniFi sites",
      description:
        "List every site managed by this UniFi controller, including each site's internal name and friendly description.",
      inputSchema: {},
    },
    async () => {
      try {
        return json(await client.listSites());
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_devices",
    {
      title: "List UniFi devices",
      description:
        "List UniFi network devices (access points, switches, gateways) adopted on a site, with status, model, and uptime.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.listDevices(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "get_device",
    {
      title: "Get UniFi device details",
      description: "Get full details for a single UniFi device by its MAC address.",
      inputSchema: {
        mac: z.string().describe("Device MAC address"),
        site: siteParam,
      },
    },
    async ({ mac, site }) => {
      try {
        return json(await client.getDevice(mac, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  // ---- Clients --------------------------------------------------------------

  server.registerTool(
    "list_clients",
    {
      title: "List UniFi clients",
      description:
        "List clients on a site. By default returns currently active (connected) clients; set known_only to list all previously seen/named clients instead, including their block status.",
      inputSchema: {
        site: siteParam,
        known_only: z
          .boolean()
          .optional()
          .describe("If true, list all known clients instead of only currently active ones."),
      },
    },
    async ({ site, known_only }) => {
      try {
        const clients = known_only
          ? await client.listKnownClients(site)
          : await client.listActiveClients(site);
        return json(clients);
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "block_client",
    {
      title: "Block UniFi client",
      description: "Block a client (by MAC address) from connecting to the network.",
      inputSchema: { mac: z.string().describe("Client MAC address"), site: siteParam },
    },
    async ({ mac, site }) => {
      try {
        return json(await client.clientCommand("block-sta", mac, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "unblock_client",
    {
      title: "Unblock UniFi client",
      description: "Remove a network block on a client (by MAC address).",
      inputSchema: { mac: z.string().describe("Client MAC address"), site: siteParam },
    },
    async ({ mac, site }) => {
      try {
        return json(await client.clientCommand("unblock-sta", mac, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "reconnect_client",
    {
      title: "Reconnect (kick) UniFi client",
      description:
        "Force a connected client (by MAC address) to disconnect and reconnect, e.g. to apply a new config or resolve a stuck session.",
      inputSchema: { mac: z.string().describe("Client MAC address"), site: siteParam },
    },
    async ({ mac, site }) => {
      try {
        return json(await client.clientCommand("kick-sta", mac, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  // ---- Network config ---------------------------------------------------------

  server.registerTool(
    "list_networks",
    {
      title: "List UniFi networks/VLANs",
      description: "List configured networks (LANs/VLANs) on a site.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.listNetworks(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_wlans",
    {
      title: "List UniFi WLANs",
      description: "List configured wireless networks (SSIDs) on a site.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.listWlans(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_port_forwards",
    {
      title: "List UniFi port forwarding rules",
      description: "List configured port forwarding rules on a site.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.listPortForwards(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_firewall_rules",
    {
      title: "List UniFi firewall rules",
      description: "List configured firewall rules on a site.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.listFirewallRules(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  // ---- Stats & alerts --------------------------------------------------------

  server.registerTool(
    "get_site_health",
    {
      title: "Get UniFi site health/stats",
      description:
        "Get per-subsystem health summary for a site (WAN, WLAN, LAN, VPN), including status and throughput.",
      inputSchema: { site: siteParam },
    },
    async ({ site }) => {
      try {
        return json(await client.getSiteHealth(site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_events",
    {
      title: "List UniFi events",
      description: "List recent events on a site (client connections, device changes, admin actions, etc).",
      inputSchema: {
        site: siteParam,
        limit: z.number().int().positive().max(500).optional().describe("Max events to return (default 50)"),
      },
    },
    async ({ site, limit }) => {
      try {
        return json(await client.listEvents(site, limit));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "list_alerts",
    {
      title: "List UniFi alerts",
      description: "List alerts/alarms on a site, such as device offline or rogue AP detected.",
      inputSchema: {
        site: siteParam,
        archived: z.boolean().optional().describe("Include archived (acknowledged) alerts. Default false."),
        limit: z.number().int().positive().max(500).optional().describe("Max alerts to return (default 50)"),
      },
    },
    async ({ site, archived, limit }) => {
      try {
        return json(await client.listAlerts(site, archived, limit));
      } catch (err) {
        return jsonError(err);
      }
    },
  );
}

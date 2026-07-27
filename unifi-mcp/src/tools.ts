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

  const configParam = z
    .record(z.string(), z.unknown())
    .describe(
      "Raw UniFi config object for this resource. Field names/shapes are undocumented by Ubiquiti and version-dependent — call the matching list_* tool first and use an existing entry (or the site's default entry) as a template, then adjust only the fields you want to change.",
    );
  const idParam = z.string().describe("The resource's `_id` field, from the matching list_* tool.");

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
    "create_network",
    {
      title: "Create UniFi network/VLAN",
      description:
        "Create a new network (LAN/VLAN) on a site. Call list_networks first and base the config on an existing entry's shape (e.g. purpose, vlan, ip_subnet, dhcpd_* fields).",
      inputSchema: { config: configParam, site: siteParam },
    },
    async ({ config, site }) => {
      try {
        return json(await client.createNetwork(config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "update_network",
    {
      title: "Update UniFi network/VLAN",
      description:
        "Update an existing network (LAN/VLAN) by _id. Fetch the current object via list_networks, modify only the fields you want changed, and pass the full merged object back.",
      inputSchema: { id: idParam, config: configParam, site: siteParam },
    },
    async ({ id, config, site }) => {
      try {
        return json(await client.updateNetwork(id, config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "delete_network",
    {
      title: "Delete UniFi network/VLAN",
      description: "Delete a network (LAN/VLAN) by _id. This is destructive and disconnects any clients on it.",
      inputSchema: { id: idParam, site: siteParam },
    },
    async ({ id, site }) => {
      try {
        return json(await client.deleteNetwork(id, site));
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
    "create_wlan",
    {
      title: "Create UniFi WLAN",
      description:
        "Create a new wireless network (SSID) on a site. Call list_wlans first and base the config on an existing entry's shape (e.g. name, security, wpa_mode, x_passphrase, networkconf_id, enabled).",
      inputSchema: { config: configParam, site: siteParam },
    },
    async ({ config, site }) => {
      try {
        return json(await client.createWlan(config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "update_wlan",
    {
      title: "Update UniFi WLAN",
      description:
        "Update an existing wireless network (SSID) by _id. Fetch the current object via list_wlans, modify only the fields you want changed, and pass the full merged object back.",
      inputSchema: { id: idParam, config: configParam, site: siteParam },
    },
    async ({ id, config, site }) => {
      try {
        return json(await client.updateWlan(id, config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "delete_wlan",
    {
      title: "Delete UniFi WLAN",
      description: "Delete a wireless network (SSID) by _id. This is destructive and disconnects any clients on it.",
      inputSchema: { id: idParam, site: siteParam },
    },
    async ({ id, site }) => {
      try {
        return json(await client.deleteWlan(id, site));
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
    "create_port_forward",
    {
      title: "Create UniFi port forwarding rule",
      description:
        "Create a new port forwarding rule on a site. Call list_port_forwards first and base the config on an existing entry's shape (e.g. name, fwd, fwd_port, dst_port, proto, src, enabled).",
      inputSchema: { config: configParam, site: siteParam },
    },
    async ({ config, site }) => {
      try {
        return json(await client.createPortForward(config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "update_port_forward",
    {
      title: "Update UniFi port forwarding rule",
      description:
        "Update an existing port forwarding rule by _id. Fetch the current object via list_port_forwards, modify only the fields you want changed, and pass the full merged object back.",
      inputSchema: { id: idParam, config: configParam, site: siteParam },
    },
    async ({ id, config, site }) => {
      try {
        return json(await client.updatePortForward(id, config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "delete_port_forward",
    {
      title: "Delete UniFi port forwarding rule",
      description: "Delete a port forwarding rule by _id.",
      inputSchema: { id: idParam, site: siteParam },
    },
    async ({ id, site }) => {
      try {
        return json(await client.deletePortForward(id, site));
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

  server.registerTool(
    "create_firewall_rule",
    {
      title: "Create UniFi firewall rule",
      description:
        "Create a new firewall rule on a site. Call list_firewall_rules first and base the config on an existing entry's shape (e.g. name, action, ruleset, protocol, src_address, dst_address, enabled). Firewall rule order matters on UniFi — check existing rule_index values.",
      inputSchema: { config: configParam, site: siteParam },
    },
    async ({ config, site }) => {
      try {
        return json(await client.createFirewallRule(config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "update_firewall_rule",
    {
      title: "Update UniFi firewall rule",
      description:
        "Update an existing firewall rule by _id. Fetch the current object via list_firewall_rules, modify only the fields you want changed, and pass the full merged object back.",
      inputSchema: { id: idParam, config: configParam, site: siteParam },
    },
    async ({ id, config, site }) => {
      try {
        return json(await client.updateFirewallRule(id, config, site));
      } catch (err) {
        return jsonError(err);
      }
    },
  );

  server.registerTool(
    "delete_firewall_rule",
    {
      title: "Delete UniFi firewall rule",
      description: "Delete a firewall rule by _id.",
      inputSchema: { id: idParam, site: siteParam },
    },
    async ({ id, site }) => {
      try {
        return json(await client.deleteFirewallRule(id, site));
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

# unifi-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes a UniFi Network
controller (sites, devices, clients, network config, and stats/alerts) as
tools an MCP-compatible AI assistant can call.

It talks to the UniFi OS local Network API (`/proxy/network/api/...`) using a
UniFi OS **API key**, so no username/password or session-cookie handling is
required.

## Tools

| Tool | Description |
| --- | --- |
| `list_sites` | List sites on the controller |
| `list_devices` | List adopted devices (APs, switches, gateways) on a site |
| `get_device` | Get details for one device by MAC |
| `list_clients` | List active (or known) clients on a site |
| `block_client` | Block a client by MAC |
| `unblock_client` | Unblock a client by MAC |
| `reconnect_client` | Force-reconnect (kick) a client by MAC |
| `list_networks` / `create_network` / `update_network` / `delete_network` | Manage networks/VLANs on a site |
| `list_wlans` / `create_wlan` / `update_wlan` / `delete_wlan` | Manage wireless networks (SSIDs) on a site |
| `list_port_forwards` / `create_port_forward` / `update_port_forward` / `delete_port_forward` | Manage port forwarding rules on a site |
| `list_firewall_rules` / `create_firewall_rule` / `update_firewall_rule` / `delete_firewall_rule` | Manage firewall rules on a site |
| `get_site_health` | Get per-subsystem health/stats for a site |
| `list_events` | List recent events on a site |
| `list_alerts` | List alerts/alarms on a site |

Every tool except `list_sites` accepts an optional `site` parameter (the
site's internal short name from `list_sites`, not its friendly description).
When omitted, the server falls back to `UNIFI_DEFAULT_SITE` (or `"default"`).

The `create_*`/`update_*` tools take a `config` object of raw UniFi fields.
Ubiquiti doesn't publish a schema for these — the intended flow is: call the
matching `list_*` tool, use an existing entry as a template, and adjust only
the fields that need to change.

## Setup

1. On the UniFi OS console, go to **Settings > Control Plane >
   Integrations** and create an API key.
2. Copy `.env.example` to `.env` and fill in `UNIFI_HOST` and
   `UNIFI_API_KEY`. Most local consoles use a self-signed certificate — set
   `UNIFI_ALLOW_INSECURE_TLS=true` if you're connecting directly to the
   console's IP rather than a hostname with a valid certificate.
3. Install dependencies and build:

   ```sh
   npm install
   npm run build
   ```

## Running

The server speaks MCP over stdio, so it's normally launched by an MCP
client rather than run directly. Example config for Claude Desktop /
Claude Code (`claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "unifi": {
      "command": "node",
      "args": ["/absolute/path/to/unifi-mcp/dist/index.js"],
      "env": {
        "UNIFI_HOST": "https://192.168.1.1",
        "UNIFI_API_KEY": "your-api-key",
        "UNIFI_ALLOW_INSECURE_TLS": "true"
      }
    }
  }
}
```

To run it manually for debugging, set the same environment variables and
run `npm start`.

## Notes

- This targets the UniFi OS **local** Network API, which covers VLANs,
  WLANs, port forwarding, and firewall rules — broader than the official
  hosted UniFi Network Integration API, but unofficial/undocumented and
  subject to change between controller versions.
- `block_client` / `unblock_client` / `reconnect_client` and all `create_*` /
  `update_*` / `delete_*` network-config tools mutate live network state; the
  calling assistant should confirm intent before invoking them against a
  production network. `delete_network` / `delete_wlan` disconnect any clients
  on that network/SSID.

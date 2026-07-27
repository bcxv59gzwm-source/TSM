#!/usr/bin/env node
// One-off deterministic script: create a "Guest" VLAN and a firewall rule
// isolating it from the main LAN. No chat model in the loop — this runs
// exactly what's printed below, nothing more, nothing less.
//
// Usage:
//   UNIFI_HOST=https://192.168.1.1 UNIFI_API_KEY=xxx UNIFI_ALLOW_INSECURE_TLS=true \
//     node scripts/create-guest-vlan.mjs
//
// Reads the same env vars as the MCP server itself, so you can copy them
// straight out of your claude_desktop_config.json's "env" block.

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { UnifiClient } from "../dist/unifi-client.js";

const GUEST_NAME = process.env.GUEST_NETWORK_NAME ?? "Guest";
const GUEST_VLAN_ID = Number(process.env.GUEST_VLAN_ID ?? 20);
const GUEST_SUBNET = process.env.GUEST_SUBNET ?? "192.168.20.1/24";
const GUEST_DHCP_START = process.env.GUEST_DHCP_START ?? "192.168.20.6";
const GUEST_DHCP_STOP = process.env.GUEST_DHCP_STOP ?? "192.168.20.254";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function main() {
  const client = new UnifiClient({
    host: requireEnv("UNIFI_HOST"),
    apiKey: requireEnv("UNIFI_API_KEY"),
    defaultSite: process.env.UNIFI_DEFAULT_SITE,
    allowInsecureTls: process.env.UNIFI_ALLOW_INSECURE_TLS === "true",
  });

  console.log("== Step 1: fetch existing networks to use as a template ==");
  const networks = await client.listNetworks();
  console.log(`Found ${networks.length} existing network(s).`);

  const existingGuest = networks.find((n) => n.name === GUEST_NAME);
  if (existingGuest) {
    console.log(`A network named "${GUEST_NAME}" already exists (_id ${existingGuest._id}). Aborting — nothing created.`);
    process.exit(1);
  }

  // Prefer a plain wired "corporate" purpose network as the field-shape
  // template (this is normally the "Default" LAN).
  const template =
    networks.find((n) => n.purpose === "corporate" && !n.vlan_enabled) ??
    networks.find((n) => n.purpose === "corporate") ??
    networks[0];

  if (!template) {
    console.log("No existing network found to use as a template. Aborting — refusing to guess the full schema blind.");
    process.exit(1);
  }
  console.log(`Using "${template.name}" (_id ${template._id}) as the field-shape template.`);

  const newNetwork = {
    ...template,
    name: GUEST_NAME,
    vlan_enabled: true,
    vlan: GUEST_VLAN_ID,
    ip_subnet: GUEST_SUBNET,
    dhcpd_enabled: true,
    dhcpd_start: GUEST_DHCP_START,
    dhcpd_stop: GUEST_DHCP_STOP,
  };
  delete newNetwork._id;
  delete newNetwork.site_id;

  console.log("\nAbout to create this network:");
  console.log(JSON.stringify(newNetwork, null, 2));
  if (!(await confirm("Proceed with creating this network?"))) {
    console.log("Aborted by user. Nothing created.");
    process.exit(1);
  }

  const created = await client.createNetwork(newNetwork);
  console.log("\nCreated network:");
  console.log(JSON.stringify(created, null, 2));
  const newNetworkId = created._id;

  console.log("\n== Step 2: fetch existing firewall rules to use as a template ==");
  const rules = await client.listFirewallRules();
  console.log(`Found ${rules.length} existing firewall rule(s).`);

  const ruleTemplate = rules.find((r) => r.ruleset === "LAN_IN") ?? rules[0];
  if (!ruleTemplate) {
    console.log(
      "\nNo existing firewall rule found to use as a field-shape template. " +
        "Refusing to guess this blind since a malformed or ineffective rule here " +
        "could give a false sense of isolation. Create the isolation rule manually " +
        `instead: block source network "${GUEST_NAME}" -> destination "${template.name}" ` +
        "in Settings > Security > Firewall (ruleset LAN_IN), then verify with a real device.",
    );
    process.exit(1);
  }

  const newRule = {
    ...ruleTemplate,
    name: `Block ${GUEST_NAME} to ${template.name}`,
    ruleset: "LAN_IN",
    action: "drop",
    enabled: true,
    protocol_match_excepted: false,
    src_networkconf_id: newNetworkId,
    src_networkconf_type: "NETv4",
    dst_networkconf_id: template._id,
    dst_networkconf_type: "NETv4",
  };
  delete newRule._id;
  delete newRule.site_id;
  delete newRule.rule_index;

  console.log("\nAbout to create this firewall rule:");
  console.log(JSON.stringify(newRule, null, 2));
  console.log(
    "\nThis is the security-critical part — review the fields above carefully " +
      "(they were cloned from an existing rule on your controller, so names should " +
      "match, but double-check src/dst and action).",
  );
  if (!(await confirm("Proceed with creating this firewall rule?"))) {
    console.log("Aborted by user. Network was created, but no firewall rule was added.");
    process.exit(1);
  }

  const createdRule = await client.createFirewallRule(newRule);
  console.log("\nCreated firewall rule:");
  console.log(JSON.stringify(createdRule, null, 2));

  console.log(
    "\nDone. Go verify both in the UniFi app (Settings > Networks, Settings > Security > Firewall), " +
      "and test from a real device on the Guest VLAN that it actually cannot reach the main LAN " +
      "before relying on this.",
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message ?? err);
  process.exit(1);
});

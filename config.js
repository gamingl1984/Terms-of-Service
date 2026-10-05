import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const configPath = path.join(dataDir, "config.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const defaults = {
  logChannelId: "",
  announceChannelId: "",
  ticketCategoryId: "",
  ticketStaffRoleId: "",
  botAdminRoleId: "",
  ticketPanelChannelId: "",
  ticketPanelMessageId: "",
  warnings: {},
  warnSettings: { threshold: 0, demoteRoleId: "", resetAfterAction: true },
  blacklist: [],
  tempbans: [],
  commandLogging: true,
  automod: {},
  welcome: {},
  autorole: {},
  persistRoles: {},
  reactionRoles: [],
  cases: [],
  clock: {},
  roblox: {},
  levels: {},
  triggers: {},
  afk: {},
  sticky: {},
  starboard: {},
  starboardPosted: {},
  econ: {},
  lockdown: {},
  loa: {}
};

export function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
  return { ...defaults, ...cfg };
}

export function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  // Keep the exported CONFIG object live so consecutive commands always see fresh data
  // (previously the in-memory copy went stale and could overwrite newer saves).
  for (const key of Object.keys(CONFIG)) delete CONFIG[key];
  Object.assign(CONFIG, cfg);
}

export const CONFIG = loadConfig();

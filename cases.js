import { CONFIG, saveConfig } from "./config.js";

// Records a moderation case and returns its number.
export function addCase(guildId, type, userId, moderatorId, reason, extra = {}) {
  const cfg = { ...CONFIG, cases: [...(CONFIG.cases || [])] };
  const id = cfg.cases.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1;
  cfg.cases.push({ id, guildId, type, userId, moderatorId, reason, at: new Date().toISOString(), ...extra });
  if (cfg.cases.length > 2000) cfg.cases = cfg.cases.slice(-2000);
  saveConfig(cfg);
  return id;
}

export function updateCaseReason(id, reason) {
  if (!(CONFIG.cases || []).some(c => c.id === id)) return false;
  saveConfig({ ...CONFIG, cases: (CONFIG.cases || []).map(c => c.id === id ? { ...c, reason } : c) });
  return true;
}

export function guildCases(guildId) {
  return (CONFIG.cases || []).filter(c => c.guildId === guildId);
}

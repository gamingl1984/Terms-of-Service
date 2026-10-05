import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmbedBuilder } from "discord.js";
import { CONFIG } from "./config.js";
import { addCase } from "./cases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "..", "data", "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function dayStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plain(text = "") {
  return String(text).replace(/\*\*/g, "").replace(/\n+/g, " | ").slice(0, 1000);
}

// Every action and command is ALWAYS written to data/logs/bot-YYYY-MM-DD.log,
// regardless of whether a Discord log channel is configured.
export function fileLog(category, text) {
  const line = `[${new Date().toISOString()}] [${category}] ${plain(text)}\n`;
  try {
    fs.appendFileSync(path.join(logsDir, `bot-${dayStamp()}.log`), line, "utf8");
  } catch (err) {
    console.error("File logging failed:", err.message);
  }
}

// Titles that should also be recorded as numbered moderation cases.
const CASE_TITLES = {
  "Member Banned": "ban",
  "User Unbanned": "unban",
  "Member Kicked": "kick",
  "Member Timed Out": "timeout",
  "Timeout Removed": "untimeout",
  "Member Warned": "warn",
  "Member Softbanned": "softban",
  "Member Tempbanned": "tempban"
};

// Sends an embed to the configured log channel (if set) and always file-logs.
export async function logAction(guild, title, description, color = 0x5865F2) {
  fileLog("ACTION", `${title} :: ${description}`);
  if (!guild) return;

  // Auto-record numbered cases for moderation actions.
  const caseType = CASE_TITLES[title];
  if (caseType) {
    const target = description.match(/\*\*Target:\*\* .*?\((\d+)\)/)?.[1];
    const moderator = description.match(/\*\*Moderator:\*\* .*?\((\d+)\)/)?.[1] ?? "unknown";
    const reason = description.match(/\*\*Action:\*\* (.+?)(?:\n|$)/)?.[1] ?? "No reason";
    if (target) addCase(guild.id, caseType, target, moderator, reason);
  }
  const channelId = CONFIG.logChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export function auditText(interaction, action, target = "") {
  const who = `${interaction.user.tag} (${interaction.user.id})`;
  return `**Action:** ${action}\n**Moderator:** ${who}${target ? `\n**Target:** ${target}` : ""}`;
}

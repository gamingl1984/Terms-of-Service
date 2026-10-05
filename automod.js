import { PermissionFlagsBits } from "discord.js";
import { CONFIG } from "./config.js";
import { logAction, fileLog } from "./logger.js";

const spamMap = new Map(); // "guildId:userId" -> recent message timestamps

const INVITE_RE = /(discord\.(gg|io|me)|discord(app)?\.com\/invite)\/[\w-]+/i;
const LINK_RE = /(https?:\/\/|www\.)/i;

function isExempt(member) {
  if (!member) return true;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

// Called for every message; enforces the per-guild AutoMod settings.
export async function handleMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const am = {
    antiInvite: false, antiLink: false, antiSpam: false, maxMentions: 0,
    bannedWords: [], ignoredChannels: [],
    ...(CONFIG.automod || {})[message.guild.id]
  };
  if (am.ignoredChannels.includes(message.channel.id)) return;
  if (isExempt(message.member)) return;

  const violations = [];

  if (am.antiInvite && INVITE_RE.test(message.content)) violations.push("invite link");
  if (am.antiLink && LINK_RE.test(message.content)) violations.push("link");
  if (am.maxMentions > 0 && message.mentions.users.size > am.maxMentions)
    violations.push(`too many mentions (${message.mentions.users.size}/${am.maxMentions})`);
  const lower = message.content.toLowerCase();
  const hit = (am.bannedWords || []).find(w => w && lower.includes(w.toLowerCase()));
  if (hit) violations.push(`banned word "${hit}"`);

  if (am.antiSpam) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const stamps = (spamMap.get(key) ?? []).filter(t => now - t < 5000);
    stamps.push(now);
    if (stamps.length > 5) {
      spamMap.set(key, []);
      violations.push("spamming (6+ messages in 5 seconds)");
      await message.member?.timeout(10 * 60_000, "AutoMod: spam").catch(() => {});
    } else {
      spamMap.set(key, stamps);
    }
  }

  if (!violations.length) return;

  await message.delete().catch(() => {});
  const note = await message.channel
    .send(`🛡️ ${message.author}, your message was removed by AutoMod: ${violations.join(", ")}.`)
    .catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 5000);

  fileLog("AUTOMOD", `${message.author.tag} (${message.author.id}) in #${message.channel.name}: ${violations.join(", ")}`);
  await logAction(message.guild, "🛡️ AutoMod Action",
    `**User:** ${message.author.tag} (${message.author.id})\n**Channel:** ${message.channel}\n**Violations:** ${violations.join(", ")}\n**Content:** ${(message.content || "").slice(0, 500)}`,
    0xED4245);
}

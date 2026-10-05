import { CONFIG, saveConfig } from "./config.js";
import { handleMessage as automodMessage } from "./automod.js";
import { logAction } from "./logger.js";

// ---------- XP / levels (MEE6-style) ----------

export function levelStats(guildId, userId) {
  const users = ((CONFIG.levels || {})[guildId] || {}).users || {};
  const xp = users[userId]?.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 100));
  return { xp, level };
}

export function topUsers(guildId, n = 10) {
  const users = ((CONFIG.levels || {})[guildId] || {}).users || {};
  return Object.entries(users)
    .map(([id, r]) => ({ id, xp: r.xp || 0 }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, n);
}

async function handleLevels(message) {
  if (!message.guild || message.author?.bot) return;
  const g = { users: {}, levelRoles: [], levelupChannelId: "", ...((CONFIG.levels || {})[message.guild.id] || {}) };
  const rec = g.users[message.author.id] || { xp: 0, lastMsg: 0 };
  const now = Date.now();
  if (now - (rec.lastMsg || 0) < 60_000) return; // 1 XP drop per minute per user

  const levelBefore = Math.floor(Math.sqrt(rec.xp / 100));
  rec.xp += 15 + Math.floor(Math.random() * 11);
  const levelAfter = Math.floor(Math.sqrt(rec.xp / 100));
  rec.lastMsg = now;

  const cfg = { ...CONFIG, levels: { ...(CONFIG.levels || {}) } };
  g.users[message.author.id] = rec;
  cfg.levels[message.guild.id] = g;
  saveConfig(cfg);

  if (levelAfter > levelBefore) {
    // Grant level role rewards
    const rewards = (g.levelRoles || []).filter(r => r.level <= levelAfter);
    if (rewards.length) {
      const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member) {
        for (const r of rewards) {
          const role = message.guild.roles.cache.get(r.roleId);
          if (role && !role.managed && role.position < message.guild.members.me.roles.highest.position)
            await member.roles.add(role, `Level ${levelAfter} reward`).catch(() => {});
        }
      }
    }
    const ch = message.guild.channels.cache.get(g.levelupChannelId || message.channel.id);
    if (ch?.isTextBased()) await ch.send(`🎉 Congratulations ${message.author}! You just reached **level ${levelAfter}**!`).catch(() => {});
    await logAction(message.guild, "Level Up", `**User:** ${message.author.tag} (${message.author.id})\n**Level:** ${levelAfter}`, 0x57F287);
  }
}

// ---------- Custom auto-responses (Carl-bot triggers) ----------

async function handleTriggers(message) {
  if (!message.guild || message.author?.bot) return;
  const list = (CONFIG.triggers || {})[message.guild.id] || [];
  if (!list.length) return;
  const content = message.content.trim().toLowerCase();
  const hit = list.find(t => t.exact ? content === t.match.toLowerCase() : content.includes(t.match.toLowerCase()));
  if (!hit) return;
  await message.channel.send(hit.response).catch(() => {});
}

// ---------- AFK (Dyno-style) ----------

async function handleAfk(message) {
  if (!message.guild || message.author?.bot) return;
  const g = (CONFIG.afk || {})[message.guild.id] || {};

  if (g[message.author.id]) {
    const cfg = { ...CONFIG, afk: { ...(CONFIG.afk || {}) } };
    delete cfg.afk[message.guild.id][message.author.id];
    saveConfig(cfg);
    await message.reply(`👋 Welcome back ${message.author} — your AFK status was removed.`).catch(() => {});
  }

  const mentioned = message.mentions.users.filter(u => !u.bot && g[u.id] && u.id !== message.author.id);
  if (mentioned.size) {
    const lines = mentioned
      .map(u => `💤 **${u.username}** is AFK: ${g[u.id].message} (since <t:${Math.floor(new Date(g[u.id].since).getTime() / 1000)}:R>)`);
    await message.reply(lines.join("\n").slice(0, 1000)).catch(() => {});
  }
}

// ---------- Sticky messages (Carl-bot style) ----------

const stickyCooldowns = new Set();

async function handleSticky(message) {
  if (!message.guild || message.author?.bot) return;
  const s = ((CONFIG.sticky || {})[message.guild.id] || {})[message.channel.id];
  if (!s) return;
  if (stickyCooldowns.has(message.channel.id)) return;
  stickyCooldowns.add(message.channel.id);
  setTimeout(() => stickyCooldowns.delete(message.channel.id), 5000);

  if (s.lastMessageId) await message.channel.messages.delete(s.lastMessageId).catch(() => {});
  const sent = await message.channel.send(s.message).catch(() => null);
  if (sent) {
    const cfg = { ...CONFIG, sticky: { ...(CONFIG.sticky || {}) } };
    cfg.sticky[message.guild.id][message.channel.id] = { ...s, lastMessageId: sent.id };
    saveConfig(cfg);
  }
}

// Runs all message-based systems for every incoming message.
export async function handleChatMessage(message) {
  await Promise.allSettled([
    automodMessage(message),
    handleLevels(message),
    handleTriggers(message),
    handleAfk(message),
    handleSticky(message)
  ]);
}

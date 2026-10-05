import { CONFIG } from "./config.js";

// Applies (or removes) reaction roles when reactions change.
export async function handleReaction(reaction, user, add) {
  if (user.bot || !reaction.message.guild) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  const emojiKey = reaction.emoji.id ?? reaction.emoji.name;
  const entry = (CONFIG.reactionRoles || []).find(r =>
    r.guildId === reaction.message.guild.id &&
    r.messageId === reaction.message.id &&
    r.emoji === emojiKey
  );
  if (!entry) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = reaction.message.guild.roles.cache.get(entry.roleId);
  if (!role) return;

  if (add) await member.roles.add(role, "Reaction role").catch(() => {});
  else await member.roles.remove(role, "Reaction role removed").catch(() => {});
}

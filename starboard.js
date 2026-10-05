import { EmbedBuilder } from "discord.js";
import { CONFIG, saveConfig } from "./config.js";

// Starboard: when a message reaches the star threshold, it is posted (and kept
// updated) in the configured starboard channel.
export async function handleStarboard(reaction) {
  if (!reaction.message.guild) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.emoji.name !== "⭐") return;

  const sb = (CONFIG.starboard || {})[reaction.message.guild.id];
  if (!sb?.channelId) return;
  const min = sb.minStars ?? 3;
  if ((reaction.count ?? 0) < min) return;

  const source = await reaction.message.fetch().catch(() => null);
  if (!source || source.author?.bot) return;
  const stars = source.reactions.cache.get("⭐")?.count ?? 0;

  const boardCh = source.guild.channels.cache.get(sb.channelId);
  if (!boardCh?.isTextBased()) return;

  const e = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: source.author?.tag ?? "Unknown", iconURL: source.author?.displayAvatarURL?.() ?? undefined })
    .setDescription((source.content || "*[no text content]*").slice(0, 2000))
    .addFields({ name: "Source", value: `[Jump to message](${source.url}) — in #${source.channel.name}`, inline: false })
    .setTimestamp(source.createdTimestamp)
    .setFooter({ text: `⭐ ${stars}` });
  if (source.attachments?.size && source.attachments.first()?.contentType?.startsWith("image/")) {
    e.setImage(source.attachments.first().url);
  }

  const posted = ((CONFIG.starboardPosted || {})[source.guild.id] || {})[source.id];
  if (posted) {
    const msg = await boardCh.messages.fetch(posted).catch(() => null);
    if (msg) return void await msg.edit({ content: `⭐ **${stars}**`, embeds: [e] }).catch(() => {});
  }

  const sent = await boardCh.send({ content: `⭐ **${stars}**`, embeds: [e] }).catch(() => null);
  if (sent) {
    const sp = { ...(CONFIG.starboardPosted || {}) };
    const g = { ...(sp[source.guild.id] || {}) };
    g[source.id] = sent.id;
    sp[source.guild.id] = g;
    saveConfig({ ...CONFIG, starboardPosted: sp });
  }
}

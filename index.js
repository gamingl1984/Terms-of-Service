import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder, AuditLogEvent
} from "discord.js";
import http from "node:http";
import { builders, snipes, handleClockButton } from "./commands.js";
import { CONFIG, saveConfig } from "./config.js";
import { logAction, fileLog } from "./logger.js";
import { handleChatMessage } from "./chat.js";
import { handleReaction } from "./reactionroles.js";
import { handleStarboard } from "./starboard.js";
import { formatPlaceholders } from "./greet.js";

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is missing. Copy .env.example to .env and add your bot token.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

const commandMap = new Map(builders.map(c => [c.data.name, c]));

client.once(Events.ClientReady, async c => {
  console.log(`\n${c.user.tag} is online.`);
  console.log(`Serving ${c.guilds.cache.size} server(s).`);
  console.log("Use /help in Discord.");

  // Background timers: tempban auto-unban + LOA auto-expiry, checked every minute.
  setInterval(async () => {
    try {
      const now = Date.now();

      // Expired tempbans -> auto-unban
      const dueBans = (CONFIG.tempbans || []).filter(t => t.unbanAt <= now);
      if (dueBans.length) {
        saveConfig({ ...CONFIG, tempbans: (CONFIG.tempbans || []).filter(t => t.unbanAt > now) });
        for (const t of dueBans) {
          const guild = client.guilds.cache.get(t.guildId);
          if (!guild) { fileLog("TEMPBAN", `Skipped auto-unban of ${t.tag} (${t.userId}) — guild not cached`); continue; }
          await guild.members.unban(t.userId, "Tempban expired")
            .then(() => logAction(guild, "Tempban Expired", `**User:** ${t.tag} (${t.userId})\n**Auto-unbanned** after the scheduled time.`, 0x57F287))
            .catch(() => {});
        }
      }

      // Expired LOAs -> automatic removal
      const expiredLoa = Object.entries(CONFIG.loa || {}).filter(([, e]) => e.expiresAt && e.expiresAt <= now);
      if (expiredLoa.length) {
        const cfg = { ...CONFIG, loa: { ...CONFIG.loa } };
        for (const [id, e] of expiredLoa) {
          delete cfg.loa[id];
          fileLog("LOA", `LOA expired for ${e.username} (${id})`);
          const guild = client.guilds.cache.get(e.guildId);
          if (guild) await logAction(guild, "LOA Expired", `**Staff:** ${e.username} (<@${id}>)\n**LOA automatically ended.**`, 0xFEE75C);
        }
        saveConfig(cfg);
      }
    } catch (err) {
      console.error("Background timer error:", err);
    }
  }, 60_000);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) return;

      if ((CONFIG.blacklist || []).some(b => b.userId === interaction.user.id))
        return interaction.reply({ content: "⛔ You are blacklisted from using this bot.", ephemeral: true });

      // Log every used command to the configured log channel (toggleable)
      // and always to data/logs/ on disk.
      if (CONFIG.commandLogging !== false) {
        const opts = interaction.options.data
          .flatMap(o => o.options ?? [o])
          .map(o => `${o.name}: ${o.value}`)
          .join(", ");
        await logAction(interaction.guild, "Command Used",
          `**Command:** \`/${interaction.commandName}\`${opts ? `\n**Options:** ${opts}` : ""}\n**User:** ${interaction.user.tag} (${interaction.user.id})\n**Channel:** ${interaction.channel}`,
          0x5865F2);
      }

      await command.execute(interaction);
    }

    if (interaction.isButton()) {
      if ((CONFIG.blacklist || []).some(b => b.userId === interaction.user.id))
        return interaction.reply({ content: "⛔ You are blacklisted from using this bot.", ephemeral: true });

      if (interaction.customId === "clock_in" || interaction.customId === "clock_out")
        return handleClockButton(interaction);

      if (interaction.customId === "ticket_open") {
        const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.id}`);
        if (existing) return interaction.reply({ content: `You already have a ticket: ${existing}`, ephemeral: true });

        const overwrites = [
          { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }
        ];
        if (CONFIG.ticketStaffRoleId) overwrites.push({
          id: CONFIG.ticketStaffRoleId,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"]
        });

        const ch = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.id}`,
          type: 0,
          parent: CONFIG.ticketCategoryId || undefined,
          permissionOverwrites: overwrites,
          topic: `Ticket opened by ${interaction.user.tag}`
        });

        const e = new EmbedBuilder().setTitle("🎫 Ticket Opened")
          .setDescription("Please describe your issue. Staff will be with you shortly.")
          .setColor(0x57F287);

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
        await ch.send({
          content: `${interaction.user}${CONFIG.ticketStaffRoleId ? ` <@&${CONFIG.ticketStaffRoleId}>` : ""}`,
          embeds: [e],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
          )]
        });

        await interaction.reply({ content: `🎫 Ticket created: ${ch}`, ephemeral: true });
        await logAction(interaction.guild, "Ticket Opened", `**User:** ${interaction.user.tag}\n**Channel:** ${ch}`, 0x57F287);
      }

      if (interaction.customId === "ticket_close") {
        if (!interaction.channel?.name.startsWith("ticket-"))
          return interaction.reply({ content: "This is not a ticket.", ephemeral: true });
        await interaction.reply("🔒 Closing ticket in 5 seconds...");
        await logAction(interaction.guild, "Ticket Closed", `**Closed by:** ${interaction.user.tag}\n**Channel:** ${interaction.channel}`, 0xED4245);
        setTimeout(() => interaction.channel.delete(`Closed by ${interaction.user.tag}`).catch(() => {}), 5000);
      }
    }
  } catch (err) {
    console.error(err);
    const msg = err?.message?.slice(0, 1800) || "Unknown error";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ Error: ${msg}`, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ Error: ${msg}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    // Autorole
    const autoRole = (CONFIG.autorole || {})[member.guild.id];
    if (autoRole) {
      const role = member.guild.roles.cache.get(autoRole);
      if (role && !role.managed && role.position < member.guild.members.me.roles.highest.position)
        await member.roles.add(role, "Autorole").catch(() => {});
    }
    // Persistent roles: restore roles saved from the member's previous stay
    const prGuild = (CONFIG.persistRoles || {})[member.guild.id];
    const saved = prGuild?.users?.[member.id];
    if (prGuild?.enabled && saved?.length) {
      const roles = saved
        .map(id => member.guild.roles.cache.get(id))
        .filter(r => r && !r.managed && r.position < member.guild.members.me.roles.highest.position);
      if (roles.length) await member.roles.add(roles, "Persistent roles restored").catch(() => {});
      const pr = { ...(CONFIG.persistRoles || {}) };
      const g = { ...(pr[member.guild.id] || {}), users: { ...(pr[member.guild.id]?.users || {}) } };
      delete g.users[member.id];
      pr[member.guild.id] = g;
      saveConfig({ ...CONFIG, persistRoles: pr });
    }
    // Welcome message
    const w = (CONFIG.welcome || {})[member.guild.id];
    if (w?.joinChannelId && w?.joinMessage) {
      const ch = member.guild.channels.cache.get(w.joinChannelId);
      if (ch?.isTextBased()) await ch.send(formatPlaceholders(w.joinMessage, member)).catch(() => {});
    }
  } catch (err) {
    console.error(err);
  }
  logAction(member.guild, "Member Joined", `**User:** ${member.user.tag}\n**ID:** ${member.id}`, 0x57F287);
});

client.on(Events.GuildMemberRemove, async member => {
  try {
    // Persistent roles: remember roles for when the member rejoins
    const prGuild = (CONFIG.persistRoles || {})[member.guild.id];
    if (prGuild?.enabled && !member.partial) {
      const roles = member.roles.cache
        .filter(r => !r.managed && r.id !== member.guild.id && r.position < member.guild.members.me.roles.highest.position)
        .map(r => r.id);
      if (roles.length) {
        const pr = { ...(CONFIG.persistRoles || {}) };
        const g = { ...(pr[member.guild.id] || {}), users: { ...(pr[member.guild.id]?.users || {}) } };
        g.users[member.id] = roles;
        pr[member.guild.id] = g;
        saveConfig({ ...CONFIG, persistRoles: pr });
      }
    }
    // Farewell message
    const w = (CONFIG.welcome || {})[member.guild.id];
    if (w?.leaveChannelId && w?.leaveMessage) {
      const ch = member.guild.channels.cache.get(w.leaveChannelId);
      if (ch?.isTextBased()) await ch.send(formatPlaceholders(w.leaveMessage, member)).catch(() => {});
    }
  } catch (err) {
    console.error(err);
  }
  logAction(member.guild, "Member Left", `**User:** ${member.user?.tag ?? member.id}\n**ID:** ${member.id}`, 0xED4245);
});

// AutoMod, leveling, triggers, AFK and sticky messages on every message
client.on(Events.MessageCreate, message => {
  handleChatMessage(message).catch(console.error);
});

// Reaction roles + starboard
client.on(Events.MessageReactionAdd, (reaction, user) => {
  handleReaction(reaction, user, true).catch(console.error);
  handleStarboard(reaction).catch(console.error);
});
client.on(Events.MessageReactionRemove, (reaction, user) => handleReaction(reaction, user, false).catch(console.error));

// ---------- Security monitoring (audit-log alerts) ----------

async function auditExecutor(guild, auditType, targetId) {
  const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 }).catch(() => null);
  const entry = logs?.entries.find(e => e.target?.id === targetId && Date.now() - e.createdTimestamp < 15_000);
  return entry?.executor ?? null;
}

client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  const who = await auditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id).catch(() => null);
  if (who?.id === client.user.id) return; // caused by our own commands (already logged)
  fileLog("SECURITY", `Channel deleted: #${channel.name} (${channel.id}) by ${who?.tag ?? "unknown"}`);
  await logAction(channel.guild, "🚨 Channel Deleted",
    `**Channel:** ${channel.name} (${channel.id})\n**Deleted by:** ${who ?? "Unknown (audit log unavailable)"}`, 0xED4245);
});

client.on(Events.RoleDelete, async role => {
  const who = await auditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id).catch(() => null);
  if (who?.id === client.user.id) return;
  fileLog("SECURITY", `Role deleted: ${role.name} (${role.id}) by ${who?.tag ?? "unknown"}`);
  await logAction(role.guild, "🚨 Role Deleted",
    `**Role:** ${role.name} (${role.id})\n**Deleted by:** ${who ?? "Unknown (audit log unavailable)"}`, 0xED4245);
});

client.on(Events.GuildBanAdd, async ban => {
  const who = await auditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id).catch(() => null);
  if (who?.id === client.user.id) return; // our own /ban is already logged with a case
  fileLog("SECURITY", `Ban: ${ban.user.tag} (${ban.user.id}) by ${who?.tag ?? "unknown"}`);
  await logAction(ban.guild, "🚨 Member Banned (external)",
    `**User:** ${ban.user.tag} (${ban.user.id})\n**By:** ${who ?? "Unknown (audit log unavailable)"}`, 0xED4245);
});

client.on(Events.MessageDelete, message => {
  if (!message.guild || message.author?.bot) return;
  snipes.set(message.channel.id, {
    author: message.author?.tag ?? "Unknown",
    avatar: message.author?.displayAvatarURL?.() ?? null,
    content: message.content ?? "",
    at: Date.now()
  });
  logAction(message.guild, "Message Deleted", `**Channel:** ${message.channel}\n**Author:** ${message.author?.tag ?? "Unknown"}\n**Content:** ${(message.content || "[unavailable]").slice(0, 1500)}`, 0xED4245);
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
  logAction(newMessage.guild, "Message Edited", `**Channel:** ${newMessage.channel}\n**Author:** ${newMessage.author?.tag ?? "Unknown"}\n**Before:** ${(oldMessage.content || "[unavailable]").slice(0, 700)}\n**After:** ${(newMessage.content || "[unavailable]").slice(0, 700)}`, 0xFEE75C);
});

// Optional keep-alive web server.
// Free hosts like Render/Koyeb require an open HTTP port; bot-hosting.net does not need this.
// Starts automatically if the host provides a PORT, or if KEEP_ALIVE=1 is set.
if (process.env.PORT || process.env.KEEP_ALIVE === "1") {
  const port = Number(process.env.PORT) || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", uptime: Math.round(process.uptime()) }));
  }).listen(port, () => console.log(`Keep-alive web server listening on port ${port}.`));
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.DISCORD_TOKEN);

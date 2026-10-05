import {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} from "discord.js";
import { CONFIG, saveConfig } from "./config.js";
import { logAction, auditText } from "./logger.js";
import { guildCases, updateCaseReason } from "./cases.js";
import { formatPlaceholders } from "./greet.js";
import { levelStats, topUsers } from "./chat.js";

const builders = [];

// In-memory store of the most recently deleted message per channel (for /snipe)
const snipes = new Map();

const add = (builder, handler) => builders.push({ data: builder, execute: handler });

function targetUser(option) {
  return option;
}

function canAct(interaction, member) {
  if (!member) return "That member could not be found.";
  if (member.id === interaction.guild.ownerId) return "You cannot moderate the server owner.";
  if (member.id === interaction.user.id) return "You cannot use this action on yourself.";
  if (!member.manageable) return "I cannot manage that member. Check my role position and permissions.";
  return null;
}

add(
  new SlashCommandBuilder().setName("help").setDescription("Show the bot command list."),
  async i => {
    const e = new EmbedBuilder()
      .setTitle("🛡️ ProGuard Commands")
      .setColor(0x5865F2)
      .setDescription([
        "**Moderation**",
        "`/ban /tempban /unban /softban /kick /timeout /untimeout`",
        "`/warn /warnings /clearwarnings /purge /slowmode /lock /unlock /nick /dm`",
        "",
        "**Blacklist**",
        "`/blacklist add /blacklist remove /blacklist list /blacklist check`",
        "",
        "**Security & AutoMod**",
        "`/automod anti-invite / anti-link / anti-spam / banned-words / max-mentions / ignore-channel / status`",
        "`/lockdown /nuke /case /modlogs /reason`",
        "",
        "**Staff & Engagement**",
        "`/clock in /clock out /clock panel /clock status /clock leaderboard`",
        "`/welcome set /welcome leave-set /welcome view /welcome off /welcome test`",
        "`/giveaway /rr add /rr remove /rr list`",
        "",
        "**Roblox**",
        "`/roblox log /roblox log-channel`",
        "`/roblox blacklist /roblox unblacklist /roblox blacklist-list /roblox check`",
        "`/roblox startup-config /roblox startup`",
        "",
        "**Roles**",
        "`/role add /role remove /role create /role delete /role edit /role list`",
        "",
        "**Server & Utility**",
        "`/serverinfo /userinfo /avatar /announce set /announce send`",
        "`/say /embed /poll /ping`",
        "`/botinfo /servericon /stealemoji /snipe /setstatus /terms`",
        "`/remind /roll /rps`",
        "",
        "**Tickets**",
        "`/ticket setup /ticket open /ticket close /ticket add /ticket remove /ticket claim`",
        "",
        "**Levels & Auto-responses**",
        "`/rank /leaderboard /afk`",
        "`/trigger add /trigger remove /trigger list`",
        "`/sticky set /sticky off /starboard set /starboard off`",
        "",
        "**More Moderation & Utility**",
        "`/mute /unmute /banlist /voice kick /voice move /voice mute /voice unmute`",
        "`/channel create /channel delete /channel rename /channel topic`",
        "`/invite /firstmessage /emojis /banner`",
        "",
        "**Fun (auto-fetching)**",
        "`/meme /joke /cat /dog /trivia /action`",
        "",
        "**Economy (Dank Memer style)**",
        "`/economy balance /economy daily /economy work`",
        "`/economy gamble /economy rob /economy pay /economy leaderboard`",
        "",
        "**Smart tools**",
        "`/urban /wiki /weather /calculate`",
        "`/serverbanner /massrole add /massrole remove`",
        "`/giveaway start /giveaway reroll`",
        "",
        "**Fun / harmless troll**",
        "`/troll slap /troll ship /troll 8ball /troll coinflip /troll mock /troll reverse`",
        "",
        "All sensitive actions respect Discord permissions and role hierarchy.",
        "",
        "📋 Every command and moderation action is logged to your log channel **and** to `data/logs/` on disk.",
        "🚨 Configure automatic demotion after X warnings with `/config warn-demotion`."
      ].join("\n"));
    await i.reply({ embeds: [e], ephemeral: true });
  }
);

add(new SlashCommandBuilder().setName("ping").setDescription("Check bot latency."), async i => {
  await i.reply(`🏓 Pong! WebSocket: **${i.client.ws.ping}ms**`);
});

add(new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information."), async i => {
  const g = i.guild;
  const e = new EmbedBuilder().setTitle(`Server Info — ${g.name}`).setColor(0x5865F2)
    .addFields(
      { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
      { name: "Members", value: `${g.memberCount}`, inline: true },
      { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
      { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
      { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:F>`, inline: false }
    );
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("userinfo").setDescription("Show information about a user.")
  .addUserOption(o => o.setName("user").setDescription("User").setRequired(false)), async i => {
  const u = i.options.getUser("user") ?? i.user;
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const e = new EmbedBuilder().setTitle(`User Info — ${u.tag}`).setThumbnail(u.displayAvatarURL({ size: 256 }))
    .setColor(0x5865F2).addFields(
      { name: "ID", value: u.id, inline: true },
      { name: "Account", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:F>`, inline: true },
      { name: "Joined", value: m ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:F>` : "Not in server", inline: true },
      { name: "Roles", value: m ? (m.roles.cache.filter(r => r.id !== i.guild.id).map(r => r.toString()).join(", ") || "None") : "None" }
    );
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("avatar").setDescription("Show a user's avatar.")
  .addUserOption(o => o.setName("user").setDescription("User").setRequired(false)), async i => {
  const u = i.options.getUser("user") ?? i.user;
  await i.reply({ content: u.displayAvatarURL({ size: 1024 }) });
});

add(new SlashCommandBuilder().setName("ban").setDescription("Ban a member.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  if (m) { const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true }); }
  const reason = i.options.getString("reason") ?? "No reason provided";
  await i.guild.members.ban(u.id, { reason }).then(async () => {
    await i.reply(`🔨 Banned **${u.tag}** — ${reason}`);
    await logAction(i.guild, "Member Banned", auditText(i, reason, `${u.tag} (${u.id})`), 0xED4245);
  }).catch(e => i.reply({ content: `Ban failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("unban").setDescription("Unban a user.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption(o => o.setName("user_id").setDescription("User ID").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const id = i.options.getString("user_id", true);
  const reason = i.options.getString("reason") ?? "No reason provided";
  await i.guild.members.unban(id, reason).then(async () => {
    await i.reply(`✅ Unbanned **${id}**`);
    await logAction(i.guild, "User Unbanned", auditText(i, reason, id), 0x57F287);
  }).catch(e => i.reply({ content: `Unban failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("kick").setDescription("Kick a member.")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  const reason = i.options.getString("reason") ?? "No reason provided";
  await m.kick(reason).then(async () => {
    await i.reply(`👢 Kicked **${u.tag}** — ${reason}`);
    await logAction(i.guild, "Member Kicked", auditText(i, reason, `${u.tag} (${u.id})`), 0xED4245);
  }).catch(e => i.reply({ content: `Kick failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addIntegerOption(o => o.setName("minutes").setDescription("1-40320 minutes").setMinValue(1).setMaxValue(40320).setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  const mins = i.options.getInteger("minutes", true);
  const reason = i.options.getString("reason") ?? "No reason provided";
  await m.timeout(mins * 60_000, reason).then(async () => {
    await i.reply(`⏱️ Timed out **${u.tag}** for **${mins} minutes** — ${reason}`);
    await logAction(i.guild, "Member Timed Out", auditText(i, `${mins}m — ${reason}`, `${u.tag} (${u.id})`), 0xFEE75C);
  }).catch(e => i.reply({ content: `Timeout failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member's timeout.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  await m.timeout(null, "Timeout removed").then(async () => {
    await i.reply(`✅ Removed timeout from **${u.tag}**`);
    await logAction(i.guild, "Timeout Removed", auditText(i, "Removed timeout", `${u.tag} (${u.id})`), 0x57F287);
  }).catch(e => i.reply({ content: `Failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("warn").setDescription("Warn a member.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const reason = i.options.getString("reason", true);
  const cfg = { ...CONFIG, warnings: { ...CONFIG.warnings } };
  cfg.warnings[u.id] = [...(cfg.warnings[u.id] ?? []), {
    reason, moderator: i.user.id, at: new Date().toISOString()
  }];
  const count = cfg.warnings[u.id].length;
  const ws = cfg.warnSettings ?? {};
  const threshold = ws.threshold ?? 0;
  const limitReached = threshold > 0 && count >= threshold;
  let demotionNote = "";
  if (limitReached && ws.demoteRoleId) {
    const m = await i.guild.members.fetch(u.id).catch(() => null);
    const role = i.guild.roles.cache.get(ws.demoteRoleId);
    if (m && role && m.roles.cache.has(role.id)) {
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position) {
        demotionNote = "\n⚠️ Auto-demotion failed — I cannot manage that role (hierarchy/integration).";
      } else {
        await m.roles.remove(role, `Auto-demotion: reached ${count} warning(s)`)
          .then(() => { demotionNote = `\n🚨 **Auto-demotion:** role **${role.name}** removed (${count}/${threshold} warnings).`; })
          .catch(() => { demotionNote = "\n⚠️ Auto-demotion failed — check my permissions."; });
      }
    }
  }
  if (limitReached && (ws.resetAfterAction ?? true)) delete cfg.warnings[u.id];
  saveConfig(cfg);
  await i.reply(`⚠️ Warned **${u.tag}** — ${reason} (warning **${count}**${threshold > 0 ? `/${threshold}` : ""})${demotionNote}`);
  await u.send(`⚠️ You were warned in **${i.guild.name}**: ${reason}${limitReached ? `\n🚨 You reached the warning limit —${demotionNote ? demotionNote.replace(/\n/g, " ").replace(/\*\*/g, "") : " action was taken."}` : ""}`).catch(() => {});
  await logAction(i.guild, "Member Warned",
    `${auditText(i, reason, `${u.tag} (${u.id})`)}\n**Warning count:** ${count}${threshold > 0 ? ` / ${threshold}` : ""}${limitReached ? "\n**⚠️ Warning limit reached — auto-demotion applied.**" : ""}`,
    0xFEE75C);
});

add(new SlashCommandBuilder().setName("warnings").setDescription("View stored warnings.")
  .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const list = CONFIG.warnings[u.id] ?? [];
  const text = list.length ? list.map((w, n) => `**${n + 1}.** ${w.reason} — <@${w.moderator}> — <t:${Math.floor(new Date(w.at).getTime()/1000)}:R>`).join("\n") : "No warnings.";
  await i.reply({ embeds: [new EmbedBuilder().setTitle(`Warnings — ${u.tag}`).setDescription(text).setColor(0xFEE75C)], ephemeral: true });
});

add(new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear all stored warnings for a user.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const cfg = { ...CONFIG, warnings: { ...CONFIG.warnings } };
  delete cfg.warnings[u.id]; saveConfig(cfg);
  await i.reply(`🧹 Cleared warnings for **${u.tag}**`);
  await logAction(i.guild, "Warnings Cleared", auditText(i, "Cleared warnings", `${u.tag} (${u.id})`), 0x57F287);
});

add(new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(o => o.setName("amount").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true)), async i => {
  const amount = i.options.getInteger("amount", true);
  const deleted = await i.channel.bulkDelete(amount, true).catch(() => null);
  if (!deleted) return i.reply({ content: "I could not bulk-delete those messages.", ephemeral: true });
  await i.reply({ content: `🧹 Deleted **${deleted.size}** messages.`, ephemeral: true });
  await logAction(i.guild, "Messages Purged", auditText(i, `${deleted.size} messages`, i.channel.toString()), 0xFEE75C);
});

add(new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption(o => o.setName("seconds").setDescription("0-21600 seconds").setMinValue(0).setMaxValue(21600).setRequired(true)), async i => {
  const s = i.options.getInteger("seconds", true);
  await i.channel.setRateLimitPerUser(s, `Changed by ${i.user.tag}`);
  await i.reply(`🐢 Slowmode set to **${s}s**.`);
});

for (const [name, lock] of [["lock", true], ["unlock", false]]) {
  add(new SlashCommandBuilder().setName(name).setDescription(`${lock ? "Lock" : "Unlock"} this channel.`)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels), async i => {
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: !lock });
      await i.reply(`${lock ? "🔒 Channel locked." : "🔓 Channel unlocked."}`);
      await logAction(i.guild, `Channel ${lock ? "Locked" : "Unlocked"}`, auditText(i, `${lock ? "Locked" : "Unlocked"}`, i.channel.toString()), 0x5865F2);
    });
}

add(new SlashCommandBuilder().setName("nick").setDescription("Change a member nickname.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addStringOption(o => o.setName("nickname").setDescription("New nickname, or 'reset'").setRequired(true)), async i => {
  const u = i.options.getUser("user", true), m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  const nick = i.options.getString("nickname", true);
  await m.setNickname(nick.toLowerCase() === "reset" ? null : nick);
  await i.reply(`✏️ Nickname updated for **${u.tag}**.`);
});


const staff = new SlashCommandBuilder().setName("staff").setDescription("Staff management tools.")
  .addSubcommand(s => s.setName("loa").setDescription("Place a staff member on leave.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
    .addIntegerOption(o => o.setName("days").setDescription("LOA length in days — auto-removes when it ends").setMinValue(1).setMaxValue(365).setRequired(false))
    .addStringOption(o => o.setName("return").setDescription("Expected return date/time (used if 'days' is not set)").setRequired(false)))
  .addSubcommand(s => s.setName("loa-remove").setDescription("Remove a staff member from LOA.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
  .addSubcommand(s => s.setName("loa-check").setDescription("Check a staff member's LOA status.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true)))
  .addSubcommand(s => s.setName("loa-list").setDescription("List all staff currently on LOA."))
  .addSubcommand(s => s.setName("promote").setDescription("Add a role to a staff member.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(true)))
  .addSubcommand(s => s.setName("demote").setDescription("Remove a role from a staff member.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)))
  .addSubcommand(s => s.setName("note").setDescription("Add a private staff note.")
    .addUserOption(o => o.setName("user").setDescription("Staff member").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Note").setRequired(true)));

staff.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

add(staff, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, loa: { ...(CONFIG.loa || {}) } };

  if (sub === "loa") {
    const u = i.options.getUser("user", true);
    const reason = i.options.getString("reason", true);
    const days = i.options.getInteger("days");
    const expiresAt = days ? Date.now() + days * 86400000 : null;
    const returnDate = days
      ? new Date(expiresAt).toISOString().slice(0, 10)
      : (i.options.getString("return") || "Not specified");
    cfg.loa[u.id] = {
      userId: u.id,
      username: u.tag,
      guildId: i.guild.id,
      reason,
      returnDate,
      expiresAt,
      moderatorId: i.user.id,
      startedAt: new Date().toISOString()
    };
    saveConfig(cfg);
    await i.reply(`🏖️ **${u.tag}** has been placed on **LOA**.\n**Reason:** ${reason}\n**Return:** ${days ? `<t:${Math.floor(expiresAt / 1000)}:F> (${days} day${days === 1 ? "" : "s"})` : returnDate}${days ? "\n*The LOA will be removed automatically when it expires.*" : ""}`);
    return logAction(i.guild, "Staff LOA Started",
      `**Staff:** ${u.tag} (${u.id})\n**Reason:** ${reason}\n**Length:** ${days ? `${days} day(s)` : "custom"}\n**Return:** ${returnDate}\n**Set by:** ${i.user.tag}`, 0xFEE75C);
  }

  if (sub === "loa-remove") {
    const u = i.options.getUser("user", true);
    if (!cfg.loa[u.id]) return i.reply({ content: `${u.tag} is not currently on LOA.`, ephemeral: true });
    delete cfg.loa[u.id];
    saveConfig(cfg);
    await i.reply(`✅ **${u.tag}** has been removed from LOA.`);
    return logAction(i.guild, "Staff LOA Ended", `**Staff:** ${u.tag} (${u.id})\n**Ended by:** ${i.user.tag}`, 0x57F287);
  }

  if (sub === "loa-check") {
    const u = i.options.getUser("user", true);
    const entry = cfg.loa[u.id];
    if (!entry) return i.reply({ content: `🟢 **${u.tag}** is not currently on LOA.`, ephemeral: true });
    const e = new EmbedBuilder().setTitle(`🏖️ LOA — ${u.tag}`).setColor(0xFEE75C)
      .addFields(
        { name: "Status", value: "Currently unavailable", inline: true },
        { name: "Reason", value: entry.reason, inline: true },
        { name: "Expected Return", value: entry.returnDate, inline: true },
        { name: "Started", value: `<t:${Math.floor(new Date(entry.startedAt).getTime()/1000)}:F>`, inline: true },
        { name: "Recorded By", value: `<@${entry.moderatorId}>`, inline: true },
        ...(entry.expiresAt ? [{ name: "Auto-removes", value: `<t:${Math.floor(entry.expiresAt / 1000)}:R>`, inline: true }] : [])
      );
    return i.reply({ embeds: [e], ephemeral: true });
  }

  if (sub === "loa-list") {
    const entries = Object.values(cfg.loa);
    if (!entries.length) return i.reply({ content: "🟢 No staff are currently on LOA.", ephemeral: true });
    const text = entries.map(x =>
      `🏖️ <@${x.userId}> — **${x.reason}** — Return: **${x.returnDate}**${x.expiresAt ? ` (<t:${Math.floor(x.expiresAt / 1000)}:R>)` : ""}`
    ).join("\n");
    return i.reply({
      embeds: [new EmbedBuilder().setTitle("🏖️ Staff Currently on LOA").setDescription(text.slice(0, 4000)).setColor(0xFEE75C)],
      ephemeral: true
    });
  }

  if (sub === "promote" || sub === "demote") {
    const u = i.options.getUser("user", true);
    const role = i.options.getRole("role", true);
    const m = await i.guild.members.fetch(u.id).catch(() => null);
    if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
    if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
      return i.reply({ content: "I cannot manage that role because of Discord role hierarchy/integration restrictions.", ephemeral: true });
    if (m.roles.highest.position >= i.guild.members.me.roles.highest.position)
      return i.reply({ content: "I cannot manage this member's roles.", ephemeral: true });
    await m.roles[sub === "promote" ? "add" : "remove"](role);
    await i.reply(`✅ **${role.name}** ${sub === "promote" ? "added to" : "removed from"} **${u.tag}**.`);
    return logAction(i.guild, `Staff ${sub === "promote" ? "Promotion" : "Demotion"}`,
      `**Staff:** ${u.tag}\n**Role:** ${role.name}\n**By:** ${i.user.tag}`, 0x5865F2);
  }

  if (sub === "note") {
    const u = i.options.getUser("user", true);
    const note = i.options.getString("note", true);
    await i.reply({ content: `📝 Staff note recorded for **${u.tag}**.`, ephemeral: true });
    return logAction(i.guild, "Staff Note", `**Staff:** ${u.tag} (${u.id})\n**Note:** ${note}\n**Added by:** ${i.user.tag}`, 0x5865F2);
  }
});

const roleSub = new SlashCommandBuilder().setName("role").setDescription("Manage server roles.")
  .addSubcommand(s => s.setName("add").setDescription("Add a role to a member.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a role from a member.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s => s.setName("create").setDescription("Create a role.")
    .addStringOption(o => o.setName("name").setDescription("Name").setRequired(true))
    .addStringOption(o => o.setName("color").setDescription("Hex, e.g. #ff0000").setRequired(false)))
  .addSubcommand(s => s.setName("delete").setDescription("Delete a role.")
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s => s.setName("edit").setDescription("Edit a role.")
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("New name").setRequired(false))
    .addStringOption(o => o.setName("color").setDescription("Hex color").setRequired(false))
    .addBooleanOption(o => o.setName("mentionable").setDescription("Mentionable?").setRequired(false)))
  .addSubcommand(s => s.setName("list").setDescription("List roles."));
roleSub.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

add(roleSub, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "list") {
    const roles = [...i.guild.roles.cache.values()].filter(r => r.id !== i.guild.id).sort((a,b) => b.position-a.position);
    return i.reply({ embeds: [new EmbedBuilder().setTitle("Server Roles").setDescription(roles.map(r => `${r} — \`${r.id}\``).join("\n").slice(0, 4000) || "No roles.").setColor(0x5865F2)] });
  }
  const role = i.options.getRole("role");
  if (role && (role.managed || role.position >= i.guild.members.me.roles.highest.position))
    return i.reply({ content: "That role is managed by an integration or is at/above my highest role.", ephemeral: true });

  if (sub === "add" || sub === "remove") {
    const u = i.options.getUser("user", true), m = await i.guild.members.fetch(u.id).catch(() => null);
    if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
    if (m.roles.highest.position >= i.guild.members.me.roles.highest.position) return i.reply({ content: "I cannot manage that member's roles.", ephemeral: true });
    await m.roles[sub === "add" ? "add" : "remove"](role);
    return i.reply(`✅ Role **${role.name}** ${sub === "add" ? "added to" : "removed from"} **${u.tag}**.`);
  }
  if (sub === "create") {
    const name = i.options.getString("name", true);
    const color = i.options.getString("color");
    const r = await i.guild.roles.create({ name, color: color || undefined, reason: `Created by ${i.user.tag}` });
    return i.reply(`✅ Created role ${r}.`);
  }
  if (sub === "delete") {
    await role.delete(`Deleted by ${i.user.tag}`);
    return i.reply(`🗑️ Deleted role **${role.name}**.`);
  }
  if (sub === "edit") {
    const name = i.options.getString("name");
    const color = i.options.getString("color");
    const mentionable = i.options.getBoolean("mentionable");
    await role.edit({ name: name ?? role.name, color: color ?? role.color, mentionable: mentionable ?? role.mentionable });
    return i.reply(`✅ Edited role **${role.name}**.`);
  }
});

const announceCmd = new SlashCommandBuilder().setName("announce").setDescription("Announcement system.")
  .addSubcommand(s => s.setName("set").setDescription("Set the default announcement channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s.setName("send").setDescription("Send an announcement embed — can ping up to 3 roles.")
    .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true))
    .addRoleOption(o => o.setName("role1").setDescription("Role to ping").setRequired(false))
    .addRoleOption(o => o.setName("role2").setDescription("Another role to ping").setRequired(false))
    .addRoleOption(o => o.setName("role3").setDescription("Another role to ping").setRequired(false))
    .addChannelOption(o => o.setName("channel").setDescription("Destination (default: your configured announce channel)").addChannelTypes(ChannelType.GuildText).setRequired(false)));
announceCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

add(announceCmd, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "set") {
    const ch = i.options.getChannel("channel", true).id;
    saveConfig({ ...CONFIG, announceChannelId: ch });
    return i.reply(`📢 Default announcement channel set to <#${ch}>.`);
  }
  const title = i.options.getString("title", true);
  const message = i.options.getString("message", true);
  const roles = [i.options.getRole("role1"), i.options.getRole("role2"), i.options.getRole("role3")].filter(Boolean);
  const ch = i.options.getChannel("channel")
    ?? (CONFIG.announceChannelId ? i.guild.channels.cache.get(CONFIG.announceChannelId) : null)
    ?? i.channel;
  const content = roles.length ? roles.map(r => `<@&${r.id}>`).join(" ") : undefined;
  const e = new EmbedBuilder().setTitle(title).setDescription(message)
    .setColor(0x5865F2).setFooter({ text: `Posted by ${i.user.tag}` }).setTimestamp();
  await ch.send({ content, embeds: [e] });
  await i.reply({ content: `📢 Announcement sent to ${ch}${roles.length ? `, pinging ${roles.map(r => r.toString()).join(", ")}` : ""}.`, ephemeral: true });
  return logAction(i.guild, "Announcement Sent", auditText(i, title, ch.toString()), 0x5865F2);
});

add(new SlashCommandBuilder().setName("say").setDescription("Make the bot send a message.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true)), async i => {
  await i.channel.send(i.options.getString("message", true));
  await i.reply({ content: "Sent.", ephemeral: true });
});

add(new SlashCommandBuilder().setName("embed").setDescription("Send a custom embed.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
  .addStringOption(o => o.setName("description").setDescription("Description").setRequired(true))
  .addStringOption(o => o.setName("color").setDescription("Hex color, e.g. #5865F2").setRequired(false)), async i => {
  const color = i.options.getString("color") || "#5865F2";
  const e = new EmbedBuilder().setTitle(i.options.getString("title", true)).setDescription(i.options.getString("description", true)).setColor(color);
  await i.channel.send({ embeds: [e] }); await i.reply({ content: "Embed sent.", ephemeral: true });
});

add(new SlashCommandBuilder().setName("poll").setDescription("Create a simple yes/no poll.")
  .addStringOption(o => o.setName("question").setDescription("Question").setRequired(true)), async i => {
  const q = i.options.getString("question", true);
  const msg = await i.channel.send({ embeds: [new EmbedBuilder().setTitle("📊 Poll").setDescription(q).setColor(0x5865F2)] });
  await msg.react("👍"); await msg.react("👎");
  await i.reply({ content: "Poll created.", ephemeral: true });
});

const troll = new SlashCommandBuilder().setName("troll").setDescription("Harmless fun commands.")
  .addSubcommand(s => s.setName("slap").setDescription("Slap someone.")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(s => s.setName("ship").setDescription("Compatibility score.")
    .addUserOption(o => o.setName("one").setDescription("First user").setRequired(true))
    .addUserOption(o => o.setName("two").setDescription("Second user").setRequired(true)))
  .addSubcommand(s => s.setName("8ball").setDescription("Ask the magic 8-ball.")
    .addStringOption(o => o.setName("question").setDescription("Question").setRequired(true)))
  .addSubcommand(s => s.setName("coinflip").setDescription("Flip a coin."))
  .addSubcommand(s => s.setName("mock").setDescription("Mock text.")
    .addStringOption(o => o.setName("text").setDescription("Text").setRequired(true)))
  .addSubcommand(s => s.setName("reverse").setDescription("Reverse text.")
    .addStringOption(o => o.setName("text").setDescription("Text").setRequired(true)));

add(troll, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "slap") return i.reply(`👋 **${i.user.username}** slaps ${i.options.getUser("user")} with a giant imaginary fish.`);
  if (sub === "coinflip") return i.reply(Math.random() < .5 ? "🪙 Heads!" : "🪙 Tails!");
  if (sub === "8ball") {
    const answers = ["Absolutely.", "No chance.", "Probably.", "Ask again later.", "Definitely.", "The signs point to no.", "Maybe.", "100%."];
    return i.reply(`🎱 ${answers[Math.floor(Math.random()*answers.length)]}`);
  }
  if (sub === "ship") {
    const a = i.options.getUser("one"), b = i.options.getUser("two");
    const score = Math.floor(Math.random()*101);
    return i.reply(`💘 **${a.username} + ${b.username}** = **${score}%** compatibility.`);
  }
  if (sub === "mock") {
    const t = i.options.getString("text", true);
    return i.reply(t.split("").map((c,n)=>n%2?c.toLowerCase():c.toUpperCase()).join(""));
  }
  if (sub === "reverse") return i.reply(i.options.getString("text", true).split("").reverse().join(""));
});


const configCmd = new SlashCommandBuilder().setName("config").setDescription("Configure ProGuard.")
  .addSubcommand(s => s.setName("logs").setDescription("Set the logging channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s.setName("ticket-category").setDescription("Set the ticket category.")
    .addChannelOption(o => o.setName("category").setDescription("Category").addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
  .addSubcommand(s => s.setName("ticket-staff").setDescription("Set the ticket staff role.")
    .addRoleOption(o => o.setName("role").setDescription("Staff role").setRequired(true)))
  .addSubcommand(s => s.setName("warn-demotion").setDescription("Set automatic demotion after X warnings.")
    .addIntegerOption(o => o.setName("threshold").setDescription("Warnings before auto-demotion (0 = disabled)").setMinValue(0).setMaxValue(100).setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role removed when the limit is hit").setRequired(false))
    .addBooleanOption(o => o.setName("reset").setDescription("Reset warnings after auto-demotion (default: yes)").setRequired(false)))
  .addSubcommand(s => s.setName("command-logging").setDescription("Toggle logging of every used command.")
    .addBooleanOption(o => o.setName("enabled").setDescription("Log command usage to the log channel?").setRequired(true)))
  .addSubcommand(s => s.setName("autorole").setDescription("Role automatically given to new members.")
    .addRoleOption(o => o.setName("role").setDescription("Autorole (omit to disable)").setRequired(false)))
  .addSubcommand(s => s.setName("persistroles").setDescription("Keep members' roles when they leave and rejoin.")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable persistent roles?").setRequired(true)))
  .addSubcommand(s => s.setName("levelup-channel").setDescription("Where level-up announcements are posted.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel (omit to announce in the same channel)").addChannelTypes(ChannelType.GuildText).setRequired(false)))
  .addSubcommand(s => s.setName("levelrole").setDescription("Roles automatically granted at levels.")
    .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }))
    .addIntegerOption(o => o.setName("level").setDescription("Level (for add/remove)").setMinValue(1).setMaxValue(500).setRequired(false))
    .addRoleOption(o => o.setName("role").setDescription("Role (for add)").setRequired(false)))
  .addSubcommand(s => s.setName("show").setDescription("Show current bot configuration."));
configCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

add(configCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG };
  if (sub === "logs") {
    cfg.logChannelId = i.options.getChannel("channel", true).id;
    saveConfig(cfg);
    return i.reply(`📋 Logging channel set to <#${cfg.logChannelId}>.`);
  }
  if (sub === "ticket-category") {
    cfg.ticketCategoryId = i.options.getChannel("category", true).id;
    saveConfig(cfg);
    return i.reply(`🎫 Ticket category set to <#${cfg.ticketCategoryId}>.`);
  }
  if (sub === "ticket-staff") {
    cfg.ticketStaffRoleId = i.options.getRole("role", true).id;
    saveConfig(cfg);
    return i.reply(`🎫 Ticket staff role set to <@&${cfg.ticketStaffRoleId}>.`);
  }
  if (sub === "warn-demotion") {
    const threshold = i.options.getInteger("threshold", true);
    const role = i.options.getRole("role");
    const reset = i.options.getBoolean("reset") ?? true;
    saveConfig({ ...CONFIG, warnSettings: { threshold, demoteRoleId: role?.id ?? "", resetAfterAction: reset } });
    return i.reply(threshold === 0
      ? "⚠️ Auto-demotion **disabled**."
      : `🚨 Auto-demotion set: after **${threshold}** warning(s), ${role ? `<@&${role.id}> will be removed` : "**no role is removed** (limit is tracked only)"} — warnings ${reset ? "reset" : "kept"} afterwards.`);
  }
  if (sub === "command-logging") {
    const enabled = i.options.getBoolean("enabled", true);
    saveConfig({ ...CONFIG, commandLogging: enabled });
    return i.reply(`📋 Command usage logging ${enabled ? "**enabled**" : "**disabled**"} (file logging is always on).`);
  }
  if (sub === "autorole") {
    const role = i.options.getRole("role");
    const cfg2 = { ...CONFIG, autorole: { ...(CONFIG.autorole || {}) } };
    if (role) {
      cfg2.autorole[i.guild.id] = role.id;
      saveConfig(cfg2);
      return i.reply(`🧑‍✈️ New members will automatically receive ${role}.`);
    }
    delete cfg2.autorole[i.guild.id];
    saveConfig(cfg2);
    return i.reply("🧑‍✈️ Autorole **disabled**.");
  }
  if (sub === "persistroles") {
    const enabled = i.options.getBoolean("enabled", true);
    const prev = (CONFIG.persistRoles || {})[i.guild.id] || {};
    saveConfig({ ...CONFIG, persistRoles: { ...(CONFIG.persistRoles || {}), [i.guild.id]: { ...prev, enabled } } });
    return i.reply(enabled
      ? "♻️ Persistent roles **enabled** — members keep their roles when they rejoin."
      : "♻️ Persistent roles **disabled**.");
  }
  if (sub === "levelup-channel") {
    const ch = i.options.getChannel("channel");
    const cfg2 = { ...CONFIG, levels: { ...(CONFIG.levels || {}) } };
    const g = { users: {}, levelRoles: [], levelupChannelId: "", ...(cfg2.levels[i.guild.id] || {}) };
    g.levelupChannelId = ch?.id ?? "";
    cfg2.levels[i.guild.id] = g;
    saveConfig(cfg2);
    return i.reply(ch ? `🎉 Level-up announcements will be posted in ${ch}.` : "🎉 Level-up announcements will be posted in the channel where the member leveled up.");
  }
  if (sub === "levelrole") {
    const action = i.options.getString("action", true);
    const cfg2 = { ...CONFIG, levels: { ...(CONFIG.levels || {}) } };
    const g = { users: {}, levelRoles: [], levelupChannelId: "", ...(cfg2.levels[i.guild.id] || {}) };
    g.levelRoles = [...(g.levelRoles || [])];
    if (action === "add") {
      const level = i.options.getInteger("level", true);
      const role = i.options.getRole("role", true);
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
        return i.reply({ content: "I cannot assign that role (managed or above my highest role).", ephemeral: true });
      g.levelRoles = g.levelRoles.filter(r => r.level !== level);
      g.levelRoles.push({ level, roleId: role.id });
      g.levelRoles.sort((a, b) => a.level - b.level);
      cfg2.levels[i.guild.id] = g;
      saveConfig(cfg2);
      return i.reply(`🏆 Level **${level}** will now grant ${role}.`);
    }
    if (action === "remove") {
      const level = i.options.getInteger("level", true);
      g.levelRoles = g.levelRoles.filter(r => r.level !== level);
      cfg2.levels[i.guild.id] = g;
      saveConfig(cfg2);
      return i.reply(`🏆 Removed the level **${level}** role reward.`);
    }
    return i.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Level Role Rewards")
      .setDescription(g.levelRoles.map(r => `Level ${r.level} → <@&${r.roleId}>`).join("\n") || "None set — use `/config levelrole add`.")
      .setColor(0x5865F2)], ephemeral: true });
  }
  const ws = cfg.warnSettings ?? {};
  const e = new EmbedBuilder().setTitle("⚙️ ProGuard Configuration").setColor(0x5865F2)
    .addFields(
      { name: "Log Channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not configured", inline: true },
      { name: "Ticket Category", value: cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "Not configured", inline: true },
      { name: "Ticket Staff Role", value: cfg.ticketStaffRoleId ? `<@&${cfg.ticketStaffRoleId}>` : "Not configured", inline: true },
      { name: "Staff on LOA", value: `${Object.keys(cfg.loa || {}).length}`, inline: true },
      { name: "Command Logging", value: cfg.commandLogging === false ? "Disabled" : "Enabled", inline: true },
      { name: "Blacklisted Users", value: `${(cfg.blacklist || []).length}`, inline: true },
      { name: "Active Tempbans", value: `${(cfg.tempbans || []).length}`, inline: true },
      { name: "Warn Auto-Demotion", value: (ws.threshold ?? 0) > 0
        ? `After **${ws.threshold}** warnings → ${ws.demoteRoleId ? `<@&${ws.demoteRoleId}> removed` : "no role set"} (reset: ${(ws.resetAfterAction ?? true) ? "yes" : "no"})`
        : "Disabled", inline: false }
    );
  await i.reply({ embeds: [e], ephemeral: true });
});

const extra = new SlashCommandBuilder().setName("utility").setDescription("Extra server utilities.")
  .addSubcommand(s => s.setName("roleinfo").setDescription("Show role information.")
    .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
  .addSubcommand(s => s.setName("channelinfo").setDescription("Show channel information."))
  .addSubcommand(s => s.setName("permissions").setDescription("Show your important permissions."))
  .addSubcommand(s => s.setName("timestamp").setDescription("Generate a Discord timestamp.")
    .addIntegerOption(o => o.setName("unix").setDescription("Unix timestamp").setRequired(true)))
  .addSubcommand(s => s.setName("choose").setDescription("Randomly choose one option.")
    .addStringOption(o => o.setName("options").setDescription("Separate choices with commas").setRequired(true)));

add(extra, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "roleinfo") {
    const r = i.options.getRole("role", true);
    return i.reply({ embeds: [new EmbedBuilder().setTitle(`Role Info — ${r.name}`).setColor(r.color || 0x5865F2)
      .addFields(
        { name: "ID", value: r.id, inline: true },
        { name: "Position", value: `${r.position}`, inline: true },
        { name: "Members", value: `${r.members.size}`, inline: true },
        { name: "Mentionable", value: `${r.mentionable}`, inline: true },
        { name: "Managed", value: `${r.managed}`, inline: true }
      )]});
  }
  if (sub === "channelinfo") {
    const c = i.channel;
    return i.reply({ embeds: [new EmbedBuilder().setTitle(`Channel Info — ${c.name}`).setColor(0x5865F2)
      .addFields(
        { name: "ID", value: c.id, inline: true },
        { name: "Type", value: `${c.type}`, inline: true },
        { name: "Position", value: `${c.position ?? "N/A"}`, inline: true }
      )]});
  }
  if (sub === "permissions") {
    const p = i.member.permissions;
    const names = ["Administrator","ManageGuild","ManageChannels","ManageRoles","ManageMessages","KickMembers","BanMembers","ModerateMembers","ManageNicknames"]
      .map(x => `${p.has(PermissionFlagsBits[x]) ? "✅" : "❌"} ${x}`).join("\n");
    return i.reply({ content: names, ephemeral: true });
  }
  if (sub === "timestamp") {
    const unix = i.options.getInteger("unix", true);
    return i.reply(`Discord timestamps:\n<t:${unix}:F>\n<t:${unix}:R>\n\`<t:${unix}:F>\` \`<t:${unix}:R>\``);
  }
  const options = i.options.getString("options", true).split(",").map(x => x.trim()).filter(Boolean);
  return i.reply(options.length ? `🎯 **${options[Math.floor(Math.random()*options.length)]}**` : "No choices provided.");
});

const ticket = new SlashCommandBuilder().setName("ticket").setDescription("Ticket system.")
  .addSubcommand(s => s.setName("setup").setDescription("Create a ticket panel here."))
  .addSubcommand(s => s.setName("open").setDescription("Open a ticket."))
  .addSubcommand(s => s.setName("close").setDescription("Close the current ticket."))
  .addSubcommand(s => s.setName("add").setDescription("Add a user to the current ticket.")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a user from the current ticket.")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(s => s.setName("claim").setDescription("Claim the current ticket."));
ticket.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

add(ticket, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "setup") {
    const e = new EmbedBuilder().setTitle("🎫 Support Tickets").setDescription("Click the button below to open a private support ticket.").setColor(0x5865F2);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_open").setLabel("Open Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary));
    const msg = await i.channel.send({ embeds: [e], components: [row] });
    const cfg = { ...CONFIG, ticketPanelChannelId: i.channel.id, ticketPanelMessageId: msg.id };
    saveConfig(cfg);
    return i.reply({ content: "Ticket panel created.", ephemeral: true });
  }
  if (sub === "open") return createTicket(i);
  if (sub === "close") return closeTicket(i);
  if (sub === "claim") {
    if (!i.channel.name.startsWith("ticket-")) return i.reply({ content: "This is not a ticket channel.", ephemeral: true });
    await i.channel.setTopic(`Claimed by ${i.user.tag}`);
    return i.reply(`🙋 Ticket claimed by ${i.user}.`);
  }
  if (sub === "add" || sub === "remove") {
    if (!i.channel.name.startsWith("ticket-")) return i.reply({ content: "This is not a ticket channel.", ephemeral: true });
    const u = i.options.getUser("user", true);
    await i.channel.permissionOverwrites.edit(u.id, { ViewChannel: sub === "add", SendMessages: sub === "add", ReadMessageHistory: sub === "add" });
    return i.reply(`✅ ${sub === "add" ? "Added" : "Removed"} ${u} ${sub === "add" ? "to" : "from"} this ticket.`);
  }
});

async function createTicket(i) {
  const existing = i.guild.channels.cache.find(c => c.name === `ticket-${i.user.id}`);
  if (existing) return i.reply({ content: `You already have a ticket: ${existing}`, ephemeral: true });
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: ["ViewChannel"] },
    { id: i.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }
  ];
  if (CONFIG.ticketStaffRoleId) overwrites.push({ id: CONFIG.ticketStaffRoleId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"] });
  const ch = await i.guild.channels.create({
    name: `ticket-${i.user.id}`,
    type: ChannelType.GuildText,
    parent: CONFIG.ticketCategoryId || undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket opened by ${i.user.tag}`
  });
  await ch.send({ content: `${i.user} <@&${CONFIG.ticketStaffRoleId || i.guild.roles.everyone.id}>`, embeds: [
    new EmbedBuilder().setTitle("🎫 Ticket Opened").setDescription("Explain your issue here. Staff will assist you shortly.").setColor(0x57F287)
  ], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger))]});
  await i.reply({ content: `🎫 Ticket created: ${ch}`, ephemeral: true });
  await logAction(i.guild, "Ticket Opened", auditText(i, "Opened ticket", ch.toString()), 0x57F287);
}

async function closeTicket(i) {
  if (!i.channel.name.startsWith("ticket-")) return i.reply({ content: "This is not a ticket channel.", ephemeral: true });
  await i.reply("🔒 Closing ticket in 5 seconds...");
  await logAction(i.guild, "Ticket Closed", auditText(i, "Closed ticket", i.channel.toString()), 0xED4245);
  setTimeout(() => i.channel.delete(`Closed by ${i.user.tag}`).catch(() => {}), 5000);
}

// ---------- Newly added commands ----------

add(new SlashCommandBuilder().setName("botinfo").setDescription("Show bot statistics and uptime."), async i => {
  const up = process.uptime();
  const d = Math.floor(up / 86400), h = Math.floor(up % 86400 / 3600), m = Math.floor(up % 3600 / 60), s = Math.floor(up % 60);
  const mem = (process.memoryUsage().heapUsed / 1048576).toFixed(1);
  const e = new EmbedBuilder().setTitle("🤖 Bot Info").setColor(0x5865F2)
    .setThumbnail(i.client.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Uptime", value: `${d}d ${h}h ${m}m ${s}s`, inline: true },
      { name: "Latency", value: `${Math.max(0, Math.round(i.client.ws.ping))}ms`, inline: true },
      { name: "Servers", value: `${i.client.guilds.cache.size}`, inline: true },
      { name: "Memory", value: `${mem} MB`, inline: true },
      { name: "Library", value: "discord.js v14", inline: true },
      { name: "Node.js", value: process.version, inline: true }
    )
    .setFooter({ text: i.client.user.tag });
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("remind").setDescription("Set a reminder for yourself.")
  .addIntegerOption(o => o.setName("minutes").setDescription("Minutes from now").setMinValue(1).setMaxValue(10080).setRequired(true))
  .addStringOption(o => o.setName("text").setDescription("What to remind you about").setRequired(true)), async i => {
  const mins = i.options.getInteger("minutes", true);
  const text = i.options.getString("text", true);
  await i.reply(`⏰ Reminder set! I'll ping you here in **${mins} minute(s)** about: ${text}`);
  setTimeout(async () => {
    const ch = await i.client.channels.fetch(i.channelId).catch(() => null);
    if (ch) await ch.send(`⏰ <@${i.user.id}> Reminder: ${text}`).catch(() => {});
  }, mins * 60_000);
});

add(new SlashCommandBuilder().setName("roll").setDescription("Roll dice.")
  .addIntegerOption(o => o.setName("sides").setDescription("Sides per die (default 6)").setMinValue(2).setMaxValue(1000).setRequired(false))
  .addIntegerOption(o => o.setName("count").setDescription("How many dice, 1-10 (default 1)").setMinValue(1).setMaxValue(10).setRequired(false)), async i => {
  const sides = i.options.getInteger("sides") ?? 6;
  const count = i.options.getInteger("count") ?? 1;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0);
  await i.reply(`🎲 Rolling **${count}d${sides}**: ${rolls.join(", ")}${count > 1 ? ` — total **${total}**` : ""}`);
});

add(new SlashCommandBuilder().setName("rps").setDescription("Play rock paper scissors against the bot.")
  .addStringOption(o => o.setName("choice").setDescription("Your choice").setRequired(true)
    .addChoices(
      { name: "🪨 Rock", value: "rock" },
      { name: "📄 Paper", value: "paper" },
      { name: "✂️ Scissors", value: "scissors" }
    )), async i => {
  const choices = ["rock", "paper", "scissors"];
  const emoji = { rock: "🪨", paper: "📄", scissors: "✂️" };
  const yours = i.options.getString("choice", true);
  const mine = choices[Math.floor(Math.random() * choices.length)];
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  const result = yours === mine ? "It's a tie!" : beats[yours] === mine ? "You win! 🎉" : "I win! 😎";
  await i.reply(`${emoji[yours]} **${yours}** vs ${emoji[mine]} **${mine}** — ${result}`);
});

add(new SlashCommandBuilder().setName("servericon").setDescription("Show the server icon."), async i => {
  const icon = i.guild.iconURL({ size: 1024, extension: "png" });
  await i.reply(icon ? { content: icon } : { content: "This server has no icon.", ephemeral: true });
});

add(new SlashCommandBuilder().setName("stealemoji").setDescription("Copy a custom emoji from another server into this one.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
  .addStringOption(o => o.setName("emoji").setDescription("Paste the custom emoji").setRequired(true))
  .addStringOption(o => o.setName("name").setDescription("Name for the new emoji").setRequired(false)), async i => {
  const raw = i.options.getString("emoji", true);
  const idMatch = raw.match(/<a?:\w+:(\d+)>/);
  if (!idMatch) return i.reply({ content: "That's not a custom emoji — I can only copy custom emoji, not default ones.", ephemeral: true });
  const animated = raw.startsWith("<a:");
  const name = (i.options.getString("name") || raw.match(/<a?:(\w+):/)?.[1] || "emoji").replace(/[^\w]/g, "").slice(0, 32) || "emoji";
  const url = `https://cdn.discordapp.com/emojis/${idMatch[1]}.${animated ? "gif" : "png"}?size=128`;
  await i.guild.emojis.create({ attachment: url, name })
    .then(e => i.reply(`✅ Added ${e} as \`:${e.name}:\``))
    .catch(err => i.reply({ content: `Failed to add emoji: ${err.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("snipe").setDescription("Show the last deleted message in this channel."), async i => {
  const s = snipes.get(i.channel.id);
  if (!s) return i.reply({ content: "There's nothing to snipe in this channel.", ephemeral: true });
  const e = new EmbedBuilder()
    .setAuthor({ name: s.author, iconURL: s.avatar })
    .setDescription((s.content || "*[no text content]*").slice(0, 2000))
    .setColor(0xED4245)
    .setFooter({ text: "Deleted message" })
    .setTimestamp(s.at);
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("softban").setDescription("Ban and immediately unban a member (removes their recent messages).")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addIntegerOption(o => o.setName("days").setDescription("Days of messages to delete, 0-7 (default 1)").setMinValue(0).setMaxValue(7).setRequired(false))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  if (m) { const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true }); }
  const days = i.options.getInteger("days") ?? 1;
  const reason = i.options.getString("reason") ?? "No reason provided";
  await i.guild.members.ban(u.id, { reason, deleteMessageSeconds: days * 86400 })
    .then(() => i.guild.members.unban(u.id, "Softban auto-unban"))
    .then(async () => {
      await i.reply(`🧼 Softbanned **${u.tag}** (${days}d of messages removed) — ${reason}`);
      await logAction(i.guild, "Member Softbanned", auditText(i, reason, `${u.tag} (${u.id})`), 0xED4245);
    })
    .catch(e => i.reply({ content: `Softban failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("dm").setDescription("Send a direct message to a member.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addStringOption(o => o.setName("message").setDescription("Message to send").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const msg = i.options.getString("message", true);
  await u.send(`📬 **Message from ${i.guild.name}** (sent by ${i.user.tag}):\n${msg}`)
    .then(() => i.reply({ content: `📨 DM sent to **${u.tag}**.`, ephemeral: true }))
    .catch(() => i.reply({ content: "Could not DM that user — their DMs are closed or they block me.", ephemeral: true }));
  await logAction(i.guild, "DM Sent", auditText(i, msg.slice(0, 500), u.tag), 0x5865F2);
});

add(new SlashCommandBuilder().setName("setstatus").setDescription("Change the bot's activity status.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName("type").setDescription("Activity type").setRequired(true)
    .addChoices(
      { name: "Playing", value: "0" },
      { name: "Listening to", value: "2" },
      { name: "Watching", value: "3" },
      { name: "Competing in", value: "5" }
    ))
  .addStringOption(o => o.setName("text").setDescription("Activity text").setRequired(true)), async i => {
  const type = parseInt(i.options.getString("type", true), 10);
  const text = i.options.getString("text", true);
  await i.client.user.setActivity(text, { type });
  await i.reply(`✅ Status updated: **${text}**`);
});

const blacklist = new SlashCommandBuilder().setName("blacklist").setDescription("Blacklist users from using the bot.")
  .addSubcommand(s => s.setName("add").setDescription("Blacklist a user.")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a user from the blacklist.")
    .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List blacklisted users."))
  .addSubcommand(s => s.setName("check").setDescription("Check if a user is blacklisted.")
    .addUserOption(o => o.setName("user").setDescription("User (default: you)").setRequired(false)));
blacklist.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

add(blacklist, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, blacklist: [...(CONFIG.blacklist || [])] };
  if (sub === "add") {
    const u = i.options.getUser("user", true);
    if (u.bot) return i.reply({ content: "You cannot blacklist bots.", ephemeral: true });
    if (cfg.blacklist.some(b => b.userId === u.id)) return i.reply({ content: `${u.tag} is already blacklisted.`, ephemeral: true });
    const reason = i.options.getString("reason") ?? "No reason provided";
    cfg.blacklist.push({ userId: u.id, username: u.tag, reason, by: i.user.id, at: new Date().toISOString() });
    saveConfig(cfg);
    await i.reply(`⛔ **${u.tag}** has been blacklisted from using the bot — ${reason}`);
    return logAction(i.guild, "User Blacklisted", auditText(i, reason, `${u.tag} (${u.id})`), 0xED4245);
  }
  if (sub === "remove") {
    const u = i.options.getUser("user", true);
    if (!cfg.blacklist.some(b => b.userId === u.id)) return i.reply({ content: `${u.tag} is not blacklisted.`, ephemeral: true });
    cfg.blacklist = cfg.blacklist.filter(b => b.userId !== u.id);
    saveConfig(cfg);
    await i.reply(`✅ **${u.tag}** removed from the blacklist.`);
    return logAction(i.guild, "User Unblacklisted", auditText(i, "Removed from blacklist", `${u.tag} (${u.id})`), 0x57F287);
  }
  if (sub === "list") {
    if (!cfg.blacklist.length) return i.reply({ content: "The blacklist is empty.", ephemeral: true });
    const text = cfg.blacklist.map(b => `⛔ <@${b.userId}> — ${b.reason} — added <t:${Math.floor(new Date(b.at).getTime() / 1000)}:R>`).join("\n");
    return i.reply({ embeds: [new EmbedBuilder().setTitle("⛔ Bot Blacklist").setDescription(text.slice(0, 4000)).setColor(0xED4245)], ephemeral: true });
  }
  const u = i.options.getUser("user") ?? i.user;
  const entry = cfg.blacklist.find(b => b.userId === u.id);
  return i.reply({ content: entry ? `⛔ **${u.tag}** is blacklisted — ${entry.reason}` : `🟢 **${u.tag}** is not blacklisted.`, ephemeral: true });
});

add(new SlashCommandBuilder().setName("tempban").setDescription("Ban a member temporarily.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addIntegerOption(o => o.setName("hours").setDescription("Hours to keep the ban (1-8760)").setMinValue(1).setMaxValue(8760).setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  if (m) { const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true }); }
  const hours = i.options.getInteger("hours", true);
  const reason = i.options.getString("reason") ?? "No reason provided";
  const unbanAt = Date.now() + hours * 3_600_000;
  await i.guild.members.ban(u.id, { reason }).then(async () => {
    saveConfig({ ...CONFIG, tempbans: [...(CONFIG.tempbans || []),
      { userId: u.id, tag: u.tag, guildId: i.guild.id, reason, unbanAt, by: i.user.id }
    ]});
    await i.reply(`⌛ Banned **${u.tag}** for **${hours} hour(s)** (until <t:${Math.floor(unbanAt / 1000)}:F>) — ${reason}\nI will unban them automatically.`);
    await logAction(i.guild, "Member Tempbanned",
      `${auditText(i, `${hours}h — ${reason}`, `${u.tag} (${u.id})`)}\n**Auto-unban:** <t:${Math.floor(unbanAt / 1000)}:F>`, 0xED4245);
  }).catch(e => i.reply({ content: `Tempban failed: ${e.message}`, ephemeral: true }));
});

// ---------- Staff clock-in system ----------

function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400), h = Math.floor(total % 86400 / 3600),
        m = Math.floor(total % 3600 / 60), s = total % 60;
  return `${d ? `${d}d ` : ""}${h}h ${m}m ${s}s`;
}

async function doClockIn(i) {
  const cfg = { ...CONFIG, clock: { ...(CONFIG.clock || {}) } };
  const guildClock = { ...(cfg.clock[i.guild.id] || {}) };
  const rec = { inAt: null, totalMs: 0, sessions: 0, ...(guildClock[i.user.id] || {}) };
  if (rec.inAt) return i.reply({ content: `⏰ You're already clocked in (since <t:${Math.floor(rec.inAt / 1000)}:F>).`, ephemeral: true });
  rec.inAt = Date.now();
  guildClock[i.user.id] = rec;
  cfg.clock[i.guild.id] = guildClock;
  saveConfig(cfg);
  await i.reply(`🟢 **${i.user.username}** clocked in at <t:${Math.floor(rec.inAt / 1000)}:F>. Good shift!`);
  return logAction(i.guild, "Staff Clocked In", `**Staff:** ${i.user.tag} (${i.user.id})`, 0x57F287);
}

async function doClockOut(i) {
  const cfg = { ...CONFIG, clock: { ...(CONFIG.clock || {}) } };
  const guildClock = { ...(cfg.clock[i.guild.id] || {}) };
  const rec = { inAt: null, totalMs: 0, sessions: 0, ...(guildClock[i.user.id] || {}) };
  if (!rec.inAt) return i.reply({ content: "⏰ You're not clocked in.", ephemeral: true });
  const ms = Date.now() - rec.inAt;
  rec.totalMs += ms;
  rec.sessions += 1;
  rec.inAt = null;
  guildClock[i.user.id] = rec;
  cfg.clock[i.guild.id] = guildClock;
  saveConfig(cfg);
  await i.reply(`🔴 **${i.user.username}** clocked out.\n**Session:** ${fmtDuration(ms)}\n**Total:** ${fmtDuration(rec.totalMs)} across **${rec.sessions}** session(s).`);
  return logAction(i.guild, "Staff Clocked Out",
    `**Staff:** ${i.user.tag} (${i.user.id})\n**Session:** ${fmtDuration(ms)}\n**Total:** ${fmtDuration(rec.totalMs)}`, 0xED4245);
}

// Called from index.js when someone uses the clock panel buttons.
export async function handleClockButton(interaction) {
  if (interaction.customId === "clock_in") return doClockIn(interaction);
  if (interaction.customId === "clock_out") return doClockOut(interaction);
}

const clock = new SlashCommandBuilder().setName("clock").setDescription("Staff clock-in system.")
  .addSubcommand(s => s.setName("in").setDescription("Clock in for your shift."))
  .addSubcommand(s => s.setName("out").setDescription("Clock out and record your session."))
  .addSubcommand(s => s.setName("panel").setDescription("Post a clock in/out panel with buttons."))
  .addSubcommand(s => s.setName("status").setDescription("Show clock status for you or another staff member.")
    .addUserOption(o => o.setName("user").setDescription("Check another member (default: you)").setRequired(false)))
  .addSubcommand(s => s.setName("leaderboard").setDescription("Top staff by total clocked time."));

add(clock, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, clock: { ...(CONFIG.clock || {}) } };
  const guildClock = { ...(cfg.clock[i.guild.id] || {}) };
  const u = sub === "status" ? (i.options.getUser("user") ?? i.user) : i.user;

  if (sub === "in") return doClockIn(i);
  if (sub === "out") return doClockOut(i);

  if (sub === "panel") {
    const e = new EmbedBuilder().setTitle("⏰ Staff Clock Panel").setColor(0x5865F2)
      .setDescription("Click a button below to clock in or out.\nYour session time is recorded and shown in `/clock leaderboard`.");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("clock_in").setLabel("Clock In").setEmoji("🟢").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("clock_out").setLabel("Clock Out").setEmoji("🔴").setStyle(ButtonStyle.Danger)
    );
    await i.channel.send({ embeds: [e], components: [row] });
    return i.reply({ content: "✅ Clock panel created.", ephemeral: true });
  }

  if (sub === "status") {
    if (rec.inAt) {
      return i.reply(`🟢 **${u.username}** is clocked in (since <t:${Math.floor(rec.inAt / 1000)}:F>, **${fmtDuration(Date.now() - rec.inAt)}** this session).\n**Total:** ${fmtDuration(rec.totalMs)} across ${rec.sessions} session(s).`);
    }
    return i.reply(`🔴 **${u.username}** is not clocked in.\n**Total:** ${fmtDuration(rec.totalMs)} across ${rec.sessions} session(s).`);
  }

  // leaderboard
  const entries = Object.entries(guildClock)
    .map(([id, r]) => ({ id, ms: (r.totalMs || 0) + (r.inAt ? Date.now() - r.inAt : 0) }))
    .filter(x => x.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 10);
  if (!entries.length) return i.reply({ content: "No clocked time recorded yet.", ephemeral: true });
  const text = entries.map((x, n) => `**${n + 1}.** <@${x.id}> — **${fmtDuration(x.ms)}**`).join("\n");
  return i.reply({ embeds: [new EmbedBuilder().setTitle("⏰ Staff Clock Leaderboard").setDescription(text).setColor(0x5865F2)] });
});

// ---------- AutoMod configuration ----------

const automodCmd = new SlashCommandBuilder().setName("automod").setDescription("Configure automatic moderation.")
  .addSubcommand(s => s.setName("anti-invite").setDescription("Block Discord invite links.")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable?").setRequired(true)))
  .addSubcommand(s => s.setName("anti-link").setDescription("Block all links.")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable?").setRequired(true)))
  .addSubcommand(s => s.setName("anti-spam").setDescription("Timeout members who send 6+ messages in 5 seconds.")
    .addBooleanOption(o => o.setName("enabled").setDescription("Enable?").setRequired(true)))
  .addSubcommand(s => s.setName("max-mentions").setDescription("Max mentions per message (0 = off).")
    .addIntegerOption(o => o.setName("limit").setDescription("Limit").setMinValue(0).setMaxValue(50).setRequired(true)))
  .addSubcommand(s => s.setName("banned-words").setDescription("Manage banned words.")
    .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }, { name: "clear", value: "clear" }))
    .addStringOption(o => o.setName("word").setDescription("Word (for add/remove)").setRequired(false)))
  .addSubcommand(s => s.setName("ignore-channel").setDescription("Channels AutoMod skips.")
    .addStringOption(o => o.setName("action").setDescription("Action").setRequired(true)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }))
    .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(false)))
  .addSubcommand(s => s.setName("status").setDescription("Show AutoMod settings."));
automodCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function freshAutomod(guildId) {
  const cfg = { ...CONFIG, automod: { ...(CONFIG.automod || {}) } };
  cfg.automod[guildId] = {
    antiInvite: false, antiLink: false, antiSpam: false, maxMentions: 0,
    bannedWords: [], ignoredChannels: [],
    ...(cfg.automod[guildId] || {})
  };
  return cfg;
}

add(automodCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = freshAutomod(i.guild.id);
  const am = cfg.automod[i.guild.id];

  if (sub === "anti-invite" || sub === "anti-link" || sub === "anti-spam") {
    const key = sub === "anti-invite" ? "antiInvite" : sub === "anti-link" ? "antiLink" : "antiSpam";
    const on = i.options.getBoolean("enabled", true);
    am[key] = on;
    saveConfig(cfg);
    return i.reply(`🛡️ **${sub}** is now **${on ? "ON" : "OFF"}**. Members with Manage Messages are always exempt.`);
  }
  if (sub === "max-mentions") {
    am.maxMentions = i.options.getInteger("limit", true);
    saveConfig(cfg);
    return i.reply(`🛡️ Max mentions per message set to **${am.maxMentions}** (0 = off).`);
  }
  if (sub === "banned-words") {
    const action = i.options.getString("action", true);
    const word = i.options.getString("word")?.trim().toLowerCase();
    if (action === "add") {
      if (!word) return i.reply({ content: "Provide a word to add.", ephemeral: true });
      if (!am.bannedWords.includes(word)) am.bannedWords.push(word);
      saveConfig(cfg);
      return i.reply(`🛡️ Banned words (${am.bannedWords.length}): ${am.bannedWords.map(w => `\`${w}\``).join(", ").slice(0, 1900) || "none"}`);
    }
    if (action === "remove") {
      am.bannedWords = am.bannedWords.filter(w => w !== word);
      saveConfig(cfg);
      return i.reply(`🛡️ Removed. Banned words (${am.bannedWords.length}): ${am.bannedWords.map(w => `\`${w}\``).join(", ").slice(0, 1900) || "none"}`);
    }
    if (action === "clear") {
      am.bannedWords = [];
      saveConfig(cfg);
      return i.reply("🛡️ Banned words cleared.");
    }
    return i.reply(`🛡️ Banned words (${am.bannedWords.length}): ${am.bannedWords.map(w => `\`${w}\``).join(", ").slice(0, 1900) || "none"}`);
  }
  if (sub === "ignore-channel") {
    const action = i.options.getString("action", true);
    const ch = i.options.getChannel("channel");
    if (action !== "list" && !ch) return i.reply({ content: "Pick a channel.", ephemeral: true });
    if (action === "add") {
      if (!am.ignoredChannels.includes(ch.id)) am.ignoredChannels.push(ch.id);
      saveConfig(cfg);
      return i.reply(`🛡️ AutoMod now ignores ${ch}.`);
    }
    if (action === "remove") {
      am.ignoredChannels = am.ignoredChannels.filter(x => x !== ch.id);
      saveConfig(cfg);
      return i.reply(`🛡️ AutoMod no longer ignores ${ch}.`);
    }
    return i.reply(`🛡️ Ignored channels: ${am.ignoredChannels.map(id => `<#${id}>`).join(", ") || "none"}`);
  }
  const e = new EmbedBuilder().setTitle("🛡️ AutoMod Settings").setColor(0x5865F2)
    .addFields(
      { name: "Anti-invite", value: am.antiInvite ? "✅ ON" : "❌ OFF", inline: true },
      { name: "Anti-link", value: am.antiLink ? "✅ ON" : "❌ OFF", inline: true },
      { name: "Anti-spam", value: am.antiSpam ? "✅ ON" : "❌ OFF", inline: true },
      { name: "Max mentions", value: `${am.maxMentions || "off"}`, inline: true },
      { name: "Banned words", value: `${am.bannedWords.length}`, inline: true },
      { name: "Ignored channels", value: am.ignoredChannels.map(id => `<#${id}>`).join(", ") || "none", inline: false }
    );
  return i.reply({ embeds: [e], ephemeral: true });
});

// ---------- Welcome & farewell ----------

const welcomeCmd = new SlashCommandBuilder().setName("welcome").setDescription("Welcome & farewell messages.")
  .addSubcommand(s => s.setName("set").setDescription("Set the welcome message.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Placeholders: {user} {username} {server} {count}").setRequired(true)))
  .addSubcommand(s => s.setName("leave-set").setDescription("Set the farewell message.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("message").setDescription("Placeholders: {user} {username} {server} {count}").setRequired(true)))
  .addSubcommand(s => s.setName("view").setDescription("Show the current welcome & farewell messages."))
  .addSubcommand(s => s.setName("off").setDescription("Disable welcome & farewell messages."))
  .addSubcommand(s => s.setName("test").setDescription("Preview the configured messages."));
welcomeCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

add(welcomeCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, welcome: { ...(CONFIG.welcome || {}) } };
  const w = { ...(cfg.welcome[i.guild.id] || {}) };

  if (sub === "set" || sub === "leave-set") {
    const channel = i.options.getChannel("channel", true);
    const message = i.options.getString("message", true);
    if (sub === "set") { w.joinChannelId = channel.id; w.joinMessage = message; }
    else { w.leaveChannelId = channel.id; w.leaveMessage = message; }
    cfg.welcome[i.guild.id] = w;
    saveConfig(cfg);
    return i.reply(`👋 ${sub === "set" ? "Welcome" : "Farewell"} message set for ${channel}.\n**Preview:** ${formatPlaceholders(message, i.member)}`);
  }
  if (sub === "view") {
    if (!w.joinMessage && !w.leaveMessage)
      return i.reply({ content: "No welcome/farewell messages configured yet. Use `/welcome set` (run it again any time to change the message).", ephemeral: true });
    const e = new EmbedBuilder().setTitle("👋 Welcome Configuration").setColor(0x5865F2)
      .setDescription("To change a message, run `/welcome set` or `/welcome leave-set` again — it replaces the old one.")
      .addFields(
        { name: "Join message", value: w.joinMessage ? `${w.joinMessage}\n**Channel:** <#${w.joinChannelId}>` : "Not set", inline: false },
        { name: "Leave message", value: w.leaveMessage ? `${w.leaveMessage}\n**Channel:** <#${w.leaveChannelId}>` : "Not set", inline: false }
      );
    return i.reply({ embeds: [e], ephemeral: true });
  }
  if (sub === "off") {
    delete cfg.welcome[i.guild.id];
    saveConfig(cfg);
    return i.reply("👋 Welcome & farewell messages **disabled**.");
  }
  if (!w.joinMessage && !w.leaveMessage) return i.reply({ content: "No welcome/farewell messages configured. Use `/welcome set` first.", ephemeral: true });
  if (w.joinMessage && w.joinChannelId) {
    const ch = i.guild.channels.cache.get(w.joinChannelId);
    if (ch) await ch.send(`**Preview (join):** ${formatPlaceholders(w.joinMessage, i.member)}`).catch(() => {});
  }
  if (w.leaveMessage && w.leaveChannelId) {
    const ch = i.guild.channels.cache.get(w.leaveChannelId);
    if (ch) await ch.send(`**Preview (leave):** ${formatPlaceholders(w.leaveMessage, i.member)}`).catch(() => {});
  }
  return i.reply({ content: "👋 Previews sent to the configured channels.", ephemeral: true });
});

// ---------- Giveaways ----------

const giveawayCmd = new SlashCommandBuilder().setName("giveaway").setDescription("Giveaway system.")
  .addSubcommand(s => s.setName("start").setDescription("Start a giveaway.")
    .addStringOption(o => o.setName("prize").setDescription("What members can win").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes (1-1440)").setMinValue(1).setMaxValue(1440).setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners (1-20)").setMinValue(1).setMaxValue(20).setRequired(true)))
  .addSubcommand(s => s.setName("reroll").setDescription("Reroll the winner of an ended giveaway.")
    .addStringOption(o => o.setName("message_id").setDescription("ID of the ended giveaway message").setRequired(true)));
giveawayCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

add(giveawayCmd, async i => {
  if (i.options.getSubcommand() === "reroll") {
    const msg = await i.channel.messages.fetch(i.options.getString("message_id", true)).catch(() => null);
    if (!msg) return i.reply({ content: "Message not found in this channel.", ephemeral: true });
    const reaction = msg.reactions.cache.get("🎉");
    const users = reaction ? [...(await reaction.users.fetch()).values()].filter(u => !u.bot) : [];
    if (!users.length) return i.reply({ content: "No entries found on that message.", ephemeral: true });
    const winner = users[Math.floor(Math.random() * users.length)];
    await i.reply(`🎉 New winner: ${winner}! Congratulations!`);
    await msg.reply(`🎉 Rerolled — new winner: ${winner}!`).catch(() => {});
    return logAction(i.guild, "Giveaway Rerolled", `**New winner:** ${winner.tag} (${winner.id})\n**By:** ${i.user.tag}`, 0x57F287);
  }
  const prize = i.options.getString("prize", true);
  const minutes = i.options.getInteger("minutes", true);
  const winners = i.options.getInteger("winners", true);
  const endsAt = Date.now() + minutes * 60_000;
  const e = new EmbedBuilder().setTitle(`🎉 Giveaway: ${prize}`).setColor(0x57F287)
    .setDescription(`React with 🎉 to enter!\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:F>)`)
    .setFooter({ text: `Hosted by ${i.user.tag}` });
  const msg = await i.channel.send({ embeds: [e] });
  await msg.react("🎉").catch(() => {});
  await i.reply({ content: `🎉 Giveaway started in ${i.channel}!`, ephemeral: true });
  await logAction(i.guild, "Giveaway Started", `**Prize:** ${prize}\n**Duration:** ${minutes}m\n**Winners:** ${winners}\n**Host:** ${i.user.tag}`, 0x57F287);

  setTimeout(async () => {
    try {
      const fetched = await msg.fetch().catch(() => null);
      const reaction = fetched?.reactions.cache.get("🎉");
      const users = reaction ? [...(await reaction.users.fetch()).values()].filter(u => !u.bot) : [];
      if (!users.length) {
        await msg.reply("🎉 Giveaway ended — no valid entries.").catch(() => {});
        return;
      }
      const pool = [...users];
      const picked = [];
      for (let n = 0; n < Math.min(winners, pool.length); n++)
        picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      const winEmbed = new EmbedBuilder().setTitle(`🎉 Giveaway ended: ${prize}`).setColor(0xED4245)
        .setDescription(`**Winner${picked.length > 1 ? "s" : ""}:** ${picked.map(u => `${u}`).join(", ")}`)
        .setFooter({ text: `Hosted by ${i.user.tag}` });
      await msg.edit({ embeds: [winEmbed] }).catch(() => {});
      await msg.reply(`🎉 Congratulations ${picked.map(u => `${u}`).join(", ")}! You won **${prize}**!`).catch(() => {});
      await logAction(i.guild, "Giveaway Ended", `**Prize:** ${prize}\n**Winners:** ${picked.map(u => u.tag).join(", ")}`, 0x57F287);
    } catch (err) {
      console.error("Giveaway end error:", err);
    }
  }, minutes * 60_000);
});

// ---------- Reaction roles ----------

const rrCmd = new SlashCommandBuilder().setName("rr").setDescription("Reaction roles: react to get a role.")
  .addSubcommand(s => s.setName("add").setDescription("Attach a role to an emoji on a message.")
    .addStringOption(o => o.setName("message_id").setDescription("ID of the message (in this channel)").setRequired(true))
    .addStringOption(o => o.setName("emoji").setDescription("Emoji to use").setRequired(true))
    .addRoleOption(o => o.setName("role").setDescription("Role to give").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a reaction role.")
    .addStringOption(o => o.setName("message_id").setDescription("ID of the message").setRequired(true))
    .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List reaction roles in this server."));
rrCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

add(rrCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, reactionRoles: [...(CONFIG.reactionRoles || [])] };
  const emojiKey = raw => { const m = raw.match(/<a?:\w+:(\d+)>/); return m ? m[1] : raw.trim(); };

  if (sub === "list") {
    const list = cfg.reactionRoles.filter(r => r.guildId === i.guild.id);
    if (!list.length) return i.reply({ content: "No reaction roles set up in this server. Use `/rr add`.", ephemeral: true });
    const text = list.map(r => `${r.label} → <@&${r.roleId}> — message \`${r.messageId}\``).join("\n");
    return i.reply({ embeds: [new EmbedBuilder().setTitle("🔗 Reaction Roles").setDescription(text.slice(0, 4000)).setColor(0x5865F2)], ephemeral: true });
  }

  const messageId = i.options.getString("message_id", true);
  const rawEmoji = i.options.getString("emoji", true);

  if (sub === "add") {
    const role = i.options.getRole("role", true);
    if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
      return i.reply({ content: "I cannot assign that role (managed or above my highest role).", ephemeral: true });
    const msg = await i.channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return i.reply({ content: "Message not found — paste the ID of a message in **this** channel (enable Developer Mode → right-click → Copy Message ID).", ephemeral: true });
    const reacted = await msg.react(rawEmoji).then(() => true).catch(() => false);
    if (!reacted) return i.reply({ content: "Could not react with that emoji (invalid emoji, or I lack permission).", ephemeral: true });
    if (cfg.reactionRoles.some(r => r.guildId === i.guild.id && r.messageId === messageId && r.emoji === emojiKey(rawEmoji)))
      return i.reply({ content: "That emoji is already linked on that message.", ephemeral: true });
    cfg.reactionRoles.push({ guildId: i.guild.id, messageId, emoji: emojiKey(rawEmoji), label: rawEmoji, roleId: role.id });
    saveConfig(cfg);
    await i.reply(`✅ Reacting ${rawEmoji} on that message now gives ${role}.`);
    return logAction(i.guild, "Reaction Role Added", `**Message:** ${messageId}\n**Emoji:** ${rawEmoji}\n**Role:** ${role.name}\n**By:** ${i.user.tag}`, 0x5865F2);
  }

  const before = cfg.reactionRoles.length;
  cfg.reactionRoles = cfg.reactionRoles.filter(r => !(r.guildId === i.guild.id && r.messageId === messageId && r.emoji === emojiKey(rawEmoji)));
  if (cfg.reactionRoles.length === before) return i.reply({ content: "No matching reaction role found.", ephemeral: true });
  saveConfig(cfg);
  await i.reply("✅ Reaction role removed.");
  return logAction(i.guild, "Reaction Role Removed", `**Message:** ${messageId}\n**Emoji:** ${rawEmoji}\n**By:** ${i.user.tag}`, 0xFEE75C);
});

// ---------- Case system ----------

add(new SlashCommandBuilder().setName("case").setDescription("View moderation cases.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand(s => s.setName("view").setDescription("View a case by number.")
    .addIntegerOption(o => o.setName("id").setDescription("Case number").setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName("recent").setDescription("Show the most recent cases.")), async i => {
  const cases = guildCases(i.guild.id);
  if (i.options.getSubcommand() === "view") {
    const id = i.options.getInteger("id", true);
    const c = cases.find(x => x.id === id);
    if (!c) return i.reply({ content: `Case #${id} not found.`, ephemeral: true });
    const e = new EmbedBuilder().setTitle(`📁 Case #${c.id} — ${c.type}`).setColor(0x5865F2)
      .addFields(
        { name: "User", value: `<@${c.userId}> (\`${c.userId}\`)`, inline: true },
        { name: "Moderator", value: `<@${c.moderatorId}>`, inline: true },
        { name: "Date", value: `<t:${Math.floor(new Date(c.at).getTime() / 1000)}:F>`, inline: true },
        { name: "Reason", value: c.reason || "No reason", inline: false }
      );
    return i.reply({ embeds: [e], ephemeral: true });
  }
  if (!cases.length) return i.reply({ content: "No cases yet.", ephemeral: true });
  const text = cases.slice(-10).reverse().map(c =>
    `**#${c.id}** ${c.type} — <@${c.userId}> — <t:${Math.floor(new Date(c.at).getTime() / 1000)}:R> — ${c.reason || "No reason"}`
  ).join("\n");
  return i.reply({ embeds: [new EmbedBuilder().setTitle("📁 Recent Cases").setDescription(text.slice(0, 4000)).setColor(0x5865F2)], ephemeral: true });
});

add(new SlashCommandBuilder().setName("modlogs").setDescription("Show a user's moderation history.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const cases = guildCases(i.guild.id).filter(c => c.userId === u.id);
  if (!cases.length) return i.reply({ content: `🟢 **${u.tag}** has no moderation history.`, ephemeral: true });
  const counts = {};
  for (const c of cases) counts[c.type] = (counts[c.type] ?? 0) + 1;
  const summary = Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(" · ");
  const text = cases.slice(-15).reverse().map(c =>
    `**#${c.id}** ${c.type} — <t:${Math.floor(new Date(c.at).getTime() / 1000)}:R> — ${c.reason || "No reason"}`
  ).join("\n");
  return i.reply({ embeds: [new EmbedBuilder()
    .setTitle(`📁 Mod Logs — ${u.tag} (${cases.length} total)`)
    .setDescription(`**Summary:** ${summary}\n\n${text}`.slice(0, 4000))
    .setColor(0xFEE75C)], ephemeral: true });
});

add(new SlashCommandBuilder().setName("reason").setDescription("Update the reason on a moderation case.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(o => o.setName("case").setDescription("Case number").setMinValue(1).setRequired(true))
  .addStringOption(o => o.setName("new_reason").setDescription("New reason").setRequired(true)), async i => {
  const id = i.options.getInteger("case", true);
  if (!updateCaseReason(id, i.options.getString("new_reason", true)))
    return i.reply({ content: `Case #${id} not found.`, ephemeral: true });
  await i.reply(`✏️ Updated reason for case **#${id}**.`);
  return logAction(i.guild, "Case Reason Updated", `**Case:** #${id}\n**New reason:** ${i.options.getString("new_reason", true)}\n**By:** ${i.user.tag}`, 0xFEE75C);
});

// ---------- Security: lockdown & nuke ----------

add(new SlashCommandBuilder().setName("lockdown").setDescription("Lock or unlock all public text channels server-wide.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption(o => o.setName("state").setDescription("on = lock everything, off = restore").setRequired(true)
    .addChoices({ name: "🔒 on (lock all)", value: "on" }, { name: "🔓 off (unlock)", value: "off" })), async i => {
  const state = i.options.getString("state", true);
  if (state === "on") {
    const channels = [...i.guild.channels.cache.values()].filter(c => c.type === ChannelType.GuildText);
    let locked = 0;
    for (const ch of channels) {
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown by ${i.user.tag}` }).then(() => locked++).catch(() => {});
    }
    saveConfig({ ...CONFIG, lockdown: { ...(CONFIG.lockdown || {}), [i.guild.id]: channels.map(c => c.id) } });
    await i.reply(`🔒 **Lockdown active** — ${locked} channel(s) locked. Use \`/lockdown off\` to restore.`);
    return logAction(i.guild, "🔒 Server Lockdown", `**State:** ON\n**Channels locked:** ${locked}\n**By:** ${i.user.tag}`, 0xED4245);
  }
  const lockedIds = (CONFIG.lockdown || {})[i.guild.id] || [];
  let unlocked = 0;
  for (const id of lockedIds) {
    const ch = i.guild.channels.cache.get(id);
    if (ch) await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null }, { reason: `Lockdown lifted by ${i.user.tag}` }).then(() => unlocked++).catch(() => {});
  }
  saveConfig({ ...CONFIG, lockdown: { ...(CONFIG.lockdown || {}), [i.guild.id]: [] } });
  await i.reply(`🔓 **Lockdown lifted** — ${unlocked} channel(s) unlocked.`);
  return logAction(i.guild, "🔓 Lockdown Lifted", `**Channels unlocked:** ${unlocked}\n**By:** ${i.user.tag}`, 0x57F287);
});

add(new SlashCommandBuilder().setName("nuke").setDescription("Clone this channel and delete the old one (removes all messages).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addBooleanOption(o => o.setName("confirm").setDescription("Type true to confirm — this deletes every message here!").setRequired(true)), async i => {
  if (!i.options.getBoolean("confirm", true)) return i.reply({ content: "Nuke cancelled.", ephemeral: true });
  const old = i.channel;
  const clone = await old.clone({ reason: `Nuked by ${i.user.tag}` }).catch(err => {
    return i.reply({ content: `Nuke failed: ${err.message}`, ephemeral: true }) && null;
  });
  if (!clone) return;
  await clone.setPosition(old.position).catch(() => {});
  await clone.send({ embeds: [new EmbedBuilder().setTitle("💥 Channel Nuked")
    .setDescription(`This channel was nuked by ${i.user}. All previous messages are gone.`)
    .setColor(0xED4245).setTimestamp()] }).catch(() => {});
  await i.reply({ content: `💥 Nuked! Continue in ${clone}.`, ephemeral: true });
  await logAction(i.guild, "💥 Channel Nuked", `**Channel:** ${old.name} → ${clone.name}\n**By:** ${i.user.tag}`, 0xED4245);
  setTimeout(() => old.delete(`Nuked by ${i.user.tag}`).catch(() => {}), 3000);
});

// ---------- Roblox integration ----------

function robloxConfig(guildId) {
  const cfg = { ...CONFIG, roblox: { ...(CONFIG.roblox || {}) } };
  const existing = cfg.roblox[guildId] || {};
  cfg.roblox[guildId] = {
    logChannelId: "",
    players: [...(existing.players || [])],
    servers: [...(existing.servers || [])],
    startup: { ...(existing.startup || {}) }
  };
  return cfg;
}

const roblox = new SlashCommandBuilder().setName("roblox").setDescription("Roblox command logging & blacklists.")
  .addSubcommand(s => s.setName("log-channel").setDescription("Set the channel where Roblox commands are logged.")
    .addChannelOption(o => o.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s.setName("log").setDescription("Log a Roblox command that was used in-game.")
    .addStringOption(o => o.setName("executor").setDescription("Roblox username who ran the command").setRequired(true))
    .addStringOption(o => o.setName("command").setDescription("The command, e.g. :kick gamin123").setRequired(true))
    .addStringOption(o => o.setName("server").setDescription("Server ID / job ID").setRequired(false))
    .addStringOption(o => o.setName("target").setDescription("Who the command targeted").setRequired(false)))
  .addSubcommand(s => s.setName("blacklist").setDescription("Blacklist a player or server.")
    .addStringOption(o => o.setName("type").setDescription("What to blacklist").setRequired(true)
      .addChoices({ name: "player", value: "player" }, { name: "server", value: "server" }))
    .addStringOption(o => o.setName("name").setDescription("Roblox username or server ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
  .addSubcommand(s => s.setName("unblacklist").setDescription("Remove a player or server from the blacklist.")
    .addStringOption(o => o.setName("type").setDescription("What to unblacklist").setRequired(true)
      .addChoices({ name: "player", value: "player" }, { name: "server", value: "server" }))
    .addStringOption(o => o.setName("name").setDescription("Roblox username or server ID").setRequired(true)))
  .addSubcommand(s => s.setName("blacklist-list").setDescription("List blacklisted players and servers."))
  .addSubcommand(s => s.setName("check").setDescription("Check if a player or server is blacklisted.")
    .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true)
      .addChoices({ name: "player", value: "player" }, { name: "server", value: "server" }))
    .addStringOption(o => o.setName("name").setDescription("Roblox username or server ID").setRequired(true)))
  .addSubcommand(s => s.setName("startup-config").setDescription("Configure the server-startup announcement.")
    .addStringOption(o => o.setName("game_name").setDescription("Game name").setRequired(true))
    .addStringOption(o => o.setName("game_link").setDescription("Roblox game link").setRequired(true))
    .addStringOption(o => o.setName("group_link").setDescription("Roblox group link").setRequired(false))
    .addChannelOption(o => o.setName("channel").setDescription("Where startup posts go (default: where you use the command)").addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addRoleOption(o => o.setName("role1").setDescription("Role to ping on startup").setRequired(false))
    .addRoleOption(o => o.setName("role2").setDescription("Another role to ping").setRequired(false))
    .addRoleOption(o => o.setName("role3").setDescription("Another role to ping").setRequired(false)))
  .addSubcommand(s => s.setName("startup").setDescription("Post the server-startup announcement (pings configured roles).")
    .addStringOption(o => o.setName("message").setDescription("Extra message for this startup").setRequired(false)));
roblox.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

add(roblox, async i => {
  const sub = i.options.getSubcommand();
  const cfg = robloxConfig(i.guild.id);
  const rb = cfg.roblox[i.guild.id];

  if (sub === "log-channel") {
    rb.logChannelId = i.options.getChannel("channel", true).id;
    saveConfig(cfg);
    return i.reply(`🎮 Roblox command logs will now be posted in <#${rb.logChannelId}>.`);
  }

  if (sub === "log") {
    const executor = i.options.getString("executor", true);
    const command = i.options.getString("command", true);
    const server = i.options.getString("server") || "Unknown";
    const target = i.options.getString("target") || "—";
    const flags = [];
    if (rb.players.some(p => String(p.name).toLowerCase() === executor.toLowerCase()))
      flags.push("⛔ Executor is on the player blacklist");
    if (rb.servers.some(s => String(s.name) === server))
      flags.push("⛔ Server is on the server blacklist");
    const e = new EmbedBuilder().setTitle("🎮 Roblox Command Logged")
      .setColor(flags.length ? 0xED4245 : 0x5865F2)
      .addFields(
        { name: "Executor", value: executor, inline: true },
        { name: "Command", value: `\`${command.slice(0, 1000)}\``, inline: true },
        { name: "Server", value: server, inline: true },
        { name: "Target", value: target, inline: true },
        { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        ...(flags.length ? [{ name: "⚠️ Flags", value: flags.join("\n"), inline: false }] : [])
      )
      .setFooter({ text: `Logged by ${i.user.tag}` }).setTimestamp();
    const ch = rb.logChannelId ? i.guild.channels.cache.get(rb.logChannelId) : i.channel;
    if (ch?.isTextBased()) await ch.send({ embeds: [e] }).catch(() => {});
    await i.reply({ content: `🎮 Roblox command logged${rb.logChannelId ? ` in <#${rb.logChannelId}>` : ""}.${flags.length ? " ⚠️ **Blacklist flag raised!**" : ""}`, ephemeral: true });
    return logAction(i.guild, "Roblox Command Logged",
      `**Executor:** ${executor}\n**Command:** ${command}\n**Server:** ${server}\n**Target:** ${target}${flags.length ? `\n**Flags:** ${flags.join(", ")}` : ""}\n**Logged by:** ${i.user.tag}`,
      flags.length ? 0xED4245 : 0x5865F2);
  }

  if (sub === "blacklist" || sub === "unblacklist") {
    if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return i.reply({ content: "You need **Manage Server** permission to manage the Roblox blacklist.", ephemeral: true });
    const type = i.options.getString("type", true);
    const name = i.options.getString("name", true);
    const list = type === "player" ? rb.players : rb.servers;
    if (sub === "blacklist") {
      if (list.some(x => String(x.name).toLowerCase() === name.toLowerCase()))
        return i.reply({ content: `${type === "player" ? "Player" : "Server"} \`${name}\` is already blacklisted.`, ephemeral: true });
      list.push({ name, reason: i.options.getString("reason") ?? "No reason provided", by: i.user.id, at: new Date().toISOString() });
      saveConfig(cfg);
      await i.reply(`⛔ Blacklisted ${type} \`${name}\`. Logged commands from it will be flagged automatically.`);
      return logAction(i.guild, "Roblox Blacklist Added",
        `**Type:** ${type}\n**Name:** ${name}\n**Reason:** ${i.options.getString("reason") ?? "No reason provided"}\n**By:** ${i.user.tag}`, 0xED4245);
    }
    const filtered = list.filter(x => String(x.name).toLowerCase() !== name.toLowerCase());
    if (filtered.length === list.length) return i.reply({ content: `\`${name}\` is not blacklisted.`, ephemeral: true });
    if (type === "player") rb.players = filtered; else rb.servers = filtered;
    saveConfig(cfg);
    await i.reply(`✅ Removed ${type} \`${name}\` from the blacklist.`);
    return logAction(i.guild, "Roblox Blacklist Removed", `**Type:** ${type}\n**Name:** ${name}\n**By:** ${i.user.tag}`, 0x57F287);
  }

  if (sub === "blacklist-list") {
    if (!rb.players.length && !rb.servers.length) return i.reply({ content: "The Roblox blacklist is empty. Use `/roblox blacklist`.", ephemeral: true });
    const players = rb.players.map(p => `⛔ \`${p.name}\` — ${p.reason}`).join("\n") || "None";
    const servers = rb.servers.map(s => `⛔ \`${s.name}\` — ${s.reason}`).join("\n") || "None";
    return i.reply({ embeds: [new EmbedBuilder().setTitle("🎮 Roblox Blacklist").setColor(0xED4245)
      .addFields(
        { name: "Players", value: players.slice(0, 1000), inline: false },
        { name: "Servers", value: servers.slice(0, 1000), inline: false }
      )], ephemeral: true });
  }

  if (sub === "startup-config") {
    if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return i.reply({ content: "You need **Manage Server** to configure the startup announcer.", ephemeral: true });
    rb.startup = {
      gameName: i.options.getString("game_name", true),
      gameLink: i.options.getString("game_link", true),
      groupLink: i.options.getString("group_link") ?? "",
      channelId: i.options.getChannel("channel")?.id ?? "",
      roleIds: [i.options.getRole("role1"), i.options.getRole("role2"), i.options.getRole("role3")].filter(Boolean).map(r => r.id)
    };
    saveConfig(cfg);
    return i.reply(`🟢 Startup announcement configured for **${rb.startup.gameName}**.`
      + (rb.startup.channelId ? `\nPosts in: <#${rb.startup.channelId}>` : "")
      + (rb.startup.roleIds.length ? `\nPings: ${rb.startup.roleIds.map(id => `<@&${id}>`).join(" ")}` : ""));
  }

  if (sub === "startup") {
    const s = rb.startup;
    if (!s?.gameLink) return i.reply({ content: "No startup configured yet — use `/roblox startup-config` first.", ephemeral: true });
    const note = i.options.getString("message");
    const content = (s.roleIds || []).length ? s.roleIds.map(id => `<@&${id}>`).join(" ") : undefined;
    const e = new EmbedBuilder().setTitle(`🟢 ${s.gameName} — SERVER STARTUP`).setColor(0x57F287)
      .setDescription(note ? note.slice(0, 2000) : "The game server is now **up and running** — join now!")
      .addFields(
        { name: "🎮 Game", value: s.gameLink, inline: false },
        ...(s.groupLink ? [{ name: "👥 Group", value: s.groupLink, inline: false }] : [])
      )
      .setFooter({ text: `Started by ${i.user.tag}` }).setTimestamp();
    const ch = s.channelId ? i.guild.channels.cache.get(s.channelId) : i.channel;
    if (ch?.isTextBased()) await ch.send({ content, embeds: [e] }).catch(() => {});
    await i.reply({ content: `🟢 Startup announcement sent${s.channelId ? ` in <#${s.channelId}>` : ""}.`, ephemeral: true });
    return logAction(i.guild, "Roblox Server Startup", `**Game:** ${s.gameName}\n**Links:** ${s.gameLink}${s.groupLink ? ` | ${s.groupLink}` : ""}\n**By:** ${i.user.tag}`, 0x57F287);
  }

  const type = i.options.getString("type", true);
  const name = i.options.getString("name", true);
  const list = type === "player" ? rb.players : rb.servers;
  const entry = list.find(x => String(x.name).toLowerCase() === name.toLowerCase());
  return i.reply({ content: entry ? `⛔ \`${name}\` is blacklisted — ${entry.reason}` : `🟢 \`${name}\` is not blacklisted.`, ephemeral: true });
});

// ---------- Leveling commands (MEE6-style) ----------

add(new SlashCommandBuilder().setName("rank").setDescription("Show your (or someone's) level and XP.")
  .addUserOption(o => o.setName("user").setDescription("User (default: you)").setRequired(false)), async i => {
  const u = i.options.getUser("user") ?? i.user;
  const s = levelStats(i.guild.id, u.id);
  const base = 100 * s.level ** 2;
  const need = 100 * (s.level + 1) ** 2;
  const pct = Math.min(100, Math.round(((s.xp - base) / (need - base)) * 100));
  const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
  const e = new EmbedBuilder().setTitle(`📈 Rank — ${u.username}`).setColor(0x5865F2)
    .setThumbnail(u.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Level", value: `${s.level}`, inline: true },
      { name: "Total XP", value: `${s.xp}`, inline: true },
      { name: "Progress to level " + (s.level + 1), value: `${bar} ${pct}%\n${s.xp - base} / ${need - base} XP`, inline: false }
    );
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("leaderboard").setDescription("Show the top 10 most active members."), async i => {
  const top = topUsers(i.guild.id, 10);
  if (!top.length) return i.reply({ content: "No XP recorded yet — start chatting!", ephemeral: true });
  const medals = ["🥇", "🥈", "🥉"];
  const text = top.map((x, n) => `${medals[n] ?? `**${n + 1}.**`} <@${x.id}> — level **${Math.floor(Math.sqrt(x.xp / 100))}** (${x.xp} XP)`).join("\n");
  await i.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Activity Leaderboard").setDescription(text).setColor(0xFFD700)] });
});

// ---------- Mute aliases (Dyno-style) ----------

add(new SlashCommandBuilder().setName("mute").setDescription("Mute a member (timeout).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
  .addIntegerOption(o => o.setName("minutes").setDescription("Minutes (default 10)").setMinValue(1).setMaxValue(40320).setRequired(false))
  .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  const mins = i.options.getInteger("minutes") ?? 10;
  const reason = i.options.getString("reason") ?? "No reason provided";
  await m.timeout(mins * 60_000, reason).then(async () => {
    await i.reply(`🔇 Muted **${u.tag}** for **${mins} minute(s)** — ${reason}`);
    await logAction(i.guild, "Member Timed Out", auditText(i, `${mins}m — ${reason}`, `${u.tag} (${u.id})`), 0xFEE75C);
  }).catch(e => i.reply({ content: `Mute failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("unmute").setDescription("Remove a member's mute (timeout).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)), async i => {
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  const err = canAct(i, m); if (err) return i.reply({ content: err, ephemeral: true });
  await m.timeout(null, `Unmuted by ${i.user.tag}`).then(async () => {
    await i.reply(`🔊 Unmuted **${u.tag}**.`);
    await logAction(i.guild, "Timeout Removed", auditText(i, "Removed mute", `${u.tag} (${u.id})`), 0x57F287);
  }).catch(e => i.reply({ content: `Unmute failed: ${e.message}`, ephemeral: true }));
});

add(new SlashCommandBuilder().setName("banlist").setDescription("List all banned users on this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers), async i => {
  const bans = await i.guild.bans.fetch().catch(() => null);
  if (!bans || !bans.size) return i.reply({ content: "🟢 No users are currently banned.", ephemeral: true });
  const text = bans.map(b => `• **${b.user.tag}** (\`${b.user.id}\`)${b.reason ? ` — ${b.reason}` : ""}`).join("\n");
  await i.reply({ embeds: [new EmbedBuilder().setTitle(`🔨 Ban List (${bans.size})`).setDescription(text.slice(0, 4000)).setColor(0xED4245)], ephemeral: true });
});

add(new SlashCommandBuilder().setName("invite").setDescription("Get the bot's invite link."), async i => {
  await i.reply(`📨 Invite me with this link:\n<https://discord.com/oauth2/authorize?client_id=${i.client.user.id}&scope=bot+applications.commands>`);
});

// ---------- Voice moderation ----------

const voice = new SlashCommandBuilder().setName("voice").setDescription("Voice channel moderation.")
  .addSubcommand(s => s.setName("kick").setDescription("Disconnect a member from voice.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
  .addSubcommand(s => s.setName("move").setDescription("Move a member to another voice channel.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Destination voice channel").addChannelTypes(ChannelType.GuildVoice).setRequired(true)))
  .addSubcommand(s => s.setName("mute").setDescription("Server-mute a member in voice.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
  .addSubcommand(s => s.setName("unmute").setDescription("Remove a member's server-mute.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)));
voice.setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers);

add(voice, async i => {
  const sub = i.options.getSubcommand();
  const u = i.options.getUser("user", true);
  const m = await i.guild.members.fetch(u.id).catch(() => null);
  if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
  if (!m.voice?.channel) return i.reply({ content: `**${u.tag}** is not in a voice channel.`, ephemeral: true });

  if (sub === "kick") {
    await m.voice.disconnect(`Voice kicked by ${i.user.tag}`);
    await i.reply(`🔈 Disconnected **${u.tag}** from voice.`);
    return logAction(i.guild, "Voice Kick", auditText(i, "Disconnected from voice", `${u.tag} (${u.id})`), 0xFEE75C);
  }
  if (sub === "move") {
    const ch = i.options.getChannel("channel", true);
    await m.voice.setChannel(ch, `Moved by ${i.user.tag}`);
    await i.reply(`➡️ Moved **${u.tag}** to ${ch}.`);
    return logAction(i.guild, "Voice Move", auditText(i, `Moved to ${ch.name}`, `${u.tag} (${u.id})`), 0x5865F2);
  }
  if (sub === "mute") {
    await m.voice.setMute(true, `Server-muted by ${i.user.tag}`);
    await i.reply(`🔇 Server-muted **${u.tag}** in voice.`);
    return logAction(i.guild, "Voice Mute", auditText(i, "Server-muted in voice", `${u.tag} (${u.id})`), 0xFEE75C);
  }
  await m.voice.setMute(false, `Server-unmuted by ${i.user.tag}`);
  await i.reply(`🔊 Removed server-mute from **${u.tag}**.`);
  return logAction(i.guild, "Voice Unmute", auditText(i, "Removed server-mute", `${u.tag} (${u.id})`), 0x57F287);
});

// ---------- Channel management ----------

const channelCmd = new SlashCommandBuilder().setName("channel").setDescription("Manage channels.")
  .addSubcommand(s => s.setName("create").setDescription("Create a channel.")
    .addStringOption(o => o.setName("name").setDescription("Channel name").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Type").setRequired(false)
      .addChoices({ name: "text", value: "text" }, { name: "voice", value: "voice" }))
    .addStringOption(o => o.setName("topic").setDescription("Topic (text channels)").setRequired(false)))
  .addSubcommand(s => s.setName("delete").setDescription("Delete a channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to delete").setRequired(true)))
  .addSubcommand(s => s.setName("rename").setDescription("Rename a channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Channel (default: this one)").setRequired(false))
    .addStringOption(o => o.setName("name").setDescription("New name").setRequired(true)))
  .addSubcommand(s => s.setName("topic").setDescription("Change the channel topic.")
    .addStringOption(o => o.setName("text").setDescription("New topic (use 'clear' to remove)").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Channel (default: this one)").setRequired(false)));
channelCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

add(channelCmd, async i => {
  const sub = i.options.getSubcommand();
  if (sub === "create") {
    const name = i.options.getString("name", true).toLowerCase().replace(/\s+/g, "-").slice(0, 100);
    const type = i.options.getString("type") === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
    const ch = await i.guild.channels.create({ name, type, topic: i.options.getString("topic") || undefined, reason: `Created by ${i.user.tag}` });
    await i.reply(`✅ Created ${ch}.`);
    return logAction(i.guild, "Channel Created", auditText(i, `Created ${type} channel`, ch.toString()), 0x57F287);
  }
  if (sub === "delete") {
    const ch = i.options.getChannel("channel", true);
    const name = ch.name;
    await ch.delete(`Deleted by ${i.user.tag}`);
    await i.reply(`🗑️ Deleted channel **${name}**.`);
    return logAction(i.guild, "Channel Deleted", auditText(i, "Deleted channel", name), 0xED4245);
  }
  const ch = i.options.getChannel("channel") ?? i.channel;
  if (sub === "rename") {
    const name = i.options.getString("name", true).toLowerCase().replace(/\s+/g, "-").slice(0, 100);
    const oldName = ch.name;
    await ch.setName(name, `Renamed by ${i.user.tag}`);
    await i.reply(`✏️ Renamed **${oldName}** → **${name}**.`);
    return logAction(i.guild, "Channel Renamed", auditText(i, `${oldName} → ${name}`, ch.toString()), 0xFEE75C);
  }
  const text = i.options.getString("topic", true);
  await ch.setTopic(text.toLowerCase() === "clear" ? "" : text, `Topic set by ${i.user.tag}`);
  await i.reply(text.toLowerCase() === "clear" ? `🧹 Cleared the topic of ${ch}.` : `📋 Topic set for ${ch}.`);
  return logAction(i.guild, "Channel Topic Changed", auditText(i, text.slice(0, 200), ch.toString()), 0x5865F2);
});

// ---------- Quick utilities ----------

add(new SlashCommandBuilder().setName("firstmessage").setDescription("Link to the very first message in this channel."), async i => {
  await i.deferReply();
  let oldest = null;
  let before;
  for (let page = 0; page < 10; page++) {
    const batch = await i.channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    before = batch.last().id;
    oldest = batch.last();
    if (batch.size < 100) break;
  }
  await i.editReply(oldest ? `🕰️ The first message in this channel:\n${oldest.url}` : "Couldn't find any messages in this channel.");
});

add(new SlashCommandBuilder().setName("emojis").setDescription("List this server's custom emojis."), async i => {
  const all = [...i.guild.emojis.cache.values()];
  if (!all.length) return i.reply({ content: "This server has no custom emojis.", ephemeral: true });
  const statics = all.filter(e => !e.animated).map(e => `${e} \`:${e.name}:\``).join("\n") || "None";
  const animated = all.filter(e => e.animated).map(e => `${e} \`:${e.name}:\``).join("\n") || "None";
  await i.reply({ embeds: [new EmbedBuilder().setTitle(`😀 Server Emojis (${all.length})`).setColor(0x5865F2)
    .addFields(
      { name: "Static", value: statics.slice(0, 1000), inline: true },
      { name: "Animated", value: animated.slice(0, 1000), inline: true }
    )], ephemeral: true });
});

add(new SlashCommandBuilder().setName("banner").setDescription("Show a user's profile banner.")
  .addUserOption(o => o.setName("user").setDescription("User (default: you)").setRequired(false)), async i => {
  const u = i.options.getUser("user") ?? i.user;
  await i.deferReply();
  const full = await i.client.users.fetch(u.id, { force: true }).catch(() => null);
  const banner = full?.bannerURL({ size: 1024 });
  if (banner) return i.editReply(banner);
  return i.editReply(`**${u.tag}** doesn't have a profile banner set.`);
});

// ---------- Custom auto-responses (Carl-bot triggers) ----------

const triggerCmd = new SlashCommandBuilder().setName("trigger").setDescription("Custom auto-responses.")
  .addSubcommand(s => s.setName("add").setDescription("Add an auto-response.")
    .addStringOption(o => o.setName("trigger").setDescription("Text to watch for").setRequired(true))
    .addStringOption(o => o.setName("response").setDescription("What the bot replies").setRequired(true))
    .addStringOption(o => o.setName("match").setDescription("Match type").setRequired(false)
      .addChoices({ name: "contains", value: "contains" }, { name: "exact", value: "exact" })))
  .addSubcommand(s => s.setName("remove").setDescription("Remove an auto-response.")
    .addStringOption(o => o.setName("trigger").setDescription("Trigger to remove").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List all auto-responses."));
triggerCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

add(triggerCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, triggers: { ...(CONFIG.triggers || {}) } };
  const list = [...(cfg.triggers[i.guild.id] || [])];
  if (sub === "add") {
    const trigger = i.options.getString("trigger", true);
    const response = i.options.getString("response", true);
    const exact = i.options.getString("match") === "exact";
    if (list.some(t => t.match.toLowerCase() === trigger.toLowerCase()))
      return i.reply({ content: "That trigger already exists — remove it first.", ephemeral: true });
    list.push({ match: trigger, response, exact });
    cfg.triggers[i.guild.id] = list;
    saveConfig(cfg);
    return i.reply(`✅ Auto-response added: \`${trigger}\` → ${response} (${exact ? "exact match" : "contains match"})`);
  }
  if (sub === "remove") {
    const trigger = i.options.getString("trigger", true);
    const filtered = list.filter(t => t.match.toLowerCase() !== trigger.toLowerCase());
    if (filtered.length === list.length) return i.reply({ content: "Trigger not found.", ephemeral: true });
    cfg.triggers[i.guild.id] = filtered;
    saveConfig(cfg);
    return i.reply("✅ Trigger removed.");
  }
  if (!list.length) return i.reply({ content: "No auto-responses yet. Use `/trigger add`.", ephemeral: true });
  return i.reply({ embeds: [new EmbedBuilder().setTitle("💬 Auto-responses").setColor(0x5865F2)
    .setDescription(list.map(t => `\`${t.match}\` → ${t.response.slice(0, 100)}${t.exact ? " *(exact)*" : ""}`).join("\n").slice(0, 4000))], ephemeral: true });
});

// ---------- AFK (Dyno-style) ----------

add(new SlashCommandBuilder().setName("afk").setDescription("Set an AFK status shown when you're mentioned.")
  .addStringOption(o => o.setName("message").setDescription("Why you're away (default: AFK)").setRequired(false)), async i => {
  const msg = i.options.getString("message") || "AFK";
  const cfg = { ...CONFIG, afk: { ...(CONFIG.afk || {}) } };
  const g = { ...(cfg.afk[i.guild.id] || {}) };
  g[i.user.id] = { message: msg, since: new Date().toISOString() };
  cfg.afk[i.guild.id] = g;
  saveConfig(cfg);
  await i.reply(`💤 **${i.user.username}** is now AFK: ${msg}\nIt clears automatically when you send a message.`);
});

// ---------- Sticky messages (Carl-bot style) ----------

const stickyCmd = new SlashCommandBuilder().setName("sticky").setDescription("Keep a message at the bottom of a channel.")
  .addSubcommand(s => s.setName("set").setDescription("Set the sticky message for this channel.")
    .addStringOption(o => o.setName("message").setDescription("Message to keep reposting").setRequired(true)))
  .addSubcommand(s => s.setName("off").setDescription("Remove the sticky message from this channel."));
stickyCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

add(stickyCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, sticky: { ...(CONFIG.sticky || {}) } };
  const g = { ...(cfg.sticky[i.guild.id] || {}) };
  if (sub === "set") {
    const message = i.options.getString("message", true);
    g[i.channel.id] = { message, lastMessageId: null };
    cfg.sticky[i.guild.id] = g;
    saveConfig(cfg);
    const sent = await i.channel.send(message).catch(() => null);
    if (sent) {
      cfg.sticky[i.guild.id][i.channel.id].lastMessageId = sent.id;
      saveConfig(cfg);
    }
    return i.reply({ content: `📌 Sticky message set for ${i.channel} — it will repost as people chat.`, ephemeral: true });
  }
  const s = g[i.channel.id];
  if (!s) return i.reply({ content: "There's no sticky message in this channel.", ephemeral: true });
  if (s.lastMessageId) await i.channel.messages.delete(s.lastMessageId).catch(() => {});
  delete g[i.channel.id];
  cfg.sticky[i.guild.id] = g;
  saveConfig(cfg);
  return i.reply({ content: "📌 Sticky message removed.", ephemeral: true });
});

// ---------- Starboard ----------

const starCmd = new SlashCommandBuilder().setName("starboard").setDescription("Highlight messages with ⭐ reactions.")
  .addSubcommand(s => s.setName("set").setDescription("Set the starboard channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Starboard channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addIntegerOption(o => o.setName("min_stars").setDescription("Stars needed (default 3)").setMinValue(1).setMaxValue(50).setRequired(false)))
  .addSubcommand(s => s.setName("off").setDescription("Disable the starboard."));
starCmd.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

add(starCmd, async i => {
  const sub = i.options.getSubcommand();
  const cfg = { ...CONFIG, starboard: { ...(CONFIG.starboard || {}) } };
  if (sub === "set") {
    cfg.starboard[i.guild.id] = {
      channelId: i.options.getChannel("channel", true).id,
      minStars: i.options.getInteger("min_stars") ?? 3
    };
    saveConfig(cfg);
    return i.reply(`⭐ Starboard set to ${i.options.getChannel("channel", true)} — messages need **${cfg.starboard[i.guild.id].minStars}** ⭐ to appear.`);
  }
  delete cfg.starboard[i.guild.id];
  saveConfig(cfg);
  return i.reply("⭐ Starboard **disabled**.");
});

// ---------- Fun commands (live from public APIs) ----------

add(new SlashCommandBuilder().setName("meme").setDescription("Get a random meme."), async i => {
  await i.deferReply();
  try {
    const res = await fetch("https://meme-api.com/gimme");
    const data = await res.json();
    if (!data?.url) throw new Error("no meme");
    await i.editReply({ embeds: [new EmbedBuilder()
      .setTitle((data.title || "Meme").slice(0, 256))
      .setImage(data.url)
      .setColor(0x5865F2)
      .setFooter({ text: `r/${data.subreddit ?? "memes"} · 👍 ${data.ups ?? "?"}` })] });
  } catch {
    await i.editReply("Couldn't fetch a meme right now — try again in a moment.");
  }
});

add(new SlashCommandBuilder().setName("joke").setDescription("Get a random joke."), async i => {
  await i.deferReply();
  try {
    const res = await fetch("https://official-joke-api.appspot.com/random_joke");
    const data = await res.json();
    if (!data?.setup) throw new Error("no joke");
    await i.editReply(`😄 **${data.setup}**\n||${data.punchline}||`);
  } catch {
    const fallback = ["Why don't scientists trust atoms? Because they make up everything!", "I told my computer I needed a break — it said 'no problem, I'll go to sleep'."];
    await i.editReply(`😄 ${fallback[Math.floor(Math.random() * fallback.length)]}`);
  }
});

add(new SlashCommandBuilder().setName("cat").setDescription("Get a random cat picture."), async i => {
  await i.deferReply();
  try {
    const res = await fetch("https://api.thecatapi.com/v1/images/search");
    const data = await res.json();
    if (!data?.[0]?.url) throw new Error("no cat");
    await i.editReply({ embeds: [new EmbedBuilder().setTitle("🐱 Meow!").setImage(data[0].url).setColor(0x5865F2)] });
  } catch {
    await i.editReply("Couldn't fetch a cat right now — try again.");
  }
});

add(new SlashCommandBuilder().setName("dog").setDescription("Get a random dog picture."), async i => {
  await i.deferReply();
  try {
    const res = await fetch("https://dog.ceo/api/breeds/image/random");
    const data = await res.json();
    if (!data?.message) throw new Error("no dog");
    await i.editReply({ embeds: [new EmbedBuilder().setTitle("🐶 Woof!").setImage(data.message).setColor(0x5865F2)] });
  } catch {
    await i.editReply("Couldn't fetch a dog right now — try again.");
  }
});

// ---------- Economy (Dank Memer / UnbelievaBoat style) ----------

function freshEcon(guildId) {
  const cfg = { ...CONFIG, econ: { ...(CONFIG.econ || {}) } };
  cfg.econ[guildId] = { ...(cfg.econ[guildId] || {}) };
  return cfg;
}

function econUser(cfg, guildId, userId) {
  cfg.econ[guildId][userId] = { wallet: 0, lastDaily: 0, lastWork: 0, ...(cfg.econ[guildId][userId] || {}) };
  return cfg.econ[guildId][userId];
}

const econ = new SlashCommandBuilder().setName("economy").setDescription("Coins, dailies, gambling and more.")
  .addSubcommand(s => s.setName("balance").setDescription("Show your (or someone's) coins.")
    .addUserOption(o => o.setName("user").setDescription("User (default: you)").setRequired(false)))
  .addSubcommand(s => s.setName("daily").setDescription("Claim your daily coins."))
  .addSubcommand(s => s.setName("work").setDescription("Work a shift and earn coins."))
  .addSubcommand(s => s.setName("gamble").setDescription("Gamble your coins.")
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to bet").setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName("rob").setDescription("Try to rob another member.")
    .addUserOption(o => o.setName("user").setDescription("Victim").setRequired(true)))
  .addSubcommand(s => s.setName("pay").setDescription("Give coins to another member.")
    .addUserOption(o => o.setName("user").setDescription("Recipient").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Coins to send").setMinValue(1).setRequired(true)))
  .addSubcommand(s => s.setName("leaderboard").setDescription("Richest members on the server."));

add(econ, async i => {
  const sub = i.options.getSubcommand();
  const cfg = freshEcon(i.guild.id);
  const me = econUser(cfg, i.guild.id, i.user.id);

  if (sub === "balance") {
    const u = i.options.getUser("user") ?? i.user;
    const rec = econUser(cfg, i.guild.id, u.id);
    return i.reply({ embeds: [new EmbedBuilder().setTitle(`💰 ${u.username}'s wallet`).setColor(0xFFD700)
      .setDescription(`🪙 **${rec.wallet.toLocaleString()}** coins`)] });
  }

  if (sub === "daily") {
    const now = Date.now();
    if (now - me.lastDaily < 86_400_000) {
      const next = me.lastDaily + 86_400_000;
      return i.reply({ content: `⏳ You already claimed your daily! Next claim: <t:${Math.floor(next / 1000)}:R>.`, ephemeral: true });
    }
    me.lastDaily = now;
    me.wallet += 500;
    saveConfig(cfg);
    return i.reply(`🪙 **${i.user.username}** claimed their daily **500** coins! Wallet: **${me.wallet.toLocaleString()}**.`);
  }

  if (sub === "work") {
    const now = Date.now();
    if (now - me.lastWork < 1_800_000) {
      const next = me.lastWork + 1_800_000;
      return i.reply({ content: `🛠️ You're tired! Next shift: <t:${Math.floor(next / 1000)}:R>.`, ephemeral: true });
    }
    const earned = 80 + Math.floor(Math.random() * 141);
    me.lastWork = now;
    me.wallet += earned;
    saveConfig(cfg);
    const jobs = ["moderating the server", "fixing the bot", "herding cats", "delivering pizza", "counting coins", "cleaning the ticket queue"];
    return i.reply(`🛠️ **${i.user.username}** worked as *${jobs[Math.floor(Math.random() * jobs.length)]}* and earned **${earned}** coins! Wallet: **${me.wallet.toLocaleString()}**.`);
  }

  if (sub === "gamble") {
    const amount = i.options.getInteger("amount", true);
    if (me.wallet < amount) return i.reply({ content: `You only have **${me.wallet}** coins.`, ephemeral: true });
    const win = Math.random() < 0.45;
    me.wallet += win ? amount : -amount;
    saveConfig(cfg);
    return i.reply(win
      ? `🎰 You won **${amount}** coins! Wallet: **${me.wallet.toLocaleString()}** 🎉`
      : `🎰 You lost **${amount}** coins. Wallet: **${me.wallet.toLocaleString()}** 💀`);
  }

  if (sub === "rob") {
    const u = i.options.getUser("user", true);
    if (u.id === i.user.id) return i.reply({ content: "You can't rob yourself.", ephemeral: true });
    if (u.bot) return i.reply({ content: "Bots don't carry coins.", ephemeral: true });
    const victim = econUser(cfg, i.guild.id, u.id);
    if (victim.wallet < 50) return i.reply({ content: `${u.username} is too broke to rob.`, ephemeral: true });
    const success = Math.random() < 0.4;
    if (success) {
      const stolen = Math.floor(victim.wallet * (0.2 + Math.random() * 0.3));
      victim.wallet -= stolen; me.wallet += stolen;
      saveConfig(cfg);
      return i.reply(`🕵️ You robbed **${u.username}** and got away with **${stolen}** coins! Wallet: **${me.wallet.toLocaleString()}**`);
    }
    const fine = Math.min(me.wallet, 100);
    me.wallet -= fine;
    saveConfig(cfg);
    return i.reply(`🚨 You got caught robbing **${u.username}** and paid a **${fine}** coin fine! Wallet: **${me.wallet.toLocaleString()}**`);
  }

  if (sub === "pay") {
    const u = i.options.getUser("user", true);
    const amount = i.options.getInteger("amount", true);
    if (u.bot) return i.reply({ content: "Bots don't accept coins.", ephemeral: true });
    if (me.wallet < amount) return i.reply({ content: `You only have **${me.wallet}** coins.`, ephemeral: true });
    const rec = econUser(cfg, i.guild.id, u.id);
    me.wallet -= amount; rec.wallet += amount;
    saveConfig(cfg);
    return i.reply(`💸 **${i.user.username}** paid **${amount}** coins to **${u.username}**.`);
  }

  const top = Object.entries(cfg.econ[i.guild.id])
    .map(([id, r]) => ({ id, wallet: r.wallet || 0 }))
    .sort((a, b) => b.wallet - a.wallet)
    .slice(0, 10);
  if (!top.length) return i.reply({ content: "Nobody has coins yet — claim `/economy daily`!", ephemeral: true });
  const medals = ["🥇", "🥈", "🥉"];
  const text = top.map((x, n) => `${medals[n] ?? `**${n + 1}.**`} <@${x.id}> — 🪙 **${x.wallet.toLocaleString()}**`).join("\n");
  return i.reply({ embeds: [new EmbedBuilder().setTitle("💰 Coin Leaderboard").setDescription(text).setColor(0xFFD700)] });
});

// ---------- Trivia (interactive with buttons) ----------

const triviaGames = new Map();

function decodeHtml(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
}

add(new SlashCommandBuilder().setName("trivia").setDescription("Play a trivia question with buttons."), async i => {
  await i.deferReply();
  let data;
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple");
    const j = await res.json();
    data = j.results?.[0];
    if (!data) throw new Error("none");
  } catch {
    return i.editReply("Couldn't fetch a trivia question — try again in a moment.");
  }
  const question = decodeHtml(data.question);
  const answers = [data.correct_answer, ...data.incorrect_answers].map(decodeHtml);
  for (let n = answers.length - 1; n > 0; n--) {
    const r = Math.floor(Math.random() * (n + 1));
    [answers[n], answers[r]] = [answers[r], answers[n]];
  }
  const correctIdx = answers.indexOf(decodeHtml(data.correct_answer));
  const e = new EmbedBuilder().setTitle("🧠 Trivia!").setColor(0x5865F2)
    .setDescription(`**${question}**\n\nCategory: ${data.category} · Difficulty: ${data.difficulty}\nYou have **20 seconds** — first correct answer wins!`);
  const row = new ActionRowBuilder().addComponents(
    answers.map((a, idx) => new ButtonBuilder().setCustomId(`trivia_${idx}`).setLabel(a.slice(0, 80)).setStyle(ButtonStyle.Primary))
  );
  const msg = await i.editReply({ embeds: [e], components: [row] });
  triviaGames.set(msg.id, { correctIdx, winner: null });

  const collector = msg.createMessageComponentCollector({ time: 20_000 });
  collector.on("collect", async bi => {
    if (bi.customId !== `trivia_${correctIdx}`)
      return bi.reply({ content: `❌ Wrong, ${bi.user}!`, ephemeral: true });
    const game = triviaGames.get(msg.id);
    if (game.winner) return bi.reply({ content: "Someone already answered correctly!", ephemeral: true });
    game.winner = bi.user.id;
    await bi.reply(`✅ **${bi.user.username}** got it right! The answer was **${answers[correctIdx]}**.`);
    collector.stop("answered");
  });
  collector.on("end", async () => {
    const game = triviaGames.get(msg.id);
    const disabled = new ActionRowBuilder().addComponents(
      answers.map((a, idx) => new ButtonBuilder().setCustomId(`trivia_${idx}`).setLabel(a.slice(0, 80))
        .setStyle(game?.winner && idx === correctIdx ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true))
    );
    await msg.edit({ components: [disabled] }).catch(() => {});
    if (!game?.winner) await i.channel.send(`⏰ Time's up! The answer was **${answers[correctIdx]}**.`).catch(() => {});
    triviaGames.delete(msg.id);
  });
});

// ---------- Action GIFs (fun-bot style) ----------

add(new SlashCommandBuilder().setName("action").setDescription("Send an animated action to someone.")
  .addStringOption(o => o.setName("type").setDescription("Action").setRequired(true)
    .addChoices(
      { name: "🤗 Hug", value: "hug" },
      { name: "🥰 Pat", value: "pat" },
      { name: "👊 Punch", value: "punch" },
      { name: "😘 Kiss", value: "kiss" }
    ))
  .addUserOption(o => o.setName("user").setDescription("Who (optional)").setRequired(false)), async i => {
  const type = i.options.getString("type", true);
  const target = i.options.getUser("user");
  await i.deferReply();
  try {
    const res = await fetch(`https://api.waifu.pics/sfw/${type}`);
    const data = await res.json();
    if (!data?.url) throw new Error("none");
    const verbs = { hug: "hugs", pat: "pats", punch: "punches", kiss: "kisses" };
    await i.editReply({
      content: target ? `**${i.user.username}** ${verbs[type]} ${target}` : `**${i.user.username}** ${verbs[type]} the air 👋`,
      embeds: [new EmbedBuilder().setImage(data.url).setColor(0x5865F2)]
    });
  } catch {
    await i.editReply("Couldn't fetch a GIF right now — try again.");
  }
});

// ---------- Smart tools ----------

add(new SlashCommandBuilder().setName("urban").setDescription("Look up a term on Urban Dictionary.")
  .addStringOption(o => o.setName("term").setDescription("Term to look up").setRequired(true)), async i => {
  const term = i.options.getString("term", true);
  await i.deferReply();
  try {
    const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
    const data = await res.json();
    const entry = data.list?.[0];
    if (!entry) return i.editReply(`No Urban Dictionary results for **${term}**.`);
    const clean = s => String(s).replace(/\[(.+?)\]/g, "$1");
    await i.editReply({ embeds: [new EmbedBuilder().setTitle(`📖 ${entry.word}`).setColor(0x5865F2)
      .addFields(
        { name: "Definition", value: clean(entry.definition).slice(0, 1024) || "—" },
        { name: "Example", value: clean(entry.example).slice(0, 1024) || "—" }
      )
      .setFooter({ text: `👍 ${entry.thumbs_up} 👎 ${entry.thumbs_down}` })] });
  } catch {
    await i.editReply("Urban Dictionary is unreachable right now.");
  }
});

add(new SlashCommandBuilder().setName("wiki").setDescription("Search Wikipedia.")
  .addStringOption(o => o.setName("topic").setDescription("Article to look up").setRequired(true)), async i => {
  const topic = i.options.getString("topic", true);
  await i.deferReply();
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`);
    if (!res.ok) throw new Error("none");
    const data = await res.json();
    if (!data.extract) throw new Error("none");
    const e = new EmbedBuilder().setTitle(`📚 ${data.title}`).setColor(0x5865F2)
      .setDescription(data.extract.slice(0, 2000));
    if (data.thumbnail?.source) e.setThumbnail(data.thumbnail.source);
    if (data.content_urls?.desktop?.page) e.setURL(data.content_urls.desktop.page);
    await i.editReply({ embeds: [e] });
  } catch {
    await i.editReply(`No Wikipedia article found for **${topic}**.`);
  }
});

const WMO = {
  0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Rime fog"], 51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"],
  55: ["🌧️", "Heavy drizzle"], 61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
  71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 80: ["🌦️", "Rain showers"],
  81: ["🌧️", "Showers"], 82: ["⛈️", "Heavy showers"], 95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm with hail"], 99: ["⛈️", "Severe thunderstorm"]
};

add(new SlashCommandBuilder().setName("weather").setDescription("Current weather for a city.")
  .addStringOption(o => o.setName("city").setDescription("City name").setRequired(true)), async i => {
  const city = i.options.getString("city", true);
  await i.deferReply();
  try {
    const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`)).json();
    const place = geo.results?.[0];
    if (!place) return i.editReply(`Couldn't find a city called **${city}**.`);
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`)).json();
    const c = w.current;
    const [icon, desc] = WMO[c.weather_code] ?? ["🌡️", "Unknown"];
    await i.editReply({ embeds: [new EmbedBuilder()
      .setTitle(`${icon} Weather in ${place.name}${place.country ? `, ${place.country}` : ""}`)
      .setColor(0x5865F2)
      .addFields(
        { name: "Temperature", value: `${c.temperature_2m}°C`, inline: true },
        { name: "Conditions", value: desc, inline: true },
        { name: "Wind", value: `${c.wind_speed_10m} km/h`, inline: true },
        { name: "Humidity", value: `${c.relative_humidity_2m}%`, inline: true }
      )] });
  } catch {
    await i.editReply("Couldn't fetch weather right now — try again.");
  }
});

add(new SlashCommandBuilder().setName("calculate").setDescription("Do some quick math.")
  .addStringOption(o => o.setName("expression").setDescription("e.g. (4+5)*3 / 2").setRequired(true)), async i => {
  const raw = i.options.getString("expression", true);
  const expr = raw.replace(/\^/g, "**");
  if (!/^[\d+\-*/().%\s]+$/.test(expr))
    return i.reply({ content: "Only numbers and + - * / ( ) % . are allowed.", ephemeral: true });
  try {
    const result = Function(`"use strict"; return (${expr});`)();
    if (typeof result !== "number" || !isFinite(result)) throw new Error("bad");
    await i.reply(`🧮 \`${raw}\` = **${Number(result.toFixed(6))}**`);
  } catch {
    await i.reply({ content: "That expression couldn't be calculated.", ephemeral: true });
  }
});

add(new SlashCommandBuilder().setName("serverbanner").setDescription("Show the server's banner and invite splash."), async i => {
  const banner = i.guild.bannerURL({ size: 1024 });
  const splash = i.guild.splashURL({ size: 1024 });
  if (!banner && !splash)
    return i.reply({ content: "This server has no banner or invite splash (banners need boost level 2+).", ephemeral: true });
  const e = new EmbedBuilder().setTitle(`🖼️ ${i.guild.name} artwork`).setColor(0x5865F2);
  const fields = [];
  if (banner) { e.setImage(banner); fields.push({ name: "Banner", value: banner }); }
  if (splash) fields.push({ name: "Invite splash", value: splash });
  e.addFields(fields);
  await i.reply({ embeds: [e] });
});

add(new SlashCommandBuilder().setName("massrole").setDescription("Add or remove a role from ALL human members.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName("action").setDescription("Add or remove").setRequired(true)
    .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }))
  .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
  .addBooleanOption(o => o.setName("confirm").setDescription("Type true — this affects every member!").setRequired(true)), async i => {
  if (!i.options.getBoolean("confirm", true)) return i.reply({ content: "Cancelled.", ephemeral: true });
  const action = i.options.getString("action", true);
  const role = i.options.getRole("role", true);
  if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
    return i.reply({ content: "I cannot manage that role (managed or above my highest role).", ephemeral: true });
  await i.deferReply();
  const members = await i.guild.members.fetch().catch(() => null);
  if (!members) return i.editReply("Couldn't fetch the member list.");
  let ok = 0, failed = 0;
  for (const [, m] of members) {
    if (m.user.bot) continue;
    if (m.roles.highest.position >= i.guild.members.me.roles.highest.position) continue;
    if (m.roles.cache.has(role.id) === (action === "add")) continue; // already in desired state
    await m.roles[action](role, `Massrole by ${i.user.tag}`).then(() => ok++).catch(() => failed++);
  }
  await i.editReply(`✅ Massrole complete: **${ok}** members updated, **${failed}** failed (bots and protected members are skipped).`);
  return logAction(i.guild, "Mass Role Update", auditText(i, `${action} @everyone ${role.name}`, `${ok} ok / ${failed} failed`), 0xFEE75C);
});

// ---------- License & Terms ----------

add(new SlashCommandBuilder().setName("terms").setDescription("View the bot's license and terms of service."), async i => {
  const e = new EmbedBuilder().setTitle("📜 License & Terms of Service").setColor(0x5865F2)
    .setDescription([
      "**License — for people hosting the bot**",
      "✅ Free to use, modify, and share — **as long as it stays free**",
      "❌ **Selling, renting, or paywalling the bot is prohibited**",
      "❌ Claiming ownership or removing credits is prohibited",
      "❌ Malicious use (token stealing, self-bots, raid tools) voids the license",
      "",
      "**Terms of Service — for people using the bot**",
      "• The bot stores settings, moderation records, XP, and economy data **only on its own host** — never sold or shared",
      "• Message logging only happens where server admins enable it — admins must inform their members",
      "• No uptime guarantee — the bot is provided as-is",
      "• Breaking Discord's rules or these terms can get a server or user blocked from the bot",
      "",
      "📄 Full documents: `LICENSE` and `TERMS_OF_SERVICE.md` in the bot's files."
    ].join("\n"));
  await i.reply({ embeds: [e], ephemeral: true });
});

export { builders, snipes };

// Replaces welcome/farewell placeholders in a message template.
export function formatPlaceholders(text, member) {
  return String(text)
    .replaceAll("{user}", member.toString())
    .replaceAll("{username}", member.user?.username ?? "member")
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount));
}

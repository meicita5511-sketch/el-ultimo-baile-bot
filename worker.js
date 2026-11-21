import { Client, GatewayIntentBits, Partials } from "discord.js";\n\nconst token = process.env.DISCORD_BOT_TOKEN;\nconst guildId = process.env.DISCORD_GUILD_ID;\nconst welcomeChannelId = process.env.WELCOME_CHANNEL_ID || "";\nconst goodbyeChannelId = process.env.GOODBYE_CHANNEL_ID || welcomeChannelId;\nconst autoRoleIds = (process.env.AUTO_ROLE_IDS || "").split(",").map(v => v.trim()).filter(Boolean);\nconst logChannelId = process.env.LOG_CHANNEL_ID || "";\nconst welcomeMessage = process.env.WELCOME_MESSAGE || "¡Bienvenido/a {user} a El Último Baile RP!";
const streamConfigUrl = process.env.STREAM_CONFIG_URL || "";
const streamSyncSecret = process.env.STREAM_SYNC_SECRET || "";
const twitchClientId = process.env.TWITCH_CLIENT_ID || "";
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET || "";
let streamState = { provider: "", streamer: "", channelId: "", message: "", lastLive: false };\n\nif (!token) throw new Error("DISCORD_BOT_TOKEN is required.");\nif (!guildId) throw new Error("DISCORD_GUILD_ID is required.");\n\nconst client = new Client({\n  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],\n  partials: [Partials.GuildMember],\n});\n\nfunction renderMessage(template, member) {\n  return template.replaceAll("{user}", `<@${member.id}>`).replaceAll("{username}", member.user.username).replaceAll("{server}", member.guild.name);\n}\n\nasync function sendLog(guild, title, description) {\n  if (!logChannelId) return;\n  const channel = await guild.channels.fetch(logChannelId).catch(() => null);\n  if (!channel?.isTextBased()) return;\n  await channel.send({ embeds: [{ title, description, color: 0xe07a2f, timestamp: new Date().toISOString(), footer: { text: "El Último Baile RP • Gateway" } }] }).catch(() => {});\n}\n\nclient.once("ready", async () => {\n  console.log(`Gateway conectado como ${client.user?.tag}`);\n  const guild = await client.guilds.fetch(guildId).catch(() => null);\n  if (!guild) { console.error("Guild no encontrada:", guildId); return; }\n  console.log(`Servidor conectado: ${guild.name} (${guild.id})`);\n});\n\nclient.on("guildMemberAdd", async member => {\n  if (member.guild.id !== guildId) return;\n  for (const roleId of autoRoleIds) await member.roles.add(roleId).catch(error => console.error(`No se pudo asignar el rol ${roleId}:`, error.message));\n  if (welcomeChannelId) {\n    const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);\n    if (channel?.isTextBased()) {\n      const avatar = member.displayAvatarURL({ extension: "png", size: 256 });\n      await channel.send({\n        content: renderMessage(welcomeMessage, member),\n        embeds: [{ title: "👋 ¡Bienvenido/a a El Último Baile RP!", description: `**${member.user.globalName || member.user.username}** ya forma parte del servidor.\n\nDisfruta tu experiencia de roleplay.`, color: 0xe07a2f, thumbnail: { url: avatar }, footer: { text: "El Último Baile RP" }, timestamp: new Date().toISOString() }]\n      }).catch(error => console.error("Error enviando bienvenida:", error.message));\n    }\n  }\n  await sendLog(member.guild, "🟢 Miembro entró", `<@${member.id}> (${member.user.tag}) entró al servidor.`);\n});\n\nclient.on("guildMemberRemove", async member => {\n  if (member.guild.id !== guildId) return;\n  if (goodbyeChannelId) {\n    const channel = await member.guild.channels.fetch(goodbyeChannelId).catch(() => null);\n    if (channel?.isTextBased()) await channel.send({ embeds: [{ title: "👋 Miembro salió", description: `**${member.user.globalName || member.user.username}** ya no forma parte del servidor.`, color: 0xe07a2f, thumbnail: { url: member.displayAvatarURL({ extension: "png", size: 256 }) }, footer: { text: "El Último Baile RP" }, timestamp: new Date().toISOString() }] }).catch(error => console.error("Error enviando despedida:", error.message));\n  }\n  await sendLog(member.guild, "🔴 Miembro salió", `**${member.user.tag}** salió del servidor.`);\n});\n\nasync function loadStreamConfig() {
  if (!streamConfigUrl || !streamSyncSecret) return;
  try {
    const response = await fetch(streamConfigUrl, { headers: { Authorization: "Bearer " + streamSyncSecret } });
    if (!response.ok) return;
    const data = await response.json();
    if (data?.enabled && data?.provider && data?.streamer && data?.channelId) {
      streamState = {
        provider: String(data.provider),
        streamer: String(data.streamer),
        channelId: String(data.channelId),
        message: String(data.message || "🔴 {streamer} está en directo: {url}"),
        lastLive: streamState.provider === String(data.provider) && streamState.streamer === String(data.streamer) ? streamState.lastLive : false,
      };
    }
  } catch (error) {
    console.error("Error sincronizando streams:", error.message);
  }
}

async function checkTwitch(guild) {
  if (!twitchClientId || !twitchClientSecret || streamState.provider.toLowerCase() !== "twitch") return;
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: twitchClientId, client_secret: twitchClientSecret, grant_type: "client_credentials" }),
  });
  if (!tokenResponse.ok) return;
  const tokenData = await tokenResponse.json();
  const response = await fetch("https://api.twitch.tv/helix/streams?user_login=" + encodeURIComponent(streamState.streamer), {
    headers: { "Client-ID": twitchClientId, Authorization: "Bearer " + tokenData.access_token },
  });
  if (!response.ok) return;
  const data = await response.json();
  const live = Array.isArray(data?.data) && data.data.length > 0;
  if (live && !streamState.lastLive) {
    const channel = await guild.channels.fetch(streamState.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const url = "https://twitch.tv/" + encodeURIComponent(streamState.streamer);
      const content = streamState.message.replaceAll("{streamer}", streamState.streamer).replaceAll("{url}", url);
      await channel.send({ content, embeds: [{ title: "🔴 Stream en directo", description: "@" + streamState.streamer + " está en directo en Twitch.", url, color: 0xe07a2f, timestamp: new Date().toISOString(), footer: { text: "El Último Baile RP • Streams" } }] }).catch(error => console.error("Error enviando aviso de stream:", error.message));
    }
  }
  streamState.lastLive = live;
}

async function pollStreams() {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  await loadStreamConfig();
  await checkTwitch(guild);
}

client.on("error", error => console.error("Discord client error:", error));
\nprocess.on("SIGTERM", () => { client.destroy(); process.exit(0); });\nprocess.on("SIGINT", () => { client.destroy(); process.exit(0); });\nclient.login(token);\n
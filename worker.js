import http from "node:http";
import { Client, GatewayIntentBits, Partials } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
if (!guildId) throw new Error("DISCORD_GUILD_ID is required.");

const welcomeChannelId = process.env.WELCOME_CHANNEL_ID || "";
const goodbyeChannelId = process.env.GOODBYE_CHANNEL_ID || welcomeChannelId;
const autoRoleIds = (process.env.AUTO_ROLE_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const logChannelId = process.env.LOG_CHANNEL_ID || "";
const welcomeMessage =
  process.env.WELCOME_MESSAGE || "¡Bienvenido/a {user} a El Último Baile RP!";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember],
});

function renderMessage(template, member) {
  return template
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name);
}

async function sendLog(guild, title, description) {
  if (!logChannelId) return;
  const channel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      embeds: [
        {
          title,
          description,
          color: 0xe07a2f,
          timestamp: new Date().toISOString(),
          footer: { text: "El Último Baile RP • Gateway" },
        },
      ],
    })
    .catch(() => {});
}

client.once("ready", async () => {
  console.log(`Gateway conectado como ${client.user?.tag}`);

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.error("Guild no encontrada:", guildId);
    return;
  }

  console.log(`Servidor conectado: ${guild.name} (${guild.id})`);
});

client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== guildId) return;

  for (const roleId of autoRoleIds) {
    await member.roles
      .add(roleId)
      .then(() => console.log(`Rol ${roleId} asignado a ${member.user.tag}`))
      .catch((error) =>
        console.error(`No se pudo asignar el rol ${roleId}:`, error.message)
      );
  }

  if (welcomeChannelId) {
    const channel = await member.guild.channels
      .fetch(welcomeChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      const avatar = member.displayAvatarURL({
        extension: "png",
        size: 256,
      });

      await channel
        .send({
          content: renderMessage(welcomeMessage, member),
          embeds: [
            {
              title: "👋 ¡Bienvenido/a a El Último Baile RP!",
              description: `**${member.user.globalName || member.user.username}** ya forma parte del servidor.\n\nDisfruta tu experiencia de roleplay.`,
              color: 0xe07a2f,
              thumbnail: { url: avatar },
              footer: { text: "El Último Baile RP" },
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .catch((error) =>
          console.error("Error enviando bienvenida:", error.message)
        );
    }
  }

  await sendLog(
    member.guild,
    "🟢 Miembro entró",
    `<@${member.id}> (${member.user.tag}) entró al servidor.`
  );
});

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== guildId) return;

  if (goodbyeChannelId) {
    const channel = await member.guild.channels
      .fetch(goodbyeChannelId)
      .catch(() => null);

    if (channel?.isTextBased()) {
      await channel
        .send({
          embeds: [
            {
              title: "👋 Miembro salió",
              description: `**${member.user.globalName || member.user.username}** ya no forma parte del servidor.`,
              color: 0xe07a2f,
              thumbnail: {
                url: member.displayAvatarURL({
                  extension: "png",
                  size: 256,
                }),
              },
              footer: { text: "El Último Baile RP" },
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .catch((error) =>
          console.error("Error enviando despedida:", error.message)
        );
    }
  }

  await sendLog(
    member.guild,
    "🔴 Miembro salió",
    `**${member.user.tag}** salió del servidor.`
  );
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("SIGTERM", () => {
  client.destroy();
  process.exit(0);
});

process.on("SIGINT", () => {
  client.destroy();
  process.exit(0);
});

// Tiny HTTP health endpoint so the Render web service can monitor the process.
const port = Number(process.env.PORT || 10000);
http
  .createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        gateway: client.isReady(),
      }));
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("El Último Baile RP Gateway activo.");
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`Health server escuchando en :${port}`);
  });

client.login(token).catch((error) => {
  console.error("No se pudo conectar al Discord Gateway:", error.message);
  process.exit(1);
});

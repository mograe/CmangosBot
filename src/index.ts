// cmangos_discord_bot.ts — версия с deferReply и исправлением Unknown interaction (10062)
// ---------------------------------------------------------------------------------
// Изменения:
//   • handleStatusCommand: сразу interaction.deferReply({ flags: 1 << 6 })  // EPHEMERAL
//     затем interaction.editReply() – избавляемся от 3‑сек. лимита и warning «ephemeral deprecated».
//   • Добавлен импорт ChatInputCommandInteraction как type.
//   • Удалены устаревшие комментарии.

import {
    ActivityType,
    Client,
    ColorResolvable,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
  } from "discord.js";
  import type { ChatInputCommandInteraction } from "discord.js";
  import * as dotenv from "dotenv";
  import net from "node:net";
  import mysql from "mysql2/promise";
  
  dotenv.config();
  
  // ---------- Конфигурация ----------
  const {
    DISCORD_TOKEN,
    APPLICATION_ID,
    GUILD_ID,
    MYSQL_HOST = "127.0.0.1",
    MYSQL_PORT = "3306",
    MYSQL_USER = "mangos",
    MYSQL_PASSWORD = "mangos",
    CHAR_DB = "characters",
    WORLD_HOST = MYSQL_HOST,
    WORLD_PORT = "8085",
    STATUS_CHANNEL_ID,
    UPDATE_INTERVAL = "60",
  } = process.env;
  
  if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN не задан");
  if (!APPLICATION_ID) throw new Error("APPLICATION_ID не задан");
  
  // ---------- Проверка TCP‑порта ----------
  function isPortOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const finish = (ok: boolean): void => {
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
      socket.connect(port, host, () => finish(true));
    });
  }
  
  // ---------- MySQL ----------
  const pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: CHAR_DB,
    connectionLimit: 5,
    charset: "utf8mb4_general_ci",
  });
  
  interface PlayerRow extends mysql.RowDataPacket {
    name: string;
    race: number;
    class: number;
  }
  
  async function fetchOnlinePlayers(): Promise<PlayerRow[]> {
    const [rows] = await pool.query<PlayerRow[]>(
      "SELECT name, race, class FROM characters WHERE online=1 ORDER BY name;",
    );
    return rows;
  }
  
  // ---------- Discord client ----------
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let lastServerOnline: boolean | null = null;
  
  async function gatherStatus(): Promise<{ online: boolean; players: PlayerRow[] }> {
    const online = await isPortOpen(WORLD_HOST, Number(WORLD_PORT));
    const players = online ? await fetchOnlinePlayers().catch(() => []) : [];
    return { online, players };
  }
  
  async function updatePresenceOnce(): Promise<void> {
    const { online, players } = await gatherStatus();
  
    await client.user?.setPresence({
      activities: [
        {
          name: online ? `✦ ${players.length} игроков онлайн` : "✖ Сервер офлайн",
          type: ActivityType.Playing,
        },
      ],
      status: online ? "online" : "idle",
    });
  
    if (lastServerOnline !== null && lastServerOnline !== online && STATUS_CHANNEL_ID) {
      const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
      if (channel?.isTextBased() && "send" in channel) {
        await (channel as any).send(online ? "🌐 **Сервер онлайн!**" : "🔻 **Сервер офлайн.**").catch(console.error);
      }
    }
    lastServerOnline = online;
  }
  
  // ---------- Slash‑команда /status ----------
  async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
    // Discord ждёт ответ ≤3 с; сразу откладываем ответ
    await interaction.deferReply({ flags: 1 << 6 /* EPHEMERAL */ });
  
    const { online, players } = await gatherStatus();
    const colour: ColorResolvable = online ? "Green" : "Red";
  
    const embed = new EmbedBuilder()
      .setTitle("Состояние сервера CMaNGOS")
      .setColor(colour)
      .addFields(
        { name: "Статус", value: online ? "Онлайн ✅" : "Офлайн ❌", inline: false },
        { name: "Игроков онлайн", value: String(players.length), inline: false },
      );
    if (online && players.length) {
      embed.addFields({
        name: "Персонажи",
        value: players.map((p) => p.name).join("\n").slice(0, 1024),
        inline: false,
      });
    }
  
    await interaction.editReply({ embeds: [embed] });
  }
  
  // ---------- Регистрация Slash‑команд ----------
  async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);
    const commands = [
      new SlashCommandBuilder().setName("status").setDescription("Показать состояние сервера"),
    ].map((c) => c.toJSON());
  
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(APPLICATION_ID!, GUILD_ID!), { body: commands });
      console.log("✅ Slash‑команды зарегистрированы локально (guild)");
    } else {
      await rest.put(Routes.applicationCommands(APPLICATION_ID!), { body: commands });
      console.log("✅ Slash‑команды зарегистрированы глобально");
    }
  }
  
  // ---------- События ----------
  client.once(Events.ClientReady, async () => {
    console.log(`Бот авторизовался как ${client.user?.tag}`);
    await registerCommands();
    await updatePresenceOnce();
    setInterval(updatePresenceOnce, Number(UPDATE_INTERVAL) * 1000).unref();
  });
  
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "status") await handleStatusCommand(interaction);
  });
  
  // ---------- Запуск ----------
  client.login(DISCORD_TOKEN).catch((err) => {
    console.error("Не удалось залогиниться в Discord:", err);
    process.exit(1);
  });
  
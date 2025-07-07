const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const prefix = '=';
const clickCounters = new Map();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();

    if (command === 'ping') {
        const wsPing = Math.round(client.ws.ping);
        const ping = wsPing >= 0 ? wsPing : Date.now() - message.createdTimestamp;
        const embed = new EmbedBuilder()
            .setTitle('Pong!')
            .setDescription(`Current latency: ${ping}ms`)
            .setFooter({ text: 'Clicks: 0' });

        const customId = `ping_${message.id}_${Date.now()}`;
        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('🏓')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        clickCounters.set(customId, 0);
        await message.reply({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const { customId } = interaction;
    if (!customId.startsWith('ping_')) return;

    let count = clickCounters.get(customId) || 0;
    count += 1;
    clickCounters.set(customId, count);

    const wsPing = Math.round(interaction.client.ws.ping);
    const ping = wsPing >= 0 ? wsPing : Date.now() - interaction.createdTimestamp;
    const embed = new EmbedBuilder()
        .setTitle('Pong!')
        .setDescription(`Current latency: ${ping}ms`)
        .setFooter({ text: `Clicks: ${count}` });

    const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('🏓')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.update({ embeds: [embed], components: [row] });
});

client.login(process.env.DISCORD_TOKEN);

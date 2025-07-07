const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const DATA_FILE = './data.json';

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, '{}');
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUserData(id) {
    const data = loadData();
    if (!data[id]) {
        data[id] = { wallet: 0, inventory: {}, lastDaily: 0 };
        saveData(data);
    }
    return data[id];
}

function setUserData(id, userData) {
    const data = loadData();
    data[id] = userData;
    saveData(data);
}

const shopItems = {
    shovel: { price: 50, name: 'Shovel' },
    rifle: { price: 250, name: 'Hunting Rifle' },
    rod: { price: 100, name: 'Fishing Rod' },
};

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
    } else if (command === 'wallet') {
        const user = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle(`${message.author.username}'s Wallet`)
            .setDescription(`You have **${user.wallet}** coins.`)
            .setColor(0x00ff99);
        await message.reply({ embeds: [embed] });
    } else if (command === 'daily') {
        const user = getUserData(message.author.id);
        const now = Date.now();
        if (now - user.lastDaily < 86400000) {
            const remaining = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
            const embed = new EmbedBuilder()
                .setTitle('Daily Reward')
                .setDescription(`You already claimed your daily reward. Try again in about **${remaining}** hour(s).`)
                .setColor(0xffcc00);
            await message.reply({ embeds: [embed] });
        } else {
            const amount = Math.floor(Math.random() * 100) + 100;
            user.wallet += amount;
            user.lastDaily = now;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('Daily Reward')
                .setDescription(`You collected **${amount}** coins!`)
                .setColor(0x00ff99);
            await message.reply({ embeds: [embed] });
        }
    } else if (command === 'beg') {
        const user = getUserData(message.author.id);
        const amount = Math.floor(Math.random() * 20) + 1;
        user.wallet += amount;
        setUserData(message.author.id, user);
        const embed = new EmbedBuilder()
            .setTitle('Begging')
            .setDescription(`Someone felt generous and gave you **${amount}** coins.`)
            .setColor(0x00ff99);
        await message.reply({ embeds: [embed] });
    } else if (['dig', 'hunt', 'fish'].includes(command)) {
        const user = getUserData(message.author.id);
        let itemKey;
        let action;
        if (command === 'dig') {
            itemKey = 'shovel';
            action = 'digging';
        } else if (command === 'hunt') {
            itemKey = 'rifle';
            action = 'hunting';
        } else {
            itemKey = 'rod';
            action = 'fishing';
        }

        if (!user.inventory[itemKey]) {
            const embed = new EmbedBuilder()
                .setTitle('Missing Item')
                .setDescription(`You need a **${shopItems[itemKey].name}** to start ${action}. Check the shop!`)
                .setColor(0xff0000);
            await message.reply({ embeds: [embed] });
            return;
        }

        const amount = Math.floor(Math.random() * 75) + 25;
        user.wallet += amount;
        setUserData(message.author.id, user);
        const embed = new EmbedBuilder()
            .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`You earned **${amount}** coins by ${action}!`)
            .setColor(0x00ff99);
        await message.reply({ embeds: [embed] });
    } else if (command === 'shop') {
        const user = getUserData(message.author.id);
        if (args[0] && args[0].toLowerCase() === 'buy' && args[1]) {
            const item = args[1].toLowerCase();
            const shopItem = shopItems[item];
            if (!shopItem) {
                const embed = new EmbedBuilder()
                    .setTitle('Shop')
                    .setDescription('Item not found.')
                    .setColor(0xff0000);
                await message.reply({ embeds: [embed] });
                return;
            }
            if (user.wallet < shopItem.price) {
                const embed = new EmbedBuilder()
                    .setTitle('Shop')
                    .setDescription(`You don't have enough coins for a **${shopItem.name}**.`)
                    .setColor(0xff0000);
                await message.reply({ embeds: [embed] });
                return;
            }
            user.wallet -= shopItem.price;
            user.inventory[item] = true;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('Shop')
                .setDescription(`You bought a **${shopItem.name}** for **${shopItem.price}** coins.`)
                .setColor(0x00ff99);
            await message.reply({ embeds: [embed] });
        } else {
            const desc = Object.entries(shopItems)
                .map(([k, v]) => `**${v.name}** - ${v.price} coins`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('Shop Items')
                .setDescription(desc)
                .setFooter({ text: `Use =shop buy <item>` })
                .setColor(0x00ff99);
            await message.reply({ embeds: [embed] });
        }
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


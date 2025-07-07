const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
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
        data[id] = {
            wallet: 0,
            inventory: {},
            lastDaily: 0,
            color: 0x00ff99,
            jobLevels: {},
            currentJob: null,
        };
        saveData(data);
    }
    return data[id];
}

function setUserData(id, userData) {
    const data = loadData();
    data[id] = userData;
    saveData(data);
}

function getEmbedColor(user) {
    if (!user || user.color === undefined) return 0x00ff99;
    if (user.color === 'random') {
        return Math.floor(Math.random() * 0xffffff);
    }
    return user.color;
}

const shopItems = {
    shovel: { price: 50, name: 'Shovel' },
    rifle: { price: 250, name: 'Hunting Rifle' },
    rod: { price: 100, name: 'Fishing Rod' },
};

const colorOptions = [
    { label: 'Red', value: '16711680' },
    { label: 'Green', value: '65280' },
    { label: 'Blue', value: '255' },
    { label: 'Yellow', value: '16776960' },
    { label: 'Purple', value: '8388736' },
    { label: 'Orange', value: '16753920' },
    { label: 'White', value: '16777215' },
    { label: 'Black', value: '0' },
    { label: 'Random', value: 'random' },
];

const jobs = [
    { id: 'farmer', name: 'Farmer' },
    { id: 'miner', name: 'Miner' },
    { id: 'fisherman', name: 'Fisherman' },
    { id: 'hunter', name: 'Hunter' },
    { id: 'woodcutter', name: 'Woodcutter' },
    { id: 'blacksmith', name: 'Blacksmith' },
    { id: 'alchemist', name: 'Alchemist' },
    { id: 'merchant', name: 'Merchant' },
    { id: 'engineer', name: 'Engineer' },
    { id: 'scientist', name: 'Scientist' },
    { id: 'pilot', name: 'Pilot' },
    { id: 'astronaut', name: 'Astronaut' },
    { id: 'ninja', name: 'Ninja' },
    { id: 'wizard', name: 'Wizard' },
    { id: 'legend', name: 'Legend' },
];

const commandInfo = [
    { name: 'ping', description: 'Show bot latency', category: 'Utility' },
    { name: 'wallet', description: 'Check your coin balance', category: 'Economy' },
    { name: 'daily', description: 'Claim daily coins', category: 'Economy' },
    { name: 'beg', description: 'Beg for coins', category: 'Economy' },
    { name: 'dig', description: 'Dig for coins', category: 'Economy' },
    { name: 'hunt', description: 'Hunt for coins', category: 'Economy' },
    { name: 'fish', description: 'Fish for coins', category: 'Economy' },
    { name: 'shop', description: 'View or buy shop items', category: 'Economy' },
    { name: 'embedcolor', description: 'Change embed color', category: 'Utility' },
    { name: 'job', description: 'Apply for a job', category: 'Jobs' },
    { name: 'work', description: 'Work at your current job', category: 'Jobs' },
    { name: 'help', description: 'Show this help message', category: 'Utility' },
];

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
        const user = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle('Pong!')
            .setDescription(`Current latency: ${ping}ms`)
            .setColor(getEmbedColor(user))
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
            .setColor(getEmbedColor(user));
        await message.reply({ embeds: [embed] });
    } else if (command === 'daily') {
        const user = getUserData(message.author.id);
        const now = Date.now();
        if (now - user.lastDaily < 86400000) {
            const remaining = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
            const embed = new EmbedBuilder()
                .setTitle('Daily Reward')
                .setDescription(`You already claimed your daily reward. Try again in about **${remaining}** hour(s).`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        } else {
            const amount = Math.floor(Math.random() * 100) + 100;
            user.wallet += amount;
            user.lastDaily = now;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('Daily Reward')
                .setDescription(`You collected **${amount}** coins!`)
                .setColor(getEmbedColor(user));
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
            .setColor(getEmbedColor(user));
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
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
            return;
        }

        const amount = Math.floor(Math.random() * 75) + 25;
        user.wallet += amount;
        setUserData(message.author.id, user);
        const embed = new EmbedBuilder()
            .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`You earned **${amount}** coins by ${action}!`)
            .setColor(getEmbedColor(user));
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
                    .setColor(getEmbedColor(user));
                await message.reply({ embeds: [embed] });
                return;
            }
            if (user.wallet < shopItem.price) {
                const embed = new EmbedBuilder()
                    .setTitle('Shop')
                    .setDescription(`You don't have enough coins for a **${shopItem.name}**.`)
                    .setColor(getEmbedColor(user));
                await message.reply({ embeds: [embed] });
                return;
            }
            user.wallet -= shopItem.price;
            user.inventory[item] = true;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('Shop')
                .setDescription(`You bought a **${shopItem.name}** for **${shopItem.price}** coins.`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        } else {
            const desc = Object.entries(shopItems)
                .map(([k, v]) => `**${v.name}** - ${v.price} coins`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('Shop Items')
                .setDescription(desc)
                .setFooter({ text: `Use =shop buy <item>` })
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        }
    } else if (command === 'embedcolor') {
        const user = getUserData(message.author.id);
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`embedcolor_${message.author.id}`)
            .setPlaceholder('Select a color')
            .addOptions(colorOptions);
        const row = new ActionRowBuilder().addComponents(menu);
        const embed = new EmbedBuilder()
            .setTitle('Choose your embed color')
            .setColor(getEmbedColor(user));
        await message.reply({ embeds: [embed], components: [row] });
    } else if (command === 'job') {
        const user = getUserData(message.author.id);
        const available = jobs.filter((j, i) => {
            if (j.id === 'legend') {
                return jobs.slice(0, -1).every(job => user.jobLevels[job.id] >= 100);
            }
            if (i === 0) return true;
            const prev = jobs[i - 1];
            return user.jobLevels[prev.id] >= 100;
        });
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`jobselect_${message.author.id}`)
            .setPlaceholder('Select a job')
            .addOptions(available.map(j => ({ label: j.name, value: j.id })));
        const row = new ActionRowBuilder().addComponents(menu);
        const embed = new EmbedBuilder()
            .setTitle('Available Jobs')
            .setColor(getEmbedColor(user));
        await message.reply({ embeds: [embed], components: [row] });
    } else if (command === 'work') {
        const user = getUserData(message.author.id);
        if (!user.currentJob) {
            const embed = new EmbedBuilder()
                .setTitle('Job')
                .setDescription('Apply for a job first using =job')
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        } else {
            const level = user.jobLevels[user.currentJob] || 0;
            if (level < 100) {
                user.jobLevels[user.currentJob] = level + 1;
            }
            const amount = Math.floor(Math.random() * 50) + 20;
            user.wallet += amount;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle(`Working as ${jobs.find(j => j.id === user.currentJob).name}`)
                .setDescription(`You earned **${amount}** coins. Job level: ${user.jobLevels[user.currentJob]}`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        }
    } else if (command === 'help') {
        const user = getUserData(message.author.id);
        const categories = {};
        for (const info of commandInfo) {
            if (!categories[info.category]) categories[info.category] = [];
            categories[info.category].push(`**=${info.name}** - ${info.description}`);
        }
        const embed = new EmbedBuilder()
            .setTitle('Help')
            .setColor(getEmbedColor(user));
        Object.keys(categories).sort().forEach(cat => {
            embed.addFields({ name: cat, value: categories[cat].join('\n') });
        });
        await message.reply({ embeds: [embed] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const { customId } = interaction;
        if (!customId.startsWith('ping_')) return;
        let count = clickCounters.get(customId) || 0;
        count += 1;
        clickCounters.set(customId, count);

        const wsPing = Math.round(interaction.client.ws.ping);
        const ping = wsPing >= 0 ? wsPing : Date.now() - interaction.createdTimestamp;
        const user = getUserData(interaction.user.id);
        const embed = new EmbedBuilder()
            .setTitle('Pong!')
            .setDescription(`Current latency: ${ping}ms`)
            .setColor(getEmbedColor(user))
            .setFooter({ text: `Clicks: ${count}` });

        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('🏓')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.update({ embeds: [embed], components: [row] });
    } else if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;
        if (customId.startsWith('embedcolor_')) {
            const user = getUserData(interaction.user.id);
            const choice = values[0];
            user.color = choice === 'random' ? 'random' : parseInt(choice, 10);
            setUserData(interaction.user.id, user);
            const label = colorOptions.find(o => o.value === choice)?.label || 'custom';
            await interaction.reply({ content: `Embed color updated to ${label}` , ephemeral: true });
        } else if (customId.startsWith('jobselect_')) {
            const jobId = values[0];
            const user = getUserData(interaction.user.id);
            user.currentJob = jobId;
            if (!user.jobLevels[jobId]) {
                user.jobLevels[jobId] = 0;
            }
            setUserData(interaction.user.id, user);
            await interaction.reply({ content: `You applied to ${jobs.find(j => j.id === jobId).name}!`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);


const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    SlashCommandBuilder,
} = require('discord.js');
const fs = require('fs');
const math = require('mathjs');
const mathsteps = require('mathsteps');
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
            bank: 0,
            inventory: {},
            lastDaily: 0,
            color: 0x00ff99,
            jobLevels: {},
            currentJob: null,
            activeQuest: null,
            webhookName: null,
            webhookAvatar: null,
            webhookActive: false,
            webhookId: null,
            webhookToken: null,
            webhookChannelId: null,
        };
        saveData(data);
    } else {
        // ensure newer properties exist for old user entries
        if (!data[id].jobLevels) {
            data[id].jobLevels = {};
            saveData(data);
        }
        if (!data[id].inventory) {
            data[id].inventory = {};
            saveData(data);
        } else {
            for (const key of Object.keys(data[id].inventory)) {
                const entry = data[id].inventory[key];
                if (entry === true) {
                    data[id].inventory[key] = { count: 1 };
                } else if (typeof entry === 'number') {
                    data[id].inventory[key] = { count: entry };
                }
            }
        }
        if (data[id].bank === undefined) {
            data[id].bank = 0;
            saveData(data);
        }
        if (data[id].activeQuest === undefined) {
            data[id].activeQuest = null;
            saveData(data);
        }
        if (data[id].webhookActive === undefined) {
            data[id].webhookName = null;
            data[id].webhookAvatar = null;
            data[id].webhookActive = false;
            data[id].webhookId = null;
            data[id].webhookToken = null;
            data[id].webhookChannelId = null;
            saveData(data);
        }
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

function normalizeExpression(expr) {
    if (!expr) return '';
    let out = expr.toLowerCase();
    const numbers = {
        zero: '0',
        one: '1',
        two: '2',
        three: '3',
        four: '4',
        five: '5',
        six: '6',
        seven: '7',
        eight: '8',
        nine: '9',
        ten: '10',
    };
    for (const [word, digit] of Object.entries(numbers)) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        out = out.replace(regex, digit);
    }
    out = out
        .replace(/plus/gi, '+')
        .replace(/minus/gi, '-')
        .replace(/(times|multiplied by|\bx\b)/gi, '*')
        .replace(/(divided by|over)/gi, '/')
        .replace(/(equals|equal to)/gi, '=')
        .replace(/\s+/g, ' ');
    // replace "x" used between numbers with *
    out = out.replace(/(?<=\d)\s*x\s*(?=\d)/gi, '*');
    return out.trim();
}

async function createUserWebhook(userId, channel) {
    const user = getUserData(userId);
    try {
        if (user.webhookId && user.webhookToken) {
            const old = await client.fetchWebhook(user.webhookId, user.webhookToken);
            await old.delete().catch(() => {});
        }
    } catch {}
    const webhook = await channel.createWebhook({
        name: user.webhookName || client.user.username,
        avatar: user.webhookAvatar || client.user.displayAvatarURL(),
    });
    user.webhookId = webhook.id;
    user.webhookToken = webhook.token;
    user.webhookChannelId = channel.id;
    user.webhookActive = true;
    setUserData(userId, user);
    return webhook;
}

async function disableUserWebhook(userId) {
    const user = getUserData(userId);
    if (user.webhookId && user.webhookToken) {
        try {
            const wh = await client.fetchWebhook(user.webhookId, user.webhookToken);
            await wh.delete().catch(() => {});
        } catch {}
    }
    user.webhookId = null;
    user.webhookToken = null;
    user.webhookChannelId = null;
    user.webhookActive = false;
    setUserData(userId, user);
}

async function sendResponse(message, user, options) {
    if (user.webhookActive && user.webhookId && user.webhookToken) {
        try {
            const webhook = await client.fetchWebhook(user.webhookId, user.webhookToken);
            return await webhook.send({
                username: user.webhookName || client.user.username,
                avatarURL: user.webhookAvatar || client.user.displayAvatarURL(),
                ...options,
            });
        } catch (err) {
            console.error('Webhook send failed', err);
        }
    }
    return await message.reply(options);
}

const shopItems = {
    shovel: { price: 50, name: 'Shovel', durability: 10 },
    rifle: { price: 250, name: 'Hunting Rifle', durability: 10 },
    rod: { price: 100, name: 'Fishing Rod', durability: 10 },
    lootbox_basic: { price: 150, name: 'Basic Lootbox' },
    lootbox_rare: { price: 400, name: 'Rare Lootbox' },
    lootbox_epic: { price: 800, name: 'Epic Lootbox' },
};

const questRarities = {
    common: { name: 'Common', min: 3, max: 5, reward: 200 },
    rare: { name: 'Rare', min: 5, max: 8, reward: 400 },
    epic: { name: 'Epic', min: 8, max: 12, reward: 800 },
};

const pendingTrades = new Map();

function createQuest(previousRarity) {
    const rarityKeys = Object.keys(questRarities);
    let rarity = rarityKeys[Math.floor(Math.random() * rarityKeys.length)];
    if (previousRarity && rarity === previousRarity) {
        const filtered = rarityKeys.filter(r => r !== previousRarity);
        rarity = filtered[Math.floor(Math.random() * filtered.length)];
    }
    const info = questRarities[rarity];
    const tasks = ['dig', 'fish', 'hunt', 'work'];
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    const goal = Math.floor(Math.random() * (info.max - info.min + 1)) + info.min;
    return { task, goal, progress: 0, rarity };
}

const lootTables = {
    dig: [
        { item: 'ore', chance: 0.2 },
        { item: 'gem', chance: 0.05 },
    ],
    hunt: [
        { item: 'pelt', chance: 0.25 },
        { item: 'rare_pelt', chance: 0.05 },
    ],
    fish: [
        { item: 'fish', chance: 0.25 },
        { item: 'rare_fish', chance: 0.05 },
    ],
};

const sellPrices = {
    ore: 30,
    gem: 100,
    pelt: 25,
    rare_pelt: 80,
    fish: 20,
    rare_fish: 60,
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
    { name: 'inventory', description: 'View your items', category: 'Economy' },
    { name: 'sell', description: 'Sell items from your inventory', category: 'Economy' },
    { name: 'open', description: 'Open a lootbox', category: 'Economy' },
    { name: 'lootpool', description: 'Show loot chances for a command', category: 'Economy' },
    { name: 'bank', description: 'Deposit or withdraw coins', category: 'Economy' },
    { name: 'trade', description: 'Propose a trade to another user', category: 'Economy' },
    { name: 'leaderboard', description: 'Show top players', category: 'Economy' },
    { name: 'profile', description: 'View your overall stats', category: 'Utility' },
    { name: 'coinflip', description: 'Gamble your coins', category: 'Games' },
    { name: 'quest', description: 'Start or claim quests', category: 'Quests' },
    { name: 'timers', description: 'View cooldown timers', category: 'Utility' },
    { name: 'webhook', description: 'Toggle webhook mode', category: 'Utility' },
    { name: 'whpfp', description: 'Set webhook avatar URL', category: 'Utility' },
    { name: 'whname', description: 'Set webhook name', category: 'Utility' },
    { name: 'embedcolor', description: 'Change embed color', category: 'Utility' },
    { name: 'job', description: 'Apply for a job (use `=job list` to view)', category: 'Jobs' },
    { name: 'work', description: 'Work at your current job', category: 'Jobs' },
    { name: 'level', description: 'Show your job levels', category: 'Jobs' },
    { name: 'levelset', description: 'Set your current job level', category: 'Admin' },
    { name: 'levelsetall', description: 'Set level for all jobs', category: 'Admin' },
    { name: 'control', description: 'Admin item controls', category: 'Admin' },
    { name: 'givemoney', description: 'Add coins to your wallet', category: 'Admin' },
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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const cmd = new SlashCommandBuilder()
        .setName('math')
        .setDescription('Solve or evaluate math expressions')
        .addStringOption(o =>
            o.setName('mode')
                .setDescription('Operation')
                .setRequired(true)
                .addChoices(
                    { name: 'solve', value: 'solve' },
                    { name: 'simplify', value: 'simplify' },
                    { name: 'evaluate', value: 'evaluate' },
                ))
        .addStringOption(o =>
            o.setName('expression')
                .setDescription('Expression or equation')
                .setRequired(true));
    await client.application.commands.create(cmd);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    let user = getUserData(message.author.id);

    if (user.webhookActive) {
        if (!user.webhookId || !user.webhookToken || user.webhookChannelId !== message.channel.id) {
            await createUserWebhook(message.author.id, message.channel);
            user = getUserData(message.author.id);
        }
    }

    if (command === 'ping') {
        const wsPing = Math.round(client.ws.ping);
        const ping = wsPing >= 0 ? wsPing : Date.now() - message.createdTimestamp;
        const user = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription(`Current latency: **${ping}ms**`)
            .setColor(getEmbedColor(user))
            .setFooter({ text: 'Clicks: 0' });

        const customId = `ping_${message.id}_${Date.now()}`;
        const button = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel('🏓')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        clickCounters.set(customId, 0);
        await sendResponse(message, user, { embeds: [embed], components: [row] });
    } else if (command === 'wallet') {
        const user = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle(`💰 ${message.author.username}'s Wallet`)
            .setDescription(`You have **${user.wallet}** coins.`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'daily') {
        const user = getUserData(message.author.id);
        const now = Date.now();
        if (now - user.lastDaily < 86400000) {
            const remaining = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Reward')
                .setDescription(`You've already claimed your reward! Come back in **${remaining}** hour(s).`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        } else {
            const amount = Math.floor(Math.random() * 100) + 100;
            user.wallet += amount;
            user.lastDaily = now;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Reward')
                .setDescription(`You collected **${amount}** coins! See you tomorrow!`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'beg') {
        const user = getUserData(message.author.id);
        const amount = Math.floor(Math.random() * 20) + 1;
        user.wallet += amount;
        setUserData(message.author.id, user);
        const embed = new EmbedBuilder()
            .setTitle('🙏 Begging')
            .setDescription(`Someone felt generous and gave you **${amount}** coins.`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'bank') {
        const sub = args[0]?.toLowerCase();
        const user = getUserData(message.author.id);
        if (sub === 'deposit' && args[1]) {
            let amount = args[1].toLowerCase() === 'all' ? user.wallet : parseInt(args[1], 10);
            if (isNaN(amount) || amount <= 0) return;
            if (amount > user.wallet) amount = user.wallet;
            user.wallet -= amount;
            user.bank += amount;
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `🏦 Deposited ${amount} coins.` });
        } else if (sub === 'withdraw' && args[1]) {
            let amount = args[1].toLowerCase() === 'all' ? user.bank : parseInt(args[1], 10);
            if (isNaN(amount) || amount <= 0) return;
            if (amount > user.bank) amount = user.bank;
            user.bank -= amount;
            user.wallet += amount;
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `🏦 Withdrew ${amount} coins.` });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('🏦 Bank Balance')
                .setDescription(`Wallet: **${user.wallet}**\nBank: **${user.bank}**`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'coinflip' && args[0]) {
        const user = getUserData(message.author.id);
        let amount = parseInt(args[0], 10);
        if (isNaN(amount) || amount <= 0 || user.wallet < amount) return;
        if (Math.random() < 0.5) {
            user.wallet -= amount;
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `😢 You lost ${amount} coins.` });
        } else {
            user.wallet += amount;
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `🎉 You won ${amount} coins!` });
        }
    } else if (command === 'leaderboard') {
        const type = args[0]?.toLowerCase() || 'coins';
        const data = loadData();
        const entries = Object.entries(data);
        let sorted;
        if (type === 'level') {
            sorted = entries.sort((a, b) => {
                const la = Object.values(a[1].jobLevels || {}).reduce((x, y) => x + y, 0);
                const lb = Object.values(b[1].jobLevels || {}).reduce((x, y) => x + y, 0);
                return lb - la;
            });
        } else {
            sorted = entries.sort((a, b) => (b[1].wallet + (b[1].bank || 0)) - (a[1].wallet + (a[1].bank || 0)));
        }
        const top = sorted.slice(0, 5).map(([id, u], i) => {
            const value = type === 'level'
                ? Object.values(u.jobLevels || {}).reduce((x, y) => x + y, 0)
                : (u.wallet + (u.bank || 0));
            return `#${i + 1} <@${id}> - ${value}`;
        }).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('🏆 Leaderboard')
            .setDescription(top || 'No data')
            .setColor(0xf1c40f);
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'profile') {
        const user = getUserData(message.author.id);
        const totalLevel = Object.values(user.jobLevels || {}).reduce((a, b) => a + b, 0);
        const questLine = user.activeQuest ? `${user.activeQuest.task} ${user.activeQuest.progress}/${user.activeQuest.goal}` : 'None';
        const embed = new EmbedBuilder()
            .setTitle(`📜 ${message.author.username}'s Profile`)
            .setDescription(`Wallet: **${user.wallet}**\nBank: **${user.bank}**\nCurrent Job: ${user.currentJob || 'None'}\nTotal Level: ${totalLevel}\nQuest: ${questLine}`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'quest') {
        const user = getUserData(message.author.id);
        const sub = args[0]?.toLowerCase();
        if (sub === 'start') {
            if (user.activeQuest) {
                const embed = new EmbedBuilder()
                    .setTitle('❗ Quest Already Active')
                    .setDescription('Finish your current quest before starting a new one!')
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            } else {
                user.activeQuest = createQuest();
                setUserData(message.author.id, user);
                const info = questRarities[user.activeQuest.rarity];
                const embed = new EmbedBuilder()
                    .setTitle(`🗺️ New ${info.name} Quest!`)
                    .setDescription(`Do **${user.activeQuest.goal}** ${user.activeQuest.task} commands to earn **${info.reward}** coins.`)
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            }
        } else if (sub === 'claim') {
            if (user.activeQuest && user.activeQuest.progress >= user.activeQuest.goal) {
                const info = questRarities[user.activeQuest.rarity];
                user.wallet += info.reward;
                const prev = user.activeQuest.rarity;
                user.activeQuest = createQuest(prev);
                setUserData(message.author.id, user);
                const nextInfo = questRarities[user.activeQuest.rarity];
                const embed = new EmbedBuilder()
                    .setTitle('🎉 Quest Complete!')
                    .setDescription(`You earned **${info.reward}** coins!\nNext quest: **${nextInfo.name}** - complete **${user.activeQuest.goal}** ${user.activeQuest.task} commands.`)
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Completed Quest')
                    .setDescription('You have no completed quest to claim.')
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            }
        } else {
            if (user.activeQuest) {
                const info = questRarities[user.activeQuest.rarity];
                const embed = new EmbedBuilder()
                    .setTitle(`📜 ${info.name} Quest`)
                    .setDescription(`Task: **${user.activeQuest.task}**\nProgress: **${user.activeQuest.progress}/${user.activeQuest.goal}**`)
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('📜 No Active Quest')
                    .setDescription('Start a quest with `=quest start`.')
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            }
        }
    } else if (command === 'timers') {
        const user = getUserData(message.author.id);
        const now = Date.now();
        let daily = 86400000 - (now - user.lastDaily);
        if (daily < 0) daily = 0;
        const embed = new EmbedBuilder()
            .setTitle('⏲️ Timers')
            .setDescription(`Daily reward: ${daily ? Math.ceil(daily / 3600000) + 'h' : 'ready'}`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'trade' && args[0] && args[1]) {
        const targetId = args[0].replace(/[^0-9]/g, '');
        const targetUser = client.users.cache.get(targetId);
        const user = getUserData(message.author.id);
        if (!targetUser || targetUser.bot) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Trade Error')
                .setDescription('You cannot trade with bots.')
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
            return;
        }

        const forIndex = args.findIndex(a => a.toLowerCase() === 'for');
        const giveItem = args[1].toLowerCase();
        const giveAmount = parseInt(args[2], 10) || 1;
        let receiveItem = null;
        let receiveAmount = 0;
        if (forIndex !== -1) {
            receiveItem = args[forIndex + 1]?.toLowerCase();
            receiveAmount = parseInt(args[forIndex + 2], 10) || 1;
        }

        if (['coin', 'coins', 'money'].includes(giveItem)) {
            if (giveAmount <= 0 || user.wallet < giveAmount) {
                return;
            }
        } else {
            const inv = user.inventory[giveItem];
            if (!inv || inv.count < giveAmount) {
                return;
            }
        }

        const tradeId = `trade_${message.id}_${Date.now()}`;
        const acceptBtn = new ButtonBuilder().setCustomId(`${tradeId}_a`).setLabel('Accept').setStyle(ButtonStyle.Success);
        const denyBtn = new ButtonBuilder().setCustomId(`${tradeId}_d`).setLabel('Deny').setStyle(ButtonStyle.Danger);
        const counterBtn = new ButtonBuilder().setCustomId(`${tradeId}_c`).setLabel('Counter').setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(acceptBtn, denyBtn, counterBtn);

        const receiveText = receiveItem ? ` for **${receiveAmount}** ${receiveItem}` : '';
        const embed = new EmbedBuilder()
            .setTitle('🤝 Trade Offer')
            .setDescription(`<@${message.author.id}> offers **${giveAmount}** ${giveItem}${receiveText} to <@${targetId}>`)
            .setColor(getEmbedColor(user));

        const sent = await message.channel.send({ embeds: [embed], components: [row] });
        pendingTrades.set(tradeId, { fromId: message.author.id, toId: targetId, giveItem, giveAmount, receiveItem, receiveAmount, messageId: sent.id });
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

        const tool = user.inventory[itemKey];
        if (!tool || (tool.durability !== undefined && tool.durability <= 0)) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Missing Item')
                .setDescription(`You need a **${shopItems[itemKey].name}** to start ${action}. Check the shop!`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
            return;
        }

        // decrease durability and handle break chance
        if (tool.durability !== undefined) {
            tool.durability -= 1;
            if (Math.random() < 0.1 || tool.durability <= 0) {
                delete user.inventory[itemKey];
            } else {
                user.inventory[itemKey] = tool;
            }
        }

        const amount = Math.floor(Math.random() * 75) + 25;
        user.wallet += amount;

        // loot items
        const loots = [];
        for (const loot of lootTables[command]) {
            if (Math.random() < loot.chance) {
                const current = user.inventory[loot.item]?.count || 0;
                user.inventory[loot.item] = { count: current + 1 };
                loots.push(loot.item);
            }
        }

        if (user.activeQuest && user.activeQuest.task === command) {
            user.activeQuest.progress += 1;
        }

        setUserData(message.author.id, user);
        const emojis = { digging: '⛏️', hunting: '🏹', fishing: '🎣' };
        const lootText = loots.length > 0 ? `\nYou also found: ${loots.join(', ')}.` : '';
        const embed = new EmbedBuilder()
            .setTitle(`${emojis[action]} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`You earned **${amount}** coins by ${action}!${lootText}`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'shop') {
        const user = getUserData(message.author.id);
        if (args[0] && args[0].toLowerCase() === 'buy' && args[1]) {
            const item = args[1].toLowerCase();
            const shopItem = shopItems[item];
            if (!shopItem) {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop')
                    .setDescription('Item not found.')
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
                return;
            }
            if (user.wallet < shopItem.price) {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop')
                    .setDescription(`You don't have enough coins for a **${shopItem.name}**.`)
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
                return;
            }
            user.wallet -= shopItem.price;
            if (shopItem.durability) {
                user.inventory[item] = { count: 1, durability: shopItem.durability };
            } else {
                const current = user.inventory[item]?.count || 0;
                user.inventory[item] = { count: current + 1 };
            }
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('🛒 Shop')
                .setDescription(`You bought a **${shopItem.name}** for **${shopItem.price}** coins.`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        } else {
            const desc = Object.entries(shopItems)
                .map(([k, v]) => `**${v.name}** - ${v.price} coins`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('🛒 Shop Items')
                .setDescription(desc)
                .setFooter({ text: `Use =shop buy <item>` })
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'inventory') {
        const user = getUserData(message.author.id);
        const lines = Object.entries(user.inventory).map(([k,v]) => {
            if (v.durability !== undefined) {
                return `**${shopItems[k]?.name || k}** - durability ${v.durability}`;
            }
            return `**${shopItems[k]?.name || k}** x${v.count}`;
        }).join('\n') || 'Empty';
        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${message.author.username}'s Inventory`)
            .setDescription(lines)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'open') {
        const user = getUserData(message.author.id);
        if (!args[0]) {
            const basic = user.inventory['lootbox_basic']?.count || 0;
            const rare = user.inventory['lootbox_rare']?.count || 0;
            const epic = user.inventory['lootbox_epic']?.count || 0;
            await sendResponse(message, user, {
                content: `Specify a lootbox to open: **basic**, **rare**, or **epic**.\nYou have Basic x${basic}, Rare x${rare}, Epic x${epic}.`
            });
            return;
        }

        let box = args[0].toLowerCase();
        if (['basic', 'rare', 'epic'].includes(box)) {
            box = `lootbox_${box}`;
        }

        const entry = user.inventory[box];
        if (!entry || entry.count < 1 || !box.startsWith('lootbox')) {
            await sendResponse(message, user, { content: 'You do not have that lootbox.' });
            return;
        }

        entry.count -= 1;
        if (entry.count <= 0) delete user.inventory[box];

        let coins = 0;
        if (box === 'lootbox_basic') coins = Math.floor(Math.random() * 100) + 50;
        else if (box === 'lootbox_rare') coins = Math.floor(Math.random() * 200) + 100;
        else if (box === 'lootbox_epic') coins = Math.floor(Math.random() * 400) + 200;

        user.wallet += coins;

        const loot = [];
        for (const tbl of Object.values(lootTables)) {
            for (const l of tbl) {
                if (Math.random() < 0.1) {
                    const current = user.inventory[l.item]?.count || 0;
                    user.inventory[l.item] = { count: current + 1 };
                    loot.push(l.item);
                }
            }
        }

        setUserData(message.author.id, user);
        const lootText = loot.length ? ` You also received: ${loot.join(', ')}.` : '';
        await sendResponse(message, user, { content: `You opened a ${shopItems[box].name} and received ${coins} coins!${lootText}` });
    } else if (command === 'sell' && args[0]) {
        const item = args[0].toLowerCase();
        const amount = parseInt(args[1], 10) || 1;
        const user = getUserData(message.author.id);
        const inv = user.inventory[item];
        if (!inv || inv.count < amount || inv.durability !== undefined) {
            await sendResponse(message, user, { content: 'You do not have enough of that item to sell.' });
            return;
        }
        const price = (shopItems[item]?.price / 2) || sellPrices[item];
        if (!price) {
            await sendResponse(message, user, { content: 'That item cannot be sold.' });
            return;
        }
        inv.count -= amount;
        if (inv.count <= 0) delete user.inventory[item];
        user.wallet += price * amount;
        setUserData(message.author.id, user);
        await sendResponse(message, user, { content: `Sold ${amount} ${item} for ${price * amount} coins.` });
    } else if (command === 'lootpool' && args[0]) {
        const target = args[0].toLowerCase();
        let table = null;
        if (target === 'open') {
            table = [];
            for (const tbl of Object.values(lootTables)) {
                for (const lt of tbl) {
                    table.push({ item: lt.item, chance: 0.1 });
                }
            }
        } else {
            table = lootTables[target];
        }
        if (!table) {
            await sendResponse(message, user, { content: 'Unknown command for loot pool.' });
        } else {
            const user = getUserData(message.author.id);
            const lines = table.map(l => `**${l.item}** - ${Math.round(l.chance * 100)}%`).join('\n') || 'None';
            let coinInfo = '';
            if (['dig', 'hunt', 'fish'].includes(target)) {
                coinInfo = '\nCoins: 25-100';
            } else if (target === 'open') {
                coinInfo = '\nCoins by box: Basic 50-149, Rare 100-299, Epic 200-599';
            }
            const embed = new EmbedBuilder()
                .setTitle(`🎁 Loot Pool for ${target}`)
                .setDescription(lines + coinInfo)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'webhook') {
        if (user.webhookActive) {
            await disableUserWebhook(message.author.id);
            const embed = new EmbedBuilder()
                .setTitle('Webhook Mode Disabled')
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        } else {
            await createUserWebhook(message.author.id, message.channel);
            user = getUserData(message.author.id);
            const embed = new EmbedBuilder()
                .setTitle('Webhook mode now active. Use =whpfp or =whname to customize your webhook')
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'whpfp') {
        const url = args[0] || message.attachments.first()?.url;
        if (!url) return;
        user.webhookAvatar = url;
        setUserData(message.author.id, user);
        if (user.webhookActive) {
            try {
                const wh = await client.fetchWebhook(user.webhookId, user.webhookToken);
                await wh.edit({ avatar: url });
            } catch {}
        }
        await sendResponse(message, user, { content: 'Webhook avatar updated.' });
    } else if (command === 'whname' && args[0]) {
        const name = args.join(' ');
        user.webhookName = name;
        setUserData(message.author.id, user);
        if (user.webhookActive) {
            try {
                const wh = await client.fetchWebhook(user.webhookId, user.webhookToken);
                await wh.edit({ name });
            } catch {}
        }
        await sendResponse(message, user, { content: 'Webhook name updated.' });
    } else if (command === 'embedcolor') {
        const user = getUserData(message.author.id);
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`embedcolor_${message.author.id}`)
            .setPlaceholder('Select a color')
            .addOptions(colorOptions);
        const row = new ActionRowBuilder().addComponents(menu);
        const embed = new EmbedBuilder()
            .setTitle('🎨 Choose your embed color')
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed], components: [row] });
    } else if (command === 'job') {
        const user = getUserData(message.author.id);
        if (args.length > 0) {
            const input = args[0].toLowerCase();
            const job = jobs.find(j => j.id === input || j.name.toLowerCase() === input);
            if (!job) {
                const embed = new EmbedBuilder()
                    .setTitle('💼 Job')
                    .setDescription('Job not found. Use `=job` to view available jobs.')
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            } else {
                const index = jobs.findIndex(j => j.id === job.id);
                if (job.id === 'legend') {
                    if (!jobs.slice(0, -1).every(j => (user.jobLevels[j.id] || 0) >= 100)) {
                        const embed = new EmbedBuilder()
                            .setTitle('💼 Job')
                            .setDescription('You must reach level 100 in all jobs to apply for Legend.')
                            .setColor(getEmbedColor(user));
                        await sendResponse(message, user, { embeds: [embed] });
                        return;
                    }
                } else if (index > 0) {
                    const prev = jobs[index - 1];
                    if ((user.jobLevels[prev.id] || 0) < 100) {
                        const embed = new EmbedBuilder()
                            .setTitle('💼 Job')
                            .setDescription(`You need level 100 in ${prev.name} first.`)
                            .setColor(getEmbedColor(user));
                        await sendResponse(message, user, { embeds: [embed] });
                        return;
                    }
                }
                user.currentJob = job.id;
                if (!user.jobLevels[job.id]) {
                    user.jobLevels[job.id] = 0;
                }
                setUserData(message.author.id, user);
                const embed = new EmbedBuilder()
                    .setTitle('💼 Job')
                    .setDescription(`You applied to ${job.name}!`)
                    .setColor(getEmbedColor(user));
                await sendResponse(message, user, { embeds: [embed] });
            }
        } else {
            const available = jobs.filter((j, i) => {
                if (j.id === 'legend') {
                    return jobs.slice(0, -1).every(job => (user.jobLevels?.[job.id] || 0) >= 100);
                }
                if (i === 0) return true;
                const prev = jobs[i - 1];
                return (user.jobLevels?.[prev.id] || 0) >= 100;
            });
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`jobselect_${message.author.id}`)
                .setPlaceholder('Select a job')
                .addOptions(available.map(j => ({ label: j.name, value: j.id })));
            const row = new ActionRowBuilder().addComponents(menu);
            const embed = new EmbedBuilder()
                .setTitle('💼 Available Jobs')
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed], components: [row] });
        }
    } else if (command === 'work') {
        const user = getUserData(message.author.id);
        if (!user.currentJob) {
            const embed = new EmbedBuilder()
                .setTitle('💼 Job')
                .setDescription('Apply for a job first using =job')
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        } else {
            const level = user.jobLevels[user.currentJob] || 0;
            if (level < 100) {
                user.jobLevels[user.currentJob] = level + 1;
            }
            const amount = Math.floor(Math.random() * 50) + 20;
            user.wallet += amount;

            if (user.activeQuest && user.activeQuest.task === 'work') {
                user.activeQuest.progress += 1;
            }
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle(`💼 Working as ${jobs.find(j => j.id === user.currentJob).name}`)
                .setDescription(`You earned **${amount}** coins. Job level: ${user.jobLevels[user.currentJob]}`)
                .setColor(getEmbedColor(user));
            await sendResponse(message, user, { embeds: [embed] });
        }
    } else if (command === 'level') {
        const user = getUserData(message.author.id);
        const currentJob = user.currentJob ? jobs.find(j => j.id === user.currentJob) : null;
        const currentLevel = user.currentJob ? (user.jobLevels[user.currentJob] || 0) : 0;
        const totalLevel = Object.values(user.jobLevels || {}).reduce((a, b) => a + b, 0);
        const unlocked = jobs.filter((j, i) => {
            if (j.id === 'legend') {
                return jobs.slice(0, -1).every(job => (user.jobLevels[job.id] || 0) >= 100);
            }
            if (i === 0) return true;
            const prev = jobs[i - 1];
            return (user.jobLevels[prev.id] || 0) >= 100;
        }).map(j => j.name).join(', ') || 'None';

        const embed = new EmbedBuilder()
            .setTitle('📊 Levels')
            .setDescription(`Current Job: ${currentJob ? currentJob.name : 'None'}\nCurrent Level: ${currentLevel}\nTotal Level: ${totalLevel}\nUnlocked Jobs: ${unlocked}`)
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed] });
    } else if (command === 'givemoney' && args[0]) {
        const amount = parseInt(args[0], 10);
        if (!isNaN(amount)) {
            const user = getUserData(message.author.id);
            user.wallet += amount;
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `Added ${amount} coins to your wallet. 💸` });
        }
    } else if (command === 'levelset' && args[0]) {
        const amount = parseInt(args[0], 10);
        if (!isNaN(amount)) {
            const user = getUserData(message.author.id);
            if (user.currentJob) {
                user.jobLevels[user.currentJob] = amount;
                setUserData(message.author.id, user);
                await sendResponse(message, user, { content: `Set **${jobs.find(j => j.id === user.currentJob).name}** level to ${amount}. 📈` });
            } else {
                await sendResponse(message, user, { content: 'You do not have a job selected.' });
            }
        }
    } else if (command === 'levelsetall' && args[0]) {
        const amount = parseInt(args[0], 10);
        if (!isNaN(amount)) {
            const user = getUserData(message.author.id);
            for (const j of jobs) {
                user.jobLevels[j.id] = amount;
            }
            setUserData(message.author.id, user);
            await sendResponse(message, user, { content: `Set all job levels to ${amount}. 📈` });
        }
    } else if (command === 'control') {
        const amount = parseInt(args[0], 10) || 1;
        const user = getUserData(message.author.id);
        const itemMenu = new StringSelectMenuBuilder()
            .setCustomId(`control_item_${message.author.id}_${amount}`)
            .setPlaceholder('Select an item')
            .addOptions(Object.entries(shopItems).map(([k, v]) => ({ label: v.name, value: k })));
        const row = new ActionRowBuilder().addComponents(itemMenu);
        const embed = new EmbedBuilder()
            .setTitle('🛠️ Control Panel')
            .setDescription('Choose an item to add. Use `=givemoney`, `=levelset`, or `=levelsetall` for other actions.')
            .setColor(getEmbedColor(user));
        await sendResponse(message, user, { embeds: [embed], components: [row] });
    } else if (command === 'help') {
        const user = getUserData(message.author.id);
        const categories = {};
        for (const info of commandInfo) {
            if (!categories[info.category]) categories[info.category] = [];
            categories[info.category].push(`**=${info.name}** - ${info.description}`);
        }
        const embed = new EmbedBuilder()
            .setTitle('📖 Help Menu')
            .setDescription('Here are my commands!')
            .setColor(getEmbedColor(user));
        Object.keys(categories).sort().forEach(cat => {
            embed.addFields({ name: cat, value: categories[cat].join('\n'), inline: true });
        });
        await sendResponse(message, user, { embeds: [embed] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'math') {
            const mode = interaction.options.getString('mode');
            const rawExpr = interaction.options.getString('expression');
            const expr = normalizeExpression(rawExpr);
            const user = getUserData(interaction.user.id);
            const embed = new EmbedBuilder()
                .setTitle('🧮 Math Solver')
                .setDescription(`**${mode}**\n\`${expr}\``)
                .setColor(getEmbedColor(user));
            await interaction.reply({ embeds: [embed] });

            let steps = [];
            let result;
            try {
                if (mode === 'solve') {
                    steps = mathsteps.solveEquation(expr);
                    if (steps.length > 0) {
                        result = steps[steps.length - 1].newEquation.ascii();
                    } else {
                        result = expr;
                    }
                } else if (mode === 'simplify') {
                    steps = mathsteps.simplifyExpression(expr);
                    if (steps.length > 0) {
                        result = steps[steps.length - 1].newNode.toString();
                    } else {
                        result = expr;
                    }
                } else {
                    result = math.evaluate(expr).toString();
                }
            } catch (err) {
                await interaction.editReply({ content: 'Failed to parse expression.', embeds: [] });
                return;
            }

            for (const step of steps) {
                await new Promise(r => setTimeout(r, 1000));
                const text = mode === 'solve' ? step.newEquation.ascii() : step.newNode.toString();
                embed.setDescription(`**${mode}**\n\`${text}\``);
                await interaction.editReply({ embeds: [embed] });
            }

            const breakdown = steps.map((s, i) => `${i + 1}. ${mode === 'solve' ? s.newEquation.ascii() : s.newNode.toString()}`).join('\n');
            const finalEmbed = new EmbedBuilder()
                .setTitle('📊 Solution')
                .setDescription(breakdown ? breakdown + `\n\n**Result:** ${result}` : `**Result:** ${result}`)
                .setColor(getEmbedColor(user));

            let verified = true;
            if (mode === 'solve' && result) {
                const parts = expr.split('=');
                if (parts.length === 2) {
                    const variable = parts[0].match(/[a-zA-Z]+/);
                    if (variable) {
                        const left = parts[0];
                        const right = parts[1];
                        const sols = result.split(/or/).map(s => s.trim());
                        for (const sol of sols) {
                            const scope = {};
                            scope[variable[0]] = math.evaluate(sol);
                            try {
                                const lv = math.evaluate(left, scope);
                                const rv = math.evaluate(right, scope);
                                if (!math.equal(lv, rv)) {
                                    verified = false;
                                    break;
                                }
                            } catch {
                                verified = false;
                                break;
                            }
                        }
                    } else {
                        verified = false;
                    }
                } else {
                    verified = false;
                }
            }

            if (mode !== 'evaluate') {
                finalEmbed.addFields({ name: 'Fact Check', value: verified ? '✅ Verified' : '⚠️ Could not verify' });
            }

            await interaction.followUp({ embeds: [finalEmbed] });
        }
        return;
    }
    if (interaction.isButton()) {
        const { customId } = interaction;
        if (customId.startsWith('trade_')) {
            const parts = customId.split('_');
            const id = `trade_${parts[1]}_${parts[2]}`;
            const action = parts[3];
            const trade = pendingTrades.get(id);
            if (!trade) {
                await interaction.reply({ content: 'This trade is no longer available.', ephemeral: true });
                return;
            }
            if (interaction.user.id !== trade.toId) {
                await interaction.reply({ content: 'This trade is not for you.', ephemeral: true });
                return;
            }

            const fromUser = getUserData(trade.fromId);
            const toUser = getUserData(trade.toId);
            if (action === 'a') {
                if (trade.receiveItem) {
                    if (['coin', 'coins', 'money'].includes(trade.receiveItem)) {
                        if (toUser.wallet < trade.receiveAmount) {
                            await interaction.reply({ content: 'You lack the required coins.', ephemeral: true });
                            return;
                        }
                        toUser.wallet -= trade.receiveAmount;
                        fromUser.wallet += trade.receiveAmount;
                    } else {
                        const inv = toUser.inventory[trade.receiveItem];
                        if (!inv || inv.count < trade.receiveAmount) {
                            await interaction.reply({ content: 'You lack the required items.', ephemeral: true });
                            return;
                        }
                        inv.count -= trade.receiveAmount;
                        if (inv.count <= 0) delete toUser.inventory[trade.receiveItem];
                        fromUser.inventory[trade.receiveItem] = { count: (fromUser.inventory[trade.receiveItem]?.count || 0) + trade.receiveAmount };
                    }
                }

                if (['coin', 'coins', 'money'].includes(trade.giveItem)) {
                    if (fromUser.wallet < trade.giveAmount) {
                        await interaction.reply({ content: 'The offerer lacks the coins.', ephemeral: true });
                        return;
                    }
                    fromUser.wallet -= trade.giveAmount;
                    toUser.wallet += trade.giveAmount;
                } else {
                    const inv = fromUser.inventory[trade.giveItem];
                    if (!inv || inv.count < trade.giveAmount) {
                        await interaction.reply({ content: 'The offerer lacks the items.', ephemeral: true });
                        return;
                    }
                    inv.count -= trade.giveAmount;
                    if (inv.count <= 0) delete fromUser.inventory[trade.giveItem];
                    toUser.inventory[trade.giveItem] = { count: (toUser.inventory[trade.giveItem]?.count || 0) + trade.giveAmount };
                }

                setUserData(trade.fromId, fromUser);
                setUserData(trade.toId, toUser);
                pendingTrades.delete(id);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Trade Completed')
                    .setDescription(`<@${trade.fromId}> and <@${trade.toId}> traded successfully!`)
                    .setColor(getEmbedColor(fromUser));
                await interaction.message.edit({ embeds: [embed], components: [] });
                await interaction.reply({ content: 'Trade accepted!', ephemeral: true });
            } else if (action === 'd') {
                pendingTrades.delete(id);
                const embed = new EmbedBuilder()
                    .setTitle('❌ Trade Denied')
                    .setColor(0xff0000);
                await interaction.message.edit({ embeds: [embed], components: [] });
                await interaction.reply({ content: 'Trade denied.', ephemeral: true });
            } else if (action === 'c') {
                pendingTrades.delete(id);
                const embed = new EmbedBuilder()
                    .setTitle('↩️ Trade Countered')
                    .setDescription('Send a new trade to counter this offer.')
                    .setColor(0xffff00);
                await interaction.message.edit({ embeds: [embed], components: [] });
                await interaction.reply({ content: 'You may now send a counter offer with =trade.', ephemeral: true });
            }
            return;
        }

        if (!customId.startsWith('ping_')) return;
        let count = clickCounters.get(customId) || 0;
        count += 1;
        clickCounters.set(customId, count);

        const wsPing = Math.round(interaction.client.ws.ping);
        const ping = wsPing >= 0 ? wsPing : Date.now() - interaction.createdTimestamp;
        const user = getUserData(interaction.user.id);
        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription(`Current latency: **${ping}ms**`)
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
            await interaction.reply({ content: `🎨 Embed color updated to ${label}` , ephemeral: true });
        } else if (customId.startsWith('jobselect_')) {
            const jobId = values[0];
            const user = getUserData(interaction.user.id);
            if (!user.jobLevels) {
                user.jobLevels = {};
            }
            user.currentJob = jobId;
            if (!user.jobLevels[jobId]) {
                user.jobLevels[jobId] = 0;
            }
            setUserData(interaction.user.id, user);
            await interaction.reply({ content: `💼 You applied to ${jobs.find(j => j.id === jobId).name}!`, ephemeral: true });
        } else if (customId.startsWith('control_item_')) {
            const [, , userId, amountStr] = customId.split('_');
            if (interaction.user.id !== userId) return;
            const amount = parseInt(amountStr, 10) || 1;
            const item = values[0];
            const user = getUserData(interaction.user.id);
            if (shopItems[item]?.durability) {
                user.inventory[item] = { count: 1, durability: shopItems[item].durability };
            } else {
                const current = user.inventory[item]?.count || 0;
                user.inventory[item] = { count: current + amount };
            }
            setUserData(interaction.user.id, user);
            await interaction.reply({ content: `🛠️ Gave you ${amount}x ${shopItems[item].name}.`, ephemeral: true });
        } else if (customId.startsWith('control_level_')) {
            const [, , userId, amountStr] = customId.split('_');
            if (interaction.user.id !== userId) return;
            const amount = parseInt(amountStr, 10) || 1;
            const option = values[0];
            const user = getUserData(interaction.user.id);
            if (option === 'current' && user.currentJob) {
                user.jobLevels[user.currentJob] = amount;
            } else if (option === 'all') {
                for (const j of jobs) {
                    user.jobLevels[j.id] = amount;
                }
            }
            setUserData(interaction.user.id, user);
            await interaction.reply({ content: '📈 Job levels updated.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);


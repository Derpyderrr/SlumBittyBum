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
    shovel: { price: 50, name: 'Shovel', durability: 10 },
    rifle: { price: 250, name: 'Hunting Rifle', durability: 10 },
    rod: { price: 100, name: 'Fishing Rod', durability: 10 },
    lootbox_basic: { price: 150, name: 'Basic Lootbox' },
    lootbox_rare: { price: 400, name: 'Rare Lootbox' },
    lootbox_epic: { price: 800, name: 'Epic Lootbox' },
};

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
        await message.reply({ embeds: [embed], components: [row] });
    } else if (command === 'wallet') {
        const user = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle(`💰 ${message.author.username}'s Wallet`)
            .setDescription(`You have **${user.wallet}** coins.`)
            .setColor(getEmbedColor(user));
        await message.reply({ embeds: [embed] });
    } else if (command === 'daily') {
        const user = getUserData(message.author.id);
        const now = Date.now();
        if (now - user.lastDaily < 86400000) {
            const remaining = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Reward')
                .setDescription(`You've already claimed your reward! Come back in **${remaining}** hour(s).`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
        } else {
            const amount = Math.floor(Math.random() * 100) + 100;
            user.wallet += amount;
            user.lastDaily = now;
            setUserData(message.author.id, user);
            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Reward')
                .setDescription(`You collected **${amount}** coins! See you tomorrow!`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
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

        const tool = user.inventory[itemKey];
        if (!tool || (tool.durability !== undefined && tool.durability <= 0)) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Missing Item')
                .setDescription(`You need a **${shopItems[itemKey].name}** to start ${action}. Check the shop!`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
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

        setUserData(message.author.id, user);
        const emojis = { digging: '⛏️', hunting: '🏹', fishing: '🎣' };
        const lootText = loots.length > 0 ? `\nYou also found: ${loots.join(', ')}.` : '';
        const embed = new EmbedBuilder()
            .setTitle(`${emojis[action]} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`You earned **${amount}** coins by ${action}!${lootText}`)
            .setColor(getEmbedColor(user));
        await message.reply({ embeds: [embed] });
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
                await message.reply({ embeds: [embed] });
                return;
            }
            if (user.wallet < shopItem.price) {
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Shop')
                    .setDescription(`You don't have enough coins for a **${shopItem.name}**.`)
                    .setColor(getEmbedColor(user));
                await message.reply({ embeds: [embed] });
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
            await message.reply({ embeds: [embed] });
        } else {
            const desc = Object.entries(shopItems)
                .map(([k, v]) => `**${v.name}** - ${v.price} coins`)
                .join('\n');
            const embed = new EmbedBuilder()
                .setTitle('🛒 Shop Items')
                .setDescription(desc)
                .setFooter({ text: `Use =shop buy <item>` })
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
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
        await message.reply({ embeds: [embed] });
    } else if (command === 'open' && args[0]) {
        const box = args[0].toLowerCase();
        const user = getUserData(message.author.id);
        const entry = user.inventory[box];
        if (!entry || entry.count < 1 || !box.startsWith('lootbox')) {
            await message.reply({ content: 'You do not have that lootbox.' });
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
        await message.reply({ content: `You opened a ${shopItems[box].name} and received ${coins} coins!${lootText}` });
    } else if (command === 'sell' && args[0]) {
        const item = args[0].toLowerCase();
        const amount = parseInt(args[1], 10) || 1;
        const user = getUserData(message.author.id);
        const inv = user.inventory[item];
        if (!inv || inv.count < amount || inv.durability !== undefined) {
            await message.reply({ content: 'You do not have enough of that item to sell.' });
            return;
        }
        const price = (shopItems[item]?.price / 2) || sellPrices[item];
        if (!price) {
            await message.reply({ content: 'That item cannot be sold.' });
            return;
        }
        inv.count -= amount;
        if (inv.count <= 0) delete user.inventory[item];
        user.wallet += price * amount;
        setUserData(message.author.id, user);
        await message.reply({ content: `Sold ${amount} ${item} for ${price * amount} coins.` });
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
        await message.reply({ embeds: [embed], components: [row] });
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
                await message.reply({ embeds: [embed] });
            } else {
                const index = jobs.findIndex(j => j.id === job.id);
                if (job.id === 'legend') {
                    if (!jobs.slice(0, -1).every(j => (user.jobLevels[j.id] || 0) >= 100)) {
                        const embed = new EmbedBuilder()
                            .setTitle('💼 Job')
                            .setDescription('You must reach level 100 in all jobs to apply for Legend.')
                            .setColor(getEmbedColor(user));
                        await message.reply({ embeds: [embed] });
                        return;
                    }
                } else if (index > 0) {
                    const prev = jobs[index - 1];
                    if ((user.jobLevels[prev.id] || 0) < 100) {
                        const embed = new EmbedBuilder()
                            .setTitle('💼 Job')
                            .setDescription(`You need level 100 in ${prev.name} first.`)
                            .setColor(getEmbedColor(user));
                        await message.reply({ embeds: [embed] });
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
                await message.reply({ embeds: [embed] });
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
            await message.reply({ embeds: [embed], components: [row] });
        }
    } else if (command === 'work') {
        const user = getUserData(message.author.id);
        if (!user.currentJob) {
            const embed = new EmbedBuilder()
                .setTitle('💼 Job')
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
                .setTitle(`💼 Working as ${jobs.find(j => j.id === user.currentJob).name}`)
                .setDescription(`You earned **${amount}** coins. Job level: ${user.jobLevels[user.currentJob]}`)
                .setColor(getEmbedColor(user));
            await message.reply({ embeds: [embed] });
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
        await message.reply({ embeds: [embed] });
    } else if (command === 'givemoney' && args[0]) {
        const amount = parseInt(args[0], 10);
        if (!isNaN(amount)) {
            const user = getUserData(message.author.id);
            user.wallet += amount;
            setUserData(message.author.id, user);
            await message.reply({ content: `Added ${amount} coins to your wallet. 💸` });
        }
    } else if (command === 'levelset' && args[0]) {
        const amount = parseInt(args[0], 10);
        if (!isNaN(amount)) {
            const user = getUserData(message.author.id);
            if (user.currentJob) {
                user.jobLevels[user.currentJob] = amount;
                setUserData(message.author.id, user);
                await message.reply({ content: `Set **${jobs.find(j => j.id === user.currentJob).name}** level to ${amount}. 📈` });
            } else {
                await message.reply({ content: 'You do not have a job selected.' });
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
            await message.reply({ content: `Set all job levels to ${amount}. 📈` });
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
        await message.reply({ embeds: [embed], components: [row] });
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


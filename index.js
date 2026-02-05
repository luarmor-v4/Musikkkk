const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');
const express = require('express');
require('dotenv').config();

// ============ BOT INFO ============
const BOT_INFO = {
    name: 'Melodify',
    version: '1.0.0',
    description: 'HI i am development .',
    owner: {
        id: '1307489983359357019',
        username: 'demisz_dc',
        display: 'Demisz'
    },
    color: '#5865F2',
    links: {
        support: 'https://discord.gg/your-server',
        invite: 'https://discord.com/oauth2/authorize?client_id=1307489983359357019&permissions=3147776&scope=bot'
    }
};

// ============ EXPRESS KEEP-ALIVE ============
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ============ TEST ENDPOINTS ============
app.get('/test-discord', async (req, res) => {
    try {
        const https = require('https');
        
        console.log('🔍 Testing Discord API connection...');
        
        const testGateway = () => new Promise((resolve, reject) => {
            const req = https.get('https://discord.com/api/v10/gateway', (resp) => {
                let data = '';
                resp.on('data', chunk => data += chunk);
                resp.on('end', () => {
                    console.log('✅ Discord API Response:', resp.statusCode);
                    resolve({ status: resp.statusCode, data: JSON.parse(data) });
                });
            });
            req.on('error', (err) => {
                console.error('❌ Discord API Error:', err.message);
                reject(err);
            });
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        });
        
        const result = await testGateway();
        res.json({
            success: true,
            canReachDiscord: true,
            gateway: result.data.url,
            statusCode: result.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        res.json({
            success: false,
            canReachDiscord: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/test-websocket', (req, res) => {
    const WebSocket = require('ws');
    
    console.log('🔍 Testing WebSocket connection...');
    
    try {
        const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
        
        const timeout = setTimeout(() => {
            ws.close();
            res.json({ success: false, error: 'WebSocket timeout' });
        }, 10000);
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected!');
            clearTimeout(timeout);
            ws.close();
            res.json({ success: true, message: 'WebSocket connection OK' });
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            clearTimeout(timeout);
            res.json({ success: false, error: error.message });
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ============ DISCORD CLIENT ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    ws: {
        properties: {
            browser: 'Discord Android'
        },
        version: 10
    },
    restRequestTimeout: 30000,
    retryLimit: 3
});

// ============ LAVALINK NODES ============
const Nodes = [
    {
        name: 'Main',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    }
];

// ============ KAZAGUMO SETUP ============
const kazagumo = new Kazagumo(
    {
        defaultSearchEngine: 'youtube',
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    },
    new Connectors.DiscordJS(client),
    Nodes,
    { moveOnDisconnect: false, resumable: false, reconnectTries: 3, restTimeout: 15000 }
);

// ============ HELPER FUNCTIONS ============
function formatDuration(ms) {
    if (!ms || ms === 0) return '🔴 Live';
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    const h = Math.floor(ms / (1000 * 60 * 60));
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}

function errorEmbed(message) {
    return new EmbedBuilder().setColor('#ff6b6b').setDescription(`❌ ${message}`);
}

function successEmbed(message) {
    return new EmbedBuilder().setColor(BOT_INFO.color).setDescription(message);
}

// ============ LAVALINK EVENTS ============
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink ${name} connected!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink ${name} error:`, error));

// ============ PLAYER EVENTS ============
kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(BOT_INFO.color)
        .setAuthor({ name: 'Now Playing 🎵', iconURL: client.user.displayAvatarURL() })
        .setTitle(track.title)
        .setURL(track.uri)
        .setThumbnail(track.thumbnail || null)
        .addFields(
            { name: 'Duration', value: formatDuration(track.length), inline: true },
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Requested by', value: `${track.requester}`, inline: true }
        )
        .setFooter({ text: `Volume: ${player.volume}%  •  ${BOT_INFO.name} v${BOT_INFO.version}` })
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

kazagumo.on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setDescription('⏹️ Queue finished. Disconnecting...')
            .setTimestamp();
        channel.send({ embeds: [embed] });
    }
    player.destroy();
});

kazagumo.on('playerError', (player, error) => {
    console.error('Player error:', error);
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
        channel.send({ embeds: [errorEmbed('Failed to play track. Skipping...')] });
    }
});

// ============ DISCORD CLIENT EVENTS ============
client.on('ready', () => {
    console.log('═══════════════════════════════');
    console.log('✅✅✅ BOT ONLINE! ✅✅✅');
    console.log(`🤖 ${client.user.tag}`);
    console.log(`📊 ${client.guilds.cache.size} servers`);
    console.log('═══════════════════════════════');
    client.user.setActivity('!help • Music Bot', { type: 2 });
});

client.on('error', (error) => {
    console.error('❌ Client Error:', error.message);
    console.error('Stack:', error.stack);
});

client.on('shardError', (error, shardId) => {
    console.error(`❌ Shard ${shardId} Error:`, error.message);
});

client.on('shardReady', (id) => {
    console.log(`✅ Shard ${id} ready`);
});

client.on('shardDisconnect', (event, id) => {
    console.warn(`⚠️ Shard ${id} disconnected:`, event.code, event.reason);
});

client.on('shardReconnecting', (id) => {
    console.log(`🔄 Shard ${id} reconnecting...`);
});

client.on('shardResume', (id, replayedEvents) => {
    console.log(`✅ Shard ${id} resumed (${replayedEvents} events)`);
});

client.on('invalidated', () => {
    console.error('❌ Session invalidated!');
});

client.ws.on('ready', (data) => {
    console.log('✅ WebSocket ready:', data);
});

// ============ MESSAGE COMMANDS ============
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const validCommands = ['play', 'p', 'skip', 's', 'stop', 'pause', 'resume', 'queue', 'q', 'nowplaying', 'np', 'loop', 'volume', 'vol', 'seek', '8d', 'help', 'info', 'ping'];
    if (!validCommands.includes(command)) return;

    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply({ embeds: [errorEmbed('Join a voice channel first!')] });
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply({ embeds: [errorEmbed('Please provide a song name or URL!\n`!play <song name/url>`')] });
        }

        try {
            let player = kazagumo.players.get(message.guild.id);

            if (!player) {
                player = await kazagumo.createPlayer({
                    guildId: message.guild.id,
                    textId: message.channel.id,
                    voiceId: message.member.voice.channel.id,
                    volume: 70,
                    deaf: true,
                    shardId: message.guild.shardId
                });
            }

            const result = await kazagumo.search(query, { requester: message.author });

            if (!result || !result.tracks.length) {
                return message.reply({ embeds: [errorEmbed('No results found!')] });
            }

            if (result.type === 'PLAYLIST') {
                for (const track of result.tracks) {
                    player.queue.add(track);
                }
                const embed = new EmbedBuilder()
                    .setColor(BOT_INFO.color)
                    .setDescription(`📃 Added **${result.tracks.length}** tracks from **${result.playlistName}**`);
                message.channel.send({ embeds: [embed] });
            } else {
                player.queue.add(result.tracks[0]);
                if (player.playing || player.paused) {
                    const embed = new EmbedBuilder()
                        .setColor(BOT_INFO.color)
                        .setDescription(`➕ Added to queue: **${result.tracks[0].title}**`);
                    message.channel.send({ embeds: [embed] });
                }
            }

            if (!player.playing && !player.paused) player.play();

        } catch (error) {
            console.error('Play error:', error);
            message.reply({ embeds: [errorEmbed('An error occurred!')] });
        }
    }

    if (command === 'skip' || command === 's') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing to skip!')] });
        player.skip();
        message.react('⏭️');
    }

    if (command === 'stop') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.destroy();
        message.react('⏹️');
    }

    if (command === 'pause') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.pause(true);
        message.react('⏸️');
    }

    if (command === 'resume') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.pause(false);
        message.react('▶️');
    }

    if (command === 'queue' || command === 'q') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Queue is empty!')] });

        const current = player.queue.current;
        const queue = player.queue;

        let description = `**Now Playing:**\n[${current.title}](${current.uri}) • \`${formatDuration(current.length)}\`\n\n`;

        if (queue.length > 0) {
            description += `**Up Next:**\n`;
            queue.slice(0, 10).forEach((track, i) => {
                description += `\`${i + 1}.\` [${track.title}](${track.uri}) • \`${formatDuration(track.length)}\`\n`;
            });
            if (queue.length > 10) description += `\n*...and ${queue.length - 10} more*`;
        }

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: `Queue • ${message.guild.name}`, iconURL: message.guild.iconURL() })
            .setDescription(description)
            .setFooter({ text: `${queue.length + 1} tracks • Volume: ${player.volume}%` });

        message.channel.send({ embeds: [embed] });
    }

    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: BOT_INFO.name, iconURL: client.user.displayAvatarURL() })
            .setDescription(BOT_INFO.description)
            .addFields(
                {
                    name: '🎵 Music',
                    value: '```\n!play <song>  - Play a song\n!skip         - Skip current\n!stop         - Stop & leave\n!pause        - Pause\n!resume       - Resume\n```',
                    inline: false
                },
                {
                    name: '📋 Queue',
                    value: '```\n!queue        - View queue\n!nowplaying   - Current song\n!loop <mode>  - track/queue/off\n```',
                    inline: false
                },
                {
                    name: '🎛️ Control',
                    value: '```\n!volume <0-100> - Set volume\n!seek <1:30>    - Seek to time\n!8d             - Toggle 8D\n```',
                    inline: false
                }
            )
            .setFooter({ text: `Made by ${BOT_INFO.owner.display} • v${BOT_INFO.version}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    if (command === 'ping') {
        const latency = Date.now() - message.createdTimestamp;
        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setDescription(`🏓 **Pong!**\n📡 Latency: \`${latency}ms\`\n💓 API: \`${Math.round(client.ws.ping)}ms\``);

        message.channel.send({ embeds: [embed] });
    }
});

// ============ GLOBAL ERROR HANDLERS ============
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ============ DEBUG & LOGIN ============
console.log('');
console.log('═══════════════════════════════════════');
console.log('          DEBUG INFORMATION            ');
console.log('═══════════════════════════════════════');
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('Discord.js version:', require('discord.js').version);
console.log('');
console.log('Environment:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  PORT:', process.env.PORT);
console.log('  DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
console.log('  DISCORD_TOKEN length:', process.env.DISCORD_TOKEN?.length || 0);

const discordToken = process.env.DISCORD_TOKEN;

if (!discordToken) {
    console.error('❌ FATAL: DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

const cleanToken = discordToken.trim();
const tokenParts = cleanToken.split('.');

console.log('');
console.log('Token validation:');
console.log('  Parts count:', tokenParts.length, tokenParts.length === 3 ? '✅' : '❌');
console.log('  First 20 chars:', cleanToken.substring(0, 20) + '...');
console.log('═══════════════════════════════════════');

if (tokenParts.length !== 3) {
    console.error('❌ FATAL: Token format invalid!');
    process.exit(1);
}

client.on('debug', (info) => {
    if (info.includes('Prepared') || 
        info.includes('Connecting') || 
        info.includes('Identifying') ||
        info.includes('Ready') ||
        info.includes('Heartbeat') ||
        info.includes('Session')) {
        console.log('[WS DEBUG]', info);
    }
});

console.log('');
console.log('🔄 Starting login process...');
console.log('');

let loginStartTime = Date.now();
let checkInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - loginStartTime) / 1000);
    if (elapsed % 10 === 0 && elapsed > 0) {
        console.log(`⏱️  Still waiting... ${elapsed}s elapsed`);
    }
}, 1000);

const loginTimeout = setTimeout(() => {
    clearInterval(checkInterval);
    console.error('');
    console.error('═══════════════════════════════════════');
    console.error('❌ LOGIN TIMEOUT (60 detik)');
    console.error('═══════════════════════════════════════');
    console.error('Test manual:');
    console.error('  • https://musikkkk.onrender.com/test-discord');
    console.error('  • https://musikkkk.onrender.com/test-websocket');
    console.error('═══════════════════════════════════════');
    process.exit(1);
}, 60000);

client.login(cleanToken)
    .then(() => {
        clearTimeout(loginTimeout);
        clearInterval(checkInterval);
        const elapsed = ((Date.now() - loginStartTime) / 1000).toFixed(2);
        console.log('✅ Login success in', elapsed, 'seconds');
    })
    .catch((error) => {
        clearTimeout(loginTimeout);
        clearInterval(checkInterval);
        console.error('');
        console.error('❌ LOGIN FAILED!');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
        console.error('Stack:', error.stack);
        process.exit(1);
    });

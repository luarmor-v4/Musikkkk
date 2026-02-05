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

// ============ DISCORD CLIENT ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
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
    console.log('✅ BOT BERHASIL ONLINE!');
    console.log(`🤖 Username: ${client.user.tag}`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log(`👥 Users: ${client.users.cache.size}`);
    console.log('═══════════════════════════════');
    
    client.user.setActivity('!help • Music Bot', { type: 2 });
});

client.on('error', (error) => {
    console.error('❌ Discord Client Error:', error);
});

client.on('shardError', (error) => {
    console.error('❌ Shard Error:', error);
});

// ============ MESSAGE COMMANDS ============
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    const validCommands = ['play', 'p', 'skip', 's', 'stop', 'pause', 'resume', 'queue', 'q', 'nowplaying', 'np', 'loop', 'volume', 'vol', 'seek', '8d', 'help', 'info', 'ping'];
    if (!validCommands.includes(command)) return;

    // ==================== PLAY ====================
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

    // ==================== SKIP ====================
    if (command === 'skip' || command === 's') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing to skip!')] });
        player.skip();
        message.react('⏭️');
    }

    // ==================== STOP ====================
    if (command === 'stop') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.destroy();
        message.react('⏹️');
    }

    // ==================== PAUSE ====================
    if (command === 'pause') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.pause(true);
        message.react('⏸️');
    }

    // ==================== RESUME ====================
    if (command === 'resume') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });
        player.pause(false);
        message.react('▶️');
    }

    // ==================== QUEUE ====================
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

    // ==================== NOW PLAYING ====================
    if (command === 'nowplaying' || command === 'np') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player?.queue.current) return message.reply({ embeds: [errorEmbed('Nothing is playing!')] });

        const current = player.queue.current;
        const position = player.position;
        const duration = current.length;

        const progress = duration ? Math.round((position / duration) * 15) : 0;
        const bar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(15 - progress);

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: 'Now Playing', iconURL: client.user.displayAvatarURL() })
            .setTitle(current.title)
            .setURL(current.uri)
            .setThumbnail(current.thumbnail)
            .addFields(
                { name: 'Author', value: current.author || 'Unknown', inline: true },
                { name: 'Requested by', value: `${current.requester}`, inline: true },
                { name: 'Volume', value: `${player.volume}%`, inline: true }
            )
            .setDescription(`\`${formatDuration(position)}\` ${bar} \`${formatDuration(duration)}\``)
            .setFooter({ text: `Loop: ${player.loop || 'Off'}` });

        message.channel.send({ embeds: [embed] });
    }

    // ==================== HELP ====================
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

    // ==================== INFO ====================
    if (command === 'info') {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const embed = new EmbedBuilder()
            .setColor(BOT_INFO.color)
            .setAuthor({ name: BOT_INFO.name, iconURL: client.user.displayAvatarURL() })
            .setDescription(BOT_INFO.description)
            .addFields(
                { name: '👨‍💻 Developer', value: `<@${BOT_INFO.owner.id}>`, inline: true },
                { name: '📊 Servers', value: `${client.guilds.cache.size}`, inline: true },
                { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                { name: '🏷️ Version', value: BOT_INFO.version, inline: true },
                { name: '📚 Library', value: 'Discord.js v14', inline: true },
                { name: '🎵 Audio', value: 'Lavalink v4', inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // ==================== PING ====================
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
console.log('========== DEBUG INFO ==========');
console.log('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
console.log('DISCORD_TOKEN length:', process.env.DISCORD_TOKEN?.length || 0);

const discordToken = process.env.DISCORD_TOKEN;

if (!discordToken) {
    console.error('❌ DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

// Trim whitespace (sering jadi masalah)
const cleanToken = discordToken.trim();
const tokenParts = cleanToken.split('.');
console.log('Token parts:', tokenParts.length, '(harus 3)');

// Cek ada whitespace/newline tersembunyi
if (discordToken !== cleanToken) {
    console.warn('⚠️ Token punya whitespace! Menggunakan token yang sudah di-trim');
}

console.log('================================');

if (tokenParts.length !== 3) {
    console.error('❌ Format token salah!');
    process.exit(1);
}

// Debug mode untuk Discord.js
client.on('debug', (info) => {
    console.log('[DEBUG]', info);
});

console.log('🔄 Memulai login ke Discord...');

// Set timeout
const loginTimeout = setTimeout(() => {
    console.error('❌ LOGIN TIMEOUT setelah 60 detik!');
    console.error('Kemungkinan:');
    console.error('  1. Token salah atau expired');
    console.error('  2. Intents tidak aktif di Discord Developer Portal');
    console.error('  3. Network Render tidak bisa akses Discord API');
    console.error('  4. Discord API sedang down');
    process.exit(1);
}, 60000);

client.login(cleanToken)
    .then(() => {
        clearTimeout(loginTimeout);
        console.log('✅ Login promise resolved!');
    })
    .catch((error) => {
        clearTimeout(loginTimeout);
        console.error('❌ LOGIN GAGAL!');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        console.error('Stack:', error.stack);
        process.exit(1);
    });

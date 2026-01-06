import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Dashboard {
    constructor(bot) {
        this.bot = bot;
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new Server(this.httpServer);
        this.port = process.env.PORT || 3000;
        this.activeSocket = null; // Only one controller allowed (The Boss)

        this.setupExpress();
        this.setupSocket();
    }

    setupExpress() {
        // Serve static files
        // Serve static files
        this.app.use(express.static(join(__dirname, 'public')));

        this.app.get('/', (req, res) => {
            res.send(`
                <h1>Dashboard Online</h1>
                <p>Status: Active</p>
                <p>Gateway: Render</p>
            `);
        });

        // Secure Login Route (accessed via unique token from !control)
        this.app.get('/login/:token', (req, res) => {
            // Simple validation for now, could be more robust
            if (req.params.token === this.bot.currentControlToken) {
                res.cookie('auth', 'boss', { maxAge: 900000, httpOnly: false });
                res.redirect('/');
            } else {
                res.status(403).send('Access Denied. Nice try.');
            }
        });
    }

    setupSocket() {
        this.io.on('connection', (socket) => {
            console.log('Dashboard connected.');
            this.activeSocket = socket;

            // Send initial state
            this.sendState(socket);

            // Fetch User Profile
            // Fetch User Profile (Updated with Image Fetch + Mod Support)
            socket.on('fetchUserProfile', async (data) => {
                try {
                    const { userId, guildId } = data;
                    let profileData = {};

                    if (guildId) {
                        const guild = await this.bot.guilds.fetch(guildId);
                        const member = await guild.members.fetch(userId);

                        // Fetch Last Image (Basic Scan in System Channel or First Text Channel)
                        let lastImage = null;
                        const targetChannel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased());

                        if (targetChannel) {
                            // Fetch last 50 messages to find an image
                            try {
                                const messages = await targetChannel.messages.fetch({ limit: 50 });
                                const userMsgWithImage = messages.find(m =>
                                    m.author.id === userId && m.attachments.size > 0
                                );
                                if (userMsgWithImage) {
                                    lastImage = userMsgWithImage.attachments.first().url;
                                }
                            } catch (e) { console.error("Image scan failed:", e); }
                        }

                        profileData = {
                            userId: member.id, // Explicit ID for Mod controls
                            username: member.user.username,
                            discriminator: member.user.discriminator,
                            avatarUrl: member.user.displayAvatarURL({ size: 256, dynamic: true }),
                            bannerColor: member.user.hexAccentColor || '#000000',
                            bannerUrl: member.user.bannerURL({ size: 512, dynamic: true }),
                            joinedAt: member.joinedAt.toDateString(),
                            roles: member.roles.cache
                                .filter(r => r.name !== '@everyone')
                                .sort((a, b) => b.position - a.position) // Sort by hierarchy
                                .map(r => ({ name: r.name, color: r.hexColor })),
                        };
                    } else {
                        // Fallback for user not in server context
                        const user = await this.bot.users.fetch(userId);
                        profileData = {
                            userId: user.id,
                            username: user.username,
                            discriminator: user.discriminator,
                            avatarUrl: user.displayAvatarURL({ size: 256, dynamic: true }),
                            bannerColor: user.hexAccentColor || '#000000',
                            bannerUrl: user.bannerURL({ size: 512, dynamic: true }),
                            joinedAt: "Unknown",
                            roles: [],
                            roles: [],
                            lastImage: null,
                            memory: null
                        };
                    }

                    // Fetch Memory (Dynamic Import to be safe)
                    try {
                        const { getUserMemory } = await import('../database.js');
                        profileData.memory = getUserMemory(profileData.userId) || '';
                    } catch (e) { console.error("Memory Fetch Error:", e); }

                    socket.emit('userProfileResult', profileData);
                } catch (error) {
                    console.error("Profile Fetch Error:", error);
                    socket.emit('userProfileError', "Could not fetch profile.");
                }
            });

            // Update Memory
            socket.on('updateUserMemory', async (data) => {
                const { userId, content } = data;
                try {
                    const { updateUserMemory } = await import('../database.js');
                    updateUserMemory(userId, content);
                    socket.emit('memoryUpdateResult', { success: true });
                } catch (e) {
                    console.error("Memory Update Error:", e);
                    socket.emit('memoryUpdateResult', { success: false, error: e.message });
                }
            });

            // Open DM
            socket.on('openDM', async (userId) => {
                try {
                    const user = await this.bot.users.fetch(userId);
                    const dmChannel = await user.createDM();
                    socket.emit('openDMResult', {
                        success: true,
                        channelId: dmChannel.id,
                        name: user.username
                    });
                } catch (error) {
                    console.error("Failed to open DM:", error);
                    socket.emit('openDMResult', { success: false, error: "Could not open DM. (User blocked bot?)" });
                }
            });

            // Mod Actions
            socket.on('modAction', async ({ action, userId, guildId, duration }) => {
                console.log(`🛡️ Mod Action Received: ${action} -> ${userId}`);
                try {
                    const guild = await this.bot.guilds.fetch(guildId);

                    // Safety Check
                    if (userId === process.env.OWNER_ID || userId === this.bot.user.id) {
                        socket.emit('modActionResult', { success: false, error: "Cannot moderate Boss or Bot." });
                        return;
                    }

                    // For Ban/Unban we might not have a member object (if they left), but we need member for Timeout/Kick
                    let member = null;
                    try { member = await guild.members.fetch(userId); } catch (e) { }

                    switch (action) {
                        case 'timeout':
                            if (member) await member.timeout(duration || 3600000, 'Action via Dashboard');
                            else throw new Error("User not in server.");
                            break;
                        case 'untimeout':
                            if (member) await member.timeout(null, 'Action via Dashboard');
                            else throw new Error("User not in server.");
                            break;
                        case 'kick':
                            if (member) await member.kick('Action via Dashboard');
                            else throw new Error("User not in server.");
                            break;
                        case 'ban':
                            // Can ban by ID even if not in server
                            await guild.members.ban(userId, { reason: 'Action via Dashboard' });
                            break;
                        case 'unban':
                            await guild.bans.remove(userId, 'Action via Dashboard');
                            break;
                    }
                    socket.emit('modActionResult', { success: true, action });
                } catch (error) {
                    console.error("Mod Action Failed:", error);
                    socket.emit('modActionResult', { success: false, error: error.message });
                }
            });

            // Handle incoming events from Dashboard
            socket.on('sendMessage', async (data) => {
                await this.handleManualMessage(data);
            });

            socket.on('toggleMode', (data) => {
                this.bot.manualMode = data.enabled;
                console.log(`Manual Mode set to: ${this.bot.manualMode}`);
                this.broadcastStatus();
            });

            socket.on('lookupInvite', async (inviteCode) => {
                const result = await this.handleInviteLookup(inviteCode);
                socket.emit('lookupResult', result);
            });

            // Fetch DMs
            socket.on('fetchDMs', async () => {
                try {
                    // Filter for DM Channels (Type 1)
                    const dmChannels = this.bot.channels.cache.filter(c => c.type === 1);

                    const dms = dmChannels.map(c => {
                        const recipient = c.recipient || c.recipients?.first(); // Handle different djs versions/structures
                        if (!recipient) return null;

                        return {
                            id: c.id,
                            recipient: {
                                username: recipient.username,
                                avatar: recipient.displayAvatarURL(),
                                id: recipient.id,
                                status: recipient.presence?.status || 'offline'
                            }
                        };
                    }).filter(dm => dm !== null);

                    socket.emit('dmListResult', dms);
                } catch (error) {
                    console.error("Error fetching DMs:", error);
                }
            });

            // Fetch History (Updated for completeness)
            socket.on('fetchHistory', async (channelId) => {
                try {
                    const channel = await this.bot.channels.fetch(channelId);
                    if (!channel || !channel.isTextBased()) return;

                    const messages = await channel.messages.fetch({ limit: 50 });
                    const history = Array.from(messages.values()).reverse().map(m => ({
                        id: m.id,
                        author: m.author.username,
                        authorId: m.author.id, // Needed for clicking profiles
                        authorColor: m.member ? m.member.displayHexColor : '#ffffff', // Add Color
                        authorAvatar: m.author.displayAvatarURL(),
                        content: m.content || '(Attachment/Embed)',
                        timestamp: new Date(m.createdTimestamp).toLocaleTimeString(),
                        isBot: m.author.bot
                    }));
                    socket.emit('historyResult', history);
                } catch (error) {
                    console.error('Error fetching history:', error);
                }
            });

            // Delete Message
            socket.on('deleteMessage', async (data) => {
                try {
                    const channel = await this.bot.channels.fetch(data.channelId);
                    if (channel && channel.isTextBased()) {
                        const msg = await channel.messages.fetch(data.messageId);
                        if (msg) {
                            await msg.delete();
                            socket.emit('deleteResult', { success: true, messageId: data.messageId });
                        }
                    }
                } catch (e) {
                    console.error("Delete Message Error:", e);
                }
            });

            // Auto-Join Protocol v3
            socket.on('autoJoin', async (serverId) => {
                console.log(`🤖 Receive Auto-Join Request for: ${serverId}`);
                try {
                    // Dynamic Import to avoid top-level issues if file is broken
                    const { autoAuthorizeBot } = await import('../auto_joiner.js');
                    const result = await autoAuthorizeBot(serverId);

                    socket.emit('autoJoinResult', result);
                } catch (error) {
                    console.error("Auto-Join Handler Failed:", error);
                    socket.emit('autoJoinResult', { success: false, error: error.message });
                }
            });

            socket.on('disconnect', () => {
                console.log('Dashboard disconnected.');
                this.activeSocket = null;
            });
        });
    }

    async handleInviteLookup(code) {
        try {
            // Extract code from URL if needed
            const cleanCode = code.split('/').pop();
            const invite = await this.bot.fetchInvite(cleanCode);

            if (!invite) return { error: 'Invalid Invite Code' };

            const guild = invite.guild;
            return {
                success: true,
                code: invite.code,
                guild: {
                    id: guild.id,
                    name: guild.name,
                    description: guild.description || 'No description available.',
                    memberCount: invite.memberCount,
                    onlineCount: invite.presenceCount,
                    icon: guild.iconURL({ size: 1024 }),
                    splash: guild.splashURL({ size: 1024 }),
                    banner: guild.bannerURL({ size: 1024 })
                }
            };
        } catch (error) {
            console.error('Lookup failed:', error.message);
            return { error: 'Could not resolve invite. (Expired or Invalid)' };
        }
    }

    sendState(socket) {
        const guilds = this.bot.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL(),
            channels: g.channels.cache
                .filter(c => c.type === 0) // Text Channels
                .map(c => ({ id: c.id, name: c.name }))
        }));

        socket.emit('init', {
            guilds,
            user: { username: this.bot.user.username, avatar: this.bot.user.displayAvatarURL() },
            manualMode: this.bot.manualMode || false
        });
    }

    broadcastStatus() {
        this.io.emit('statusUpdate', {
            manualMode: this.bot.manualMode
        });
    }

    broadcastMessage(message) {
        // Send received discord messages to dashboard
        this.io.emit('discordMessage', message);
    }

    broadcastTyping(channelId, userId) {
        // Fetch user cache or just send ID? client side can't resolve ID easily without cache
        // Let's try to resolve username if possible
        const user = this.bot.users.cache.get(userId);
        const username = user ? user.username : 'Someone';
        this.io.emit('typing', { channelId, user: username });
    }

    async handleManualMessage(data) {
        const { channelId, content } = data;
        try {
            const channel = await this.bot.channels.fetch(channelId);
            if (channel) {
                await channel.send(content);
                // Echo back to dashboard is handled by the messageCreate event in bot.js
            }
        } catch (error) {
            console.error('Failed to send manual message:', error);
        }
    }

    start() {
        this.httpServer.listen(this.port, () => {
            console.log(`Dashboard running on http://localhost:${this.port}`);
        });
    }
}

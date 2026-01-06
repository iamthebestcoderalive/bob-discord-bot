import { Client, GatewayIntentBits, ChannelType, PermissionsBitField, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { PuterClient } from './puterClient.js';
import { getUserTier, updateUserTier, logUserMessage, getRecentUserMessages, getUserMemory, getServerPersona, updateServerPersona } from './database.js';
import { Dashboard } from './dashboard/server.js';
import { VoiceHandler } from './voiceHandler.js';
import { randomBytes } from 'crypto';

const BOSS_USER_ID = '1026865113694740490';
const MSG_HISTORY_LIMIT = 50; // Increased for "Unlimited Awareness" feel
const DEBOUNCE_DELAY_MS = 2000; // Base delay

export class BobBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.DirectMessages, // Required for DMs
                GatewayIntentBits.GuildMessageTyping // REQUIRED for 'typingStart'
            ],
            partials: [
                Partials.Channel,
                Partials.Message
            ]
        });

        this.llm = new PuterClient();
        this.debounceTimers = new Map();
        this.lastTypingTime = new Map(); // Track channel typing activity
        this.lastResponseTime = new Map(); // Track when Bob last spoke in a channel
        this.voiceHandler = new VoiceHandler(); // Initialize Voice

        // Dashboard & Control State
        this.manualMode = false;
        this.currentControlToken = null;
        this.dashboard = new Dashboard(this);

        this.setupEventHandlers();
    }

    startDashboard() {
        if (this.dashboard) {
            this.dashboard.start();
        }
    }

    setupEventHandlers() {
        this.once('ready', () => {
            console.log(`Logged in as ${this.user.tag} (ID: ${this.user.id})`);
            console.log('Bob is ready on the street.');
        });

        this.on('messageCreate', async (message) => {
            await this.onMessage(message);
        });

        // Typing Indicator Forwarding & Flow Control
        this.on('typingStart', (typing) => {
            // 1. Update Tracking
            this.lastTypingTime.set(typing.channel.id, Date.now());

            // 2. Broadcast to dashboard if active
            if (this.dashboard && this.dashboard.broadcastTyping) {
                this.dashboard.broadcastTyping(typing.channel.id, typing.user.id);
            }

            // 3. SMART TYPING: If currently waiting to reply, extend the wait.
            if (this.debounceTimers.has(typing.channel.id)) {
                if (!typing.user.bot) {
                    // console.log(`[Smart Wait] User typing in ${typing.channel.name}. Pushing back response...`);

                    // Clear current countdown
                    clearTimeout(this.debounceTimers.get(typing.channel.id));

                    // Set strict 3s 'Silence Watcher'
                    // If they stop typing now, we reply in exactly 3000ms.
                    // If they keep typing, this gets cleared and pushed back again.
                    const newTimer = setTimeout(() => {
                        this.debounceTimers.delete(typing.channel.id); // CRITICAL: Clear map entry
                        this.processChannelResponse(typing.channel);
                    }, 3000);

                    this.debounceTimers.set(typing.channel.id, newTimer);
                }
            }
        });

        // Interaction Handler (Slash Commands & Modals)
        this.on('interactionCreate', async (interaction) => {
            try {
                // 1. Slash Commands
                if (interaction.isChatInputCommand()) {
                    if (interaction.commandName === 'automod') {
                        // Permission Check
                        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                            await interaction.reply({ content: '❌ You need **Administrator** permissions to use this.', ephemeral: true });
                            return;
                        }

                        const action = interaction.options.getString('action');
                        const punishment = interaction.options.getString('punishment');

                        if (action === 'modify') {
                            if (!punishment) {
                                await interaction.reply({ content: '❌ You must specify a **Punishment** type to modify it (e.g., Mute, Kick).', ephemeral: true });
                                return;
                            }

                            const modal = new ModalBuilder()
                                .setCustomId(`automod_modify_${punishment}`)
                                .setTitle(`Configure ${punishment.toUpperCase()}`);

                            const descInput = new TextInputBuilder()
                                .setCustomId('description')
                                .setLabel("Description / Reason")
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder("Enter the default reason for this punishment...")
                                .setRequired(true);

                            const durationInput = new TextInputBuilder()
                                .setCustomId('duration')
                                .setLabel("Duration (e.g., 10m, 1h)")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder("Optional (Leave empty for default)")
                                .setRequired(false);

                            modal.addComponents(
                                new ActionRowBuilder().addComponents(descInput),
                                new ActionRowBuilder().addComponents(durationInput)
                            );

                            await interaction.showModal(modal);
                        } else {
                            // Handle On/Off
                            const status = action === 'on' ? 'Enabled' : 'Disabled';
                            const color = action === 'on' ? 0x00FF00 : 0xFF0000;
                            const target = punishment ? punishment.toUpperCase() : 'GLOBAL AUTOMOD';

                            const embed = new EmbedBuilder()
                                .setColor(color)
                                .setTitle(`AutoMod Settings Updated`)
                                .setDescription(`**${target}** is now **${status}**.`)
                                .setFooter({ text: 'Bob Security Systems' });

                            await interaction.reply({ embeds: [embed], ephemeral: true });
                        }
                    }

                    // 2. Persona Command
                    else if (interaction.commandName === 'pers') {
                        // Permission Check (Owner Override)
                        const isOwner = interaction.user.id === BOSS_USER_ID;
                        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !isOwner) {
                            await interaction.reply({ content: '❌ You need **Administrator** permissions to use this.', ephemeral: true });
                            return;
                        }

                        // CRITICAL: Defer immediately to prevent timeout
                        try {
                            await interaction.deferReply({ ephemeral: true });
                        } catch (err) {
                            console.error("Deferral failed:", err);
                        }

                        const reset = interaction.options.getBoolean('reset');
                        const avatar = interaction.options.getAttachment('avatar');
                        const banner = interaction.options.getAttachment('banner');
                        const nickname = interaction.options.getString('nickname');
                        const bio = interaction.options.getString('bio');
                        const tags = interaction.options.getString('tags');
                        const me = interaction.guild.members.me;

                        // C. RESET MODE
                        if (reset) {
                            try {
                                const updates = [];

                                // 1. Reset Discord Visuals
                                await me.setNickname(null); // Reset nick
                                updates.push("✅ Nickname Reset");

                                try {
                                    await me.edit({ avatar: null, banner: null });
                                    updates.push("✅ Avatar & Banner Reset");
                                } catch (e) {
                                    updates.push(`⚠️ Visual Reset Partial: ${e.message}`);
                                }

                                // 2. Reset Database
                                updateServerPersona(interaction.guild.id, '', '', '');
                                updates.push("✅ AI Persona Cleared");

                                await interaction.editReply(`**🔄 Factory Reset Complete!**\nBob is back to default settings for this server.\n\n${updates.join('\n')}`);
                            } catch (e) {
                                await interaction.editReply(`❌ Reset Failed: ${e.message}`);
                            }
                        }
                        // A. QUICK MODE: If args are present, apply them directly
                        else if (avatar || banner || nickname || bio || tags) {
                            try {
                                const updates = [];
                                if (avatar) {
                                    if (!avatar.contentType.startsWith('image/')) throw new Error("Avatar must be an image.");
                                    await me.edit({ avatar: avatar.url });
                                    updates.push("✅ Server Avatar Updated");
                                }
                                if (banner) {
                                    if (!banner.contentType.startsWith('image/')) throw new Error("Banner must be an image.");
                                    try {
                                        await me.edit({ banner: banner.url });
                                        updates.push("✅ Server Banner Updated");
                                    } catch (err) {
                                        updates.push("⚠️ Banner Update Failed (Server Level too low?)");
                                    }
                                }
                                if (nickname) {
                                    await me.setNickname(nickname);
                                    updates.push("✅ Server Nickname Updated");
                                }
                                if (bio || tags) {
                                    updateServerPersona(interaction.guild.id, bio, tags, undefined);
                                    updates.push("✅ AI Persona Updated");
                                }
                                await interaction.editReply(`**Persona Updated!**\n${updates.join('\n')}`);
                            } catch (error) {
                                console.error('Persona Update Error:', error);
                                await interaction.editReply(`❌ Failed: ${error.message}`);
                            }
                        }
                        // B. DASHBOARD MODE: No args, show UI
                        else {
                            const current = getServerPersona(interaction.guild.id) || {};

                            const dashboardEmbed = new EmbedBuilder()
                                .setColor(0x2B2D31)
                                .setTitle('🎭 Server Persona Settings')
                                .setDescription(`Configure how Bob looks and acts **only in this server** (${interaction.guild.name}).`)
                                .addFields(
                                    { name: '📛 Nickname', value: me.nickname || 'Default', inline: true },
                                    { name: '📝 Bio', value: current.description || '_None_', inline: true },
                                    { name: '🏷️ Tags', value: current.tags || '_None_', inline: true },
                                    { name: '🧠 Personality', value: current.personality ? (current.personality.substring(0, 100) + '...') : '_Default_', inline: false }
                                )
                                .setThumbnail(me.displayAvatarURL());

                            const btnEdit = new ButtonBuilder()
                                .setCustomId('pers_edit_text')
                                .setLabel('Edit Persona')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📝');

                            const btnAvatar = new ButtonBuilder()
                                .setCustomId('pers_help_img')
                                .setLabel('Change Avatar/Banner')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('🖼️');

                            const row = new ActionRowBuilder().addComponents(btnEdit, btnAvatar);

                            await interaction.editReply({ embeds: [dashboardEmbed], components: [row], ephemeral: true });
                        }
                    }

                    // 3. Voice Commands
                    else if (interaction.commandName === 'join' || interaction.commandName === 'leave') {
                        await this.handleVoiceInteractions(interaction);
                    }
                }

                // 2. Modals & Buttons
                else if (interaction.isModalSubmit() || interaction.isButton()) {
                    if (interaction.customId.startsWith('automod_modify_')) {
                        const punishment = interaction.customId.split('_')[2];
                        const description = interaction.fields.getTextInputValue('description');
                        const duration = interaction.fields.getTextInputValue('duration') || 'Default';

                        await interaction.deferReply({ ephemeral: true });
                        const aiCheck = await this.llm.validateModerationConfig(punishment, description, duration);

                        if (!aiCheck.valid) {
                            await interaction.editReply(`❌ **I didn't understand that.**\n${aiCheck.feedback}\n\n*Please try again with a clear reason.*`);
                            return;
                        }

                        const embed = new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('✅ Configuration Applied')
                            .addFields(
                                { name: 'Punishment', value: punishment.toUpperCase(), inline: true },
                                { name: 'Status', value: 'Updated', inline: true },
                                { name: 'Reason Pattern', value: description },
                                { name: 'Duration', value: duration },
                                { name: 'AI Note', value: aiCheck.feedback }
                            )
                            .setFooter({ text: 'Changes saved successfully.' });

                        await interaction.editReply({ embeds: [embed] });
                    }
                    else if (interaction.customId === 'pers_edit_text') {
                        // Show Modal - No Deferral here
                        const current = getServerPersona(interaction.guild.id) || {};
                        const me = interaction.guild.members.me;

                        const modal = new ModalBuilder()
                            .setCustomId('pers_modal_submit')
                            .setTitle('Edit Server Persona');

                        const inputNick = new TextInputBuilder()
                            .setCustomId('nick')
                            .setLabel("Nickname")
                            .setStyle(TextInputStyle.Short)
                            .setValue(me.nickname || '')
                            .setRequired(false);

                        const inputBio = new TextInputBuilder()
                            .setCustomId('bio')
                            .setLabel("Bio")
                            .setStyle(TextInputStyle.Short)
                            .setValue(current.description || '')
                            .setPlaceholder("Short description")
                            .setRequired(false);

                        const inputTags = new TextInputBuilder()
                            .setCustomId('tags')
                            .setLabel("Tags")
                            .setStyle(TextInputStyle.Short)
                            .setValue(current.tags || '')
                            .setPlaceholder("funny, rude, helpful")
                            .setRequired(false);

                        const inputPers = new TextInputBuilder()
                            .setCustomId('personality')
                            .setLabel("Personality (The Big Box)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(current.personality || '')
                            .setPlaceholder("Full System Prompt adjustment for this server...")
                            .setRequired(false);

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(inputNick),
                            new ActionRowBuilder().addComponents(inputBio),
                            new ActionRowBuilder().addComponents(inputTags),
                            new ActionRowBuilder().addComponents(inputPers)
                        );

                        await interaction.showModal(modal);
                    }
                    else if (interaction.customId === 'pers_help_img') {
                        await interaction.reply({
                            content: `ℹ️ **To change Visuals:**\nUse the specific commands:\n\n\`/pers avatar: [image]\`\n\`/pers banner: [image]\``,
                            ephemeral: true
                        });
                    }
                    else if (interaction.customId === 'pers_modal_submit') {
                        await interaction.deferReply({ ephemeral: true });
                        try {
                            const nick = interaction.fields.getTextInputValue('nick');
                            const bio = interaction.fields.getTextInputValue('bio');
                            const tags = interaction.fields.getTextInputValue('tags');
                            const pers = interaction.fields.getTextInputValue('personality');
                            const me = interaction.guild.members.me;

                            if (nick !== me.nickname) {
                                await me.setNickname(nick || null);
                            }

                            updateServerPersona(interaction.guild.id, bio, tags, pers);

                            await interaction.editReply({ content: '✅ **Persona Settings Applied!**' });
                        } catch (e) {
                            console.error(e);
                            await interaction.editReply({ content: `❌ Error: ${e.message}` });
                        }
                    }
                }

            } catch (error) {
                console.error('Interaction Error:', error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ An error occurred executing this command.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred executing this command.', ephemeral: true });
                }
            }
        });

        // Cleanup on shutdown
        process.on('SIGINT', async () => {
            await this.llm.cleanup();
        });
    }

    async onMessage(message) {
        // Broadcast to Dashboard (All messages, including self)
        if (this.dashboard) {
            const member = message.member; // Can be null in DMs
            this.dashboard.broadcastMessage({
                id: message.id,
                channelId: message.channel.id,
                guildId: message.guild ? message.guild.id : 'DM', // Added for Notifications
                author: message.author.username,
                authorId: message.author.id,
                authorColor: member ? member.displayHexColor : '#ffffff', // COLOR
                content: message.content,
                content: message.content,
                timestamp: new Date().toLocaleTimeString(),
                // RICH MEDIA SUPPORT
                attachments: message.attachments.map(a => ({ url: a.url, contentType: a.contentType })),
                embeds: message.embeds.map(e => ({ title: e.title, description: e.description, image: e.image, thumbnail: e.thumbnail })),
                reactions: message.reactions.cache.map(r => ({ emoji: r.emoji.name, count: r.count })),
                mentions: message.mentions.users.map(u => ({ id: u.id, username: u.username }))
            });
        }

        // Ignore own messages for AI processing
        if (message.author.id === this.user.id) return;

        console.log(`Received message from ${message.author.tag}: ${message.content}`);

        // Log message for global memory
        logUserMessage(message.author.id, message.author.username, message.content);

        // Handle commands (Priority High)
        if (message.content.startsWith('!tx')) {
            if (message.author.id !== BOSS_USER_ID) {
                console.warn(`Unauthorized !tx attempt by ${message.author.tag}`);
                return;
            }

            await this.handleBossCommand(message);
            return;
        }

        // Handle !control (Dashboard Access)
        if (message.content.startsWith('!control')) {
            if (message.author.id !== BOSS_USER_ID) {
                // SILENCE: Do not warn, do not reply. Just ignore.
                // This prevents the bot from leaking its existence or purpose to randoms/admins.
                return;
            }

            // Generate One-Time Token
            this.currentControlToken = randomBytes(16).toString('hex');
            const baseUrl = process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 3000}`;
            const link = `${baseUrl}/login/${this.currentControlToken}`;

            await message.author.send(`**Control Panel Access Granted.** 🕹️\n[**Click to Enter Dashboard**](${link})\n\n(This link is specific to this session).`);
            await message.delete(); // Delete command for security
            return;
        }

        // Handle Invite Links / !invite
        if (message.content.includes('discord.gg/') || message.content.includes('discord.com/invite/') || message.content.startsWith('!invite')) {
            console.log(`Invite detected from ${message.author.tag}`);
            try {
                const args = message.content.split(' ');
                let inviteOptions = {
                    scopes: ['bot'],
                    permissions: [
                        PermissionsBitField.Flags.Administrator
                    ],
                };

                let targetServerId = null;
                // Check if user provided an ID: !invite 12345
                if (args.length > 1 && args[1].match(/^\d+$/)) {
                    targetServerId = args[1];
                    inviteOptions.guild = targetServerId;
                    inviteOptions.disableGuildSelect = true;
                }

                const inviteLink = this.generateInvite(inviteOptions);

                let replyMsg = `**I can't click links, Boss.**\nAuthorize me directly here: [**Add Bob To Server**](${inviteLink})\n\n⚠️ **Note:** You must have **Manage Server** permissions to add me.`;
                if (targetServerId) {
                    replyMsg = `**Battering Ram Prepared for Server ID \`${targetServerId}\`.** 🚪💥\n[**Click to Force Entry**](${inviteLink})\n\n(If this link doesn't successfully add me, it means **YOU** don't have Admin permissions there. I cannot bypass Discord's security.)`;
                }

                await message.reply(replyMsg);
                return; // Stop processing (don't send to AI)
            } catch (error) {
                console.error('Failed to generate invite:', error);
            }
        }

        // Check intents
        if (!message.content) return;

        // RESPONSE TRIGGER LOGIC
        // User Request: "Respond when I talk TO him" (and never just "about" him)
        // UPDATE: "Analyze message with AI" -> If they talk ABOUT him (good/bad), let AI decide.
        const contentLower = message.content.toLowerCase();
        const isMentioned = message.mentions.has(this.user);
        const isDM = message.channel.type === ChannelType.DM;
        const isReplyToMe = message.mentions.repliedUser && message.mentions.repliedUser.id === this.user.id;
        const isNamed = contentLower.includes('bob'); // "Bob is weird" -> Trigger AI

        // CONTINUITY CHECK:
        // If Bob spoke in this channel recently (< 2 mins), he stays "awake" to follow-ups.
        const lastSpeak = this.lastResponseTime.get(message.channel.id) || 0;
        const isActiveConversation = (Date.now() - lastSpeak) < 120000; // 2 Minutes

        // If explicitly named/mentioned, ALWAYS respond.
        // If just active conversation, respond (but LLM might [SILENCE] if not relevant).
        const shouldRespond = isMentioned || isDM || isReplyToMe || isNamed || isActiveConversation;

        if (!shouldRespond) {
            // We still LOG the message above (passive reading), but we do NOT trigger a response.
            return;
        }

        // Debounce / Message Coalescing Logic
        const channelId = message.channel.id;

        // Cancel existing timer if present
        if (this.debounceTimers.has(channelId)) {
            clearTimeout(this.debounceTimers.get(channelId));
            console.log(`Debounce: Resetting timer for channel ${channelId}`);
        }

        // Initial Debounce: Wait 3s for follow-up messages.
        // If they type within this window, typingStart will catch it and extend the timer.
        const timer = setTimeout(() => {
            this.debounceTimers.delete(channelId); // CRITICAL: Clear map entry
            this.processChannelResponse(message.channel);
        }, 3000);

        this.debounceTimers.set(channelId, timer);
    }

    async handleBossCommand(message) {
        try {
            // Format: !tx <channel_id> <message>
            const parts = message.content.split(' ');
            if (parts.length < 3) {
                await message.channel.send('Usage: `!tx <channel_id> <message>`');
                return;
            }

            const targetChannelId = parts[1];
            const contentToSend = parts.slice(2).join(' ');

            const targetChannel = await this.channels.fetch(targetChannelId);

            if (targetChannel) {
                await targetChannel.send(contentToSend);
                await message.channel.send(`✅ Sent to ${targetChannel.name} (\`${targetChannelId}\`)`);
                console.log(`Boss sent remote message to ${targetChannelId}: ${contentToSend}`);
            } else {
                await message.channel.send(`❌ Could not find channel \`${targetChannelId}\``);
            }
        } catch (error) {
            await message.channel.send(`❌ Error: ${error.message}`);
            console.error('Command Error:', error);
        }
    }

    async processChannelResponse(channel) {
        try {
            // Fetch fresh history
            const messages = await channel.messages.fetch({ limit: MSG_HISTORY_LIMIT });
            const history = Array.from(messages.values()).reverse();

            // Find the primary user (last non-bot user)
            const lastUserMsg = [...history].reverse().find(m => m.author.id !== this.user.id);
            if (!lastUserMsg) return;

            // Get user tier
            let userTier = getUserTier(lastUserMsg.author.id);

            if (lastUserMsg.author.id === BOSS_USER_ID) {
                console.log(`Global Boss detected (${lastUserMsg.author.tag}). Enforcing Tier 1.`);
                userTier = 1;
            }

            // Generate Response
            console.log(`Processing batch for channel ${channel.name}...`);

            // MANUAL MODE CHECK
            if (this.manualMode) {
                console.log('Manual Mode execution detected. Skipping AI generation.');
                return;
            }

            // await channel.sendTyping(); // Removed per user request (Stealth Mode)

            // Gather context info
            const globalHistory = getRecentUserMessages(lastUserMsg.author.id, 10);
            const userFacts = getUserMemory(lastUserMsg.author.id);

            if (userFacts) {
                console.log(`[MEMORY] Found facts for ${lastUserMsg.author.username}: "${userFacts}"`);
            }

            const contextInfo = {
                serverName: channel.guild?.name || 'DM',
                channelName: channel.name || 'DM',
                visibleChannels: channel.guild ? channel.guild.channels.cache
                    .filter(c => [ChannelType.GuildText, ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread].includes(c.type))
                    .map(c => `${c.name} (${c.id})`) : [],
                availableServers: this.guilds.cache.map(g => `${g.name} (${g.id})`),
                // Memory Injection
                globalUserHistory: globalHistory.map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.content}`).join('\n'),
                userLongTermMemory: userFacts || "No prior long-term memory."
            };

            const responseText = await this.llm.generateResponse(history, userTier, contextInfo);

            if (responseText) {
                // Check for tool usage
                const toolMatch = responseText.match(/\[\[TX:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]\]/s);
                let toolSuccess = true;
                let finalResponse = responseText;

                if (toolMatch) {
                    const [fullMatch, serverName, channelName, msgContent] = toolMatch;
                    const { success, targetChannel } = await this.handleToolCommand(
                        lastUserMsg,
                        serverName.trim(),
                        channelName.trim(),
                        msgContent.trim()
                    );

                    toolSuccess = success;
                    finalResponse = responseText.replace(fullMatch, '').trim();

                    // Prevent double posting
                    if (toolSuccess && targetChannel && targetChannel.id === channel.id) {
                        console.log('Tool targeted current channel. Suppressing duplicate text response.');
                        finalResponse = '';
                    }
                }

                if (finalResponse && (!toolMatch || toolSuccess)) {
                    console.log(`Sending response: ${finalResponse}`);
                    await channel.send(finalResponse);
                    // Update Continuity Timer (Mark this channel as 'Active')
                    this.lastResponseTime.set(channel.id, Date.now());
                }
            } else {
                console.log('LLM chose SILENCE.');
            }

        } catch (error) {
            console.error('Error in processChannelResponse:', error);
        } finally {
            // Cleanup timer
            this.debounceTimers.delete(channel.id);
        }
    }

    normalizeText(text) {
        if (!text) return '';
        return text
            .normalize('NFKD') // Decompose unicode (e.g., 𝙄 -> I)
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove non-alphanumeric (optional, but helps with font noise)
            .toLowerCase()
            .trim();
    }

    // New Interaction Handlers for Voice
    async handleVoiceInteractions(interaction) {
        if (interaction.commandName === 'join') {
            const channel = interaction.member.voice.channel;
            if (!channel) return interaction.reply({ content: '❌ You are not in a voice channel.', ephemeral: true });

            await interaction.deferReply();
            const success = await this.voiceHandler.joinChannel(channel);
            if (success) interaction.editReply('🔊 Connected. I am listening (to text).');
            else interaction.editReply('❌ Failed to join.');
        }
        else if (interaction.commandName === 'leave') {
            this.voiceHandler.leaveChannel();
            interaction.reply({ content: '👋 Disconnected.' });
        }
    }

    async handleToolCommand(ctxMessage, serverName, channelName, content) {
        console.log(`Attempting to send '${content}' to ${serverName}/${channelName}`);

        // Resolve Guild
        let targetGuild = null;
        const normalizedInputServer = this.normalizeText(serverName);
        const currentServerName = ctxMessage.guild?.name;

        // 1. Direct ID Match (Precision)
        if (serverName.match(/^\d+$/)) {
            targetGuild = this.guilds.cache.get(serverName);
            if (targetGuild) console.log(`Resolved server by ID: ${targetGuild.name}`);
        }

        // 2. Name Match (Normalized)
        if (!targetGuild) {
            if (['this server', 'current server', 'here', currentServerName ? this.normalizeText(currentServerName) : ''].includes(normalizedInputServer)) {
                targetGuild = ctxMessage.guild;
            } else {
                // Exact match (case-insensitive)
                targetGuild = this.guilds.cache.find(g => g.name.toLowerCase() === serverName.toLowerCase());

                // Normalized match (Handles Fancy Fonts)
                if (!targetGuild) {
                    targetGuild = this.guilds.cache.find(g => this.normalizeText(g.name) === normalizedInputServer);
                }

                // Fuzzy match (Normalized)
                if (!targetGuild) {
                    targetGuild = this.guilds.cache.find(g =>
                        this.normalizeText(g.name).includes(normalizedInputServer) ||
                        normalizedInputServer.includes(this.normalizeText(g.name))
                    );
                    if (targetGuild) {
                        console.log(`Fuzzy matched server '${serverName}' -> '${targetGuild.name}'`);
                    }
                }
            }
        }

        if (!targetGuild) {
            console.warn(`Server '${serverName}' not found.`);
            await ctxMessage.channel.send(`(whispering) I couldn't find ANY server matches for '${serverName}' (Normalized: ${normalizedInputServer}).`);
            return { success: false, targetChannel: null };
        }

        // Resolve Channel
        const normalizedInputChannel = this.normalizeText(channelName);
        let targetChannel = null;

        // 1. Direct ID Match (Precision)
        if (channelName.match(/^\d+$/)) {
            targetChannel = targetGuild.channels.cache.get(channelName);
            if (targetChannel && targetChannel.type === ChannelType.GuildText) {
                console.log(`Resolved channel by ID: ${targetChannel.name}`);
            } else {
                targetChannel = null; // Reset if not text
            }
        }

        // 2. Name Match (Normalized)
        if (!targetChannel) {
            targetChannel = targetGuild.channels.cache.find(c =>
                c.type === ChannelType.GuildText && c.name.toLowerCase() === channelName.toLowerCase()
            );

            // Normalized match
            if (!targetChannel) {
                targetChannel = targetGuild.channels.cache.find(c =>
                    c.type === ChannelType.GuildText && this.normalizeText(c.name) === normalizedInputChannel
                );
            }

            // Fuzzy match (Normalized)
            if (!targetChannel) {
                targetChannel = targetGuild.channels.cache.find(c =>
                    c.type === ChannelType.GuildText && (
                        this.normalizeText(c.name).includes(normalizedInputChannel) ||
                        normalizedInputChannel.includes(this.normalizeText(c.name))
                    )
                );
                if (targetChannel) {
                    console.log(`Fuzzy matched channel '${channelName}' -> '${targetChannel.name}'`);
                }
            }
        }

        if (!targetChannel) {
            console.warn(`Channel '${channelName}' not found in ${targetGuild.name}.`);
            await ctxMessage.channel.send(`(whispering) I found '${targetGuild.name}', but no channel matches '${channelName}'.`);
            return { success: false, targetChannel: null };
        }

        try {
            await targetChannel.send(content);
            await ctxMessage.react('✅');
            return { success: true, targetChannel };
        } catch (error) {
            console.error('Failed to send TX:', error);
            await ctxMessage.channel.send(`(whispering) Failed to send: ${error.message}`);
            return { success: false, targetChannel: null };
        }
    }
}

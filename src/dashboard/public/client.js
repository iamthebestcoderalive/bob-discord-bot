const socket = io();

// State
let currentServerId = null;
let currentChannelId = null;
let viewMode = 'servers'; // 'servers' | 'dms'
let guildsData = [];
let dmsData = [];
let manualMode = false;
let typingTimeout = null;

// DOM Elements
const serverList = document.getElementById('server-list');
const dmList = document.getElementById('dm-list');
const homeButton = document.getElementById('home-button');
const channelList = document.getElementById('channels-container');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const serverNameLabel = document.getElementById('server-name');
const channelHeaderLabel = document.getElementById('channel-header-name');
const modeToggle = document.getElementById('mode-toggle');
const userAvatar = document.getElementById('user-avatar');
const usernameLabel = document.getElementById('username');
const discoveryBtn = document.getElementById('discovery-btn');
const discoveryView = document.getElementById('discovery-view');
const typingIndicator = document.getElementById('typing-indicator');

// Socket Events
socket.on('init', (data) => {
    guildsData = data.guilds;
    manualMode = data.manualMode;
    renderServers(guildsData);

    // User Info
    userAvatar.src = data.user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    usernameLabel.textContent = data.user.username;

    modeToggle.checked = !manualMode;
    updateModeLabel();

    // Default to first server
    if (guildsData.length > 0) {
        selectServer(guildsData[0].id);
    }
});

// DM Toggle Logic
let showDMs = false;

homeButton.onclick = () => {
    showDMs = !showDMs;
    if (showDMs) {
        serverList.style.display = 'none';
        dmList.style.display = 'flex';
        dmList.style.flexDirection = 'column';
        dmList.style.width = '100%';
        dmList.style.alignItems = 'center';
        homeButton.style.borderRadius = '15px'; // Visual feedback
        homeButton.style.backgroundColor = '#5865F2';
        socket.emit('fetchDMs');
    } else {
        serverList.style.display = 'flex';
        dmList.style.display = 'none';
        homeButton.style.borderRadius = '50%';
        homeButton.style.backgroundColor = '#36393f';
    }
};

socket.on('dmListResult', (dms) => {
    dmList.innerHTML = '';
    dms.forEach(dm => {
        const div = document.createElement('div');
        div.className = 'server-icon'; // Reuse server-icon class for shape
        div.style.backgroundImage = `url(${dm.recipient.avatar})`;
        div.style.backgroundSize = 'cover';
        div.title = dm.recipient.username; // Tooltip

        div.onclick = () => {
            // Deselect others
            document.querySelectorAll('.server-icon').forEach(i => i.classList.remove('active'));
            div.classList.add('active');

            // Set Context
            currentServerId = 'DM'; // Flag for context
            currentChannelId = dm.id;

            // Update Headers
            document.getElementById('server-name').innerText = `@${dm.recipient.username}`;
            document.getElementById('channel-header-name').innerText = `@${dm.recipient.username}`;

            // Clear Channels List (DMs have no channels)
            const channelsContainer = document.getElementById('channels-container');
            channelsContainer.innerHTML = '<div style="padding: 10px; color: #72767d; font-size: 14px;">Direct Message</div>';

            // Fetch History
            socket.emit('fetchHistory', dm.id);
        };
        dmList.appendChild(div);
    });
});

// Typing Indicator
socket.on('typing', (data) => {
    // Only show if relevant to current view
    if (data.channelId === currentChannelId) {
        const indicator = document.getElementById('typing-indicator');
        indicator.innerText = `${data.user} is typing...`;
        indicator.style.display = 'block';

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            indicator.style.display = 'none';
        }, 3000);
    }
});

socket.on('historyResult', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(msg => addMessageToUI(msg));
});

// State
let unreadCounts = {}; // { guildId: { channelId: number } }

// Helper: Get Unread Count for Server
function getServerUnreadCount(guildId) {
    if (!unreadCounts[guildId]) return 0;
    return Object.values(unreadCounts[guildId]).reduce((a, b) => a + b, 0);
}

socket.on('discordMessage', (msg) => {
    // 1. Check if we should increment unread
    // If msg is NOT in the currently active channel (or we aren't focused), increment.
    // Note: msg.guildId was just added to bot.js
    const msgGuildId = msg.guildId || 'DM'; // Fallback
    const msgChannelId = msg.channelId;

    const isCurrentChannel = (currentChannelId === msgChannelId);

    if (!isCurrentChannel) {
        // Init Structure
        if (!unreadCounts[msgGuildId]) unreadCounts[msgGuildId] = {};
        if (!unreadCounts[msgGuildId][msgChannelId]) unreadCounts[msgGuildId][msgChannelId] = 0;

        // Increment
        unreadCounts[msgGuildId][msgChannelId]++;

        // Update Visuals
        updateServerBadge(msgGuildId);

        // If we are VIEWING this server, update the channel list row
        if (currentServerId === msgGuildId) {
            highlightChannel(msgChannelId);
        }
    } else {
        // We are looking at it, just render message
        addMessageToUI({
            id: msg.id, // Now coming from bot.js
            author: msg.author,
            authorId: msg.authorId,
            authorColor: msg.authorColor, // NEW
            content: msg.content,
            timestamp: msg.timestamp,
        });
    }
});

function updateServerBadge(guildId) {
    const count = getServerUnreadCount(guildId);
    if (count <= 0) return;

    // Find the badge element
    const badge = document.getElementById(`badge-${guildId}`);
    if (badge) {
        badge.style.display = 'block';
        badge.textContent = count > 9 ? '9+' : count;
    }
}

function highlightChannel(channelId) {
    // Find channel element
    // We didn't give channels IDs in renderChannels, usually just iterating.
    // Logic: In renderChannels, we set el.onclick. We should add data-id there.

    // Assuming renderChannels adds data-id now (I will update it below)
    const channelEl = document.querySelector(`.channel-item[data-id="${channelId}"]`);
    if (channelEl) {
        channelEl.classList.add('unread');
    }
}

socket.on('discordTyping', (data) => {
    if (data.channelId === currentChannelId) {
        showTyping(data.userId);
    }
});

// UI Event Listeners
homeButton.addEventListener('click', () => {
    viewMode = (viewMode === 'servers') ? 'dms' : 'servers';
    toggleSidebarView();
});

discoveryBtn.addEventListener('click', () => {
    // Show Discovery Overlay
    document.getElementById('chat-area').style.display = 'none';
    discoveryView.style.display = 'flex';
});

modeToggle.addEventListener('change', () => {
    socket.emit('toggleMode', { enabled: !modeToggle.checked });
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && messageInput.value.trim() !== '') {
        const content = messageInput.value;
        if (currentChannelId) {
            socket.emit('sendMessage', { channelId: currentChannelId, content });
            messageInput.value = '';
            // Removed optimistic rendering to prevent duplicates
            // The server will broadcast the message back to us
        }
    }
});

// Logic
function toggleSidebarView() {
    if (viewMode === 'dms') {
        serverList.style.display = 'none';
        dmList.style.display = 'flex'; // Use flex/block
        serverNameLabel.textContent = 'Direct Messages';
        socket.emit('fetchDMs');
    } else {
        serverList.style.display = 'flex';
        dmList.style.display = 'none';
        // Reselect last server?
        if (currentServerId) {
            const guild = guildsData.find(g => g.id === currentServerId);
            if (guild) serverNameLabel.textContent = guild.name;
        }
    }
}

function renderServers(guilds) {
    serverList.innerHTML = '';
    guilds.forEach(guild => {
        // Wrapper for badge positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'server-icon-wrapper';

        const el = document.createElement('div');
        el.className = 'server-icon';
        if (guild.icon) {
            el.style.backgroundImage = `url(${guild.icon})`;
        } else {
            el.textContent = guild.name.substring(0, 2);
        }
        el.dataset.id = guild.id;
        el.onclick = () => selectServer(guild.id);

        // Badge
        const badge = document.createElement('div');
        badge.className = 'notification-badge';
        badge.id = `badge-${guild.id}`;

        // Restore Count if exists (e.g. re-render)
        const count = getServerUnreadCount(guild.id);
        if (count > 0) {
            badge.style.display = 'block';
            badge.textContent = count > 9 ? '9+' : count;
        }

        wrapper.appendChild(el);
        wrapper.appendChild(badge);
        serverList.appendChild(wrapper);
    });
}

function renderDMs(dms) {
    // DMs implementation similar... skipping for brevity unless user asks
    // (Existing code reused as is, but we might want badges there too later)
    dmList.innerHTML = '';
    dms.forEach(dm => {
        const el = document.createElement('div');
        el.className = 'server-icon';
        el.style.backgroundImage = `url(${dm.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'})`;
        el.title = dm.name;
        el.onclick = () => {
            // Treat DM like a channel
            selectChannel(dm.id, dm.name);
            serverNameLabel.textContent = 'Direct Messages';
            channelList.innerHTML = '';
            const dmItem = document.createElement('div');
            dmItem.className = 'channel-item active';
            dmItem.textContent = '@ ' + dm.name;
            channelList.appendChild(dmItem);
        };
        dmList.appendChild(el);
    });
}

function selectServer(serverId) {
    currentServerId = serverId;
    viewMode = 'servers';
    toggleSidebarView();

    const guild = guildsData.find(g => g.id === serverId);
    if (!guild) return;

    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    // Selector needs to find inner icon now
    const activeEl = serverList.querySelector(`.server-icon[data-id="${serverId}"]`);
    if (activeEl) activeEl.classList.add('active');

    serverNameLabel.textContent = guild.name;
    renderChannels(guild.channels);
}

function renderChannels(channels) {
    channelList.innerHTML = '';
    channels.forEach(channel => {
        const el = document.createElement('div');
        el.className = 'channel-item';
        // Check unread
        const unread = unreadCounts[currentServerId] && unreadCounts[currentServerId][channel.id] > 0;
        if (unread) el.classList.add('unread');

        el.dataset.id = channel.id; // Added ID for lookup
        el.textContent = (channel.type === 2 ? '🔊 ' : '# ') + channel.name;
        el.onclick = () => selectChannel(channel.id, channel.name);
        channelList.appendChild(el);
    });
    if (channels.length > 0) selectChannel(channels[0].id, channels[0].name);
}

function selectChannel(channelId, name) {
    currentChannelId = channelId;
    channelHeaderLabel.textContent = name.startsWith('@') ? name : `# ${name}`;
    messagesContainer.innerHTML = '';
    document.getElementById('chat-area').style.display = 'flex';
    discoveryView.style.display = 'none';

    // Clear Unread
    if (currentServerId && unreadCounts[currentServerId] && unreadCounts[currentServerId][channelId]) {
        unreadCounts[currentServerId][channelId] = 0;

        // Remove badge from channel item
        const el = document.querySelector(`.channel-item[data-id="${channelId}"]`);
        if (el) el.classList.remove('unread');

        // Update Server Badge (Recalculate total)
        updateServerBadge(currentServerId);
        // Hide badge if 0
        const total = getServerUnreadCount(currentServerId);
        const badge = document.getElementById(`badge-${currentServerId}`);
        if (badge && total === 0) badge.style.display = 'none';
        else if (badge) badge.textContent = total > 9 ? '9+' : total;
    }

    // Highlight
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeChannel = document.querySelector(`.channel-item[data-id="${channelId}"]`);
    if (activeChannel) activeChannel.classList.add('active');

    socket.emit('fetchHistory', channelId);
}

// 1. Add Click Listener to Chat Names (Delegation)
messagesContainer.addEventListener('click', (e) => {
    // Check if clicked element is username or avatar
    if (e.target.classList.contains('msg-author') || e.target.classList.contains('message-avatar')) {
        const userId = e.target.dataset.userId;
        if (userId) {
            // Pass current server ID for context
            socket.emit('fetchUserProfile', { userId, guildId: currentServerId });
        }
    }
    // Check if delete button
    if (e.target.classList.contains('delete-btn')) {
        const msgId = e.target.dataset.msgId;
        if (msgId && currentChannelId) {
            if (confirm("Delete this message?")) {
                socket.emit('deleteMessage', { channelId: currentChannelId, messageId: msgId });
                // Optimistic remove
                const row = e.target.closest('.message');
                if (row) row.remove();
            }
        }
    }
});

socket.on('deleteResult', (data) => {
    // Already handled optimistically, but could confirm here
});

// 2. Handle Result
let currentModalUserId = null; // Track who is open

socket.on('userProfileResult', (data) => {
    currentModalUserId = data.userId; // Capture ID

    // Populate Modal
    document.getElementById('modalAvatar').src = data.avatarUrl;
    document.getElementById('modalUsername').innerHTML = `${data.username} <span>#${data.discriminator}</span>`;
    document.getElementById('modalJoined').innerText = `Joined: ${data.joinedAt}`;

    // Banner Color
    document.getElementById('modalBanner').style.backgroundColor = data.bannerColor;
    document.getElementById('modalBanner').style.backgroundImage = 'none'; // reset
    if (data.bannerUrl) document.getElementById('modalBanner').style.backgroundImage = `url(${data.bannerUrl})`;

    // Render Roles
    const rolesDiv = document.getElementById('modalRoles');
    rolesDiv.innerHTML = data.roles.map(role =>
        `<span class="role-pill" style="border-left-color: ${role.color}">${role.name}</span>`
    ).join('');

    // Render Recent Image
    const imgContainer = document.getElementById('modalRecentImage');
    if (data.lastImage) {
        imgContainer.innerHTML = `<img src="${data.lastImage}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    } else {
        imgContainer.innerHTML = '<span style="color: #72767d; font-size: 12px;">No recent images found in this channel.</span>';
    }

    // Render Memory
    document.getElementById('modelMemory').value = data.memory || '';

    // Show Modal
    document.getElementById('profileModal').style.display = 'flex';
});

// Open DM Handler
const btnOpenDM = document.getElementById('btnOpenDM');
if (btnOpenDM) {
    btnOpenDM.onclick = () => {
        if (!currentModalUserId) return;
        socket.emit('openDM', currentModalUserId);
        btnOpenDM.innerText = 'Creating...';
    };
}

socket.on('openDMResult', (data) => {
    const btn = document.getElementById('btnOpenDM');
    if (btn) btn.innerText = '💬 Open DM';

    if (data.success) {
        document.getElementById('profileModal').style.display = 'none';

        // Switch to DM context
        // We simulate clicking a DM list item.
        // First check if it exists in the DM list (might not need to, selectChannel handles it)

        // Force view to Messages if not already?
        // Actually selectChannel handles view switching usually

        // IMPORTANT: We need to define "DMs" as the context for selectChannel to work visually if we want headers right
        serverNameLabel.textContent = 'Direct Messages';
        document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

        // Manually trigger channel selection
        const name = '@ ' + data.name;
        channelList.innerHTML = ''; // Clear server channels
        const dmItem = document.createElement('div');
        dmItem.className = 'channel-item active';
        dmItem.textContent = name;
        channelList.appendChild(dmItem);

        selectChannel(data.channelId, name);
    } else {
        alert("Error: " + data.error);
    }
});

// Memory Save Handler
const btnSaveMemory = document.getElementById('btnSaveMemory');
if (btnSaveMemory) {
    btnSaveMemory.onclick = () => {
        if (!currentModalUserId) return;
        const content = document.getElementById('modelMemory').value;
        socket.emit('updateUserMemory', { userId: currentModalUserId, content });

        // Optimistic Feedback
        const originalText = btnSaveMemory.innerText;
        btnSaveMemory.innerText = '✅ Saved!';
        setTimeout(() => btnSaveMemory.innerText = originalText, 2000);
    };
}

// Moderation Button Handlers
const actions = {
    'btnTimeout': 'timeout',
    'btnKick': 'kick',
    'btnBan': 'ban',
    'btnUntimeout': 'untimeout',
    'btnUnban': 'unban'
};

Object.keys(actions).forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.onclick = () => {
            if (!currentModalUserId) return;
            const action = actions[btnId];

            // Get Duration if timeout
            let duration = 0;
            if (action === 'timeout') {
                duration = parseInt(document.getElementById('timeoutDuration').value) || 3600000; // Default 1h
            }

            // Confirm Action
            const actionName = (action === 'timeout') ? `TIMEOUT (${duration / 60000} mins)` : action.toUpperCase();
            if (!confirm(`Are you sure you want to ${actionName} this user?`)) return;

            console.log(`Sending Mod Action: ${action} for ${currentModalUserId}`);
            socket.emit('modAction', {
                action,
                userId: currentModalUserId,
                guildId: typeof currentServerId !== 'undefined' ? currentServerId : null,
                duration: duration
            });
        };
    }
});

socket.on('modActionResult', (data) => {
    if (data.success) {
        alert(`Action '${data.action}' Successful!`);
        document.getElementById('profileModal').style.display = 'none';
    } else {
        alert("Action Failed: " + data.error);
    }
});

// 3. Close Modal on Background Click
document.getElementById('profileModal').addEventListener('click', (e) => {
    if (e.target.id === 'profileModal') e.target.style.display = 'none';
});


function addMessageToUI(msg) {
    const el = document.createElement('div');
    el.className = 'message';
    const avatar = msg.authorAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const userId = msg.authorId || ''; // backend must generate this now in fetchHistory
    const msgId = msg.id || '';
    const color = msg.authorColor || '#ffffff';

    // Rich Message HTML
    el.innerHTML = `
        <div class="message-avatar" style="background-image: url('${avatar}')" data-user-id="${userId}"></div>
        <div class="message-content-wrapper">
            <div class="message-header">
                <span class="msg-author" data-user-id="${userId}" style="color: ${color}">${msg.author}</span>
                <span class="msg-timestamp">${msg.timestamp}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        </div>
        <div class="delete-btn" data-msg-id="${msgId}">🗑️</div>
    `;
    messagesContainer.appendChild(el);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping(userId) {
    typingIndicator.style.display = 'block';
    typingIndicator.textContent = `Someone is typing...`; // Simplified
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingIndicator.style.display = 'none';
    }, 3000);
}

function updateModeLabel() {
    const label = document.getElementById('mode-label');
    label.textContent = manualMode ? 'Manual Mode' : 'Auto Mode';
    label.style.color = manualMode ? '#f04747' : '#43b581';
}

// Discovery Logic (Existing)
const inviteInput = document.getElementById('invite-input');
const searchBtn = document.getElementById('search-btn');
const searchResult = document.getElementById('search-result');

searchBtn.addEventListener('click', () => {
    const code = inviteInput.value.trim();
    if (!code) return;

    // Direct Server ID Check (Snowflake)
    if (/^\d{17,20}$/.test(code)) {
        const guildId = code;
        const clientId = window.savedClientId || '1323396483482914856'; // Fallback to hardcoded if missing
        const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&guild_id=${guildId}&disable_guild_select=true&scope=bot`;

        searchResult.innerHTML = `
            <div class="server-card">
                <div class="card-banner" style="background-color: #202225;"></div>
                <div class="card-icon" style="background-image: url('https://cdn.discordapp.com/embed/avatars/0.png'); filter: grayscale(100%);"></div>
                <div class="card-name">Target ID: ${guildId}</div>
                <div class="card-stats">Direct Signal Lock</div>
                <div class="card-desc">Targeting specific server frequency. Click below to force connection.</div>
                <button id="manual-join-btn" class="invade-btn" style="background-color: #5865F2;">INITIATE CONNECTION</button>
            </div>
        `;

        document.getElementById('manual-join-btn').onclick = () => {
            window.open(authUrl, '_blank', 'width=500,height=800');
        };
        return;
    }

    searchResult.innerHTML = '<div style="color: grey;">Searching...</div>';
    socket.emit('lookupInvite', code);
});

socket.on('lookupResult', (data) => {
    if (data.error) {
        searchResult.innerHTML = `<div style="color: #ed4245;">${data.error}</div>`;
        return;
    }
    const guild = data.guild;

    // We can also use this for invites
    const clientId = '1323396483482914856';
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&guild_id=${guild.id}&disable_guild_select=true&scope=bot`;

    searchResult.innerHTML = `
        <div class="server-card">
            <div class="card-banner" style="background-image: url('${guild.banner || ''}'); background-color: ${guild.banner ? 'transparent' : '#202225'};"></div>
            <div class="card-icon" style="background-image: url('${guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}')"></div>
            <div class="card-name">${guild.name}</div>
            <div class="card-stats">${guild.memberCount} Members • ${guild.onlineCount} Online</div>
            <div class="card-desc">${guild.description || 'No description'}</div>
            <button id="auto-join-btn" class="invade-btn" data-id="${guild.id}">JOIN SERVER</button>
             <div id="join-status" style="margin-top: 10px; font-size: 12px; color: #ccc;"></div>
        </div>
    `;

    // Updated to use the Direct Auth method instead of Puppeteer (which is gone)
    document.getElementById('auto-join-btn').onclick = () => {
        window.open(authUrl, '_blank', 'width=500,height=800');
    };


    document.getElementById('auto-join-btn').onclick = function () {
        console.log("🖱️ Button Clicked - Starting Sequence");

        // 1. SAFETY CHECK: Retrieve ID robustly
        // Checks for a data-attribute first, then a global variable
        const guildId = this.dataset.id || (typeof guild !== 'undefined' ? guild.id : null);

        if (!guildId) {
            console.error("❌ ERROR: Guild ID is missing! Cannot auto-join.");
            this.textContent = "ERROR: NO ID";
            this.style.backgroundColor = "red";
            return;
        }

        // 2. SOCKET CHECK
        if (!socket || !socket.connected) {
            console.error("❌ ERROR: Socket.io is not connected to the server.");
            alert("Connection lost. Please refresh.");
            return;
        }

        console.log(`📡 Emitting 'autoJoin' event for Server ID: ${guildId}`);

        // 3. UI Feedback
        const btn = this;
        const status = document.getElementById('join-status');
        btn.textContent = "HACKING MAINFRAME...";
        btn.disabled = true;
        btn.style.backgroundColor = "#5865F2";

        // 4. Fire Event
        socket.emit('autoJoin', guildId);
    };
});

socket.on('autoJoinResult', (data) => {
    const btn = document.getElementById('auto-join-btn');
    const status = document.getElementById('join-status');
    if (btn) {
        if (data.success) {
            btn.textContent = "✅ ACCESS GRANTED";
            btn.style.backgroundColor = "#3ba55c";
            status.textContent = "Authorization Successful!";
            status.style.color = "#3ba55c";
        } else {
            console.error("Server Report:", data.error);
            btn.textContent = "❌ FAILED";
            btn.style.backgroundColor = "#ed4245";
            btn.disabled = false;
            status.textContent = data.error;
            status.style.color = "#ed4245";
            alert("Auto-Join Failed: " + data.error);
        }
    }
});

System Instruction: Protocol v3 - Stealth Fallback & ModerationRole: Senior Node.js & Discord Bot Engineer.Objective: 1.  Fix the "Auto-Join" failure by providing a Standard Puppeteer Fallback (removing the dependency on puppeteer-extra which failed to install).2.  Implement Moderation Controls (Kick/Ban/Timeout) in the User Profile Modal.Section 1: Installation & PowerShell FixProblem: npm install failed due to Windows Execution Policy.Solution: Bypass the policy for the current process or use Command Prompt.Option A: PowerShell Fix (Run this first)Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# Then run:
npm install puppeteer
Option B: The "No-Stealth-Plugin" FallbackIf you cannot install the extra plugins, use the script below in src/auto_joiner.js. It manually applies stealth techniques using standard puppeteer.Section 2: Standard Puppeteer Fallback (src/auto_joiner.js)This script manually hides the navigator.webdriver property and randomizes the User-Agent to fool Discord's basic detection, without needing external plugins.import puppeteer from 'puppeteer'; // Standard package only

export async function autoAuthorizeBot(serverId) {
    console.log(`⚙️ Auto-Joining Server: ${serverId} (Standard Stealth Mode)...`);

    const browser = await puppeteer.launch({ 
        headless: "new", // Change to false to debug visually
        args: [
            '--no-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled', // Critical: Hides "Automated" flag
            '--window-size=1920,1080',
            '--lang=en-US,en'
        ]
    });
    
    try {
        const page = await browser.newPage();

        // 1. MANUAL STEALTH: Override Browser Properties
        // This trick hides the fact that we are a robot
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            // Fake plugins
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            // Fake languages
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });

        // 2. Set a Real User-Agent (Update this periodically)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 3. Token Injection (Bypass Login)
        console.log("💉 Injecting Token...");
        await page.goto('[https://discord.com/login](https://discord.com/login)', { waitUntil: 'domcontentloaded' });

        await page.evaluate((token) => {
            const interval = setInterval(() => {
                const iframe = document.createElement('iframe');
                document.body.appendChild(iframe);
                iframe.contentWindow.localStorage.token = `"${token}"`;
                document.body.removeChild(iframe);
            }, 50);

            setTimeout(() => {
                clearInterval(interval);
                location.reload(); 
            }, 2500);
        }, process.env.OWNER_AUTH_TOKEN);

        // 4. Verification
        console.log("⏳ Waiting for session...");
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        
        if (page.url().includes('login')) throw new Error("Token Injection Failed.");

        // 5. Navigate & Authorize
        console.log("🔗 Navigating to Invite...");
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=8&scope=bot&guild_id=${serverId}&disable_guild_select=true`;
        await page.goto(inviteUrl, { waitUntil: 'networkidle2' });

        // Robust XPath Selector for "Authorize" button
        const button = await page.waitForSelector('xpath/.//button[div[text()="Authorize"]]', { timeout: 8000 })
            .catch(() => page.waitForSelector('button[class*="lookFilled-"][class*="colorBrand-"]'));

        if (!button) throw new Error("Authorize button not found.");
        
        await button.click();
        await new Promise(r => setTimeout(r, 3000)); 

        console.log("✅ Auto-Join Success.");
        return { success: true };

    } catch (error) {
        console.error("❌ Auto-Join Error:", error.message);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}
Section 3: Moderation & Profiles Implementation1. Update Frontend HTML (index.html)Add the "Danger Zone" buttons and the Recent Activity section to your #profileModal.<!-- Inside <div class="modal-body"> -->

<!-- MODERATION CONTROLS -->
<div class="mod-section" style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
    <h4 style="color: #b9bbbe; font-size: 12px; margin-bottom: 10px;">MODERATION</h4>
    <div class="mod-buttons">
        <button id="btnTimeout" class="btn-mod btn-yellow">Timeout 1h</button>
        <button id="btnKick" class="btn-mod btn-orange">Kick</button>
        <button id="btnBan" class="btn-mod btn-red">Ban</button>
    </div>
</div>

<!-- RECENT ACTIVITY -->
<div class="activity-section" style="margin-top: 15px;">
    <h4 style="color: #b9bbbe; font-size: 12px;">LAST ATTACHMENT</h4>
    <div id="modalRecentImage" style="width: 100%; height: 150px; background: #2f3136; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-top: 5px;">
        <span style="color: #72767d; font-size: 12px;">No recent images found in this channel.</span>
    </div>
</div>
2. Update Frontend CSS (style.css).mod-buttons { display: flex; gap: 10px; }
.btn-mod {
    flex: 1; border: none; padding: 8px; border-radius: 4px;
    font-weight: bold; cursor: pointer; color: #fff; transition: opacity 0.2s;
}
.btn-mod:hover { opacity: 0.8; }
.btn-yellow { background-color: #f0b232; color: #000; }
.btn-orange { background-color: #f57f31; }
.btn-red { background-color: #ed4245; }
3. Update Frontend Logic (client.js)Wire up the buttons to send socket events.let currentModalUserId = null; // Track who is open

// When opening the modal (existing code), ensure we save the ID:
socket.on('userProfileResult', (data) => {
    currentModalUserId = data.userId; // Make sure backend sends this back!
    // ... existing rendering code ...
    
    // Render Recent Image
    const imgContainer = document.getElementById('modalRecentImage');
    if (data.lastImage) {
        imgContainer.innerHTML = `<img src="${data.lastImage}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    } else {
        imgContainer.innerHTML = '<span style="color: #72767d;">No recent images.</span>';
    }
});

// Moderation Button Handlers
const actions = {
    'btnTimeout': 'timeout',
    'btnKick': 'kick',
    'btnBan': 'ban'
};

Object.keys(actions).forEach(btnId => {
    document.getElementById(btnId).onclick = () => {
        if (!currentModalUserId) return;
        const action = actions[btnId];
        
        // Confirm Action
        if (!confirm(`Are you sure you want to ${action.toUpperCase()} this user?`)) return;

        console.log(`Sending Mod Action: ${action} for ${currentModalUserId}`);
        socket.emit('modAction', { 
            action, 
            userId: currentModalUserId,
            // Assuming 'guild' object is available globally or via dataset
            guildId: typeof guild !== 'undefined' ? guild.id : null 
        });
    };
});
4. Update Backend Logic (server.js)Handle the requests and permission checks.socket.on('modAction', async ({ action, userId, guildId }) => {
    console.log(`🛡️ Mod Action Received: ${action} -> ${userId}`);
    
    try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        // Safety Check: Prevent banning the owner or the bot itself
        if (userId === process.env.OWNER_ID || userId === client.user.id) {
            return; 
        }

        // Execute Action
        switch (action) {
            case 'timeout':
                // Timeout for 1 hour (60 mins * 60 secs * 1000 ms)
                await member.timeout(60 * 60 * 1000, 'Action via Dashboard');
                break;
            case 'kick':
                await member.kick('Action via Dashboard');
                break;
            case 'ban':
                await member.ban({ reason: 'Action via Dashboard' });
                break;
        }
        
        // Notify Dashboard
        socket.emit('modActionResult', { success: true, action });

    } catch (error) {
        console.error("Mod Action Failed:", error);
        socket.emit('modActionResult', { success: false, error: error.message });
    }
});

// Update 'fetchUserProfile' to include Recent Image logic
socket.on('fetchUserProfile', async (userId) => {
    // ... fetch member logic ...
    
    // FETCH RECENT IMAGE (Scan last 50 messages in the *active* channel)
    // Note: In a real app, you might want to pass the channelId from the client
    let lastImage = null;
    
    // Assuming 'client.activeChannelId' is tracked, or searching a default channel
    // For now, let's assume we search the System Channel or the channel the command came from
    if (guild.systemChannel) {
        const messages = await guild.systemChannel.messages.fetch({ limit: 50 });
        const userMsgWithImage = messages.find(m => 
            m.author.id === userId && m.attachments.size > 0
        );
        if (userMsgWithImage) {
            lastImage = userMsgWithImage.attachments.first().url;
        }
    }

    socket.emit('userProfileResult', {
        userId: member.id,
        // ... other existing fields ...
        lastImage: lastImage
    });
});

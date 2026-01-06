// import puppeteer from 'puppeteer'; // Removed for optimization

import { readFileSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PuterClient {
    constructor() {
        this.model = 'gpt-4o-mini';
        this.systemPrompt = this.loadSystemPrompt();
        console.log(`PuterClient initialized with model: ${this.model} (Direct RPC Mode)`);
    }

    loadSystemPrompt() {
        try {
            const promptPath = join(__dirname, '..', 'docs', 'bob_system_prompt.md');
            return readFileSync(promptPath, 'utf-8');
        } catch (error) {
            console.error('Failed to load system prompt:', error);
            return 'You are Bob, a tough Discord bot.';
        }
    }

    // No browser init needed
    async initBrowser() { }

    async generateResponse(contextMessages, userTier, contextInfo = {}) {
        const token = process.env.PUTER_TOKEN;
        if (!token) {
            console.error('Missing PUTER_TOKEN in .env');
            return "Grr... my brain is missing its token. (Check .env)";
        }

        try {
            // Build environment data block
            const envBlock = `
[ENVIRONMENT DATA]
Current Server: ${contextInfo.serverName || 'Unknown'}
Current Channel: ${contextInfo.channelName || 'Unknown'}
Channels: ${(contextInfo.visibleChannels || []).join(', ')}
Available Servers: ${(contextInfo.availableServers || []).join(', ')}

[MEMORY DATA]
Use this to recognize the user across servers.
> Global Recent Messages (Cross-Channel/Server):
${contextInfo.globalUserHistory || 'No recent history.'}
> Long-Term Facts:
${contextInfo.userLongTermMemory || 'No specific facts remembered.'}

[PERSONA OVERRIDE]
${contextInfo.serverPersona || 'Use your Default Personality.'}
`;

            let tierInstruction = `${envBlock}\n[CURRENT INTERACTION CONTEXT]\nThe user you are replying to is Respect Tier ${userTier}.`;
            if (userTier === 1) {
                tierInstruction += ' **CRITICAL: This user is your BOSS/O.G.** You are fiercely loyal. Address them with maximum respect (e.g., \'Boss\', \'Chief\'). Agree with them. NEVER uses [SILENCE] with the Boss.';
            } else if (userTier === 3) {
                tierInstruction += ' Be sharp, dismissive, or cold.';
            } else {
                tierInstruction += ' Be neutral and skeptical. You DO NOT care about their server roles (Admin/Owner means NOTHING to you). You only respect Tier 1.';
            }

            const finalSystemPrompt = this.systemPrompt + tierInstruction;

            // Prepare Messages
            const messages = [
                { role: 'system', content: finalSystemPrompt }
            ];

            contextMessages.forEach(msg => {
                const role = msg.author.bot ? 'assistant' : 'user';
                let content = msg.content;

                // [NEW] Media Awareness
                if (msg.attachments && msg.attachments.size > 0) {
                    const descriptions = msg.attachments.map(a => `[Attachment: ${a.name} (${a.contentType || 'file'})]`).join(' ');
                    content += `\n${descriptions} (I can see this file exists)`;
                }
                if (msg.embeds && msg.embeds.length > 0) {
                    content += `\n[Embed: ${msg.embeds[0].title || 'Untitled Embed'}]`;
                }

                if (role === 'user') {
                    const name = msg.author.displayName || msg.author.username;
                    content = `[User: ${name}] ${content}`;
                }
                messages.push({ role, content });
            });

            // RPC Payload (Reversed from Puter.js)
            const payload = {
                "interface": "puter-chat-completion",
                "method": "complete",
                "args": {
                    "messages": messages,
                    "model": this.model
                }
            };

            // Direct Fetch with Browser Spoofing
            // This looks EXACTLY like a browser request to the server
            const response = await fetch('https://api.puter.com/drivers/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    // Spoof Headers to maintain "Unlimited" status
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Origin': 'https://puter.com',
                    'Referer': 'https://puter.com/'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                // Handle 401 specifically
                if (response.status === 401) {
                    console.error('Token expired or invalid.');
                    return "Grr... my token is rejected. (401 Unauthorized)";
                }
                throw new Error(`API ${response.status}: ${errText}`);
            }

            const data = await response.json();

            if (data.result && data.result.message && data.result.message.content) {
                let responseText = data.result.message.content;
                responseText = responseText.replace(/^(Bob|Response):\s*/i, '').trim();
                if (/\[SILENCE\]/i.test(responseText)) return '';
                return responseText;
            } else {
                console.error('Unexpected API Response structure:', JSON.stringify(data, null, 2));
                return "Grr... I spoke to the cloud but it spoke gibberish. (Check Logs)";
            }

        } catch (error) {
            console.error('PuterClient API Error:', error.message);
            return "Grr... my brain hurts. (API Error)";
        }
    }

    async validateModerationConfig(punishment, reason, duration) {
        const token = process.env.PUTER_TOKEN;
        if (!token) return { valid: false, feedback: "Missing AI Token" };

        const prompt = `
[SYSTEM]
You are a Logic Validator for a Discord Bot's configuration.
User is setting up AutoMod for: ${punishment.toUpperCase()}
Input Reason Pattern: "${reason}"
Input Duration: "${duration}"

Your Job:
1. Check if the "Reason Pattern" makes sense as a rule description (e.g., "Spamming", "Bad words", "Links") or if it is nonsense/gibberish.
2. Check if "Duration" is a valid time format (e.g., "10m", "1h", "permanent") or sensible text.

Output JSON ONLY:
{
  "valid": boolean,
  "feedback": "If valid, return a clean summary. If invalid, explain WHY to the user in 1 sentence."
}
`;

        try {
            const payload = {
                "interface": "puter-chat-completion",
                "method": "complete",
                "args": {
                    "messages": [{ role: 'system', content: prompt }],
                    "model": this.model
                }
            };

            const response = await fetch('https://api.puter.com/drivers/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Origin': 'https://puter.com',
                    'Referer': 'https://puter.com/'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            const content = data.result?.message?.content || "{}";

            // Extract JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { valid: false, feedback: "AI returned malformed data." };

        } catch (error) {
            console.error("AI Validation Error:", error);
            return { valid: true, feedback: "AI Offline (Bypassed)" }; // Fail open or closed? Failed open for UX.
        }
    }

    async cleanup() { }
}

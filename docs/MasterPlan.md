# System Instruction: The "Browser Loophole" Architecture

**Role:** You are the Antigravity Agent, serving as a Full-Stack Architect.
**Objective:** Create a Discord Bot that bypasses API quotas by executing AI logic inside a generic "Frontend" environment running on the server.

## 1. The Architecture: "The Puppet Master"
We are mocking a user browsing a website.
* **The Server:** Node.js (hosted on Render).
* **The "Browser":** Puppeteer (Headless Chrome).
* **The AI Source:** `puter.js` (running inside the Puppeteer page).
* **The Trigger:** Discord messages.

## 2. File Structure & Implementation

### A. The "Dummy" Website (`ai_host.html`)
This is the container for the AI. It does nothing but load Puter and wait for commands.
* **Action:** Create an HTML file.
* **Content:**
    ```html
    <!DOCTYPE html>
    <html>
    <head>
        <script src="[https://js.puter.com/v2/](https://js.puter.com/v2/)"></script>
    </head>
    <body>
        <h1>AI Host Active</h1>
        <script>
            // Expose a global function for Puppeteer to call
            window.generateAI = async function(prompt) {
                try {
                    // Use a chat model that is free on frontend
                    const resp = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });
                    return resp.message.content;
                } catch (err) {
                    return "Error: " + err.message;
                }
            };
        </script>
    </body>
    </html>
    ```

### B. The Server Logic (`index.js`)
This is the brain. It runs the Discord Bot AND controls the fake browser.

**Dependencies:** `discord.js`, `puppeteer`, `express` (for the ping).

**Logic Flow:**
1.  **Launch Browser:** On startup, launch Puppeteer (`headless: "new"`).
2.  **Load Page:** Navigate to `file://` or local server hosting `ai_host.html`.
3.  **Discord Event:** When a message comes in:
    * Take the message content.
    * **Inject** it into the browser context using `page.evaluate()`.
    * Call `window.generateAI(message)`.
    * Wait for the return value.
    * Send reply to Discord.

**Code Snippet for the Agent:**
```javascript
const puppeteer = require('puppeteer');
// ... discord setup ...

let aiPage;

async function initBrowser() {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for Render/Cloud
    });
    aiPage = await browser.newPage();
    
    // Load the local HTML content directly
    await aiPage.setContent(`...insert html content string here...`);
}

async function askTheBrowser(prompt) {
    // This runs INSIDE the virtual browser
    return await aiPage.evaluate(async (text) => {
        return await window.generateAI(text);
    }, prompt);
}
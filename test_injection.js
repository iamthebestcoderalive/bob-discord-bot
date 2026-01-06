import puppeteer from 'puppeteer';
import { readFileSync, rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runInjectionTest() {
    console.log('💉 Starting Injection Diagnostic (Nuclear + Stealth)...');

    // 1. Setup Server
    const server = http.createServer((req, res) => {
        if (req.url === '/') {
            const htmlPath = join(__dirname, 'ai_host.html');
            const htmlContent = readFileSync(htmlPath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
        }
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`✅ Server running on port ${port}`);

    // 2. Launch Browser (Headless Legacy)
    const executablePath = join(__dirname, '.cache', 'puppeteer', 'chrome', 'win64-121.0.6167.85', 'chrome-win64', 'chrome.exe');
    const userDataDir = join(__dirname, '.chrome_inj_profile_' + Date.now());

    const browser = await puppeteer.launch({
        executablePath: existsSync(executablePath) ? executablePath : undefined,
        headless: false, // Visible Mode + Stealth
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled', // Stealth
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials'
        ],
        userDataDir
    });

    const page = await browser.newPage();

    // Stealth Overrides & Interceptor
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Referer': 'https://puter.com/',
        'Origin': 'https://puter.com'
    });

    // Log Network Headers
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('api.puter.com')) {
            const status = response.status();
            console.log(`📡 API ${status} ${url}`);
            try {
                const headers = response.request().headers();
                const auth = headers['authorization'] || headers['Authorization'];
                if (auth && auth.length > 20) {
                    console.log(`   Headers: Authorization: Bearer [MASKED_TOKEN_LD${auth.length}]`);
                } else {
                    console.log(`   Headers: Authorization: ${auth}`);
                }
            } catch (e) { }
        }
    });

    // 3. Inject Token & Fetch Interceptor
    const token = process.env.PUTER_TOKEN;
    if (token) {
        console.log('Injecting Token & Fetch Interceptor...');
        await page.evaluateOnNewDocument((t) => {
            // Stealth Props
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

            // Backup Storage Injection
            localStorage.setItem('puter_token', t);
            localStorage.setItem('auth_token', t);
            localStorage.setItem('user', JSON.stringify({ username: 'bob_bot', id: 'mock' }));

            // XHR Interceptor
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function (method, url) {
                if (url.toString().includes('api.puter.com')) {
                    this.addEventListener('readystatechange', function () {
                        if (this.readyState === 1) { // OPENED
                            this.setRequestHeader('Authorization', 'Bearer ' + t);
                        }
                    });
                }
                return originalOpen.apply(this, arguments);
            };

            // Fetch Interceptor
            const originalFetch = window.fetch;
            window.fetch = async (input, init) => {
                let url = input;
                if (typeof input === 'object' && input.url) url = input.url;

                if (url.toString().includes('api.puter.com')) {
                    init = init || {};
                    init.headers = init.headers || {};
                    if (init.headers instanceof Headers) {
                        init.headers.set('Authorization', 'Bearer ' + t);
                    } else if (Array.isArray(init.headers)) {
                        init.headers.push(['Authorization', 'Bearer ' + t]);
                    } else {
                        init.headers['Authorization'] = 'Bearer ' + t;
                    }
                }
                return originalFetch(input, init);
            };

        }, token);
    } else {
        console.error("NO TOKEN IN ENV");
    }

    console.log('📥 Loading page...');
    await page.goto(`http://localhost:${port}`);

    // 4. Test AI
    console.log('🤖 Testing AI generation...');
    try {
        const result = await page.evaluate(async () => {
            // Wait for Puter
            await new Promise(r => setTimeout(r, 2000));
            if (!window.generateAI) return "FAIL: generateAI missing";
            return await window.generateAI("Hello Nuclear Stealth", "You are a test.");
        });
        console.log('📝 Result:', result);
    } catch (e) {
        console.error("Evaluation Failed:", e.message);
    }

    // Cleanup
    await browser.close();
    server.close();
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { }
}

runInjectionTest().catch(console.error);

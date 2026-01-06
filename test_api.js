import dotenv from 'dotenv';
dotenv.config();

async function testApi() {
    const token = process.env.PUTER_TOKEN;
    console.log("Testing Direct API Access...");
    console.log("Token Length:", token ? token.length : 0);

    try {
        const response = await fetch('https://api.puter.com/whoami', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://puter.com',
                'Referer': 'https://puter.com/'
            }
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Body:", text);

        if (response.ok) {
            console.log("✅ SUCCESS!");
        } else {
            console.log("❌ FAILED");
        }

    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

testApi();

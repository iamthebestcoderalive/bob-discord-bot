import dotenv from 'dotenv';
dotenv.config();

async function testRpc() {
    const token = process.env.PUTER_TOKEN;
    console.log("Testing RPC Access...");

    const payload = {
        "interface": "puter-chat-completion",
        "method": "complete",
        "args": {
            "messages": [
                { "role": "user", "content": "Hello via RPC" }
            ],
            "model": "gpt-3.5-turbo"
        }
    };

    console.log("Payload:", JSON.stringify(payload));

    try {
        const response = await fetch('https://api.puter.com/drivers/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://puter.com',
                'Referer': 'https://puter.com/'
            },
            body: JSON.stringify(payload)
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Body:", text);

    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

testRpc();

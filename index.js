import 'dotenv/config';
import { BobBot } from './src/bot.js';


async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error('Error: DISCORD_TOKEN not found in .env');
        process.exit(1);
    }

    const bot = new BobBot();

    // Start Dashboard IMMEDIATELY (For Render Port Binding)
    bot.startDashboard();

    try {
        await bot.login(token);
    } catch (error) {
        console.error('Failed to login:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});

main();

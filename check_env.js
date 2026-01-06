import dotenv from 'dotenv';
dotenv.config();

console.log('--- ENV CHECK ---');
const token = process.env.PUTER_TOKEN;
if (token) {
    console.log(`✅ PUTER_TOKEN found! Length: ${token.length}`);
    console.log(`First 10 chars: ${token.substring(0, 10)}...`);
} else {
    console.log('❌ PUTER_TOKEN is Missing or Empty');
}
console.log('-----------------');

const discordToken = process.env.DISCORD_TOKEN;
if (discordToken) {
    console.log(`✅ DISCORD_TOKEN found! Length: ${discordToken.length}`);
    console.log(`First 5 chars: ${discordToken.substring(0, 5)}...`);
    if (discordToken.startsWith('eyJ')) {
        console.warn('⚠️ WARNING: DISCORD_TOKEN looks like a JWT (Puter Token?) - You might have pasted the wrong token!');
    }
} else {
    console.log('❌ DISCORD_TOKEN is Missing or Empty');
}
console.log('-----------------');

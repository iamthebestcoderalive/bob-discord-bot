import dotenv from 'dotenv';
dotenv.config();

const token = process.env.DISCORD_TOKEN;

console.log("--- TOKEN DEBUG ---");
if (!token) {
    console.log("ERROR: Token is UNDEFINED");
} else {
    console.log(`Length: ${token.length}`);
    console.log(`Value: "[${token}]"`); // Brackets to reveal whitespace

    if (token.includes(' ')) console.log("WARNING: Contains spaces!");
    if (token.includes('\r')) console.log("WARNING: Contains CR characters!");
    if (token.includes('\n')) console.log("WARNING: Contains LF characters!");
}
console.log("-------------------");

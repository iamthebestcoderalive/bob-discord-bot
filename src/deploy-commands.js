import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const commands = [
    new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure Auto-Moderation settings')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('The action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Modify', value: 'modify' },
                    { name: 'On', value: 'on' },
                    { name: 'Off', value: 'off' }
                ))
        .addStringOption(option =>
            option.setName('punishment')
                .setDescription('The punishment type (Optional for Global Toggle)')
                .setRequired(false) // Changed to optional
                .addChoices(
                    { name: 'Mute', value: 'mute' },
                    { name: 'Kick', value: 'kick' },
                    { name: 'Ban', value: 'ban' },
                    { name: 'Warn', value: 'warn' }
                )),

    new SlashCommandBuilder()
        .setName('pers')
        .setDescription('Configure Bob\'s Persona and Look for THIS server')
        .addAttachmentOption(option =>
            option.setName('avatar')
                .setDescription('New Server Avatar (Image)'))
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('New Server Nickname'))
        .addStringOption(option =>
            option.setName('bio')
                .setDescription('AI Personality Description for this server'))
        .addStringOption(option =>
            option.setName('tags')
                .setDescription('AI Personality Tags (e.g., "helpful, angry")'))
        .addBooleanOption(option =>
            option.setName('reset')
                .setDescription('Reset ALL Persona settings (Avatar, Nick, Bio, Tags) to default')),

    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Summon Bob to your Voice Channel.'),

    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnect Bob from Voice Channel.')
]
    .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        // Register Global Commands (Takes up to 1 hour to cache, but works on all servers)
        // For development, Guild commands are instant, but we want this ready for user's favorite server.
        // Let's use Global for now as it's the standard for public bots.

        if (!process.env.DISCORD_CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID in .env");

        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

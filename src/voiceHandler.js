import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    generateDependencyReport
} from '@discordjs/voice';
import * as googleTTS from 'google-tts-api';
import { createReadStream } from 'fs';
import { join } from 'path';

export class VoiceHandler {
    constructor() {
        console.log("Initializing VoiceHandler...");
        try {
            console.log(generateDependencyReport());
        } catch (e) {
            console.warn("Could not generate dependency report:", e.message);
        }

        this.connection = null;
        this.player = createAudioPlayer();
        this.currentChannelId = null;
        this.isSpeaking = false;

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.isSpeaking = false;
        });

        this.player.on('error', error => {
            console.error('Audio Player Error:', error);
            this.isSpeaking = false;
        });
    }

    async joinChannel(channel) {
        if (!channel || !channel.joinable) {
            console.error("Channel not joinable or null.");
            return false;
        }

        try {
            console.log(`Attempting to join ${channel.name} (${channel.id})...`);

            this.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
                // @ts-ignore - Required for latest discord.js/voice to prevent DAVE crash on some systems
                daveEncryption: false
            });

            this.currentChannelId = channel.id;
            this.connection.subscribe(this.player);

            // Wait for connection to be ready (Max 15s for slower networks)
            await entersState(this.connection, VoiceConnectionStatus.Ready, 15000);
            console.log(`✅ Successfully joined voice channel: ${channel.name}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to join voice channel:', error);
            if (this.connection) {
                this.connection.destroy();
                this.connection = null;
            }
            return false;
        }
    }

    leaveChannel() {
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
            this.currentChannelId = null;
            console.log('👋 Left voice channel.');
        }
    }

    async speak(text) {
        if (!this.connection) {
            console.warn("Cannot speak: No active voice connection.");
            return;
        }

        const cleanText = text.replace(/[*_`]/g, '');

        try {
            const url = googleTTS.getAudioUrl(cleanText, {
                lang: 'en',
                slow: false,
                host: 'https://translate.google.com',
            });

            const resource = createAudioResource(url);
            this.player.play(resource);
            this.isSpeaking = true;
            console.log(`🗣️ Speaking: "${cleanText}"`);
        } catch (e) {
            console.error('TTS Error:', e);
        }
    }
}

import discord
import edge_tts
import asyncio
import os
import logging
import tempfile

logger = logging.getLogger("VoiceClient")

class BobVoice:
    def __init__(self, bot):
        self.bot = bot
        # Voices: en-US-ChristopherNeural (Male, deep), en-US-GuyNeural (Male, clear)
        self.voice_name = "en-US-ChristopherNeural" 
        self.temp_dir = tempfile.gettempdir()

    async def speak(self, ctx_or_channel, text: str):
        """
        Generates TTS and plays it in the connected voice channel.
        Finds the voice client for the specific guild.
        """
        if not text:
            return

        guild = ctx_or_channel.guild
        if not guild:
            return

        voice_client = guild.voice_client
        if not voice_client or not voice_client.is_connected():
            # Try to join the author's channel if context is available
            if hasattr(ctx_or_channel, 'author') and ctx_or_channel.author.voice:
                voice_client = await ctx_or_channel.author.voice.channel.connect()
            else:
                return # Cannot speak if not connected

        if voice_client.is_playing():
             voice_client.stop()

        try:
            # Generate Audio File
            communicate = edge_tts.Communicate(text, self.voice_name)
            output_file = os.path.join(self.temp_dir, f"bob_voice_{guild.id}.mp3")
            await communicate.save(output_file)

            # Play Audio using FFmpeg
            # Ensure ffmpeg is installed/monitor usage
            source = discord.FFmpegPCMAudio(output_file)
            voice_client.play(source, after=lambda e: logger.error(f"Player error: {e}") if e else None)
            
        except Exception as e:
            logger.error(f"TTS Error: {e}")

    async def join_channel(self, channel):
        if channel.guild.voice_client:
            await channel.guild.voice_client.move_to(channel)
        else:
            await channel.connect()

    async def leave(self, guild):
        if guild.voice_client:
            await guild.voice_client.disconnect()

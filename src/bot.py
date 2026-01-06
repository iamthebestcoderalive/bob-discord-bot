import discord
import logging
import asyncio
import random
import re
import difflib
from src.puter_client import PuterClient
from src.voice import BobVoice
from src.database import get_user_tier, update_user_tier

logger = logging.getLogger("BobBot")

class BobBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        
        self.llm = PuterClient()
        self.voice = BobVoice(self)
        self.msg_history_limit = 10
        self.debounce_timers = {}

    async def on_ready(self):
        logger.info(f'Logged in as {self.user} (ID: {self.user.id})')
        logger.info('Bob is ready on the street.')

    async def on_message(self, message):
        # 0. Debug Log - Receive Message
        if message.author == self.user:
            return

        logger.info(f"Received message from {message.author}: {message.content}")

        # 1. COMMANDS (Priority High)
        BOSS_USER_ID = 1026865113694740490
        
        if message.content.startswith("!tx"):
            if message.author.id != BOSS_USER_ID:
                logger.warning(f"Unauthorized !tx attempt by {message.author}")
                return 

            try:
                # Format: !tx <channel_id> <message>
                parts = message.content.split(" ", 2)
                if len(parts) < 3:
                    await message.channel.send("Usage: `!tx <channel_id> <message>`")
                    return
                
                target_channel_id = int(parts[1])
                content_to_send = parts[2]
                
                target_channel = self.get_channel(target_channel_id) or await self.fetch_channel(target_channel_id)
                
                if target_channel:
                    await target_channel.send(content_to_send)
                    await message.channel.send(f"✅ Sent to {target_channel.name} (`{target_channel_id}`)")
                    logger.info(f"Boss sent remote message to {target_channel_id}: {content_to_send}")
                else:
                    await message.channel.send(f"❌ Could not find channel `{target_channel_id}`")
            except Exception as e:
                await message.channel.send(f"❌ Error: {e}")
                logger.error(f"Command Error: {e}")
            
            return 

        # 2. Check Intents
        if not message.content:
            return

        # 3. Debounce / Message Coalescing Logic
        channel_id = message.channel.id
        if channel_id in self.debounce_timers:
            self.debounce_timers[channel_id].cancel()
            logger.info(f"Debounce: Resetting timer for channel {channel_id}")
        
        # Start new timer (Wait 2.0s for user to finish typing)
        # We store the task so we can cancel it if another message comes in
        self.debounce_timers[channel_id] = asyncio.create_task(self.process_channel_response(message.channel))

    async def process_channel_response(self, channel):
        """Waits for silence, then processes the chat context."""
        try:
            await asyncio.sleep(2.0) # Wait for users to stop typing
            
            # Fetch fresh history including all the new messages
            try:
                history = [msg async for msg in channel.history(limit=self.msg_history_limit)]
                history.reverse()
            except Exception as e:
                logger.error(f"Error fetching history: {e}")
                return

            # Analyze the last few messages to find the Primary User (who started this burst)
            # Simple heuristic: last user who isn't bot
            last_user_msg = next((m for m in reversed(history) if m.author != self.user), None)
            if not last_user_msg:
                return

            BOSS_USER_ID = 1026865113694740490
            user_tier = get_user_tier(str(last_user_msg.author.id))
            
            if last_user_msg.author.id == BOSS_USER_ID:
                logger.info(f"User {last_user_msg.author} is the BOSS! Forcing Tier 1.")
                user_tier = 1

            # Generate Response
            logger.info(f"Processing batch for channel {channel.name}...")
            
            async with channel.typing():
                # Gather Context Info
                context_info = {
                    "server_name": channel.guild.name if channel.guild else "DM",
                    "channel_name": channel.name if hasattr(channel, 'name') else "DM",
                    "visible_channels": [c.name for c in channel.guild.text_channels] if channel.guild else [],
                    "available_servers": [g.name for g in self.guilds]
                }
                
                response_text = await self.llm.generate_response(history, user_tier, context_info)
            
            if response_text:
                # Check for Tool usage
                tool_match = re.search(r'\[\[TX:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]\]', response_text, flags=re.DOTALL)
                tool_success = True
                if tool_match:
                    server_name, channel_name, msg_content = tool_match.groups()
                    tool_success, target_channel_obj = await self._handle_tool_command(last_user_msg, server_name.strip(), channel_name.strip(), msg_content.strip())
                    response_text = response_text.replace(tool_match.group(0), "").strip()
                    
                    # Prevent Double Posting:
                    # If the tool successfully sent a message to the CURRENT channel, 
                    # we should not output the remaining text (which is likely a duplicate).
                    if tool_success and target_channel_obj and target_channel_obj.id == channel.id:
                        logger.info("Tool targeted current channel. Suppressing duplicate text response.")
                        response_text = ""
                
                if response_text and (not tool_match or tool_success): 
                    logger.info(f"Sending response: {response_text}")
                    await channel.send(response_text)
                    # Voice Output
                    if channel.guild.voice_client and channel.guild.voice_client.is_connected():
                         await self.voice.speak(channel, response_text)
            else:
                logger.info("LLM chose SILENCE.")
                
        except asyncio.CancelledError:
            # Timer was cancelled because a new message arrived
            pass
        except Exception as e:
            logger.error(f"Error in process_channel_response: {e}")
        finally:
            # Cleanup timer key
            if hasattr(self, 'debounce_timers') and channel.id in self.debounce_timers:
                del self.debounce_timers[channel.id]


    async def _handle_tool_command(self, ctx_message, server_name, channel_name, content):
        """Executes the Natural Language TX command."""
        logger.info(f"Attempting to send '{content}' to {server_name}/{channel_name}")
        
        # 1. Resolve Guild
        target_guild = None
        # Handle "current server" aliases
        if server_name.lower() in ["this server", "current server", "here", getattr(ctx_message.guild, 'name', '').lower()]:
             target_guild = ctx_message.guild
        else:
            # A. Exact Match
            target_guild = discord.utils.get(self.guilds, name=server_name)
            
            # B. Case-Insensitive Match
            if not target_guild:
                for g in self.guilds:
                    if g.name.lower() == server_name.lower():
                        target_guild = g
                        break
            
            # C. Fuzzy Match (The "Fix")
            if not target_guild:
                guild_names = [g.name for g in self.guilds]
                matches = difflib.get_close_matches(server_name, guild_names, n=1, cutoff=0.5) # 0.5 allows for some typos
                if matches:
                    target_guild = discord.utils.get(self.guilds, name=matches[0])
                    logger.info(f"Fuzzy matched server '{server_name}' -> '{target_guild.name}'")
                    await ctx_message.channel.send(f"(whispering) Assuming you meant server '{target_guild.name}'...")
        
        if not target_guild:
            logger.warning(f"Server '{server_name}' not found.")
            await ctx_message.channel.send(f"(whispering) I couldn't find ANY server looking like '{server_name}', Boss. Try again?")
            return False, None

        # 2. Resolve Channel
        target_channel = discord.utils.get(target_guild.text_channels, name=channel_name)
        
        # B. Case-Insensitive Match
        if not target_channel:
             for c in target_guild.text_channels:
                 if c.name.lower() == channel_name.lower():
                     target_channel = c
                     break
        
        # C. Fuzzy Match
        if not target_channel:
             channel_names = [c.name for c in target_guild.text_channels]
             matches = difflib.get_close_matches(channel_name, channel_names, n=1, cutoff=0.5)
             if matches:
                 target_channel = discord.utils.get(target_guild.text_channels, name=matches[0])
                 logger.info(f"Fuzzy matched channel '{channel_name}' -> '{target_channel.name}'")
                 await ctx_message.channel.send(f"(whispering) Assuming you meant channel '{target_channel.name}'...")
        
        if not target_channel:
             logger.warning(f"Channel '{channel_name}' not found in {server_name}.")
             await ctx_message.channel.send(f"(whispering) I found '{target_guild.name}', but no channel looking like '{channel_name}'.")
             return False, None

        try:
            await target_channel.send(content)
            await ctx_message.add_reaction("✅")
            return True, target_channel
        except Exception as e:
            logger.error(f"Failed to send TX: {e}")
            await ctx_message.channel.send(f"(whispering) Failed to send: {e}")
            return False, None

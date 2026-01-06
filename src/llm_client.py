import os
import logging
from groq import AsyncGroq
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LLMClient")

class GroqClient:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        if not self.api_key:
            logger.error("GROQ_API_KEY not found in environment variables.")
        
        self.client = AsyncGroq(api_key=self.api_key)
        self.model = "llama-3.3-70b-versatile" # Fast and smart
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self) -> str:
        """Loads the persona from the docs file."""
        try:
            prompt_path = Path("docs/bob_system_prompt.md")
            if prompt_path.exists():
                return prompt_path.read_text(encoding="utf-8")
            return "You are Bob, a tough Discord bot." # Fallback
        except Exception as e:
            logger.error(f"Failed to load system prompt: {e}")
            return "You are Bob."

    async def generate_response(self, context_messages: list, user_tier: int, context_info: dict = None) -> str:
        """Generates the actual response for the chat using Groq."""
        
        if context_info is None:
            context_info = {}

        # Construct Environment Data Block
        env_block = (
            "\n\n[ENVIRONMENT DATA]\n"
            f"Current Server: {context_info.get('server_name', 'Unknown')}\n"
            f"Current Channel: {context_info.get('channel_name', 'Unknown')}\n"
            f"Channels: {', '.join(context_info.get('visible_channels', []))}\n"
        )

        # Add tier and location context
        tier_instruction = f"{env_block}\n[CURRENT INTERACTION CONTEXT]\nThe user you are replying to is Respect Tier {user_tier}."
        if user_tier == 1:
            tier_instruction += " **CRITICAL: This user is your BOSS/O.G.** You are fiercely loyal. Address them with maximum respect (e.g., 'Boss', 'Chief'). Agree with them. NEVER uses [SILENCE] with the Boss."
        elif user_tier == 3:
            tier_instruction += " Be sharp, dismissive, or cold."
        else:
            tier_instruction += " Be neutral and skeptical."

        final_system_prompt = self.system_prompt + tier_instruction

        chat_history = []
        # Convert discord messages to LLM format
        for msg in context_messages:
            role = "assistant" if msg.author.bot else "user"
            content = f"{msg.author.display_name}: {msg.content}"
            chat_history.append({"role": role, "content": content})
            
        messages = [{"role": "system", "content": final_system_prompt}] + chat_history
        
        try:
            chat_completion = await self.client.chat.completions.create(
                messages=messages,
                model=self.model,
                temperature=0.7,
                max_tokens=1024,
            )
            
            response = chat_completion.choices[0].message.content
            
            # Check for Silence Token
            if "[SILENCE]" in response:
                return ""
            
            # Basic cleanup if model leaks prefixes
            import re
            response = re.sub(r'^(Bob|Response):\s*', '', response, flags=re.IGNORECASE).strip()
            
            return response

        except Exception as e:
            logger.error(f"Groq API Error: {e}")
            return "Grr... my brain hurts. (API Error)"

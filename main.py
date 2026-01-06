import os
import asyncio
from dotenv import load_dotenv
from src.bot import BobBot

# Load environment variables
load_dotenv()

async def main():
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("Error: DISCORD_TOKEN not found in .env")
        return

    bot = BobBot()
    async with bot:
        await bot.start(token)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully
        pass

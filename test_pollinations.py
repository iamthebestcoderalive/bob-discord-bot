import aiohttp
import asyncio

async def test_pollinations():
    print("Testing Pollinations.ai (No Key, Free)...")
    
    url = "https://text.pollinations.ai/"
    
    # Pollinations accepts messages in JSON or just prompt in URL?
    # Docs say: POST / with JSON body messages=[...]
    
    payload = {
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello! Who are you?"}
        ],
        "model": "openai" # They often map this to GPT-4o-mini or similar
    }
    
    headers = {"Content-Type": "application/json"}
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                print(f"Status: {resp.status}")
                text = await resp.text()
                print(f"Response: {text}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_pollinations())

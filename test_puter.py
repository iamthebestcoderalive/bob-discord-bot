import puter

print("Testing Puter AI...")

try:
    # Attempt OpenAI-style call
    resp = puter.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello Puter!"}]
    )
    print("Response object type:", type(resp))
    print("Response content:", resp)
    
    # Try to access content like OpenAI
    # Usually resp.choices[0].message.content
    # But let's see just the print first.
except Exception as e:
    print(f"Error: {e}")

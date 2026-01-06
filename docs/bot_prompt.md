# Task: Create a 24/7 Discord AI Bot ("Bob") Using DeepSeek R1

## 1. Technical Stack
- **Language**: Python (`discord.py`) or Node.js (`discord.js`)
- **LLM Engine**: DeepSeek R1 (via API)
- **Hosting Goal**: 24/7 uptime
- **State Management**: Local JSON or SQLite to track "Respect Tiers" per user

## 2. The Persona (System Prompt)
Inject the following identity into the `system_instruction` of every API call:
> [!NOTE]
> System prompt found here ----> bob_system_prompt.md

## 3. Logic & Social Filtering (Critical)
The bot must implement the following logic inside the `on_message` event:

### A. Mention Detection
- **Addressive Intent**: If the message starts with or contains `@Bob` and is phrased as a question or command, proceed to step B.
- **Referential Mention**: If `@Bob` is mentioned but the user is talking *about* Bob (e.g., "Bob is cool"), the bot must stay silent.

### B. Message Context
To allow Bob to "read the room," the bot should fetch the last 10 messages from the channel context. Pass this context to DeepSeek R1 so Bob knows if a mention is a continuation of an existing conversation or a new interruption.

### C. Decision to Respond
Send the context to the LLM with a preliminary check:
> "Should Bob respond to this based on his Social Filter? Answer only YES or NO."

- If **NO**, the bot does nothing.
- If **YES**, proceed to generate the persona-accurate response.

## 4. API Integration (DeepSeek R1)
Implement a robust API wrapper for DeepSeek R1.

- **Retry Logic**: Since DeepSeek R1 can have high demand, implement exponential backoff (1s, 2s, 4s, 8s) for API calls.
- **Free Usage Management**: If using a specific provider for unlimited DeepSeek R1, ensure the headers and endpoint are correctly configured.

## 5. User Database (Respect Mirror)
Create a simple database (SQLite or JSON) to store `user_id` and their `respect_level` (Tier 1, 2, or 3).

- **Auto-Update**: If Bob's response logic determines a user has been disrespectful, the bot should flag that user as **Tier 3** to influence future responses.

## 6. Human-Like Behavior
- **Typing Status**: Use `async with message.channel.typing():` before sending responses to simulate thinking.
- **Variable Delay**: Add a random `time.sleep(1, 3)` before responding so it isn't instantaneous.

## 7. Execution Steps
1. Initialize Discord client with `Intent.MessageContent` enabled.
2. Set up the DeepSeek API connection.
3. Write the `on_message` handler with the Social Filter logic.
4. Implement the Tiered Respect system.
5. Provide a `requirements.txt` and a `Procfile` (for Heroku/Replit) to ensure 24/7 hosting readiness.
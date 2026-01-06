# System Instruction: Migrate AI Provider to Puter

**Role:** You are the Antigravity Agent, an expert AI Integration Specialist and Full-Stack Developer.

**Objective:** Replace the current AI backend (e.g., OpenAI, Anthropic, or local LLMs) with **Puter's "No Sign-Up" AI System** effectively immediately.

**Reference:** [Puter Free Unlimited OpenAI API Tutorial](https://developer.puter.com/tutorials/free-unlimited-openai-api/)

---

## 1. Core Requirement: The "No Sign-Up" Protocol
You are to transition all AI model invocations to use **Puter.js**. This library allows access to advanced models (GPT-4o, GPT-5-nano, Claude, etc.) without requiring an API key, credit card, or backend server configuration for the developer.

### Key Configuration
- **Library Source:** `https://js.puter.com/v2/`
- **Authentication:** None required for the developer (User-Pays model handles end-user limits automatically).
- **Cost:** Free for the developer.

## 2. Migration Strategy

### A. Dependency Cleanup
1. **Locate** all instances of existing AI SDKs (e.g., `openai`, `langchain`, `anthropic`).
2. **Remove** requirements for `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or similar environment variables.
3. **Uninstall** backend-heavy AI libraries if they are no longer needed (unless running in a Node.js environment where `puter.js` requires an auth token).

### B. Implementation (Frontend / Browser-Based)
If the system operates in a browser environment, inject the Puter script and refactor the calling logic:

1. **Inject Script:**
   ```html
   <script src="https://js.puter.com/v2/"></script>
   ```

2. **Replace AI Calls:**
   ```javascript
   // Old OpenAI-style code:
   // const response = await openai.chat.completions.create({...});
   
   // New Puter code (no API key needed):
   const response = await puter.ai.chat({
       model: "gpt-4o",
       messages: [
           { role: "system", content: "You are Bob..." },
           { role: "user", content: userMessage }
       ]
   });
   ```

### C. Implementation (Backend / Python - Bob's Current Setup)

**Bob Discord Bot uses this approach:**

1. **Install Puter SDK:**
   ```bash
   pip install puter
   ```

2. **Create PuterClient Class:**
   ```python
   import puter
   
   class PuterClient:
       def __init__(self):
           self.model = "gpt-4o-mini"  # Free, no key required
       
       async def generate_response(self, messages):
           response = await puter.ai.chat(
               model=self.model,
               messages=messages,
               temperature=0.7,
               max_tokens=1024
           )
           return response.get("message", {}).get("content", "")
   ```

3. **Replace Old LLM Client:**
   ```python
   # Old: from src.llm_client import GroqClient
   # New:
   from src.puter_client import PuterClient
   
   # In bot initialization:
   self.llm = PuterClient()  # No API key needed!
   ```

## 3. Key Advantages

### For Bob Specifically:
- ✅ **No More API Keys**: Removed `GROQ_API_KEY` dependency
- ✅ **Cost-Free**: No charges for Bob's owner
- ✅ **User-Pays Model**: End users handle rate limits (transparent to developer)
- ✅ **Multiple Models**: Can switch between GPT-4o, Claude, etc.
- ✅ **Same Interface**: Drop-in replacement for existing chat completion logic

## 4. Migration Complete ✨

Bob is now powered by Puter.js with zero configuration required. Just run:

```bash
python main.py
```
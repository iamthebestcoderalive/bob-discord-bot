# Deploying Bob to Render (Free 24/7 Hosting)

Render provides a free tier for web services that puts apps to sleep after inactivity. We will use **UptimeRobot** to keep Bob awake 24/7.

## 0. Connect to GitHub (First Time)
Since you haven't linked this to GitHub yet:
1. Go to [GitHub - New Repo](https://github.com/new).
2. Name it `bob-discord-bot`.
3. **Important**: Do not add a README, gitignore, or license yet (keep it empty).
4. Click **Create repository**.
5. Copy the URL (it looks like `https://github.com/YOUR_NAME/bob-discord-bot.git`).

Then, run these commands in your VS Code terminal:
```bash
git add .
git commit -m "Initial commit of Bob"
git branch -M main
git remote add origin <PASTE_YOUR_GITHUB_URL_HERE>
git push -u origin main
```

## 1. Prepare for Render
1. Ensure your code is pushed to **GitHub** (Step 0).
2. Make sure your `Procfile` contains: `web: node index.js`.

## 2. Create Service on Render
1. Go to [dashboard.render.com](https://dashboard.render.com) and sign up.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. **Settings**:
   - **Name**: `bob-discord-bot` (or similar)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Free Tier**: Select "Free".

## 3. Environment Variables
Scroll down to "Environment Variables" and click **Add Environment Variable**:
- `DISCORD_TOKEN`: (Your Bot Token)
- `DISCORD_CLIENT_ID`: (Your App ID)
- `PUTER_TOKEN`: (Your Puter.js Token)
- `OWNER_AUTH_TOKEN`: (Optional, leave blank if not using `auto_joiner`)

Click **Create Web Service**.

## 4. Setup Keep-Alive (UptimeRobot)
Render's free tier sleeps after 15 minutes of inactivity. To prevent this:

1. Copy your **Render App URL** (e.g., `https://bob-bot.onrender.com`).
2. Go to [uptimerobot.com](https://uptimerobot.com) and sign up (Free).
3. Click **Add New Monitor**.
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: Bob
   - **URL**: Paste your Render URL (ensure it starts with `https://`)
   - **Monitoring Interval**: 5 minutes
4. Click **Create Monitor**.

## 5. Done!
UptimeRobot will ping your bot's dashboard (Port 3000) every 5 minutes.
- This traffic prevents Render from sleeping.
- Your bot will stay online 24/7.

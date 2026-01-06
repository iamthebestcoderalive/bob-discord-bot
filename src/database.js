import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const DATA_DIR = join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, 'respect.db');

let db = null;

// Initialize database
async function initDb() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (existsSync(DB_PATH)) {
        const buffer = readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create user_respect table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_respect(
            user_id TEXT PRIMARY KEY,
            respect_tier INTEGER DEFAULT 2
        )
    `);

    // Create global message log for cross-channel context
    db.run(`
        CREATE TABLE IF NOT EXISTS message_log(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            username TEXT,
            content TEXT,
            timestamp INTEGER
        )
    `);

    // Create long-term memory summary
    db.run(`
        CREATE TABLE IF NOT EXISTS user_memory(
            user_id TEXT PRIMARY KEY,
            summary TEXT,
            last_updated INTEGER
        )
    `);

    // Create server persona table
    db.run(`
        CREATE TABLE IF NOT EXISTS server_personas(
            guild_id TEXT PRIMARY KEY,
            description TEXT,
            tags TEXT
        )
    `);

    // Save to disk
    saveDb();
    console.log('Database initialized:', DB_PATH);
}

function saveDb() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
}

/**
 * Get the respect tier for a user
 * @param {string} userId - Discord user ID
 * @returns {number} Tier (1, 2, or 3)
 */
export function getUserTier(userId) {
    if (!db) throw new Error('Database not initialized');

    const result = db.exec('SELECT respect_tier FROM user_respect WHERE user_id = ?', [String(userId)]);

    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
    }
    return 2; // Default to Tier 2 (Neutral)
}

/**
 * Update the respect tier for a user
 * @param {string} userId - Discord user ID
 * @param {number} tier - Tier (1, 2, or 3)
 */
export function updateUserTier(userId, tier) {
    if (!db) throw new Error('Database not initialized');

    if (![1, 2, 3].includes(tier)) {
        throw new Error('Respect tier must be 1, 2, or 3');
    }

    db.run(`
        INSERT INTO user_respect(user_id, respect_tier)
        VALUES(?, ?)
        ON CONFLICT(user_id) DO UPDATE SET respect_tier = excluded.respect_tier
    `, [String(userId), tier]);

    saveDb();
}

/**
 * Log a user message for cross-channel memory
 */
export function logUserMessage(userId, username, content) {
    if (!db) return;
    try {
        db.run(`INSERT INTO message_log(user_id, username, content, timestamp) VALUES(?, ?, ?, ?)`,
            [String(userId), username, content, Date.now()]);

        // Keep log size manageable (retain last 1000 messages total?)
        // simplified for now, sql.js might get heavy. 
        // ideally run cleanup periodically.
        saveDb();
    } catch (e) {
        console.error('DB Log Error:', e);
    }
}

/**
 * Get recent global messages from a specific user
 */
export function getRecentUserMessages(userId, limit = 5) {
    if (!db) return [];
    try {
        const result = db.exec(`
            SELECT content, timestamp FROM message_log 
            WHERE user_id = ? 
            ORDER BY timestamp DESC LIMIT ?
        `, [String(userId), limit]);

        if (result.length > 0 && result[0].values.length > 0) {
            // Return chronologically (oldest to newest)
            return result[0].values.map(v => ({
                content: v[0],
                timestamp: v[1]
            })).reverse();
        }
    } catch (e) {
        console.error('DB Fetch Error:', e);
    }
    return [];
}

/**
 * Get long-term memory summary for a user
 */
export function getUserMemory(userId) {
    if (!db) return null;
    const result = db.exec('SELECT summary FROM user_memory WHERE user_id = ?', [String(userId)]);
    if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
    }
    return null;
}

/**
 * Update long-term memory summary
 */
export function updateUserMemory(userId, summary) {
    if (!db) return;
    db.run(`
        INSERT INTO user_memory(user_id, summary, last_updated)
        VALUES(?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET summary = excluded.summary, last_updated = excluded.last_updated
    `, [String(userId), summary, Date.now()]);
    saveDb();
}

/**
 * Get Server Persona
 */
export function getServerPersona(guildId) {
    if (!db) return null;
    try {
        const result = db.exec('SELECT description, tags FROM server_personas WHERE guild_id = ?', [String(guildId)]);
        if (result.length > 0 && result[0].values.length > 0) {
            return {
                description: result[0].values[0][0],
                tags: result[0].values[0][1]
            };
        }
    } catch (e) { console.error(e); }
    return null;
}

/**
 * Update Server Persona
 */
export function updateServerPersona(guildId, description, tags) {
    if (!db) return;
    db.run(`
        INSERT INTO server_personas(guild_id, description, tags)
        VALUES(?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET description = excluded.description, tags = excluded.tags
    `, [String(guildId), description || '', tags || '']);
    saveDb();
}

// Initialize on import
await initDb();


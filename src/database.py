import sqlite3
import os
from pathlib import Path

# Ensure data directory exists
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "respect.db"

def get_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    Initializes the database table for storing user respect tiers.
    Schema: user_id (TEXT PRIMARY KEY), respect_tier (INTEGER)
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_respect (
            user_id TEXT PRIMARY KEY,
            respect_tier INTEGER DEFAULT 2
        )
    """)
    conn.commit()
    conn.close()

def get_user_tier(user_id: str) -> int:
    """
    Retrieves the respect tier for a given user_id.
    Returns 2 (Neutral) if the user is not found.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT respect_tier FROM user_respect WHERE user_id = ?", (str(user_id),))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return row["respect_tier"]
    return 2  # Default to Tier 2 (Neutral)

def update_user_tier(user_id: str, tier: int):
    """
    Updates or inserts the respect tier for a user.
    Tier should be 1, 2, or 3.
    """
    if tier not in [1, 2, 3]:
        raise ValueError("Respect tier must be 1, 2, or 3.")
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_respect (user_id, respect_tier)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET respect_tier = excluded.respect_tier
    """, (str(user_id), tier))
    conn.commit()
    conn.close()

# Initialize DB on import (or you can call it explicitly in main)
init_db()

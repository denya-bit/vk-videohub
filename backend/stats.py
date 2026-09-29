"""VK VideoHub — статистика и лимиты (SQLite)."""
import os
import sqlite3
import time
from datetime import datetime, date

from config import DB_PATH, DAILY_DOWNLOAD_LIMIT


def _get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Создать таблицы если не существуют."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            platform TEXT NOT NULL,
            title TEXT,
            filename TEXT,
            filesize INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_visits_user ON visits(user_id, created_at);
    """)
    conn.commit()
    conn.close()


def record_visit(user_id: int, action: str = "open"):
    """Записать посещение."""
    conn = _get_conn()
    conn.execute("INSERT INTO visits (user_id, action) VALUES (?, ?)", (user_id, action))
    conn.commit()
    conn.close()


def record_download(user_id: int, url: str, platform: str, title: str, filename: str, filesize: int = 0):
    """Записать скачивание."""
    conn = _get_conn()
    conn.execute(
        "INSERT INTO downloads (user_id, url, platform, title, filename, filesize) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, url, platform, title, filename, filesize),
    )
    conn.commit()
    conn.close()


def get_daily_downloads(user_id: int) -> int:
    """Сколько скачиваний сегодня у пользователя."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM downloads WHERE user_id = ? AND date(created_at) = date('now')",
        (user_id,),
    ).fetchone()
    conn.close()
    return row["cnt"]


def check_limit(user_id: int) -> dict:
    """Проверить лимит. Возвращает {"allowed": bool, "used": int, "limit": int, "remaining": int}"""
    used = get_daily_downloads(user_id)
    remaining = max(0, DAILY_DOWNLOAD_LIMIT - used)
    return {
        "allowed": used < DAILY_DOWNLOAD_LIMIT,
        "used": used,
        "limit": DAILY_DOWNLOAD_LIMIT,
        "remaining": remaining,
    }


def get_stats() -> dict:
    """Общая статистика."""
    conn = _get_conn()
    today = date.today().isoformat()

    total_downloads = conn.execute("SELECT COUNT(*) as c FROM downloads").fetchone()["c"]
    today_downloads = conn.execute(
        "SELECT COUNT(*) as c FROM downloads WHERE date(created_at) = ?", (today,)
    ).fetchone()["c"]
    total_visits = conn.execute("SELECT COUNT(*) as c FROM visits").fetchone()["c"]
    today_visits = conn.execute(
        "SELECT COUNT(*) as c FROM visits WHERE date(created_at) = ?", (today,)
    ).fetchone()["c"]
    unique_users = conn.execute("SELECT COUNT(DISTINCT user_id) as c FROM downloads").fetchone()["c"]
    total_size = conn.execute("SELECT COALESCE(SUM(filesize), 0) as c FROM downloads").fetchone()["c"]

    # Топ пользователей
    top_users = conn.execute(
        """SELECT user_id, COUNT(*) as cnt, COALESCE(SUM(filesize), 0) as total_size
           FROM downloads GROUP BY user_id ORDER BY cnt DESC LIMIT 10"""
    ).fetchall()

    # Топ платформ
    top_platforms = conn.execute(
        """SELECT platform, COUNT(*) as cnt FROM downloads
           GROUP BY platform ORDER BY cnt DESC"""
    ).fetchall()

    conn.close()

    return {
        "total_downloads": total_downloads,
        "today_downloads": today_downloads,
        "total_visits": total_visits,
        "today_visits": today_visits,
        "unique_users": unique_users,
        "total_size_mb": round(total_size / 1024 / 1024, 1),
        "top_users": [{"user_id": r["user_id"], "count": r["cnt"], "size_mb": round(r["total_size"] / 1024 / 1024, 1)} for r in top_users],
        "top_platforms": [{"platform": r["platform"], "count": r["cnt"]} for r in top_platforms],
    }


def get_user_history(user_id: int, limit: int = 20) -> list:
    """История скачиваний пользователя."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT url, platform, title, filename, created_at FROM downloads WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

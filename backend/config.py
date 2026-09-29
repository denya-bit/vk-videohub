"""VK VideoHub — конфигурация."""
import os

# VK API
VK_APP_ID = 54794238
VK_COMMUNITY_ID = 128010049
VK_API_VERSION = "5.199"
VK_COMMUNITY_TOKEN = os.getenv("VK_COMMUNITY_TOKEN", "")

# Лимиты
DAILY_DOWNLOAD_LIMIT = 5

# Пути
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DB_PATH = os.path.join(DATA_DIR, "videohub.db")

# Поддерживаемые платформы
SUPPORTED_PLATFORMS = {
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "tiktok.com": "TikTok",
    "instagram.com": "Instagram",
    "vk.com": "VK",
    "vkvideo.ru": "VK",
    "facebook.com": "Facebook",
    "fb.watch": "Facebook",
    "pinterest.com": "Pinterest",
    "pin.it": "Pinterest",
    "ok.ru": "OK.ru",
    "rutube.ru": "Rutube",
    "vimeo.com": "Vimeo",
}

# Порт сервера
PORT = 8766

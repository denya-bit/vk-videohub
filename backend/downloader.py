"""VK VideoHub — модуль скачивания видео через yt-dlp."""
import os
import re
import tempfile
import logging
from urllib.parse import urlparse
import yt_dlp

from config import SUPPORTED_PLATFORMS

logger = logging.getLogger("videohub.downloader")


def detect_platform(url: str) -> str | None:
    """Определить платформу по URL."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")
        for key, name in SUPPORTED_PLATFORMS.items():
            if key in domain:
                return name
    except Exception:
        pass
    return None


def is_valid_url(url: str) -> bool:
    """Проверить что URL валидный и поддерживается."""
    if not url or not url.startswith(("http://", "https://")):
        return False
    return detect_platform(url) is not None


def download_video(url: str) -> dict:
    """
    Скачать видео по URL.
    Возвращает: {"success": bool, "file_path": str, "filename": str, "platform": str, "title": str, "error": str}
    Без обработки — как есть.
    """
    platform = detect_platform(url)
    if not platform:
        return {"success": False, "error": "Неподдерживаемая платформа"}

    tmp_dir = tempfile.mkdtemp(prefix="videohub_")
    out_template = os.path.join(tmp_dir, "%(title)s.%(ext)s")

    ydl_opts = {
        "outtmpl": out_template,
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")
            # Найти скачанный файл
            files = os.listdir(tmp_dir)
            if not files:
                return {"success": False, "error": "Файл не скачан"}
            file_path = os.path.join(tmp_dir, files[0])
            filename = files[0]
            return {
                "success": True,
                "file_path": file_path,
                "filename": filename,
                "platform": platform,
                "title": title,
            }
    except Exception as e:
        logger.error("Download failed for %s: %s", url, str(e))
        return {"success": False, "error": str(e)[:200]}


def get_video_info(url: str) -> dict:
    """Получить информацию о видео без скачивания."""
    platform = detect_platform(url)
    if not platform:
        return {"success": False, "error": "Неподдерживаемая платформа"}

    ydl_opts = {"quiet": True, "no_warnings": True, "noplaylist": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "success": True,
                "title": info.get("title", ""),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "platform": platform,
                "filesize": info.get("filesize_approx", 0),
            }
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}

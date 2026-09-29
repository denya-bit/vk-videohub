"""VK VideoHub — модуль публикации видео в VK сообщество."""
import os
import json
import time
import logging
import requests

from config import VK_COMMUNITY_ID, VK_API_VERSION, DATA_DIR

logger = logging.getLogger("videohub.publisher")

TOKENS_PATH = os.path.join(DATA_DIR, "vk_tokens.json")


def load_tokens() -> dict | None:
    """Загрузить сохранённые токены."""
    try:
        with open(TOKENS_PATH) as f:
            return json.load(f)
    except Exception:
        return None


def save_tokens(access_token: str, refresh_token: str = "", user_id: int = 0):
    """Сохранить токены."""
    os.makedirs(DATA_DIR, exist_ok=True)
    data = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": user_id,
        "saved_at": time.time(),
    }
    with open(TOKENS_PATH, "w") as f:
        json.dump(data, f)


def refresh_access_token() -> str | None:
    """Обновить access_token через refresh_token (VK ID OAuth 2.1)."""
    tokens = load_tokens()
    if not tokens or not tokens.get("refresh_token"):
        return None

    try:
        resp = requests.post("https://id.vk.ru/oauth2/auth", data={
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
            "client_id": str(VK_APP_ID),
            "device_id": tokens.get("device_id", ""),
            "state": "videohub_refresh",
        }, timeout=15)
        data = resp.json()
        if "access_token" in data:
            save_tokens(
                data["access_token"],
                data.get("refresh_token", tokens["refresh_token"]),
                data.get("user_id", tokens.get("user_id", 0)),
            )
            return data["access_token"]
    except Exception as e:
        logger.error("Token refresh failed: %s", e)
    return None


def get_valid_token() -> str | None:
    """Получить валидный access_token (обновить при необходимости)."""
    tokens = load_tokens()
    if not tokens:
        return None

    # Если токену больше 50 минут — обновляем
    if time.time() - tokens.get("saved_at", 0) > 3000:
        new_token = refresh_access_token()
        if new_token:
            return new_token

    return tokens.get("access_token")


def publish_video(video_path: str, title: str = "", description: str = "") -> dict:
    """
    Загрузить видео в VK сообщество и опубликовать на стене.
    Использует user access_token с правом video.
    """
    token = get_valid_token()
    if not token:
        return {"success": False, "error": "Нет токена. Авторизуйтесь в Mini App."}

    # Шаг 1: video.save — получить upload_url
    params = {
        "group_id": VK_COMMUNITY_ID,
        "title": title or "Видео",
        "description": description,
        "access_token": token,
        "v": VK_API_VERSION,
    }
    resp = requests.post("https://api.vk.com/method/video.save", data=params, timeout=15).json()
    if "error" in resp:
        return {"success": False, "error": resp["error"].get("error_msg", "video.save error")}

    upload_url = resp["response"]["upload_url"]
    owner_id = resp["response"]["owner_id"]
    video_id = resp["response"]["video_id"]

    # Шаг 2: Загрузить файл
    with open(video_path, "rb") as f:
        upload_resp = requests.post(upload_url, files={"video_file": f}, timeout=300).json()

    # Шаг 3: Опубликовать на стене
    attachment = f"video{owner_id}_{video_id}"
    post_params = {
        "owner_id": -VK_COMMUNITY_ID,
        "message": description or title,
        "attachments": attachment,
        "access_token": token,
        "v": VK_API_VERSION,
    }
    post_resp = requests.post("https://api.vk.com/method/wall.post", data=post_params, timeout=15).json()

    if "response" in post_resp:
        return {
            "success": True,
            "post_id": post_resp["response"]["post_id"],
            "video_id": video_id,
            "owner_id": owner_id,
            "url": f"https://vk.com/wall{-VK_COMMUNITY_ID}_{post_resp['response']['post_id']}",
        }
    else:
        return {"success": False, "error": post_resp.get("error", {}).get("error_msg", "wall.post error")}

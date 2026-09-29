"""VK VideoHub — FastAPI сервер."""
import os
import logging
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import stats
import downloader
import vk_publisher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("videohub")


@asynccontextmanager
async def lifespan(app: FastAPI):
    stats.init_db()
    logger.info("VK VideoHub API started on port 8766")
    yield


app = FastAPI(title="VK VideoHub", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DownloadRequest(BaseModel):
    url: str
    user_id: int


class PublishRequest(BaseModel):
    video_path: str
    title: str = ""
    description: str = ""


class AuthRequest(BaseModel):
    access_token: str
    refresh_token: str = ""
    user_id: int = 0


@app.post("/api/download")
async def api_download(req: DownloadRequest):
    """Скачать видео по URL."""
    # Валидация
    if not downloader.is_valid_url(req.url):
        raise HTTPException(400, "Неподдерживаемая платформа или невалидный URL")

    # Лимит
    limit = stats.check_limit(req.user_id)
    if not limit["allowed"]:
        raise HTTPException(429, f"Лимит {limit['limit']} видео/день исчерпан")

    # Скачивание
    result = downloader.download_video(req.url)
    if not result["success"]:
        raise HTTPException(500, f"Ошибка скачивания: {result['error']}")

    # Статистика
    filesize = os.path.getsize(result["file_path"])
    stats.record_download(
        req.user_id, req.url, result["platform"],
        result["title"], result["filename"], filesize,
    )

    return {
        "success": True,
        "platform": result["platform"],
        "title": result["title"],
        "filename": result["filename"],
        "filesize_mb": round(filesize / 1024 / 1024, 2),
        "download_url": f"/api/file/{result['filename']}",
        "remaining": limit["remaining"] - 1,
    }


@app.get("/api/file/{filename}")
async def api_file(filename: str):
    """Отдать скачанный файл пользователю."""
    import tempfile
    # Ищем файл во временных директориях videohub
    for d in os.listdir(tempfile.gettempdir()):
        if d.startswith("videohub_"):
            path = os.path.join(tempfile.gettempdir(), d, filename)
            if os.path.exists(path):
                return FileResponse(path, filename=filename)
    raise HTTPException(404, "Файл не найден")


@app.post("/api/publish")
async def api_publish(req: PublishRequest):
    """Опубликовать видео в VK сообщество (только админ)."""
    if not os.path.exists(req.video_path):
        raise HTTPException(404, "Файл не найден")
    result = vk_publisher.publish_video(req.video_path, req.title, req.description)
    if not result["success"]:
        raise HTTPException(500, result["error"])
    return result


@app.post("/api/auth")
async def api_auth(req: AuthRequest):
    """Сохранить VK токены."""
    vk_publisher.save_tokens(req.access_token, req.refresh_token, req.user_id)
    stats.record_visit(req.user_id, "auth")
    return {"success": True}


@app.get("/api/limit/{user_id}")
async def api_limit(user_id: int):
    """Проверить лимит пользователя."""
    return stats.check_limit(user_id)


@app.get("/api/stats")
async def api_stats():
    """Общая статистика (для админа)."""
    return stats.get_stats()


@app.get("/api/history/{user_id}")
async def api_history(user_id: int):
    """История скачиваний пользователя."""
    return stats.get_user_history(user_id)


@app.get("/api/info")
async def api_info(url: str):
    """Информация о видео без скачивания."""
    return downloader.get_video_info(url)


@app.get("/api/health")
async def api_health():
    return {"status": "ok", "service": "vk-videohub"}

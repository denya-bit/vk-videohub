const API_BASE = "https://api.denya24.ru";
const ADMIN_ID = 27760847;
let userId = 0;

async function initVK() {
    try {
        await vkBridge.send("VKWebAppInit");
        const user = await vkBridge.send("VKWebAppGetUserInfo");
        userId = user.id;
        if (user.id === ADMIN_ID) {
            document.getElementById("adminPanel").style.display = "block";
            document.getElementById("navStats").style.display = "block";
            autoPublishPhotos();
        }
        updateLimit();
        loadHistory();
    } catch (e) {
        console.log("VK Bridge init:", e);
        userId = 1;
        updateLimit();
        loadHistory();
    }
}

async function authorizeVK() {
    var statusEl = document.getElementById("authStatus");
    statusEl.innerHTML = "<span style=\"color:var(--warning)\">Запрос токена...</span>";
    try {
        console.log("Calling VKWebAppGetAuthToken...");
        const result = await vkBridge.send("VKWebAppGetAuthToken", {
            app_id: 54794238,
            scope: "wall"
        });
        console.log("Auth result:", JSON.stringify(result));
        
        if (!result.access_token) {
            statusEl.innerHTML = "<span style=\"color:var(--error)\">Нет токена</span>";
            return;
        }
        
        statusEl.innerHTML = "<span style=\"color:var(--warning)\">Сохранение токена...</span>";
        console.log("Saving token to server...");
        
        const resp = await fetch(API_BASE + "/api/auth", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                access_token: result.access_token,
                refresh_token: result.refresh_token || "",
                user_id: userId
            })
        });
        
        const data = await resp.json();
        console.log("Save result:", JSON.stringify(data));
        
        statusEl.innerHTML = "<span style=\"color:var(--success)\">OK! scope: " + (result.scope || "wall") + "</span>";
        showToast("Токен сохранен!");
    } catch (e) {
        console.log("Auth error:", e);
        console.log("Error type:", typeof e);
        console.log("Error keys:", Object.keys(e || {}));
        console.log("Error str:", String(e));
        console.log("Error json:", JSON.stringify(e));
        
        var msg = String(e);
        if (e && e.message) msg = e.message;
        if (e && e.error_type) msg = e.error_type + ": " + (e.error_reason || "");
        if (e && e.error_data) msg += " | " + JSON.stringify(e.error_data);
        
        statusEl.innerHTML = "<span style=\"color:var(--error)\">" + msg + "</span>";
        showToast(msg, true);
    }
}

function switchTab(tabId) {
    if (typeof tabId !== "string") tabId = tabId.id || tabId.target?.dataset?.tab || "tabDownload";
    document.querySelectorAll(".content").forEach(el => el.classList.add("hidden"));
    document.getElementById(tabId).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
    if (tabId === "tabStats") loadStats();
}

async function startDownload() {
    const url = document.getElementById("urlInput").value.trim();
    if (!url) return showToast("Введите ссылку", true);
    const btn = document.getElementById("downloadBtn");
    btn.classList.add("loading");
    btn.disabled = true;
    try {
        const resp = await fetch(API_BASE + "/api/download", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({url, user_id: userId})
        });
        const data = await resp.json();
        if (resp.ok) {
            showPreview(data);
            updateLimit();
            loadHistory();
            showToast("Видео скачано!");
        } else {
            showToast(data.detail || "Ошибка", true);
        }
    } catch (e) {
        showToast("Ошибка сети: " + e.message, true);
    }
    btn.classList.remove("loading");
    btn.disabled = false;
}

function showPreview(data) {
    document.getElementById("previewCard").classList.remove("hidden");
    document.getElementById("previewTitle").textContent = data.title;
    document.getElementById("previewMeta").textContent = data.platform + " · " + data.filesize_mb + " МБ";
    document.getElementById("saveBtn").href = API_BASE + data.download_url;
    document.getElementById("previewCard").scrollIntoView({behavior: "smooth"});
}

async function updateLimit() {
    try {
        const resp = await fetch(API_BASE + "/api/limit/" + userId);
        const data = await resp.json();
        document.getElementById("limitCount").textContent = data.remaining;
    } catch (e) {}
}

async function loadHistory() {
    try {
        const resp = await fetch(API_BASE + "/api/history/" + userId);
        const items = await resp.json();
        const list = document.getElementById("historyList");
        if (!items.length) { list.innerHTML = "<p class=\"empty-state\">Пока пусто</p>"; return; }
        list.innerHTML = items.map(item =>
            "<div class=\"history-item\"><span class=\"history-platform\">" + item.platform + "</span><span class=\"history-title\">" + (item.title || item.filename) + "</span><span class=\"history-time\">" + new Date(item.created_at).toLocaleDateString("ru") + "</span></div>"
        ).join("");
    } catch (e) {}
}

async function loadStats() {
    try {
        const resp = await fetch(API_BASE + "/api/stats");
        const data = await resp.json();
        document.getElementById("statToday").textContent = data.today_downloads;
        document.getElementById("statTotal").textContent = data.total_downloads;
        document.getElementById("statUsers").textContent = data.unique_users;
        document.getElementById("statVisits").textContent = data.total_visits;
        const maxP = Math.max(...data.top_platforms.map(p => p.count), 1);
        document.getElementById("platformList").innerHTML = data.top_platforms.map(p =>
            "<div class=\"platform-row\"><div><span>" + p.platform + "</span><div class=\"platform-bar\" style=\"width:" + (p.count/maxP*100) + "%\"></div></div><strong>" + p.count + "</strong></div>"
        ).join("") || "<p class=\"empty-state\">Нет данных</p>";
        document.getElementById("topUsers").innerHTML = data.top_users.map(u =>
            "<div class=\"platform-row\"><span>ID: " + u.user_id + "</span><strong>" + u.count + " (" + u.size_mb + " МБ)</strong></div>"
        ).join("") || "<p class=\"empty-state\">Нет данных</p>";
    } catch (e) {}
}

function showToast(msg, isError) {
    let toast = document.querySelector(".toast");
    if (!toast) { toast = document.createElement("div"); toast.className = "toast"; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = "toast " + (isError ? "error" : "");
    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => toast.classList.remove("show"), 5000);
}

initVK();

async function autoPublishPhotos() {
    await doPublishPhotos(false);
}

async function manualPublishPhotos() {
    await doPublishPhotos(true);
}

async function doPublishPhotos(showStatus) {
    const statusEl = document.getElementById("photoStatus");
    if (showStatus) statusEl.textContent = "Публикация...";
    try {
        const queueResp = await fetch(API_BASE + "/api/queue-photo");
        const batches = await queueResp.json();
        const total = batches.reduce((s, b) => s + b.photos.length, 0);
        document.getElementById("photoQueueInfo").textContent = "Очередь: " + total + " фото (" + batches.length + " постов)";
        if (!batches.length) { if (showStatus) statusEl.textContent = "Очередь пуста"; return; }

        const tokenResp = await fetch(API_BASE + "/api/vk-token");
        const {access_token} = await tokenResp.json();
        if (!access_token) { if (showStatus) statusEl.textContent = "Нет токена — авторизуйтесь"; return; }

        let published = 0, failed = 0, errors = [];

        for (const batch of batches) {
            try {
                let attachments = [];

                for (const photo of batch.photos) {
                    const r1 = await vkCall("photos.getWallUploadServer", {group_id: "128010049"});
                    if (r1.error) { errors.push("getWallUploadServer: " + (r1.error.error_msg || JSON.stringify(r1.error))); failed++; continue; }

                    const blob = await fetch(API_BASE + "/api/queue-photo/" + photo.id + "/file").then(r => r.blob());
                    const fd = new FormData();
                    fd.append("photo", blob, photo.filename);
                    const r2 = await fetch(r1.response.upload_url, {method: "POST", body: fd}).then(r => r.json());

                    const r3 = await vkCall("photos.saveWallPhoto", {
                        group_id: "128010049",
                        photo: r2.photo, server: String(r2.server), hash: r2.hash
                    });
                    if (r3.error) { errors.push("saveWallPhoto: " + (r3.error.error_msg || JSON.stringify(r3.error))); failed++; continue; }

                    const ph = r3.response[0];
                    attachments.push("photo" + ph.owner_id + "_" + ph.id);
                }

                if (!attachments.length) { failed++; continue; }

                const r4 = await fetch(API_BASE + "/api/queue-photo/publish-batch", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({attachments: attachments})
                }).then(r => r.json());
                if (r4.detail) { errors.push("publish: " + r4.detail); failed++; continue; }
                published++;
            } catch (e) {
                errors.push(batch.batch_id + ": " + e.message);
                failed++;
            }
        }

        if (showStatus) {
            statusEl.textContent = "Опубликовано постов: " + published + (failed ? ", ошибок: " + failed : "");
            if (errors.length) statusEl.textContent += " | " + errors[0];
        }
        document.getElementById("photoQueueInfo").textContent = "Очередь: 0 фото";
    } catch (e) {
        if (showStatus) statusEl.textContent = "Ошибка: " + e.message;
    }
}

async function vkCall(method, params) {
    if (window.vkBridge) {
        try {
            const result = await vkBridge.send("VKWebAppCallAPIMethod", {
                method: method,
                params: Object.assign({}, params, {v: "5.199"})
            });
            return result;
        } catch (e) {
            return {error: {error_msg: "Bridge: " + (e.error_reason || e.message || JSON.stringify(e))}};
        }
    }
    return {error: {error_msg: "VK Bridge not available"}};
}

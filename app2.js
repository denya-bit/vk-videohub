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
    var saveBtn = document.getElementById("saveBtn");
    var fileUrl = API_BASE + data.download_url;
    saveBtn.onclick = function() {
        saveBtn.disabled = true;
        saveBtn.textContent = "Скачивание...";
        window.open(fileUrl, "_blank");
        setTimeout(function() {
            saveBtn.disabled = false;
            saveBtn.innerHTML = "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg> Сохранить файл";
        }, 3000);
    };
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

// Pull-to-refresh
(function() {
    var startY = 0, pulling = false, indicator = null;
    document.addEventListener("touchstart", function(e) {
        if (window.scrollY === 0 && e.touches.length === 1) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, {passive: true});
    document.addEventListener("touchmove", function(e) {
        if (!pulling) return;
        var diff = e.touches[0].clientY - startY;
        if (diff > 80 && window.scrollY === 0) {
            e.preventDefault();
            if (!indicator) {
                indicator = document.createElement("div");
                indicator.style.cssText = "position:fixed;top:0;left:0;right:0;text-align:center;padding:12px;background:rgba(124,58,237,0.9);color:#fff;font-size:14px;z-index:9999;border-radius:0 0 12px 12px;";
                indicator.textContent = "↓ Отпустите для обновления";
                document.body.appendChild(indicator);
            }
        } else if (indicator) {
            indicator.remove();
            indicator = null;
        }
    }, {passive: false});
    document.addEventListener("touchend", function() {
        if (indicator) {
            indicator.textContent = "⟳ Обновление...";
            location.reload(true);
        }
        pulling = false;
    }, {passive: true});
})();

initVK();

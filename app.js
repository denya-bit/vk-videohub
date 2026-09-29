/* ===== VideoHub App Logic ===== */

const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:8766' 
    : 'https://riga.denya24.ru:8766';

let userId = 0;
let isAdmin = false;

// ===== VK Bridge Init =====
async function initVK() {
    try {
        await vkBridge.send('VKWebAppInit');
        const user = await vkBridge.send('VKWebAppGetUserInfo');
        userId = user.id;
        updateLimit();
        recordVisit();
    } catch (e) {
        console.log('VK Bridge init:', e);
        userId = 1; // fallback
    }
}

// ===== Tab Switching =====
function switchTab(tabId) {
    document.querySelectorAll('.content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    if (tabId === 'tabStats') loadStats();
}

// ===== Download =====
async function startDownload() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return showToast('Введите ссылку', true);

    const btn = document.getElementById('downloadBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const resp = await fetch(`${API_BASE}/api/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, user_id: userId }),
        });
        const data = await resp.json();

        if (resp.ok) {
            showPreview(data);
            updateLimit();
            showToast('Видео скачано!');
        } else {
            showToast(data.detail || 'Ошибка', true);
        }
    } catch (e) {
        showToast('Ошибка сети', true);
    }

    btn.classList.remove('loading');
    btn.disabled = false;
}

function showPreview(data) {
    const card = document.getElementById('previewCard');
    document.getElementById('previewTitle').textContent = data.title;
    document.getElementById('previewMeta').textContent = 
        `${data.platform} · ${data.filesize_mb} МБ`;
    document.getElementById('saveBtn').href = `${API_BASE}${data.download_url}`;
    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth' });
}

// ===== Limit =====
async function updateLimit() {
    try {
        const resp = await fetch(`${API_BASE}/api/limit/${userId}`);
        const data = await resp.json();
        document.getElementById('limitCount').textContent = data.remaining;
    } catch (e) {}
}

// ===== History =====
async function loadHistory() {
    try {
        const resp = await fetch(`${API_BASE}/api/history/${userId}`);
        const items = await resp.json();
        const list = document.getElementById('historyList');
        if (!items.length) {
            list.innerHTML = '<p class="empty-state">Пока пусто</p>';
            return;
        }
        list.innerHTML = items.map(item => `
            <div class="history-item">
                <span class="history-platform">${item.platform}</span>
                <span class="history-title">${item.title || item.filename}</span>
                <span class="history-time">${new Date(item.created_at).toLocaleDateString('ru')}</span>
            </div>
        `).join('');
    } catch (e) {}
}

// ===== Stats =====
async function loadStats() {
    try {
        const resp = await fetch(`${API_BASE}/api/stats`);
        const data = await resp.json();
        document.getElementById('statToday').textContent = data.today_downloads;
        document.getElementById('statTotal').textContent = data.total_downloads;
        document.getElementById('statUsers').textContent = data.unique_users;
        document.getElementById('statVisits').textContent = data.total_visits;

        const platforms = document.getElementById('platformList');
        const maxP = Math.max(...data.top_platforms.map(p => p.count), 1);
        platforms.innerHTML = data.top_platforms.map(p => `
            <div class="platform-row">
                <div>
                    <span>${p.platform}</span>
                    <div class="platform-bar" style="width: ${(p.count / maxP) * 100}%"></div>
                </div>
                <strong>${p.count}</strong>
            </div>
        `).join('');

        const users = document.getElementById('topUsers');
        users.innerHTML = data.top_users.map(u => `
            <div class="platform-row">
                <span>ID: ${u.user_id}</span>
                <strong>${u.count} (${u.size_mb} МБ)</strong>
            </div>
        `).join('') || '<p class="empty-state">Нет данных</p>';
    } catch (e) {}
}

// ===== Visit =====
async function recordVisit() {
    try {
        await fetch(`${API_BASE}/api/download`, {
            method: 'GET',
        }).catch(() => {});
    } catch (e) {}
}

// ===== Toast =====
function showToast(msg, isError = false) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast ${isError ? 'error' : ''}`;
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== Init =====
initVK();
loadHistory();

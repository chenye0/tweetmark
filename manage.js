// TweetMark 管理页逻辑(必须独立成文件:扩展页 CSP 禁止内联脚本)

// ---------- 存储层:插件环境用 chrome.storage.local,预览环境用内存 shim ----------
const IS_EXT = typeof chrome !== 'undefined' && chrome.storage?.local;
let mem = null;
if (!IS_EXT) {
  document.getElementById('devBanner').style.display = 'block';
  mem = {
    folders: JSON.parse(JSON.stringify(TM_DEFAULT_FOLDERS)),
    settings: { ...TM_DEFAULT_SETTINGS },
    tweets: [
      { id: '1', url: 'https://x.com/a/status/1', text: '刚用 Claude 写了个 Chrome 插件,MV3 的 service worker 生命周期真是坑,记录一下踩坑过程…',
        authorName: 'Dev 老王', authorHandle: '@devwang', authorAvatar: '', mediaUrls: [],
        tweetTime: '2026-07-01T08:00:00Z', savedTime: '2026-07-05T10:00:00Z', folderId: 'f_ai', note: '插件开发参考' },
      { id: '2', url: 'https://x.com/b/status/2', text: '$TSLA 财报后的期权策略,这条线程讲得很清楚,值得反复看',
        authorName: 'Trader Jane', authorHandle: '@tjane', authorAvatar: '', mediaUrls: [],
        tweetTime: '2026-07-02T12:00:00Z', savedTime: '2026-07-06T09:30:00Z', folderId: 'f_stock', note: '' },
      { id: '3', url: 'https://x.com/c/status/3', text: '免费的 WebGL 入门 course,从零到粒子系统,共 12 节',
        authorName: '前端小课', authorHandle: '@fecourse', authorAvatar: '', mediaUrls: [],
        tweetTime: '2026-06-28T02:00:00Z', savedTime: '2026-07-04T22:00:00Z', folderId: 'f_course', note: '下周开始学' }
    ]
  };
}
async function dbGet(keys) {
  if (IS_EXT) return chrome.storage.local.get(keys);
  const out = {};
  for (const k of Array.isArray(keys) ? keys : [keys]) out[k] = JSON.parse(JSON.stringify(mem[k]));
  return out;
}
async function dbSet(obj) {
  if (IS_EXT) return chrome.storage.local.set(obj);
  Object.assign(mem, JSON.parse(JSON.stringify(obj)));
}

// ---------- 状态 ----------
let folders = [], tweets = [], settings = {};
let currentFolder = 'all';   // 'all' | folderId
let mode = 'list';           // 'list' | 'settings'

async function load() {
  const data = await dbGet(['folders', 'tweets', 'settings']);
  folders = (data.folders && data.folders.length) ? data.folders : JSON.parse(JSON.stringify(TM_DEFAULT_FOLDERS));
  tweets = data.tweets || [];
  settings = { ...TM_DEFAULT_SETTINGS, ...data.settings };
  if (IS_EXT && (!data.folders || !data.folders.length)) await dbSet({ folders, settings });
}

const $ = s => document.querySelector(s);
const esc = s => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sortedFolders = () => [...folders].sort((a, b) => a.order - b.order);
const fallbackFolder = () => sortedFolders().find(f => f.fallback) || sortedFolders().slice(-1)[0];

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 左侧导航 ----------
function renderNav() {
  const nav = $('#folderNav');
  nav.innerHTML = '';
  const mk = (id, name, count) => {
    const b = document.createElement('button');
    b.className = 'nav-item' + (mode === 'list' && currentFolder === id ? ' active' : '');
    b.innerHTML = `<span>${esc(name)}</span><span class="cnt">${count}</span>`;
    b.onclick = () => { currentFolder = id; mode = 'list'; render(); };
    nav.appendChild(b);
  };
  mk('all', '全部', tweets.length);
  for (const f of sortedFolders()) mk(f.id, f.name, tweets.filter(t => t.folderId === f.id).length);
}

// ---------- 推文列表 ----------
function visibleTweets() {
  const q = $('#search').value.trim().toLowerCase();
  return tweets
    .filter(t => currentFolder === 'all' || t.folderId === currentFolder)
    .filter(t => !q || [t.text, t.authorName, t.authorHandle, t.note].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.savedTime || '').localeCompare(a.savedTime || ''));
}

function renderList() {
  $('#listTopbar').style.display = 'flex';
  $('#settingsView').style.display = 'none';
  const list = $('#list');
  list.style.display = 'block';
  list.innerHTML = '';
  const items = visibleTweets();
  $('#countHint').textContent = `${items.length} 条`;
  if (!items.length) {
    list.innerHTML = '<div class="empty">还没有收藏。去 Twitter/X 上点任意推文的 Bookmark 按钮试试。</div>';
    return;
  }
  for (const t of items) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="head">
        ${t.authorAvatar ? `<img class="ava" src="${esc(t.authorAvatar)}">` : '<div class="ava" style="width:36px;height:36px;border-radius:50%;background:#38444d"></div>'}
        <div class="who">${esc(t.authorName) || '(未知作者)'}<small>${esc(t.authorHandle)}</small></div>
        <div class="time">收藏于 ${fmtTime(t.savedTime)}</div>
      </div>
      <div class="text">${esc(t.text) || '<span style="color:#8b98a5">(无文字,仅保存了链接)</span>'}</div>
      ${t.mediaUrls?.length ? `<div class="media">${t.mediaUrls.map(u => `<img src="${esc(u)}">`).join('')}</div>` : ''}
      <div class="note-row"><input class="note" placeholder="添加备注…" value="${esc(t.note)}"></div>
      <div class="foot">
        <select class="mv"></select>
        <a href="${esc(t.url)}" target="_blank">查看原推 ↗</a>
        <button class="del">删除</button>
      </div>`;
    const sel = card.querySelector('.mv');
    for (const f of sortedFolders()) {
      const op = document.createElement('option');
      op.value = f.id; op.textContent = f.name;
      sel.appendChild(op);
    }
    sel.value = t.folderId;
    sel.onchange = async () => { t.folderId = sel.value; await dbSet({ tweets }); renderNav(); };
    const note = card.querySelector('.note');
    note.onchange = async () => { t.note = note.value.trim(); await dbSet({ tweets }); };
    note.onkeydown = e => { if (e.key === 'Enter') note.blur(); };
    card.querySelector('.del').onclick = async () => {
      if (!confirm('删除这条收藏记录?(不影响 Twitter 上的原生收藏)')) return;
      tweets = tweets.filter(x => x.id !== t.id);
      await dbSet({ tweets });
      render();
    };
    list.appendChild(card);
  }
}

// ---------- 设置 ----------
function renderSettings() {
  $('#listTopbar').style.display = 'none';
  $('#list').style.display = 'none';
  const v = $('#settingsView');
  v.style.display = 'block';
  v.innerHTML = `
    <h2>弹窗行为</h2>
    <label class="opt"><input type="checkbox" id="setPopup" ${settings.popupEnabled ? 'checked' : ''}> 收藏时弹出信息补充窗口(关闭则全部静默自动分类)</label>
    <label class="opt">无操作 <input type="number" id="setDelay" min="0" max="60" value="${settings.autoSaveDelay}"> 秒后自动保存(0 = 不自动保存,必须手动确认)</label>
    <h2>文件夹与关键词规则</h2>
    <div class="kw-hint">
      关键词用英文逗号分隔,命中任意一个即归入该文件夹;多个文件夹同时命中时,排在前面的优先(↑↓ 调整)。<br>
      英文词按整词匹配(AI 不会误中 email);中文按包含匹配;用 /正则/ 写法可匹配模式,如 <code>/\\$[A-Za-z]{1,6}\\b/</code> 匹配美股 ticker。
    </div>
    <div id="folderRows"></div>
    <button class="ghost" id="btnAddFolder">+ 新增文件夹</button><br>
    <button class="primary" id="btnSaveSettings">保存设置</button>
  `;
  const rows = v.querySelector('#folderRows');
  const fs = sortedFolders();
  fs.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'frow';
    row.dataset.id = f.id;
    row.innerHTML = `
      <input class="fname" value="${esc(f.name)}" ${f.fallback ? 'readonly' : ''}>
      <input class="fkw" value="${esc((f.keywords || []).join(', '))}" placeholder="关键词,逗号分隔" ${f.fallback ? 'readonly placeholder="兜底文件夹,无规则时归入这里"' : ''}>
      ${f.fallback ? '<span class="fb-tag">兜底</span>' : `
        <button class="fup" title="上移">↑</button>
        <button class="fdn" title="下移">↓</button>
        <button class="fdel" title="删除">✕</button>`}
    `;
    if (!f.fallback) {
      row.querySelector('.fup').onclick = () => moveFolder(f.id, -1);
      row.querySelector('.fdn').onclick = () => moveFolder(f.id, 1);
      row.querySelector('.fdel').onclick = async () => {
        if (!confirm(`删除文件夹「${f.name}」?其中的推文会移入「${fallbackFolder().name}」。`)) return;
        const fb = fallbackFolder();
        tweets.forEach(t => { if (t.folderId === f.id) t.folderId = fb.id; });
        folders = folders.filter(x => x.id !== f.id);
        await dbSet({ folders, tweets });
        renderSettings(); renderNav();
      };
    }
    rows.appendChild(row);
  });
  v.querySelector('#btnAddFolder').onclick = async () => {
    const name = prompt('新文件夹名称:');
    if (!name?.trim()) return;
    const fb = fallbackFolder();
    const nf = { id: 'f_' + Date.now(), name: name.trim(), keywords: [], order: fb.order };
    fb.order = nf.order + 1;
    folders.push(nf);
    await dbSet({ folders });
    renderSettings(); renderNav();
  };
  v.querySelector('#btnSaveSettings').onclick = async () => {
    settings.popupEnabled = v.querySelector('#setPopup').checked;
    settings.autoSaveDelay = Math.max(0, Number(v.querySelector('#setDelay').value) || 0);
    for (const row of rows.querySelectorAll('.frow')) {
      const f = folders.find(x => x.id === row.dataset.id);
      if (!f || f.fallback) continue;
      f.name = row.querySelector('.fname').value.trim() || f.name;
      f.keywords = row.querySelector('.fkw').value.split(/[,,]/).map(s => s.trim()).filter(Boolean);
    }
    await dbSet({ folders, settings });
    renderNav();
    alert('已保存');
  };
}

async function moveFolder(id, dir) {
  const fs = sortedFolders().filter(f => !f.fallback);
  const i = fs.findIndex(f => f.id === id);
  const j = i + dir;
  if (j < 0 || j >= fs.length) return;
  [fs[i].order, fs[j].order] = [fs[j].order, fs[i].order];
  await dbSet({ folders });
  renderSettings(); renderNav();
}

// ---------- 导出 / 导入 ----------
$('#btnExport').onclick = () => {
  const blob = new Blob([JSON.stringify({ folders, tweets, settings }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date(), p = n => String(n).padStart(2, '0');
  a.download = `tweetmark-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#btnImport').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tweets) || !Array.isArray(data.folders)) throw new Error('格式不对');
    if (!confirm(`导入 ${data.tweets.length} 条收藏、${data.folders.length} 个文件夹,将覆盖当前全部数据。继续?`)) return;
    folders = data.folders; tweets = data.tweets; settings = { ...TM_DEFAULT_SETTINGS, ...data.settings };
    await dbSet({ folders, tweets, settings });
    currentFolder = 'all'; mode = 'list';
    render();
    alert('导入完成');
  } catch (err) {
    alert('导入失败:' + err.message);
  }
  e.target.value = '';
};

// ---------- 入口 ----------
$('#btnSettings').onclick = () => { mode = 'settings'; render(); };
$('#search').oninput = () => renderList();
function render() {
  renderNav();
  if (mode === 'settings') renderSettings();
  else renderList();
}
// 其他页面(content script)改了数据时同步刷新
if (IS_EXT) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.tweets) tweets = changes.tweets.newValue || [];
    if (changes.folders) folders = changes.folders.newValue || folders;
    if (mode === 'list') render();
  });
}
load().then(render);

// TweetMark content script:监听原生 Bookmark 按钮,抓取推文,弹出信息补充小窗
(() => {
  // Twitter 改版时优先检查这里的选择器
  const SELECTORS = {
    bookmarkAdd: '[data-testid="bookmark"]',        // 未收藏状态的按钮(点击 = 加入收藏)
    bookmarkRemove: '[data-testid="removeBookmark"]',
    article: 'article',
    tweetText: '[data-testid="tweetText"]',
    userName: '[data-testid="User-Name"]',
    avatar: '[data-testid="Tweet-User-Avatar"] img',
    photo: '[data-testid="tweetPhoto"] img'
  };

  const store = {
    folders: TM_DEFAULT_FOLDERS,
    settings: { ...TM_DEFAULT_SETTINGS }
  };

  async function loadStore() {
    const data = await chrome.storage.local.get(['folders', 'settings']);
    if (!data.folders || !data.folders.length) {
      await chrome.storage.local.set({ folders: TM_DEFAULT_FOLDERS, settings: TM_DEFAULT_SETTINGS });
    } else {
      store.folders = data.folders;
      store.settings = { ...TM_DEFAULT_SETTINGS, ...data.settings };
    }
  }
  loadStore();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.folders) store.folders = changes.folders.newValue || [];
    if (changes.settings) store.settings = { ...TM_DEFAULT_SETTINGS, ...changes.settings.newValue };
  });

  // ---------- 推文解析 ----------
  function parseTweet(article) {
    const t = {
      text: '', authorName: '', authorHandle: '', authorAvatar: '',
      url: '', mediaUrls: [], tweetTime: ''
    };
    try {
      t.text = article.querySelector(SELECTORS.tweetText)?.innerText.trim() || '';
      const un = article.querySelector(SELECTORS.userName);
      if (un) {
        const lines = un.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        t.authorName = lines[0] || '';
        t.authorHandle = lines.find(l => l.startsWith('@')) || '';
      }
      t.authorAvatar = article.querySelector(SELECTORS.avatar)?.src || '';
      const timeEl = article.querySelector('time');
      t.tweetTime = timeEl?.getAttribute('datetime') || '';
      const link = timeEl?.closest('a[href*="/status/"]');
      if (link) {
        t.url = new URL(link.getAttribute('href'), location.origin).href;
      } else if (/\/status\/\d+/.test(location.pathname)) {
        t.url = location.origin + location.pathname.match(/^\/[^/]+\/status\/\d+/)[0];
      }
      t.mediaUrls = [
        ...[...article.querySelectorAll(SELECTORS.photo)].map(i => i.src),
        ...[...article.querySelectorAll('video')].map(v => v.poster)
      ].filter(Boolean);
    } catch (e) {
      // 解析失败降级:下面仍会尽量保存 URL
    }
    const m = (t.url || '').match(/\/status\/(\d+)/);
    t.id = m ? m[1] : 'unknown_' + Date.now();
    return t;
  }

  // ---------- 存储 ----------
  async function saveTweet(record) {
    const { tweets = [] } = await chrome.storage.local.get('tweets');
    const idx = tweets.findIndex(t => t.id === record.id);
    if (idx >= 0) tweets[idx] = { ...tweets[idx], ...record };
    else tweets.push(record);
    await chrome.storage.local.set({ tweets });
  }

  async function getExisting(id) {
    const { tweets = [] } = await chrome.storage.local.get('tweets');
    return tweets.find(t => t.id === id) || null;
  }

  function folderName(id) {
    return store.folders.find(f => f.id === id)?.name || '其他';
  }

  // ---------- 弹窗 ----------
  let card = null;       // 当前弹窗 { el, commit, cancel }
  let toastEl = null;

  function toast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.id = 'tm-toast';
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    setTimeout(() => { toastEl?.remove(); toastEl = null; }, 1800);
  }

  function closeCard() {
    if (!card) return;
    card.el.remove();
    document.removeEventListener('keydown', card.onKey, true);
    card = null;
  }

  function showCard(tweet, existing) {
    // 同时只允许一个弹窗:旧的静默保存后再开新的
    if (card) card.commit(true);

    const folders = [...store.folders].sort((a, b) => a.order - b.order);
    const autoFolderId = existing?.folderId || tmClassify(
      [tweet.text, tweet.authorName, tweet.authorHandle].join(' '), folders);
    const delay = Math.max(0, Number(store.settings.autoSaveDelay) || 0);

    const el = document.createElement('div');
    el.id = 'tm-card';
    el.innerHTML = `
      <div class="tm-row tm-head">
        <span class="tm-title">${existing ? '已收藏过,编辑记录' : '已收藏 · 归入'}</span>
        <span class="tm-count"></span>
      </div>
      <div class="tm-row">
        <select class="tm-folder"></select>
        <input class="tm-newname" placeholder="新文件夹名,回车创建" style="display:none">
      </div>
      <div class="tm-row">
        <input class="tm-note" placeholder="为什么收藏?(回车保存 / Esc 静默保存)">
      </div>
      <div class="tm-row tm-actions">
        <button class="tm-skip">不保存</button>
        <button class="tm-save">保存</button>
      </div>`;

    const sel = el.querySelector('.tm-folder');
    for (const f of folders) {
      const op = document.createElement('option');
      op.value = f.id; op.textContent = f.name;
      sel.appendChild(op);
    }
    const opNew = document.createElement('option');
    opNew.value = '__new__'; opNew.textContent = '➕ 新建文件夹…';
    sel.appendChild(opNew);
    sel.value = autoFolderId;

    const newInput = el.querySelector('.tm-newname');
    const note = el.querySelector('.tm-note');
    note.value = existing?.note || '';
    const countEl = el.querySelector('.tm-count');

    // 倒计时静默保存;用户一旦交互就取消倒计时
    let timer = null, left = delay;
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; countEl.textContent = ''; } }
    if (delay > 0 && !existing) {
      countEl.textContent = `${left}s 后自动保存`;
      timer = setInterval(() => {
        left--;
        if (left <= 0) { commit(true); }
        else countEl.textContent = `${left}s 后自动保存`;
      }, 1000);
    }
    el.addEventListener('pointerdown', stopTimer);
    el.addEventListener('input', stopTimer);
    el.addEventListener('keydown', stopTimer);
    el.addEventListener('compositionstart', stopTimer);

    async function createFolderIfNeeded() {
      if (sel.value !== '__new__') return sel.value;
      const name = newInput.value.trim();
      if (!name) return autoFolderId;
      const { folders: fs = store.folders } = await chrome.storage.local.get('folders');
      const existed = fs.find(f => f.name === name);
      if (existed) return existed.id;
      const nf = { id: 'f_' + Date.now(), name, keywords: [], order: fs.length };
      // 新文件夹插在 fallback 之前
      const fb = fs.find(f => f.fallback);
      if (fb) { nf.order = fb.order; fb.order = nf.order + 1; }
      fs.push(nf);
      await chrome.storage.local.set({ folders: fs });
      return nf.id;
    }

    async function commit(silent) {
      stopTimer();
      const folderId = silent && sel.value === '__new__' ? autoFolderId : await createFolderIfNeeded();
      const record = {
        ...tweet,
        folderId,
        note: note.value.trim(),
        savedTime: existing?.savedTime || new Date().toISOString()
      };
      closeCard();
      try {
        await saveTweet(record);
        toast(`✓ 已存入「${folderName(folderId)}」`);
      } catch (e) {
        toast('✗ 保存失败');
      }
    }

    function onKey(e) {
      if (!card) return;
      // 输入法(IME)组词期间的回车/Esc 是在选字/取消候选,不是对弹窗的指令
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); commit(true); }
      else if (e.key === 'Enter' && (e.target === note || e.target === newInput)) {
        e.stopPropagation(); e.preventDefault(); commit(false);
      }
    }

    sel.addEventListener('change', () => {
      stopTimer();
      const isNew = sel.value === '__new__';
      newInput.style.display = isNew ? '' : 'none';
      if (isNew) newInput.focus();
    });
    el.querySelector('.tm-save').addEventListener('click', () => commit(false));
    el.querySelector('.tm-skip').addEventListener('click', () => closeCard());
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(el);
    card = { el, commit, onKey };
    note.focus();
  }

  // ---------- 收藏处理(点击路径和网络钩子路径共用) ----------
  // 同一条推文两条路径可能先后触发(点按钮 → 点击监听先响,随后 X 发请求 → 钩子也响),5 秒内去重
  const recentlyHandled = new Map();
  function wasJustHandled(id) {
    const t = recentlyHandled.get(id);
    return t && Date.now() - t < 5000;
  }
  function markHandled(id) {
    recentlyHandled.set(id, Date.now());
    if (recentlyHandled.size > 100) {
      for (const [k, t] of recentlyHandled) if (Date.now() - t > 10000) recentlyHandled.delete(k);
    }
  }

  async function handleBookmark(tweet) {
    const existing = await getExisting(tweet.id);
    if (!store.settings.popupEnabled) {
      const folderId = existing?.folderId ||
        tmClassify([tweet.text, tweet.authorName, tweet.authorHandle].join(' '), store.folders);
      await saveTweet({ ...tweet, folderId, note: existing?.note || '',
        savedTime: existing?.savedTime || new Date().toISOString() });
      toast(`✓ 已存入「${folderName(folderId)}」`);
      return;
    }
    showCard(tweet, existing);
  }

  // 路径一(主力):page-hook.js 拦截到 CreateBookmark 请求
  // 覆盖一切收藏入口:按钮、分享菜单、快捷键 b……并且推文 ID 绝对准确
  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'tweetmark-hook' || d.type !== 'bookmark' || !d.tweetId) return;
    if (wasJustHandled(d.tweetId)) return;
    markHandled(d.tweetId);

    // 在页面上找这条推文的 article 节点解析内容:主时间链接精确匹配 ID
    let article = null;
    for (const timeEl of document.querySelectorAll('article time')) {
      const a = timeEl.closest('a[href*="/status/"]');
      if (a && a.href.includes('/status/' + d.tweetId)) { article = timeEl.closest('article'); break; }
    }
    // 详情页主推文的时间戳可能不是链接:当前 URL 就是这条推文时,取第一个 article
    if (!article && location.pathname.includes('/status/' + d.tweetId)) {
      article = document.querySelector('article');
    }

    let tweet;
    if (article) {
      tweet = parseTweet(article);
      tweet.id = d.tweetId;
      if (!tweet.url || !tweet.url.includes(d.tweetId)) tweet.url = `${location.origin}/i/status/${d.tweetId}`;
    } else {
      // 找不到节点:降级只存链接(/i/status/ 会自动跳转到原推)
      tweet = { id: d.tweetId, url: `${location.origin}/i/status/${d.tweetId}`, text: '',
        authorName: '', authorHandle: '', authorAvatar: '', mediaUrls: [], tweetTime: '' };
      toast('⚠ 未能解析推文内容,已保存链接');
    }
    handleBookmark(tweet);
  });

  // 路径二(备份):监听 Bookmark 按钮点击。若 X 改了 GraphQL 接口名导致钩子失效,这条仍然能用
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest?.(SELECTORS.bookmarkAdd);
    if (!btn) return;                       // removeBookmark(取消收藏)不处理
    const article = btn.closest(SELECTORS.article);
    if (!article) return;                   // 解析不到就交给钩子路径兜底
    const tweet = parseTweet(article);
    if (wasJustHandled(tweet.id)) return;
    markHandled(tweet.id);
    handleBookmark(tweet);
  }, true);
})();

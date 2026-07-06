// TweetMark 主世界钩子(world: MAIN, document_start)
// 拦截 X 的 CreateBookmark GraphQL 请求:无论收藏来自按钮、菜单还是快捷键 b,
// 最终都会发这个请求,比监听按钮点击可靠得多,且能直接拿到推文 ID。
// 通过 window.postMessage 通知 isolated world 的 content.js。
(() => {
  if (window.__tmHooked) return;
  window.__tmHooked = true;

  function report(body) {
    try {
      const id = JSON.parse(body)?.variables?.tweet_id;
      if (id) {
        console.debug('[TweetMark] bookmark detected:', id);
        window.postMessage({ source: 'tweetmark-hook', type: 'bookmark', tweetId: String(id) }, '*');
      }
    } catch (e) { /* 忽略解析失败 */ }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.includes('CreateBookmark')) {
        if (typeof init?.body === 'string') report(init.body);
        else if (input instanceof Request) input.clone().text().then(report);
      }
    } catch (e) { /* 钩子出错不能影响原请求 */ }
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tmUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (String(this.__tmUrl).includes('CreateBookmark') && typeof body === 'string') report(body);
    } catch (e) { /* 同上 */ }
    return origSend.apply(this, arguments);
  };
})();

// TweetMark 共享默认配置与关键词匹配逻辑
// 被 content script、管理页、service worker 共用

const TM_DEFAULT_FOLDERS = [
  { id: 'f_ai', name: 'AI', order: 0,
    keywords: ['AI', 'GPT', 'Claude', 'LLM', '大模型', 'prompt', 'agent', '机器学习', 'ChatGPT', 'OpenAI', 'Anthropic'] },
  { id: 'f_course', name: '课程', order: 1,
    keywords: ['课程', '教程', 'tutorial', 'course', '学习', 'how to', '入门', 'guide', '干货'] },
  { id: 'f_stock', name: '股票', order: 2,
    keywords: ['股票', '美股', 'stock', '财报', 'earnings', '仓位', '投资', '/\\$[A-Za-z]{1,6}\\b/'] },
  { id: 'f_other', name: '其他', order: 3, keywords: [], fallback: true }
];

const TM_DEFAULT_SETTINGS = { autoSaveDelay: 5, popupEnabled: true };

// 关键词匹配:
// - "/.../" 包裹 → 按正则匹配(如 /\$[A-Za-z]{1,6}\b/ 匹配美股 ticker)
// - 纯 ASCII 词 → 按整词匹配(避免 "AI" 误中 "email"、"rain")
// - 含中文等 → 按子串匹配
function tmKeywordMatch(text, kw) {
  if (!kw) return false;
  try {
    if (kw.length > 2 && kw.startsWith('/') && kw.endsWith('/')) {
      return new RegExp(kw.slice(1, -1), 'i').test(text);
    }
    if (/^[\x20-\x7E]+$/.test(kw)) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
    }
    return text.toLowerCase().includes(kw.toLowerCase());
  } catch (e) {
    return false;
  }
}

// 返回命中的文件夹 id;无命中时返回 fallback 文件夹
function tmClassify(text, folders) {
  const sorted = [...folders].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    for (const kw of (f.keywords || [])) {
      if (tmKeywordMatch(text, kw)) return f.id;
    }
  }
  const fb = sorted.find(f => f.fallback) || sorted[sorted.length - 1];
  return fb ? fb.id : null;
}

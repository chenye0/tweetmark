// TweetMark service worker:点插件图标打开管理页(已开则聚焦),安装时初始化默认数据
importScripts('defaults.js');

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['folders', 'settings']);
  if (!data.folders || !data.folders.length) {
    await chrome.storage.local.set({
      folders: TM_DEFAULT_FOLDERS,
      settings: TM_DEFAULT_SETTINGS,
      tweets: data.tweets || []
    });
  }
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('manage.html');
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
});

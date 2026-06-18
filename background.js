// 拡張ボタンが押されたら、アクティブタブの content script にトグル通知を送る。
// content script が（chrome:// など特殊ページで）読み込まれていない場合に備えて、
// 必要なら scripting で注入してから再送する。

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "WHAAAA_TOGGLE" });
  } catch (err) {
    // content script が未注入のページ。明示的に注入してから再送。
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "WHAAAA_TOGGLE" });
    } catch (e) {
      // chrome:// や Web Store などは注入不可。何もできない。
      console.warn("whaaaa: このページでは利用できません。", e);
    }
  }
});

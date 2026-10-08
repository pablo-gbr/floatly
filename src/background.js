chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (isRestrictedUrl(tab.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/floatly.js"]
    });
  } catch (error) {
    if (!isExpectedInjectionFailure(error)) {
      console.debug("Floatly skipped this page.", error);
    }
  }
});

function isRestrictedUrl(url = "") {
  return /^(chrome|chrome-extension|edge|about|devtools):/i.test(url);
}

function isExpectedInjectionFailure(error) {
  return /cannot access|extensions gallery|chrome:|edge:|about:|cannot be scripted|missing host permission/i.test(String(error?.message ?? error));
}

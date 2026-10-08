chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (isRestrictedUrl(tab.url)) return;

  try {
    const adapterIds = await loadAdapterIds();

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "src/adapters/registry.js",
        ...adapterIds.map((id) => `src/adapters/${id}/adapter.js`),
        "src/floatly.js"
      ]
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

async function loadAdapterIds() {
  const response = await fetch(chrome.runtime.getURL("src/adapters/adapters.json"));
  if (!response.ok) return [];

  const adapterIds = await response.json();
  return Array.isArray(adapterIds) ? adapterIds : [];
}

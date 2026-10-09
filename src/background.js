chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (isRestrictedUrl(tab.url)) return;

  try {
    const adapterIds = await loadAdapterIds();
    if (isYouTubeUrl(tab.url)) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/adapters/youtube/quality-bridge.js"],
        world: "MAIN"
      });
    }

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

function isYouTubeUrl(url = "") {
  try {
    const { hostname } = new URL(url);
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
  } catch {
    return false;
  }
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

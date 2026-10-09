let cachedSettings = {};
chrome.storage.sync.get({ floatlySettings: {} }).then(({ floatlySettings }) => {
  cachedSettings = floatlySettings;
}).catch((error) => console.error("Floatly settings preload failed.", error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.floatlySettings) cachedSettings = changes.floatlySettings.newValue ?? {};
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  if (isRestrictedUrl(tab.url)) return;

  try {
    // requestWindow must run in the first injection, while the toolbar click is still active.
    const [opening] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (settings) => {
        if (!("documentPictureInPicture" in window)) return false;
        const state = (window.__floatlyState ??= {});
        if (state.opening || state.preparing) return false;
        if (state.restore) {
          const pip = state.pip;
          if (state.restore()) pip?.close();
          return false;
        }
        const video = document.querySelector(".html5-main-video") ?? document.querySelector("video");
        if (!video) return true;
        state.preparing = true;
        try {
          state.pendingPiP = await documentPictureInPicture.requestWindow(
            settings.rememberWindowSize && settings.windowSize ? settings.windowSize : {
              width: Math.max(420, Math.min(900, video.videoWidth || 640)),
              height: Math.max(236, Math.min(520, video.videoHeight || 360)),
            },
          );
          return true;
        } catch (error) {
          state.preparing = false;
          throw error;
        }
      },
      args: [cachedSettings],
    });
    if (!opening?.result) return;
    const adapterIds = await loadAdapterIds();
    const response = await fetch(chrome.runtime.getURL("src/floatly.css"));
    if (!response.ok) throw new Error("Could not load Floatly styles.");
    const css = await response.text();
    const { floatlySettings: settings } = await chrome.storage.sync.get({ floatlySettings: {} });
    const commandEvent = `floatly-command-${crypto.randomUUID()}`;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: installSettingsBridge,
      args: [commandEvent],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (data) => { window.__floatlyBootstrap = data; },
      args: [{ css, settings, commandEvent }],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: [
        "src/adapters/registry.js",
        ...adapterIds.map((id) => `src/adapters/${id}/adapter.js`),
        "src/floatly.js"
      ]
    });
  } catch (error) {
    if (!isExpectedInjectionFailure(error)) {
      console.error("Floatly injection failed.", error);
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          const state = window.__floatlyState;
          state?.pendingPiP?.close();
          if (state) { state.pendingPiP = null; state.preparing = false; }
        },
      });
    } catch (cleanupError) {
      if (!isExpectedInjectionFailure(cleanupError)) console.error("Floatly pending PiP cleanup failed.", cleanupError);
    }
  }
});

function installSettingsBridge(commandEvent) {
  window.__floatlySettingsBridgeCleanup?.();
  const saveSize = async (event) => {
    // Page-world messages are untrusted: accept only bounded dimensions, never settings or API names.
    const data = event.detail;
    if (event.target === document && data?.command === "dispose") {
      window.__floatlySettingsBridgeCleanup();
      return;
    }
    if (event.target !== document || data?.command !== "saveWindowSize"
        || !Number.isInteger(data.width) || !Number.isInteger(data.height)
        || data.width < 1 || data.width > 10000 || data.height < 1 || data.height > 10000) return;
    try {
      const { floatlySettings: settings } = await chrome.storage.sync.get({ floatlySettings: {} });
      if (!settings.rememberWindowSize) return;
      await chrome.storage.sync.set({ floatlySettings: {
        ...settings, windowSize: { width: data.width, height: data.height },
      } });
    } catch (error) {
      console.error("Floatly window-size persistence failed.", error);
    }
  };
  document.addEventListener(commandEvent, saveSize);
  window.__floatlySettingsBridgeCleanup = () => document.removeEventListener(commandEvent, saveSize);
}

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

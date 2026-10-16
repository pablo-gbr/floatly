const extension = globalThis.browser ?? globalThis.chrome;

let cachedSettings = {};
extension.storage.sync.get({ floatlySettings: {} }).then(({ floatlySettings }) => {
  cachedSettings = floatlySettings;
}).catch((error) => console.error("Floatly settings preload failed.", error));
extension.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.floatlySettings) cachedSettings = changes.floatlySettings.newValue ?? {};
});

extension.runtime.onInstalled.addListener(async () => {
  try {
    await extension.contextMenus.removeAll();
    extension.contextMenus.create({
      id: "floatly-open-pip",
      title: extension.i18n.getMessage("openInPip"),
      contexts: ["page", "video", "image", "link", "selection", "editable", "frame"],
      documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"],
    }, () => {
      if (extension.runtime.lastError) console.error("Floatly context menu setup failed.", extension.runtime.lastError);
    });
  } catch (error) {
    console.error("Floatly context menu setup failed.", error);
  }
});

extension.action.onClicked.addListener(openPiP);
extension.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "floatly-open-pip") return openPiP(tab);
});

async function openPiP(tab) {
  if (!tab?.id) return;
  if (isRestrictedUrl(tab.url)) return;

  try {
    // requestWindow must run in the first injection, while the toolbar or menu click is still active.
    const [opening] = await extension.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      injectImmediately: true,
      func: async (settings) => {
        if (!("documentPictureInPicture" in window)) {
          throw new Error("Floatly requires Document Picture-in-Picture (Chrome 121+ or Firefox 151+ on desktop).");
        }
        const state = (window.__floatlyState ??= {});
        if (state.opening || state.preparing) return false;
        if (state.cancelPicker) {
          state.cancelPicker();
          return false;
        }
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
    if (opening && "error" in opening) throw opening.error;
    if (!opening?.result) return;
    const adapterIds = await loadAdapterIds();
    const response = await fetch(extension.runtime.getURL("src/floatly.css"));
    if (!response.ok) throw new Error("Could not load Floatly styles.");
    const css = await response.text();
    const { floatlySettings: settings } = await extension.storage.sync.get({ floatlySettings: {} });
    const catalogResponse = await fetch(extension.runtime.getURL("_locales/en/messages.json"));
    if (!catalogResponse.ok) throw new Error("Could not load Floatly message catalog.");
    const catalog = await catalogResponse.json();
    const messages = Object.fromEntries(Object.keys(catalog).map((key) => [key, extension.i18n.getMessage(key)]));
    const language = extension.i18n.getUILanguage();
    const direction = extension.i18n.getMessage("@@bidi_dir");
    const commandEvent = `floatly-command-${crypto.randomUUID()}`;

    for (const injection of [{
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: installSettingsBridge,
      args: [commandEvent],
    }, {
      target: { tabId: tab.id },
      world: "MAIN",
      func: (data) => { window.__floatlyBootstrap = data; },
      args: [{ css, settings, commandEvent, messages, language, direction }],
    }, {
      target: { tabId: tab.id },
      world: "MAIN",
      files: [
        "src/adapters/registry.js",
        ...adapterIds.map((id) => `src/adapters/${id}/adapter.js`),
        "src/floatly.js"
      ]
    }]) {
      const results = await extension.scripting.executeScript(injection);
      const failure = results.find((result) => "error" in result);
      if (failure) throw failure.error;
    }
  } catch (error) {
    if (!isExpectedInjectionFailure(error)) {
      console.error("Floatly injection failed.", error);
    }
    try {
      const results = await extension.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: () => {
          const state = window.__floatlyState;
          state?.pendingPiP?.close();
          if (state) { state.pendingPiP = null; state.preparing = false; }
        },
      });
      const failure = results.find((result) => "error" in result);
      if (failure) throw failure.error;
    } catch (cleanupError) {
      if (!isExpectedInjectionFailure(cleanupError)) console.error("Floatly pending PiP cleanup failed.", cleanupError);
    }
  }
}

function installSettingsBridge(commandEvent) {
  // Injected functions cannot capture the background page's extension API alias.
  const extension = globalThis.browser ?? globalThis.chrome;
  window.__floatlySettingsBridgeCleanup?.();
  const saveSize = async (event) => {
    // Page-world messages are untrusted: accept only bounded dimensions, never settings or API names.
    if (event.target !== document || typeof event.detail !== "string" || event.detail.length > 1024) return;
    let data;
    try { data = JSON.parse(event.detail); } catch { return; }
    if (data?.command === "dispose") {
      window.__floatlySettingsBridgeCleanup();
      return;
    }
    if (data?.command !== "saveWindowSize"
        || !Number.isInteger(data.width) || !Number.isInteger(data.height)
        || data.width < 1 || data.width > 10000 || data.height < 1 || data.height > 10000) return;
    try {
      const { floatlySettings: settings } = await extension.storage.sync.get({ floatlySettings: {} });
      if (!settings.rememberWindowSize) return;
      await extension.storage.sync.set({ floatlySettings: {
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
  return /^(chrome|chrome-extension|moz-extension|resource|edge|about|devtools|view-source):/i.test(url);
}

function isExpectedInjectionFailure(error) {
  return /cannot access|extensions gallery|chrome:|edge:|about:|cannot be scripted|missing host permission/i.test(String(error?.message ?? error));
}

async function loadAdapterIds() {
  const response = await fetch(extension.runtime.getURL("src/adapters/adapters.json"));
  if (!response.ok) return [];

  const adapterIds = await response.json();
  return Array.isArray(adapterIds) ? adapterIds : [];
}

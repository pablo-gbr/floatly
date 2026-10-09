(() => {
  const state = (window.__floatlyState ??= {});
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const defaultSettings = {
    accentColor: "#45d19f",
    clickVideoToTogglePlayback: true,
    rememberWindowSize: false,
    windowSize: null,
    speedSteps: rates,
    shortcuts: {
      playPause: " ",
      rewind: "ArrowLeft",
      forward: "ArrowRight",
      volumeUp: "ArrowUp",
      volumeDown: "ArrowDown",
    },
    controls: {
      progress: true,
      rewind: true,
      forward: true,
      speed: true,
      volume: true,
      fit: true,
      time: true,
    },
  };

  if ("documentPictureInPicture" in window && documentPictureInPicture.window) {
    state.restore?.();
    documentPictureInPicture.window.close();
    return;
  }

  async function main() {
    if (!("documentPictureInPicture" in window)) {
      return;
    }

    const adapter = window.FloatlyAdapters?.match() ?? {};
    const video = findVideo(adapter);
    const [css, settings] = await Promise.all([loadCss(), loadSettings()]);
    if (!video) return openSelectedElementPiP(css);

    const restore = {
      className: video.className,
      style: video.getAttribute("style"),
      host: video.parentElement,
      nextSibling: video.nextSibling,
      marker: document.createComment("floatly-video-placeholder"),
      getParent: adapter.getRestoreParent,
      getNextSibling: adapter.getRestoreNextSibling,
      beforeRestore: adapter.beforeRestore,
      onRestored: adapter.onRestored,
    };
    restore.host?.insertBefore(restore.marker, restore.nextSibling);
    let pip;
    try {
      pip = await documentPictureInPicture.requestWindow(
        getWindowSize(video, settings),
      );
    } catch (error) {
      restore.marker.remove();
      throw error;
    }
    const cleanup = [];

    state.pip = pip;
    const context = renderPlayer(pip, video, css, settings, adapter, cleanup);
    adapter.onEnter?.(context);
    let restored = false;
    const restorePiP = () => {
      if (restored) return;

      restored = true;
      try {
        const afterRestore = restore.beforeRestore?.(context);
        restoreNode(video, restore);
        runCleanup([...cleanup, () => adapter.onExit?.(context)]);
        afterRestore?.();
      } finally {
        state.pip = null;
        state.restore = null;
      }
    };
    state.restore = restorePiP;

    pip.addEventListener("pagehide", restorePiP, { once: true });
    pip.addEventListener("unload", restorePiP, { once: true });
  }

  async function openSelectedElementPiP(css) {
    const target = await pickElement();
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const restore = {
      className: target.className,
      style: target.getAttribute("style"),
      host: target.parentElement,
      nextSibling: target.nextSibling,
      marker: document.createComment("floatly-element-placeholder"),
    };
    restore.host?.insertBefore(restore.marker, restore.nextSibling);
    let pip;
    try {
      pip = await documentPictureInPicture.requestWindow({
        width: Math.max(360, Math.min(900, Math.round(rect.width || 640))),
        height: Math.max(240, Math.min(700, Math.round(rect.height || 420))),
      });
    } catch (error) {
      restore.marker.remove();
      throw error;
    }
    const shell = el(pip.document, "main", {
      className: "floatly-shell floatly-element-shell",
    });

    copyPageStyles(pip.document);
    pip.document.head.appendChild(
      el(pip.document, "style", { textContent: css }),
    );
    target.classList.add("floatly-selected-element");
    shell.append(target);
    pip.document.body.append(shell);
    state.pip = pip;

    pip.addEventListener(
      "pagehide",
      () => {
        try {
          restoreNode(target, restore);
        } finally {
          state.pip = null;
        }
      },
      { once: true },
    );
  }

  function restoreNode(node, restore) {
    const markerParent = restore.marker.parentNode;
    const liveParent = restore.getParent?.();
    const parent =
      (liveParent?.isConnected ? liveParent : null) ??
      markerParent ??
      (restore.host?.isConnected ? restore.host : null) ??
      liveParent ??
      restore.host;

    node.className = restore.className;
    restore.style === null
      ? node.removeAttribute("style")
      : node.setAttribute("style", restore.style);
    parent?.insertBefore(
      node,
      parent === markerParent ? restore.marker : restore.getNextSibling?.(),
    );
    restore.marker.remove();
    restore.onRestored?.(node);
  }

  function runCleanup(cleanup) {
    while (cleanup.length) {
      try {
        cleanup.pop()?.();
      } catch (error) {
        console.debug("Floatly cleanup failed.", error);
      }
    }
  }

  function pickElement() {
    return new Promise((resolve) => {
      const candidates = [];
      let current = null;
      let candidateIndex = 0;
      let locked = false;
      const overlay = el(document, "div", {
        className: "floatly-picker-overlay",
      });
      const panel = el(document, "div", { className: "floatly-picker-panel" });
      const warning = el(document, "div", {
        className: "floatly-picker-warning",
        textContent:
          "Element PiP is experimental; selected elements may not stay interactive.",
      });
      const label = el(document, "div", { className: "floatly-picker-label" });
      const pick = el(document, "button", {
        type: "button",
        textContent: "Pick",
      });
      const parent = el(document, "button", {
        type: "button",
        textContent: "Parent",
      });
      const child = el(document, "button", {
        type: "button",
        textContent: "Child",
      });
      const cancel = el(document, "button", {
        type: "button",
        textContent: "Cancel",
      });

      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483646;
        box-sizing: border-box;
        border: 2px solid #45d19f;
        background: rgb(69 209 159 / 0.12);
        pointer-events: none;
        transform: translate(-9999px, -9999px);
      `;
      panel.style.cssText = `
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483647;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto auto auto;
        align-items: center;
        gap: 8px;
        max-width: min(620px, calc(100vw - 28px));
        padding: 10px;
        border-radius: 8px;
        color: #f7f7f7;
        background: rgb(16 18 21 / 0.96);
        box-shadow: 0 10px 32px rgb(0 0 0 / 0.35);
        font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      `;
      label.style.cssText = `
        min-width: 0;
        grid-column: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      warning.style.cssText = `
        grid-column: 1 / -1;
        color: #f6c96b;
        font-size: 12px;
      `;
      for (const button of [pick, parent, child, cancel]) {
        button.style.cssText = `
          height: 30px;
          padding: 0 10px;
          border: 1px solid rgb(255 255 255 / 0.18);
          border-radius: 6px;
          color: inherit;
          background: rgb(255 255 255 / 0.08);
          cursor: pointer;
        `;
      }
      panel.append(warning, label, pick, parent, child, cancel);

      function cleanup(value = null) {
        overlay.remove();
        panel.remove();
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        resolve(value);
      }

      function onMove(event) {
        if (locked) return;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (!isPickable(target)) return;

        setCurrent(target);
      }

      function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.target === pick) return cleanup(current);
        if (event.target === parent) return selectRelative(1);
        if (event.target === child) return selectRelative(-1);
        if (event.target === cancel) return cleanup();

        locked = true;
        panel.hidden = false;
      }

      function onKeyDown(event) {
        if (event.key === "Enter" && locked) {
          event.preventDefault();
          event.stopPropagation();
          cleanup(current);
          return;
        }

        if (event.key === "ArrowUp" && locked) {
          event.preventDefault();
          event.stopPropagation();
          selectRelative(1);
          return;
        }

        if (event.key === "ArrowDown" && locked) {
          event.preventDefault();
          event.stopPropagation();
          selectRelative(-1);
          return;
        }

        if (event.key !== "Escape") return;

        event.preventDefault();
        event.stopPropagation();
        cleanup();
      }

      function selectRelative(offset) {
        if (!candidates.length) return;

        candidateIndex = Math.max(
          0,
          Math.min(candidates.length - 1, candidateIndex + offset),
        );
        current = candidates[candidateIndex];
        drawOverlay(current);
      }

      function setCurrent(target) {
        current = target;
        candidates.length = 0;
        for (let node = target; isPickable(node); node = node.parentElement) {
          candidates.push(node);
        }
        candidateIndex = 0;
        drawOverlay(current);
      }

      function drawOverlay(target) {
        const rect = target.getBoundingClientRect();
        overlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        label.textContent = describeElement(target);
        parent.disabled = candidateIndex >= candidates.length - 1;
        child.disabled = candidateIndex <= 0;
      }

      function isPickable(target) {
        return (
          target instanceof Element &&
          target !== document.body &&
          target !== document.documentElement &&
          target !== overlay &&
          target !== panel &&
          !panel.contains(target)
        );
      }

      function describeElement(target) {
        const id = target.id ? `#${target.id}` : "";
        const classes = [...target.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join("");
        return `${target.tagName.toLowerCase()}${id}${classes}`;
      }

      document.body.append(overlay);
      document.body.append(panel);
      panel.hidden = true;
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    });
  }

  function copyPageStyles(targetDocument) {
    for (const node of document.querySelectorAll(
      'link[rel~="stylesheet"], style',
    )) {
      const clone = node.cloneNode(true);
      if (clone.href)
        clone.href = new URL(clone.getAttribute("href"), document.baseURI).href;
      targetDocument.head.append(clone);
    }
  }

  function findVideo(adapter) {
    const customVideo = adapter.findVideo?.();
    if (customVideo) return customVideo;

    const videos = [...document.querySelectorAll("video")]
      .filter((video) => video.readyState > 0 && !video.disablePictureInPicture)
      .sort((a, b) => area(b) - area(a));

    return videos[0] ?? null;
  }

  function area(video) {
    const box = video.getBoundingClientRect();
    return box.width * box.height;
  }

  async function loadCss() {
    const response = await fetch(chrome.runtime.getURL("src/floatly.css"));
    if (!response.ok) throw new Error("Could not load Floatly styles.");
    return response.text();
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get({
      floatlySettings: defaultSettings,
    });
    return mergeSettings(stored.floatlySettings);
  }

  function mergeSettings(settings) {
    return {
      ...defaultSettings,
      ...settings,
      controls: {
        ...defaultSettings.controls,
        ...settings?.controls,
      },
      shortcuts: {
        ...defaultSettings.shortcuts,
        ...settings?.shortcuts,
      },
    };
  }

  function getWindowSize(video, settings) {
    if (settings.rememberWindowSize && settings.windowSize) {
      return settings.windowSize;
    }

    return {
      width: Math.max(420, Math.min(900, video.videoWidth || 640)),
      height: Math.max(236, Math.min(520, video.videoHeight || 360)),
    };
  }

  function renderPlayer(pip, video, css, settings, adapter, cleanup) {
    pip.document.head.appendChild(
      el(pip.document, "style", {
        textContent: `${css}\n${adapter.styles ?? ""}`,
      }),
    );
    pip.document.documentElement.style.setProperty(
      "--floatly-accent",
      settings.accentColor,
    );

    const shell = el(pip.document, "main", { className: "floatly-shell" });
    const controls = el(pip.document, "div", { className: "floatly-controls" });
    const progress = el(pip.document, "input", {
      className: "floatly-range floatly-progress",
      type: "range",
      min: "0",
      max: "1000",
      value: "0",
      title: "Seek",
    });
    const row = el(pip.document, "div", { className: "floatly-row" });
    const play = button(pip.document, "Play / pause", icons.play);
    const rewind = button(pip.document, "Rewind 10 seconds", icons.rewind);
    const forward = button(pip.document, "Forward 10 seconds", icons.forward);
    const speed = button(pip.document, "Playback speed", icons.speed);
    const speedMenu = speedSelector(pip.document, video, settings.speedSteps);
    const mute = button(
      pip.document,
      "Mute / unmute",
      video.muted ? icons.muted : icons.volume,
    );
    const volume = el(pip.document, "input", {
      className: "floatly-range floatly-volume",
      type: "range",
      min: "0",
      max: "100",
      value: String(Math.round(video.volume * 100)),
      title: "Volume",
    });
    const fit = button(pip.document, "Crop / fit video", icons.crop);
    const next = button(pip.document, "Next video", icons.next);
    const time = el(pip.document, "span", {
      className: "floatly-time",
      textContent: "0:00",
    });
    const controlsConfig = {
      ...settings.controls,
      ...adapter.controls,
    };
    const context = {
      pip,
      video,
      shell,
      controls,
      row,
      progress,
      addCleanup(fn) {
        cleanup.push(fn);
      },
    };

    video.classList.add("floatly-video");
    row.append(play);
    appendIf(row, controlsConfig.rewind, rewind);
    appendIf(row, controlsConfig.forward, forward);
    if (controlsConfig.speed) row.append(speed, speedMenu);
    appendIf(row, controlsConfig.next, next);
    row.append(mute);
    appendIf(row, controlsConfig.volume, volume);
    appendIf(row, controlsConfig.fit, fit);
    appendIf(row, controlsConfig.time, time);
    appendIf(controls, controlsConfig.progress, progress);
    controls.append(row);
    shell.append(video, controls);
    pip.document.body.append(shell);

    if (settings.clickVideoToTogglePlayback) {
      shell.addEventListener("click", (event) => {
        if (controls.contains(event.target)) return;
        video.paused ? video.play() : video.pause();
      });
    }

    play.addEventListener("click", () =>
      video.paused ? video.play() : video.pause(),
    );
    rewind.addEventListener("click", () => seekBy(context, -10, adapter));
    forward.addEventListener("click", () => seekBy(context, 10, adapter));
    speed.addEventListener("click", () => speedMenu.toggleAttribute("hidden"));
    next.addEventListener("click", () => adapter.nextVideo?.(context));
    mute.addEventListener("click", () => {
      video.muted = !video.muted;
    });
    fit.addEventListener("click", () => {
      video.classList.toggle("floatly-video-fill");
      fit.setAttribute(
        "aria-pressed",
        String(video.classList.contains("floatly-video-fill")),
      );
    });
    progress.addEventListener("input", () => {
      const duration = getDuration(context, adapter);
      if (Number.isFinite(duration))
        seekTo(context, (progress.valueAsNumber / 1000) * duration, adapter);
    });
    volume.addEventListener("input", () => {
      video.volume = volume.valueAsNumber / 100;
      video.muted = video.volume === 0;
    });
    pip.addEventListener("keydown", (event) =>
      handleKeys(event, context, settings.shortcuts, adapter),
    );
    pip.addEventListener("resize", () => {
      resizeVideoToWindow(pip, video);
      saveWindowSize(pip, settings);
    });

    const sync = () => {
      play.innerHTML = video.paused ? icons.play : icons.pause;
      mute.innerHTML =
        video.muted || video.volume === 0 ? icons.muted : icons.volume;
      volume.value = String(video.muted ? 0 : Math.round(video.volume * 100));
      setRangeFill(volume, video.muted ? 0 : video.volume * 100);
      const duration = getDuration(context, adapter);
      progress.disabled = !Number.isFinite(duration);
      if (Number.isFinite(duration)) {
        progress.value = String(
          Math.round((video.currentTime / duration) * 1000),
        );
        setRangeFill(progress, progress.valueAsNumber / 10);
      }
      time.textContent = `${formatTime(video.currentTime)}${Number.isFinite(duration) ? ` / ${formatTime(duration)}` : ""}`;
      markCurrentRate(speedMenu, video.playbackRate);
      resizeVideoToWindow(pip, video);
    };

    [
      "play",
      "pause",
      "volumechange",
      "timeupdate",
      "durationchange",
      "ratechange",
      "loadedmetadata",
    ].forEach((name) => {
      video.addEventListener(name, sync);
    });
    sync();
    return context;
  }

  function button(document, title, icon) {
    const element = el(document, "button", {
      className: "floatly-button",
      type: "button",
      title,
      ariaLabel: title,
    });
    element.innerHTML = icon;
    return element;
  }

  function appendIf(parent, shouldAppend, child) {
    if (shouldAppend) parent.append(child);
  }

  function speedSelector(document, video, speedSteps) {
    const menu = el(document, "div", {
      className: "floatly-speed-menu",
      hidden: true,
    });

    for (const rate of speedSteps.length ? speedSteps : rates) {
      const item = el(document, "button", {
        className: "floatly-speed-option",
        type: "button",
        textContent: rate === 1 ? "Normal" : `${rate}x`,
      });
      item.dataset.rate = String(rate);
      item.addEventListener("click", () => {
        video.playbackRate = rate;
        menu.hidden = true;
      });
      menu.append(item);
    }

    return menu;
  }

  function markCurrentRate(menu, rate) {
    for (const item of menu.querySelectorAll(".floatly-speed-option")) {
      item.setAttribute(
        "aria-checked",
        String(Math.abs(Number(item.dataset.rate) - rate) < 0.01),
      );
    }
  }

  function seekBy(context, seconds, adapter) {
    if (adapter.seekBy?.(context, seconds)) return;

    context.video.currentTime = Math.max(
      0,
      Math.min(
        getDuration(context, adapter) || Infinity,
        context.video.currentTime + seconds,
      ),
    );
  }

  function seekTo(context, seconds, adapter) {
    if (adapter.seekTo?.(context, seconds)) return;

    context.video.currentTime = Math.max(
      0,
      Math.min(getDuration(context, adapter) || Infinity, seconds),
    );
  }

  function getDuration(context, adapter) {
    return adapter.getDuration?.(context) ?? context.video.duration;
  }

  function resizeVideoToWindow(pip, video) {
    video.style.width = `${pip.innerWidth}px`;
    video.style.height = `${pip.innerHeight}px`;
  }

  function setRangeFill(input, percent) {
    input.style.setProperty(
      "--floatly-fill",
      `${Math.max(0, Math.min(100, percent))}%`,
    );
  }

  function saveWindowSize(pip, settings) {
    if (!settings.rememberWindowSize) return;

    chrome.storage.sync.set({
      floatlySettings: {
        ...settings,
        windowSize: {
          width: pip.innerWidth,
          height: pip.innerHeight,
        },
      },
    });
  }

  function handleKeys(event, context, shortcuts, adapter) {
    if (event.key === shortcuts.playPause) {
      context.video.paused ? context.video.play() : context.video.pause();
    } else if (event.key === shortcuts.rewind) {
      seekBy(context, -10, adapter);
    } else if (event.key === shortcuts.forward) {
      seekBy(context, 10, adapter);
    } else if (event.key === shortcuts.volumeUp) {
      context.video.volume = Math.min(1, context.video.volume + 0.1);
    } else if (event.key === shortcuts.volumeDown) {
      context.video.volume = Math.max(0, context.video.volume - 0.1);
    } else {
      return;
    }

    event.preventDefault();
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainder = String(safeSeconds % 60).padStart(2, "0");
    if (hours > 0)
      return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
    return `${minutes}:${remainder}`;
  }

  function el(document, tag, props = {}) {
    return Object.assign(document.createElement(tag), props);
  }

  const iconAttrs =
    'width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"';
  const icons = {
    play: `<svg ${iconAttrs}><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg ${iconAttrs}><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>`,
    rewind: `<svg ${iconAttrs}><path d="M11 18V6l-8.5 6zm1.5-6 8.5 6V6z"/></svg>`,
    forward: `<svg ${iconAttrs}><path d="M13 6v12l8.5-6zM2.5 18 11 12 2.5 6z"/></svg>`,
    next: `<svg ${iconAttrs}><path d="M6 18l8.5-6L6 6zm10-12h2v12h-2z"/></svg>`,
    speed: `<svg ${iconAttrs}><path d="M12 4a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 4m0 2a8 8 0 0 1 7.45 11H4.55A8 8 0 0 1 12 6m1 7.59 3.54-3.55 1.42 1.42L13 16.41l-3.54-3.53 1.42-1.42z"/></svg>`,
    volume: `<svg ${iconAttrs}><path d="M4 9v6h4l5 4V5L8 9zm11.5-.5v7a4 4 0 0 0 0-7m0-3.5v2.1a6 6 0 0 1 0 9.8V19a8 8 0 0 0 0-14"/></svg>`,
    muted: `<svg ${iconAttrs}><path d="M4 9v6h4l5 4V5L8 9zm13.59 3-2.3-2.29 1.42-1.42L19 10.59l2.29-2.3 1.42 1.42L20.41 12l2.3 2.29-1.42 1.42L19 13.41l-2.29 2.3-1.42-1.42z"/></svg>`,
    crop: `<svg ${iconAttrs}><path d="M7 3h2v4h8v8h4v2h-4v4h-2v-4H7V9H3V7h4zm2 6v6h6V9z"/></svg>`,
  };

  main().catch(() => {});
})();

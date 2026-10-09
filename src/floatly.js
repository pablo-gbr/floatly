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

  const bootstrap = window.__floatlyBootstrap;
  delete window.__floatlyBootstrap;
  const pendingPiP = state.pendingPiP;
  state.pendingPiP = null;
  state.preparing = false;

  if (state.opening) return;
  if (state.restore) {
    const pip = state.pip;
    if (state.restore()) pip?.close();
    return;
  }

  async function main() {
    if (!("documentPictureInPicture" in window)) {
      return;
    }

    if (!bootstrap || typeof bootstrap.css !== "string") {
      throw new Error("Floatly isolated bootstrap is missing.");
    }
    const { css } = bootstrap;
    const settings = mergeSettings(bootstrap.settings);
    let adapter;
    let video;
    try {
      adapter = window.FloatlyAdapters?.match() ?? {};
      video = findVideo(adapter);
      if (video && !(video instanceof HTMLVideoElement)) {
        throw new TypeError("Adapter must return the original HTMLVideoElement.");
      }
    } catch (error) {
      console.error("Floatly adapter detection failed.", error);
      throw error;
    }
    if (!video) {
      pendingPiP?.close();
      return openSelectedElementPiP(css);
    }

    const cleanup = [];
    let context;
    const restorePiP = prepareRestoration(video, adapter, cleanup, () => context);
    let pip;
    let stage = "opening PiP";
    state.opening = true;
    try {
      logVideo("before relocation", video, null);
      if (pendingPiP?.closed) throw new Error("PiP was closed before player setup completed.");
      pip = pendingPiP ?? await documentPictureInPicture.requestWindow(getWindowSize(video, settings));
      state.pip = pip;
      registerLifecycle(pip, restorePiP, cleanup);
      stage = "rendering player / relocating video";
      context = renderPlayer(pip, video, css, settings, adapter, cleanup);
      if (!video.isConnected || video.ownerDocument !== pip.document
          || context.shell.querySelector("video") !== video) {
        throw new Error("Original video was not connected to the PiP document.");
      }
      logVideo("after relocation and resize", video, pip);
      stage = `entering adapter ${adapter.id ?? "generic"}`;
      cleanup.push(() => adapter.onExit?.(context));
      await adapter.onEnter?.(context);
      if (state.restore !== restorePiP) return;
      logVideo("after adapter setup", video, pip);
      const startTime = video.currentTime;
      const timer = window.setTimeout(() => {
        logVideo("playback sample", video, pip, video.currentTime - startTime);
      }, 1000);
      cleanup.push(() => window.clearTimeout(timer));
    } catch (error) {
      console.error(`Floatly failed while ${stage}.`, error);
      if (restorePiP()) pip?.close();
      throw error;
    } finally {
      state.opening = false;
    }
  }

  async function openSelectedElementPiP(css) {
    const target = await pickElement();
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const cleanup = [];
    const restorePiP = prepareRestoration(target, {}, cleanup);
    let pip;
    state.opening = true;
    try {
      pip = await documentPictureInPicture.requestWindow({
        width: Math.max(360, Math.min(900, Math.round(rect.width || 640))),
        height: Math.max(240, Math.min(700, Math.round(rect.height || 420))),
      });
      state.pip = pip;
      registerLifecycle(pip, restorePiP, cleanup);
      const shell = el(pip.document, "main", { className: "floatly-shell floatly-element-shell" });
      copyPageStyles(pip.document);
      pip.document.head.appendChild(el(pip.document, "style", { textContent: css }));
      target.classList.add("floatly-selected-element");
      shell.append(target);
      pip.document.body.append(shell);
    } catch (error) {
      if (restorePiP()) pip?.close();
      throw error;
    } finally {
      state.opening = false;
    }
  }

  function prepareRestoration(node, adapter, cleanup, getContext = () => null) {
    const restore = {
      className: node.className,
      style: node.getAttribute("style"),
      host: node.parentElement,
      nextSibling: node.nextSibling,
      marker: document.createComment("floatly-placeholder"),
      getParent: () => adapter.getRestoreParent?.(),
    };
    if (!restore.host?.isConnected) throw new Error("Original node has no connected parent.");
    restore.host.insertBefore(restore.marker, node);
    let restored = false;
    let restoring = false;
    const restorePiP = () => {
      if (restored) return true;
      if (restoring) return false;
      restoring = true;
      try {
        restoreNode(node, restore);
        restored = true;
      } catch (error) {
        console.error("Floatly restoration failed; recovery is retained for retry.", error);
      } finally {
        runCleanup(cleanup);
        runCleanup([() => document.dispatchEvent(new CustomEvent(bootstrap.commandEvent, { detail: { command: "dispose" } }))]);
        restoring = false;
      }
      if (!restored) return false;
      runCleanup([() => adapter.afterRestore?.(getContext() ?? { video: node }), () => window.focus()]);
      state.pip = null;
      if (state.restore === restorePiP) state.restore = null;
      return true;
    };
    state.restore = restorePiP;
    return restorePiP;
  }

  function registerLifecycle(pip, restorePiP, cleanup) {
    for (const name of ["pagehide", "unload"]) {
      pip.addEventListener(name, restorePiP);
      cleanup.push(() => pip.removeEventListener(name, restorePiP));
    }
  }

  function restoreNode(node, restore) {
    const markerParent = restore.marker.parentNode;
    let parent;
    let before = null;
    if (markerParent?.isConnected && markerParent.ownerDocument === document) {
      parent = markerParent;
      before = restore.marker;
    } else if (restore.host?.isConnected && restore.host.ownerDocument === document) {
      parent = restore.host;
      if (restore.nextSibling?.parentNode === parent) before = restore.nextSibling;
    } else {
      parent = restore.getParent?.();
    }
    if (!parent?.isConnected || parent.ownerDocument !== document) {
      throw new Error("No connected restoration container in the original document.");
    }

    parent.insertBefore(node, before);
    node.className = restore.className;
    restore.style === null
      ? node.removeAttribute("style")
      : node.setAttribute("style", restore.style);
    restore.marker.remove();
  }

  function runCleanup(cleanup) {
    while (cleanup.length) {
      try {
        cleanup.pop()?.();
      } catch (error) {
        console.error("Floatly cleanup failed.", error);
      }
    }
  }

  function pickElement() {
    return new Promise((resolve) => {
      const candidates = [];
      let current = null;
      let candidateIndex = 0;
      let locked = false;
      const overlay = el(document, "div", { className: "floatly-picker-overlay" });
      const panel = el(document, "div", { className: "floatly-picker-panel" });
      const warning = el(document, "div", {
        className: "floatly-picker-warning",
        textContent: "Element PiP is experimental; selected elements may not stay interactive.",
      });
      const label = el(document, "div", { className: "floatly-picker-label" });
      const pick = el(document, "button", { type: "button", textContent: "Pick" });
      const parent = el(document, "button", { type: "button", textContent: "Parent" });
      const child = el(document, "button", { type: "button", textContent: "Child" });
      const cancel = el(document, "button", { type: "button", textContent: "Cancel" });

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

        candidateIndex = Math.max(0, Math.min(candidates.length - 1, candidateIndex + offset));
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
        return target instanceof Element
          && target !== document.body
          && target !== document.documentElement
          && target !== overlay
          && target !== panel
          && !panel.contains(target);
      }

      function describeElement(target) {
        const id = target.id ? `#${target.id}` : "";
        const classes = [...target.classList].slice(0, 3).map((name) => `.${name}`).join("");
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
    for (const node of document.querySelectorAll('link[rel~="stylesheet"], style')) {
      const clone = node.cloneNode(true);
      if (clone.href) clone.href = new URL(clone.getAttribute("href"), document.baseURI).href;
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
    const events = new AbortController();
    const listenerOptions = { signal: events.signal };
    let disposed = false;
    cleanup.push(() => {
      disposed = true;
      events.abort();
    });
    pip.document.head.appendChild(
      el(pip.document, "style", { textContent: `${css}\n${adapter.styles ?? ""}` }),
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
    const speedMenu = speedSelector(pip.document, video, settings.speedSteps, listenerOptions);
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
    const live = el(pip.document, "button", {
      className: "floatly-button floatly-live", type: "button", textContent: "Live",
      title: "Jump to live", ariaLabel: "Jump to live", hidden: true,
    });
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
        if (disposed) runCleanup([fn]);
        else cleanup.push(fn);
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
    row.append(live);
    appendIf(controls, controlsConfig.progress, progress);
    controls.append(row);
    shell.append(video, controls);
    pip.document.body.append(shell);
    logVideo("relocated before resize / adapter", video, pip);
    resizeVideoToWindow(pip, video);

    if (settings.clickVideoToTogglePlayback) {
      shell.addEventListener("click", (event) => {
        if (controls.contains(event.target)) return;
        video.paused ? video.play() : video.pause();
      }, listenerOptions);
    }

    play.addEventListener("click", () =>
      video.paused ? video.play() : video.pause(),
      listenerOptions,
    );
    rewind.addEventListener("click", () => seekBy(context, -10, adapter), listenerOptions);
    forward.addEventListener("click", () => seekBy(context, 10, adapter), listenerOptions);
    speed.addEventListener("click", () => speedMenu.toggleAttribute("hidden"), listenerOptions);
    next.addEventListener("click", () => adapter.nextVideo?.(context), listenerOptions);
    mute.addEventListener("click", () => {
      video.muted = !video.muted;
    }, listenerOptions);
    fit.addEventListener("click", () => {
      video.classList.toggle("floatly-video-fill");
      fit.setAttribute(
        "aria-pressed",
        String(video.classList.contains("floatly-video-fill")),
      );
    }, listenerOptions);
    progress.addEventListener("input", () => {
      const range = getPlaybackRange(context, adapter);
      if (range.end > range.start && range.canSeek !== false) {
        seekTo(context, range.start + (progress.valueAsNumber / 1000) * (range.end - range.start), adapter);
      }
    }, listenerOptions);
    live.addEventListener("click", () => {
      const range = getPlaybackRange(context, adapter);
      if (!range.live || !(range.end > range.start) || range.canSeek === false) return;
      seekTo(context, Math.max(range.start, range.end - 0.1), adapter);
      video.play().catch((error) => console.error("Floatly could not resume the live stream.", error));
    }, listenerOptions);
    volume.addEventListener("input", () => {
      video.volume = volume.valueAsNumber / 100;
      video.muted = video.volume === 0;
    }, listenerOptions);
    pip.addEventListener("keydown", (event) =>
      handleKeys(event, context, settings.shortcuts, adapter),
      listenerOptions,
    );
    pip.addEventListener("resize", () => {
      resizeVideoToWindow(pip, video);
      saveWindowSize(pip, settings);
    }, listenerOptions);
    video.addEventListener("loadedmetadata", () => resizeVideoToWindow(pip, video), listenerOptions);

    const sync = () => {
      play.querySelector("path").setAttribute("d", video.paused ? icons.play : icons.pause);
      mute.querySelector("path").setAttribute("d",
        video.muted || video.volume === 0 ? icons.muted : icons.volume);
      volume.value = String(video.muted ? 0 : Math.round(video.volume * 100));
      setRangeFill(volume, video.muted ? 0 : video.volume * 100);
      const range = getPlaybackRange(context, adapter);
      const seekable = Number.isFinite(range.end) && range.end > range.start && range.canSeek !== false;
      progress.disabled = !seekable;
      rewind.disabled = forward.disabled = range.live && !seekable;
      progress.value = seekable ? String(Math.round(Math.max(0, Math.min(1,
        (video.currentTime - range.start) / (range.end - range.start))) * 1000)) : "0";
      setRangeFill(progress, progress.valueAsNumber / 10);
      const bufferLayers = [];
      const buffered = video.buffered;
      if (seekable) {
        for (let index = 0; index < buffered.length; index++) {
          const start = Math.max(range.start, buffered.start(index));
          const end = Math.min(range.end, buffered.end(index));
          if (end <= start) continue;
          const left = (start - range.start) / (range.end - range.start) * 100;
          const right = (end - range.start) / (range.end - range.start) * 100;
          bufferLayers.push(`linear-gradient(to right, transparent ${left}%, rgb(255 255 255 / 0.55) ${left}% ${right}%, transparent ${right}%)`);
        }
      }
      progress.style.setProperty("--floatly-buffered", bufferLayers.join(",") || "linear-gradient(transparent, transparent)");
      live.hidden = !range.live;
      live.disabled = !seekable;
      // ponytail: generic streams use a 3-second edge tolerance; site adapters can report atLive directly.
      const atLive = range.live && !video.paused && (range.atLive ?? (seekable && range.end - video.currentTime <= 3));
      live.dataset.atLive = String(atLive);
      live.title = live.ariaLabel = !seekable ? "Live stream is not seekable" : atLive ? "At live edge" : "Jump to live";
      time.textContent = range.live
        ? seekable && !atLive ? `-${formatTime(Math.max(0, range.end - video.currentTime))}` : ""
        : `${formatTime(video.currentTime)}${Number.isFinite(range.end) ? ` / ${formatTime(range.end)}` : ""}`;
      markCurrentRate(speedMenu, video.playbackRate);
    };

    [
      "play",
      "pause",
      "volumechange",
      "timeupdate",
      "durationchange",
      "ratechange",
      "loadedmetadata",
      "progress",
      "seeking",
      "seeked",
      "emptied",
    ].forEach((name) => {
      video.addEventListener(name, sync, listenerOptions);
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
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true",
    })) svg.setAttribute(name, value);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", icon);
    svg.append(path);
    element.append(svg);
    return element;
  }

  function appendIf(parent, shouldAppend, child) {
    if (shouldAppend) parent.append(child);
  }

  function speedSelector(document, video, speedSteps, listenerOptions) {
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
      }, listenerOptions);
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
    if (getPlaybackRange(context, adapter).live) return seekTo(context, context.video.currentTime + seconds, adapter);

    context.video.currentTime = Math.max(
      0,
      Math.min(getDuration(context, adapter) || Infinity, context.video.currentTime + seconds),
    );
  }

  function seekTo(context, seconds, adapter) {
    if (!Number.isFinite(seconds)) return;
    if (adapter.seekTo?.(context, seconds)) return;

    const range = getPlaybackRange(context, adapter);
    if (range.live && (!(range.end > range.start) || range.canSeek === false)) return;
    context.video.currentTime = Math.max(range.start, Math.min(range.end ?? Infinity, seconds));
  }

  function getPlaybackRange(context, adapter) {
    const custom = adapter.getPlaybackRange?.(context);
    if (custom?.live) {
      return Number.isFinite(custom.start) && Number.isFinite(custom.end) && custom.end >= custom.start
        ? custom : { live: true, start: 0, end: null, canSeek: false };
    }
    const duration = getDuration(context, adapter);
    const live = !context.video.ended && duration === Infinity;
    const ranges = context.video.seekable;
    if (live && ranges.length) {
      const last = ranges.length - 1;
      return { live, start: ranges.start(last), end: ranges.end(last) };
    }
    return { live, start: 0, end: Number.isFinite(duration) ? duration : null };
  }

  function getDuration(context, adapter) {
    return adapter.getDuration?.(context) ?? context.video.duration;
  }

  function resizeVideoToWindow(pip, video) {
    const width = `${pip.innerWidth}px`;
    const height = `${pip.innerHeight}px`;
    if (video.style.width !== width) video.style.width = width;
    if (video.style.height !== height) video.style.height = height;
  }

  function logVideo(stage, video, pip, advancedBy = null) {
    const rect = video.getBoundingClientRect();
    console.debug(`Floatly media: ${stage}`, {
      connected: video.isConnected,
      inPiP: Boolean(pip && video.ownerDocument === pip.document),
      width: rect.width,
      height: rect.height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
      paused: video.paused,
      currentTime: video.currentTime,
      advancedBy,
      encrypted: Boolean(video.mediaKeys),
    });
  }

  function setRangeFill(input, percent) {
    input.style.setProperty(
      "--floatly-fill",
      `${Math.max(0, Math.min(100, percent))}%`,
    );
  }

  function saveWindowSize(pip, settings) {
    if (!settings.rememberWindowSize) return;

    document.dispatchEvent(new CustomEvent(bootstrap.commandEvent, {
      detail: { command: "saveWindowSize", width: pip.innerWidth, height: pip.innerHeight },
    }));
  }

  function handleKeys(event, context, shortcuts, adapter) {
    if (event.defaultPrevented || event.target.closest?.("button, input, select, textarea, [contenteditable]")) return;
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
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
    return `${minutes}:${remainder}`;
  }

  function el(document, tag, props = {}) {
    return Object.assign(document.createElement(tag), props);
  }

  const icons = {
    play: "M8 5v14l11-7z",
    pause: "M7 5h4v14H7zm6 0h4v14h-4z",
    rewind: "M11 18V6l-8.5 6zm1.5-6 8.5 6V6z",
    forward: "M13 6v12l8.5-6zM2.5 18 11 12 2.5 6z",
    next: "M6 18l8.5-6L6 6zm10-12h2v12h-2z",
    speed: "M12 4a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 4m0 2a8 8 0 0 1 7.45 11H4.55A8 8 0 0 1 12 6m1 7.59 3.54-3.55 1.42 1.42L13 16.41l-3.54-3.53 1.42-1.42z",
    volume: "M4 9v6h4l5 4V5L8 9zm11.5-.5v7a4 4 0 0 0 0-7m0-3.5v2.1a6 6 0 0 1 0 9.8V19a8 8 0 0 0 0-14",
    muted: "M4 9v6h4l5 4V5L8 9zm13.59 3-2.3-2.29 1.42-1.42L19 10.59l2.29-2.3 1.42 1.42L20.41 12l2.3 2.29-1.42 1.42L19 13.41l-2.29 2.3-1.42-1.42z",
    crop: "M7 3h2v4h8v8h4v2h-4v4h-2v-4H7V9H3V7h4zm2 6v6h6V9z",
  };

  main().catch((error) => {
    console.error("Floatly initialization failed.", error);
    const pip = state.pip;
    if (state.restore?.()) pip?.close();
    if (!state.restore) pendingPiP?.close();
  });
})();

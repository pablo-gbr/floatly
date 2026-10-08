(() => {
  const state = (window.__floatlyState ??= {});
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const defaultSettings = {
    accentColor: "#45d19f",
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
    documentPictureInPicture.window.close();
    return;
  }

  async function main() {
    if (!("documentPictureInPicture" in window)) {
      return;
    }

    const video = findVideo();
    if (!video) {
      return;
    }

    const restore = {
      className: video.className,
      style: video.getAttribute("style"),
      host: video.parentElement,
      nextSibling: video.nextSibling,
    };
    const [css, settings] = await Promise.all([loadCss(), loadSettings()]);
    const pip = await documentPictureInPicture.requestWindow(
      getWindowSize(video, settings),
    );

    state.pip = pip;
    renderPlayer(pip, video, css, settings);

    pip.addEventListener(
      "pagehide",
      () => {
        restore.host?.insertBefore(video, restore.nextSibling);
        video.className = restore.className;
        restore.style === null
          ? video.removeAttribute("style")
          : video.setAttribute("style", restore.style);
        state.pip = null;
      },
      { once: true },
    );
  }

  function findVideo() {
    const videos = [...document.querySelectorAll("video")]
      .filter((video) => video.readyState > 0 && !video.disablePictureInPicture)
      .sort((a, b) => area(b) - area(a));

    // TODO: upgrade to site adapters if captions/DRM quirks matter.
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

  function renderPlayer(pip, video, css, settings) {
    pip.document.head.appendChild(
      el(pip.document, "style", { textContent: css }),
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
    const time = el(pip.document, "span", {
      className: "floatly-time",
      textContent: "0:00",
    });

    video.classList.add("floatly-video");
    row.append(play);
    appendIf(row, settings.controls.rewind, rewind);
    appendIf(row, settings.controls.forward, forward);
    if (settings.controls.speed) row.append(speed, speedMenu);
    row.append(mute);
    appendIf(row, settings.controls.volume, volume);
    appendIf(row, settings.controls.fit, fit);
    appendIf(row, settings.controls.time, time);
    appendIf(controls, settings.controls.progress, progress);
    controls.append(row);
    shell.append(video, controls);
    pip.document.body.append(shell);

    play.addEventListener("click", () =>
      video.paused ? video.play() : video.pause(),
    );
    rewind.addEventListener("click", () => seekBy(video, -10));
    forward.addEventListener("click", () => seekBy(video, 10));
    speed.addEventListener("click", () => speedMenu.toggleAttribute("hidden"));
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
      if (Number.isFinite(video.duration))
        video.currentTime = (progress.valueAsNumber / 1000) * video.duration;
    });
    volume.addEventListener("input", () => {
      video.volume = volume.valueAsNumber / 100;
      video.muted = video.volume === 0;
    });
    pip.addEventListener("keydown", (event) =>
      handleKeys(event, video, settings.shortcuts),
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
      progress.disabled = !Number.isFinite(video.duration);
      if (Number.isFinite(video.duration)) {
        progress.value = String(
          Math.round((video.currentTime / video.duration) * 1000),
        );
        setRangeFill(progress, progress.valueAsNumber / 10);
      }
      time.textContent = `${formatTime(video.currentTime)}${Number.isFinite(video.duration) ? ` / ${formatTime(video.duration)}` : ""}`;
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

  function seekBy(video, seconds) {
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || Infinity, video.currentTime + seconds),
    );
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

  function handleKeys(event, video, shortcuts) {
    if (event.key === shortcuts.playPause) {
      video.paused ? video.play() : video.pause();
    } else if (event.key === shortcuts.rewind) {
      seekBy(video, -10);
    } else if (event.key === shortcuts.forward) {
      seekBy(video, 10);
    } else if (event.key === shortcuts.volumeUp) {
      video.volume = Math.min(1, video.volume + 0.1);
    } else if (event.key === shortcuts.volumeDown) {
      video.volume = Math.max(0, video.volume - 0.1);
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

  const iconAttrs =
    'width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"';
  const icons = {
    play: `<svg ${iconAttrs}><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg ${iconAttrs}><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>`,
    rewind: `<svg ${iconAttrs}><path d="M11 18V6l-8.5 6zm1.5-6 8.5 6V6z"/></svg>`,
    forward: `<svg ${iconAttrs}><path d="M13 6v12l8.5-6zM2.5 18 11 12 2.5 6z"/></svg>`,
    speed: `<svg ${iconAttrs}><path d="M12 4a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 4m0 2a8 8 0 0 1 7.45 11H4.55A8 8 0 0 1 12 6m1 7.59 3.54-3.55 1.42 1.42L13 16.41l-3.54-3.53 1.42-1.42z"/></svg>`,
    volume: `<svg ${iconAttrs}><path d="M4 9v6h4l5 4V5L8 9zm11.5-.5v7a4 4 0 0 0 0-7m0-3.5v2.1a6 6 0 0 1 0 9.8V19a8 8 0 0 0 0-14"/></svg>`,
    muted: `<svg ${iconAttrs}><path d="M4 9v6h4l5 4V5L8 9zm13.59 3-2.3-2.29 1.42-1.42L19 10.59l2.29-2.3 1.42 1.42L20.41 12l2.3 2.29-1.42 1.42L19 13.41l-2.29 2.3-1.42-1.42z"/></svg>`,
    crop: `<svg ${iconAttrs}><path d="M7 3h2v4h8v8h4v2h-4v4h-2v-4H7V9H3V7h4zm2 6v6h6V9z"/></svg>`,
  };

  main().catch(() => {});
})();

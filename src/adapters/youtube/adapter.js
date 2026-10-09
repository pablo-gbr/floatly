(() => {
  window.FloatlyAdapters.register({
    id: "youtube",
    label: "YouTube",
    matches: ({ hostname }) => hostname === "www.youtube.com" || hostname === "m.youtube.com",
    controls: {
      next: true
    },
    findVideo() {
      return document.querySelector(".html5-main-video")
        ?? document.querySelector("#movie_player video")
        ?? document.querySelector("video");
    },
    getRestoreParent() {
      return document.querySelector(".html5-video-container");
    },
    getPlaybackRange({ video }) {
      const player = document.querySelector("#movie_player");
      const state = player?.getProgressState?.();
      const live = !video.ended && (state?.isAtLiveHead === true
        || player?.getVideoData?.()?.isLive === true || player?.classList.contains("ytp-live") === true);
      if (!live) return null;
      if (!Number.isFinite(state?.offset) || !Number.isFinite(state.seekableStart)
          || !Number.isFinite(state.seekableEnd)) return { live, start: 0, end: null, canSeek: false };
      // YouTube DVR bounds use player time; currentTime and buffered use media time.
      return { live, start: state.seekableStart - state.offset, end: state.seekableEnd - state.offset,
        atLive: state.isAtLiveHead, canSeek: state.allowSeeking === true };
    },
    seekBy(context, seconds) {
      return this.seekTo(context, context.video.currentTime + seconds);
    },
    seekTo(context, seconds) {
      const range = this.getPlaybackRange(context);
      if (!range?.live) return false;
      const player = document.querySelector("#movie_player");
      const state = player?.getProgressState?.();
      if (!range.canSeek || !Number.isFinite(range.end) || !Number.isFinite(state?.offset)
          || typeof player.seekTo !== "function") return true;
      const target = Math.max(range.start, Math.min(range.end, seconds));
      player.seekTo(target + state.offset, true);
      return true;
    },
    afterRestore({ video }) {
      video.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    },
    styles: `
      .ytp-caption-window-container {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 0 2% 28px !important;
        pointer-events: none;
      }

      body:hover .ytp-caption-window-container {
        padding-bottom: 58px !important;
      }

      .caption-window {
        position: static !important;
        inset: auto !important;
        transform: none !important;
        width: auto !important;
        max-width: 96% !important;
        margin: 0 auto !important;
        text-align: center !important;
        pointer-events: auto;
      }

      body:hover .caption-window.ytp-caption-window-bottom {
        margin-bottom: 0 !important;
      }

      .ytp-caption-segment {
        font-size: max(3.2vw, 12px) !important;
      }
    `,
    onEnter(context) {
      moveIntoPiP(".ytp-caption-window-container", context);
      addQualityControl(context);
    },
    nextVideo() {
      document.querySelector(".ytp-next-button.ytp-button")?.click();
    }
  });

  function moveIntoPiP(selector, context) {
    const element = document.querySelector(selector);
    if (!element) return;

    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    context.addCleanup(() => parent?.insertBefore(
      element,
      nextSibling?.parentNode === parent ? nextSibling : null,
    ));
    context.shell.append(element);
  }

  function addQualityControl(context) {
    const doc = context.pip.document;
    const events = new AbortController();
    const options = { signal: events.signal };
    const button = Object.assign(doc.createElement("button"), {
      className: "floatly-button floatly-quality-button",
      type: "button",
      title: "Quality",
      ariaLabel: "Quality",
      textContent: "HD",
    });
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const menu = Object.assign(doc.createElement("div"), {
      className: "floatly-speed-menu floatly-quality-menu",
      hidden: true,
    });
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Quality");
    context.addCleanup(() => {
      events.abort();
      button.remove();
      menu.remove();
    });

    function closeMenu() {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    function readQuality() {
      // ponytail: YouTube's private API can change; update this hook if it disappears.
      const player = document.querySelector("#movie_player");
      if (typeof player?.getAvailableQualityLevels !== "function"
          || typeof player.getPlaybackQuality !== "function"
          || typeof player.setPlaybackQualityRange !== "function") {
        throw new Error("Quality selection is unavailable for this player.");
      }
      const available = player.getAvailableQualityLevels();
      const levels = Array.isArray(available)
        ? [...new Set(available.filter((level) => typeof level === "string" && level && level !== "auto"))] : [];
      if (!levels.length) throw new Error("Quality options are not available yet.");
      return { levels: [...levels, "auto"], current: player.getPlaybackQuality() };
    }

    function refreshAvailability() {
      try {
        readQuality();
        button.disabled = false;
        button.title = button.ariaLabel = "Quality";
      } catch (error) {
        closeMenu();
        button.disabled = true;
        button.title = button.ariaLabel = error.message;
      }
    }

    button.addEventListener("click", () => {
      if (!menu.hidden) return closeMenu();
      try {
        const { levels, current } = readQuality();
        menu.replaceChildren(...levels.map((level) => {
          const item = Object.assign(doc.createElement("button"), {
            className: "floatly-speed-option",
            type: "button",
            textContent: qualityLabel(level),
          });
          item.setAttribute("role", "menuitemradio");
          item.setAttribute("aria-checked", String(level === current));
          item.dataset.quality = level;
          return item;
        }));
        context.row.querySelector(".floatly-speed-menu:not(.floatly-quality-menu)")?.setAttribute("hidden", "");
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
        menu.firstElementChild?.focus();
      } catch (error) {
        refreshAvailability();
        console.warn("Floatly could not read YouTube quality levels.", error);
      }
    }, options);
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".floatly-speed-option");
      if (!item || !menu.contains(item)) return;
      try {
        const level = item.dataset.quality;
        const player = document.querySelector("#movie_player");
        if (typeof player?.setPlaybackQualityRange !== "function") {
          throw new Error("YouTube quality API is unavailable.");
        }
        const available = player.getAvailableQualityLevels?.();
        if (level !== "auto" && (!Array.isArray(available) || !available.includes(level))) {
          throw new Error("This quality is no longer available.");
        }
        player.setPlaybackQualityRange(level, level);
        closeMenu();
        button.focus();
      } catch (error) {
        console.error("Floatly could not set YouTube quality.", error);
      }
    }, options);
    menu.addEventListener("keydown", (event) => {
      const items = [...menu.children];
      const index = items.indexOf(doc.activeElement);
      const next = { ArrowDown: (index + 1) % items.length,
        ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      items[next]?.focus();
    }, options);
    doc.addEventListener("click", (event) => {
      if (!button.contains(event.target) && !menu.contains(event.target)) closeMenu();
    }, options);
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        closeMenu();
        button.focus();
        event.preventDefault();
      }
    }, options);
    context.video.addEventListener("loadedmetadata", closeMenu, options);
    for (const name of ["loadedmetadata", "loadeddata", "durationchange", "emptied", "playing"]) {
      context.video.addEventListener(name, refreshAvailability, options);
    }
    context.video.addEventListener("progress", () => {
      if (button.disabled) refreshAvailability();
    }, options);
    doc.addEventListener("pointerover", (event) => {
      if (button.contains(event.target)) refreshAvailability();
    }, options);
    doc.addEventListener("focusin", refreshAvailability, options);
    context.row.append(button, menu);
    refreshAvailability();
  }

  function qualityLabel(level) {
    return {
      highres: "Best", hd2160: "2160p", hd1440: "1440p", hd1080: "1080p",
      hd720: "720p", large: "480p", medium: "360p", small: "240p", tiny: "144p", auto: "Auto",
    }[level] ?? level;
  }

})();

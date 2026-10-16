(() => {
  window.FloatlyAdapters.register({
    id: "youtube",
    label: "YouTube",
    matches: ({ hostname }) =>
      hostname === "www.youtube.com" || hostname === "m.youtube.com",
    controls: {
      next: true,
    },
    findVideo() {
      return (
        document.querySelector(".html5-main-video") ??
        document.querySelector("#movie_player video") ??
        document.querySelector("video")
      );
    },
    getRestoreParent() {
      return document.querySelector(".html5-video-container");
    },
    getPlaybackRange({ video }) {
      const player = document.querySelector("#movie_player");
      const state = player?.getProgressState?.();
      const live =
        !video.ended &&
        (state?.isAtLiveHead === true ||
          player?.getVideoData?.()?.isLive === true ||
          player?.classList.contains("ytp-live") === true);
      if (!live) return null;
      if (
        !Number.isFinite(state?.offset) ||
        !Number.isFinite(state.seekableStart) ||
        !Number.isFinite(state.seekableEnd)
      )
        return { live, start: 0, end: null, canSeek: false };
      // YouTube DVR bounds use player time; currentTime and buffered use media time.
      return {
        live,
        start: state.seekableStart - state.offset,
        end: state.seekableEnd - state.offset,
        atLive: state.isAtLiveHead,
        canSeek: state.allowSeeking === true,
      };
    },
    seekBy(context, seconds) {
      return this.seekTo(context, context.video.currentTime + seconds);
    },
    seekTo(context, seconds) {
      const range = this.getPlaybackRange(context);
      if (!range?.live) return false;
      const player = document.querySelector("#movie_player");
      const state = player?.getProgressState?.();
      if (
        !range.canSeek ||
        !Number.isFinite(range.end) ||
        !Number.isFinite(state?.offset) ||
        typeof player.seekTo !== "function"
      )
        return true;
      const target = Math.max(range.start, Math.min(range.end, seconds));
      player.seekTo(target + state.offset, true);
      return true;
    },
    afterRestore({ video }) {
      video.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    },
    styles: `
      .floatly-chapter-track {
        position: relative;
        display: flex;
        align-items: center;
        height: 14px;
      }

      .floatly-chapter-markers {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .floatly-chapter-markers span {
        position: absolute;
        top: 5.5px;
        width: 2px;
        height: 3px;
        background: #000;
      }

      .floatly-chapter-tooltip {
        position: absolute;
        bottom: 100%;
        box-sizing: border-box;
        max-width: 100%;
        width: max-content;
        padding: 6px 9px;
        border-radius: 6px;
        background: rgb(28 28 28 / 0.95);
        box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
        color: #fff;
        font-size: 12px;
        line-height: 1.4;
        white-space: pre-line;
        text-align: center;
        overflow-wrap: anywhere;
        pointer-events: none;
      }

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

      .floatly-shell[data-floatly-captions="false"] .ytp-caption-window-container {
        display: none !important;
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

      .ytp-caption-window-container svg {
        width: 1em !important;
        height: 1em !important;
        display: inline-block;
        vertical-align: -0.15em;
        fill: currentColor;
      }
    `,
    onEnter(context) {
      addPiPPlaceholder(context);
      addYouTubeToggles(context);
      addQualityControl(context);
      addChapterPreview(context, this);
    },
    nextVideo() {
      document.querySelector(".ytp-next-button.ytp-button")?.click();
    },
  });

  function addYouTubeToggles(context) {
    const player = document.querySelector("#movie_player");
    if (!player) return;
    const events = new AbortController();
    const toggles = [
      { key: "captions", text: "CC", selector: ".ytp-subtitles-button", attribute: "aria-pressed" },
      { key: "autoplay", text: "AUTO", selector: ".ytp-autonav-toggle-button", attribute: "aria-checked" },
    ].map((toggle) => {
      const button = Object.assign(context.pip.document.createElement("button"), {
        className: `floatly-button floatly-${toggle.key}-button`, type: "button",
        textContent: toggle.text, title: context.t(toggle.key), ariaLabel: context.t(toggle.key),
      });
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        const native = player.querySelector(toggle.selector);
        if (!button.disabled && native) (native.closest(".ytp-button") ?? native).click();
        sync();
      }, { signal: events.signal });
      context.row.append(button);
      return { ...toggle, button };
    });
    function sync() {
      for (const { key, selector, attribute, button } of toggles) {
        const native = player.querySelector(selector);
        const value = native?.getAttribute(attribute);
        button.disabled = !native || native.disabled || native.getAttribute("aria-disabled") === "true"
          || (value !== "true" && value !== "false");
        button.setAttribute("aria-pressed", String(value === "true"));
        if (key === "captions") context.shell.setAttribute("data-floatly-captions", String(value === "true"));
      }
      // Captions can be created only after the viewer enables them.
      moveIntoPiP(".ytp-caption-window-container", context);
    }
    const observer = new MutationObserver(sync);
    observer.observe(player, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["aria-pressed", "aria-checked", "aria-disabled", "disabled"] });
    context.addCleanup(() => {
      observer.disconnect();
      events.abort();
      context.shell.removeAttribute("data-floatly-captions");
      for (const { button } of toggles) button.remove();
    });
    sync();
  }

  function addPiPPlaceholder(context) {
    const player = document.querySelector("#movie_player");
    if (!player) return;
    const placeholder = document.createElement("div");
    placeholder.className = "floatly-pip-placeholder";
    placeholder.lang = context.pip.document.documentElement.lang;
    placeholder.dir = context.pip.document.documentElement.dir;
    const shadow = placeholder.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial !important; position: absolute !important; inset: 0 !important;
        z-index: 2147483647 !important; display: grid !important;
        place-items: center !important; pointer-events: none !important;
        color: #fff !important; text-align: center !important;
        font: 500 clamp(14px, 2vw, 22px)/1.5 system-ui, sans-serif !important; }
      p { margin: 16px; padding: 12px 20px; border-radius: 8px; background: #0f0f0f; }
    `;
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.textContent = context.t("videoInPip");
    shadow.append(style, message);
    context.addCleanup(() => placeholder.remove());
    player.append(placeholder);
  }

  function readChapters(data) {
    const chapters = new Map();
    const seen = new WeakSet();
    const text = (value) =>
      value?.simpleText ??
      (Array.isArray(value?.runs)
        ? value.runs.map((run) => run?.text ?? "").join("")
        : "");
    // youtube's private chapter shapes can change; update these two hooks if extraction stops working.
    function walk(value) {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const chapter = value.chapterRenderer;
      const marker = value.macroMarkersListItemRenderer;
      const start =
        chapter?.timeRangeStartMillis ??
        marker?.onTap?.watchEndpoint?.startTimeSeconds;
      const seconds =
        typeof start === "number" ? start / (chapter ? 1000 : 1) : NaN;
      const title = text(chapter?.title ?? marker?.title);
      if (
        typeof title === "string" &&
        title.trim() &&
        Number.isFinite(seconds) &&
        seconds >= 0
      ) {
        chapters.set(seconds, { seconds, title });
      }
      Object.values(value).forEach(walk);
    }
    walk(data);
    return [...chapters.values()].sort((a, b) => a.seconds - b.seconds);
  }

  function addChapterPreview(context, adapter) {
    const { pip, video, progress } = context;
    if (!progress.isConnected) return;
    const doc = pip.document;
    const events = new AbortController();
    const options = { signal: events.signal };
    const track = Object.assign(doc.createElement("div"), {
      className: "floatly-chapter-track",
    });
    const markers = Object.assign(doc.createElement("div"), {
      className: "floatly-chapter-markers",
    });
    markers.setAttribute("aria-hidden", "true");
    const tooltip = Object.assign(doc.createElement("div"), {
      className: "floatly-chapter-tooltip",
      hidden: true,
    });
    const seekLabel = progress.title;
    progress.setAttribute("aria-label", seekLabel);
    progress.removeAttribute("title");
    progress.before(track);
    track.append(progress, markers, tooltip);
    let chapters = [];
    let pointerX = null;

    function playbackRange() {
      const range = adapter.getPlaybackRange(context);
      if (range) return range;
      const live = !video.ended && video.duration === Infinity;
      if (live && video.seekable.length) {
        const last = video.seekable.length - 1;
        return {
          live,
          start: video.seekable.start(last),
          end: video.seekable.end(last),
        };
      }
      return { live, start: 0, end: video.duration };
    }

    function available(range) {
      return (
        !progress.disabled &&
        range.canSeek !== false &&
        Number.isFinite(range.start) &&
        Number.isFinite(range.end) &&
        range.end > range.start
      );
    }

    function label(seconds, range) {
      // Live timestamps show distance behind the moving live edge, using the same DVR bounds as seeking.
      const time = Math.floor(
        Math.max(0, range.live ? range.end - seconds : seconds),
      );
      const timestamp =
        time >= 3600
          ? `${Math.floor(time / 3600)}:${String(Math.floor(time / 60) % 60).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`
          : `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
      const chapter =
        !range.live && chapters.findLast((item) => item.seconds <= seconds);
      return (
        (range.live ? "-" : "") +
        timestamp +
        (chapter ? `\n${chapter.title}` : "")
      );
    }

    function show() {
      const range = playbackRange();
      if (!available(range)) {
        tooltip.hidden = true;
        return;
      }
      const rect = progress.getBoundingClientRect();
      // Match the native 9px thumb's travel rather than the full input width.
      const fraction =
        pointerX === null
          ? progress.valueAsNumber / 1000
          : Math.max(
              0,
              Math.min(
                1,
                (pointerX - rect.left - 4.5) / Math.max(1, rect.width - 9),
              ),
            );
      tooltip.textContent = label(
        range.start + fraction * (range.end - range.start),
        range,
      );
      tooltip.hidden = false;
      const x = 4.5 + fraction * (rect.width - 9);
      tooltip.style.left = `${Math.max(0, Math.min(rect.width - tooltip.offsetWidth, x - tooltip.offsetWidth / 2))}px`;
    }

    function refresh() {
      const range = playbackRange();
      chapters =
        available(range) && !range.live
          ? readChapters(
              document.querySelector("ytd-watch-flexy")?.data ??
                window.ytInitialData,
            ).filter((chapter) => chapter.seconds < video.duration)
          : [];
      markers.replaceChildren(
        ...chapters
          .filter((chapter) => chapter.seconds > 0)
          .map((chapter) => {
            const marker = doc.createElement("span");
            const fraction = chapter.seconds / video.duration;
            marker.style.left = `calc(${fraction * 100}% + ${4.5 - fraction * 9}px)`;
            return marker;
          }),
      );
      updateAccessibleValue();
      if (!tooltip.hidden) show();
    }

    function updateAccessibleValue() {
      const range = playbackRange();
      if (available(range))
        progress.setAttribute(
          "aria-valuetext",
          label(video.currentTime, range).replace("\n", ", "),
        );
      else progress.removeAttribute("aria-valuetext");
    }

    track.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType === "touch") return;
        pointerX = event.clientX;
        refresh();
        show();
      },
      options,
    );
    track.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType === "touch") return;
        pointerX = event.clientX;
        show();
      },
      options,
    );
    track.addEventListener(
      "pointerleave",
      () => {
        pointerX = null;
        tooltip.hidden = true;
        if (doc.activeElement === progress) show();
      },
      options,
    );
    progress.addEventListener(
      "focus",
      () => {
        refresh();
        show();
      },
      options,
    );
    progress.addEventListener(
      "input",
      () => {
        show();
        updateAccessibleValue();
      },
      options,
    );
    progress.addEventListener(
      "blur",
      () => {
        tooltip.hidden = true;
      },
      options,
    );
    doc.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") tooltip.hidden = true;
      },
      options,
    );
    for (const name of ["loadedmetadata", "durationchange", "emptied"])
      video.addEventListener(name, refresh, options);
    video.addEventListener(
      "timeupdate",
      () => {
        updateAccessibleValue();
        if (!tooltip.hidden) show();
      },
      options,
    );
    document.addEventListener("yt-navigate-finish", refresh, options);
    pip.addEventListener(
      "resize",
      () => {
        if (!tooltip.hidden) show();
      },
      options,
    );
    context.addCleanup(() => {
      events.abort();
      track.before(progress);
      track.remove();
      progress.title = seekLabel;
      progress.removeAttribute("aria-label");
      progress.removeAttribute("aria-valuetext");
    });
    refresh();
  }

  function moveIntoPiP(selector, context) {
    const element = document.querySelector(selector);
    if (!element) return;

    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    context.addCleanup(() =>
      parent?.insertBefore(
        element,
        nextSibling?.parentNode === parent ? nextSibling : null,
      ),
    );
    context.shell.append(element);
  }

  function addQualityControl(context) {
    const { t } = context;
    const doc = context.pip.document;
    const events = new AbortController();
    const options = { signal: events.signal };
    const button = Object.assign(doc.createElement("button"), {
      className: "floatly-button floatly-quality-button",
      type: "button",
      title: t("quality"),
      ariaLabel: t("quality"),
      textContent: "HD",
    });
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const menu = Object.assign(doc.createElement("div"), {
      className: "floatly-speed-menu floatly-quality-menu",
      hidden: true,
    });
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t("quality"));
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
      // youtube's private API can change; update this hook if it disappears.
      const player = document.querySelector("#movie_player");
      if (
        typeof player?.getAvailableQualityLevels !== "function" ||
        typeof player.getPlaybackQuality !== "function" ||
        typeof player.setPlaybackQualityRange !== "function"
      ) {
        throw new Error(t("qualityUnavailable"));
      }
      const available = player.getAvailableQualityLevels();
      const levels = Array.isArray(available)
        ? [
            ...new Set(
              available.filter(
                (level) =>
                  typeof level === "string" && level && level !== "auto",
              ),
            ),
          ]
        : [];
      if (!levels.length) throw new Error(t("qualityNotReady"));
      return {
        levels: [...levels, "auto"],
        current: player.getPlaybackQuality(),
      };
    }

    function refreshAvailability() {
      try {
        readQuality();
        button.disabled = false;
        button.title = button.ariaLabel = t("quality");
      } catch (error) {
        closeMenu();
        button.disabled = true;
        button.title = button.ariaLabel = error.message;
      }
    }

    button.addEventListener(
      "click",
      () => {
        if (!menu.hidden) return closeMenu();
        try {
          const { levels, current } = readQuality();
          menu.replaceChildren(
            ...levels.map((level) => {
              const item = Object.assign(doc.createElement("button"), {
                className: "floatly-speed-option",
                type: "button",
                textContent: qualityLabel(level, t),
              });
              item.setAttribute("role", "menuitemradio");
              item.setAttribute("aria-checked", String(level === current));
              item.dataset.quality = level;
              return item;
            }),
          );
          context.row
            .querySelector(".floatly-speed-menu:not(.floatly-quality-menu)")
            ?.setAttribute("hidden", "");
          menu.hidden = false;
          button.setAttribute("aria-expanded", "true");
          menu.firstElementChild?.focus();
        } catch (error) {
          refreshAvailability();
          console.warn("Floatly could not read YouTube quality levels.", error);
        }
      },
      options,
    );
    menu.addEventListener(
      "click",
      (event) => {
        const item = event.target.closest(".floatly-speed-option");
        if (!item || !menu.contains(item)) return;
        try {
          const level = item.dataset.quality;
          const player = document.querySelector("#movie_player");
          if (typeof player?.setPlaybackQualityRange !== "function") {
            throw new Error(t("qualityApiUnavailable"));
          }
          const available = player.getAvailableQualityLevels?.();
          if (
            level !== "auto" &&
            (!Array.isArray(available) || !available.includes(level))
          ) {
            throw new Error(t("qualityNoLongerAvailable"));
          }
          player.setPlaybackQualityRange(level, level);
          closeMenu();
          button.focus();
        } catch (error) {
          console.error("Floatly could not set YouTube quality.", error);
        }
      },
      options,
    );
    menu.addEventListener(
      "keydown",
      (event) => {
        const items = [...menu.children];
        const index = items.indexOf(doc.activeElement);
        const next = {
          ArrowDown: (index + 1) % items.length,
          ArrowUp: (index - 1 + items.length) % items.length,
          Home: 0,
          End: items.length - 1,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        items[next]?.focus();
      },
      options,
    );
    doc.addEventListener(
      "click",
      (event) => {
        if (!button.contains(event.target) && !menu.contains(event.target))
          closeMenu();
      },
      options,
    );
    doc.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && !menu.hidden) {
          closeMenu();
          button.focus();
          event.preventDefault();
        }
      },
      options,
    );
    context.video.addEventListener("loadedmetadata", closeMenu, options);
    for (const name of [
      "loadedmetadata",
      "loadeddata",
      "durationchange",
      "emptied",
      "playing",
    ]) {
      context.video.addEventListener(name, refreshAvailability, options);
    }
    context.video.addEventListener(
      "progress",
      () => {
        if (button.disabled) refreshAvailability();
      },
      options,
    );
    doc.addEventListener(
      "pointerover",
      (event) => {
        if (button.contains(event.target)) refreshAvailability();
      },
      options,
    );
    doc.addEventListener("focusin", refreshAvailability, options);
    context.row.append(button, menu);
    refreshAvailability();
  }

  function qualityLabel(level, t) {
    return (
      {
        highres: t("qualityBest"),
        hd2160: "2160p",
        hd1440: "1440p",
        hd1080: "1080p",
        hd720: "720p",
        large: "480p",
        medium: "360p",
        small: "240p",
        tiny: "144p",
        auto: t("qualityAuto"),
      }[level] ?? level
    );
  }
})();

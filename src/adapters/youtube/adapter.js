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
    getRestoreNextSibling() {
      return document.querySelector(".html5-video-container")?.firstChild ?? null;
    },
    beforeRestore({ video }) {
      const shouldResume = !video.paused && !video.ended;
      if (shouldResume) video.pause();

      return () => {
        if (!shouldResume) return;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            video.play().catch((error) => {
              console.debug("Floatly could not resume YouTube playback.", error);
            });
          });
        });
      };
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
      addQualityControl(context).catch((error) => {
        console.debug("Floatly could not add YouTube quality control.", error);
      });
    },
    nextVideo() {
      document.querySelector(".ytp-next-button.ytp-button")?.click();
    },
    onRestored(video) {
      video.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    },
  });

  function moveIntoPiP(selector, context) {
    const element = document.querySelector(selector);
    if (!element) return;

    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    context.shell.append(element);
    context.addCleanup(() =>
      parent?.insertBefore(
        element,
        nextSibling?.parentNode === parent ? nextSibling : null,
      ),
    );
  }

  async function addQualityControl(context) {
    const quality = await createQualityBridge();
    const initial = await quality.request("list");
    if (!initial.levels.length) return;

    const doc = context.pip.document;
    const button = Object.assign(doc.createElement("button"), {
      className: "floatly-button floatly-quality-button",
      type: "button",
      title: "Quality",
      ariaLabel: "Quality",
      textContent: "HD",
    });
    const menu = Object.assign(doc.createElement("div"), {
      className: "floatly-speed-menu floatly-quality-menu",
      hidden: true,
    });

    button.addEventListener("click", async () => {
      try {
        renderQualityOptions(await quality.request("list"), menu, quality);
        menu.toggleAttribute("hidden");
      } catch (error) {
        console.debug("Floatly could not read YouTube quality levels.", error);
      }
    });
    context.row.append(button, menu);
    renderQualityOptions(initial, menu, quality);
  }

  async function createQualityBridge() {
    let nextId = 0;
    return {
      request(action, quality) {
        return new Promise((resolve, reject) => {
          const id = `floatly-${Date.now()}-${nextId++}`;
          const timeout = setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("YouTube quality bridge timed out."));
          }, 800);

          function onMessage(event) {
            const response = event.data;
            if (
              event.source !== window
              || response?.source !== "floatly-youtube"
              || response?.type !== "quality-response"
              || response.id !== id
            ) return;

            clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
            response.ok ? resolve(response) : reject(new Error(response.error));
          }

          window.addEventListener("message", onMessage);
          window.postMessage({
            source: "floatly",
            type: "youtube-quality",
            id,
            action,
            quality,
          }, "*");
        });
      },
    };
  }

  function renderQualityOptions(data, menu, quality) {
    const { levels, current } = data;

    menu.replaceChildren(
      ...levels.map((level) => {
        const item = Object.assign(menu.ownerDocument.createElement("button"), {
          className: "floatly-speed-option",
          type: "button",
          textContent: qualityLabel(level),
        });
        item.setAttribute("aria-checked", String(level === current));
        item.addEventListener("click", async () => {
          try {
            await quality.request("set", level);
            menu.hidden = true;
          } catch (error) {
            console.debug("Floatly could not set YouTube quality.", error);
          }
        });
        return item;
      }),
    );
  }

  function qualityLabel(level) {
    return (
      {
        highres: "Best",
        hd2160: "2160p",
        hd1440: "1440p",
        hd1080: "1080p",
        hd720: "720p",
        large: "480p",
        medium: "360p",
        small: "240p",
        tiny: "144p",
        auto: "Auto",
      }[level] ?? level
    );
  }
})();

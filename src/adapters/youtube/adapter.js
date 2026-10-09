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
    context.shell.append(element);
    context.addCleanup(() => parent?.insertBefore(element, nextSibling));
  }
})();

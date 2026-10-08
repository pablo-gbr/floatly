(() => {
  window.FloatlyAdapters.register({
    id: "youtube",
    label: "YouTube",
    matches: ({ hostname }) => hostname === "www.youtube.com" || hostname === "m.youtube.com",
    controls: {
      next: true
    },
    styles: `
      .ytp-caption-window-container {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .caption-window {
        pointer-events: auto;
      }

      body:hover .caption-window.ytp-caption-window-bottom {
        margin-bottom: 49px;
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

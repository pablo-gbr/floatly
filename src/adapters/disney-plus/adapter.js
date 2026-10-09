(() => {
  window.FloatlyAdapters.register({
    id: "disney-plus",
    label: "Disney+",
    matches: ({ hostname }) => hostname === "www.disneyplus.com" || hostname === "disneyplus.com",
    controls: {
      progress: false
    },
    styles: `
      .dss-hls-subtitle-overlay {
        width: 100% !important;
        height: 100% !important;
      }

      .dss-hls-subtitle-overlay .dss-subtitle-renderer-cue-positioning-box {
        width: 100% !important;
        height: auto !important;
        top: auto !important;
        bottom: 0 !important;
      }

      body:hover .dss-hls-subtitle-overlay .dss-subtitle-renderer-cue-positioning-box {
        margin-bottom: 49px;
      }

      .dss-hls-subtitle-overlay span.dss-subtitle-renderer-cue {
        font-size: max(2.8vw, 12px) !important;
      }
    `,
    onEnter(context) {
      moveIntoPiP(".dss-hls-subtitle-overlay", context);
    }
  });

  function moveIntoPiP(selector, context) {
    const element = document.querySelector(selector);
    if (!element) return;

    const parent = element.parentElement;
    const nextSibling = element.nextSibling;
    context.addCleanup(() => parent?.insertBefore(element, nextSibling?.parentNode === parent ? nextSibling : null));
    context.shell.append(element);
  }
})();

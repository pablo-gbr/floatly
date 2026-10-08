(() => {
  window.FloatlyAdapters.register({
    id: "prime-video",
    label: "Prime Video",
    matches: ({ hostname }) => hostname === "www.primevideo.com" || hostname === "primevideo.com",
    styles: `
      .atvwebplayersdk-captions-overlay {
        font-family: Arial, sans-serif;
      }

      .atvwebplayersdk-captions-overlay div:has(> p) {
        bottom: 15px !important;
      }

      body:hover .atvwebplayersdk-captions-overlay p {
        margin-bottom: 49px !important;
      }

      .atvwebplayersdk-captions-overlay span {
        font-size: max(2.8vw, 12px) !important;
      }
    `,
    onEnter(context) {
      const captions = [...document.querySelectorAll(".atvwebplayersdk-captions-overlay")].at(-1);
      if (!captions) return;

      const parent = captions.parentElement;
      const nextSibling = captions.nextSibling;
      context.shell.append(captions);
      context.addCleanup(() => parent?.insertBefore(captions, nextSibling));
    }
  });
})();

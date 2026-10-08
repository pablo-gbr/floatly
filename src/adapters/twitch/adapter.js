(() => {
  window.FloatlyAdapters.register({
    id: "twitch",
    label: "Twitch",
    matches: ({ hostname }) => hostname === "www.twitch.tv" || hostname === "twitch.tv",
    controls: {
      progress: false,
      rewind: false,
      forward: false,
      speed: false
    }
  });
})();

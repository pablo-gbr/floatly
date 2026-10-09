(() => {
  if (window.__floatlyYouTubeQualityBridge) return;
  window.__floatlyYouTubeQualityBridge = true;

  window.addEventListener("message", (event) => {
    const request = event.data;
    if (
      event.source !== window
      || request?.source !== "floatly"
      || request?.type !== "youtube-quality"
    ) return;

    try {
      const player = document.querySelector("#movie_player");
      if (!canControlQuality(player)) throw new Error("YouTube quality API is unavailable.");

      if (request.action === "set") {
        player.setPlaybackQualityRange?.(request.quality, request.quality);
        player.setPlaybackQuality?.(request.quality);
      }

      window.postMessage({
        source: "floatly-youtube",
        type: "quality-response",
        id: request.id,
        ok: true,
        levels: player.getAvailableQualityLevels(),
        current: player.getPlaybackQuality(),
      }, "*");
    } catch (error) {
      window.postMessage({
        source: "floatly-youtube",
        type: "quality-response",
        id: request.id,
        ok: false,
        error: String(error?.message ?? error),
      }, "*");
    }
  });

  function canControlQuality(player) {
    return typeof player?.getAvailableQualityLevels === "function"
      && typeof player.getPlaybackQuality === "function"
      && (
        typeof player.setPlaybackQuality === "function"
        || typeof player.setPlaybackQualityRange === "function"
      );
  }
})();

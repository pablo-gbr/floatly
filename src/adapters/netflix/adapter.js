(() => {
  window.FloatlyAdapters.register({
    id: "netflix",
    label: "Netflix",
    matches: ({ hostname }) => hostname.endsWith(".netflix.com") || hostname === "netflix.com",
    styles: `
      body:hover .player-timedtext {
        margin-bottom: 49px;
      }
    `,
    onEnter(context) {
      moveIntoPiP(".player-timedtext", context);
    },
    seekBy(context, seconds) {
      return seekNetflix(context.video.currentTime + seconds);
    },
    seekTo(context, seconds) {
      return seekNetflix(seconds);
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

  function seekNetflix(seconds) {
    try {
      const playerApi = window.netflix?.appContext?.state?.playerApp?.getAPI()?.videoPlayer;
      const sessionId = playerApi?.getAllPlayerSessionIds?.()[0];
      const player = sessionId ? playerApi.getVideoPlayerBySessionId(sessionId) : null;
      if (!player) return false;

      player.seek(Math.max(0, Math.floor(seconds * 1000)));
      return true;
    } catch (error) {
      console.error("Floatly Netflix seek failed; using HTML5 fallback.", error);
      return false;
    }
  }
})();

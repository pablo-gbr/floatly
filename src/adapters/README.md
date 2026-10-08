<div align="center">
  <h1>Floatly Site Adapters</h1>
  <p><strong>Small site-specific hooks for captions, seeking, controls, and cleanup.</strong></p>
  <p>Adapters let Floatly support special video sites without making the core player messy.</p>
</div>

## Folder Layout

Add one folder per site:

```text
src/adapters/example/adapter.js
```

Then add `"example"` to `src/adapters/adapters.json`.

## Adapter Template

```js
window.FloatlyAdapters.register({
  id: "example",
  label: "Example",
  matches: ({ hostname }) => hostname === "example.com",
  controls: {
    progress: true,
    rewind: true,
    forward: true,
    speed: true,
    next: false,
  },
  styles: "/* CSS injected into the floating window */",
  findVideo() {
    return document.querySelector("video");
  },
  onEnter(context) {
    // Move captions or companion DOM into context.shell.
    // Use context.addCleanup(fn) to restore anything you move.
  },
  seekBy(context, seconds) {
    // Return true if handled, false to use normal video.currentTime.
  },
  seekTo(context, seconds) {
    // Return true if handled, false to use normal video.currentTime.
  },
  getDuration(context) {
    // Return a finite number to override video.duration.
  },
  nextVideo(context) {
    // Optional next-video button behavior.
  },
});
```

## Context

`onEnter`, `seekBy`, `seekTo`, `getDuration`, and `nextVideo` receive a `context` object:

```js
{
  (pip, // Document Picture-in-Picture window
    video, // selected HTMLVideoElement
    shell, // root element inside the PiP window
    controls, // controls container
    row, // controls row
    progress, // progress range input
    addCleanup); // call with a function to restore moved DOM
}
```

## Guidelines

- Keep adapters small and site-focused.
- Prefer moving existing caption/subtitle DOM over recreating it.
- Restore anything you move with `context.addCleanup(fn)`.
- Return `true` from custom seek handlers only when the site-specific seek worked.
- Leave generic sites alone; Floatly already falls back to the largest playable `<video>`.
- Do not add analytics, remote calls, broad permissions, or dependencies.

## Pull Request Checklist

- Add `src/adapters/<site>/adapter.js`.
- Add `<site>` to `src/adapters/adapters.json`.
- Mention what the adapter changes: captions, seek, controls, duration, next video, or cleanup.

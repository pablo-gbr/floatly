# Floatly Site Adapters

Add one folder per site using this shape:

```text
src/adapters/example/adapter.js
```

Then add `"example"` to `src/adapters/adapters.json`.

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
    next: false
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
  }
});
```

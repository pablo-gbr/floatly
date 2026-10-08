<div align="center">
  <h1>
    <img src="assets/icon1024.png" alt="" width="42" height="42" />
    Floatly
  </h1>
  <p><strong>A small, privacy-friendly Picture-in-Picture extension for Chrome.</strong></p>
  <p>Floatly opens the current page's main video in a lightweight floating window with playback controls, speed controls, site adapters, and configurable UI.</p>
</div>

## Features

- Floating Document Picture-in-Picture player.
- Playback controls for play/pause, seek, volume, speed, crop/fit, and next video where supported.
- Settings for trackbar color, visible controls, window size memory, custom speed steps, shortcuts, and click-to-play/pause.
- Site adapters for YouTube, Netflix, Disney+, Prime Video, and Twitch.
- Generic fallback for sites without a custom adapter.
- No analytics, background network calls, or broad host permissions.

## Screenshots

Coming soon.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Permissions

Floatly uses only:

- `activeTab` to work on the tab you click it from.
- `scripting` to inject the player launcher into that tab.
- `storage` to save your Floatly settings.

There are no analytics, background network calls, or broad host permissions.

## Settings

Open Floatly's options page from `chrome://extensions` to change the trackbar color, hide controls, remember the floating window size, edit up to 6 speed steps, and customize in-player shortcut keys.

## Site Adapters

Site-specific behavior lives in `src/adapters`. Floatly currently includes adapters for YouTube, Netflix, Disney+, Prime Video, and Twitch, then falls back to the generic video picker on every other site.

New adapters use this layout:

```text
src/adapters/example/adapter.js
```

Then add the adapter id to `src/adapters/adapters.json`.

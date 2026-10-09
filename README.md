<div align="center">
  <h1>
    <img src="assets/icon1024.png" alt="" width="42" height="42" />
    Floatly
  </h1>
  <p><strong>A small, privacy-friendly Picture-in-Picture extension for Chrome.</strong></p>
  <p>Floatly opens the current page's main video in a lightweight floating window with playback controls, speed controls, site adapters, and configurable UI.</p>
</div>

Version **1.0.0** is the first stable release for YouTube. Other site adapters remain experimental. See [changelog.md](changelog.md) for release notes.

## Features

- Floating Document Picture-in-Picture player.
- Playback controls for play/pause, seek, volume, speed, crop/fit, and next video where supported.
- YouTube quality menu with available resolutions and Auto; unavailable quality selection is disabled with a reason tooltip.
- Live playback with a red live indicator, a **Live** button to return to the live edge, and a behind-live timer when rewound or paused.
- YouTube DVR seeking within the player's actual available window, with correct timeline offsets and live-edge detection.
- Buffered ranges displayed separately from playback progress.
- Captions and subtitles through site adapters, restored with the video when the floating window closes.
- Settings for trackbar color, visible controls, window size memory, custom speed steps, shortcuts, and click-to-play/pause.
- Site adapters for YouTube, Netflix, Disney+, Prime Video, and Twitch.
- Generic fallback for sites without a custom adapter.
- Experimental selected element PiP fallback for normal pages without video, with a uBlock-style picker. Elements may not stay interactive.
- No analytics, background network calls, or broad host permissions.

## Supported Sites

YouTube is the primary verified site for version 1.0.0, including ordinary videos, quality selection, captions, and live streams with DVR. Floatly uses the DVR window reported by YouTube rather than assuming a fixed rewind limit. Live seeking is disabled when the stream does not allow it.

Netflix, Disney+, Prime Video, and Twitch have adapters, but their behavior still needs broader testing. DRM-protected content may render black or prevent seeking even when the player opens successfully. Generic HTML5 video support depends on the site's player and browser restrictions.

YouTube quality and DVR controls use page-owned player APIs that may change. Quality selection is disabled when the required methods or options are unavailable.

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

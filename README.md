<div align="center">
  <h1>
    <img src="assets/icon1024.png" alt="" width="42" height="42" />
    Floatly
  </h1>
  <p><strong>A small, privacy-friendly Picture-in-Picture extension for Chrome and Firefox.</strong></p>
  <p>Floatly opens the current page's main video in a lightweight floating window with playback controls, speed controls, site adapters, and configurable UI.</p>
</div>

YouTube playback is stable; other site adapters and element PiP remain experimental. See [CHANGELOG.md](CHANGELOG.md) for release notes.

Desktop Chrome 121+ and Firefox 151+ are supported by the shared manifest. Firefox support is experimental and still needs live playback testing. Older Firefox versions and Firefox for Android lack the Document Picture-in-Picture API required by Floatly.

## Features

- Floating video player with playback, volume, speed, and crop/fit controls.
- YouTube quality selection, live DVR controls, and captions where supported.
- Site adapters and generic HTML5 video support.
- Optional element picker when no usable video is found (experimental).
- Open from the toolbar, keyboard shortcut, or right-click menu.
- Customizable controls, colors, shortcuts, and window-size memory.
- No analytics, background network calls, or broad host permissions.

## Supported Sites

YouTube is the primary verified site since version 1.0.0, including ordinary videos, quality selection, captions, and live streams with DVR. Floatly uses the DVR window reported by YouTube rather than assuming a fixed rewind limit. Live seeking is disabled when the stream does not allow it.

Netflix, Disney+, Prime Video, and Twitch have adapters, but their behavior still needs broader testing. DRM-protected content may render black or prevent seeking even when the player opens successfully. Generic HTML5 video support depends on the site's player and browser restrictions.

YouTube quality and DVR controls use page-owned player APIs that may change. Quality selection is disabled when the required methods or options are unavailable.

## Screenshots

Coming soon.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

For Firefox 151+:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select this folder's `manifest.json`.
4. Open a YouTube video and click Floatly in the extensions menu or toolbar.

Temporary add-ons are removed when Firefox restarts. The same source and ZIP work for both browsers; permanent Firefox installation requires Mozilla signing. Floatly uses Firefox's background event page and Chrome's service worker, with no additional dependencies or host permissions.

For a live Firefox check, try opening and closing PiP, returning the video to the tab, captions, autoplay, HD selection, live seeking, speed shortcuts, saved window size, and the element picker. Confirm that closing PiP restores playback to the original page.

## Permissions

Floatly uses only:

- `activeTab` to work on the tab you click it from.
- `contextMenus` to add the Open in PiP right-click action.
- `scripting` to inject the player launcher into that tab.
- `storage` to save your Floatly settings.

There are no analytics, background network calls, or broad host permissions.

## Settings

Open Floatly's options page from `chrome://extensions` or Firefox's `about:addons` to change the trackbar color, hide controls, remember the floating window size, edit up to 6 speed steps, and customize in-player shortcut keys.

The **Enable element picker when no usable video is found** option is enabled by default. Floatly always tries video playback first. If no usable video is found, the enabled picker lets you select an element to move into PiP and restores it when PiP closes. This is experimental: some styles and interactions depend on the original page layout. The picker selects frame and shadow hosts, not their internal elements.

## Site Adapters

Site-specific behavior lives in `src/adapters`. Floatly currently includes adapters for YouTube, Netflix, Disney+, Prime Video, and Twitch. Other sites use generic HTML5 video selection. If no usable video is found, Floatly falls back to the element picker when enabled.

New adapters use this layout:

```text
src/adapters/example/adapter.js
```

Then add the adapter id to `src/adapters/adapters.json`.

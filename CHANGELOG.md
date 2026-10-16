# Changelog

## Unreleased

### Added

- Experimental desktop Firefox 151+ support using the same manifest and player as Chrome. Includes a Firefox add-on ID, minimum version, and no-data-collection declaration.

### Changed

- Extension pages prefer Firefox's Promise-based `browser` API and fall back to Chrome's API.
- Settings bridge commands use validated JSON strings across script worlds for Firefox compatibility.
- Script injection handles Firefox's per-frame errors and cleans up pending PiP windows on setup failures.
- The shared manifest requires Chrome 121+; Firefox loads background scripts while Chrome uses its service worker.

## 1.2.0 - 2026-10-16

### Added

- YouTube captions and autoplay toggles between the time display and HD button, synchronized with YouTube's controls.
- Configurable playback speed shortcuts: Shift + Right increases speed by 0.25× and Shift + Left decreases it, within 0.25×–16×.
- A localized “This video is now in PiP” placeholder in the original YouTube player, removed when the video returns.

### Fixed

- Caption icons, including the settings gear, stay aligned with the text at the correct size in PiP.
- Keyboard shortcuts distinguish modifier keys, so speed shortcuts do not also seek the video.

## 1.1.1 - 2026-10-14

### Added

- YouTube chapter markers on the seek bar and a popup showing the hovered timestamp and chapter title. Keyboard focus also displays the preview.
- Seekable live streams show time behind the live edge using YouTube's DVR bounds, without chapter markers or titles. Non-seekable streams hide the preview.

## 1.1.0 - 2026-10-13

Improved experimental element PiP with a configurable uBlock-style picker. Adapter video playback remains unchanged.

### Added

- English localization catalog for Settings, player controls, the element picker, context menu, and extension metadata. Additional languages can be added through Chrome's native i18n support.
- Settings toggle to enable or disable the element picker, enabled by default.
- Open in PiP right-click action with the Floatly icon, using the same video-first flow as the toolbar button. Adds the contextMenus permission.
- Element PiP now respects window-size memory and preserves the page title and base URL for relative links and resources.

### Changed

- Video playback is tried first on every site, using adapters where available and the largest usable HTML5 video otherwise. The element picker opens only when no usable video is found and its setting is enabled; disabling it leaves pages without usable video unchanged.
- The picker dims the page, highlights hovered elements, locks a selection on click, and lists ancestors to refine the selection.
- Added explicit Open in PiP and Pick another actions, keyboard navigation, and cancellation through Escape or another toolbar click.
- Picker controls are isolated from site styles and use the browser's top layer to appear above page dialogs and headers.
- Selected elements fill the floating window's width and can scroll when needed.

### Fixed

- Selection uses the clicked position even without a preceding mouse move and rejects detached elements.
- Restoration preserves the original class attribute, including SVG elements and elements without a class attribute.
- Cancelling the picker or finding no video with the picker disabled disposes the settings bridge.

### Limitations

- Element PiP remains experimental; styles and interactions that depend on the original page layout may not carry over.
- The picker selects frame and shadow hosts rather than their internal elements.

## 1.0.0 - 2026-10-09

First stable release for YouTube. Other site adapters and selected-element PiP remain experimental.

### Added

- YouTube quality selection with available resolutions and Auto, plus a disabled state and reason tooltip when unavailable.
- Live indicator and jump-to-live button, with a behind-live timer and seeking through the available DVR window.
- Buffered-range shading on the progress bar.
- Keyboard navigation for the quality menu and controls that wrap in smaller windows.

### Fixed

- YouTube DVR timestamps now account for the difference between player time and media-element time, avoiding incorrect durations and seek targets.
- PiP opens from the initial toolbar-click injection to preserve user activation.
- SVG controls use DOM creation instead of HTML assignments to work with Trusted Types policies.
- Restoration is registered before video relocation, preserves the original DOM position, and retains recovery state when restoration fails.
- Initialization errors trigger rollback; closing or returning to the tab cleans up player listeners, timers, and adapter resources.
- Chrome API access stays in the background and isolated settings bridge, separate from the MAIN-world player controller.
- Initialization, adapter, and restoration errors are reported instead of silently ignored.

### Limitations

- YouTube page-owned player APIs are not a stable public interface and may change.
- Netflix, Disney+, Prime Video, Twitch, and generic sites need broader verification. DRM-protected playback may remain black or restrict controls.
- Selected-element PiP is experimental; moved elements may not remain interactive.

## 0.1.0

Initial development version with Document Picture-in-Picture playback controls, configurable settings, site adapters, generic HTML5 video selection, and an experimental element picker.

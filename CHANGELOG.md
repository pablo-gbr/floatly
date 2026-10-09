# Changelog

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

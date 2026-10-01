# Changelog

All notable changes to DramaFlow PRO will be documented in this file.

## [0.0.9] - 2026-10-01
### Changed & Polished
- **Unobstructed Video Playback with On-Hover/Touch Controls**:
  - The floating episode shortcut button `[Episodes ⌵]` is now hidden by default (`opacity: 0; pointer-events: none;`) to keep video playback 100% clean and unobstructed.
  - Button appears smoothly with a slide animation only when the user hovers over the video (`:hover`) or touches/interacts with the screen on mobile devices.
  - Automatically fades away after 2.8 seconds of inactivity on mobile devices.
  - Adhered strictly to keeping version tags out of the public UI.

## [0.0.8] - 2026-10-01
### Added & Improved
- **Nearly Full-Screen Mobile Video Viewport**:
  - Video player now expands to fill almost the entire mobile display height (`height: calc(100dvh - 56px)`), allowing vertical (9:16 portrait) short drama videos to display tall, vibrant, and immersive without letterboxing or squishing.
  - Controls, Multi-batch Episode Drawer (`1-30`, `31-60`...), and synopsis are positioned directly below the fold, smoothly revealed upon scrolling down.
  - Added an intuitive floating `[Episodes ⌵]` scroll shortcut button at the bottom of the video for one-tap navigation to the episode selector.
  - Automatic smooth scroll back to the top of the video when an episode is selected from the grid.
  - Clean HTML entity decoding (`&#039;` -> `'`, `&amp;` -> `&`, etc.) across all drama titles and synopses.

## [0.0.7] - 2026-10-01
### Fixed & Improved
- **Full Responsive Experience Across All Screen Sizes (Mobile, Tablet, Desktop)**:
  - **Sticky Top Video Player on Mobile**: Fixed issue on smartphones where the video player would get obscured or pushed off-screen. On screens ≤ 820px, the video viewport is now pinned sticky at the top (`position: sticky; top: 0; z-index: 50`) with an optimized 16:9 aspect ratio and max height constraint.
  - **Intelligent Episode Drawer Flow**: Re-ordered the mobile playback layout so that the Episode Selector drawer (`1-30`, `31-60`...) and interactive episode buttons sit directly below the video player controls, allowing users to browse and switch episodes seamlessly while the video remains in view.
  - **Responsive Header & Search System**: Fixed navigation container wrapping on mobile devices to prevent horizontal body overflow (`scrollWidth` = 390px edge-to-edge). Search input spans cleanly across full width underneath the brand logo and language switcher.
  - **Mobile Hero Banner & Grids**: Scaled Hero banner padding, typography, indicator pills, and navigation arrows for touchscreens; library drama cards automatically display in a clean 2-column mobile layout.
  - **No Version Badges**: Adhered strictly to keeping version tags out of the public UI.

## [0.0.6] - 2026-09-30
### Added
- Interactive Hero Showcase Banner Slide Bar (Carousel):
  - Top 6 featured releases rotation with smooth cross-fade animation.
  - Left & Right glassmorphic circular navigation arrows (`<` and `>`).
  - Animated slide indicator progress pills with live progress bar timer filling up over 5 seconds.
  - Slide counter indicator (`1 / 6`, `2 / 6`...).
  - Dynamic trending badges (`#1 TOP RANKED TODAY`, `#2 TRENDING NOW`, `#3 AUDIENCE CHOICE`...).
  - Automatic slide advance with smart pause-on-hover.

## [0.0.5] - 2026-09-30
### Fixed
- Fixed empty catalogue issue on providers such as Vyntage, PineDrama, etc., caused by passing extraneous `tab_pages[trending]` and `tab_pages[popular]` parameters to providers that only support `home`.
- Added resilient language and catalog fallback in `/api/sections`: automatically falls back without strict language locks or to native upstream catalog so all 54 providers return their full list of drama titles.

## [0.0.4] - 2026-09-30
### Added
- Interactive Left & Right carousel navigation buttons (`<` and `>`) for the **Continue Watching** section (`#history-section`) and **My List** section (`#favorites-section`) to easily browse through saved history and bookmarked dramas without scrollbars.
- Smooth mouse wheel horizontal scrolling support on both Continue Watching and My List rails.
- Smart boundary detection with dynamic opacity dimming when reached the start or end of the rails.

## [0.0.3] - 2026-09-30
### Added
- Multi-language streaming selector dropdown in header navbar supporting 13 top international languages (English, Bahasa Indonesia, 日本語, 한국어, 繁體中文, Español, ภาษาไทย, Deutsch, português, Tiếng Việt, Français, العربية, Русский).
- Dynamic localization query parameter `lang` synchronized across sections, provider lists, and live search.
- Smooth mouse wheel horizontal scrolling support on the Providers rail.

### Fixed
- Restored visible, sleek custom horizontal scrollbar for the Providers rail (`.providers-rail-wrap`) so users can easily browse and drag through all 54 live providers.
- Maintained clean scrollbar-free style on Top 10 Ranked Hits and other content rails with dedicated `<` and `>` arrow navigation.

## [0.0.2] - 2026-09-30
### Changed
- Removed horizontal scrollbars on all content rails (Top 10, providers, history, favorites) for a clean modern design.
- Activated interactive Left & Right carousel navigation buttons (`<` and `>`) on the Top 10 section to smoothly slide items left and right with smart boundary detection.
- Updated version tracking to `tool_version` 0.0.2.

## [0.0.1] - 2026-09-30
### Added
- Complete reverse-engineered streaming pipeline for short dramas from `narto-drama.com`.
- Gateway bypass using dynamic hex timestamp cookie `nd_ck`.
- Ad-gate bypass extracting direct raw `.m3u8` and `.mp4` URLs without 4-ad click gates.
- Automatic live sync of all 54 upstream providers (AnyReel, BibiShort, CandyJar, DramaBox, etc.).
- Responsive commercial streaming frontend with Netflix-style Top 10 Ranked Hits rail.
- Embedded Hls.js video player with episode grouping tabs (1-30, 31-60...), playback speed controls (0.75x - 2.0x), and theater mode.
- Local Watch History and Bookmarks/Favorites persistence in LocalStorage.
- Real-time live search with debounced preview dropdown.
- Image poster proxy and URL normalizer on backend + safe fallback to fix relative path `/assets/poster/*` broken images.
- Complete English localization for all UI buttons, headings, and labels.
- Clean navbar header without unnecessary VIP ribbons or badges.

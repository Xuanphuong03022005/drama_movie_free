# Changelog

All notable changes to DramaFlow PRO will be documented in this file.

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

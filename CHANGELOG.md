# Changelog

All notable changes to DramaFlow PRO will be documented in this file.

## [0.0.14] - 2026-10-01
### Added & Enhanced
- **Modern Streaming Top Navbar Architecture (Movie & Series, Anime, Tags, Genre, Featured, Login)**:
  - **Left Primary Content Navigation**:
    - `Home`: Quick return to top showcase and resets active filters.
    - `Movie & Series`: Dedicated view for full series and main streaming catalog.
    - `Anime`: Direct filtering for animation and donghua short drama titles.
    - `Tags ⌵` Dropdown: Ultra-modern frosted glass mega-menu popover featuring trending drama theme chips (`#CEO`, `#Revenge`, `#Billionaire`, `#ContractMarriage`, `#TimeTravel`, `#SweetLove`, `#Urban`, `#MartialArts`, `#Werewolf`, `#SecretIdentity`).
    - `Genre ⌵` Dropdown: Frosted glass popover showcasing high-definition drama genres with custom glass icon badges (`Romance`, `Action`, `Comedy`, `Fantasy`, `Thriller`, `Historical`).
    - `Featured`: Smooth navigation to top picks and daily ranked trending dramas.
  - **Right Utility & Personalization Cluster**:
    - Expandable search input with real-time title preview dropdown.
    - 🕒 `History`: Instant access and smooth scrolling to recent continue-watching episodes.
    - ❤️ `My List`: Dynamic saved drama access with live count badge sync.
    - 🌐 `Language ⌵`: Multi-lingual streaming locale selector.
    - 👤 `Login`: VIP Access member modal with unlimited ad-free 4K playback credentials.
  - **Interactive Filter Bar & Deduplication**:
    - Clicking any tag or genre instantly queries the database, smoothly scrolls to the catalog grid, and shows a stylish active filter chip banner (`#CEO` / `Genre: Romance`) with a 1-click `[Clear Filter]` button.
    - Dedicated **Providers Horizontal Rail** (`AnyReel`, `BibiShort`, etc.) remains clean and visible directly beneath the top bar without text redundancy.
  - **Responsive Design**:
    - Desktop screens (>1024px) enjoy an unobstructed, perfectly balanced single-row navbar.
    - Tablet and mobile screens (<=1024px) seamlessly collapse into a slide-down mobile navigation drawer with touch-friendly controls.
  - Strictly zero version badges or debug tags in the frontend UI.

### Changed & Refined
- **Desktop v0.0.11 Layout Restored & Mobile-Exclusive Fullscreen**:
  - **Desktop (Screens > 820px)**: 100% restored to the proven v0.0.11 interface.
    - Two-column card modal layout: left column contains the 520px video player, media controls, and drama synopsis; right column houses the 360px sticky episode list drawer with batch navigation.
    - Floating `[Episodes ⌵]` shortcut is completely hidden on desktop (`display: none !important;`).
    - Standard theater mode toggle button (`#theater-toggle-btn`) operational.
  - **Mobile (Screens <= 820px or narrow windows)**:
    - Dedicated fullscreen cinema viewport: `100% width x 100dvh` without borders or outer gaps.
    - Vertical video occupies nearly the full screen (`calc(100vh - 56px)` / `calc(100dvh - 56px)`), with controls, episode drawer, and synopsis revealed smoothly on scroll down.
    - **Hover/Touch-Only Episodes Button**:
      - Hidden during normal playback (`opacity: 0; pointer-events: none;`) to keep video playback 100% unobstructed.
      - Reveals with smooth animation exclusively on hover (`@media (hover: hover) { :hover }`) or on mobile tap interaction (`is-active-touch`), fading automatically after 2.5s.
      - Positioned cleanly above the native video player timeline scrubber (`bottom: 58px;`).
  - Maintained strict policy of no version badges or debug tags in the frontend UI.

## [0.0.12] - 2026-10-01
### Changed & Enhanced
- **Full Screen Cinema Playback Layout & Hover-Only Episodes Button**:
  - The drama playback screen now launches in a 100% full-screen immersive cinema viewport across all screen sizes (Desktop, Laptop, Tablet, Mobile) with no outer modal borders, letterbox gaps, or restrictive box padding.
  - The video fills the entire viewport (`calc(100vh - 52px)` / `calc(100dvh - 52px)`), displaying vertical 9:16 and horizontal 16:9 dramas in maximum scale.
  - **On-Hover Episodes Navigation Button**:
    - When watching the video, the purple pill `[Episodes ⌵]` button remains completely hidden (`opacity: 0; pointer-events: none;`) to keep video playback 100% unobstructed.
    - On desktop/mouse devices, the button reveals smoothly with a subtle slide animation exclusively when hovering over the video area (`@media (hover: hover) and (pointer: fine) { .video-viewport:hover .episodes-scroll-btn }`), and disappears instantly when the mouse leaves.
    - On touch devices, tapping the screen activates the button for 2.5 seconds before automatically fading away, eliminating sticky hover artifacts.
    - Floating offset adjusted to float cleanly above the native HTML5 player timeline scrubber and control buttons.
    - Clicking the button smoothly scrolls down to the episode drawer and drama overview.
  - **Auto-Scroll on Episode Selection**:
    - Selecting any episode from the episode grid below automatically smoothly scrolls back to the top of the video for immediate playback.
  - Zero version tags or debug markers displayed in the user interface.

## [0.0.11] - 2026-10-01
### Fixed & Improved
- **Automatic Dead-Stream & Duplicate-Slug Recovery**:
  - Fixed an issue where duplicate drama entries crawled from upstream (e.g., titles with `-2` or trailing periods like `seducing-my-dad-s-best-friend-2`) had empty stream links (`play_url: ""`), causing the video player to display *"No stream link available for this episode"*.
  - Implemented an intelligent **Auto-Recovery Engine** in `/api/drama`:
    1. **Slug Clean-up Strategy**: If all episodes in a drama have empty streams and the slug ends in a duplicate suffix (e.g. `-[2-9]`), the backend automatically strips the suffix and queries the canonical drama route (`cleanPath + '/1'`).
    2. **Title-Match Fallback Strategy**: If streams remain unplayable, the backend performs an internal upstream title search to find and link the active drama stream with playable episodes.
  - Zero playback interruption: Even if a user clicks a dead duplicate entry from search or recommendations, the system seamlessly recovers and streams the active HLS/MP4 video without error.
  - Strict UI cleanliness maintained: No version tags or debug markers displayed in the user interface.

## [0.0.10] - 2026-10-01
### Fixed & Enhanced
- **Provider Catalog & Multi-Tab Pagination Fix**:
  - Resolved issue where providers using non-`home` tab keys (such as `dotdrama`, `dotdrama2` which use `tab_pages[list]`, `bibishort`, `candyjar`, etc.) failed to paginate or fetch all movies. Added dynamic multi-tab page parameters (`list`, `home`, `all`, `all-series`, etc.) so all providers return their complete library across multiple pages.
  - Set default streaming language to Vietnamese (`vi-VN`) to instantly load the full Vietnamese catalogue (e.g. *Hóa thân thành cây cối cai quản muôn vật*, *Quãng đời còn lại trên biển*, *Người Sếp Là Vị Hôn Phu*...).
  - Added **"Tất cả (All Languages)"** option in the header language selector to browse combined multi-lingual catalogs.
  - Multi-tier language fallback ensures providers never show an empty or starved catalog regardless of the selected language.
  - Maintained strict adherence to zero version badges on the website UI.

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

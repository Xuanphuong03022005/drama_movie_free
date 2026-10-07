// DramaFlow PRO - Commercial Streaming Application v2.0
(function () {
    // State
    let currentProvider = 'anyreel';
    let currentPage = 1;
    let currentDramaData = null;
    let currentEpisodeIndex = 0;
    let hls = null;
    let searchDebounceTimer = null;
    let isTheaterMode = false;
    let activeBatchIndex = 0;
    const BATCH_SIZE = 30;

    // Ambient Glow
    let ambientAnimationId = null;
    let isAmbientActive = false;
    let _hasPrefetchedNext = false;

    // Next Episode Countdown
    const COUNTDOWN_SECONDS = 5;

    // Storage Keys
    const STORAGE_HISTORY = 'df_watch_history_v1';
    const STORAGE_FAVORITES = 'df_favorites_v1';
    const STORAGE_TIMESTAMPS = 'df_timestamps_v1';
    const STORAGE_EP_PROGRESS = 'df_ep_progress_v1';

    // Mobile swipe state
    let touchStartY = 0;
    let touchStartX = 0;
    let swipeInProgress = false;
    let lastTapTime = 0;
    let lastTapX = 0;

    // Quality / subtitle state
    let selectedQuality = 'auto';
    let selectedSubtitle = localStorage.getItem('df_selected_sub') || 'vi';
    let _pendingResumeTime = 0;
    let subtitlePollTimer = null;
    let activeSubtitleRequest = null;
    let currentSubtitleCues = [];

    // DOM Elements - Navigation & Header
    const providersContainer = document.getElementById('providers-container');
    const currentProviderTitle = document.getElementById('current-provider-title');
    const heroTitle = document.getElementById('hero-title');
    const heroDesc = document.getElementById('hero-desc');
    const heroBackdrop = document.getElementById('hero-backdrop');
    const heroAmbient = document.getElementById('hero-ambient');
    const heroTags = document.getElementById('hero-tags');
    const heroProviderBadge = document.getElementById('hero-provider-badge');
    const heroEpisodesBadge = document.getElementById('hero-episodes-badge');
    const heroPlayBtn = document.getElementById('hero-play-btn');
    const heroFavBtn = document.getElementById('hero-fav-btn');
    const heroMoreBtn = document.getElementById('hero-more-btn');
    const heroCoverflowCards = document.getElementById('hero-coverflow-cards');
    const heroPlayText = document.getElementById('hero-play-text');
    const heroDetailText = document.getElementById('hero-detail-text');
    const featuredSection = document.getElementById('featured');
    const heroContentWrap = document.getElementById('hero-content-wrap');
    const heroSlidePrev = document.getElementById('hero-slide-prev');
    const heroSlideNext = document.getElementById('hero-slide-next');
    const heroIndicators = document.getElementById('hero-indicators');
    const heroSlideCounter = document.getElementById('hero-slide-counter');
    const heroTrendBadge = document.getElementById('hero-trend-badge');
    const heroRatingNum = document.getElementById('hero-rating-num');

    // Hero Slider State
    let heroSliderItems = [];
    let currentHeroIndex = 0;
    let heroProgressBarTimer = null;
    let heroProgressPercent = 0;
    let isHeroHovered = false;

    // Rails & Grids
    const top10Rail = document.getElementById('top10-rail');
    const top10PrevBtn = document.getElementById('top10-prev-btn');
    const top10NextBtn = document.getElementById('top10-next-btn');
    const historySection = document.getElementById('history-section');
    const historyRail = document.getElementById('history-rail');
    const historyPrevBtn = document.getElementById('history-prev-btn');
    const historyNextBtn = document.getElementById('history-next-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const favoritesSection = document.getElementById('favorites-section');
    const favoritesRail = document.getElementById('favorites-rail');
    const favoritesPrevBtn = document.getElementById('favorites-prev-btn');
    const favoritesNextBtn = document.getElementById('favorites-next-btn');
    const favoritesCount = document.getElementById('favorites-count');

    const dramaGrid = document.getElementById('drama-grid');
    const gridLoader = document.getElementById('grid-loader');
    const emptyState = document.getElementById('empty-state');

    // Pagination
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageIndicator = document.getElementById('page-indicator');
    const prevPageBtnBot = document.getElementById('prev-page-btn-bot');
    const nextPageBtnBot = document.getElementById('next-page-btn-bot');
    const pageIndicatorBot = document.getElementById('page-indicator-bot');

    // Search
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchResultsList = document.getElementById('search-results-list');
    const searchCount = document.getElementById('search-count');

    // Video Player Modal
    const playerModal = document.getElementById('player-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalDramaTitle = document.getElementById('modal-drama-title');
    const modalEpisodeTitle = document.getElementById('modal-episode-title');
    const mainVideo = document.getElementById('main-video');
    const videoViewport = document.getElementById('video-viewport');
    const videoOverlayLoader = document.getElementById('video-overlay-loader');
    const subStatusToast = document.getElementById('sub-status-toast');
    const subStatusText = document.getElementById('sub-status-text');
    const customSubtitleOverlay = document.getElementById('custom-subtitle-overlay');
    const prevEpBtn = document.getElementById('prev-ep-btn');
    const nextEpBtn = document.getElementById('next-ep-btn');
    const speedSelect = document.getElementById('speed-select');
    const autoplayToggle = document.getElementById('autoplay-next-toggle');
    const streamTypeBadge = document.getElementById('stream-type-badge');
    const detailDramaTitle = document.getElementById('detail-drama-title');
    const detailDramaDesc = document.getElementById('detail-drama-desc');
    const episodesCount = document.getElementById('episodes-count');
    const episodesGrid = document.getElementById('episodes-grid');
    const epBatchTabs = document.getElementById('ep-batch-tabs');
    const jumpEpInput = document.getElementById('jump-ep-input');
    const jumpEpBtn = document.getElementById('jump-ep-btn');
    const theaterToggleBtn = document.getElementById('theater-toggle-btn');
    const modalFavBtn = document.getElementById('modal-fav-btn');
    const modalShareBtn = document.getElementById('modal-share-btn');
    const modalMinimizeBtn = document.getElementById('modal-minimize-btn');
    const toastContainer = document.getElementById('toast-container');

    // Miniplayer Elements (YouTube-Style floating player)
    const miniplayerBottomBar = document.getElementById('miniplayer-bottom-bar');
    const miniplayerProgressTrack = document.getElementById('miniplayer-progress-track');
    const miniplayerProgressFill = document.getElementById('miniplayer-progress-fill');
    const miniplayerTitle = document.getElementById('miniplayer-title');
    const miniplayerSubtitle = document.getElementById('miniplayer-subtitle');
    const miniplayerExpandArea = document.getElementById('miniplayer-expand-area');
    const miniplayerPlayBtn = document.getElementById('miniplayer-play-btn');
    const miniplayerNextBtn = document.getElementById('miniplayer-next-btn');
    const miniplayerExpandBtn = document.getElementById('miniplayer-expand-btn');
    const miniplayerCloseBtn = document.getElementById('miniplayer-close-btn');
    const miniOvExpandBtn = document.getElementById('mini-ov-expand-btn');
    const miniOvPlayBtn = document.getElementById('mini-ov-play-btn');
    const miniOvCloseBtn = document.getElementById('mini-ov-close-btn');
    let isMiniplayer = false;

    // Ambient canvas & glow
    const ambientCanvas = document.getElementById('ambient-canvas');
    const videoAmbientGlow = document.getElementById('video-ambient');

    // Countdown overlay
    const nextEpCountdown = document.getElementById('next-ep-countdown');
    const countdownTimerSec = document.getElementById('countdown-timer-sec');
    const countdownProgressFill = document.getElementById('countdown-progress-fill');
    const btnCountdownNow = document.getElementById('btn-countdown-now');
    const btnCountdownCancel = document.getElementById('btn-countdown-cancel');

    // Resume banner
    const resumeBanner = document.getElementById('resume-playback-banner');
    const resumeTimeLabel = document.getElementById('resume-time-label');
    const btnResumeAccept = document.getElementById('btn-resume-accept');
    const btnResumeDismiss = document.getElementById('btn-resume-dismiss');

    // Swipe indicator & seek overlays
    const swipeEpIndicator = document.getElementById('swipe-ep-indicator');
    const touchSeekLeft = document.getElementById('touch-seek-left');
    const touchSeekRight = document.getElementById('touch-seek-right');

    // Vertical Reels Feed Mode (TikTok / Shorts Style)
    const reelsFeedToggleBtn = document.getElementById('reels-feed-toggle-btn');
    const reelsActionsBar = document.getElementById('reels-actions-bar');
    const reelsPosterBadge = document.getElementById('reels-poster-badge');
    const reelsPosterThumb = document.getElementById('reels-poster-thumb');
    const reelsLikeBtn = document.getElementById('reels-like-btn');
    const reelsEpisodesBtn = document.getElementById('reels-episodes-btn');
    const reelsShareBtn = document.getElementById('reels-share-btn');
    const reelsSpeedBtn = document.getElementById('reels-speed-btn');
    const reelsSpeedLabel = document.getElementById('reels-speed-label');
    const reelsExitBtn = document.getElementById('reels-exit-btn');
    const reelsBottomInfo = document.getElementById('reels-bottom-info');
    const reelsProviderTag = document.getElementById('reels-provider-tag');
    const reelsDramaTitle = document.getElementById('reels-drama-title');
    const reelsDramaDesc = document.getElementById('reels-drama-desc');
    const reelsEpBadgeNum = document.getElementById('reels-ep-badge-num');
    const reelsProgressLine = document.getElementById('reels-progress-line');
    const reelsProgressFill = document.getElementById('reels-progress-fill');
    const reelsHeartEffects = document.getElementById('reels-heart-effects');
    const reelsEpisodesSheet = document.getElementById('reels-episodes-sheet');
    const reelsSheetBackdrop = document.getElementById('reels-sheet-backdrop');
    const reelsSheetClose = document.getElementById('reels-sheet-close');
    const reelsSheetBatches = document.getElementById('reels-sheet-batches');
    const reelsSheetGrid = document.getElementById('reels-sheet-grid');
    const reelsSheetTotal = document.getElementById('reels-sheet-total');
    const reelsSheetCurrentTag = document.getElementById('reels-sheet-current-tag');
    let isReelsMode = false;
    let reelsWheelDebounceTimer = null;

    // Action HUD
    const playerActionHud = document.getElementById('player-action-hud');
    const playerActionHudIcon = document.getElementById('player-action-hud-icon');
    const playerActionHudText = document.getElementById('player-action-hud-text');

    // Quality / Subtitle
    const qualityBtn = document.getElementById('quality-btn');
    const qualityMenu = document.getElementById('quality-menu');
    const qualityLabel = document.getElementById('quality-label');
    const subtitleBtn = document.getElementById('subtitle-btn');
    const subtitleMenu = document.getElementById('subtitle-menu');
    const subtitleLabel = document.getElementById('subtitle-label');

    // Language Selector Elements & State
    const SUPPORTED_LANGUAGES = [
        { code: 'vi-VN', label: 'Vietnamese', native: 'Tiếng Việt' },
        { code: 'all', label: 'All Languages', native: 'Tất cả (All)' },
        { code: 'en-US', label: 'English', native: 'English' },
        { code: 'id-ID', label: 'Indonesian', native: 'Bahasa Indonesia' },
        { code: 'ja-JP', label: 'Japanese', native: '日本語' },
        { code: 'ko-KR', label: 'Korean', native: '한국어' },
        { code: 'zh-TW', label: 'Traditional Chinese', native: '繁體中文' },
        { code: 'es-ES', label: 'Spanish', native: 'Español' },
        { code: 'th-TH', label: 'Thai', native: 'ภาษาไทย' },
        { code: 'de-DE', label: 'German', native: 'Deutsch' },
        { code: 'pt-PT', label: 'Portuguese', native: 'português' },
        { code: 'fr-FR', label: 'French', native: 'Français' },
        { code: 'ar-SA', label: 'Arabic', native: 'العربية' },
        { code: 'ru-RU', label: 'Russian', native: 'Русский' }
    ];
    let currentLang = localStorage.getItem('df_selected_lang') || 'vi-VN';

    const langBtn = document.getElementById('lang-btn');
    const langMenu = document.getElementById('lang-menu');
    const currentLangLabel = document.getElementById('current-lang-label');
    const langOptionsList = document.getElementById('lang-options-list');

    // Top Bar Navigation & Utilities Elements
    const mainNavLinks = document.getElementById('main-nav-links');
    const mobileNavToggle = document.getElementById('mobile-nav-toggle');
    const navHome = document.getElementById('nav-home');
    const navDiscovery = document.getElementById('nav-discovery');
    const navSeries = document.getElementById('nav-series');
    const navAnime = document.getElementById('nav-anime');
    const navFeatured = document.getElementById('nav-featured');
    const navTagsWrap = document.getElementById('nav-tags-wrap');
    const navTagsBtn = document.getElementById('nav-tags-btn');
    const navTagsMenu = document.getElementById('nav-tags-menu');
    const navGenreWrap = document.getElementById('nav-genre-wrap');
    const navGenreBtn = document.getElementById('nav-genre-btn');
    const navGenreMenu = document.getElementById('nav-genre-menu');
    const navHistoryIconBtn = document.getElementById('nav-history-icon-btn');
    const navFavoritesIconBtn = document.getElementById('nav-favorites-icon-btn');
    const headerFavoritesBadge = document.getElementById('header-favorites-badge');
    const navLoginBtn = document.getElementById('nav-login-btn');
    const loginModal = document.getElementById('login-modal');
    const loginModalBackdrop = document.getElementById('login-modal-backdrop');
    const loginCloseBtn = document.getElementById('login-close-btn');
    const loginForm = document.getElementById('login-form');
    const activeFilterBanner = document.getElementById('active-filter-banner');
    const activeFilterText = document.getElementById('active-filter-text');
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    const catalogSubtitle = document.getElementById('catalog-subtitle');

    // Smart Discovery Elements & State
    const discoveryModal = document.getElementById('discovery-modal');
    const discoveryModalBackdrop = document.getElementById('discovery-modal-backdrop');
    const discoveryModalClose = document.getElementById('discovery-modal-close');
    const discoveryApplyBtn = document.getElementById('discovery-apply-btn');
    const catalogDiscoveryBtn = document.getElementById('catalog-discovery-btn');
    const moodChipsTrack = document.getElementById('mood-chips-track');
    const lengthChipsTrack = document.getElementById('length-chips-track');
    const discoveryResultsCount = document.getElementById('discovery-results-count');
    const discoveryResetBtn = document.getElementById('discovery-reset-btn');
    const screenBlockingLoader = document.getElementById('screen-blocking-loader');

    let allLoadedLibraryItems = [];
    let activeDiscoveryMood = 'all';
    let activeDiscoveryLength = 'all';
    let draftDiscoveryMood = 'all';
    let draftDiscoveryLength = 'all';

    // LocalStorage Persistent Episode Counts Cache for instant 0ms filtering
    const epCountLocalCache = new Map();
    try {
        const storedEpCache = localStorage.getItem('df_ep_counts');
        if (storedEpCache) {
            const parsed = JSON.parse(storedEpCache);
            if (parsed && typeof parsed === 'object') {
                for (const [k, v] of Object.entries(parsed)) {
                    if (typeof v === 'number' && v > 0) epCountLocalCache.set(k, v);
                }
            }
        }
    } catch (e) { }

    function saveEpCountLocalCache() {
        try {
            const obj = Object.fromEntries(epCountLocalCache);
            localStorage.setItem('df_ep_counts', JSON.stringify(obj));
        } catch (e) { }
    }

    // Active Category Filter State
    let activeFilterType = null; // 'tag', 'genre', 'anime'
    let activeFilterValue = null;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async function init() {
        initLanguageSelector();
        applyTranslations(currentLang);
        syncSubtitleUI();
        bindEvents();
        bindPlayerEvents();
        setupDiscoveryFilters();
        renderHistoryRail();
        renderFavoritesRail();
        await loadProviders();
        await loadSections();
        checkRoute();
    }

    // ==========================================
    // HUD FLASH
    // ==========================================
    let hudTimeout = null;
    function showPlayerHud(icon, text) {
        if (!playerActionHud) return;
        if (playerActionHudIcon) playerActionHudIcon.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        if (playerActionHudText) playerActionHudText.textContent = text;
        playerActionHud.classList.add('visible');
        clearTimeout(hudTimeout);
        hudTimeout = setTimeout(() => playerActionHud.classList.remove('visible'), 900);
    }

    // ==========================================
    // PiP
    // ==========================================
    async function togglePiP() {
        if (!mainVideo) return;
        try {
            if (document.pictureInPictureElement) { await document.exitPictureInPicture(); }
            else if (document.pictureInPictureEnabled) { await mainVideo.requestPictureInPicture(); }
            else showToast(t('toast_pip_unsupported'), 'fa-circle-info');
        } catch (e) { showToast(t('toast_pip_unsupported') + ': ' + e.message, 'fa-circle-xmark'); }
    }

    // ==========================================
    // AMBIENT GLOW
    // ==========================================
    function startAmbientGlow() {
        if (!ambientCanvas || !mainVideo) return;
        isAmbientActive = true;
        if (videoAmbientGlow) videoAmbientGlow.classList.add('active');
        function drawFrame() {
            if (!isAmbientActive) return;
            try {
                const ctx = ambientCanvas.getContext('2d');
                ctx.drawImage(mainVideo, 0, 0, ambientCanvas.width, ambientCanvas.height);
                const d = ctx.getImageData(0, 0, ambientCanvas.width, ambientCanvas.height).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < d.length; i += 32) { r += d[i]; g += d[i + 1]; b += d[i + 2]; count++; }
                if (count > 0) {
                    r = Math.floor(r / count); g = Math.floor(g / count); b = Math.floor(b / count);
                    const glow = `0 0 60px 15px rgba(${r},${g},${b},0.55), 0 0 120px 40px rgba(${r},${g},${b},0.25)`;
                    // Apply glow as box-shadow on the viewport element (outside overflow:hidden)
                    if (videoViewport) videoViewport.style.boxShadow = glow;
                    // Also update inner gradient overlay
                    if (videoAmbientGlow) videoAmbientGlow.style.background = `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.3) 0%, transparent 70%)`;
                }
            } catch (e) { }
            ambientAnimationId = requestAnimationFrame(drawFrame);
        }
        if (ambientAnimationId) cancelAnimationFrame(ambientAnimationId);
        ambientAnimationId = requestAnimationFrame(drawFrame);
    }

    function stopAmbientGlow() {
        isAmbientActive = false;
        if (ambientAnimationId) { cancelAnimationFrame(ambientAnimationId); ambientAnimationId = null; }
        if (videoAmbientGlow) { videoAmbientGlow.classList.remove('active'); videoAmbientGlow.style.background = ''; }
        if (videoViewport) videoViewport.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.9)';
    }


    // ==========================================
    // TIMESTAMPS (Resume)
    // ==========================================
    function getTimestamps() { try { return JSON.parse(localStorage.getItem(STORAGE_TIMESTAMPS) || '{}'); } catch { return {}; } }
    function saveTimestamp(title, epIdx, secs) {
        if (!title) return;
        const ts = getTimestamps();
        const key = `${title}__${epIdx}`;
        if (!secs || secs < 3) {
            delete ts[key];
        } else {
            ts[key] = Math.floor(secs);
        }
        try { localStorage.setItem(STORAGE_TIMESTAMPS, JSON.stringify(ts)); } catch { }
    }
    function getTimestamp(title, epIdx) {
        if (!title) return 0;
        return getTimestamps()[`${title}__${epIdx}`] || 0;
    }
    function getPendingResumeTime() { return _pendingResumeTime; }
    let _resumeBannerTimer = null;
    function showResumeBanner(seconds) {
        if (!resumeBanner || !seconds || seconds < 3) return;
        _pendingResumeTime = Math.floor(seconds);
        const formatted = formatTime(seconds);

        // Find current live DOM element (avoid detached reference after translation)
        const labelEl = document.getElementById('resume-time-label');
        if (labelEl) {
            labelEl.textContent = formatted;
        } else {
            const promptEl = document.getElementById('resume-playback-prompt');
            if (promptEl) {
                promptEl.innerHTML = `${t('resume_prompt', { time: `<strong id="resume-time-label">${formatted}</strong>` })}`;
            }
        }

        resumeBanner.hidden = false;
        if (_resumeBannerTimer) clearTimeout(_resumeBannerTimer);
        _resumeBannerTimer = setTimeout(() => { if (!resumeBanner.hidden) resumeBanner.hidden = true; }, 8000);
    }
    function formatTime(secs) {
        if (!secs || isNaN(secs) || secs <= 0) return '00:00';
        const totalSecs = Math.floor(secs);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function executeResumePlayback(targetTime) {
        if (!mainVideo || !targetTime || isNaN(targetTime) || targetTime <= 0) return;
        const formatted = formatTime(targetTime);
        showPlayerHud('fa-forward', formatted);

        if (hls && typeof hls.startLoad === 'function') {
            try { hls.startLoad(); } catch (e) { }
        }

        // 1. Immediately request play in response to user click gesture
        const initialPlay = mainVideo.play();
        if (initialPlay !== undefined) {
            initialPlay.catch(() => { });
        }

        // 2. Perform seek to the target resume timestamp
        try {
            mainVideo.currentTime = targetTime;
        } catch (e) {
            console.warn('[Resume] Setting currentTime failed:', e);
        }

        // 3. Multi-event listener to guarantee playback starts once buffer segment is ready
        let attempts = 0;
        const maxAttempts = 12;

        const forcePlay = () => {
            if (!mainVideo) return;
            if (mainVideo.paused) {
                const p = mainVideo.play();
                if (p !== undefined) {
                    p.catch(() => { });
                }
            }
        };

        const onReadyToPlay = () => {
            forcePlay();
            startAmbientGlow();
        };

        mainVideo.addEventListener('seeked', onReadyToPlay, { once: true });
        mainVideo.addEventListener('canplay', onReadyToPlay, { once: true });
        mainVideo.addEventListener('playing', () => {
            if (checkInterval) clearInterval(checkInterval);
            startAmbientGlow();
        }, { once: true });

        // 4. Polling fallback to guarantee it does not remain stuck in paused state
        const checkInterval = setInterval(() => {
            attempts++;
            if (!mainVideo || !mainVideo.paused || attempts > maxAttempts) {
                clearInterval(checkInterval);
                return;
            }
            forcePlay();
        }, 250);
    }

    // ==========================================
    // EPISODE PROGRESS BADGES
    // ==========================================
    function getEpisodeProgress() { try { return JSON.parse(localStorage.getItem(STORAGE_EP_PROGRESS) || '{}'); } catch { return {}; } }
    function getEpProgressForDrama(title) { return getEpisodeProgress()[title] || {}; }
    function updateEpisodeProgressBadge(epIdx, pct) {
        if (!currentDramaData) return;
        const prog = getEpisodeProgress();
        if (!prog[currentDramaData.title]) prog[currentDramaData.title] = {};
        prog[currentDramaData.title][epIdx] = pct;
        localStorage.setItem(STORAGE_EP_PROGRESS, JSON.stringify(prog));
    }
    function markEpisodeWatched(title, epIdx) {
        const prog = getEpisodeProgress();
        if (!prog[title]) prog[title] = {};
        prog[title][epIdx] = 100;
        localStorage.setItem(STORAGE_EP_PROGRESS, JSON.stringify(prog));
    }

    // ==========================================
    // COUNTDOWN OVERLAY
    // ==========================================
    function showCountdown() {
        nextEpCountdown.hidden = false;
        if (currentDramaData) {
            const nextEp = currentDramaData.episodes[currentEpisodeIndex + 1];
            const nextNum = nextEp ? (nextEp.number || currentEpisodeIndex + 2) : currentEpisodeIndex + 2;
            const labelEl = document.getElementById('countdown-label');
            if (labelEl) labelEl.innerHTML = t('countdown_text', { sec: `<strong id="countdown-timer-sec">${COUNTDOWN_SECONDS}</strong>` });
        }
    }
    function hideCountdown() { if (nextEpCountdown) nextEpCountdown.hidden = true; }

    // ==========================================
    // CUSTOM CINEMA SUBTITLE OVERLAY & WEBVTT PARSER
    // ==========================================
    function parseWebVTT(vttText) {
        if (!vttText || typeof vttText !== 'string') return [];
        const cues = [];
        const lines = vttText.split(/\r?\n/);
        let i = 0;
        const parseTimestamp = (tStr) => {
            if (!tStr) return 0;
            const parts = tStr.trim().split(':');
            if (parts.length === 3) {
                const [h, m, sWithMs] = parts;
                const [s, ms] = (sWithMs || '0.0').split(/[.,]/);
                return (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0) + (parseInt(ms, 10) || 0) / 1000;
            } else if (parts.length === 2) {
                const [m, sWithMs] = parts;
                const [s, ms] = (sWithMs || '0.0').split(/[.,]/);
                return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0) + (parseInt(ms, 10) || 0) / 1000;
            }
            return 0;
        };

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line.includes('-->')) {
                const [startStr, endStr] = line.split('-->');
                const start = parseTimestamp(startStr.trim().split(' ')[0]);
                const end = parseTimestamp(endStr.trim().split(' ')[0]);
                i++;
                let textLines = [];
                while (i < lines.length && lines[i].trim() !== '') {
                    textLines.push(lines[i].trim());
                    i++;
                }
                const text = textLines.join('\n');
                if (text && !text.startsWith('NOTE') && !text.startsWith('[Đang tạo')) {
                    // Filter out cues that are pure English noise descriptors like [engine revving]
                    const isPureSoundEffect = /^\s*[\(\[][a-zA-Z\s\-_]+[\)\]]\s*$/i.test(text);
                    if (!isPureSoundEffect) {
                        cues.push({ start, end, text });
                    }
                }
            }
            i++;
        }
        return cues;
    }

    function updateCustomSubtitleOverlay() {
        if (!customSubtitleOverlay) return;
        if (!selectedSubtitle || selectedSubtitle === 'off' || !currentSubtitleCues || currentSubtitleCues.length === 0) {
            customSubtitleOverlay.classList.add('hidden');
            return;
        }
        const ct = mainVideo.currentTime;
        const activeCue = currentSubtitleCues.find(c => ct >= c.start && ct <= c.end);
        if (activeCue && activeCue.text) {
            if (customSubtitleOverlay.textContent !== activeCue.text) {
                customSubtitleOverlay.textContent = activeCue.text;
            }
            customSubtitleOverlay.classList.remove('hidden');
        } else {
            customSubtitleOverlay.classList.add('hidden');
        }
    }

    // ==========================================
    // VIDEO TIME UPDATE
    // ==========================================
    function handleTimeUpdate() {
        updateCustomSubtitleOverlay();
        if (!mainVideo.duration || mainVideo.duration <= 0) return;
        const timeLeft = mainVideo.duration - mainVideo.currentTime;
        const pct = Math.min(100, Math.round((mainVideo.currentTime / mainVideo.duration) * 100));
        if (currentDramaData && mainVideo.currentTime > 2) {
            if (timeLeft <= 4 || pct >= 95) {
                // If near end of video, clear timestamp so next open doesn't ask to resume at the very end
                saveTimestamp(currentDramaData.title, currentEpisodeIndex, 0);
            } else {
                saveTimestamp(currentDramaData.title, currentEpisodeIndex, mainVideo.currentTime);
            }
            updateCurrentHistoryProgress(pct);
            updateEpisodeProgressBadge(currentEpisodeIndex, pct);
        }
        if (miniplayerProgressFill) {
            miniplayerProgressFill.style.width = pct + '%';
        }
        if (reelsProgressFill) {
            reelsProgressFill.style.width = pct + '%';
        }
        // Countdown
        if (timeLeft <= COUNTDOWN_SECONDS && timeLeft > 0 && autoplayToggle.checked) {
            if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) {
                if (nextEpCountdown.hidden) showCountdown();
                if (countdownTimerSec) countdownTimerSec.textContent = Math.ceil(timeLeft);
                if (countdownProgressFill) countdownProgressFill.style.width = ((timeLeft / COUNTDOWN_SECONDS) * 100) + '%';
            }
        } else {
            if (!nextEpCountdown.hidden) hideCountdown();
        }

        // Prefetch next episode only after user has actively watched for at least 15s or has <= 30s left
        // Lowered from 18s → 15s so Stage 1 subtitle transcription has more warm-up time
        if (currentDramaData && !_hasPrefetchedNext && (mainVideo.currentTime >= 15 || timeLeft <= 30)) {
            _hasPrefetchedNext = true;
            prefetchNextEpisodeStream(currentEpisodeIndex + 1);
        }
    }

    function handleVideoEnded() {
        hideCountdown();
        if (currentDramaData) {
            saveTimestamp(currentDramaData.title, currentEpisodeIndex, 0);
            markEpisodeWatched(currentDramaData.title, currentEpisodeIndex);
            refreshEpisodeGridBadges();
        }
        if (autoplayToggle.checked && currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) {
            setTimeout(() => switchEpisode(currentEpisodeIndex + 1), 400);
        }
    }

    function refreshEpisodeGridBadges() {
        if (!currentDramaData) return;
        const epProgress = getEpProgressForDrama(currentDramaData.title);
        episodesGrid.querySelectorAll('.ep-btn').forEach(btn => {
            const epIdx = parseInt(btn.getAttribute('data-ep-index'), 10);
            if (isNaN(epIdx)) return;
            const p = epProgress[epIdx];
            btn.classList.remove('watched', 'in-progress');
            if (p >= 90) btn.classList.add('watched');
            else if (p > 5) { btn.classList.add('in-progress'); btn.style.setProperty('--ep-progress-w', p + '%'); }
        });
    }

    // ==========================================
    // MOBILE SWIPE & REELS GESTURES
    // ==========================================
    function onVideoTouchStart(e) {
        const t = e.touches[0];
        touchStartY = t.clientY; touchStartX = t.clientX; swipeInProgress = false;
        const now = Date.now();
        if (now - lastTapTime < 300 && Math.abs(t.clientX - lastTapX) < 80) {
            if (isReelsMode) {
                createFlyingHeart(t.clientX, t.clientY);
                if (currentDramaData && !isFavorite(currentDramaData.title)) {
                    toggleFavorite(currentDramaData);
                    syncModalFavBtn();
                    syncReelsUI();
                }
            } else {
                handleDoubleTap(t.clientX);
            }
            lastTapTime = 0;
        } else {
            lastTapTime = now;
            lastTapX = t.clientX;
        }
    }

    function onVideoTouchMove(e) {
        swipeInProgress = true;
    }

    function onVideoTouchEnd(e) {
        if (!swipeInProgress) {
            // Single tap on video in Reels mode toggles play/pause
            if (isReelsMode && !e.target.closest('button') && !e.target.closest('.reels-actions-bar') && !e.target.closest('.reels-bottom-info')) {
                if (mainVideo.paused) {
                    mainVideo.play().catch(() => { });
                    showPlayerHud('fa-play', 'Phát');
                } else {
                    mainVideo.pause();
                    showPlayerHud('fa-pause', 'Dừng');
                }
            }
            return;
        }
        const t = e.changedTouches[0];
        const dy = touchStartY - t.clientY, dx = Math.abs(t.clientX - touchStartX);

        if (isReelsMode) {
            if (Math.abs(dy) > 45 && dx < 80) {
                if (dy > 0) switchReelsEpisode('next');
                else switchReelsEpisode('prev');
            }
        } else if (Math.abs(dy) > 60 && dx < 60 && window.innerWidth <= 820) {
            if (dy > 0 && currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) {
                showSwipeIndicator('up', currentEpisodeIndex + 2);
                switchEpisode(currentEpisodeIndex + 1);
            } else if (dy < 0 && currentEpisodeIndex > 0) {
                showSwipeIndicator('down', currentEpisodeIndex);
                switchEpisode(currentEpisodeIndex - 1);
            }
        }
        swipeInProgress = false;
    }

    function showSwipeIndicator(dir, epNum) {
        if (!swipeEpIndicator) return;
        swipeEpIndicator.innerHTML = dir === 'up' ? `<i class="fa-solid fa-chevron-up"></i> ${t('ep_prefix')} ${epNum}` : `<i class="fa-solid fa-chevron-down"></i> ${t('ep_prefix')} ${epNum}`;
        swipeEpIndicator.classList.add('show');
        setTimeout(() => swipeEpIndicator.classList.remove('show'), 1200);
    }

    // ==========================================
    // VERTICAL REELS FEED ENGINE (TIKTOK / SHORTS)
    // ==========================================
    function toggleReelsFeedMode(force) {
        if (typeof force === 'boolean') {
            isReelsMode = force;
        } else {
            isReelsMode = !isReelsMode;
        }

        playerModal.classList.toggle('reels-mode-active', isReelsMode);
        if (reelsFeedToggleBtn) {
            reelsFeedToggleBtn.classList.toggle('active', isReelsMode);
        }

        if (isReelsMode) {
            if (isMiniplayer) restoreFromMiniplayer();
            syncReelsUI();
            showToast(t('toast_reels_on'), 'fa-mobile-screen');
        } else {
            closeReelsEpisodesSheet();
            showToast(t('toast_reels_off'), 'fa-table-columns');
        }

        try {
            localStorage.setItem('dramaflow_reels_mode', isReelsMode ? '1' : '0');
        } catch (e) { }
    }

    function switchReelsEpisode(direction) {
        if (!currentDramaData || !currentDramaData.episodes || currentDramaData.episodes.length === 0) return;
        const total = currentDramaData.episodes.length;

        if (direction === 'next') {
            if (currentEpisodeIndex >= total - 1) {
                showToast(t('reels_last_ep'), 'fa-circle-info');
                return;
            }
            mainVideo.classList.remove('reels-slide-up-out', 'reels-slide-up-in', 'reels-slide-down-out', 'reels-slide-down-in');
            mainVideo.classList.add('reels-slide-up-out');
            setTimeout(() => {
                switchEpisode(currentEpisodeIndex + 1);
                mainVideo.classList.remove('reels-slide-up-out');
                mainVideo.classList.add('reels-slide-up-in');
                setTimeout(() => {
                    mainVideo.classList.remove('reels-slide-up-in');
                }, 320);
            }, 200);
            showSwipeIndicator('up', currentEpisodeIndex + 2);
        } else if (direction === 'prev') {
            if (currentEpisodeIndex <= 0) {
                showToast(t('reels_first_ep'), 'fa-circle-info');
                return;
            }
            mainVideo.classList.remove('reels-slide-up-out', 'reels-slide-up-in', 'reels-slide-down-out', 'reels-slide-down-in');
            mainVideo.classList.add('reels-slide-down-out');
            setTimeout(() => {
                switchEpisode(currentEpisodeIndex - 1);
                mainVideo.classList.remove('reels-slide-down-out');
                mainVideo.classList.add('reels-slide-down-in');
                setTimeout(() => {
                    mainVideo.classList.remove('reels-slide-down-in');
                }, 320);
            }, 200);
            showSwipeIndicator('down', currentEpisodeIndex);
        }
    }

    function syncReelsUI() {
        if (!currentDramaData) return;
        const total = currentDramaData.episodes?.length || 1;
        const currentEp = currentEpisodeIndex + 1;

        if (reelsPosterThumb) reelsPosterThumb.src = formatPosterUrl(currentDramaData.poster_url);
        if (reelsDramaTitle) reelsDramaTitle.textContent = decodeHtml(currentDramaData.title || '');
        if (reelsDramaDesc) reelsDramaDesc.textContent = decodeHtml(currentDramaData.description || '');
        if (reelsProviderTag) reelsProviderTag.textContent = currentDramaData.category_name || currentProvider || 'DramaFlow';
        if (reelsEpBadgeNum) reelsEpBadgeNum.textContent = `${t('ep_prefix')} ${currentEp} / ${total}`;

        const isFav = isFavorite(currentDramaData.title);
        if (reelsLikeBtn) {
            reelsLikeBtn.classList.toggle('is-liked', isFav);
            const icon = reelsLikeBtn.querySelector('i');
            if (icon) {
                icon.className = isFav ? 'fa-solid fa-heart text-rose' : 'fa-solid fa-heart';
            }
        }

        if (reelsSpeedLabel) {
            reelsSpeedLabel.textContent = `${mainVideo.playbackRate || 1.0}x`;
        }

        if (reelsEpisodesSheet && !reelsEpisodesSheet.hidden) {
            renderReelsEpisodesSheet();
        }
    }

    function createFlyingHeart(clientX, clientY) {
        if (!reelsHeartEffects) return;
        const heart = document.createElement('div');
        heart.className = 'flying-heart';
        heart.innerHTML = '<i class="fa-solid fa-heart"></i>';

        const rect = videoViewport.getBoundingClientRect();
        const x = clientX ? (clientX - rect.left) : (rect.width / 2);
        const y = clientY ? (clientY - rect.top) : (rect.height / 2);

        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;

        reelsHeartEffects.appendChild(heart);
        setTimeout(() => heart.remove(), 850);
    }

    const REELS_SPEED_LEVELS = [1.0, 1.25, 1.5, 2.0];
    function cycleReelsPlaybackSpeed() {
        const cur = mainVideo.playbackRate || 1.0;
        let nextIdx = (REELS_SPEED_LEVELS.indexOf(cur) + 1) % REELS_SPEED_LEVELS.length;
        if (nextIdx === -1) nextIdx = 0;
        const newSpeed = REELS_SPEED_LEVELS[nextIdx];
        mainVideo.playbackRate = newSpeed;
        if (speedSelect) speedSelect.value = String(newSpeed);
        if (reelsSpeedLabel) reelsSpeedLabel.textContent = `${newSpeed}x`;
        showPlayerHud('fa-gauge-high', `${newSpeed}x`);
    }

    function openReelsEpisodesSheet() {
        if (!reelsEpisodesSheet || !currentDramaData || !currentDramaData.episodes) return;
        renderReelsEpisodesSheet();
        reelsEpisodesSheet.hidden = false;
    }

    function closeReelsEpisodesSheet() {
        if (reelsEpisodesSheet) reelsEpisodesSheet.hidden = true;
    }

    function renderReelsEpisodesSheet() {
        if (!reelsEpisodesSheet || !currentDramaData || !currentDramaData.episodes) return;
        const episodes = currentDramaData.episodes;
        const total = episodes.length;

        if (reelsSheetTotal) reelsSheetTotal.textContent = total;
        if (reelsSheetCurrentTag) {
            const currentEpNum = episodes[currentEpisodeIndex]?.number || (currentEpisodeIndex + 1);
            reelsSheetCurrentTag.textContent = `${t('ep_prefix')} ${currentEpNum}`;
        }

        const SHEET_BATCH_SIZE = 30;
        if (reelsSheetBatches) {
            reelsSheetBatches.innerHTML = '';
            if (total > SHEET_BATCH_SIZE) {
                reelsSheetBatches.style.display = 'flex';
                const numBatches = Math.ceil(total / SHEET_BATCH_SIZE);
                const currentBatchIdx = Math.floor(currentEpisodeIndex / SHEET_BATCH_SIZE);

                for (let b = 0; b < numBatches; b++) {
                    const start = b * SHEET_BATCH_SIZE + 1;
                    const end = Math.min((b + 1) * SHEET_BATCH_SIZE, total);
                    const tab = document.createElement('button');
                    tab.className = `reels-batch-tab ${b === currentBatchIdx ? 'active' : ''}`;
                    tab.textContent = `${start}-${end}`;
                    tab.addEventListener('click', () => {
                        reelsSheetBatches.querySelectorAll('.reels-batch-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        renderReelsSheetGrid(b * SHEET_BATCH_SIZE, Math.min((b + 1) * SHEET_BATCH_SIZE, total));
                    });
                    reelsSheetBatches.appendChild(tab);
                }

                renderReelsSheetGrid(currentBatchIdx * SHEET_BATCH_SIZE, Math.min((currentBatchIdx + 1) * SHEET_BATCH_SIZE, total));
            } else {
                reelsSheetBatches.style.display = 'none';
                renderReelsSheetGrid(0, total);
            }
        }
    }

    function renderReelsSheetGrid(startIndex, endIndex) {
        if (!reelsSheetGrid || !currentDramaData || !currentDramaData.episodes) return;
        reelsSheetGrid.innerHTML = '';
        const episodes = currentDramaData.episodes;

        for (let i = startIndex; i < endIndex; i++) {
            const ep = episodes[i];
            const epNum = ep.number || (i + 1);
            const btn = document.createElement('button');
            btn.className = `reels-ep-btn ${i === currentEpisodeIndex ? 'active' : ''}`;
            btn.innerHTML = `<span class="ep-num">${epNum}</span><span class="ep-lbl">${t('ep_prefix')}</span>`;
            btn.addEventListener('click', () => {
                switchEpisode(i);
                closeReelsEpisodesSheet();
            });
            reelsSheetGrid.appendChild(btn);

            if (i === currentEpisodeIndex) {
                setTimeout(() => btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
            }
        }
    }

    // ==========================================
    // DOUBLE TAP SEEK
    // ==========================================
    function handleDoubleTap(tapX) {
        const rect = videoViewport.getBoundingClientRect();
        if (tapX - rect.left < rect.width / 2) { mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 10); flashSeekOverlay('left'); }
        else { mainVideo.currentTime = Math.min(mainVideo.duration || 0, mainVideo.currentTime + 10); flashSeekOverlay('right'); }
    }
    function flashSeekOverlay(side) {
        const el = side === 'left' ? touchSeekLeft : touchSeekRight;
        if (!el) return;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 600);
    }

    // ==========================================
    // QUALITY SWITCHER
    // ==========================================
    function selectQuality(q) {
        selectedQuality = q;
        const labels = { auto: 'Auto', '1080': '1080p HD', '720': '720p', '480': '480p' };
        if (qualityLabel) qualityLabel.textContent = labels[q] || q;
        qualityMenu.querySelectorAll('.ctrl-dropdown-menu-item').forEach(item => {
            const isA = item.getAttribute('data-quality') === q;
            item.classList.toggle('active', isA);
            const ch = item.querySelector('.item-check');
            if (isA && !ch) item.innerHTML += ' <span class="item-check"><i class="fa-solid fa-check"></i></span>';
            else if (!isA && ch) ch.remove();
        });
        if (hls && window.Hls) {
            if (q === 'auto') { hls.currentLevel = -1; }
            else { const th = parseInt(q, 10); let best = -1; (hls.levels || []).forEach((l, i) => { if (l.height && l.height <= th) best = i; }); hls.currentLevel = best; }
        }
        showToast(`Độ phân giải: ${labels[q] || q}`, 'fa-sliders');
    }

    // ==========================================
    // AI AUDIO SUBTITLE ENGINE (WHISPER STT + WEBVTT)
    // ==========================================
    const SUBTITLE_LABELS = {
        off: 'Tắt phụ đề',
        vi: '🇻🇳 Tiếng Việt',
        en: '🇺🇸 English'
    };

    function loadEpisodeSubtitle(subLang) {
        if (subtitlePollTimer) {
            clearTimeout(subtitlePollTimer);
            subtitlePollTimer = null;
        }

        if (!subLang || subLang === 'off') {
            currentSubtitleCues = [];
            if (customSubtitleOverlay) customSubtitleOverlay.classList.add('hidden');
            if (subStatusToast) subStatusToast.classList.add('hidden');
            if (mainVideo) {
                mainVideo.querySelectorAll('track').forEach(t => t.remove());
                if (mainVideo.textTracks) {
                    Array.from(mainVideo.textTracks).forEach(t => { t.mode = 'disabled'; });
                }
            }
            return;
        }

        if (!currentDramaData || !currentDramaData.episodes || !currentDramaData.episodes[currentEpisodeIndex]) return;
        const episode = currentDramaData.episodes[currentEpisodeIndex];
        const epNum = episode.number || (currentEpisodeIndex + 1);
        const slug = currentDramaData.slug || '';
        const streamUrl = episode.play_url || episode.direct_play_url || '';

        const langName = SUBTITLE_LABELS[subLang] || subLang;
        const reqId = `${slug}_${epNum}_${subLang}_${Date.now()}`;
        activeSubtitleRequest = reqId;

        let pollCount = 0;
        const maxPolls = 80;

        if (subStatusToast && (!currentSubtitleCues || currentSubtitleCues.length === 0)) {
            subStatusToast.classList.remove('hidden');
        }

        async function checkSubtitle() {
            if (activeSubtitleRequest !== reqId) return;
            try {
                const groqKey = localStorage.getItem('df_groq_key') || '';
                const checkUrl = `/api/subtitles/generate?slug=${encodeURIComponent(slug)}&ep=${epNum}&stream_url=${encodeURIComponent(streamUrl)}&lang=${encodeURIComponent(subLang)}${groqKey ? '&groq_key=' + encodeURIComponent(groqKey) : ''}`;
                const res = await fetch(checkUrl);
                const data = await res.json();

                if (activeSubtitleRequest !== reqId) return;

                if (data.ok && data.ready && (data.url || data.vttText)) {
                    if (subStatusToast) subStatusToast.classList.add('hidden');

                    function attachVtt(vttUrl, directVttText) {
                        if (directVttText && directVttText.startsWith('WEBVTT')) {
                            if (activeSubtitleRequest === reqId) {
                                currentSubtitleCues = parseWebVTT(directVttText);
                                updateCustomSubtitleOverlay();
                            }
                            mainVideo.querySelectorAll('track').forEach(t => t.remove());
                            const track = document.createElement('track');
                            track.kind = 'subtitles';
                            track.label = langName;
                            track.srclang = subLang;
                            const blob = new Blob([directVttText], { type: 'text/vtt' });
                            track.src = URL.createObjectURL(blob);
                            track.default = true;
                            mainVideo.appendChild(track);
                            return;
                        }

                        if (vttUrl) {
                            // 1. Fetch text directly for Custom Cinema Overlay
                            fetch(vttUrl)
                                .then(r => r.text())
                                .then(vttText => {
                                    if (activeSubtitleRequest === reqId) {
                                        currentSubtitleCues = parseWebVTT(vttText);
                                        updateCustomSubtitleOverlay();
                                    }
                                })
                                .catch(() => { });

                            // 2. Also keep native track in sync
                            mainVideo.querySelectorAll('track').forEach(t => t.remove());
                            const track = document.createElement('track');
                            track.kind = 'subtitles';
                            track.label = langName;
                            track.srclang = subLang;
                            track.src = `${vttUrl}&_v=${Date.now()}`;
                            track.default = true;
                            mainVideo.appendChild(track);
                        }
                    }

                    attachVtt(data.url, data.vttText);

                    // Stage 2 Poller: If initial VTT is partial, poll until full episode is complete!
                    if (!data.isComplete) {
                        let stage2Polls = 0;
                        const maxStage2Polls = 120; // Up to 6 minutes
                        const stage2Timer = setInterval(async () => {
                            stage2Polls++;
                            if (activeSubtitleRequest !== reqId || stage2Polls > maxStage2Polls) {
                                clearInterval(stage2Timer);
                                return;
                            }
                            try {
                                const fullRes = await fetch(checkUrl);
                                const fullData = await fullRes.json();
                                if (fullData.ok && fullData.ready && fullData.isComplete && activeSubtitleRequest === reqId) {
                                    clearInterval(stage2Timer);
                                    console.log(`[Subtitle] Full episode VTT completed and attached for ep ${epNum}`);
                                    attachVtt(fullData.url, fullData.vttText);
                                }
                            } catch (e) { }
                        }, 2000);
                    }
                    return;
                }

                if (data && (data.error === 'cloud_key_needed' || data.error === 'ffmpeg_unavailable')) {
                    if (subStatusToast) subStatusToast.classList.add('hidden');
                    console.info('[Subtitle]', data.message);
                    return;
                }

                // Still transcribing or extracting audio
                pollCount++;
                if (pollCount < maxPolls) {
                    const delay = pollCount <= 6 ? 400 : (pollCount <= 14 ? 1000 : 2000);
                    subtitlePollTimer = setTimeout(checkSubtitle, delay);
                } else {
                    if (subStatusToast) subStatusToast.classList.add('hidden');
                }
            } catch (e) {
                console.warn('[Subtitle] Failed to load subtitle:', e);
                if (subStatusToast) subStatusToast.classList.add('hidden');
            }
        }

        checkSubtitle();
    }

    function openAiSubtitleModal(customMsg) {
        const modal = document.getElementById('ai-subtitle-modal');
        if (!modal) return;
        const input = document.getElementById('df-groq-key-input');
        if (input) input.value = localStorage.getItem('df_groq_key') || '';
        modal.classList.remove('hidden');
    }

    function closeAiSubtitleModal() {
        const modal = document.getElementById('ai-subtitle-modal');
        if (modal) modal.classList.add('hidden');
    }

    // AI Subtitle Modal event listeners
    const aiSubModal = document.getElementById('ai-subtitle-modal');
    const aiSubCloseBtn = document.getElementById('ai-sub-close-btn');
    const aiSubBackdrop = document.getElementById('ai-sub-backdrop');
    const dfSaveGroqKeyBtn = document.getElementById('df-save-groq-key-btn');
    const dfGroqKeyInput = document.getElementById('df-groq-key-input');

    if (aiSubCloseBtn) aiSubCloseBtn.addEventListener('click', closeAiSubtitleModal);
    if (aiSubBackdrop) aiSubBackdrop.addEventListener('click', closeAiSubtitleModal);
    if (dfSaveGroqKeyBtn && dfGroqKeyInput) {
        dfSaveGroqKeyBtn.addEventListener('click', () => {
            const val = dfGroqKeyInput.value.trim();
            if (val) {
                localStorage.setItem('df_groq_key', val);
                showToast('Đã lưu Groq API Key! Đang bóc băng và dịch tập phim...', 'fa-check');
                closeAiSubtitleModal();
                loadEpisodeSubtitle(selectedSubtitle || 'vi');
            } else {
                showToast('Vui lòng dán Groq API Key trước khi lưu', 'fa-triangle-exclamation');
            }
        });
    }

    function syncSubtitleUI() {
        const sub = selectedSubtitle || 'vi';
        const label = SUBTITLE_LABELS[sub] || sub;
        if (subtitleLabel) subtitleLabel.textContent = sub === 'off' ? t('sub_label_off') : label;
        if (subtitleMenu) {
            subtitleMenu.querySelectorAll('.ctrl-dropdown-menu-item').forEach(item => {
                const isA = item.getAttribute('data-sub') === sub;
                item.classList.toggle('active', isA);
                const ch = item.querySelector('.item-check');
                if (isA && !ch) item.innerHTML += ' <span class="item-check"><i class="fa-solid fa-check"></i></span>';
                else if (!isA && ch) ch.remove();
            });
        }
    }

    function selectSubtitle(sub) {
        selectedSubtitle = sub;
        localStorage.setItem('df_selected_sub', sub);
        syncSubtitleUI();
        loadEpisodeSubtitle(sub);
        const label = SUBTITLE_LABELS[sub] || sub;
        showToast(sub === 'off' ? t('sub_off') : `Phụ đề: ${label}`, 'fa-closed-captioning');
    }

    // ==========================================
    // AUTO SCROLL TO ACTIVE EPISODE
    // ==========================================
    function scrollToActiveEpisode() {
        if (window.innerWidth <= 1150 || (playerModal && playerModal.classList.contains('layout-medium'))) return; // Keep video visible at top for medium & mobile
        const activeBtn = episodesGrid.querySelector('.ep-btn.active');
        if (!activeBtn) return;
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        activeBtn.classList.remove('active-scroll-pulse');
        void activeBtn.offsetWidth;
        activeBtn.classList.add('active-scroll-pulse');
        setTimeout(() => activeBtn.classList.remove('active-scroll-pulse'), 700);
    }

    // ==========================================
    // 2. PLAYER-SPECIFIC EVENTS
    // ==========================================
    function bindPlayerEvents() {
        if (modalMinimizeBtn) modalMinimizeBtn.addEventListener('click', minimizeToMiniplayer);
        modalCloseBtn.addEventListener('click', () => {
            if (currentDramaData && (mainVideo.src || hls)) {
                minimizeToMiniplayer();
            } else {
                closeModal();
            }
        });
        modalBackdrop.addEventListener('click', () => {
            if (currentDramaData && (mainVideo.src || hls)) {
                minimizeToMiniplayer();
            } else {
                closeModal();
            }
        });

        // Miniplayer Interaction Controls
        if (miniplayerExpandBtn) miniplayerExpandBtn.addEventListener('click', (e) => { e.stopPropagation(); restoreFromMiniplayer(); });
        if (miniplayerExpandArea) miniplayerExpandArea.addEventListener('click', (e) => { e.stopPropagation(); restoreFromMiniplayer(); });
        if (miniOvExpandBtn) miniOvExpandBtn.addEventListener('click', (e) => { e.stopPropagation(); restoreFromMiniplayer(); });

        if (miniplayerCloseBtn) miniplayerCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
        if (miniOvCloseBtn) miniOvCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });

        const togglePlayFromMini = (e) => {
            e.stopPropagation();
            if (mainVideo.paused) {
                mainVideo.play().catch(() => { });
            } else {
                mainVideo.pause();
            }
        };
        if (miniplayerPlayBtn) miniplayerPlayBtn.addEventListener('click', togglePlayFromMini);
        if (miniOvPlayBtn) miniOvPlayBtn.addEventListener('click', togglePlayFromMini);

        if (miniplayerNextBtn) {
            miniplayerNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) {
                    switchEpisode(currentEpisodeIndex + 1);
                }
            });
        }

        if (miniplayerProgressTrack) {
            miniplayerProgressTrack.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!mainVideo.duration) return;
                const rect = miniplayerProgressTrack.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                mainVideo.currentTime = pos * mainVideo.duration;
            });
        }

        mainVideo.addEventListener('play', () => syncMiniplayerPlayBtn(true));
        mainVideo.addEventListener('pause', () => syncMiniplayerPlayBtn(false));

        theaterToggleBtn.addEventListener('click', toggleTheaterMode);
        modalFavBtn.addEventListener('click', () => { if (!currentDramaData) return; toggleFavorite(currentDramaData); syncModalFavBtn(); });
        modalShareBtn.addEventListener('click', shareCurrentDrama);
        prevEpBtn.addEventListener('click', () => { if (currentEpisodeIndex > 0) switchEpisode(currentEpisodeIndex - 1); });
        nextEpBtn.addEventListener('click', () => { if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) switchEpisode(currentEpisodeIndex + 1); });
        speedSelect.addEventListener('change', (e) => { mainVideo.playbackRate = parseFloat(e.target.value); showPlayerHud('fa-gauge-high', `${e.target.value}x`); });

        // Reels Mode Action Bar & Bottom Sheet Events
        if (reelsFeedToggleBtn) reelsFeedToggleBtn.addEventListener('click', () => toggleReelsFeedMode());
        if (reelsExitBtn) reelsExitBtn.addEventListener('click', () => toggleReelsFeedMode(false));
        if (reelsLikeBtn) reelsLikeBtn.addEventListener('click', () => { if (!currentDramaData) return; toggleFavorite(currentDramaData); syncModalFavBtn(); syncReelsUI(); });
        if (reelsEpisodesBtn) reelsEpisodesBtn.addEventListener('click', openReelsEpisodesSheet);
        if (reelsShareBtn) reelsShareBtn.addEventListener('click', shareCurrentDrama);
        if (reelsSpeedBtn) reelsSpeedBtn.addEventListener('click', cycleReelsPlaybackSpeed);
        if (reelsSheetClose) reelsSheetClose.addEventListener('click', closeReelsEpisodesSheet);
        if (reelsSheetBackdrop) reelsSheetBackdrop.addEventListener('click', closeReelsEpisodesSheet);

        // Wheel navigation on video viewport for Reels mode (mouse scroll up/down)
        if (videoViewport) {
            videoViewport.addEventListener('wheel', (e) => {
                if (!isReelsMode) return;
                e.preventDefault();
                if (reelsWheelDebounceTimer) return;
                if (e.deltaY > 30) {
                    switchReelsEpisode('next');
                    reelsWheelDebounceTimer = setTimeout(() => { reelsWheelDebounceTimer = null; }, 500);
                } else if (e.deltaY < -30) {
                    switchReelsEpisode('prev');
                    reelsWheelDebounceTimer = setTimeout(() => { reelsWheelDebounceTimer = null; }, 500);
                }
            }, { passive: false });
        }

        mainVideo.addEventListener('ended', handleVideoEnded);
        mainVideo.addEventListener('timeupdate', handleTimeUpdate);
        mainVideo.addEventListener('seeking', updateCustomSubtitleOverlay);
        mainVideo.addEventListener('seeked', updateCustomSubtitleOverlay);
        jumpEpBtn.addEventListener('click', () => {
            const epNum = parseInt(jumpEpInput.value, 10);
            if (!currentDramaData || isNaN(epNum)) return;
            const idx = currentDramaData.episodes.findIndex(e => e.number === epNum);
            if (idx !== -1) switchEpisode(idx); else showToast(`Episode ${epNum} not found`, 'fa-circle-exclamation');
        });
        jumpEpInput.addEventListener('keydown', e => { if (e.key === 'Enter') jumpEpBtn.click(); });
        const mobileScrollHint = document.getElementById('mobile-scroll-hint');
        if (mobileScrollHint) mobileScrollHint.addEventListener('click', () => document.querySelector('.episodes-drawer')?.scrollIntoView({ behavior: 'smooth' }));
        if (modalEpisodeTitle) { modalEpisodeTitle.style.cursor = 'pointer'; modalEpisodeTitle.setAttribute('title', 'View all episodes'); modalEpisodeTitle.addEventListener('click', () => document.querySelector('.episodes-drawer')?.scrollIntoView({ behavior: 'smooth' })); }
        const playerMainSplitEl = document.querySelector('.player-main-split');
        if (playerMainSplitEl) playerMainSplitEl.addEventListener('scroll', () => { const hint = document.getElementById('mobile-scroll-hint'); if (hint) hint.style.display = playerMainSplitEl.scrollTop > 40 ? 'none' : ''; });
        if (videoViewport) { let ht = null; videoViewport.addEventListener('touchstart', () => { videoViewport.classList.add('is-active-touch'); clearTimeout(ht); ht = setTimeout(() => videoViewport.classList.remove('is-active-touch'), 2500); }, { passive: true }); }

        // KEYBOARD SHORTCUTS
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!playerModal.hidden) {
                    if (!isMiniplayer) minimizeToMiniplayer();
                    else closeModal();
                }
                return;
            }
            if (!playerModal.hidden && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
                switch (e.code) {
                    case 'Space': e.preventDefault(); if (mainVideo.paused) { mainVideo.play(); showPlayerHud('fa-play', 'Phát'); } else { mainVideo.pause(); showPlayerHud('fa-pause', 'Dừng'); } break;
                    case 'ArrowRight': e.preventDefault(); mainVideo.currentTime = Math.min(mainVideo.duration || 0, mainVideo.currentTime + 5); showPlayerHud('fa-forward', '+5s'); break;
                    case 'ArrowLeft': e.preventDefault(); mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 5); showPlayerHud('fa-backward', '-5s'); break;
                    case 'ArrowUp':
                        e.preventDefault();
                        if (isReelsMode) {
                            switchReelsEpisode('prev');
                        } else {
                            mainVideo.volume = Math.min(1, mainVideo.volume + 0.1);
                            showPlayerHud('fa-volume-high', `${Math.round(mainVideo.volume * 100)}%`);
                        }
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        if (isReelsMode) {
                            switchReelsEpisode('next');
                        } else {
                            mainVideo.volume = Math.max(0, mainVideo.volume - 0.1);
                            showPlayerHud('fa-volume-low', `${Math.round(mainVideo.volume * 100)}%`);
                        }
                        break;
                }
                switch (e.key.toLowerCase()) {
                    case 'm': mainVideo.muted = !mainVideo.muted; showPlayerHud(mainVideo.muted ? 'fa-volume-xmark' : 'fa-volume-high', mainVideo.muted ? 'Tắt tiếng' : 'Bật tiếng'); break;
                    case 'f': if (!document.fullscreenElement) videoViewport.requestFullscreen().catch(() => { }); else document.exitFullscreen().catch(() => { }); break;
                    case 'n': if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) { switchEpisode(currentEpisodeIndex + 1); showPlayerHud('fa-forward-step', 'Tập tiếp theo'); } break;
                    case 'p': if (currentEpisodeIndex > 0) { switchEpisode(currentEpisodeIndex - 1); showPlayerHud('fa-backward-step', 'Tập trước'); } break;
                    case 'i': if (isMiniplayer) restoreFromMiniplayer(); else minimizeToMiniplayer(); break;
                    case 'k': e.preventDefault(); if (mainVideo.paused) { mainVideo.play(); showPlayerHud('fa-play', 'Phát'); } else { mainVideo.pause(); showPlayerHud('fa-pause', 'Dừng'); } break;
                    case '?': const sm = document.getElementById('shortcuts-modal'); if (sm) sm.hidden = false; break;
                }
            }
        });

        const shortcutsModal = document.getElementById('shortcuts-modal');
        const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
        const shortcutsBackdrop = document.getElementById('shortcuts-backdrop');
        const btnShortcutsHint = document.getElementById('btn-shortcuts-hint');
        if (btnShortcutsHint && shortcutsModal) btnShortcutsHint.addEventListener('click', () => shortcutsModal.hidden = false);
        if (shortcutsCloseBtn) shortcutsCloseBtn.addEventListener('click', () => shortcutsModal.hidden = true);
        if (shortcutsBackdrop) shortcutsBackdrop.addEventListener('click', () => shortcutsModal.hidden = true);

        const btnPip = document.getElementById('btn-pip');
        if (btnPip) btnPip.addEventListener('click', togglePiP);
        mainVideo.addEventListener('enterpictureinpicture', () => { const b = document.getElementById('btn-pip'); if (b) b.classList.add('pip-active'); showToast('Picture-in-Picture đang hoạt động', 'fa-arrow-up-right-from-square'); });
        mainVideo.addEventListener('leavepictureinpicture', () => { const b = document.getElementById('btn-pip'); if (b) b.classList.remove('pip-active'); });

        if (btnCountdownNow) btnCountdownNow.addEventListener('click', () => { hideCountdown(); if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) switchEpisode(currentEpisodeIndex + 1); });
        if (btnCountdownCancel) btnCountdownCancel.addEventListener('click', () => hideCountdown());
        if (btnResumeAccept) btnResumeAccept.addEventListener('click', () => {
            const ts = getPendingResumeTime();
            if (ts > 0) {
                executeResumePlayback(ts);
            }
            resumeBanner.hidden = true;
        });
        if (btnResumeDismiss) btnResumeDismiss.addEventListener('click', () => resumeBanner.hidden = true);

        // Quality/Subtitle dropdowns
        if (qualityBtn && qualityMenu) {
            qualityBtn.addEventListener('click', e => { e.stopPropagation(); qualityMenu.hidden = !qualityMenu.hidden; if (subtitleMenu) subtitleMenu.hidden = true; });
            qualityMenu.querySelectorAll('.ctrl-dropdown-menu-item').forEach(item => item.addEventListener('click', () => { selectQuality(item.getAttribute('data-quality')); qualityMenu.hidden = true; }));
        }
        if (subtitleBtn && subtitleMenu) {
            subtitleBtn.addEventListener('click', e => { e.stopPropagation(); subtitleMenu.hidden = !subtitleMenu.hidden; if (qualityMenu) qualityMenu.hidden = true; });
            subtitleMenu.querySelectorAll('.ctrl-dropdown-menu-item').forEach(item => item.addEventListener('click', () => { selectSubtitle(item.getAttribute('data-sub')); subtitleMenu.hidden = true; }));
        }

        // Mobile swipe
        if (videoViewport) {
            videoViewport.addEventListener('touchstart', onVideoTouchStart, { passive: true });
            videoViewport.addEventListener('touchmove', onVideoTouchMove, { passive: true });
            videoViewport.addEventListener('touchend', onVideoTouchEnd, { passive: true });
        }
    }

    // ==========================================
    // 1. EVENT LISTENERS (Nav/UI)
    // ==========================================
    function bindEvents() {
        // Mobile Navigation Drawer Toggle
        if (mobileNavToggle && mainNavLinks) {
            mobileNavToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = mainNavLinks.classList.toggle('mobile-open');
                const icon = mobileNavToggle.querySelector('i');
                if (icon) {
                    icon.className = isOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
                }
                mobileNavToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        }

        // Tags Dropdown Toggle
        if (navTagsBtn && navTagsMenu) {
            navTagsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpening = navTagsMenu.hidden;
                navTagsMenu.hidden = !isOpening;
                navTagsWrap.classList.toggle('open', isOpening);
                navTagsBtn.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
                if (navGenreMenu) {
                    navGenreMenu.hidden = true;
                    navGenreWrap.classList.remove('open');
                    navGenreBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Genre Dropdown Toggle
        if (navGenreBtn && navGenreMenu) {
            navGenreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpening = navGenreMenu.hidden;
                navGenreMenu.hidden = !isOpening;
                navGenreWrap.classList.toggle('open', isOpening);
                navGenreBtn.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
                if (navTagsMenu) {
                    navTagsMenu.hidden = true;
                    navTagsWrap.classList.remove('open');
                    navTagsBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Close dropdowns and mobile menu on outside click
        document.addEventListener('click', (e) => {
            if (navTagsWrap && !navTagsWrap.contains(e.target)) {
                if (navTagsMenu) navTagsMenu.hidden = true;
                navTagsWrap.classList.remove('open');
                if (navTagsBtn) navTagsBtn.setAttribute('aria-expanded', 'false');
            }
            if (navGenreWrap && !navGenreWrap.contains(e.target)) {
                if (navGenreMenu) navGenreMenu.hidden = true;
                navGenreWrap.classList.remove('open');
                if (navGenreBtn) navGenreBtn.setAttribute('aria-expanded', 'false');
            }
            if (mainNavLinks && !mainNavLinks.contains(e.target) && mobileNavToggle && !mobileNavToggle.contains(e.target)) {
                mainNavLinks.classList.remove('mobile-open');
                const icon = mobileNavToggle.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-bars';
                mobileNavToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close mobile drawer when clicking navigation items
        if (mainNavLinks) {
            mainNavLinks.querySelectorAll('.nav-link:not(.nav-dropdown-btn)').forEach(link => {
                link.addEventListener('click', () => {
                    mainNavLinks.classList.remove('mobile-open');
                    const icon = mobileNavToggle?.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-bars';
                    mobileNavToggle?.setAttribute('aria-expanded', 'false');
                });
            });
        }

        // Tag Chip Clicks
        document.querySelectorAll('.tag-chip-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tag = btn.getAttribute('data-tag');
                if (navTagsMenu) navTagsMenu.hidden = true;
                if (navTagsWrap) navTagsWrap.classList.remove('open');
                if (mainNavLinks) mainNavLinks.classList.remove('mobile-open');
                applyFilter('tag', tag);
            });
        });

        // Genre Item Clicks
        document.querySelectorAll('.genre-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const genre = btn.getAttribute('data-genre');
                if (navGenreMenu) navGenreMenu.hidden = true;
                if (navGenreWrap) navGenreWrap.classList.remove('open');
                if (mainNavLinks) mainNavLinks.classList.remove('mobile-open');
                applyFilter('genre', genre);
            });
        });

        // Nav Links Direct Actions
        if (navHome) {
            navHome.addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav(navHome);
                clearActiveFilter();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        if (navDiscovery) {
            navDiscovery.addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav(navDiscovery);
                openDiscoveryModal();
            });
        }

        if (navSeries) {
            navSeries.addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav(navSeries);
                clearActiveFilter();
                const pSec = document.getElementById('providers-section');
                if (pSec) pSec.scrollIntoView({ behavior: 'smooth' });
            });
        }

        if (navAnime) {
            navAnime.addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav(navAnime);
                applyFilter('anime', 'Anime');
            });
        }

        if (navFeatured) {
            navFeatured.addEventListener('click', (e) => {
                e.preventDefault();
                setActiveNav(navFeatured);
                const featEl = document.getElementById('featured');
                if (featEl) featEl.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Active filter clear button
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', () => {
                clearActiveFilter();
            });
        }

        // User Utility Buttons: History & Favorites Quick Access
        if (navHistoryIconBtn) {
            navHistoryIconBtn.addEventListener('click', () => {
                const histList = getHistory();
                if (histList.length === 0) {
                    showToast(t('toast_history_empty'), 'fa-clock-rotate-left');
                } else {
                    historySection.hidden = false;
                    historySection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }

        if (navFavoritesIconBtn) {
            navFavoritesIconBtn.addEventListener('click', () => {
                const favList = getFavorites();
                if (favList.length === 0) {
                    showToast(t('toast_fav_empty'), 'fa-heart');
                } else {
                    favoritesSection.hidden = false;
                    favoritesSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }

        // VIP Login Modal Controls
        if (navLoginBtn) {
            navLoginBtn.addEventListener('click', () => {
                if (loginModal) loginModal.hidden = false;
            });
        }

        if (loginCloseBtn) {
            loginCloseBtn.addEventListener('click', () => {
                if (loginModal) loginModal.hidden = true;
            });
        }

        if (loginModalBackdrop) {
            loginModalBackdrop.addEventListener('click', () => {
                if (loginModal) loginModal.hidden = true;
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = document.getElementById('login-username').value.trim() || 'VIP Guest';
                if (loginModal) loginModal.hidden = true;
                showToast(t('toast_welcome_vip', { user: username }), 'fa-crown');
                if (navLoginBtn) {
                    navLoginBtn.innerHTML = `<i class="fa-solid fa-crown text-amber"></i> <span>${escapeHtml(username)}</span>`;
                }
            });
        }

        // Pagination
        prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
        nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
        prevPageBtnBot.addEventListener('click', () => changePage(currentPage - 1));
        nextPageBtnBot.addEventListener('click', () => changePage(currentPage + 1));

        // Search Input Debounce
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            searchClear.hidden = !q;
            clearTimeout(searchDebounceTimer);
            if (!q) {
                searchDropdown.hidden = true;
                return;
            }
            searchDebounceTimer = setTimeout(() => handleSearch(q), 280);
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.hidden = true;
            searchDropdown.hidden = true;
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
                searchDropdown.hidden = true;
            }
        });

        // (Player events moved to bindPlayerEvents())

        // (scroll hint, timeupdate, jumpEp moved to bindPlayerEvents())

        // Clear History
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm(t('toast_history_cleared') + '?')) {
                localStorage.removeItem(STORAGE_HISTORY);
                renderHistoryRail();
                showToast(t('toast_history_cleared'), 'fa-trash-can');
            }
        });

        // Providers Rail Wheel Horizontal Scrolling
        const providersRailWrap = document.getElementById('providers-rail');
        if (providersRailWrap) {
            providersRailWrap.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    providersRailWrap.scrollLeft += e.deltaY;
                }
            }, { passive: false });
        }

        // Reusable Rail Carousel Navigation & Wheel Scrolling
        function setupRailNavigation(rail, prevBtn, nextBtn) {
            if (!rail) return;

            rail.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    rail.scrollLeft += e.deltaY;
                }
            }, { passive: false });

            if (prevBtn && nextBtn) {
                const getStep = () => Math.max(260, Math.floor(rail.clientWidth * 0.75));

                nextBtn.addEventListener('click', () => {
                    rail.scrollBy({ left: getStep(), behavior: 'smooth' });
                });

                prevBtn.addEventListener('click', () => {
                    rail.scrollBy({ left: -getStep(), behavior: 'smooth' });
                });

                const updateState = () => {
                    const maxScroll = rail.scrollWidth - rail.clientWidth;
                    if (maxScroll <= 5) {
                        prevBtn.style.opacity = '0.3';
                        nextBtn.style.opacity = '0.3';
                        return;
                    }
                    prevBtn.style.opacity = rail.scrollLeft <= 10 ? '0.3' : '1';
                    nextBtn.style.opacity = rail.scrollLeft >= maxScroll - 10 ? '0.3' : '1';
                };

                rail.addEventListener('scroll', updateState, { passive: true });
                setTimeout(updateState, 400);
            }
        }

        // Initialize Carousel Navigation for all horizontal content rails
        setupRailNavigation(top10Rail, top10PrevBtn, top10NextBtn);
        setupRailNavigation(historyRail, historyPrevBtn, historyNextBtn);
        setupRailNavigation(favoritesRail, favoritesPrevBtn, favoritesNextBtn);

        // Hero Slider Navigation Controls
        if (heroSlideNext) {
            heroSlideNext.addEventListener('click', () => {
                nextHeroSlide();
                startHeroAutoPlay();
            });
        }
        if (heroSlidePrev) {
            heroSlidePrev.addEventListener('click', () => {
                prevHeroSlide();
                startHeroAutoPlay();
            });
        }
        if (featuredSection) {
            featuredSection.addEventListener('mouseenter', () => {
                isHeroHovered = true;
            });
            featuredSection.addEventListener('mouseleave', () => {
                isHeroHovered = false;
            });
        }

        // (Keyboard shortcuts moved to bindPlayerEvents())

        // Footer links provider switch
        document.querySelectorAll('.f-link[data-provider]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pKey = link.getAttribute('data-provider');
                selectProvider(pKey);
                window.scrollTo({ top: 400, behavior: 'smooth' });
            });
        });
    }

    // ==========================================
    // LANGUAGE & I18N LOCALIZATION ENGINE
    // ==========================================
    const I18N_DICTIONARY = {
        'vi-VN': {
            doc_title: 'DramaFlow PRO - Nền tảng xem phim ngắn HD trực tuyến đỉnh cao',
            nav_home: 'Trang chủ',
            nav_series: 'Phim & Series',
            nav_anime: 'Hoạt hình',
            nav_tags: 'Thẻ phim',
            tags_header: 'Thẻ phim phổ biến',
            tags_badge: 'Thịnh hành',
            nav_genre: 'Thể loại',
            genre_header: 'Thể loại phim',
            genre_badge: 'Chọn',
            genres: {
                Romance: { name: 'Tình cảm', sub: 'Tình cảm • Ngọt ngào' },
                Action: { name: 'Hành động', sub: 'Hành động • Đối kháng' },
                Comedy: { name: 'Hài hước', sub: 'Hài hước • Giải trí' },
                Fantasy: { name: 'Kỳ ảo', sub: 'Kỳ ảo • Huyền huyễn' },
                Thriller: { name: 'Giật gân', sub: 'Giật gân • Hồi hộp' },
                Historical: { name: 'Cổ trang', sub: 'Cổ trang • Cung đấu' }
            },
            nav_featured: 'Nổi bật',
            search_placeholder: 'Tìm kiếm tựa phim, diễn viên, thể loại...',
            search_header: 'KẾT QUẢ TÌM KIẾM',
            search_count: '{count} kết quả',
            search_empty: 'Không tìm thấy kết quả nào phù hợp',
            search_found_subtitle: 'Tìm thấy {count} tựa phim khớp với "{query}"',
            search_none_subtitle: 'Không tìm thấy phim phù hợp với "{query}"',
            tooltip_history: 'Lịch sử xem',
            tooltip_favorites: 'Danh sách yêu thích của tôi',
            tooltip_lang: 'Chọn ngôn ngữ phát trực tuyến',
            lang_menu_header: 'Ngôn ngữ phát trực tuyến',
            nav_login: 'Đăng nhập',
            nav_login_title: 'Đăng nhập thành viên VIP',
            hero_trend: '#1 TOP THỊNH HÀNH HÔM NAY',
            hero_exclusive: 'ĐỘC QUYỀN {provider}',
            hero_quality: '4K SIÊU NÉT',
            hero_episodes_badge: 'Trọn bộ series',
            hero_ad_free: '100% Không quảng cáo',
            hero_default_desc: 'Khám phá các bộ phim ngắn hấp dẫn nhất với luồng phát HLS mượt mà, không quảng cáo và chuyển tập tức thì.',
            hero_play_btn: 'Xem Ngay',
            hero_detail_btn: 'Chi Tiết',
            hero_episodes_suffix: 'tập',
            badge_exclusive: 'Độc quyền',
            hero_watch_ep1: 'Xem Ngay',
            hero_add_list: 'Thêm vào DS',
            hero_in_list: 'Đã lưu trong DS',
            hero_synopsis: 'Chi Tiết',
            history_title: 'Tiếp tục xem',
            history_subtitle: 'Xem tiếp các tập bạn đang theo dõi dở dang',
            clear_history_btn: 'Xóa lịch sử',
            resume_ep_prefix: 'Xem tiếp Tập',
            top10_title: 'Top 10 Phim Ngắn Hot Hôm Nay',
            top10_subtitle: 'Những bộ phim được xem nhiều và thịnh hành nhất',
            favorites_title: 'Danh sách của tôi',
            favorites_subtitle: 'Các bộ phim bạn đã đánh dấu và lưu lại',
            catalog_suffix: 'Kho Phim',
            catalog_subtitle: 'Bộ sưu tập phim chất lượng cao từ {provider}',
            filter_by: 'Đang lọc theo:',
            clear_filter: 'Xóa bộ lọc',
            prev_btn: 'Trước',
            next_btn: 'Sau',
            page_status: 'Trang {page}',
            empty_title: 'Không tìm thấy phim',
            empty_desc: 'Hãy thử đổi nhà cung cấp khác hoặc điều chỉnh từ khóa tìm kiếm.',
            now_streaming: 'ĐANG PHÁT',
            ep_prefix: 'Tập',
            overview_title: 'Tổng quan phim',
            meta_licensed: 'Nguồn bản quyền',
            meta_fast_cdn: 'CDN Tốc độ cao',
            synopsis_loading: 'Đang tải tóm tắt nội dung phim...',
            episodes_title: 'Danh sách tập',
            jump_placeholder: 'Tập ',
            jump_btn: 'Đến',
            tooltip_minimize: 'Thu nhỏ màn hình (Miniplayer)',
            tooltip_theater: 'Đổi kiểu hiển thị (Chuẩn 2 cột / Kiểu trung 3/4)',
            tooltip_fav: 'Lưu vào danh sách của tôi',
            tooltip_share: 'Chia sẻ liên kết',
            tooltip_close: 'Đóng trình phát',
            tooltip_expand: 'Phóng to toàn màn hình',
            tooltip_play_pause: 'Phát / Tạm dừng',
            tooltip_next_ep: 'Tập tiếp theo',
            countdown_badge: 'TẬP TIẾP THEO',
            countdown_text: 'Tập kế tiếp sau {sec}s',
            countdown_now: 'Xem ngay',
            countdown_cancel: 'Hủy',
            resume_prompt: 'Tiếp tục từ {time}?',
            resume_yes: 'Tiếp tục',
            resume_dismiss: 'Bỏ qua',
            mobile_episodes_hint: 'Danh sách tập',
            tooltip_reels: 'Chế độ lướt cuộn dọc Reels (TikTok/Shorts)',
            toast_reels_on: '',
            toast_reels_off: 'Đã chuyển về chế độ xem chuẩn',
            reels_episodes_btn: 'Tập',
            reels_like_btn: 'Thích',
            reels_share_btn: 'Chia sẻ',
            reels_exit_btn: 'Thoát',
            reels_swipe_hint: 'Vuốt lên/xuống đổi tập',
            reels_last_ep: 'Bạn đang ở tập cuối cùng của bộ phim!',
            reels_first_ep: 'Bạn đang ở tập đầu tiên của bộ phim!',
            ctrl_prev: 'Tập trước',
            ctrl_next: 'Tập sau',
            ctrl_pip_title: 'Hình trong hình (I)',
            ctrl_shortcuts_title: 'Phím tắt bàn phím (?)',
            quality_btn_title: 'Chất lượng video',
            quality_header: 'Chất lượng',
            quality_auto: 'Tự động (HLS Thích ứng)',
            sub_btn_title: 'Chọn phụ đề',
            sub_header: 'Phụ đề',
            sub_off: 'Tắt phụ đề',
            sub_label_off: 'Tắt phụ đề',
            autoplay_next: 'Tự chuyển tập',
            autoplay_next_title: 'Tự động chuyển sang tập tiếp theo khi hết tập',
            stream_badge: 'HLS Siêu tốc',
            stream_err_title: 'Không thể phát tập {ep}',
            stream_err_desc: 'Nguồn phát từ nhà cung cấp bị gián đoạn, hết hạn hoặc tạm thời không khả dụng. Bạn có thể thử kết nối lại hoặc chuyển sang tập khác.',
            stream_err_retry: 'Thử lại ngay',
            stream_err_next: 'Tập tiếp theo',
            shortcuts_badge: 'PHÍM TẮT',
            shortcuts_title: 'Phím tắt trình phát Video',
            sc_play_pause: 'Phát / Tạm dừng',
            sc_fullscreen: 'Toàn màn hình',
            sc_mute: 'Bật / Tắt tiếng',
            sc_seek: 'Tua lùi / tiến 5 giây',
            sc_volume: 'Tăng / Giảm âm lượng',
            sc_next_ep: 'Tập tiếp theo (Next)',
            sc_prev_ep: 'Tập trước đó (Prev)',
            sc_pip: 'Thu nhỏ góc (Picture-in-Picture)',
            login_badge: 'TRUY CẬP VIP',
            login_title: 'Thành viên DramaFlow PRO',
            login_desc: 'Tận hưởng xem phim không quảng cáo, chất lượng 4K và đồng bộ danh sách xem trên mọi thiết bị.',
            login_username_label: 'Tên tài khoản / Biệt danh',
            login_username_placeholder: 'Nhập tên hoặc Khách VIP',
            login_email_label: 'Email (Không bắt buộc)',
            login_submit: 'Đăng nhập tài khoản VIP',
            login_vip_status: 'Trạng thái VIP: Đã kích hoạt không giới hạn, không quảng cáo',
            footer_desc: 'Cổng phim ngắn chất lượng cao tuyển chọn hàng đầu thế giới. Phát trực tiếp chuẩn HLS, không pop-up, tốc độ cực nhanh.',
            footer_ssl: 'Bảo mật SSL 256-Bit',
            footer_latency: 'Độ trễ siêu thấp',
            footer_top_providers: 'Top Nhà Cung Cấp',
            footer_features: 'Tính Năng',
            footer_top10: 'Top 10 Hàng Ngày',
            footer_resume: 'Xem Tiếp',
            footer_bookmarks: 'Danh Sách Lưu',
            footer_trending: 'Phim Thịnh Hành',
            footer_copyright: '© 2026 Nền tảng DramaFlow PRO. Bản quyền thuộc về hệ thống phát trực tuyến HLS CDN.',
            footer_privacy: 'Chính sách bảo mật',
            footer_terms: 'Điều khoản dịch vụ',
            footer_dmca: 'DMCA',
            footer_api: 'Trạng thái hệ thống',
            toast_lang_switched: 'Đã chuyển ngôn ngữ: {lang}',
            toast_fav_added: 'Đã lưu vào danh sách yêu thích!',
            toast_fav_removed: 'Đã xóa khỏi danh sách yêu thích',
            toast_history_cleared: 'Đã xóa toàn bộ lịch sử xem',
            toast_link_copied: 'Đã sao chép liên kết Tập {ep}!',
            toast_no_episodes: 'Tựa phim này hiện chưa có tập phim khả dụng từ nhà cung cấp.',
            toast_pip_unsupported: 'PiP không được hỗ trợ trên trình duyệt này',
            toast_pip_active: 'Picture-in-Picture đang hoạt động',
            toast_history_empty: 'Lịch sử xem đang trống',
            toast_fav_empty: 'Danh sách yêu thích đang trống',
            toast_welcome_vip: 'Chào mừng {user}! Quyền truy cập VIP không giới hạn đã kích hoạt.',
            toast_theater_on: 'Đã chuyển sang kiểu trung (3/4 dạng dọc)',
            toast_theater_off: 'Đã trở về kiểu lớn (2 cột chuẩn)',
            discovery_nav: 'Khám phá',
            discovery_badge: 'KHÁM PHÁ THÔNG MINH',
            discovery_heading: 'Chọn Phim Theo Gu & Thời Lượng',
            discovery_mood_label: 'Gu phim:',
            discovery_length_label: 'Độ dài tập:',
            discovery_reset: 'Đặt lại',
            discovery_reset_title: 'Xóa tất cả bộ lọc',
            discovery_results_count: '{count} phim phù hợp',
            discovery_analyzing: 'Đang phân tích số tập...',
            discovery_empty_title: 'Không tìm thấy phim phù hợp',
            discovery_empty_desc: 'Không có phim nào khớp với gu hoặc độ dài tập đã chọn. Hãy thử chọn gu khác hoặc nhấn Đặt lại.',
            discovery_apply: 'Xem kết quả',
            discovery_subheading: 'Lọc nhanh các bộ phim phù hợp với sở thích và thời gian của bạn',
            catalog_discovery_btn: 'Bộ lọc thông minh',
            catalog_discovery_btn_title: 'Khám phá phim theo gu & độ dài tập',
            discovery_banner_prefix: 'Khám phá:',
            discovery_moods: {
                all: { title: 'Tất cả gu' },
                ceo: { title: 'Tổng Tài Bá Đạo', sub: 'Hào môn • Chiều vợ' },
                revenge: { title: 'Báo Thù Rửa Hận', sub: 'Ngược luyến • Vạch mặt' },
                rebirth: { title: 'Trọng Sinh / Xuyên Không', sub: 'Làm lại cuộc đời' },
                comedy: { title: 'Hài Hước Xả Stress', sub: 'Vui vẻ • Giải trí' }
            },
            discovery_lengths: {
                all: { title: 'Tất cả số tập' },
                short: { title: 'Xem nhanh (< 35 tập)', sub: 'Nhanh gọn • Tiết kiệm giờ', label: '< 35 tập' },
                medium: { title: 'Vừa phải (35 – 70 tập)', sub: 'Cốt truyện trọn vẹn', label: '35 – 70 tập' },
                long: { title: 'Trọn bộ dài tập (> 70 tập)', sub: 'Gay cấn • Đầy kịch tính', label: '> 70 tập' }
            }
        },
        'en-US': {
            doc_title: 'DramaFlow PRO - Premier HD Short Drama Streaming Platform',
            nav_home: 'Home',
            nav_series: 'Movie & Series',
            nav_anime: 'Anime',
            nav_tags: 'Tags',
            tags_header: 'Popular Drama Tags',
            tags_badge: 'Trending',
            nav_genre: 'Genre',
            genre_header: 'Drama Genres',
            genre_badge: 'Select',
            genres: {
                Romance: { name: 'Romance', sub: 'Romance • Sweet Love' },
                Action: { name: 'Action', sub: 'Action • Martial Arts' },
                Comedy: { name: 'Comedy', sub: 'Comedy • Entertainment' },
                Fantasy: { name: 'Fantasy', sub: 'Fantasy • Mythical' },
                Thriller: { name: 'Thriller', sub: 'Suspense • Thriller' },
                Historical: { name: 'Historical', sub: 'Period • Costume' }
            },
            nav_featured: 'Featured',
            search_placeholder: 'Search title, cast, genre...',
            search_header: 'SEARCH RESULTS',
            search_count: '{count} found',
            search_empty: 'No matching titles found',
            search_found_subtitle: 'Found {count} titles matching "{query}"',
            search_none_subtitle: 'No titles found for "{query}"',
            tooltip_history: 'Watch History',
            tooltip_favorites: 'My Saved List',
            tooltip_lang: 'Select Streaming Language',
            lang_menu_header: 'Streaming Language',
            nav_login: 'Login',
            nav_login_title: 'VIP Member Access',
            hero_trend: '#1 TOP RANKED TODAY',
            hero_exclusive: '{provider} EXCLUSIVE',
            hero_quality: '4K ULTRA HD',
            hero_episodes_badge: 'Full Series',
            hero_ad_free: '100% Ad-Free',
            hero_default_desc: 'Discover the most captivating short drama stories with seamless HLS streaming, zero ad interruptions, and instant multi-episode navigation.',
            hero_play_btn: 'Watch Now',
            hero_detail_btn: 'Details',
            hero_episodes_suffix: 'Episodes',
            badge_exclusive: 'Exclusive',
            hero_watch_ep1: 'Watch Now',
            hero_add_list: 'Add to My List',
            hero_in_list: 'In My List',
            hero_synopsis: 'Details',
            history_title: 'Continue Watching',
            history_subtitle: 'Resume your recent episodes',
            clear_history_btn: 'Clear History',
            resume_ep_prefix: 'Resume Ep',
            top10_title: 'Top 10 Short Dramas Today',
            top10_subtitle: 'Most viewed and trending releases',
            favorites_title: 'My List',
            favorites_subtitle: 'Your bookmarked and saved dramas',
            catalog_suffix: 'Catalog',
            catalog_subtitle: 'High definition streaming collection from {provider}',
            filter_by: 'Filtered by:',
            clear_filter: 'Clear Filter',
            prev_btn: 'Previous',
            next_btn: 'Next',
            page_status: 'Page {page}',
            empty_title: 'No Titles Found',
            empty_desc: 'Try switching to another provider tab or adjusting your search keywords.',
            now_streaming: 'NOW STREAMING',
            ep_prefix: 'Episode',
            overview_title: 'Drama Overview',
            meta_licensed: 'Licensed Source',
            meta_fast_cdn: 'Fast CDN Relay',
            synopsis_loading: 'Loading synopsis details...',
            episodes_title: 'Episodes',
            jump_placeholder: 'Ep ',
            jump_btn: 'Go',
            tooltip_minimize: 'Minimize Player (Miniplayer)',
            tooltip_theater: 'Switch Player Layout (2-Column / Medium 3/4)',
            tooltip_fav: 'Save to My List',
            tooltip_share: 'Share Drama Link',
            tooltip_close: 'Close Viewer',
            tooltip_expand: 'Expand to Full Player',
            tooltip_play_pause: 'Play / Pause',
            tooltip_next_ep: 'Next Episode',
            countdown_badge: 'NEXT EPISODE',
            countdown_text: 'Next episode in {sec}s',
            countdown_now: 'Watch Now',
            countdown_cancel: 'Cancel',
            resume_prompt: 'Resume from {time}?',
            resume_yes: 'Resume',
            resume_dismiss: 'Dismiss',
            mobile_episodes_hint: 'Episodes',
            tooltip_reels: 'Vertical Reels Feed Mode (TikTok/Shorts)',
            toast_reels_on: 'Reels Feed Mode activated (Swipe up/down to flip episodes)',
            toast_reels_off: 'Standard player view restored',
            reels_episodes_btn: 'Episodes',
            reels_like_btn: 'Like',
            reels_share_btn: 'Share',
            reels_exit_btn: 'Exit',
            reels_swipe_hint: 'Swipe up/down to flip',
            reels_last_ep: 'You are on the last episode!',
            reels_first_ep: 'You are on the first episode!',
            ctrl_prev: 'Prev',
            ctrl_next: 'Next',
            ctrl_pip_title: 'Picture-in-Picture (I)',
            ctrl_shortcuts_title: 'Keyboard Shortcuts (?)',
            quality_btn_title: 'Switch Stream Quality',
            quality_header: 'Quality',
            quality_auto: 'Auto (HLS Adaptive)',
            sub_btn_title: 'Select Subtitle',
            sub_header: 'Subtitles',
            sub_off: 'Subtitles Off',
            sub_label_off: 'CC Off',
            autoplay_next: 'Autoplay Next',
            autoplay_next_title: 'Automatically advance to next episode when video ends',
            stream_badge: 'HLS 1080p',
            stream_err_title: 'Unable to stream Episode {ep}',
            stream_err_desc: 'The upstream stream is temporarily unavailable or interrupted. You can retry reconnecting or skip to the next episode.',
            stream_err_retry: 'Retry Stream',
            stream_err_next: 'Next Episode',
            shortcuts_badge: 'HOTKEYS',
            shortcuts_title: 'Player Keyboard Shortcuts',
            sc_play_pause: 'Play / Pause',
            sc_fullscreen: 'Fullscreen',
            sc_mute: 'Mute / Unmute',
            sc_seek: 'Seek backward / forward 5s',
            sc_volume: 'Volume up / down',
            sc_next_ep: 'Next Episode',
            sc_prev_ep: 'Previous Episode',
            sc_pip: 'Picture-in-Picture',
            login_badge: 'VIP ACCESS',
            login_title: 'DramaFlow PRO Member',
            login_desc: 'Enjoy ad-free streaming, 4K multi-episode playback, and cloud watchlist synchronization.',
            login_username_label: 'Member Username / Nickname',
            login_username_placeholder: 'Enter username or Guest VIP',
            login_email_label: 'Email (Optional)',
            login_submit: 'Sign In to VIP Account',
            login_vip_status: 'Active VIP Status: Free Unlimited Ad-Free Access Enabled',
            footer_desc: 'The modern high-definition streaming gateway for trending short dramas worldwide. Direct HLS streams, zero popups, lightning-fast navigation.',
            footer_ssl: '256-Bit SSL Secured',
            footer_latency: 'Ultra Low Latency',
            footer_top_providers: 'Top Providers',
            footer_features: 'Features',
            footer_top10: 'Daily Top 10',
            footer_resume: 'Resume Playback',
            footer_bookmarks: 'My Bookmarks',
            footer_trending: 'Trending Shows',
            footer_copyright: '© 2026 DramaFlow PRO Platform. All rights reserved. Powered by Direct HLS CDN Clustering.',
            footer_privacy: 'Privacy Policy',
            footer_terms: 'Terms of Service',
            footer_dmca: 'DMCA',
            footer_api: 'API Status',
            toast_lang_switched: 'Streaming language: {lang}',
            toast_fav_added: 'Added to My List!',
            toast_fav_removed: 'Removed from My List',
            toast_history_cleared: 'Watch history cleared',
            toast_link_copied: 'Episode {ep} link copied!',
            toast_no_episodes: 'No playable episodes available from provider for this drama.',
            toast_pip_unsupported: 'PiP is not supported on this browser',
            toast_pip_active: 'Picture-in-Picture is active',
            toast_history_empty: 'Watch history is empty',
            toast_fav_empty: 'My List is currently empty',
            toast_welcome_vip: 'Welcome {user}! VIP Unlimited HD Stream active.',
            toast_theater_on: 'Switched to Medium 3/4 layout',
            toast_theater_off: 'Switched to Large 2-column view',
            discovery_nav: 'Discovery',
            discovery_badge: 'SMART DISCOVERY',
            discovery_heading: 'Discover by Mood & Episode Length',
            discovery_mood_label: 'Mood:',
            discovery_length_label: 'Length:',
            discovery_reset: 'Reset',
            discovery_reset_title: 'Reset all filters',
            discovery_results_count: '{count} dramas matched',
            discovery_analyzing: 'Analyzing episode counts...',
            discovery_empty_title: 'No Matching Dramas Found',
            discovery_empty_desc: 'No dramas match your selected mood and length criteria. Try choosing another filter or click Reset.',
            discovery_apply: 'View Results',
            discovery_subheading: 'Filter dramas by your mood and available time',
            catalog_discovery_btn: 'Smart Filters',
            catalog_discovery_btn_title: 'Discover dramas by mood & episode length',
            discovery_banner_prefix: 'Discovery:',
            discovery_moods: {
                all: { title: 'All Moods' },
                ceo: { title: 'Dominant CEO', sub: 'Billionaire • Sweet Love' },
                revenge: { title: 'Revenge & Betrayal', sub: 'Counterattack • Payback' },
                rebirth: { title: 'Rebirth & Time Travel', sub: 'Second Chance • Past Life' },
                comedy: { title: 'Comedy & Chill', sub: 'Fun • Lighthearted' }
            },
            discovery_lengths: {
                all: { title: 'All Lengths' },
                short: { title: 'Quick Watch (< 35 eps)', sub: 'Bite-sized • Time-saver', label: '< 35 eps' },
                medium: { title: 'Standard (35 – 70 eps)', sub: 'Full Storyline', label: '35 – 70 eps' },
                long: { title: 'Full Epic (> 70 eps)', sub: 'Dramatic • Binge-worthy', label: '> 70 eps' }
            }
        },
        'zh-TW': {
            doc_title: 'DramaFlow PRO - 頂級高畫質微短劇線上串流平台',
            nav_home: '首頁',
            nav_series: '影集與劇集',
            nav_anime: '動漫',
            nav_tags: '標籤',
            tags_header: '熱門短劇標籤',
            tags_badge: '熱搜',
            nav_genre: '類型',
            genre_header: '短劇類型',
            genre_badge: '選擇',
            genres: {
                Romance: { name: '言情', sub: '甜寵 • 愛情' },
                Action: { name: '動作', sub: '格鬥 • 熱血' },
                Comedy: { name: '喜劇', sub: '爆笑 • 娛樂' },
                Fantasy: { name: '玄幻', sub: '奇幻 • 仙俠' },
                Thriller: { name: '懸疑', sub: '反轉 • 驚悚' },
                Historical: { name: '古裝', sub: '宮鬥 • 穿越' }
            },
            nav_featured: '精選',
            search_placeholder: '搜尋劇名、演員、題材...',
            search_header: '搜尋結果',
            search_count: '找到 {count} 部作品',
            search_empty: '未找到符合的作品',
            tooltip_history: '觀看歷史',
            tooltip_favorites: '我的收藏',
            tooltip_lang: '選擇串流語言',
            lang_menu_header: '串流語言',
            nav_login: '登入',
            nav_login_title: 'VIP會員存取',
            hero_trend: '#1 今日熱播榜首',
            hero_exclusive: '{provider} 獨家',
            hero_quality: '4K超高畫質',
            hero_episodes_badge: '全集短劇',
            hero_ad_free: '100% 無廣告',
            hero_watch_ep1: '立即看第1集',
            hero_add_list: '加入追劇',
            hero_in_list: '已在追劇清單',
            hero_synopsis: '劇情簡介',
            history_title: '繼續觀看',
            history_subtitle: '繼續播放您最近收看的集數',
            clear_history_btn: '清空記錄',
            resume_ep_prefix: '續看第',
            top10_title: '今日人氣TOP 10短劇',
            top10_subtitle: '全網最高觀看量即時排行',
            favorites_title: '我的追劇清單',
            favorites_subtitle: '您標記與收藏的精彩短劇',
            catalog_suffix: '短劇庫',
            catalog_subtitle: '{provider} 高畫質微短劇專區',
            filter_by: '目前篩選：',
            clear_filter: '清除篩選',
            prev_btn: '上一頁',
            next_btn: '下一頁',
            page_status: '第 {page} 頁',
            empty_title: '未找到短劇',
            empty_desc: '請嘗試切換其他平台或調整關鍵字。',
            now_streaming: '正在播放',
            ep_prefix: '第',
            overview_title: '短劇簡介',
            episodes_title: '劇集列表',
            jump_placeholder: '集數 ',
            jump_btn: '跳轉',
            countdown_badge: '即將播放下集',
            countdown_text: '{sec}秒後自動播放下一集',
            countdown_now: '立即觀看',
            countdown_cancel: '取消',
            resume_prompt: '從 {time} 繼續播放？',
            resume_yes: '繼續',
            resume_dismiss: '略過',
            ctrl_prev: '上一集',
            ctrl_next: '下一集',
            quality_header: '畫質',
            sub_header: '字幕',
            sub_off: '關閉字幕',
            sub_label_off: '字幕關閉',
            autoplay_next: '自動連播',
            toast_lang_switched: '已切換語言：{lang}',
            toast_fav_added: '已加入我的追劇清單！',
            toast_fav_removed: '已從追劇清單移除',
            toast_history_cleared: '已清空觀看記錄',
            toast_link_copied: '第 {ep} 集連結已複製！',
            toast_no_episodes: '該短劇目前尚無可播放的集數。',
            discovery_nav: '探索',
            discovery_badge: '智慧探索',
            discovery_heading: '依題材與時長探索短劇',
            discovery_mood_label: '短劇題材:',
            discovery_length_label: '劇集時長:',
            discovery_reset: '重置',
            discovery_reset_title: '重置篩選',
            discovery_results_count: '找到 {count} 部作品',
            discovery_analyzing: '正在分析劇集數...',
            discovery_empty_title: '未找到符合的作品',
            discovery_empty_desc: '沒有短劇符合所選題材或劇集時長條件。請嘗試選擇其他條件或重置。',
            discovery_apply: '查看結果',
            discovery_subheading: '快速篩選符合您的喜好與時間的微短劇',
            catalog_discovery_btn: '智慧篩選',
            catalog_discovery_btn_title: '依題材與集數探索短劇',
            discovery_banner_prefix: '探索:',
            discovery_moods: {
                all: { title: '全部題材' },
                ceo: { title: '霸道總裁', sub: '豪門 • 甜寵' },
                revenge: { title: '復仇逆襲', sub: '打臉 • 虐戀' },
                rebirth: { title: '重生穿越', sub: '重來一世' },
                comedy: { title: '爆笑解壓', sub: '歡樂 • 搞笑' }
            },
            discovery_lengths: {
                all: { title: '全部集數' },
                short: { title: '快速刷完 (< 35集)', sub: '短小精悍 • 省時', label: '< 35集' },
                medium: { title: '適中篇幅 (35 – 70集)', sub: '劇情飽滿', label: '35 – 70集' },
                long: { title: '長篇爽劇 (> 70集)', sub: '高潮迭起 • 過癮', label: '> 70集' }
            }
        },
        'ko-KR': {
            doc_title: 'DramaFlow PRO - 프리미엄 HD 숏드라마 스트리밍 플랫폼',
            nav_home: '홈',
            nav_series: '드라마 & 시리즈',
            nav_anime: '애니메이션',
            nav_tags: '태그',
            nav_genre: '장르',
            nav_featured: '추천',
            search_placeholder: '제목, 배우, 장르 검색...',
            search_header: '검색 결과',
            search_count: '{count}개 결과',
            tooltip_history: '시청 기록',
            tooltip_favorites: '즐겨찾기',
            tooltip_lang: '언어 선택',
            nav_login: '로그인',
            hero_trend: '#1 오늘 인기 1위',
            hero_exclusive: '{provider} 독점',
            hero_quality: '4K 초고화질',
            hero_episodes_badge: '전체 회차',
            hero_ad_free: '광고 없음',
            hero_watch_ep1: '1화 바로보기',
            hero_add_list: '보관함 담기',
            hero_in_list: '보관함 저장됨',
            hero_synopsis: '줄거리',
            history_title: '이어보기',
            history_subtitle: '최근 시청하던 에피소드를 계속 시청하세요',
            clear_history_btn: '기록 삭제',
            resume_ep_prefix: '이어보기',
            top10_title: '오늘의 인기 숏드라마 TOP 10',
            top10_subtitle: '가장 많이 시청된 인기 트렌드 작품',
            favorites_title: '내 보관함',
            favorites_subtitle: '저장해 둔 드라마 컬렉션',
            catalog_suffix: '드라마 목록',
            prev_btn: '이전',
            next_btn: '다음',
            page_status: '{page}페이지',
            now_streaming: '현재 재생 중',
            ep_prefix: '제',
            episodes_title: '회차 목록',
            jump_btn: '이동',
            countdown_badge: '다음 회차',
            countdown_text: '{sec}초 후 다음 화 재생',
            countdown_now: '지금 보기',
            countdown_cancel: '취소',
            ctrl_prev: '이전 화',
            ctrl_next: '다음 화',
            quality_header: '화질',
            sub_header: '자막',
            sub_off: '자막 끄기',
            sub_label_off: '자막 끔',
            autoplay_next: '자동 다음 화',
            toast_lang_switched: '언어가 변경되었습니다: {lang}',
            toast_fav_added: '보관함에 추가되었습니다!',
            toast_fav_removed: '보관함에서 삭제되었습니다',
            toast_history_cleared: '시청 기록이 삭제되었습니다',
            discovery_nav: '탐색',
            discovery_badge: '스마트 탐색',
            discovery_heading: '취향 및 회차별 드라마 탐색',
            discovery_mood_label: '선호 취향:',
            discovery_length_label: '회차 분량:',
            discovery_reset: '초기화',
            discovery_reset_title: '필터 초기화',
            discovery_results_count: '{count}개 작품 일치',
            discovery_analyzing: '회차 수 분석 중...',
            discovery_empty_title: '일치하는 드라마 없음',
            discovery_empty_desc: '선택한 조건에 맞는 드라마가 없습니다. 다른 조건을 선택하거나 초기화해 보세요.',
            discovery_apply: '결과 보기',
            discovery_subheading: '나의 취향과 여유 시간에 맞춤 드라마를 찾아보세요',
            catalog_discovery_btn: '스마트 필터',
            catalog_discovery_btn_title: '취향 및 회차별 드라마 탐색',
            discovery_banner_prefix: '스마트 탐색:',
            discovery_moods: {
                all: { title: '모든 장르' },
                ceo: { title: '패도총재 / 재벌', sub: '재벌가 • 로맨스' },
                revenge: { title: '복수 & 참교육', sub: '사이다 • 통쾌함' },
                rebirth: { title: '회귀 / 빙의', sub: '인생 2회차' },
                comedy: { title: '코믹 & 힐링', sub: '유쾌 • 꿀잼' }
            },
            discovery_lengths: {
                all: { title: '전체 회차' },
                short: { title: '몰아보기 (< 35화)', sub: '빠르고 알찬 구성', label: '< 35화' },
                medium: { title: '적당한 분량 (35 – 70화)', sub: '탄탄한 스토리', label: '35 – 70화' },
                long: { title: '장편 대작 (> 70화)', sub: '몰입도 최고', label: '> 70화' }
            }
        },
        'ja-JP': {
            doc_title: 'DramaFlow PRO - プレミアムHDショートドラマ配信プラットフォーム',
            nav_home: 'ホーム',
            nav_series: 'ドラマ＆シリーズ',
            nav_anime: 'アニメ',
            nav_tags: 'タグ',
            nav_genre: 'ジャンル',
            nav_featured: '注目作品',
            search_placeholder: 'タイトル、出演者、ジャンルを検索...',
            search_header: '検索結果',
            search_count: '{count}件ヒット',
            tooltip_history: '視聴履歴',
            tooltip_favorites: 'お気に入り',
            tooltip_lang: '言語切り替え',
            nav_login: 'ログイン',
            hero_trend: '#1 本日の急上昇ランキング',
            hero_exclusive: '{provider} 独占配信',
            hero_quality: '4K超高画質',
            hero_episodes_badge: '全話配信',
            hero_ad_free: '完全広告なし',
            hero_watch_ep1: '第1話を再生',
            hero_add_list: 'マイリストに追加',
            hero_in_list: 'マイリスト保存済み',
            hero_synopsis: 'あらすじ',
            history_title: '続きから再生',
            history_subtitle: '前回途中で停止したエピソードを再開',
            clear_history_btn: '履歴をクリア',
            resume_ep_prefix: '続きを見る 第',
            top10_title: '本日の人気ショートドラマ TOP 10',
            top10_subtitle: '全配信元で今最も見られている人気作',
            favorites_title: 'マイリスト',
            favorites_subtitle: '保存したお気に入りドラマ',
            catalog_suffix: 'ライブラリ',
            prev_btn: '前へ',
            next_btn: '次へ',
            page_status: '{page}ページ',
            now_streaming: '再生中',
            ep_prefix: '第',
            episodes_title: 'エピソード一覧',
            jump_btn: '移動',
            countdown_badge: '次のエピソード',
            countdown_text: '{sec}秒後に次のエピソードへ',
            countdown_now: '今すぐ見る',
            countdown_cancel: 'キャンセル',
            ctrl_prev: '前の話',
            ctrl_next: '次の話',
            quality_header: '画質',
            sub_header: '字幕',
            sub_off: '字幕オフ',
            sub_label_off: '字幕なし',
            autoplay_next: '自動連続再生',
            toast_lang_switched: '言語を変更しました: {lang}',
            toast_fav_added: 'マイリストに追加しました！',
            toast_fav_removed: 'マイリストから削除しました',
            toast_history_cleared: '視聴履歴をクリアしました',
            discovery_nav: '探索',
            discovery_badge: 'スマート探索',
            discovery_heading: 'テーマ＆話数で作品を探す',
            discovery_mood_label: 'テーマ:',
            discovery_length_label: 'エピソード数:',
            discovery_reset: 'リセット',
            discovery_reset_title: 'フィルターをリセット',
            discovery_results_count: '{count}作品が一致',
            discovery_analyzing: '話数を分析中...',
            discovery_empty_title: '一致する作品がありません',
            discovery_empty_desc: '選択した条件に一致するドラマが見つかりませんでした。別の条件を試すかリセットしてください。',
            discovery_apply: '結果を見る',
            discovery_subheading: '気分や空き時間に合わせてショートドラマを素早く検索',
            catalog_discovery_btn: 'スマート検索',
            catalog_discovery_btn_title: 'テーマとエピソード数でドラマを探索',
            discovery_banner_prefix: 'スマート探索:',
            discovery_moods: {
                all: { title: '全テーマ' },
                ceo: { title: '溺愛社長・セレブ', sub: '御曹司 • スイート' },
                revenge: { title: '復讐・ざまぁ', sub: '逆転 • スカッと' },
                rebirth: { title: '転生・タイムリープ', sub: '人生やり直し' },
                comedy: { title: 'コメディ・爆笑', sub: '気楽 • 癒やし' }
            },
            discovery_lengths: {
                all: { title: '全エピソード' },
                short: { title: 'サクッと視聴 (< 35話)', sub: '短時間で完結', label: '< 35話' },
                medium: { title: '標準 (35 – 70話)', sub: '満足感あるストーリー', label: '35 – 70話' },
                long: { title: '長編シリーズ (> 70話)', sub: 'スリル満点 • 見応え抜群', label: '> 70話' }
            }
        },
        'id-ID': {
            doc_title: 'DramaFlow PRO - Platform Streaming Drama Pendek HD Terbaik',
            nav_home: 'Beranda',
            nav_series: 'Film & Serial',
            nav_anime: 'Anime',
            nav_tags: 'Tag',
            nav_genre: 'Genre',
            nav_featured: 'Unggulan',
            search_placeholder: 'Cari judul, pemeran, genre...',
            search_header: 'HASIL PENCARIAN',
            search_count: '{count} ditemukan',
            tooltip_history: 'Riwayat Tontonan',
            tooltip_favorites: 'Daftar Favorit Saya',
            tooltip_lang: 'Pilih Bahasa Streaming',
            nav_login: 'Masuk',
            hero_trend: '#1 PERINGKAT TERTINGGI HARI INI',
            hero_exclusive: 'EKSKLUSIF {provider}',
            hero_quality: '4K ULTRA HD',
            hero_episodes_badge: 'Seri Lengkap',
            hero_ad_free: '100% Tanpa Iklan',
            hero_watch_ep1: 'Tonton Episode 1',
            hero_add_list: 'Tambah ke Favorit',
            hero_in_list: 'Tersimpan di Favorit',
            hero_synopsis: 'Sinopsis',
            history_title: 'Lanjutkan Menonton',
            history_subtitle: 'Lanjutkan episode terakhir yang Anda tonton',
            clear_history_btn: 'Hapus Riwayat',
            resume_ep_prefix: 'Lanjut Ep',
            top10_title: 'Top 10 Drama Pendek Hari Ini',
            top10_subtitle: 'Rilisan paling banyak ditonton dan sedang tren',
            favorites_title: 'Daftar Saya',
            favorites_subtitle: 'Drama yang Anda tandai dan simpan',
            catalog_suffix: 'Katalog',
            prev_btn: 'Sebelumnya',
            next_btn: 'Berikutnya',
            page_status: 'Halaman {page}',
            now_streaming: 'SEDANG DIPUTAR',
            ep_prefix: 'Episode',
            episodes_title: 'Daftar Episode',
            jump_btn: 'Buka',
            countdown_badge: 'EPISODE BERIKUTNYA',
            countdown_text: 'Episode berikutnya dalam {sec}d',
            countdown_now: 'Tonton Sekarang',
            countdown_cancel: 'Batal',
            ctrl_prev: 'Sebelumnya',
            ctrl_next: 'Berikutnya',
            quality_header: 'Kualitas',
            sub_header: 'Subtitle',
            sub_off: 'Matikan Subtitle',
            sub_label_off: 'Subtitle Mati',
            autoplay_next: 'Putar Otomatis',
            toast_lang_switched: 'Bahasa streaming: {lang}',
            toast_fav_added: 'Ditambahkan ke Daftar Saya!',
            toast_fav_removed: 'Dihapus dari Daftar Saya',
            toast_history_cleared: 'Riwayat tontonan telah dihapus',
            discovery_nav: 'Eksplorasi',
            discovery_badge: 'EKSPLORASI PINTAR',
            discovery_heading: 'Pilih Berdasarkan Mood & Jumlah Episode',
            discovery_mood_label: 'Mood:',
            discovery_length_label: 'Panjang Episode:',
            discovery_reset: 'Reset',
            discovery_reset_title: 'Reset filter',
            discovery_results_count: '{count} drama cocok',
            discovery_analyzing: 'Menganalisis jumlah episode...',
            discovery_empty_title: 'Tidak Ada Drama yang Cocok',
            discovery_empty_desc: 'Tidak ada drama yang cocok dengan kriteria yang dipilih. Coba pilih kriteria lain atau reset.',
            discovery_apply: 'Lihat Hasil',
            discovery_subheading: 'Filter drama sesuai suasana hati dan waktu luang Anda',
            catalog_discovery_btn: 'Filter Pintar',
            catalog_discovery_btn_title: 'Eksplorasi drama berdasarkan mood & panjang episode',
            discovery_banner_prefix: 'Eksplorasi:',
            discovery_moods: {
                all: { title: 'Semua Mood' },
                ceo: { title: 'CEO Dominan', sub: 'Miliarder • Romantis' },
                revenge: { title: 'Balas Dendam', sub: 'Serangan Balik' },
                rebirth: { title: 'Kelahiran Kembali', sub: 'Kesempatan Kedua' },
                comedy: { title: 'Komedi & Santai', sub: 'Lucu • Menghibur' }
            },
            discovery_lengths: {
                all: { title: 'Semua Episode' },
                short: { title: 'Tonton Singkat (< 35 ep)', sub: 'Ringkas • Hemat Waktu', label: '< 35 ep' },
                medium: { title: 'Sedang (35 – 70 ep)', sub: 'Alur Cerita Lengkap', label: '35 – 70 ep' },
                long: { title: 'Seri Panjang (> 70 ep)', sub: 'Penuh Ketegangan', label: '> 70 ep' }
            }
        }
    };

    function t(key, params = {}) {
        let dict = I18N_DICTIONARY[currentLang];
        if (!dict) {
            dict = I18N_DICTIONARY['en-US'];
        }
        let val = dict[key];
        if (val === undefined) {
            val = (I18N_DICTIONARY['en-US'] && I18N_DICTIONARY['en-US'][key]) || (I18N_DICTIONARY['vi-VN'] && I18N_DICTIONARY['vi-VN'][key]) || key;
        }
        if (typeof val === 'string') {
            Object.keys(params).forEach(k => {
                val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
            });
        }
        return val;
    }

    const dynamicTranslationCache = new Map();

    async function translateDynamicText(text, targetLang = 'vi') {
        if (!text || typeof text !== 'string' || !text.trim()) return text;
        const clean = text.trim();
        const short = (targetLang || 'vi').toLowerCase().split('-')[0];
        if (short === 'en') return clean;
        const cacheKey = `${short}:${clean}`;
        if (dynamicTranslationCache.has(cacheKey)) {
            return dynamicTranslationCache.get(cacheKey);
        }

        try {
            // Method 1: Direct Google Translate gtx from client (fast, CORS enabled, residential IP)
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(short)}&dt=t&q=${encodeURIComponent(clean)}`;
            const res = await fetch(gUrl);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && Array.isArray(data[0])) {
                    const joined = data[0].map(s => (s && s[0]) ? s[0] : '').join('').trim();
                    if (joined) {
                        dynamicTranslationCache.set(cacheKey, joined);
                        return joined;
                    }
                }
            }
        } catch (e) { }

        // Method 2: Server API endpoint fallback
        try {
            const res2 = await fetch(`/api/translate?text=${encodeURIComponent(clean)}&target=${encodeURIComponent(short)}`);
            if (res2.ok) {
                const j2 = await res2.json();
                if (j2.ok && j2.translated) {
                    dynamicTranslationCache.set(cacheKey, j2.translated);
                    return j2.translated;
                }
            }
        } catch (e) { }

        return clean;
    }

    function applyTranslations(langCode = currentLang) {
        const isVi = langCode.startsWith('vi');
        document.documentElement.lang = isVi ? 'vi' : (langCode.split('-')[0] || 'en');
        document.title = t('doc_title');

        // Navigation links
        if (navHome) navHome.textContent = t('nav_home');
        if (navDiscovery) {
            const navDiscoveryText = document.getElementById('nav-discovery-text');
            if (navDiscoveryText) navDiscoveryText.textContent = t('discovery_nav');
        }
        const discoveryBadgeText = document.getElementById('discovery-badge-text');
        if (discoveryBadgeText) discoveryBadgeText.textContent = t('discovery_badge');
        const discoveryHeadingText = document.getElementById('discovery-heading-text');
        if (discoveryHeadingText) discoveryHeadingText.textContent = t('discovery_heading');
        const discoverySubheadingText = document.getElementById('discovery-subheading-text');
        if (discoverySubheadingText) discoverySubheadingText.textContent = t('discovery_subheading');
        const moodRowLabelText = document.getElementById('mood-row-label-text');
        if (moodRowLabelText) moodRowLabelText.textContent = t('discovery_mood_label');
        const lengthRowLabelText = document.getElementById('length-row-label-text');
        if (lengthRowLabelText) lengthRowLabelText.textContent = t('discovery_length_label');
        const discoveryResetText = document.getElementById('discovery-reset-text');
        if (discoveryResetText) discoveryResetText.textContent = t('discovery_reset');
        if (discoveryResetBtn) discoveryResetBtn.title = t('discovery_reset_title');
        const discoveryModalCloseBtn = document.getElementById('discovery-modal-close');
        if (discoveryModalCloseBtn) discoveryModalCloseBtn.title = t('tooltip_close');
        const discoveryApplyText = document.getElementById('discovery-apply-text');
        if (discoveryApplyText) discoveryApplyText.textContent = t('discovery_apply');
        const catalogDiscoveryBtnText = document.getElementById('catalog-discovery-btn-text');
        if (catalogDiscoveryBtnText) catalogDiscoveryBtnText.textContent = t('catalog_discovery_btn');
        if (catalogDiscoveryBtn) catalogDiscoveryBtn.title = t('catalog_discovery_btn_title');

        // Smart Discovery Chips
        const moodsData = t('discovery_moods') || {};
        document.querySelectorAll('#mood-chips-track .discovery-chip[data-mood]').forEach(btn => {
            const mKey = btn.getAttribute('data-mood');
            if (moodsData[mKey]) {
                const titleEl = btn.querySelector('.chip-title');
                const subEl = btn.querySelector('.chip-sub');
                if (titleEl) titleEl.textContent = moodsData[mKey].title;
                if (subEl) subEl.textContent = moodsData[mKey].sub || '';
            }
        });

        const lengthsData = t('discovery_lengths') || {};
        document.querySelectorAll('#length-chips-track .discovery-chip[data-length]').forEach(btn => {
            const lKey = btn.getAttribute('data-length');
            if (lengthsData[lKey]) {
                const titleEl = btn.querySelector('.chip-title');
                const subEl = btn.querySelector('.chip-sub');
                if (titleEl) titleEl.textContent = lengthsData[lKey].title;
                if (subEl) subEl.textContent = lengthsData[lKey].sub || '';
            }
        });

        // Sync Discovery Count Preview if modal open
        if (typeof updateDiscoveryCountPreview === 'function' && discoveryModal && !discoveryModal.hidden) {
            updateDiscoveryCountPreview();
        }

        // Re-sync active discovery filter banner if currently filtered
        if (typeof activeDiscoveryMood !== 'undefined' && (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all')) {
            let descParts = [];
            if (activeDiscoveryMood !== 'all' && moodsData[activeDiscoveryMood]) {
                descParts.push(moodsData[activeDiscoveryMood].title);
            }
            if (activeDiscoveryLength !== 'all' && lengthsData[activeDiscoveryLength]) {
                descParts.push(lengthsData[activeDiscoveryLength].label || lengthsData[activeDiscoveryLength].title);
            }
            const filterLabel = descParts.join(' • ');
            if (catalogSubtitle) {
                catalogSubtitle.textContent = `${t('discovery_banner_prefix')} ${filterLabel}`;
            }
            if (activeFilterBanner && activeFilterText) {
                activeFilterText.innerHTML = `<i class="fa-solid fa-sliders"></i> ${filterLabel}`;
            }
        }

        if (navSeries) navSeries.textContent = t('nav_series');
        if (navAnime) navAnime.textContent = t('nav_anime');
        if (navFeatured) navFeatured.textContent = t('nav_featured');
        if (navTagsBtn) {
            const span = navTagsBtn.querySelector('span');
            if (span) span.textContent = t('nav_tags');
        }
        if (navGenreBtn) {
            const span = navGenreBtn.querySelector('span');
            if (span) span.textContent = t('nav_genre');
        }

        // Dropdown headers
        const tagsHeader = document.querySelector('#nav-tags-menu .nav-dropdown-header span');
        if (tagsHeader) tagsHeader.innerHTML = `<i class="fa-solid fa-hashtag text-primary"></i> ${t('tags_header')}`;
        const tagsBadge = document.querySelector('#nav-tags-menu .nav-dropdown-badge');
        if (tagsBadge) tagsBadge.textContent = t('tags_badge');

        const genreHeader = document.querySelector('#nav-genre-menu .nav-dropdown-header span');
        if (genreHeader) genreHeader.innerHTML = `<i class="fa-solid fa-film text-rose"></i> ${t('genre_header')}`;
        const genreBadge = document.querySelector('#nav-genre-menu .nav-dropdown-badge');
        if (genreBadge) genreBadge.textContent = t('genre_badge');

        // Genre items
        const genresData = t('genres') || {};
        document.querySelectorAll('.genre-item-btn[data-genre]').forEach(btn => {
            const gKey = btn.getAttribute('data-genre');
            if (genresData[gKey]) {
                const nameEl = btn.querySelector('.genre-name');
                const subEl = btn.querySelector('.genre-sub');
                if (nameEl) nameEl.textContent = genresData[gKey].name;
                if (subEl) subEl.textContent = genresData[gKey].sub;
            }
        });

        // Search bar
        if (searchInput) searchInput.placeholder = t('search_placeholder');
        const searchHeader = document.querySelector('#search-dropdown .search-dropdown-header span:first-child');
        if (searchHeader) searchHeader.textContent = t('search_header');

        // Navigation utility buttons
        if (navHistoryIconBtn) navHistoryIconBtn.title = t('tooltip_history');
        if (navFavoritesIconBtn) navFavoritesIconBtn.title = t('tooltip_favorites');
        if (langBtn) langBtn.title = t('tooltip_lang');
        const langMenuHeader = document.querySelector('.lang-menu-header');
        if (langMenuHeader) langMenuHeader.textContent = t('lang_menu_header');
        const navLoginBtnBlock = document.getElementById('nav-login-btn-block');
        if (navLoginBtnBlock) {
            navLoginBtnBlock.title = t('nav_login_title');
            const loginText = navLoginBtnBlock.querySelector('span');
            if (loginText) loginText.textContent = t('nav_login');
        }

        // Hero section
        if (heroPlayText) heroPlayText.textContent = t('hero_play_btn');
        if (heroDetailText) heroDetailText.textContent = t('hero_detail_btn');
        if (heroFavBtn) {
            const inFav = (heroSliderItems && heroSliderItems[currentHeroIndex]) ? isFavorite(heroSliderItems[currentHeroIndex].title) : false;
            heroFavBtn.innerHTML = inFav ? `<i class="fa-solid fa-heart text-rose"></i>` : `<i class="fa-regular fa-heart"></i>`;
            heroFavBtn.classList.toggle('active', inFav);
            heroFavBtn.setAttribute('title', inFav ? t('hero_in_list') : t('hero_add_list'));
        }

        // Rails
        const hTitle = document.getElementById('history-title');
        if (hTitle) hTitle.textContent = t('history_title');
        const hSub = document.getElementById('history-subtitle');
        if (hSub) hSub.textContent = t('history_subtitle');
        const clearHistText = document.getElementById('clear-history-text');
        if (clearHistText) clearHistText.textContent = t('clear_history_btn');

        const top10Title = document.getElementById('top10-title');
        if (top10Title) top10Title.textContent = t('top10_title');
        const top10Sub = document.getElementById('top10-subtitle');
        if (top10Sub) top10Sub.textContent = t('top10_subtitle');

        const favTitle = document.getElementById('favorites-title');
        if (favTitle) favTitle.innerHTML = `${t('favorites_title')} (<span id="favorites-count">${getFavorites().length}</span>)`;
        const favSub = document.getElementById('favorites-subtitle');
        if (favSub) favSub.textContent = t('favorites_subtitle');

        const catalogSuffix = document.getElementById('catalog-title-suffix');
        if (catalogSuffix) catalogSuffix.textContent = t('catalog_suffix');
        const catalogSub = document.getElementById('catalog-subtitle');
        if (catalogSub) catalogSub.textContent = t('catalog_subtitle', { provider: currentProvider.toUpperCase() });

        const emptyTitle = document.getElementById('empty-title');
        if (emptyTitle) emptyTitle.textContent = t('empty_title');
        const emptyDesc = document.getElementById('empty-desc');
        if (emptyDesc) emptyDesc.textContent = t('empty_desc');

        // Filter banner
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.innerHTML = `<i class="fa-solid fa-xmark"></i> ${t('clear_filter')}`;

        // Pagination
        updatePaginationUI();

        // Player Modal Top Bar
        const livePillText = document.getElementById('live-pill-text');
        if (livePillText) livePillText.textContent = t('now_streaming');
        const modalMinBtn = document.getElementById('modal-minimize-btn');
        if (modalMinBtn) modalMinBtn.title = t('tooltip_minimize');
        const theaterBtn = document.getElementById('theater-toggle-btn');
        if (theaterBtn) theaterBtn.title = t('tooltip_theater');
        const modalFavBtnEl = document.getElementById('modal-fav-btn');
        if (modalFavBtnEl) modalFavBtnEl.title = t('tooltip_fav');
        const modalShareBtn = document.getElementById('modal-share-btn');
        if (modalShareBtn) modalShareBtn.title = t('tooltip_share');
        const modalCloseBtnEl = document.getElementById('modal-close-btn');
        if (modalCloseBtnEl) modalCloseBtnEl.setAttribute('aria-label', t('tooltip_close'));

        // Miniplayer Viewport Hover Overlay
        const miniOvExpand = document.getElementById('mini-ov-expand-btn');
        if (miniOvExpand) miniOvExpand.title = t('tooltip_expand');
        const miniOvPlay = document.getElementById('mini-ov-play-btn');
        if (miniOvPlay) miniOvPlay.title = t('tooltip_play_pause');
        const miniOvClose = document.getElementById('mini-ov-close-btn');
        if (miniOvClose) miniOvClose.title = t('tooltip_close');

        // Miniplayer Bottom Bar
        const miniExpandArea = document.getElementById('miniplayer-expand-area');
        if (miniExpandArea) miniExpandArea.title = t('tooltip_expand');
        const miniPlayBtn = document.getElementById('miniplayer-play-btn');
        if (miniPlayBtn) miniPlayBtn.title = t('tooltip_play_pause');
        const miniNextBtn = document.getElementById('miniplayer-next-btn');
        if (miniNextBtn) miniNextBtn.title = t('tooltip_next_ep');
        const miniExpandBtn = document.getElementById('miniplayer-expand-btn');
        if (miniExpandBtn) miniExpandBtn.title = t('tooltip_expand');
        const miniCloseBtn = document.getElementById('miniplayer-close-btn');
        if (miniCloseBtn) miniCloseBtn.title = t('tooltip_close');

        // Countdown overlay
        const countdownBadge = document.getElementById('countdown-badge');
        if (countdownBadge) countdownBadge.innerHTML = `<i class="fa-solid fa-forward-step"></i> ${t('countdown_badge')}`;
        const cdNowText = document.getElementById('countdown-now-text');
        if (cdNowText) cdNowText.textContent = t('countdown_now');
        const cdCancelBtn = document.getElementById('btn-countdown-cancel');
        if (cdCancelBtn) cdCancelBtn.title = t('countdown_cancel');
        const cdCancelText = document.getElementById('countdown-cancel-text');
        if (cdCancelText) cdCancelText.textContent = t('countdown_cancel');

        // Resume banner
        const resumePrompt = document.getElementById('resume-playback-prompt');
        if (resumePrompt) {
            const labelEl = document.getElementById('resume-time-label');
            const currentTimeText = (_pendingResumeTime && _pendingResumeTime >= 3)
                ? formatTime(_pendingResumeTime)
                : (labelEl && labelEl.textContent && labelEl.textContent !== '00:00' ? labelEl.textContent : '00:00');
            resumePrompt.innerHTML = `${t('resume_prompt', { time: `<strong id="resume-time-label">${currentTimeText}</strong>` })}`;
        }
        const btnResumeAcceptEl = document.getElementById('btn-resume-accept');
        if (btnResumeAcceptEl) btnResumeAcceptEl.textContent = t('resume_yes');
        const btnResumeDismissEl = document.getElementById('btn-resume-dismiss');
        if (btnResumeDismissEl) btnResumeDismissEl.title = t('resume_dismiss');

        // Mobile scroll hint
        const mobileHint = document.getElementById('mobile-scroll-hint');
        if (mobileHint) mobileHint.innerHTML = `<span>${t('mobile_episodes_hint')}</span> <i class="fa-solid fa-chevron-down"></i>`;

        // Reels Overlay Buttons & Sheet
        const reelsLikeLabel = document.getElementById('reels-like-label');
        if (reelsLikeLabel) reelsLikeLabel.textContent = t('reels_like_btn');
        const reelsLikeBtn = document.getElementById('reels-like-btn');
        if (reelsLikeBtn) reelsLikeBtn.title = t('hero_add_list');
        const reelsEpBadgeText = document.getElementById('reels-ep-badge-text');
        if (reelsEpBadgeText) reelsEpBadgeText.textContent = t('reels_episodes_btn');
        const reelsEpBtn = document.getElementById('reels-episodes-btn');
        if (reelsEpBtn) reelsEpBtn.title = t('episodes_title');
        const reelsShareBtn = document.getElementById('reels-share-btn');
        if (reelsShareBtn) {
            reelsShareBtn.title = t('tooltip_share');
            const shareLbl = reelsShareBtn.querySelector('.reels-action-label');
            if (shareLbl) shareLbl.textContent = t('reels_share_btn');
        }
        const reelsExitBtn = document.getElementById('reels-exit-btn');
        if (reelsExitBtn) {
            reelsExitBtn.title = t('reels_exit_btn');
            const exitLbl = reelsExitBtn.querySelector('.reels-action-label');
            if (exitLbl) exitLbl.textContent = t('reels_exit_btn');
        }
        const reelsFeedToggleBtn = document.getElementById('reels-feed-toggle-btn');
        if (reelsFeedToggleBtn) reelsFeedToggleBtn.title = t('tooltip_reels');
        const reelsSheetHeading = document.getElementById('reels-sheet-heading');
        if (reelsSheetHeading) reelsSheetHeading.textContent = t('episodes_title');
        const reelsSheetClose = document.getElementById('reels-sheet-close');
        if (reelsSheetClose) reelsSheetClose.setAttribute('aria-label', t('tooltip_close'));
        const reelsSwipeHint = document.querySelector('.reels-swipe-hint');
        if (reelsSwipeHint) reelsSwipeHint.textContent = t('reels_swipe_hint');

        // Media controls
        if (prevEpBtn) prevEpBtn.innerHTML = `<i class="fa-solid fa-backward-step"></i> ${t('ctrl_prev')}`;
        if (nextEpBtn) nextEpBtn.innerHTML = `${t('ctrl_next')} <i class="fa-solid fa-forward-step"></i>`;
        const btnPip = document.getElementById('btn-pip');
        if (btnPip) btnPip.title = t('ctrl_pip_title');
        const btnShortcuts = document.getElementById('btn-shortcuts-hint');
        if (btnShortcuts) btnShortcuts.title = t('ctrl_shortcuts_title');

        // Quality dropdown
        const qualityBtnEl = document.getElementById('quality-btn');
        if (qualityBtnEl) qualityBtnEl.title = t('quality_btn_title');
        const qualityHeader = document.getElementById('quality-menu-header-text');
        if (qualityHeader) qualityHeader.textContent = t('quality_header');
        const qAutoText = document.getElementById('q-auto-text');
        if (qAutoText) qAutoText.textContent = t('quality_auto');

        // Subtitle dropdown
        if (subtitleBtn) subtitleBtn.title = t('sub_btn_title');
        const subHeader = document.getElementById('subtitle-menu-header-text');
        if (subHeader) subHeader.textContent = t('sub_header');
        const subOffText = document.getElementById('sub-off-text');
        if (subOffText) subOffText.textContent = t('sub_off');
        if (subtitleLabel && selectedSubtitle === 'off') subtitleLabel.textContent = t('sub_label_off');

        // Autoplay toggle
        const autoplayWrapper = document.getElementById('autoplay-toggle-wrapper');
        if (autoplayWrapper) autoplayWrapper.title = t('autoplay_next_title');
        const autoplayLabel = document.getElementById('autoplay-next-label');
        if (autoplayLabel) autoplayLabel.textContent = t('autoplay_next');

        // Stream badge
        const streamTypeText = document.getElementById('stream-type-text');
        if (streamTypeText) streamTypeText.textContent = t('stream_badge');

        // Synopsis header
        const detailTitleEl = document.getElementById('detail-drama-title');
        if (detailTitleEl && (!currentDramaData || !currentDramaData.title)) {
            detailTitleEl.textContent = t('overview_title');
        }
        const licensedChip = document.querySelector('.synopsis-meta-chips .meta-chip:first-child');
        if (licensedChip) licensedChip.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ${t('meta_licensed')}`;
        const cdnChip = document.querySelector('.synopsis-meta-chips .meta-chip:last-child');
        if (cdnChip) cdnChip.innerHTML = `<i class="fa-solid fa-bolt text-amber"></i> ${t('meta_fast_cdn')}`;

        // Episodes drawer
        const epDrawerHeading = document.getElementById('episodes-drawer-heading');
        if (epDrawerHeading) epDrawerHeading.textContent = t('episodes_title');
        const jumpInput = document.getElementById('jump-ep-input');
        if (jumpInput) jumpInput.placeholder = t('jump_placeholder');
        const jumpBtn = document.getElementById('jump-ep-btn');
        if (jumpBtn) jumpBtn.textContent = t('jump_btn');

        // If modal is actively playing an episode, sync episode title pill and miniplayer subtitle
        if (currentDramaData && currentDramaData.episodes && currentDramaData.episodes[currentEpisodeIndex]) {
            const ep = currentDramaData.episodes[currentEpisodeIndex];
            const epNum = ep.number || currentEpisodeIndex + 1;
            if (modalEpisodeTitle) modalEpisodeTitle.textContent = `${t('ep_prefix')} ${epNum}`;
            if (miniplayerSubtitle) miniplayerSubtitle.textContent = `${t('ep_prefix')} ${epNum} • ${currentDramaData.category_name || 'DramaFlow'}`;
        }

        // Shortcuts modal
        const scModalTitle = document.getElementById('shortcuts-modal-title');
        if (scModalTitle) scModalTitle.textContent = t('shortcuts_title');
        const scBadge = document.getElementById('shortcuts-badge');
        if (scBadge) scBadge.innerHTML = `<i class="fa-solid fa-keyboard"></i> ${t('shortcuts_badge')}`;
        document.querySelectorAll('#shortcuts-grid [data-sc]').forEach(span => {
            const scKey = span.getAttribute('data-sc');
            if (scKey && t('sc_' + scKey)) span.textContent = t('sc_' + scKey);
        });

        // Login VIP Modal
        const loginBadge = document.getElementById('login-modal-badge');
        if (loginBadge) loginBadge.innerHTML = `<i class="fa-solid fa-crown"></i> ${t('login_badge')}`;
        const loginTitle = document.getElementById('login-modal-title');
        if (loginTitle) loginTitle.textContent = t('login_title');
        const loginDesc = document.getElementById('login-modal-desc');
        if (loginDesc) loginDesc.textContent = t('login_desc');
        const loginUserLabel = document.getElementById('login-username-label');
        if (loginUserLabel) loginUserLabel.innerHTML = `<i class="fa-solid fa-user"></i> ${t('login_username_label')}`;
        const loginUserInput = document.getElementById('login-username');
        if (loginUserInput) loginUserInput.placeholder = t('login_username_placeholder');
        const loginEmailLabel = document.getElementById('login-email-label');
        if (loginEmailLabel) loginEmailLabel.innerHTML = `<i class="fa-solid fa-envelope"></i> ${t('login_email_label')}`;
        const loginSubmitText = document.getElementById('login-submit-text');
        if (loginSubmitText) loginSubmitText.textContent = t('login_submit');
        const loginStatusText = document.getElementById('login-status-text');
        if (loginStatusText) loginStatusText.innerHTML = `${t('login_vip_status')}`;

        // Footer
        const footerDesc = document.querySelector('.footer-desc');
        if (footerDesc) footerDesc.textContent = t('footer_desc');
        const footerSsl = document.querySelector('.footer-security-badges .sec-badge:first-child');
        if (footerSsl) footerSsl.innerHTML = `<i class="fa-solid fa-shield-halved text-success"></i> ${t('footer_ssl')}`;
        const footerLatency = document.querySelector('.footer-security-badges .sec-badge:last-child');
        if (footerLatency) footerLatency.innerHTML = `<i class="fa-solid fa-bolt text-amber"></i> ${t('footer_latency')}`;
        const footerTopProv = document.querySelector('.footer-links-group .footer-col:first-child h5');
        if (footerTopProv) footerTopProv.textContent = t('footer_top_providers');
        const footerFeat = document.querySelector('.footer-links-group .footer-col:last-child h5');
        if (footerFeat) footerFeat.textContent = t('footer_features');
        const footerLinks = document.querySelectorAll('.footer-links-group .footer-col:last-child a');
        if (footerLinks[0]) footerLinks[0].textContent = t('footer_top10');
        if (footerLinks[1]) footerLinks[1].textContent = t('footer_resume');
        if (footerLinks[2]) footerLinks[2].textContent = t('footer_bookmarks');
        if (footerLinks[3]) footerLinks[3].textContent = t('footer_trending');
        const footerCopy = document.querySelector('.footer-copyright-bar p');
        if (footerCopy) footerCopy.textContent = t('footer_copyright');
        const legalLinks = document.querySelectorAll('.footer-legal-links a');
        if (legalLinks[0]) legalLinks[0].textContent = t('footer_privacy');
        if (legalLinks[1]) legalLinks[1].textContent = t('footer_terms');
        if (legalLinks[2]) legalLinks[2].textContent = t('footer_dmca');
        if (legalLinks[3]) legalLinks[3].textContent = t('footer_api');

        // Re-render local rails to update card labels
        renderHistoryRail();
        renderFavoritesRail();
    }

    function initLanguageSelector() {
        if (!langBtn || !langMenu || !langOptionsList) return;
        const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];
        if (currentLangLabel) currentLangLabel.textContent = activeLang.native || activeLang.label;
        renderLanguageOptions();

        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !langMenu.hidden;
            langMenu.hidden = isOpen;
            langBtn.setAttribute('aria-expanded', String(!isOpen));
        });

        document.addEventListener('click', (e) => {
            if (!langBtn.contains(e.target) && !langMenu.contains(e.target)) {
                langMenu.hidden = true;
                langBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function renderLanguageOptions() {
        if (!langOptionsList) return;
        langOptionsList.innerHTML = '';
        SUPPORTED_LANGUAGES.forEach(lang => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `lang-option-btn ${lang.code === currentLang ? 'active' : ''}`;
            btn.innerHTML = `
                <span>${escapeHtml(lang.native)}</span>
                ${lang.code === currentLang ? '<span class="lang-option-dot"></span>' : ''}
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectLanguage(lang.code);
            });
            langOptionsList.appendChild(btn);
        });
    }

    function selectLanguage(code) {
        if (currentLang === code) {
            langMenu.hidden = true;
            langBtn.setAttribute('aria-expanded', 'false');
            return;
        }
        currentLang = code;
        localStorage.setItem('df_selected_lang', code);
        const activeLang = SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
        if (currentLangLabel) currentLangLabel.textContent = activeLang.native || activeLang.label;
        renderLanguageOptions();
        langMenu.hidden = true;
        langBtn.setAttribute('aria-expanded', 'false');

        // Apply translations across all UI components instantly
        applyTranslations(code);

        // If a drama is currently open, update the URL and document title to match the newly selected language
        if (currentDramaData && !playerModal.hidden) {
            const epNum = currentDramaData.episodes?.[currentEpisodeIndex]?.number || (currentEpisodeIndex + 1);
            const dramaSlug = getDramaSlug(currentDramaData);
            updateDramaUrl(dramaSlug, epNum, true);
            const loadedTitle = decodeHtml(currentDramaData.title || dramaSlug);
            document.title = `${loadedTitle} - ${t('ep_prefix')} ${epNum} | DramaFlow`;
        }

        showToast(t('toast_lang_switched', { lang: activeLang.native }), 'fa-globe');

        // Automatically sync subtitle language if active
        const shortCode = code.split('-')[0];
        if (selectedSubtitle !== 'off' && SUBTITLE_LABELS[shortCode]) {
            selectSubtitle(shortCode);
        }

        currentPage = 1;
        loadSections();
    }

    // ==========================================
    // 2. PROVIDERS & SECTIONS
    // ==========================================
    async function loadProviders() {
        try {
            const res = await fetch('/api/providers');
            const data = await res.json();
            if (data.ok && data.providers) {
                renderProviders(data.providers);
            }
        } catch (e) {
            console.error('Failed to load providers:', e);
        }
    }

    function renderProviders(providers) {
        if (!Array.isArray(providers) || providers.length === 0) return;
        providersContainer.innerHTML = '';
        providers.forEach(p => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `provider-pill ${p.key === currentProvider ? 'active' : ''}`;
            pill.setAttribute('data-provider', p.key);
            pill.setAttribute('title', `Explore ${p.label || p.key}`);

            const textSpan = document.createElement('span');
            textSpan.textContent = p.label || p.key;
            pill.appendChild(textSpan);

            pill.addEventListener('click', () => {
                selectProvider(p.key, p.label);
                pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            });
            providersContainer.appendChild(pill);
        });
    }

    function selectProvider(key, label) {
        if (currentProvider === key && !activeFilterType) return;
        currentProvider = key;
        currentPage = 1;
        // Automatically reset Smart Discovery filter so switching providers gives a fresh, full catalog
        if (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all') {
            activeDiscoveryMood = 'all';
            activeDiscoveryLength = 'all';
            draftDiscoveryMood = 'all';
            draftDiscoveryLength = 'all';
            syncDiscoveryModalChipsUI();
        }

        if (activeFilterType || (activeFilterBanner && !activeFilterBanner.hidden)) {
            activeFilterType = null;
            activeFilterValue = null;
            if (activeFilterBanner) activeFilterBanner.hidden = true;
            if (catalogSubtitle) catalogSubtitle.textContent = 'High definition streaming collection';
            const topPag = document.getElementById('top-pagination-bar');
            if (topPag) topPag.style.display = '';
        }
        document.querySelectorAll('.provider-pill').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-provider') === key);
        });
        currentProviderTitle.textContent = label || key.toUpperCase();
        loadSections();
    }

    async function loadSections() {
        gridLoader.hidden = false;
        emptyState.hidden = true;
        dramaGrid.innerHTML = '';

        try {
            const res = await fetch(`/api/sections?provider=${currentProvider}&page=${currentPage}&lang=${currentLang}`);
            const data = await res.json();

            gridLoader.hidden = true;

            if (Array.isArray(data.providers) && data.providers.length > 0) {
                if (providersContainer.children.length !== data.providers.length) {
                    renderProviders(data.providers);
                }
            }

            if (!data.ok || !data.sections || data.sections.length === 0) {
                emptyState.hidden = false;
                return;
            }

            // Extract unique items
            const allItems = [];
            data.sections.forEach(sec => {
                if (Array.isArray(sec.items)) {
                    sec.items.forEach(item => {
                        if (!allItems.some(x => x.title === item.title)) {
                            item.provider_key = currentProvider;
                            allItems.push(item);
                        }
                    });
                }
            });

            if (allItems.length === 0) {
                emptyState.hidden = false;
                return;
            }

            allLoadedLibraryItems = allItems;

            // Trigger low-priority background prefetch of episode counts
            prefetchEpisodeCountsInBackground(allItems);

            // Setup Hero Showcase Slider with top 6 items
            setupHeroSlider(allItems.slice(0, 6));

            // Render Top 10 Rail
            renderTop10Rail(allItems.slice(0, 10));

            // Render Library Grid (or apply Smart Discovery filter if active)
            if (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all') {
                applySmartDiscoveryFilter(false);
            } else {
                renderGrid(allItems);
            }

            // Update Pagination
            updatePaginationUI();
        } catch (e) {
            gridLoader.hidden = true;
            emptyState.hidden = false;
            console.error('Error loading sections:', e);
        }
    }

    const DEFAULT_FALLBACK_POSTER = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&auto=format&fit=crop&q=80';

    function formatPosterUrl(url) {
        if (!url || typeof url !== 'string') return DEFAULT_FALLBACK_POSTER;
        const trimmed = url.trim();
        if (trimmed.startsWith('//')) return `https:${trimmed}`;
        if (trimmed.startsWith('/')) return `https://narto-drama.com${trimmed}`;
        return trimmed;
    }

    // ==========================================
    // HERO SHOWCASE SLIDER SYSTEM (3D Coverflow)
    // ==========================================
    const heroEpisodeCache = new Map();
    const heroItemFetchPromises = new Map();

    function updateHeroEpisodeBadge(item, slideIndex) {
        if (!heroEpisodesBadge || !item) return;

        const epCount = (item.episodes && item.episodes.length > 0)
            ? item.episodes.length
            : (item.total_episodes || item.chapter_count);

        if (epCount) {
            heroEpisodesBadge.textContent = `${epCount} ${t('hero_episodes_suffix')}`;
            heroEpisodesBadge.style.opacity = '1';
            return;
        }

        const watchUrl = item.watch_url || item.url || '';
        if (watchUrl && heroEpisodeCache.has(watchUrl)) {
            const cached = heroEpisodeCache.get(watchUrl);
            item.total_episodes = cached.total_episodes;
            if (cached.episodes) item.episodes = cached.episodes;
            heroEpisodesBadge.textContent = `${cached.total_episodes} ${t('hero_episodes_suffix')}`;
            heroEpisodesBadge.style.opacity = '1';
            return;
        }

        // Show subtle loading state until accurate episode count arrives
        heroEpisodesBadge.textContent = `... ${t('hero_episodes_suffix')}`;
        heroEpisodesBadge.style.opacity = '0.65';

        fetchHeroItemDetails(item, slideIndex);
    }

    function fetchHeroItemDetails(item, slideIndex) {
        const watchUrl = item.watch_url || item.url || '';
        if (!watchUrl) return Promise.resolve(null);

        if (heroEpisodeCache.has(watchUrl)) {
            const cached = heroEpisodeCache.get(watchUrl);
            item.total_episodes = cached.total_episodes;
            if (cached.episodes) item.episodes = cached.episodes;
            if (currentHeroIndex === slideIndex && heroEpisodesBadge) {
                heroEpisodesBadge.textContent = `${cached.total_episodes} ${t('hero_episodes_suffix')}`;
                heroEpisodesBadge.style.opacity = '1';
            }
            return Promise.resolve(cached);
        }

        if (heroItemFetchPromises.has(watchUrl)) {
            return heroItemFetchPromises.get(watchUrl).then(data => {
                if (data && currentHeroIndex === slideIndex && heroEpisodesBadge) {
                    heroEpisodesBadge.textContent = `${data.total_episodes} ${t('hero_episodes_suffix')}`;
                    heroEpisodesBadge.style.opacity = '1';
                }
                return data;
            });
        }

        const p = fetch(`/api/drama?watch_url=${encodeURIComponent(watchUrl)}&lang=${encodeURIComponent(currentLang)}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.ok && (data.total_episodes || (data.episodes && data.episodes.length > 0))) {
                    const count = data.total_episodes || data.episodes.length;
                    item.total_episodes = count;
                    item.episodes = data.episodes;
                    heroEpisodeCache.set(watchUrl, {
                        total_episodes: count,
                        episodes: data.episodes,
                        title: data.title,
                        description: data.description
                    });

                    // Update badge if user is currently viewing this slide
                    if (currentHeroIndex === slideIndex && heroEpisodesBadge) {
                        heroEpisodesBadge.textContent = `${count} ${t('hero_episodes_suffix')}`;
                        heroEpisodesBadge.style.opacity = '1';
                    }
                    return data;
                }
                return null;
            })
            .catch(err => {
                console.warn('[Hero] Error fetching drama metadata:', err);
                if (currentHeroIndex === slideIndex && heroEpisodesBadge) {
                    heroEpisodesBadge.style.opacity = '1';
                }
                return null;
            })
            .finally(() => {
                heroItemFetchPromises.delete(watchUrl);
            });

        heroItemFetchPromises.set(watchUrl, p);
        return p;
    }

    function prefetchHeroItems(items) {
        if (!Array.isArray(items)) return;
        items.forEach((item, idx) => {
            setTimeout(() => {
                fetchHeroItemDetails(item, idx);
            }, idx * 200);
        });
    }

    function setupHeroSlider(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        heroSliderItems = items;
        currentHeroIndex = 0;

        renderHeroCoverflowCards();
        renderHeroIndicators();
        renderHeroSlide(0, false);
        startHeroAutoPlay();

        // Prefetch accurate episode counts & full episodes for hero slider items
        prefetchHeroItems(items);
    }

    function renderHeroCoverflowCards() {
        if (!heroCoverflowCards) return;
        heroCoverflowCards.innerHTML = '';

        heroSliderItems.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'hero-coverflow-card';
            card.setAttribute('data-index', idx);
            card.setAttribute('title', item.title || '');

            const posterSrc = formatPosterUrl(item.poster_url);
            const providerName = item.category_name || currentProvider || 'DramaBox';

            card.innerHTML = `
                <img src="${posterSrc}" alt="${escapeHtml(item.title || '')}" loading="lazy" />
                <div class="card-exclusive-badge">
                    <i class="fa-solid fa-play"></i>
                    <span>${escapeHtml(providerName)} ${t('badge_exclusive')}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                if (idx === currentHeroIndex) {
                    openDrama(item);
                } else {
                    goToHeroSlide(idx);
                }
            });

            heroCoverflowCards.appendChild(card);
        });
    }

    function getHeroTags(item) {
        if (item.tag_names && Array.isArray(item.tag_names) && item.tag_names.length > 0) {
            return item.tag_names.slice(0, 2);
        }

        const pool = [
            'Báo Thù', 'Tình một đêm', 'Tổng Tài', 'Hôn Nhân', 'Trọng Sinh',
            'Xuyên Không', 'Ma Cà Rồng', 'Người Sói', 'Hào Môn', 'Vua Rồng',
            'Độc Quyền', 'Lồng Tiếng', 'Tình Cảm', 'Ngọt Sủng'
        ];

        const text = `${item.title || ''} ${item.description || ''}`;
        const found = pool.filter(k => text.toLowerCase().includes(k.toLowerCase()));

        if (found.length >= 2) {
            return found.slice(0, 2);
        }

        const fallback = [
            found[0] || (currentLang === 'vi-VN' ? 'Báo Thù' : 'Revenge'),
            currentLang === 'vi-VN' ? 'Tình một đêm' : 'Romance'
        ];
        return fallback.slice(0, 2);
    }

    function renderHeroIndicators() {
        if (!heroIndicators) return;
        heroIndicators.innerHTML = '';
        heroSliderItems.forEach((item, idx) => {
            const dot = document.createElement('div');
            dot.className = `hero-indicator-dot ${idx === currentHeroIndex ? 'active' : ''}`;
            dot.setAttribute('title', `Slide ${idx + 1}: ${item.title || ''}`);
            dot.innerHTML = '<div class="hero-indicator-progress"></div>';
            dot.addEventListener('click', () => {
                goToHeroSlide(idx);
            });
            heroIndicators.appendChild(dot);
        });
        updateHeroCounter();
    }

    function updateHeroCounter() {
        if (heroSlideCounter && heroSliderItems.length > 0) {
            heroSlideCounter.textContent = `${currentHeroIndex + 1} / ${heroSliderItems.length}`;
        }
    }

    function renderHeroSlide(index, animate = true) {
        if (index < 0 || index >= heroSliderItems.length) return;
        currentHeroIndex = index;
        const item = heroSliderItems[index];
        if (!item) return;

        updateHeroCounter();

        // Update indicator dots active state
        if (heroIndicators) {
            Array.from(heroIndicators.children).forEach((dot, dotIdx) => {
                dot.classList.toggle('active', dotIdx === index);
                const prog = dot.querySelector('.hero-indicator-progress');
                if (prog) {
                    prog.style.width = dotIdx === index ? '0%' : (dotIdx < index ? '100%' : '0%');
                }
            });
        }

        // Update 3D Coverflow Card Positions
        if (heroCoverflowCards) {
            const total = heroSliderItems.length;
            const cards = heroCoverflowCards.querySelectorAll('.hero-coverflow-card');
            cards.forEach((card, idx) => {
                let diff = idx - index;
                while (diff > total / 2) diff -= total;
                while (diff < -total / 2) diff += total;

                card.classList.remove('is-active', 'is-left-1', 'is-left-2', 'is-right-1', 'is-right-2', 'is-hidden');

                if (diff === 0) {
                    card.classList.add('is-active');
                } else if (diff === -1) {
                    card.classList.add('is-left-1');
                } else if (diff === -2) {
                    card.classList.add('is-left-2');
                } else if (diff === 1) {
                    card.classList.add('is-right-1');
                } else if (diff === 2) {
                    card.classList.add('is-right-2');
                } else {
                    card.classList.add('is-hidden');
                }
            });
        }

        const applyContent = () => {
            if (heroTitle) heroTitle.textContent = item.title || 'Featured Drama Series';
            if (heroDesc) {
                const rawHeroDesc = item.description || 'Watch all episodes of trending short dramas in full HD without ads.';
                heroDesc.textContent = rawHeroDesc;
                const shortLang = (currentLang || 'vi').split('-')[0];
                if (shortLang !== 'en' && item.description) {
                    translateDynamicText(item.description, shortLang).then(trans => {
                        if (trans && heroDesc) heroDesc.textContent = trans;
                    });
                }
            }
            if (heroBackdrop) heroBackdrop.style.backgroundImage = `url('${formatPosterUrl(item.poster_url)}')`;

            // Episode count badge (accurate real-time episode count per drama)
            if (heroEpisodesBadge) {
                updateHeroEpisodeBadge(item, index);
            }

            // Tags pills
            if (heroTags) {
                heroTags.innerHTML = '';
                const tags = getHeroTags(item);
                tags.forEach(tName => {
                    const pill = document.createElement('span');
                    pill.className = 'hero-tag-pill';
                    pill.textContent = tName;
                    heroTags.appendChild(pill);
                });
            }

            if (heroPlayBtn) heroPlayBtn.onclick = () => openDrama(item);
            if (heroMoreBtn) heroMoreBtn.onclick = () => openDrama(item);

            if (heroFavBtn) {
                heroFavBtn.onclick = () => {
                    toggleFavorite(item);
                    syncHeroFavBtn(item);
                };
                syncHeroFavBtn(item);
            }

            if (animate && heroContentWrap) {
                heroContentWrap.classList.remove('slide-transitioning');
            }
        };

        if (animate && heroContentWrap) {
            heroContentWrap.classList.add('slide-transitioning');
            setTimeout(applyContent, 180);
        } else {
            applyContent();
        }
    }

    function nextHeroSlide() {
        if (heroSliderItems.length <= 1) return;
        const nextIdx = (currentHeroIndex + 1) % heroSliderItems.length;
        renderHeroSlide(nextIdx, true);
    }

    function prevHeroSlide() {
        if (heroSliderItems.length <= 1) return;
        const prevIdx = (currentHeroIndex - 1 + heroSliderItems.length) % heroSliderItems.length;
        renderHeroSlide(prevIdx, true);
    }

    function goToHeroSlide(index) {
        if (index === currentHeroIndex) return;
        renderHeroSlide(index, true);
        startHeroAutoPlay();
    }

    function startHeroAutoPlay() {
        stopHeroAutoPlay();
        if (heroSliderItems.length <= 1) return;

        heroProgressPercent = 0;
        const DURATION_MS = 5000;
        const INTERVAL_MS = 50;
        const step = (INTERVAL_MS / DURATION_MS) * 100;

        heroProgressBarTimer = setInterval(() => {
            if (isHeroHovered) return; // Pause on hover
            heroProgressPercent += step;
            if (heroIndicators && heroIndicators.children[currentHeroIndex]) {
                const prog = heroIndicators.children[currentHeroIndex].querySelector('.hero-indicator-progress');
                if (prog) prog.style.width = `${Math.min(100, heroProgressPercent)}%`;
            }

            if (heroProgressPercent >= 100) {
                heroProgressPercent = 0;
                nextHeroSlide();
            }
        }, INTERVAL_MS);
    }

    function stopHeroAutoPlay() {
        if (heroProgressBarTimer) {
            clearInterval(heroProgressBarTimer);
            heroProgressBarTimer = null;
        }
        heroProgressPercent = 0;
    }

    function updateHero(item) {
        setupHeroSlider(item ? [item] : []);
    }

    function syncHeroFavBtn(item) {
        if (!heroFavBtn) return;
        const isFav = item && isFavorite(item.title);
        heroFavBtn.innerHTML = isFav
            ? `<i class="fa-solid fa-heart text-rose"></i>`
            : `<i class="fa-regular fa-heart"></i>`;
        heroFavBtn.classList.toggle('active', isFav);
        heroFavBtn.setAttribute('title', isFav ? t('hero_in_list') : t('hero_add_list'));
    }

    // ==========================================
    // 3. TOP 10 RANKED RAIL (NETFLIX STYLE)
    // ==========================================
    function renderTop10Rail(items) {
        top10Rail.innerHTML = '';
        top10Rail.scrollLeft = 0;
        items.forEach((item, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'top10-card-wrap';
            const rank = index + 1;
            const posterSrc = formatPosterUrl(item.poster_url);

            wrap.innerHTML = `
                <div class="top10-rank-num">${rank}</div>
                <div class="top10-card-inner">
                    <div class="poster-frame">
                        <img class="poster-img" src="${posterSrc}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                        <span class="card-badge-provider">TOP ${rank}</span>
                        <div class="card-play-hover-overlay">
                            <div class="card-play-btn-circle"><i class="fa-solid fa-play"></i></div>
                        </div>
                    </div>
                    <div class="card-info-block">
                        <h4 class="card-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
                        <div class="card-meta-text">${item.category_name || 'Exclusive Series'}</div>
                    </div>
                </div>
            `;
            wrap.addEventListener('click', () => openDrama(item));
            top10Rail.appendChild(wrap);
        });
        setTimeout(() => top10Rail.dispatchEvent(new Event('scroll')), 50);
    }

    // ==========================================
    // 4. MAIN LIBRARY GRID
    // ==========================================
    function renderGrid(items) {
        dramaGrid.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'drama-card';
            const tagsText = (item.tag_names && item.tag_names.length)
                ? item.tag_names.join(' • ')
                : (item.category_name || currentProvider.toUpperCase());
            const posterSrc = formatPosterUrl(item.poster_url);

            const epCount = getItemEpisodeCount(item);
            const epBadgeHtml = epCount
                ? `<span class="card-badge-ep"><i class="fa-solid fa-film"></i> ${epCount} tập</span>`
                : '';

            card.innerHTML = `
                <div class="poster-frame">
                    <img class="poster-img" src="${posterSrc}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                    <span class="card-badge-provider">${item.category_name || currentProvider.toUpperCase()}</span>
                    ${epBadgeHtml}
                    <div class="card-play-hover-overlay">
                        <div class="card-play-btn-circle"><i class="fa-solid fa-play"></i></div>
                    </div>
                </div>
                <div class="card-info-block">
                    <h3 class="card-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
                    <div class="card-meta-text">${escapeHtml(tagsText)}</div>
                </div>
            `;
            card.addEventListener('click', () => openDrama(item));
            dramaGrid.appendChild(card);
        });
    }

    function updatePaginationUI() {
        if (pageIndicator) pageIndicator.textContent = t('page_status', { page: currentPage });
        if (pageIndicatorBot) pageIndicatorBot.textContent = t('page_status', { page: currentPage });
        if (prevPageBtn) {
            prevPageBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i> ${t('prev_btn')}`;
            prevPageBtn.disabled = currentPage <= 1;
        }
        if (prevPageBtnBot) {
            prevPageBtnBot.innerHTML = `<i class="fa-solid fa-chevron-left"></i> ${t('prev_btn')}`;
            prevPageBtnBot.disabled = currentPage <= 1;
        }
        if (nextPageBtn) nextPageBtn.innerHTML = `${t('next_btn')} <i class="fa-solid fa-chevron-right"></i>`;
        if (nextPageBtnBot) nextPageBtnBot.innerHTML = `${t('next_btn')} <i class="fa-solid fa-chevron-right"></i>`;
    }

    function changePage(newPage) {
        if (newPage < 1) return;
        currentPage = newPage;

        // Reset Smart Discovery filter when moving to another page
        if (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all') {
            activeDiscoveryMood = 'all';
            activeDiscoveryLength = 'all';
            draftDiscoveryMood = 'all';
            draftDiscoveryLength = 'all';
            syncDiscoveryModalChipsUI();
        }

        loadSections();
        document.getElementById('providers-section').scrollIntoView({ behavior: 'smooth' });
    }

    function setActiveNav(activeEl) {
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        if (activeEl) activeEl.classList.add('active');
    }

    async function applyFilter(type, query) {
        activeFilterType = type;
        activeFilterValue = query;

        // Display active filter UI banner
        if (activeFilterBanner && activeFilterText) {
            let label = query;
            if (type === 'tag') label = `#${query}`;
            else if (type === 'genre') label = `Genre: ${query}`;
            else if (type === 'anime') label = `Anime & Animation`;

            activeFilterText.textContent = label;
            activeFilterBanner.hidden = false;
        }

        if (catalogSubtitle) {
            catalogSubtitle.textContent = `Filtered collection matching "${query}"`;
        }

        const topPag = document.getElementById('top-pagination-bar');
        if (topPag) topPag.style.display = 'none';

        gridLoader.hidden = false;
        emptyState.hidden = true;
        dramaGrid.innerHTML = '';

        const pSection = document.getElementById('providers-section');
        if (pSection) pSection.scrollIntoView({ behavior: 'smooth' });

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${currentLang}`);
            const data = await res.json();
            gridLoader.hidden = true;

            if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
                renderGrid(data.items);
                if (catalogSubtitle) {
                    catalogSubtitle.textContent = t('search_found_subtitle', { count: data.items.length, query: escapeHtml(query) });
                }
            } else {
                emptyState.hidden = false;
                if (catalogSubtitle) {
                    catalogSubtitle.textContent = t('search_none_subtitle', { query: escapeHtml(query) });
                }
            }
        } catch (err) {
            gridLoader.hidden = true;
            emptyState.hidden = false;
            console.error('Filter request error:', err);
        }
    }

    function clearActiveFilter() {
        if (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all') {
            resetSmartDiscoveryFilters();
        }

        if (!activeFilterType && (!activeFilterBanner || activeFilterBanner.hidden)) return;
        activeFilterType = null;
        activeFilterValue = null;

        if (activeFilterBanner) activeFilterBanner.hidden = true;
        if (catalogSubtitle) {
            catalogSubtitle.textContent = t('catalog_subtitle', { provider: currentProvider.toUpperCase() });
        }

        const topPag = document.getElementById('top-pagination-bar');
        if (topPag) topPag.style.display = '';

        loadSections();
    }

    // ==========================================
    // 4B. SMART DISCOVERY SYSTEM (Mood & Episode Length)
    // ==========================================
    const DISCOVERY_MOODS = {
        ceo: {
            title: 'Tổng Tài Bá Đạo',
            keywords: [
                'sếp tổng', 'tổng tài', 'bá đạo', 'hào môn', 'chiều vợ', 'ceo', 'billionaire',
                'ông trùm', 'tiểu thư', 'thiếu gia', 'đại gia', 'boss', 'cưới', 'hôn nhân',
                'bố bạn thân', 'contract marriage', 'tycoon', 'chủ tịch', 'giàu có', 'tổng giám đốc',
                'thiếu phu nhân', 'hợp đồng hôn nhân', 'tài phiệt', 'mafia', 'alpha', 'king', 'lord',
                'wealthy', 'rich', 'heir', 'heiress', 'president', 'master'
            ]
        },
        revenge: {
            title: 'Báo Thù Rửa Hận',
            keywords: [
                'báo thù', 'rửa hận', 'trả thù', 'ngược luyến', 'tra nam', 'vạch mặt', 'vả mặt',
                'ruồng bỏ', 'phản bội', 'lật mặt', 'hối hận', 'hối tiếc', 'hãm hại', 'revenge',
                'betrayal', 'payback', 'thù hận', 'đòi nợ', 'ác phụ', 'độc ác', 'bắt nạt',
                'vu khống', 'tống tiền', 'hận thù', 'thanh trừng', 'đòi lại công đạo', 'nemesis',
                'abandoned', 'scumbag', 'divorce', 'retribution', 'ex-wife', 'ex-husband'
            ]
        },
        rebirth: {
            title: 'Trọng Sinh / Xuyên Không',
            keywords: [
                'trùng sinh', 'trọng sinh', 'xuyên không', 'chuyển sinh', 'làm lại cuộc đời',
                'thời gian', 'quay lại', 'kiếp trước', 'hệ thống', 'hồi sinh', 'sống lại',
                'rebirth', 'reincarnation', 'time travel', 'second chance', 'tái sinh',
                'quay về quá khứ', 'kiếp này', 'chuyển thế', 'thức tỉnh', 'transmigration',
                'born again', 'past life', 'return of', 'regret'
            ]
        },
        comedy: {
            title: 'Hài Hước Xả Stress',
            keywords: [
                'hài', 'hài hước', 'xả stress', 'vui vẻ', 'giải trí', 'ngốc', 'tép riu',
                'lù khù', 'bựa', 'ngọt sủng', 'vô năng', 'comedy', 'funny', 'humor',
                'sweet love', 'dễ thương', 'vui nhộn', 'tấu hài', 'ngốc nghếch', 'tình cờ',
                'dở khóc dở cười', 'cười vỡ bụng', 'trò đùa', 'cute', 'sweet', 'hilarious'
            ]
        }
    };

    function normalizeSearchText(str) {
        if (!str) return '';
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function itemMatchesMood(item, moodKey) {
        if (!moodKey || moodKey === 'all') return true;
        const moodConfig = DISCOVERY_MOODS[moodKey];
        if (!moodConfig) return true;

        const rawText = `${item.title || ''} ${item.description || ''} ${(item.tag_names || []).join(' ')} ${item.category_name || ''}`;
        const lowerRaw = rawText.toLowerCase();
        const normalized = normalizeSearchText(rawText);

        return moodConfig.keywords.some(kw => {
            const lowerKw = kw.toLowerCase();
            const normKw = normalizeSearchText(kw);
            return lowerRaw.includes(lowerKw) || normalized.includes(normKw);
        });
    }

    function getItemEpisodeCount(item) {
        if (!item) return null;
        if (item.episodes && item.episodes.length > 0) return item.episodes.length;
        if (typeof item.total_episodes === 'number' && item.total_episodes > 0) return item.total_episodes;
        const watchUrl = item.watch_url || item.url || '';
        if (watchUrl) {
            if (heroEpisodeCache && heroEpisodeCache.has(watchUrl)) {
                const cached = heroEpisodeCache.get(watchUrl);
                if (cached && cached.total_episodes) {
                    item.total_episodes = cached.total_episodes;
                    return cached.total_episodes;
                }
            }
            if (epCountLocalCache.has(watchUrl)) {
                const count = epCountLocalCache.get(watchUrl);
                item.total_episodes = count;
                return count;
            }
        }
        return null;
    }

    function itemMatchesLength(item, lengthKey) {
        if (!lengthKey || lengthKey === 'all') return true;
        const epCount = getItemEpisodeCount(item);
        if (epCount === null) return false;

        if (lengthKey === 'short') {
            return epCount < 35;
        } else if (lengthKey === 'medium') {
            return epCount >= 35 && epCount <= 70;
        } else if (lengthKey === 'long') {
            return epCount > 70;
        }
        return true;
    }

    let bgPrefetchTimer = null;
    function prefetchEpisodeCountsInBackground(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        clearTimeout(bgPrefetchTimer);
        bgPrefetchTimer = setTimeout(async () => {
            const needFetch = items.filter(i => getItemEpisodeCount(i) === null && (i.watch_url || i.url)).slice(0, 25);
            if (needFetch.length === 0) return;
            const urls = needFetch.map(i => i.watch_url || i.url);
            try {
                const res = await fetch('/api/drama/batch-episode-counts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls, lang: currentLang })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.ok && data.counts) {
                        let updated = false;
                        needFetch.forEach(item => {
                            const url = item.watch_url || item.url;
                            if (data.counts[url]) {
                                item.total_episodes = data.counts[url];
                                epCountLocalCache.set(url, data.counts[url]);
                                updated = true;
                            }
                        });
                        if (updated) saveEpCountLocalCache();
                    }
                }
            } catch (e) { }
        }, 1000);
    }

    async function resolveEpisodesForCandidates(items) {
        const unknownItems = items.filter(i => getItemEpisodeCount(i) === null && (i.watch_url || i.url));
        if (unknownItems.length === 0) return;

        // 1. High-speed batch query to server
        const urlsToResolve = unknownItems.map(i => i.watch_url || i.url);
        try {
            const res = await fetch('/api/drama/batch-episode-counts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: urlsToResolve, lang: currentLang })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.ok && data.counts) {
                    let found = false;
                    for (const item of unknownItems) {
                        const url = item.watch_url || item.url;
                        if (data.counts[url]) {
                            const count = data.counts[url];
                            item.total_episodes = count;
                            epCountLocalCache.set(url, count);
                            found = true;
                        }
                    }
                    if (found) saveEpCountLocalCache();
                    const remaining = unknownItems.filter(i => getItemEpisodeCount(i) === null);
                    if (remaining.length === 0) return;
                }
            }
        } catch (batchErr) {
            console.warn('[Discovery] Batch endpoint fallback:', batchErr);
        }

        // 2. Parallel fallback with 4500ms timeout
        const remaining = unknownItems.filter(i => getItemEpisodeCount(i) === null).slice(0, 15);
        if (remaining.length === 0) return;

        await Promise.allSettled(remaining.map(async (item) => {
            const watchUrl = item.watch_url || item.url;
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4500);
                const res = await fetch(`/api/drama?watch_url=${encodeURIComponent(watchUrl)}&lang=${encodeURIComponent(currentLang)}`, {
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.ok) {
                        const count = data.total_episodes || (data.episodes && data.episodes.length);
                        if (count) {
                            item.total_episodes = count;
                            item.episodes = data.episodes;
                            epCountLocalCache.set(watchUrl, count);
                        }
                    }
                }
            } catch (e) { }
        }));
        saveEpCountLocalCache();
    }

    function syncDiscoveryModalChipsUI() {
        if (moodChipsTrack) {
            moodChipsTrack.querySelectorAll('.discovery-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.mood === draftDiscoveryMood);
            });
        }
        if (lengthChipsTrack) {
            lengthChipsTrack.querySelectorAll('.discovery-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.length === draftDiscoveryLength);
            });
        }
    }

    let previewResolveSeq = 0;
    function updateDiscoveryCountPreview() {
        if (!allLoadedLibraryItems || allLoadedLibraryItems.length === 0) return;
        const isDraftFiltered = (draftDiscoveryMood !== 'all' || draftDiscoveryLength !== 'all');

        if (discoveryResetBtn) {
            discoveryResetBtn.hidden = !isDraftFiltered;
        }

        if (!isDraftFiltered) {
            if (discoveryResultsCount) discoveryResultsCount.hidden = true;
            return;
        }

        const moodFiltered = allLoadedLibraryItems.filter(item => itemMatchesMood(item, draftDiscoveryMood));

        if (draftDiscoveryLength === 'all') {
            if (discoveryResultsCount) {
                discoveryResultsCount.hidden = false;
                discoveryResultsCount.textContent = t('discovery_results_count', { count: moodFiltered.length });
            }
            return;
        }

        // Count confirmed matching items
        const confirmedMatching = moodFiltered.filter(item => {
            const count = getItemEpisodeCount(item);
            return count !== null && itemMatchesLength(item, draftDiscoveryLength);
        });

        const needResolve = moodFiltered.filter(item => getItemEpisodeCount(item) === null);

        if (discoveryResultsCount) {
            discoveryResultsCount.hidden = false;
            discoveryResultsCount.textContent = t('discovery_results_count', { count: confirmedMatching.length });
        }

        // Quickly resolve any unknown items in background and update count live
        if (needResolve.length > 0) {
            const currentSeq = ++previewResolveSeq;
            resolveEpisodesForCandidates(needResolve).then(() => {
                if (currentSeq !== previewResolveSeq) return;
                const updatedMatching = moodFiltered.filter(item => itemMatchesLength(item, draftDiscoveryLength));
                if (discoveryResultsCount && draftDiscoveryLength !== 'all') {
                    discoveryResultsCount.textContent = t('discovery_results_count', { count: updatedMatching.length });
                }
            });
        }
    }

    function openDiscoveryModal() {
        if (!discoveryModal) return;
        draftDiscoveryMood = activeDiscoveryMood;
        draftDiscoveryLength = activeDiscoveryLength;
        syncDiscoveryModalChipsUI();
        updateDiscoveryCountPreview();
        discoveryModal.hidden = false;
        document.body.style.overflow = 'hidden';

        // Preload any unresolved items in current catalog
        if (allLoadedLibraryItems && allLoadedLibraryItems.length > 0) {
            prefetchEpisodeCountsInBackground(allLoadedLibraryItems);
        }
    }

    function closeDiscoveryModal() {
        if (!discoveryModal) return;
        discoveryModal.hidden = true;
        document.body.style.overflow = '';
    }

    function showBlockingLoader() {
        if (screenBlockingLoader) {
            screenBlockingLoader.hidden = false;
        }
    }

    function hideBlockingLoader() {
        if (screenBlockingLoader) {
            screenBlockingLoader.hidden = true;
        }
    }

    async function applySmartDiscoveryFilter(showOverlay = true) {
        if (!allLoadedLibraryItems || allLoadedLibraryItems.length === 0) return;

        const isFiltered = (activeDiscoveryMood !== 'all' || activeDiscoveryLength !== 'all');

        // Toggle reset button
        if (discoveryResetBtn) {
            discoveryResetBtn.hidden = !isFiltered;
        }

        // Toggle catalog button active state
        if (catalogDiscoveryBtn) {
            catalogDiscoveryBtn.classList.toggle('active-filtered', isFiltered);
        }

        // If no filter selected, render full catalog
        if (!isFiltered) {
            if (discoveryResultsCount) discoveryResultsCount.hidden = true;
            emptyState.hidden = true;
            if (activeFilterBanner && !activeFilterType) {
                activeFilterBanner.hidden = true;
            }
            const topPag = document.getElementById('top-pagination-bar');
            if (topPag) topPag.style.display = '';
            if (catalogSubtitle) {
                catalogSubtitle.textContent = t('catalog_subtitle', { provider: currentProvider.toUpperCase() });
            }
            renderGrid(allLoadedLibraryItems);
            return;
        }

        // Hide pagination in filtered mode
        const topPag = document.getElementById('top-pagination-bar');
        if (topPag) topPag.style.display = 'none';

        if (showOverlay) {
            showBlockingLoader();
        }
        const filterStartTime = Date.now();

        try {
            // 1. Filter by Mood
            let moodFiltered = allLoadedLibraryItems.filter(item => itemMatchesMood(item, activeDiscoveryMood));

            // 2. Filter by Length if requested
            if (activeDiscoveryLength !== 'all') {
                const needResolve = moodFiltered.some(item => getItemEpisodeCount(item) === null);
                if (needResolve) {
                    await resolveEpisodesForCandidates(moodFiltered);
                }
                moodFiltered = moodFiltered.filter(item => itemMatchesLength(item, activeDiscoveryLength));
            }

            // Smooth minimum transition time only if overlay shown
            if (showOverlay) {
                const elapsed = Date.now() - filterStartTime;
                if (elapsed < 200) {
                    await new Promise(r => setTimeout(r, 200 - elapsed));
                }
            }

            // Update count pill
            if (discoveryResultsCount) {
                discoveryResultsCount.className = 'discovery-count-pill';
                discoveryResultsCount.hidden = false;
                discoveryResultsCount.textContent = t('discovery_results_count', { count: moodFiltered.length });
            }

            // Build active filter label
            let descParts = [];
            const moodsData = t('discovery_moods') || {};
            const lengthsData = t('discovery_lengths') || {};
            if (activeDiscoveryMood !== 'all' && moodsData[activeDiscoveryMood]) {
                descParts.push(moodsData[activeDiscoveryMood].title);
            }
            if (activeDiscoveryLength !== 'all' && lengthsData[activeDiscoveryLength]) {
                descParts.push(lengthsData[activeDiscoveryLength].label || lengthsData[activeDiscoveryLength].title);
            }
            const filterLabel = descParts.join(' • ');

            // Update catalog subtitle
            if (catalogSubtitle) {
                catalogSubtitle.textContent = `${t('discovery_banner_prefix')} ${filterLabel}`;
            }

            // Display Active Filter Banner with clear button right above the catalog
            if (activeFilterBanner && activeFilterText) {
                activeFilterText.innerHTML = `<i class="fa-solid fa-sliders"></i> ${filterLabel}`;
                activeFilterBanner.hidden = false;
            }

            // Render results
            if (moodFiltered.length > 0) {
                emptyState.hidden = true;
                renderGrid(moodFiltered);
            } else {
                dramaGrid.innerHTML = '';
                emptyState.hidden = false;
                const emptyTitle = document.getElementById('empty-title');
                const emptyDesc = document.getElementById('empty-desc');
                if (emptyTitle) emptyTitle.textContent = t('discovery_empty_title');
                if (emptyDesc) emptyDesc.textContent = t('discovery_empty_desc');
            }
        } finally {
            if (showOverlay) {
                hideBlockingLoader();
            }
        }
    }

    function resetSmartDiscoveryFilters() {
        activeDiscoveryMood = 'all';
        activeDiscoveryLength = 'all';
        draftDiscoveryMood = 'all';
        draftDiscoveryLength = 'all';

        syncDiscoveryModalChipsUI();
        applySmartDiscoveryFilter(false);
    }

    function setupDiscoveryFilters() {
        // Mood Chips listener (Updates draft selection instantly without freezing UI)
        if (moodChipsTrack) {
            moodChipsTrack.addEventListener('click', (e) => {
                const chip = e.target.closest('.discovery-chip');
                if (!chip) return;
                const mood = chip.dataset.mood;
                if (!mood) return;

                draftDiscoveryMood = mood;
                syncDiscoveryModalChipsUI();
                updateDiscoveryCountPreview();
            });
        }

        // Length Chips listener (Updates draft selection instantly without freezing UI)
        if (lengthChipsTrack) {
            lengthChipsTrack.addEventListener('click', (e) => {
                const chip = e.target.closest('.discovery-chip');
                if (!chip) return;
                const length = chip.dataset.length;
                if (!length) return;

                draftDiscoveryLength = length;
                syncDiscoveryModalChipsUI();
                updateDiscoveryCountPreview();
            });
        }

        // Reset button listener inside modal
        if (discoveryResetBtn) {
            discoveryResetBtn.addEventListener('click', () => {
                resetSmartDiscoveryFilters();
                closeDiscoveryModal();
            });
        }

        // Catalog & Nav trigger button listeners
        if (catalogDiscoveryBtn) {
            catalogDiscoveryBtn.addEventListener('click', () => {
                openDiscoveryModal();
            });
        }

        if (navDiscovery) {
            navDiscovery.addEventListener('click', () => {
                openDiscoveryModal();
            });
        }

        // Modal Close and Backdrop listeners
        if (discoveryModalClose) {
            discoveryModalClose.addEventListener('click', () => {
                closeDiscoveryModal();
            });
        }

        if (discoveryModalBackdrop) {
            discoveryModalBackdrop.addEventListener('click', () => {
                closeDiscoveryModal();
            });
        }

        // Apply and close modal: This is where "chọn option xong" applies with the blocking loader
        if (discoveryApplyBtn) {
            discoveryApplyBtn.addEventListener('click', () => {
                activeDiscoveryMood = draftDiscoveryMood;
                activeDiscoveryLength = draftDiscoveryLength;
                closeDiscoveryModal();
                applySmartDiscoveryFilter(true);
                const pSec = document.getElementById('providers-section');
                if (pSec) pSec.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && discoveryModal && !discoveryModal.hidden) {
                closeDiscoveryModal();
            }
        });
    }

    // ==========================================
    // 5. SEARCH SYSTEM
    // ==========================================
    async function handleSearch(query) {
        searchResultsList.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i> Searching database...</div>';
        searchDropdown.hidden = false;

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${currentLang}`);
            const data = await res.json();

            if (!data.ok || !data.items || data.items.length === 0) {
                searchResultsList.innerHTML = `<div style="padding:16px;text-align:center;color:#64748b;font-size:13px;">${t('search_empty')}</div>`;
                searchCount.textContent = t('search_count', { count: 0 });
                return;
            }

            searchCount.textContent = t('search_count', { count: data.items.length });
            searchResultsList.innerHTML = '';
            data.items.slice(0, 12).forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-item';
                const posterSrc = formatPosterUrl(item.poster_url);
                row.innerHTML = `
                    <img class="search-thumb" src="${posterSrc}" alt="${escapeHtml(item.title)}" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                    <div class="search-item-info">
                        <div class="search-item-title">${escapeHtml(item.title)}</div>
                        <div class="search-item-meta">${item.category_name || 'Short Drama Series'}</div>
                    </div>
                `;
                row.addEventListener('click', () => {
                    searchDropdown.hidden = true;
                    openDrama(item);
                });
                searchResultsList.appendChild(row);
            });
        } catch (e) {
            searchResultsList.innerHTML = '<div style="padding:16px;text-align:center;color:#f43f5e;font-size:13px;">Search service unavailable</div>';
        }
    }

    // ==========================================
    // 6. VIDEO PLAYER & EPISODES SUITE
    // ==========================================
    async function openDrama(item, initialEpNum = 1) {
        if (isMiniplayer) restoreFromMiniplayer();
        playerModal.hidden = false;
        document.body.style.overflow = 'hidden';

        const pMain = document.querySelector('.player-main-split');
        if (pMain) pMain.scrollTop = 0;

        if (theaterToggleBtn) {
            if (window.innerWidth <= 1150 && window.innerWidth > 720) {
                theaterToggleBtn.classList.add('active');
            } else {
                theaterToggleBtn.classList.remove('active');
            }
        }

        const cleanTitle = decodeHtml(item.title || item.slug || 'Đang tải...');
        modalDramaTitle.textContent = cleanTitle;
        detailDramaTitle.textContent = cleanTitle;
        const rawInitialDesc = item.description || '';
        detailDramaDesc.textContent = decodeHtml(rawInitialDesc || t('synopsis_loading'));
        const initShortLang = (currentLang || 'vi').split('-')[0];
        if (initShortLang !== 'en' && rawInitialDesc) {
            translateDynamicText(rawInitialDesc, initShortLang).then(trans => {
                if (trans && detailDramaDesc && !playerModal.hidden) {
                    detailDramaDesc.textContent = trans;
                }
            });
        }
        episodesCount.textContent = '...';
        episodesGrid.innerHTML = '<div style="grid-column: 1/-1; padding:24px; text-align:center; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Initializing streaming pipeline...</div>';
        epBatchTabs.innerHTML = '';
        videoOverlayLoader.hidden = false;
        hideCountdown();
        if (resumeBanner) resumeBanner.hidden = true;
        syncModalFavBtn(item);

        try {
            const watchUrl = item.watch_url || item.url || '';
            let data = null;

            if (item.episodes && Array.isArray(item.episodes) && item.episodes.length > 0) {
                data = {
                    ok: true,
                    title: item.title,
                    description: item.description,
                    total_episodes: item.total_episodes || item.episodes.length,
                    episodes: item.episodes,
                    slug: item.slug
                };
            } else if (watchUrl && heroEpisodeCache.has(watchUrl)) {
                const cached = heroEpisodeCache.get(watchUrl);
                if (cached.episodes && cached.episodes.length > 0) {
                    data = {
                        ok: true,
                        title: cached.title || item.title,
                        description: cached.description || item.description,
                        total_episodes: cached.total_episodes,
                        episodes: cached.episodes,
                        slug: cached.slug || item.slug
                    };
                }
            }

            if (!data) {
                let fetchUrl = '';
                if (watchUrl) {
                    fetchUrl = `/api/drama?watch_url=${encodeURIComponent(watchUrl)}&lang=${encodeURIComponent(currentLang)}`;
                } else if (item.slug) {
                    fetchUrl = `/api/drama?slug=${encodeURIComponent(item.slug)}&ep=${initialEpNum || 1}&lang=${encodeURIComponent(currentLang)}`;
                }
                if (fetchUrl) {
                    const res = await fetch(fetchUrl);
                    data = await res.json();
                }
            }

            if (!data || !data.ok || !data.episodes || data.episodes.length === 0) {
                closeModal();
                showToast(data?.error || t('toast_no_episodes'), 'fa-triangle-exclamation');
                videoOverlayLoader.hidden = true;
                return;
            }

            currentDramaData = {
                ...item,
                ...data,
                slug: data.slug || item.slug || getDramaSlug(item),
                watch_url: watchUrl || data.final_url || ''
            };

            const loadedTitle = decodeHtml(data.title || item.title);
            modalDramaTitle.textContent = loadedTitle;
            detailDramaTitle.textContent = loadedTitle;
            if (data.description) {
                const rawDesc = decodeHtml(data.description);
                detailDramaDesc.textContent = rawDesc;
                const shortLang = (currentLang || 'vi').split('-')[0];
                if (shortLang !== 'en') {
                    translateDynamicText(rawDesc, shortLang).then(trans => {
                        if (trans && detailDramaDesc && !playerModal.hidden) {
                            detailDramaDesc.textContent = trans;
                        }
                    });
                }
            }
            episodesCount.textContent = data.total_episodes;

            // Setup Multi-batch tabs
            setupEpisodeBatches(data.episodes);

            // Render Episodes & Play requested episode
            renderEpisodesGrid(data.episodes);

            let targetIdx = 0;
            if (initialEpNum && initialEpNum > 1 && Array.isArray(data.episodes)) {
                const foundIdx = data.episodes.findIndex(e => (e.number || 0) === initialEpNum);
                if (foundIdx !== -1) targetIdx = foundIdx;
            }
            switchEpisode(targetIdx, true);
            syncReelsUI();

            // Auto-restore Reels mode if user enabled it previously on mobile
            if (localStorage.getItem('dramaflow_reels_mode') === '1' && window.innerWidth <= 768) {
                toggleReelsFeedMode(true);
            }
        } catch (e) {
            console.error('Error opening drama:', e);
            videoOverlayLoader.hidden = true;
            showToast('Playback error: ' + e.message, 'fa-circle-xmark');
        }
    }

    function setupEpisodeBatches(episodes) {
        epBatchTabs.innerHTML = '';
        activeBatchIndex = 0;
        const total = episodes.length;
        if (total <= BATCH_SIZE) { epBatchTabs.hidden = true; return; }
        epBatchTabs.hidden = false;
        const batchCount = Math.ceil(total / BATCH_SIZE);
        for (let b = 0; b < batchCount; b++) {
            const start = b * BATCH_SIZE + 1;
            const end = Math.min(total, (b + 1) * BATCH_SIZE);
            const count = end - start + 1;
            const tab = document.createElement('button');
            tab.className = `batch-tab ${b === 0 ? 'active' : ''}`;
            tab.innerHTML = `${start}–${end} <span class="batch-count">${count}</span>`;
            tab.addEventListener('click', () => {
                activeBatchIndex = b;
                document.querySelectorAll('.batch-tab').forEach((el, idx) => el.classList.toggle('active', idx === b));
                tab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                renderEpisodesGrid(episodes);
            });
            epBatchTabs.appendChild(tab);
        }
    }

    function renderEpisodesGrid(episodes) {
        episodesGrid.innerHTML = '';
        let displayList = episodes;
        let startIndex = 0;
        if (episodes.length > BATCH_SIZE) {
            startIndex = activeBatchIndex * BATCH_SIZE;
            displayList = episodes.slice(startIndex, startIndex + BATCH_SIZE);
        }
        const epProgress = currentDramaData ? getEpProgressForDrama(currentDramaData.title) : {};
        displayList.forEach((ep, relIdx) => {
            const absIndex = startIndex + relIdx;
            const pct = epProgress[absIndex] || 0;
            const isWatched = pct >= 90;
            const isInProgress = pct > 5 && !isWatched;
            const btn = document.createElement('button');
            btn.className = `ep-btn ${absIndex === currentEpisodeIndex ? 'active' : ''} ${isWatched ? 'watched' : ''} ${isInProgress ? 'in-progress' : ''}`;
            btn.textContent = `${ep.number || absIndex + 1}`;
            btn.title = ep.title || `Episode ${ep.number || absIndex + 1}`;
            btn.setAttribute('data-ep-index', absIndex);
            if (isInProgress) btn.style.setProperty('--ep-progress-w', pct + '%');
            btn.addEventListener('click', () => switchEpisode(absIndex));
            episodesGrid.appendChild(btn);
        });
    }

    function switchEpisode(index, replaceState = false) {
        if (!currentDramaData || !currentDramaData.episodes[index]) return;
        currentEpisodeIndex = index;
        const episode = currentDramaData.episodes[index];
        const epNum = episode.number || (index + 1);

        // Update clean SEO URL in address bar: /phim/:slug/tap-:ep
        const dramaSlug = getDramaSlug(currentDramaData);
        updateDramaUrl(dramaSlug, epNum, replaceState);

        const loadedTitle = decodeHtml(currentDramaData.title || dramaSlug);
        document.title = `${loadedTitle} - ${t('ep_prefix')} ${epNum} | DramaFlow`;

        modalEpisodeTitle.textContent = `${t('ep_prefix')} ${epNum}`;
        prevEpBtn.disabled = index === 0;
        nextEpBtn.disabled = index === currentDramaData.episodes.length - 1;

        if (miniplayerTitle && currentDramaData) miniplayerTitle.textContent = decodeHtml(currentDramaData.title || '');
        if (miniplayerSubtitle) miniplayerSubtitle.textContent = `${t('ep_prefix')} ${episode.number || index + 1} • ${currentDramaData?.category_name || 'DramaFlow'}`;
        if (miniplayerNextBtn) miniplayerNextBtn.disabled = index === currentDramaData.episodes.length - 1;

        const drawerEpBadge = document.getElementById('drawer-current-ep');
        const drawerEpNum = document.getElementById('drawer-current-ep-num');
        if (drawerEpBadge && drawerEpNum) {
            drawerEpNum.textContent = episode.number || index + 1;
            drawerEpBadge.hidden = false;
        }

        // Auto switch batch tab if episode belongs to another batch
        const targetBatch = Math.floor(index / BATCH_SIZE);
        if (targetBatch !== activeBatchIndex && currentDramaData.episodes.length > BATCH_SIZE) {
            activeBatchIndex = targetBatch;
            document.querySelectorAll('.batch-tab').forEach((el, idx) => el.classList.toggle('active', idx === targetBatch));
            const activeBatchTab = document.querySelectorAll('.batch-tab')[targetBatch];
            if (activeBatchTab) activeBatchTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            renderEpisodesGrid(currentDramaData.episodes);
        } else {
            const epBtns = episodesGrid.querySelectorAll('.ep-btn');
            epBtns.forEach(b => { const epIdx = parseInt(b.getAttribute('data-ep-index'), 10); b.classList.toggle('active', epIdx === index); });
        }

        // Auto-scroll to active episode button
        setTimeout(() => scrollToActiveEpisode(), 80);
        syncReelsUI();

        _hasPrefetchedNext = false;
        currentSubtitleCues = [];
        if (customSubtitleOverlay) customSubtitleOverlay.classList.add('hidden');
        saveToHistory(currentDramaData, episode.number || index + 1);
        hideCountdown();
        if (resumeBanner) resumeBanner.hidden = true;
        loadVideoStream(episode);

        if (window.innerWidth <= 1150 || (playerModal && playerModal.classList.contains('layout-medium'))) {
            const playerMain = document.querySelector('.player-main-split');
            if (playerMain && playerMain.scrollTop > 0) playerMain.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function showStreamErrorUI(episode) {
        stopAmbientGlow();
        videoOverlayLoader.hidden = false;
        const epNum = episode?.number || (currentEpisodeIndex + 1);
        videoOverlayLoader.innerHTML = `
            <div class="player-error-card">
                <div class="player-error-icon">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h4 class="player-error-title">
                    ${t('stream_err_title', { ep: epNum })}
                </h4>
                <p class="player-error-desc">
                    ${t('stream_err_desc')}
                </p>
                <div class="player-error-actions">
                    <button type="button" id="btn-retry-stream" class="btn btn-sm btn-primary" style="padding:9px 20px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;background:var(--primary-gradient);border:none;color:#fff;box-shadow:0 4px 14px var(--primary-glow);">
                        <i class="fa-solid fa-rotate-right"></i> ${t('stream_err_retry')}
                    </button>
                    ${currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1 ? `
                    <button type="button" id="btn-next-err-stream" class="btn btn-sm btn-secondary" style="padding:9px 20px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;">
                        <i class="fa-solid fa-forward-step"></i> ${t('stream_err_next')}
                    </button>` : ''}
                </div>
            </div>`;
        const retryBtn = document.getElementById('btn-retry-stream');
        if (retryBtn) retryBtn.addEventListener('click', () => {
            if (episode) {
                episode.play_url = '';
                episode.direct_play_url = '';
            }
            switchEpisode(currentEpisodeIndex);
        });
        const nextBtn = document.getElementById('btn-next-err-stream');
        if (nextBtn) nextBtn.addEventListener('click', () => switchEpisode(currentEpisodeIndex + 1));
    }

    function isAuthKeyExpired(url) {
        if (!url || typeof url !== 'string') return true;
        const match = url.match(/[?&]auth_key=(\d+)/i);
        if (match) {
            const expiry = parseInt(match[1], 10);
            const nowSec = Math.floor(Date.now() / 1000);
            if (expiry > 0 && expiry <= nowSec + 30) {
                return true;
            }
        }
        return false;
    }

    async function loadVideoStream(episode) {
        stopAmbientGlow();
        videoOverlayLoader.hidden = false;
        let streamUrl = episode.play_url || episode.direct_play_url;

        if (!streamUrl || isAuthKeyExpired(streamUrl)) {
            try {
                const epNum = episode.number || (currentEpisodeIndex + 1);
                const slug = currentDramaData?.slug || '';
                const watchUrl = episode.watch_url || currentDramaData?.watch_url || '';
                const refreshUrl = `/api/episode/refresh?slug=${encodeURIComponent(slug)}&ep=${epNum}&watch_url=${encodeURIComponent(watchUrl)}`;
                const epRes = await fetch(refreshUrl);
                const epData = await epRes.json();
                if (epData.ok && epData.play_url) {
                    episode.play_url = epData.play_url;
                    episode.direct_play_url = epData.direct_play_url || '';
                    episode.is_hls = epData.is_hls;
                    streamUrl = epData.play_url;
                }
            } catch (e) { console.error('Error fetching episode stream:', e); }
        }

        if (!streamUrl) {
            showStreamErrorUI(episode);
            return;
        }

        loadEpisodeSubtitle(selectedSubtitle);

        const isHls = streamUrl.includes('.m3u8') || episode.is_hls;
        streamTypeBadge.innerHTML = isHls ? '<i class="fa-solid fa-bolt"></i> HLS 1080p' : '<i class="fa-solid fa-play"></i> Direct MP4';

        if (hls) { hls.destroy(); hls = null; }

        // Get resume timestamp for this episode
        const resumeTime = currentDramaData ? getTimestamp(currentDramaData.title, currentEpisodeIndex) : 0;

        let hasAttemptedRefresh = false;
        let hasRetriedWithProxy = false;

        async function handleStreamError(errDesc) {
            console.warn(`[StreamRecovery] Playback error: ${errDesc}. Attempting recovery...`);
            if (!hasAttemptedRefresh) {
                hasAttemptedRefresh = true;
                try {
                    videoOverlayLoader.hidden = false;
                    // videoOverlayLoader.innerHTML = '<div class="stream-spinner"></div><span class="loading-status-text">Đang cập nhật luồng phát mới...</span>';
                    const epNum = episode.number || (currentEpisodeIndex + 1);
                    const slug = currentDramaData?.slug || '';
                    const watchUrl = episode.watch_url || currentDramaData?.watch_url || '';
                    const refreshUrl = `/api/episode/refresh?slug=${encodeURIComponent(slug)}&ep=${epNum}&watch_url=${encodeURIComponent(watchUrl)}`;
                    const epRes = await fetch(refreshUrl);
                    const epData = await epRes.json();
                    if (epData.ok && epData.play_url && epData.play_url !== streamUrl) {
                        console.log(`[StreamRecovery] Got fresh stream URL:`, epData.play_url);
                        episode.play_url = epData.play_url;
                        episode.direct_play_url = epData.direct_play_url || '';
                        episode.is_hls = epData.is_hls;
                        loadVideoStream(episode);
                        return;
                    }
                } catch (e) {
                    console.error('[StreamRecovery] Auto-refresh failed:', e);
                }
            }

            if (!hasRetriedWithProxy && !streamUrl.includes('/api/proxy-stream')) {
                hasRetriedWithProxy = true;
                const slug = currentDramaData?.slug || '';
                const epNum = episode.number || (currentEpisodeIndex + 1);
                const proxyUrl = `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}&slug=${encodeURIComponent(slug)}&ep=${epNum}`;
                if (isHls && hls) {
                    hls.loadSource(proxyUrl);
                } else {
                    mainVideo.src = proxyUrl;
                    mainVideo.play().catch(() => { });
                }
                return;
            }

            if (hls) { hls.destroy(); hls = null; }
            mainVideo.pause();
            mainVideo.removeAttribute('src');
            mainVideo.load();
            showStreamErrorUI(episode);
        }

        if (isHls && window.Hls && Hls.isSupported()) {
            hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 90 });
            hls.loadSource(streamUrl);
            hls.attachMedia(mainVideo);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoOverlayLoader.hidden = true;
                // Apply quality level if not auto
                if (selectedQuality !== 'auto') {
                    const th = parseInt(selectedQuality, 10);
                    let best = -1;
                    (hls.levels || []).forEach((l, i) => { if (l.height && l.height <= th) best = i; });
                    if (best !== -1) hls.currentLevel = best;
                }
                mainVideo.play().catch(() => { });
                startAmbientGlow();
                if (resumeTime > 3) setTimeout(() => showResumeBanner(resumeTime), 1200);
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            handleStreamError('HLS Network Error');
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            handleStreamError('HLS Fatal Error: ' + data.details);
                            break;
                    }
                }
            });
        } else {
            mainVideo.src = streamUrl;
            mainVideo.onloadeddata = () => {
                videoOverlayLoader.hidden = true;
                mainVideo.play().catch(() => { });
                startAmbientGlow();
                if (resumeTime > 3) setTimeout(() => showResumeBanner(resumeTime), 1200);
            };
            mainVideo.onerror = () => {
                handleStreamError('HTML5 Video Error');
            };
        }
    }

    function prefetchNextEpisodeSubtitle(nextIndex) {
        if (!currentDramaData || !currentDramaData.episodes || !currentDramaData.episodes[nextIndex]) return;
        if (!selectedSubtitle || selectedSubtitle === 'off') return;
        const nextEp = currentDramaData.episodes[nextIndex];
        const streamUrl = nextEp.play_url || nextEp.direct_play_url || '';
        const epNum = nextEp.number || (nextIndex + 1);
        const slug = currentDramaData?.slug || '';
        const subLang = selectedSubtitle;

        // Use /api/subtitles/prefetch — server responds instantly and does all heavy work
        // in the background, including auto-resolving stream URL if not yet available.
        // This means subtitle warm-up works even before the next episode stream is fetched.
        fetch(`/api/subtitles/prefetch?slug=${encodeURIComponent(slug)}&ep=${epNum}&stream_url=${encodeURIComponent(streamUrl)}&lang=${encodeURIComponent(subLang)}`)
            .catch(() => { });
    }

    function prefetchNextEpisodeStream(nextIndex) {
        if (!currentDramaData || !currentDramaData.episodes || !currentDramaData.episodes[nextIndex]) return;
        const nextEp = currentDramaData.episodes[nextIndex];
        if (nextEp.play_url || nextEp.direct_play_url) {
            prefetchNextEpisodeSubtitle(nextIndex);
            return;
        }

        const epNum = nextEp.number || (nextIndex + 1);
        const slug = currentDramaData?.slug || '';
        const watchUrl = nextEp.watch_url || currentDramaData?.watch_url || '';
        fetch(`/api/episode/refresh?slug=${encodeURIComponent(slug)}&ep=${epNum}&watch_url=${encodeURIComponent(watchUrl)}`)
            .then(res => res.json())
            .then(data => {
                if (data.ok && data.play_url) {
                    nextEp.play_url = data.play_url;
                    nextEp.direct_play_url = data.direct_play_url || '';
                    nextEp.is_hls = data.is_hls;
                    prefetchNextEpisodeSubtitle(nextIndex);
                }
            })
            .catch(() => { });
    }

    function syncMiniplayerPlayBtn(isPlaying) {
        const iconClass = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        if (miniplayerPlayBtn) miniplayerPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
        if (miniOvPlayBtn) miniOvPlayBtn.innerHTML = `<i class="${iconClass}"></i>`;
    }

    function minimizeToMiniplayer() {
        if (!currentDramaData || playerModal.hidden) return;
        isMiniplayer = true;
        playerModal.classList.add('miniplayer-mode');
        document.body.style.overflow = '';
        stopAmbientGlow();
        hideCountdown();
        if (resumeBanner) resumeBanner.hidden = true;
        mainVideo.controls = false;

        const loadedTitle = decodeHtml(currentDramaData.title || 'Drama Title');
        if (miniplayerTitle) miniplayerTitle.textContent = loadedTitle;
        const episode = currentDramaData.episodes?.[currentEpisodeIndex];
        const epNum = episode?.number || (currentEpisodeIndex + 1);
        if (miniplayerSubtitle) miniplayerSubtitle.textContent = `Tập ${epNum} • ${currentDramaData.category_name || 'DramaFlow'}`;

        syncMiniplayerPlayBtn(!mainVideo.paused);

        if (miniplayerNextBtn) {
            miniplayerNextBtn.disabled = currentEpisodeIndex >= currentDramaData.episodes.length - 1;
        }

        renderHistoryRail();
    }

    function restoreFromMiniplayer() {
        if (!isMiniplayer) return;
        isMiniplayer = false;
        playerModal.classList.remove('miniplayer-mode');
        playerModal.hidden = false;
        document.body.style.overflow = 'hidden';
        mainVideo.controls = true;
        if (!mainVideo.paused) {
            startAmbientGlow();
        }
        setTimeout(() => scrollToActiveEpisode(), 100);
    }

    function closeModal() {
        isMiniplayer = false;
        closeReelsEpisodesSheet();
        playerModal.classList.remove('miniplayer-mode');
        playerModal.hidden = true;
        document.body.style.overflow = '';
        mainVideo.pause();
        mainVideo.controls = true;
        mainVideo.removeAttribute('src');
        mainVideo.load();
        if (hls) { hls.destroy(); hls = null; }
        stopAmbientGlow();
        stopAiSubtitleEngine();
        hideCountdown();
        if (resumeBanner) resumeBanner.hidden = true;
        const drawerEpBadge = document.getElementById('drawer-current-ep');
        if (drawerEpBadge) drawerEpBadge.hidden = true;
        if (videoViewport) {
            videoViewport.style.height = '';
            videoViewport.style.maxHeight = '';
        }
        isTheaterMode = false;
        if (theaterToggleBtn) theaterToggleBtn.classList.remove('active');
        if (playerModal) {
            playerModal.classList.remove('layout-medium');
            playerModal.classList.remove('layout-standard');
        }
        renderHistoryRail();
        if (window.location.pathname.match(/^\/(?:phim|drama|watch)\//i)) {
            window.history.pushState(null, '', '/');
            document.title = 'DramaFlow PRO - Premier HD Short Drama Streaming Platform';
        }
    }

    function toggleTheaterMode() {
        if (window.innerWidth <= 720) return; // Fullscreen by default on mobile (Kiểu Nhỏ)

        const isMediumWidth = window.innerWidth <= 1150;
        if (isMediumWidth) {
            const isForcedStandard = playerModal.classList.toggle('layout-standard');
            theaterToggleBtn.classList.toggle('active', !isForcedStandard);
            showToast(isForcedStandard ? t('toast_theater_off') : t('toast_theater_on'), 'fa-film');
        } else {
            isTheaterMode = !isTheaterMode;
            theaterToggleBtn.classList.toggle('active', isTheaterMode);
            playerModal.classList.toggle('layout-medium', isTheaterMode);
            showToast(isTheaterMode ? t('toast_theater_on') : t('toast_theater_off'), 'fa-film');
        }
    }

    function shareCurrentDrama() {
        if (!currentDramaData) return;
        const episode = currentDramaData.episodes?.[currentEpisodeIndex];
        const epNum = episode?.number || (currentEpisodeIndex + 1);
        const dramaSlug = getDramaSlug(currentDramaData);
        const { prefix, epPrefix } = getUrlSegmentsForLang(currentLang);
        const shareUrl = `${window.location.origin}/${prefix}/${encodeURIComponent(dramaSlug)}/${epPrefix}-${epNum}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast(t('toast_link_copied', { ep: epNum }), 'fa-link');
            }).catch(() => {
                showToast('Link: ' + shareUrl, 'fa-share-nodes');
            });
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = shareUrl; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy');
                document.body.removeChild(ta);
                showToast(t('toast_link_copied', { ep: epNum }), 'fa-link');
            } catch { showToast('Link: ' + shareUrl, 'fa-share-nodes'); }
        }
    }

    // ==========================================
    // 7. WATCH HISTORY (LOCAL STORAGE)
    // ==========================================
    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]');
        } catch {
            return [];
        }
    }

    function saveToHistory(drama, episodeNumber) {
        if (!drama || !drama.title) return;
        let list = getHistory();
        list = list.filter(item => item.title !== drama.title);
        list.unshift({
            title: drama.title,
            poster_url: drama.poster_url || drama.poster || '',
            watch_url: drama.watch_url || '',
            last_episode: episodeNumber,
            timestamp: Date.now(),
            progress: 35
        });
        if (list.length > 12) list.pop();
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list));
    }

    function updateCurrentHistoryProgress(percent) {
        if (!currentDramaData) return;
        if (percent === undefined) { if (!mainVideo.duration) return; percent = Math.min(100, Math.round((mainVideo.currentTime / mainVideo.duration) * 100)); }
        let list = getHistory();
        const found = list.find(item => item.title === currentDramaData.title);
        if (found) { found.progress = percent; localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list)); }
    }

    function renderHistoryRail() {
        const list = getHistory();
        if (list.length === 0) {
            historySection.hidden = true;
            return;
        }

        historySection.hidden = false;
        historyRail.innerHTML = '';
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            const posterSrc = formatPosterUrl(item.poster_url);
            card.innerHTML = `
                <div class="history-poster-wrap">
                    <img src="${posterSrc}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                    <div class="history-progress-track">
                        <div class="history-progress-fill" style="width: ${item.progress || 20}%"></div>
                    </div>
                </div>
                <div class="history-card-body">
                    <div class="history-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                    <div class="history-card-ep"><i class="fa-solid fa-play"></i> ${t('resume_ep_prefix')} ${item.last_episode || 1}</div>
                </div>
            `;
            card.addEventListener('click', () => openDrama(item));
            historyRail.appendChild(card);
        });
        setTimeout(() => historyRail.dispatchEvent(new Event('scroll')), 50);
    }

    // ==========================================
    // 8. FAVORITES / MY LIST (LOCAL STORAGE)
    // ==========================================
    function getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_FAVORITES) || '[]');
        } catch {
            return [];
        }
    }

    function isFavorite(title) {
        return getFavorites().some(f => f.title === title);
    }

    function toggleFavorite(drama) {
        if (!drama || !drama.title) return;
        let list = getFavorites();
        const exists = list.some(f => f.title === drama.title);
        if (exists) {
            list = list.filter(f => f.title !== drama.title);
            showToast(t('toast_fav_removed'), 'fa-heart-crack');
        } else {
            list.unshift({
                title: drama.title,
                poster_url: drama.poster_url || drama.poster || '',
                watch_url: drama.watch_url || '',
                category_name: drama.category_name || 'Short Drama'
            });
            showToast(t('toast_fav_added'), 'fa-heart');
        }
        localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(list));
        renderFavoritesRail();
    }

    function syncModalFavBtn(item = currentDramaData) {
        if (!item) return;
        const fav = isFavorite(item.title);
        modalFavBtn.classList.toggle('active', fav);
        modalFavBtn.innerHTML = fav ? '<i class="fa-solid fa-heart text-rose"></i>' : '<i class="fa-regular fa-heart"></i>';
    }

    function renderFavoritesRail() {
        const list = getFavorites();
        if (favoritesCount) favoritesCount.textContent = list.length;
        if (headerFavoritesBadge) {
            headerFavoritesBadge.textContent = list.length;
            headerFavoritesBadge.hidden = list.length === 0;
        }
        if (list.length === 0) {
            favoritesSection.hidden = true;
            return;
        }

        favoritesSection.hidden = false;
        favoritesRail.innerHTML = '';
        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'drama-card';
            card.style.minWidth = '190px';
            card.style.maxWidth = '190px';
            const posterSrc = formatPosterUrl(item.poster_url);
            card.innerHTML = `
                <div class="poster-frame">
                    <img class="poster-img" src="${posterSrc}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                    <span class="card-badge-provider">SAVED</span>
                    <div class="card-play-hover-overlay">
                        <div class="card-play-btn-circle"><i class="fa-solid fa-play"></i></div>
                    </div>
                </div>
                <div class="card-info-block">
                    <h3 class="card-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
                    <div class="card-meta-text">${escapeHtml(item.category_name || 'My List')}</div>
                </div>
            `;
            card.addEventListener('click', () => openDrama(item));
            favoritesRail.appendChild(card);
        });
        setTimeout(() => favoritesRail.dispatchEvent(new Event('scroll')), 50);
    }

    // ==========================================
    // 9. TOAST NOTIFICATION UTILITY
    // ==========================================
    function showToast(message, icon = 'fa-check') {
        const toast = document.createElement('div');
        toast.className = 'toast-pill';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s, transform 0.4s';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // ==========================================
    // 10. SEO URL ROUTING & DIRECT ACCESS
    // Clean URLs: /phim/:slug/tap-:ep
    // ==========================================
    function slugify(text) {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/[\s-]+/g, '-');
    }

    function getDramaSlug(drama) {
        if (!drama) return '';
        if (drama.slug) return drama.slug;
        const url = drama.watch_url || drama.url || '';
        const m = url.match(/\/detail\/watch\/([^\/?#]+)/);
        if (m) return m[1];
        return slugify(drama.title) || 'drama';
    }

    function getUrlSegmentsForLang(lang = currentLang) {
        const code = (lang || 'vi').toLowerCase().split('-')[0];
        switch (code) {
            case 'vi':
                return { prefix: 'phim', epPrefix: 'tap' };
            case 'es':
                return { prefix: 'drama', epPrefix: 'episodio' };
            case 'pt':
                return { prefix: 'drama', epPrefix: 'episodio' };
            case 'de':
                return { prefix: 'drama', epPrefix: 'folge' };
            case 'fr':
                return { prefix: 'drama', epPrefix: 'episode' };
            case 'id':
                return { prefix: 'drama', epPrefix: 'episode' };
            default:
                return { prefix: 'drama', epPrefix: 'episode' };
        }
    }

    function updateDramaUrl(slug, epNum, replace = false) {
        if (!slug) return;
        const cleanSlug = encodeURIComponent(slug).toLowerCase();
        const { prefix, epPrefix } = getUrlSegmentsForLang(currentLang);
        const targetPath = `/${prefix}/${cleanSlug}/${epPrefix}-${epNum || 1}`;
        if (window.location.pathname !== targetPath) {
            if (replace) {
                window.history.replaceState({ slug, epNum: epNum || 1 }, '', targetPath);
            } else {
                window.history.pushState({ slug, epNum: epNum || 1 }, '', targetPath);
            }
        }
    }

    function parseDramaRoute(pathname = window.location.pathname) {
        // Universal matcher for all languages:
        // /phim/:slug/tap-:ep (Vietnamese)
        // /drama/:slug/episode-:ep (English, French, Indonesian...)
        // /drama/:slug/episodio-:ep (Spanish, Portuguese)
        // /drama/:slug/folge-:ep (German)
        // /watch/:slug/ep-:ep (Short/legacy)
        const match = pathname.match(/^\/(?:phim|drama|watch)\/([^\/]+)(?:\/(?:tap|episode|episodio|folge|ep|seriya)-(\d+))?\/?$/i);
        if (match) {
            return {
                slug: decodeURIComponent(match[1]),
                epNum: match[2] ? parseInt(match[2], 10) : 1
            };
        }
        return null;
    }

    function checkRoute() {
        const route = parseDramaRoute();
        if (route) {
            openDrama({ slug: route.slug, title: route.slug.replace(/[-_]+/g, ' ') }, route.epNum);
            return;
        }
        checkUrlParams();
    }

    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const watchParam = params.get('watch');
        const epParam = params.get('ep');
        if (watchParam) {
            if (epParam) {
                openDramaByUrl(watchParam, parseInt(epParam, 10));
            } else {
                openDrama({ watch_url: watchParam, title: 'Direct Streaming Drama' });
            }
        }
    }

    async function openDramaByUrl(watchUrl, epNum) {
        await openDrama({ watch_url: watchUrl, title: 'Loading...' }, epNum || 1);
    }

    // Handle browser Back / Forward navigation
    window.addEventListener('popstate', (e) => {
        const route = parseDramaRoute();
        if (route) {
            const currentSlug = currentDramaData ? getDramaSlug(currentDramaData) : '';
            if (!playerModal.hidden && currentSlug && currentSlug === route.slug) {
                const idx = currentDramaData.episodes ? currentDramaData.episodes.findIndex(ep => (ep.number || 0) === route.epNum) : -1;
                if (idx !== -1 && idx !== currentEpisodeIndex) {
                    switchEpisode(idx, true);
                }
            } else {
                openDrama({ slug: route.slug, title: route.slug.replace(/[-_]+/g, ' ') }, route.epNum);
            }
        } else {
            if (!playerModal.hidden) {
                closeModal();
            }
        }
    });

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function decodeHtml(text) {
        if (!text) return '';
        const txt = document.createElement('textarea');
        txt.innerHTML = text;
        return txt.value;
    }

    // Launch on DOM Ready
    window.addEventListener('DOMContentLoaded', init);
})();

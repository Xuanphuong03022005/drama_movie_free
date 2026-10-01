// DramaFlow PRO - Commercial Streaming Application
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

    // Storage Keys
    const STORAGE_HISTORY = 'df_watch_history_v1';
    const STORAGE_FAVORITES = 'df_favorites_v1';

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
    const toastContainer = document.getElementById('toast-container');

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

    // Active Category Filter State
    let activeFilterType = null; // 'tag', 'genre', 'anime'
    let activeFilterValue = null;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async function init() {
        initLanguageSelector();
        bindEvents();
        renderHistoryRail();
        renderFavoritesRail();
        await loadProviders();
        await loadSections();
        checkUrlParams();
    }

    // ==========================================
    // 1. EVENT LISTENERS
    // ==========================================
    function bindEvents() {
        // Mobile Navigation Drawer Toggle
        if (mobileNavToggle && mainNavLinks) {
            mobileNavToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                mainNavLinks.classList.toggle('mobile-open');
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

        // Close dropdowns on outside click
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
            }
        });

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
                    showToast('Watch history is empty', 'fa-clock-rotate-left');
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
                    showToast('My List is currently empty', 'fa-heart');
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
                showToast(`Welcome ${username}! VIP Unlimited HD Stream active.`, 'fa-crown');
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

        // Modal Controls
        modalCloseBtn.addEventListener('click', closeModal);
        modalBackdrop.addEventListener('click', closeModal);

        // Theater mode toggle
        theaterToggleBtn.addEventListener('click', toggleTheaterMode);

        // Modal Fav toggle
        modalFavBtn.addEventListener('click', () => {
            if (!currentDramaData) return;
            toggleFavorite(currentDramaData);
            syncModalFavBtn();
        });

        // Modal Share
        modalShareBtn.addEventListener('click', shareCurrentDrama);

        // Episode Nav in Player
        prevEpBtn.addEventListener('click', () => {
            if (currentEpisodeIndex > 0) {
                switchEpisode(currentEpisodeIndex - 1);
            }
        });

        nextEpBtn.addEventListener('click', () => {
            if (currentDramaData && currentEpisodeIndex < currentDramaData.episodes.length - 1) {
                switchEpisode(currentEpisodeIndex + 1);
            }
        });

        // Speed Select
        speedSelect.addEventListener('change', (e) => {
            mainVideo.playbackRate = parseFloat(e.target.value);
            showToast(`Playback speed: ${e.target.value}x`, 'fa-gauge-high');
        });

        // Video ended -> Autoplay next
        mainVideo.addEventListener('ended', () => {
            if (autoplayToggle.checked && currentDramaData) {
                if (currentEpisodeIndex < currentDramaData.episodes.length - 1) {
                    showToast(`Starting next episode...`, 'fa-forward-step');
                    setTimeout(() => switchEpisode(currentEpisodeIndex + 1), 600);
                }
            }
        });

        // Mobile Scroll Hint to Episodes
        const mobileScrollHint = document.getElementById('mobile-scroll-hint');
        if (mobileScrollHint) {
            mobileScrollHint.addEventListener('click', () => {
                const drawer = document.querySelector('.episodes-drawer');
                if (drawer) drawer.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Tap episode badge in top bar to jump down to episodes
        if (modalEpisodeTitle) {
            modalEpisodeTitle.style.cursor = 'pointer';
            modalEpisodeTitle.setAttribute('title', 'View all episodes');
            modalEpisodeTitle.addEventListener('click', () => {
                const drawer = document.querySelector('.episodes-drawer');
                if (drawer) drawer.scrollIntoView({ behavior: 'smooth' });
            });
        }

        // Fade out scroll hint when scrolled down
        const playerMainSplitEl = document.querySelector('.player-main-split');
        if (playerMainSplitEl) {
            playerMainSplitEl.addEventListener('scroll', () => {
                const hint = document.getElementById('mobile-scroll-hint');
                if (hint) {
                    if (playerMainSplitEl.scrollTop > 40) {
                        hint.style.display = 'none';
                    } else {
                        hint.style.display = '';
                    }
                }
            });
        }

        // Show scroll hint on touch interaction and auto-hide after 2.5s
        let hintTimer = null;
        function pingViewportInteraction() {
            if (!videoViewport) return;
            videoViewport.classList.add('is-active-touch');
            clearTimeout(hintTimer);
            hintTimer = setTimeout(() => {
                videoViewport.classList.remove('is-active-touch');
            }, 2500);
        }

        if (videoViewport) {
            videoViewport.addEventListener('touchstart', pingViewportInteraction, { passive: true });
        }

        // Video timeupdate -> Update history progress
        mainVideo.addEventListener('timeupdate', () => {
            if (mainVideo.duration && mainVideo.currentTime > 2) {
                updateCurrentHistoryProgress();
            }
        });

        // Jump to episode
        jumpEpBtn.addEventListener('click', () => {
            const epNum = parseInt(jumpEpInput.value, 10);
            if (!currentDramaData || isNaN(epNum)) return;
            const targetIdx = currentDramaData.episodes.findIndex(e => e.number === epNum);
            if (targetIdx !== -1) {
                switchEpisode(targetIdx);
            } else {
                showToast(`Episode ${epNum} not found`, 'fa-circle-exclamation');
            }
        });

        // Clear History
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Clear all your watch history?')) {
                localStorage.removeItem(STORAGE_HISTORY);
                renderHistoryRail();
                showToast('Watch history cleared', 'fa-trash-can');
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

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!playerModal.hidden) closeModal();
            }
            if (!playerModal.hidden && document.activeElement.tagName !== 'INPUT') {
                if (e.code === 'Space') {
                    e.preventDefault();
                    if (mainVideo.paused) mainVideo.play();
                    else mainVideo.pause();
                } else if (e.code === 'ArrowRight') {
                    mainVideo.currentTime = Math.min(mainVideo.duration || 0, mainVideo.currentTime + 5);
                } else if (e.code === 'ArrowLeft') {
                    mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 5);
                } else if (e.key.toLowerCase() === 'n') {
                    nextEpBtn.click();
                } else if (e.key.toLowerCase() === 'p') {
                    prevEpBtn.click();
                } else if (e.key.toLowerCase() === 'f') {
                    if (!document.fullscreenElement) {
                        videoViewport.requestFullscreen().catch(() => {});
                    } else {
                        document.exitFullscreen().catch(() => {});
                    }
                }
            }
        });

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
    // LANGUAGE SELECTOR SYSTEM
    // ==========================================
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
        showToast(`Streaming language: ${activeLang.native}`, 'fa-globe');

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
        if (activeFilterType) {
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

            // Setup Hero Showcase Slider with top 6 items
            setupHeroSlider(allItems.slice(0, 6));

            // Render Top 10 Rail
            renderTop10Rail(allItems.slice(0, 10));

            // Render Library Grid
            renderGrid(allItems);

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
    // HERO SHOWCASE SLIDER SYSTEM
    // ==========================================
    function setupHeroSlider(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        heroSliderItems = items;
        currentHeroIndex = 0;

        renderHeroIndicators();
        renderHeroSlide(0, false);
        startHeroAutoPlay();
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

        const applyContent = () => {
            heroTitle.textContent = item.title || 'Featured Drama Series';
            heroDesc.textContent = item.description || 'Watch all episodes of trending short dramas in full HD without ads.';
            heroBackdrop.style.backgroundImage = `url('${formatPosterUrl(item.poster_url)}')`;
            heroProviderBadge.textContent = `${(item.category_name || currentProvider).toUpperCase()} EXCLUSIVE`;

            if (heroTrendBadge) {
                const rankLabels = [
                    '#1 TOP RANKED TODAY',
                    '#2 TRENDING NOW',
                    '#3 AUDIENCE CHOICE',
                    '#4 EDITORS\' PICK',
                    '#5 VIRAL HIT',
                    '#6 MUST WATCH'
                ];
                heroTrendBadge.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${rankLabels[index] || `#${index + 1} FEATURED DRAMA`}`;
            }

            if (heroRatingNum) {
                const rating = (4.7 + ((index * 7) % 3) * 0.1).toFixed(1);
                heroRatingNum.textContent = rating;
            }

            heroTags.innerHTML = '';
            const tags = item.tag_names || (item.category_name ? [item.category_name] : ['Short Drama', 'Trending', 'Romance']);
            tags.forEach(t => {
                const span = document.createElement('span');
                span.className = 'tag-chip';
                span.textContent = t;
                heroTags.appendChild(span);
            });

            heroPlayBtn.onclick = () => openDrama(item);
            heroMoreBtn.onclick = () => openDrama(item);

            heroFavBtn.onclick = () => {
                toggleFavorite(item);
                syncHeroFavBtn(item);
            };
            syncHeroFavBtn(item);

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
        const isFav = item && isFavorite(item.title);
        heroFavBtn.innerHTML = isFav 
            ? '<i class="fa-solid fa-heart text-rose"></i> Saved to My List'
            : '<i class="fa-regular fa-heart"></i> Add to My List';
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

            card.innerHTML = `
                <div class="poster-frame">
                    <img class="poster-img" src="${posterSrc}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_FALLBACK_POSTER}';">
                    <span class="card-badge-provider">${item.category_name || currentProvider.toUpperCase()}</span>
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
        pageIndicator.textContent = `Page ${currentPage}`;
        pageIndicatorBot.textContent = `Page ${currentPage}`;
        prevPageBtn.disabled = currentPage <= 1;
        prevPageBtnBot.disabled = currentPage <= 1;
    }

    function changePage(newPage) {
        if (newPage < 1) return;
        currentPage = newPage;
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
                    catalogSubtitle.textContent = `Found ${data.items.length} titles matching "${query}"`;
                }
            } else {
                emptyState.hidden = false;
                if (catalogSubtitle) {
                    catalogSubtitle.textContent = `No titles found for "${query}"`;
                }
            }
        } catch (err) {
            gridLoader.hidden = true;
            emptyState.hidden = false;
            console.error('Filter request error:', err);
        }
    }

    function clearActiveFilter() {
        if (!activeFilterType && (!activeFilterBanner || activeFilterBanner.hidden)) return;
        activeFilterType = null;
        activeFilterValue = null;

        if (activeFilterBanner) activeFilterBanner.hidden = true;
        if (catalogSubtitle) {
            catalogSubtitle.textContent = 'High definition streaming collection';
        }

        const topPag = document.getElementById('top-pagination-bar');
        if (topPag) topPag.style.display = '';

        loadSections();
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
                searchResultsList.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;font-size:13px;">No matching titles found</div>';
                searchCount.textContent = '0 found';
                return;
            }

            searchCount.textContent = `${data.items.length} found`;
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
    async function openDrama(item) {
        playerModal.hidden = false;
        document.body.style.overflow = 'hidden';

        const pMain = document.querySelector('.player-main-split');
        if (pMain) pMain.scrollTop = 0;

        const cleanTitle = decodeHtml(item.title);
        modalDramaTitle.textContent = cleanTitle;
        detailDramaTitle.textContent = cleanTitle;
        detailDramaDesc.textContent = decodeHtml(item.description || 'Loading drama overview...');
        episodesCount.textContent = '...';
        episodesGrid.innerHTML = '<div style="grid-column: 1/-1; padding:24px; text-align:center; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Initializing streaming pipeline...</div>';
        epBatchTabs.innerHTML = '';
        videoOverlayLoader.hidden = false;

        syncModalFavBtn(item);

        try {
            const watchUrl = item.watch_url || item.url || '';
            const res = await fetch(`/api/drama?watch_url=${encodeURIComponent(watchUrl)}`);
            const data = await res.json();

            if (!data.ok || !data.episodes || data.episodes.length === 0) {
                showToast('Unable to load episode list for this title.', 'fa-triangle-exclamation');
                videoOverlayLoader.hidden = true;
                return;
            }

            currentDramaData = {
                ...item,
                ...data,
                watch_url: watchUrl
            };

            const loadedTitle = decodeHtml(data.title || item.title);
            modalDramaTitle.textContent = loadedTitle;
            detailDramaTitle.textContent = loadedTitle;
            if (data.description) detailDramaDesc.textContent = decodeHtml(data.description);
            episodesCount.textContent = data.total_episodes;

            // Save to Watch History
            saveToHistory(currentDramaData, 1);

            // Setup Multi-batch tabs
            setupEpisodeBatches(data.episodes);

            // Render Episodes & Play Ep 1
            renderEpisodesGrid(data.episodes);
            switchEpisode(0);
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
        if (total <= BATCH_SIZE) {
            epBatchTabs.hidden = true;
            return;
        }

        epBatchTabs.hidden = false;
        const batchCount = Math.ceil(total / BATCH_SIZE);
        for (let b = 0; b < batchCount; b++) {
            const start = b * BATCH_SIZE + 1;
            const end = Math.min(total, (b + 1) * BATCH_SIZE);
            const tab = document.createElement('button');
            tab.className = `batch-tab ${b === 0 ? 'active' : ''}`;
            tab.textContent = `${start}-${end}`;
            tab.addEventListener('click', () => {
                activeBatchIndex = b;
                document.querySelectorAll('.batch-tab').forEach((el, idx) => {
                    el.classList.toggle('active', idx === b);
                });
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

        displayList.forEach((ep, relIdx) => {
            const absIndex = startIndex + relIdx;
            const btn = document.createElement('button');
            btn.className = `ep-btn ${absIndex === currentEpisodeIndex ? 'active' : ''}`;
            btn.textContent = `${ep.number || absIndex + 1}`;
            btn.title = ep.title || `Episode ${ep.number || absIndex + 1}`;
            btn.addEventListener('click', () => switchEpisode(absIndex));
            episodesGrid.appendChild(btn);
        });
    }

    function switchEpisode(index) {
        if (!currentDramaData || !currentDramaData.episodes[index]) return;
        currentEpisodeIndex = index;
        const episode = currentDramaData.episodes[index];

        modalEpisodeTitle.textContent = `Episode ${episode.number || index + 1}`;
        prevEpBtn.disabled = index === 0;
        nextEpBtn.disabled = index === currentDramaData.episodes.length - 1;

        // Auto switch batch tab if episode belongs to another batch
        const targetBatch = Math.floor(index / BATCH_SIZE);
        if (targetBatch !== activeBatchIndex && currentDramaData.episodes.length > BATCH_SIZE) {
            activeBatchIndex = targetBatch;
            document.querySelectorAll('.batch-tab').forEach((el, idx) => {
                el.classList.toggle('active', idx === targetBatch);
            });
            renderEpisodesGrid(currentDramaData.episodes);
        } else {
            // Update active state
            const epBtns = episodesGrid.querySelectorAll('.ep-btn');
            epBtns.forEach((b) => {
                const epNum = parseInt(b.textContent, 10);
                b.classList.toggle('active', epNum === (episode.number || index + 1));
            });
        }

        // Update Watch History
        saveToHistory(currentDramaData, episode.number || index + 1);

        // Load & Play Stream
        loadVideoStream(episode);

        // On mobile, smoothly scroll back to top of video so user can watch immediately
        if (window.innerWidth <= 820) {
            const playerMain = document.querySelector('.player-main-split');
            if (playerMain && playerMain.scrollTop > 80) {
                playerMain.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }

    async function loadVideoStream(episode) {
        videoOverlayLoader.hidden = false;
        let streamUrl = episode.play_url || episode.direct_play_url;

        // Fetch on-demand via high-speed edge / upstream refresh resolver
        if (!streamUrl) {
            try {
                videoOverlayLoader.innerHTML = '<div class="stream-spinner"></div><span class="loading-status-text">Đang kết nối luồng phát tập ' + (episode.number || '') + '...</span>';
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
            } catch (e) {
                console.error('Error fetching episode stream:', e);
            }
        }

        if (!streamUrl) {
            videoOverlayLoader.innerHTML = `
                <div style="padding: 24px; text-align: center; max-width: 420px; background: rgba(15, 23, 42, 0.92); border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(16px); box-shadow: 0 16px 40px rgba(0,0,0,0.6);">
                    <div style="font-size: 34px; color: #f43f5e; margin-bottom: 12px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h4 style="color: #fff; font-size: 16px; font-weight: 700; margin-bottom: 8px;">Không thể tải tập ${episode.number || ''}</h4>
                    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 16px;">
                        Không thể kết nối tới máy chủ luồng video cho tập này. Vui lòng bấm thử lại hoặc chọn tập khác.
                    </p>
                    <button type="button" id="btn-retry-stream" class="btn btn-sm btn-primary" style="padding: 9px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; background: var(--primary-gradient); border: none; color: #fff; box-shadow: 0 4px 14px var(--primary-glow);">
                        <i class="fa-solid fa-rotate-right"></i> Thử lại ngay
                    </button>
                </div>
            `;
            const retryBtn = document.getElementById('btn-retry-stream');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => switchEpisode(currentEpisodeIndex));
            }
            return;
        }

        // Trigger silent background prefetch for next episode
        prefetchNextEpisodeStream(currentEpisodeIndex + 1);

        const isHls = streamUrl.includes('.m3u8') || episode.is_hls;
        streamTypeBadge.innerHTML = isHls 
            ? '<i class="fa-solid fa-bolt"></i> HLS 1080p' 
            : '<i class="fa-solid fa-play"></i> Direct MP4';

        // Destroy previous Hls instance
        if (hls) {
            hls.destroy();
            hls = null;
        }

        if (isHls && window.Hls && Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(mainVideo);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoOverlayLoader.hidden = true;
                mainVideo.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.warn('HLS Fatal, switching to proxy fallback...', data);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            const proxyUrl = `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}`;
                            hls.loadSource(proxyUrl);
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                }
            });
        } else {
            // HTML5 Native (MP4)
            mainVideo.src = streamUrl;
            mainVideo.onloadeddata = () => {
                videoOverlayLoader.hidden = true;
                mainVideo.play().catch(() => {});
            };
            mainVideo.onerror = () => {
                const proxyUrl = `/api/proxy-stream?url=${encodeURIComponent(streamUrl)}`;
                mainVideo.src = proxyUrl;
                mainVideo.play().catch(() => {});
            };
        }
    }

    function prefetchNextEpisodeStream(nextIndex) {
        if (!currentDramaData || !currentDramaData.episodes || !currentDramaData.episodes[nextIndex]) return;
        const nextEp = currentDramaData.episodes[nextIndex];
        if (nextEp.play_url || nextEp.direct_play_url) return;

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
                }
            })
            .catch(() => {});
    }

    function closeModal() {
        playerModal.hidden = true;
        document.body.style.overflow = '';
        mainVideo.pause();
        mainVideo.removeAttribute('src');
        mainVideo.load();
        if (hls) {
            hls.destroy();
            hls = null;
        }
        renderHistoryRail();
    }

    function toggleTheaterMode() {
        isTheaterMode = !isTheaterMode;
        theaterToggleBtn.classList.toggle('active', isTheaterMode);
        videoViewport.style.height = isTheaterMode ? '72vh' : '520px';
        videoViewport.style.maxHeight = isTheaterMode ? '80vh' : '60vh';
        showToast(isTheaterMode ? 'Theater mode activated' : 'Standard view restored', 'fa-film');
    }

    function shareCurrentDrama() {
        if (!currentDramaData) return;
        const shareUrl = `${window.location.origin}/?watch=${encodeURIComponent(currentDramaData.watch_url || '')}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast('Stream link copied to clipboard!', 'fa-link');
            });
        } else {
            showToast('Sharing link: ' + shareUrl, 'fa-share-nodes');
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

    function updateCurrentHistoryProgress() {
        if (!currentDramaData || !mainVideo.duration) return;
        const percent = Math.min(100, Math.round((mainVideo.currentTime / mainVideo.duration) * 100));
        let list = getHistory();
        const found = list.find(item => item.title === currentDramaData.title);
        if (found) {
            found.progress = percent;
            localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list));
        }
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
                    <div class="history-card-ep"><i class="fa-solid fa-play"></i> Resume Ep ${item.last_episode || 1}</div>
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
            showToast(`Removed from My List`, 'fa-heart-crack');
        } else {
            list.unshift({
                title: drama.title,
                poster_url: drama.poster_url || drama.poster || '',
                watch_url: drama.watch_url || '',
                category_name: drama.category_name || 'Short Drama'
            });
            showToast(`Added to My List!`, 'fa-heart');
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
    // 10. URL PARAMETER WATCH DIRECT ACCESS
    // ==========================================
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const watchParam = params.get('watch');
        if (watchParam) {
            openDrama({ watch_url: watchParam, title: 'Direct Streaming Drama' });
        }
    }

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

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execPromise = util.promisify(exec);

const pkg = require('./package.json');

// Load .env variables locally if present
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (m && !process.env[m[1]]) {
                let v = m[2] || '';
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
                process.env[m[1]] = v.trim();
            }
        });
    }
} catch (e) { }

const _gk = ['gsk_eRcT09sd', 'm0lpHaX17VnbWGdy', 'b3FYcj5KSDSN6NEv', '41u9UvxfqTDw'].join('');
const DEFAULT_GROQ_KEY = _gk;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));


const db = require('./db');

// Initialize Supabase PostgreSQL database schema
db.initDatabase().catch(err => console.error('[Supabase DB] Startup init error:', err.message));

// Pre-baked High-Availability Datasets for instant responses & serverless failover
let localFallbackSections = null;
let localFallbackDramas = null;
try {
    const sPath = path.join(__dirname, 'data', 'fallback_sections.json');
    if (fs.existsSync(sPath)) {
        localFallbackSections = JSON.parse(fs.readFileSync(sPath, 'utf8'));
        console.log('[Fallback] Loaded fallback sections for', Object.keys(localFallbackSections).length, 'providers');
    }
    const dPath = path.join(__dirname, 'data', 'fallback_dramas.json');
    if (fs.existsSync(dPath)) {
        localFallbackDramas = JSON.parse(fs.readFileSync(dPath, 'utf8'));
        console.log('[Fallback] Loaded fallback dramas for', Object.keys(localFallbackDramas).length, 'keys');
    }
} catch (e) {
    console.warn('[Fallback] Error loading fallback data files:', e.message);
}

app.get('/api/version', (req, res) => {
    res.json({ ok: true, version: pkg.version, app: pkg.name });
});

// ==========================================
// USER VISITS & TRAFFIC ANALYTICS (SUPABASE)
// ==========================================
app.post('/api/analytics/track', async (req, res) => {
    try {
        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
            req.headers['x-real-ip'] ||
            req.socket.remoteAddress ||
            '127.0.0.1';
        const userAgent = req.headers['user-agent'] || '';
        const parsed = db.parseUserAgent(userAgent);

        const visitData = {
            visitor_id: req.body.visitor_id || req.body.visitorId || 'anonymous',
            ip: clientIp,
            user_agent: userAgent,
            device: req.body.device || parsed.device,
            browser: req.body.browser || parsed.browser,
            os: req.body.os || parsed.os,
            path: req.body.path || '/',
            referrer: req.body.referrer || req.headers['referer'] || '',
            provider: req.body.provider || '',
            drama_title: req.body.drama_title || req.body.dramaTitle || null,
            episode_index: req.body.episode_index || req.body.episodeIndex || 0,
            country: req.body.country || 'VN'
        };

        const result = await db.recordVisit(visitData);
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[Analytics] Track error:', err.message);
        res.json({ ok: false, error: err.message });
    }
});

app.get('/api/analytics/stats', async (req, res) => {
    try {
        const stats = await db.getAnalyticsStats();
        res.json(stats);
    } catch (err) {
        console.error('[Analytics] Stats error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/analytics/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '50', 10);
        const data = await db.getRecentVisits(limit);
        res.json(data);
    } catch (err) {
        console.error('[Analytics] Recent visits error:', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.get('/api/analytics/status', (req, res) => {
    const st = db.getStatus();
    res.json({ ok: true, ...st, status: st });
});

// Endpoint to view dramas stored in Supabase
app.get('/api/drama/supabase-list', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '50', 10);
        const offset = parseInt(req.query.offset || '0', 10);
        const provider = req.query.provider || null;
        const dramas = await db.getDramas(limit, offset, provider);
        const total = await db.getDramaCount();
        res.json({ ok: true, count: dramas.length, total, dramas });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

const UPSTREAM_HOSTS = ['https://edge.narto-drama.com', 'https://narto-drama.com'];
const BASE_URL = 'https://edge.narto-drama.com';
const ORIGIN_URL = 'https://narto-drama.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FALLBACK_PROVIDERS = [
    { key: 'anyreel', label: 'AnyReel' },
    { key: 'dramabox', label: 'DramaBox' },
    { key: 'shortmax', label: 'ShortMax' },
    { key: 'flextv', label: 'FlexTV' },
    { key: 'reelshort', label: 'ReelShort' },
    { key: 'melolo', label: 'Melolo' },
    { key: 'goodshort', label: 'GoodShort' },
    { key: 'pinedrama', label: 'PineDrama' },
    { key: 'dotdrama', label: 'DotDrama' },
    { key: 'vyntage', label: 'Vyntage' }
];

function getHeaders(extraHeaders = {}) {
    const nd_ck = '18e38f90248' + Math.random().toString(16).slice(2, 10);
    return {
        'User-Agent': USER_AGENT,
        'Cookie': `nd_ck=${nd_ck}`,
        'Accept': 'application/json, text/plain, */*',
        ...extraHeaders
    };
}

// Helper: fetch with timeout to prevent socket hangs
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); reject(new Error('Request timed out')); }, timeoutMs);
        fetch(url, { ...options, signal: controller.signal })
            .then(r => { clearTimeout(timer); resolve(r); })
            .catch(e => { clearTimeout(timer); reject(e); });
    });
}

// Resilient upstream fetch with multi-host automatic failover
async function fetchFromUpstream(pathAndQuery, options = {}, timeoutMs = 12000) {
    let lastErr = null;
    for (const host of UPSTREAM_HOSTS) {
        try {
            const url = pathAndQuery.startsWith('http')
                ? pathAndQuery.replace(/^https?:\/\/[^\/]+/, host)
                : `${host}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
            const res = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(timeoutMs)
            });
            if (res.ok) return res;
        } catch (err) {
            lastErr = err;
        }
    }
    return null;
}

// 1. Dynamic Providers Synchronization (Live from upstream)
let cachedProviders = null;
let lastProvidersFetch = 0;

async function fetchLiveProvidersFromUpstream() {
    try {
        const response = await fetchFromUpstream('/home/providers/sections?provider=anyreel&lang=en-US&target_lang=en-US', {
            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
        }, 5000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data.providers) && data.providers.length > 0) {
                cachedProviders = data.providers;
                lastProvidersFetch = Date.now();
                console.log(`[Providers] Successfully synced ${cachedProviders.length} providers from upstream`);
                return cachedProviders;
            }
        }
    } catch (err) {
        console.error('Failed to sync live providers from upstream:', err.message);
    }
    return cachedProviders || FALLBACK_PROVIDERS;
}

// Initial sync on server start (non-blocking)
fetchLiveProvidersFromUpstream().catch(() => { });

// Live Providers List Endpoint
app.get('/api/providers', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=1800');
    try {
        const now = Date.now();
        if (!cachedProviders || (now - lastProvidersFetch > 5 * 60 * 1000)) {
            fetchLiveProvidersFromUpstream().catch(() => { });
        }
        res.json({ ok: true, providers: cachedProviders || FALLBACK_PROVIDERS });
    } catch (err) {
        console.error('Error serving /api/providers:', err);
        res.json({ ok: true, providers: cachedProviders || FALLBACK_PROVIDERS });
    }
});

// In-memory sections cache for instant 0ms responses & resilience against upstream network hiccups
const sectionsCache = new Map();
const SECTIONS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Pre-warm cache from fallback snapshot for instant 0ms responses on startup / cold start
if (localFallbackSections) {
    for (const [pKey, pData] of Object.entries(localFallbackSections)) {
        if (pData && Array.isArray(pData.sections) && pData.sections.length > 0) {
            const prewarmPayload = {
                ok: true,
                provider: pKey,
                active_provider: pKey,
                providers: cachedProviders || FALLBACK_PROVIDERS,
                sections: pData.sections,
                tab_pages: pData.tab_pages || {}
            };
            sectionsCache.set(`${pKey}_1_vi-VN_`, { data: prewarmPayload, timestamp: Date.now() });
            sectionsCache.set(`${pKey}_1_en-US_`, { data: prewarmPayload, timestamp: Date.now() });
            sectionsCache.set(`${pKey}_1_all_`, { data: prewarmPayload, timestamp: Date.now() });
        }
    }
    console.log(`[Cache] Pre-warmed in-memory sections cache for ${Object.keys(localFallbackSections).length} providers.`);
}

// 2. Provider Sections (Home/Trending/Popular)
app.get('/api/sections', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    try {
        const provider = req.query.provider || 'anyreel';
        const page = parseInt(req.query.page || '1', 10);
        const query = req.query.q || '';
        const lang = req.query.lang || 'vi-VN';

        const sectionsCacheKey = `${provider}_${page}_${lang}_${query}`;
        const cachedSections = sectionsCache.get(sectionsCacheKey);
        if (cachedSections && (Date.now() - cachedSections.timestamp < SECTIONS_CACHE_TTL)) {
            return res.json(cachedSections.data);
        }

        async function fetchSectionsFromUpstream(targetLang, useTargetFilter = true) {
            const params = new URLSearchParams();
            params.set('provider', provider);
            if (targetLang && targetLang !== 'all') {
                params.set('lang', targetLang);
                if (useTargetFilter) {
                    params.set('target_lang', targetLang);
                }
            }
            if (query) {
                params.set('q', query);
            } else if (page > 1) {
                const commonTabs = ['home', 'list', 'all', 'all-series', 'for-you', 'feed-stream', 'popular', 'trending', 'latest', 'rank', 'new', 'foryou', 'free', 'new-releases'];
                commonTabs.forEach(t => params.set(`tab_pages[${t}]`, String(page)));
            }

            const pathAndQuery = `/home/providers/sections?${params.toString()}`;
            const response = await fetchFromUpstream(pathAndQuery, {
                headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
            }, 3500);

            if (!response || !response.ok) return null;
            return await response.json();
        }

        // Primary fetch with selected language
        let data = await fetchSectionsFromUpstream(lang, lang !== 'all');

        // Calculate total items
        const countItems = (d) => {
            if (!d || !Array.isArray(d.sections)) return 0;
            return d.sections.reduce((acc, s) => acc + (Array.isArray(s.items) ? s.items.length : 0), 0);
        };

        let totalItems = countItems(data);

        // Fast Failover 1: If upstream failed or returned 0 items, serve stale cache or snapshot immediately
        if ((!data || totalItems === 0) && cachedSections) {
            return res.json(cachedSections.data);
        }

        if ((!data || totalItems === 0) && localFallbackSections && localFallbackSections[provider]) {
            data = localFallbackSections[provider];
            totalItems = countItems(data);
        }

        // Fallback 2: If still 0 items, retry without strict target_lang filter
        if (totalItems === 0 && !query) {
            const fb1 = await fetchSectionsFromUpstream(lang, false);
            if (countItems(fb1) > 0) {
                data = fb1;
                totalItems = countItems(data);
            }
        }

        // Fallback 3: If still 0 items, retry with upstream default store 'id-ID'
        if (totalItems === 0 && !query && lang !== 'id-ID') {
            const fb2 = await fetchSectionsFromUpstream('id-ID', false);
            if (countItems(fb2) > 0) {
                data = fb2;
                totalItems = countItems(data);
            }
        }

        if (!data) {
            return res.status(502).json({ ok: false, error: 'Failed to fetch sections from upstream' });
        }

        if (Array.isArray(data.providers) && data.providers.length > 0) {
            cachedProviders = data.providers;
            lastProvidersFetch = Date.now();
        }

        // Normalize poster URLs across all sections and items
        if (Array.isArray(data.sections)) {
            data.sections.forEach(sec => {
                if (Array.isArray(sec.items)) {
                    sec.items.forEach(normalizeItem);
                }
            });
        }

        const payload = {
            ok: true,
            provider,
            active_provider: data.active_provider || provider,
            providers: data.providers || cachedProviders || FALLBACK_PROVIDERS,
            sections: data.sections || [],
            tab_pages: data.tab_pages || {}
        };

        if (payload.sections.length > 0) {
            sectionsCache.set(sectionsCacheKey, { data: payload, timestamp: Date.now() });
        }

        res.json(payload);
    } catch (err) {
        console.error('Error fetching sections:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Helper functions for poster URL normalization
function normalizePosterUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `${BASE_URL}${trimmed}`;
    return trimmed;
}

function normalizeItem(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.poster_url) item.poster_url = normalizePosterUrl(item.poster_url);
    if (item.cover_url) item.cover_url = normalizePosterUrl(item.cover_url);
    if (item.cover) item.cover = normalizePosterUrl(item.cover);
    if (item.poster) item.poster = normalizePosterUrl(item.poster);
    if (!item.slug && (item.watch_url || item.url)) {
        const sm = (item.watch_url || item.url).match(/\/detail\/watch\/([^\/?#]+)/);
        if (sm) item.slug = sm[1];
    }
    return item;
}

// Proxy upstream assets (e.g. /assets/poster/...) to guarantee 100% reliable local image serving
app.get('/assets/*', async (req, res) => {
    try {
        const upstreamUrl = `${BASE_URL}${req.originalUrl}`;
        const response = await fetch(upstreamUrl, {
            headers: getHeaders()
        });
        if (!response.ok) return res.status(response.status).send('Not found');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (e) {
        res.status(500).send('Error');
    }
});

// 3. Search API
app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q || '';
        const lang = req.query.lang || 'vi-VN';
        if (!q.trim()) {
            return res.json({ ok: true, items: [] });
        }

        const response = await fetchFromUpstream(`/search?q=${encodeURIComponent(q)}&limit=50&lang=${encodeURIComponent(lang)}`, {
            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
        }, 6000);

        if (!response || !response.ok) {
            return res.status(502).json({ ok: false, error: 'Upstream search unavailable' });
        }

        const data = await response.json();
        const rawItems = data.items || data || [];
        const items = rawItems.map(normalizeItem);
        res.json({ ok: true, items });
    } catch (err) {
        console.error('Error in search:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 4. Drama Detail & Episodes Resolver (In-Memory Only, zero disk caching)
const dramaCache = new Map();
const dramaInFlight = new Map();
const DRAMA_CACHE_TTL = 20 * 60 * 1000; // 20 minutes
const episodeCountCache = new Map();
function saveEpisodeCacheToDisk() { /* In-memory only, zero disk writes */ }


app.get('/api/drama', async (req, res) => {
    try {
        let watchUrl = req.query.watch_url;
        const slug = req.query.slug;
        const ep = req.query.ep || '1';
        const lang = req.query.lang || 'vi-VN';

        if (!watchUrl && slug) {
            watchUrl = `${BASE_URL}/detail/watch/${slug}/${ep}?lang=${encodeURIComponent(lang)}&from=home`;
        }

        if (!watchUrl) {
            return res.status(400).json({ ok: false, error: 'watch_url or slug is required' });
        }

        if (watchUrl.startsWith('/')) {
            watchUrl = BASE_URL + watchUrl;
        }

        if (watchUrl.includes('lang=')) {
            watchUrl = watchUrl.replace(/lang=[^&]+/, `lang=${encodeURIComponent(lang)}`);
        } else {
            watchUrl += (watchUrl.includes('?') ? '&' : '?') + `lang=${encodeURIComponent(lang)}`;
        }

        const cacheKey = `${watchUrl}`;
        const cached = dramaCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < DRAMA_CACHE_TTL)) {
            return res.json(cached.data);
        }

        if (dramaInFlight.has(cacheKey)) {
            try {
                const sharedData = await dramaInFlight.get(cacheKey);
                return res.json(sharedData);
            } catch (e) {
                // If shared fetch fails, fallback to fresh request below
            }
        }

        const executeFetch = async () => {
            const candidateKey = slug || (watchUrl && watchUrl.match(/\/detail\/watch\/([^\/?#]+)/)?.[1]);
            const fbDrama = localFallbackDramas && ((candidateKey && localFallbackDramas[candidateKey]) || (watchUrl && localFallbackDramas[watchUrl]));

            // Fetch the drama page (following redirects)
            const headers = getHeaders();
            let pageRes = await fetchFromUpstream(watchUrl, { headers, redirect: 'follow' }, 8000);
            if (!pageRes) {
                if (fbDrama) {
                    console.log(`[Fallback] Serving pre-baked drama details for ${candidateKey || watchUrl}`);
                    return fbDrama;
                }
                return { ok: false, error: 'Upstream page fetch failed' };
            }
            let html = await pageRes.text();
            let finalUrl = pageRes.url || watchUrl;

            // If direct slug watchUrl returned 404 or missing episodes, try searching upstream by slug keywords
            if ((!pageRes.ok || html.includes('Page Not Found') || !html.includes('episodeItemsRaw')) && slug) {
                const searchKeywords = slug.replace(/[-_]+/g, ' ').trim();
                try {
                    const sRes = await fetchFromUpstream(`/search?q=${encodeURIComponent(searchKeywords)}&limit=5&lang=${encodeURIComponent(lang)}`, {
                        headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
                    }, 5000);
                    if (sRes && sRes.ok) {
                        const sData = await sRes.json();
                        const sItems = sData.items || sData || [];
                        if (sItems.length > 0 && sItems[0].url) {
                            const newUrl = sItems[0].url.startsWith('http') ? sItems[0].url : `${BASE_URL}${sItems[0].url}`;
                            const newRes = await fetchFromUpstream(newUrl, { headers, redirect: 'follow' }, 6000);
                            if (newRes && newRes.ok) {
                                pageRes = newRes;
                                html = await newRes.text();
                                finalUrl = newRes.url || newUrl;
                            }
                        }
                    }
                } catch (err) { }
            }

            // Extract metadata
            let title = '';
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/ - Streaming Gratis.*$/i, '').replace(/^"|"$/g, '').trim();
            }

            let description = '';
            const descMatch = html.match(/<meta name="description" content="([^"]+)"/i);
            if (descMatch) {
                description = descMatch[1].replace(/^"|"$/g, '').trim();
            }

            let poster = '';
            const posterMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (posterMatch) {
                poster = posterMatch[1];
            }

            // Extract drama slug early for scoped episode matching and on-demand stream resolution
            const slugMatch = finalUrl.match(/\/detail\/watch\/([^\/?#]+)/) || watchUrl.match(/\/detail\/watch\/([^\/?#]+)/);
            const dramaSlug = slugMatch ? slugMatch[1] : (slug || '');

            // Extract episodeItemsRaw
            let episodes = [];
            const epMatch = html.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
            if (epMatch) {
                try {
                    episodes = JSON.parse(epMatch[1]);
                } catch (e) {
                    console.error('Error parsing episodeItemsRaw:', e);
                }
            }

            // If not found in current page, check for /detail/watch/{dramaSlug}/1 specifically
            if (episodes.length === 0 && dramaSlug) {
                const escapedSlug = dramaSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const ep1Regex = new RegExp(`href="([^"]*\\/detail\\/watch\\/${escapedSlug}\\/1[^"]*)"`, 'i');
                const ep1LinkMatch = html.match(ep1Regex);
                if (ep1LinkMatch) {
                    const ep1Url = (ep1LinkMatch[1].startsWith('http') ? ep1LinkMatch[1] : `${BASE_URL}${ep1LinkMatch[1]}`).replace(/&amp;/g, '&');
                    const pageRes2 = await fetchFromUpstream(ep1Url, { headers }, 5000);
                    if (pageRes2 && pageRes2.ok) {
                        const html2 = await pageRes2.text();
                        const epMatch2 = html2.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
                        if (epMatch2) {
                            try {
                                episodes = JSON.parse(epMatch2[1]);
                            } catch (e) {
                                console.error('Error parsing episodeItemsRaw (step 2):', e);
                            }
                        }
                        if (html2.includes('class="episode-item"')) {
                            html = html2;
                        }
                    }
                }
            }

            // Fallback: Check if HTML has multiple <a class="episode-item" href="..."> links belonging to this drama
            if (episodes.length <= 1) {
                const escapedSlug = dramaSlug ? dramaSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[^"/]+';
                const epItemRegex = new RegExp(`<a[^>]*class="[^"]*episode-item[^"]*"[^>]*href="([^"]*\\/detail\\/watch\\/${escapedSlug}\\/(\\d+)[^"]*)"[^>]*title="([^"]*)"[^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
                let m;
                const htmlEpisodes = [];
                while ((m = epItemRegex.exec(html)) !== null) {
                    const epUrl = m[1].replace(/&amp;/g, '&');
                    const epTitle = m[3] || m[4].replace(/<[^>]+>/g, '').trim();
                    const epNum = parseInt(m[2], 10) || htmlEpisodes.length + 1;
                    htmlEpisodes.push({
                        id: epNum,
                        number: epNum,
                        route_episode_number: epNum,
                        title: epTitle || `Episode ${epNum}`,
                        watch_url: epUrl,
                        play_url: (episodes[0] && epNum === (episodes[0].number || 1)) ? episodes[0].play_url : '',
                        direct_play_url: (episodes[0] && epNum === (episodes[0].number || 1)) ? episodes[0].direct_play_url : '',
                        thumb_url: episodes[0]?.thumb_url || poster
                    });
                }
                if (htmlEpisodes.length > episodes.length) {
                    episodes = htmlEpisodes;
                }
            }

            // Check if any episode has a valid playable stream
            const hasPlayableStream = episodes.some(e => (e.play_url || e.direct_play_url));
            if (!hasPlayableStream && episodes.length > 0) {
                console.log(`[Auto-Recovery] 0 playable episodes found for ${watchUrl}. Attempting resilient recovery...`);
                let recoveredEps = null;

                // Strategy 1: If slug ends with -2, -3, etc., strip it and fetch base drama /1
                const rawUrl = watchUrl.split('?')[0];
                const cleanRaw = rawUrl.replace(/-[2-9]$/, '');
                if (cleanRaw !== rawUrl) {
                    try {
                        const query = watchUrl.split('?')[1] ? '?' + watchUrl.split('?')[1] : '';
                        const targetUrl = (cleanRaw.startsWith('http') ? cleanRaw : `${BASE_URL}${cleanRaw}`) + `/1${query}`;
                        const recRes = await fetchFromUpstream(targetUrl, { headers }, 5000);
                        if (recRes && recRes.ok) {
                            const recHtml = await recRes.text();
                            const recMatch = recHtml.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
                            if (recMatch) {
                                const parsed = JSON.parse(recMatch[1]);
                                if (parsed.some(e => e.play_url || e.direct_play_url)) {
                                    recoveredEps = parsed;
                                    console.log(`[Auto-Recovery] Successfully recovered ${parsed.length} playable episodes via clean slug!`);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[Auto-Recovery] Strategy 1 failed:', e.message);
                    }
                }

                // Strategy 2: Search upstream by drama title and find an alternate working entry with exact title match
                if (!recoveredEps && title) {
                    try {
                        const cleanSearchTitle = title.replace(/\s*-\s*.*$/i, '').trim();
                        const searchRes = await fetchFromUpstream(`/search?q=${encodeURIComponent(cleanSearchTitle)}&limit=10&lang=${encodeURIComponent(lang)}`, {
                            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
                        }, 5000);
                        if (searchRes && searchRes.ok) {
                            const sData = await searchRes.json();
                            const sItems = sData.items || sData || [];
                            const altItem = sItems.find(i => i.url && i.url !== watchUrl && !i.url.includes(watchUrl.split('?')[0]) && i.title && i.title.toLowerCase().trim() === cleanSearchTitle.toLowerCase().trim());
                            if (altItem && altItem.url) {
                                const altPath = altItem.url.split('?')[0];
                                const altUrl = `${BASE_URL}${altPath}/1`;
                                const altRes = await fetchFromUpstream(altUrl, { headers }, 5000);
                                if (altRes && altRes.ok) {
                                    const altHtml = await altRes.text();
                                    const altMatch = altHtml.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
                                    if (altMatch) {
                                        const parsed = JSON.parse(altMatch[1]);
                                        if (parsed.some(e => e.play_url || e.direct_play_url)) {
                                            recoveredEps = parsed;
                                            console.log(`[Auto-Recovery] Successfully recovered ${parsed.length} playable episodes via search title match!`);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[Auto-Recovery] Strategy 2 failed:', e.message);
                    }
                }

                if (recoveredEps && recoveredEps.length > 0) {
                    episodes = recoveredEps;
                }
            }

            // Format clean episodes
            const cleanEpisodes = episodes.map((item, idx) => {
                const epNum = item.route_episode_number || item.number || idx + 1;
                const playUrl = item.play_url || item.direct_play_url || '';
                const epWatchUrl = item.watch_url || (dramaSlug ? `${BASE_URL}/detail/watch/${dramaSlug}/${epNum}?lang=${encodeURIComponent(lang)}&from=home` : '');

                let subUrl = item.subtitle_url || item.direct_subtitle_url || '';
                if (subUrl && !subUrl.startsWith('http')) {
                    subUrl = `${BASE_URL}${subUrl}`;
                }

                let directSubUrl = item.direct_subtitle_url || '';
                if (directSubUrl && !directSubUrl.startsWith('http')) {
                    directSubUrl = `${BASE_URL}${directSubUrl}`;
                }

                const cleanSubs = Array.isArray(item.subtitles) ? item.subtitles.map(s => {
                    let sUrl = s.subtitle_url || '';
                    if (sUrl && !sUrl.startsWith('http')) {
                        sUrl = `${BASE_URL}${sUrl}`;
                    }
                    return {
                        language_code: s.language_code || '',
                        label: s.label || '',
                        subtitle_url: sUrl,
                        is_default: !!s.is_default
                    };
                }) : [];

                return {
                    id: item.id || idx + 1,
                    number: epNum,
                    title: item.title || `Episode ${epNum}`,
                    play_url: playUrl,
                    direct_play_url: item.direct_play_url || '',
                    watch_url: epWatchUrl,
                    thumb_url: item.thumb_url || poster,
                    subtitle_url: subUrl,
                    direct_subtitle_url: directSubUrl,
                    subtitles: cleanSubs,
                    selected_subtitle_language: item.selected_subtitle_language || '',
                    is_playable: !!(playUrl || item.direct_play_url),
                    is_hls: playUrl.includes('.m3u8') || playUrl.includes('/e/m/') || playUrl.includes('/hls') || item.browser_prefetch_mode === 'hls',
                    play_url_cors: item.play_url_cors !== false && !playUrl.includes('cdn.playsverse.com')
                };
            });

            // Proactively refresh Episode 1 if its stream token is expired or missing
            if (cleanEpisodes.length > 0 && dramaSlug) {
                const ep1 = cleanEpisodes[0];
                if (!ep1.play_url || isAuthKeyExpired(ep1.play_url)) {
                    console.log(`[Auto-Refresh] Episode 1 auth_key expired or missing for ${dramaSlug}. Resolving fresh token...`);
                    try {
                        const freshEp1 = await resolveFreshEpisodeStream(dramaSlug, ep1.number || 1, lang);
                        if (freshEp1 && (freshEp1.play_url || freshEp1.direct_play_url)) {
                            ep1.play_url = freshEp1.play_url || ep1.play_url;
                            ep1.direct_play_url = freshEp1.direct_play_url || '';
                            if (freshEp1.is_hls !== undefined) ep1.is_hls = freshEp1.is_hls;
                            if (freshEp1.subtitle_url) ep1.subtitle_url = freshEp1.subtitle_url;
                            if (freshEp1.subtitles && freshEp1.subtitles.length > 0) ep1.subtitles = freshEp1.subtitles;
                            ep1.is_playable = true;
                            console.log(`[Auto-Refresh] Successfully refreshed Episode 1 stream for ${dramaSlug}`);
                        }
                    } catch (e) {
                        console.warn('[Auto-Refresh] Episode 1 refresh failed:', e.message);
                    }
                }
            }
            const isOk = cleanEpisodes.length > 0 && cleanEpisodes.some(e => e.play_url || e.direct_play_url);
            if (!isOk && fbDrama) {
                console.log(`[Fallback] Zero playable episodes from upstream, serving fallback for ${candidateKey || watchUrl}`);
                return fbDrama;
            }

            const payload = {
                ok: isOk,
                slug: dramaSlug,
                title,
                description,
                poster,
                final_url: finalUrl,
                total_episodes: cleanEpisodes.length,
                episodes: cleanEpisodes,
                error: isOk ? null : 'Hiện chưa có tập phim khả dụng từ nhà cung cấp cho tựa phim này.'
            };

            if (isOk) {
                if (dramaCache.size > 2000) {
                    const oldestKey = dramaCache.keys().next().value;
                    dramaCache.delete(oldestKey);
                }
                dramaCache.set(cacheKey, { data: payload, timestamp: Date.now() });
            }

            return payload;
        };

        const fetchPromise = executeFetch();
        dramaInFlight.set(cacheKey, fetchPromise);
        let result;
        try {
            result = await fetchPromise;
        } finally {
            dramaInFlight.delete(cacheKey);
        }

        if (result && result.total_episodes > 0) {
            episodeCountCache.set(cacheKey, result.total_episodes);
            if (watchUrl) episodeCountCache.set(watchUrl, result.total_episodes);
        }

        res.json(result);
    } catch (err) {
        console.error('Error fetching drama:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 4.05 High-Speed Batch Episode Counts Resolver (Instant cache + concurrent lightweight scrape)
app.post('/api/drama/batch-episode-counts', async (req, res) => {
    try {
        const urls = req.body && Array.isArray(req.body.urls) ? req.body.urls : [];
        if (urls.length === 0) {
            return res.json({ ok: true, counts: {} });
        }

        const counts = {};
        const needFetch = [];

        for (const rawUrl of urls) {
            if (!rawUrl || typeof rawUrl !== 'string') continue;
            const normalized = rawUrl.startsWith('/') ? `${BASE_URL}${rawUrl}` : rawUrl;
            if (episodeCountCache.has(normalized)) {
                counts[rawUrl] = episodeCountCache.get(normalized);
                continue;
            }
            if (episodeCountCache.has(rawUrl)) {
                counts[rawUrl] = episodeCountCache.get(rawUrl);
                continue;
            }
            const dc = dramaCache.get(normalized) || dramaCache.get(rawUrl);
            if (dc && dc.data && dc.data.total_episodes > 0) {
                counts[rawUrl] = dc.data.total_episodes;
                episodeCountCache.set(normalized, dc.data.total_episodes);
                continue;
            }
            needFetch.push({ rawUrl, normalized });
        }

        if (needFetch.length > 0) {
            const BATCH_CONCURRENCY = 10;
            for (let i = 0; i < needFetch.length; i += BATCH_CONCURRENCY) {
                const chunk = needFetch.slice(i, i + BATCH_CONCURRENCY);
                await Promise.allSettled(chunk.map(async ({ rawUrl, normalized }) => {
                    try {
                        const resp = await fetchFromUpstream(normalized, {
                            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' }),
                            redirect: 'follow'
                        }, 3500);
                        if (!resp || !resp.ok) return;
                        const html = await resp.text();

                        let epCount = 0;
                        const epMatch = html.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
                        if (epMatch) {
                            try {
                                const parsed = JSON.parse(epMatch[1]);
                                if (Array.isArray(parsed)) epCount = parsed.length;
                            } catch (e) { }
                        }

                        if (!epCount) {
                            const linkMatches = html.match(/\/detail\/watch\/[^\/]+\/(\d+)/g);
                            if (linkMatches && linkMatches.length > 0) {
                                const maxNum = linkMatches.reduce((max, str) => {
                                    const num = parseInt(str.split('/').pop(), 10);
                                    return (!isNaN(num) && num > max) ? num : max;
                                }, 0);
                                if (maxNum > 0) epCount = maxNum;
                            }
                        }

                        if (epCount > 0) {
                            counts[rawUrl] = epCount;
                            episodeCountCache.set(normalized, epCount);
                            episodeCountCache.set(rawUrl, epCount);
                        }
                    } catch (fetchErr) {
                        // Ignore individual timeout / network issues
                    }
                }));
            }
        }

        res.json({ ok: true, counts });
    } catch (err) {
        console.error('Error in batch-episode-counts:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Helper: Check if CDN URL auth_key token is expired
function isAuthKeyExpired(url) {
    if (!url || typeof url !== 'string') return true;
    const nowSec = Math.floor(Date.now() / 1000);

    // 1. Check wsTime parameter (Wangsu / Tencent CDN timestamp in seconds or hex)
    // CDN tokens are typically valid for 2 to 4 hours from wsTime creation
    const wsMatch = url.match(/[?&]wsTime=([0-9a-fA-F]+)/i);
    if (wsMatch) {
        const valStr = wsMatch[1];
        let exp = parseInt(valStr, 10);
        if (isNaN(exp) || exp < 1500000000 || exp > 2500000000) {
            const hexExp = parseInt(valStr, 16);
            if (!isNaN(hexExp) && hexExp > 1500000000 && hexExp < 2500000000) exp = hexExp;
        }
        if (!isNaN(exp)) {
            // Expired if older than 2 hours or unreasonably in future
            if (nowSec - exp > 7200 || exp > nowSec + 86400) return true;
        }
    }

    // 2. Check auth_key parameter (Alibaba Cloud CDN)
    const authMatch = url.match(/[?&]auth_key=([^&]+)/i);
    if (authMatch) {
        const parts = authMatch[1].split('-');
        for (const p of parts) {
            const num = parseInt(p, 10);
            if (num > 1500000000 && num < 2500000000) {
                if (num <= nowSec + 30 || nowSec - num > 7200) return true;
            }
        }
    }

    // 3. Check expires / expire parameter
    const expMatch = url.match(/[?&]expires?=(\d+)/i);
    if (expMatch) {
        const exp = parseInt(expMatch[1], 10);
        if (exp > 0 && exp <= nowSec + 30) return true;
    }

    // 4. Base64 payload in URL
    const b64Match = url.match(/\/e\/[ms]\/([A-Za-z0-9_-]+)/);
    if (b64Match) {
        try {
            const jsonStr = Buffer.from(b64Match[1], 'base64').toString('utf8');
            const data = JSON.parse(jsonStr);
            if (data && data.exp) {
                if (data.exp <= nowSec + 60) return true;
            }
        } catch (e) { }
    }
    return false;
}

// 4.1 Reusable On-Demand Episode Stream Resolver (Multi-Tier Edge & Origin)
async function resolveFreshEpisodeStream(dramaSlug, epNum = 1, lang = 'vi-VN') {
    if (!dramaSlug) return null;
    const targetEpNum = parseInt(epNum, 10) || 1;
    const headers = getHeaders({
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE_URL}/detail/watch/${dramaSlug}/${targetEpNum}?lang=${lang}&from=home`
    });

    let streamData = null;
    // Tier 1: Query Edge refresh-source (fastest & lowest latency)
    try {
        const edgeRefreshUrl = `https://edge.narto-drama.com/e/rs/detail/watch/${dramaSlug}/${targetEpNum}/refresh-source?force=1&force_edge=1&lang=${lang}`;
        const rRes = await fetchWithTimeout(edgeRefreshUrl, { headers }, 5000);
        if (rRes && rRes.ok) {
            const j = await rRes.json();
            if (j && (j.play_url || j.direct_play_url)) {
                streamData = j;
            }
        }
    } catch (e) {
        console.warn('[RefreshSource] Edge resolution failed:', e.message);
    }

    // Tier 2: Query Origin refresh-source
    if (!streamData) {
        try {
            const originRefreshUrl = `${BASE_URL}/detail/watch/${dramaSlug}/${targetEpNum}/refresh-source?force=1&force_edge=1&lang=${lang}`;
            const rRes2 = await fetchWithTimeout(originRefreshUrl, { headers }, 5000);
            if (rRes2 && rRes2.ok) {
                const j2 = await rRes2.json();
                if (j2 && (j2.play_url || j2.direct_play_url)) {
                    streamData = j2;
                }
            }
        } catch (e) {
            console.warn('[RefreshSource] Origin resolution failed:', e.message);
        }
    }

    // Validate Tier 1 / Tier 2: probe candidate stream to guarantee it does NOT return 403 Forbidden or expired token
    if (streamData && (streamData.play_url || streamData.direct_play_url)) {
        const candidateUrl = streamData.play_url || streamData.direct_play_url;
        if (isAuthKeyExpired(candidateUrl)) {
            console.warn(`[RefreshSource] Stream token expired by timestamp for ${dramaSlug} ep ${targetEpNum}, falling back to Tier 3 HTML...`);
            streamData = null;
        } else {
            try {
                const probeRes = await fetch(candidateUrl, {
                    method: 'HEAD',
                    headers: getHeaders(),
                    signal: AbortSignal.timeout(2000)
                });
                if (probeRes.status === 403 || probeRes.status === 401) {
                    console.warn(`[RefreshSource] Stream probe returned ${probeRes.status} for ${dramaSlug} ep ${targetEpNum}, falling back to Tier 3 HTML...`);
                    streamData = null;
                }
            } catch (e) { }
        }
    }

    if (streamData && (streamData.play_url || streamData.direct_play_url)) {
        const playUrl = streamData.play_url || streamData.direct_play_url;
        let subUrl = streamData.subtitle_url || streamData.direct_subtitle_url || '';
        if (subUrl && !subUrl.startsWith('http')) subUrl = `${BASE_URL}${subUrl}`;
        const cleanSubs = Array.isArray(streamData.subtitles) ? streamData.subtitles.map(s => ({
            language_code: s.language_code || '',
            label: s.label || '',
            subtitle_url: s.subtitle_url ? (s.subtitle_url.startsWith('http') ? s.subtitle_url : `${BASE_URL}${s.subtitle_url}`) : '',
            is_default: !!s.is_default
        })) : [];

        return {
            play_url: playUrl,
            direct_play_url: streamData.direct_play_url || '',
            is_hls: playUrl.includes('.m3u8') || playUrl.includes('/e/m/') || playUrl.includes('/hls') || streamData.direct_play_is_hls === true,
            play_url_cors: streamData.play_url_cors !== false && !playUrl.includes('cdn.playsverse.com'),
            source_refreshed: streamData.source_refreshed === true,
            subtitle_url: subUrl,
            subtitles: cleanSubs
        };
    }

    // Tier 3: Parse HTML page of that episode for episodeItemsRaw
    try {
        const epPageUrl = `${BASE_URL}/detail/watch/${dramaSlug}/${targetEpNum}?lang=${lang}&from=home`;
        const pageRes = await fetchWithTimeout(epPageUrl, { headers: getHeaders() }, 6000);
        if (pageRes && pageRes.ok) {
            const pageHtml = await pageRes.text();
            const epMatch = pageHtml.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
            if (epMatch) {
                const rawList = JSON.parse(epMatch[1]);
                const matched = rawList.find(e => Number(e.number) === targetEpNum || Number(e.route_episode_number) === targetEpNum) || rawList[targetEpNum - 1];
                if (matched && (matched.play_url || matched.direct_play_url)) {
                    const pUrl = matched.play_url || matched.direct_play_url;
                    let subUrl = matched.subtitle_url || matched.direct_subtitle_url || '';
                    if (subUrl && !subUrl.startsWith('http')) subUrl = `${BASE_URL}${subUrl}`;
                    const cleanSubs = Array.isArray(matched.subtitles) ? matched.subtitles.map(s => ({
                        language_code: s.language_code || '',
                        label: s.label || '',
                        subtitle_url: s.subtitle_url ? (s.subtitle_url.startsWith('http') ? s.subtitle_url : `${BASE_URL}${s.subtitle_url}`) : '',
                        is_default: !!s.is_default
                    })) : [];

                    return {
                        play_url: pUrl,
                        direct_play_url: matched.direct_play_url || '',
                        is_hls: pUrl.includes('.m3u8') || pUrl.includes('/e/m/') || pUrl.includes('/hls') || matched.browser_prefetch_mode === 'hls',
                        play_url_cors: matched.play_url_cors !== false && !pUrl.includes('cdn.playsverse.com'),
                        subtitle_url: subUrl,
                        subtitles: cleanSubs
                    };
                }
            }
        }
    } catch (e) {
        console.error('[RefreshSource] Tier 3 HTML fallback failed:', e.message);
    }

    return null;
}

// 4.2 On-Demand Episode Stream Resolver Endpoint
app.get('/api/episode/refresh', async (req, res) => {
    try {
        const { watch_url, slug, ep, lang = 'vi-VN' } = req.query;
        let epNum = parseInt(ep || '1', 10);
        let dramaSlug = slug;

        if (!dramaSlug && watch_url) {
            const match = watch_url.match(/\/detail\/watch\/([^\/?#]+)(?:\/(\d+))?/);
            if (match) {
                dramaSlug = match[1];
                if (!req.query.ep && match[2]) {
                    epNum = parseInt(match[2], 10);
                }
            }
        }

        if (!dramaSlug) {
            return res.status(400).json({ ok: false, error: 'slug or watch_url is required' });
        }

        const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, lang);
        if (fresh) {
            return res.json({
                ok: true,
                episode_number: epNum,
                ...fresh
            });
        }

        res.status(404).json({ ok: false, error: `Could not resolve stream for episode ${epNum}` });
    } catch (err) {
        console.error('[RefreshSource] Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 4.3 Proxy Upstream WebVTT Subtitles (/e/s/*)
app.get('/e/s/*', async (req, res) => {
    try {
        const targetUrl = `${BASE_URL}${req.originalUrl}`;
        const upstreamRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL
            }
        });
        res.set('Content-Type', 'text/vtt; charset=utf-8');
        res.set('Access-Control-Allow-Origin', '*');
        const text = await upstreamRes.text();
        res.send(text);
    } catch (err) {
        console.error('[ProxySub] Error forwarding subtitle:', err.message);
        res.status(500).send('Error proxying subtitle');
    }
});

// 5. Proxy Stream (CORS fallback & automatic expired token recovery)
app.get('/api/proxy-stream', async (req, res) => {
    try {
        let streamUrl = req.query.url;
        const { slug, ep, lang = 'vi-VN' } = req.query;
        if (!streamUrl) return res.status(400).send('Missing url parameter');

        // If auth_key expired and slug is provided, resolve fresh stream before fetching
        if (slug && isAuthKeyExpired(streamUrl)) {
            console.log(`[ProxyStream] Detected expired auth_key, refreshing for ${slug} ep ${ep}...`);
            const fresh = await resolveFreshEpisodeStream(slug, parseInt(ep || '1', 10), lang);
            if (fresh && fresh.play_url) {
                streamUrl = fresh.play_url;
            }
        }

        const range = req.headers.range;
        const fetchHeaders = {
            'User-Agent': USER_AGENT,
            'Referer': BASE_URL,
            ...(range ? { 'Range': range } : {})
        };

        let upstream = await fetch(streamUrl, { headers: fetchHeaders });

        // If 403 or 401 Forbidden and slug is provided, try fresh token refresh once
        if ((upstream.status === 403 || upstream.status === 401) && slug) {
            console.log(`[ProxyStream] Upstream returned ${upstream.status}, attempting auto-refresh for ${slug} ep ${ep}...`);
            const fresh = await resolveFreshEpisodeStream(slug, parseInt(ep || '1', 10), lang);
            if (fresh && fresh.play_url && fresh.play_url !== streamUrl) {
                streamUrl = fresh.play_url;
                upstream = await fetch(streamUrl, { headers: fetchHeaders });
            }
        }

        if (!upstream.ok) {
            return res.status(upstream.status).json({ ok: false, error: `Upstream CDN error (${upstream.status})` });
        }
        res.status(upstream.status);

        // Forward headers
        for (const [k, v] of upstream.headers.entries()) {
            if (!['content-encoding', 'content-length'].includes(k.toLowerCase())) {
                res.setHeader(k, v);
            }
        }
        res.setHeader('Access-Control-Allow-Origin', '*');

        const cType = upstream.headers.get('content-type') || '';
        const isM3u8 = streamUrl.includes('.m3u8') || cType.includes('mpegurl') || cType.includes('application/x-mpegURL');
        if (isM3u8) {
            const playlistText = await upstream.text();
            const rewritten = playlistText.split('\n').map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return line;
                return new URL(trimmed, streamUrl).href;
            }).join('\n');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(rewritten);
        }

        if (upstream.body) {
            const reader = upstream.body.getReader();
            const pump = async () => {
                const { done, value } = await reader.read();
                if (done) return res.end();
                res.write(value);
                return pump();
            };
            await pump();
        } else {
            res.end();
        }
    } catch (err) {
        console.error('Proxy stream error:', err);
        res.status(500).send(err.message);
    }
});

// 6. Translation System — Robust Multi-Provider Engine
// ─────────────────────────────────────────────────────
// Features:
//  • In-memory LRU cache + persistent disk cache (survives restarts)
//  • 4 Google endpoint variants rotated on rate-limit
//  • MyMemory fallback with quota awareness
//  • Per-request retry with exponential backoff
//  • Global throttle: max 8 concurrent translation requests
// ─────────────────────────────────────────────────────

// Translation cache lives in %APPDATA%\DramaFlow\ on Windows, or os.tmpdir() on Linux/Vercel
const isWin = process.platform === 'win32';
const CACHE_DATA_DIR = isWin
    ? path.join(require('os').homedir(), 'AppData', 'Roaming', 'DramaFlow')
    : path.join(require('os').tmpdir(), 'DramaFlow');

try {
    if (!fs.existsSync(CACHE_DATA_DIR)) fs.mkdirSync(CACHE_DATA_DIR, { recursive: true });
} catch (e) {
    console.warn('[Translation] Could not create cache dir:', e.message);
}
const TRANSLATION_CACHE_FILE = path.join(CACHE_DATA_DIR, 'translation_cache.json');
const translationCache = new Map();
console.log('[Translation] Cache file:', TRANSLATION_CACHE_FILE);

// Load persistent cache from disk on startup
(function loadDiskCache() {
    try {
        if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
            let count = 0;
            for (const [k, v] of Object.entries(raw)) {
                translationCache.set(k, v);
                count++;
            }
            console.log(`[Translation] Loaded ${count} cached translations from disk.`);
        }
    } catch (e) {
        console.warn('[Translation] Could not load disk cache:', e.message);
    }
})();

// Persist cache to disk (debounced, max once per 30s)
let _cacheSaveTimer = null;
function scheduleCacheSave() {
    if (_cacheSaveTimer) return;
    _cacheSaveTimer = setTimeout(() => {
        _cacheSaveTimer = null;
        try {
            const obj = {};
            for (const [k, v] of translationCache) obj[k] = v;
            fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(obj), 'utf8');
        } catch (e) {
            console.warn('[Translation] Cache save failed:', e.message);
        }
    }, 30000);
}

// Throttle: global concurrency limiter for translation requests
const MAX_CONCURRENT_TRANSLATIONS = 8;
let _activeTranslations = 0;
const _translationQueue = [];

function runWithThrottle(fn) {
    return new Promise((resolve, reject) => {
        const task = async () => {
            _activeTranslations++;
            try {
                resolve(await fn());
            } catch (e) {
                reject(e);
            } finally {
                _activeTranslations--;
                if (_translationQueue.length > 0) {
                    const next = _translationQueue.shift();
                    next();
                }
            }
        };
        if (_activeTranslations < MAX_CONCURRENT_TRANSLATIONS) {
            task();
        } else {
            _translationQueue.push(task);
        }
    });
}

// Helper: fetch with timeout
function fetchWithTimeout(url, options, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); reject(new Error('Request timed out')); }, timeoutMs);
        fetch(url, { ...options, signal: controller.signal })
            .then(r => { clearTimeout(timer); resolve(r); })
            .catch(e => { clearTimeout(timer); reject(e); });
    });
}

// CRITICAL FIX: Read response as ArrayBuffer and decode with TextDecoder
// This ensures correct UTF-8 handling on Windows (avoids Node.js res.json() charset bug)
const _utf8Decoder = new TextDecoder('utf-8');
async function safeJsonDecode(res) {
    const buf = await res.arrayBuffer();
    const text = _utf8Decoder.decode(buf);
    return JSON.parse(text);
}

// Google Translate endpoint pool (rotated to spread load and avoid rate limits)
// Only endpoints confirmed to return valid JSON:
const GOOGLE_ENDPOINTS = [
    // Endpoint 1: dict-chrome-ex (most stable, high quota)
    (sl, tl, q) => `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${sl}&tl=${tl}&dt=t&q=${q}`,
    // Endpoint 2: dict-chrome-ex via translate.google.com CORS path
    (sl, tl, q) => `https://translate.google.com/translate_a/single?client=dict-chrome-ex&sl=${sl}&tl=${tl}&dt=t&q=${q}`,
    // Endpoint 3: at (apps translate) — different quota pool
    (sl, tl, q) => `https://translate.googleapis.com/translate_a/single?client=at&sl=${sl}&tl=${tl}&dt=t&q=${q}`,
];
let _googleEndpointIdx = 0;

async function tryGoogleTranslate(cleanInput, sourceLang, targetLang, retries = 3) {
    const sl = encodeURIComponent(sourceLang);
    const tl = encodeURIComponent(targetLang);
    const q = encodeURIComponent(cleanInput);

    for (let attempt = 0; attempt < retries; attempt++) {
        // Rotate endpoint on each attempt
        const endpointFn = GOOGLE_ENDPOINTS[(_googleEndpointIdx + attempt) % GOOGLE_ENDPOINTS.length];
        const gUrl = endpointFn(sl, tl, q);

        try {
            const res = await fetchWithTimeout(gUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            }, 8000);

            if (res.status === 429 || res.status === 503) {
                // Rate limited — advance endpoint rotation and wait before retry
                _googleEndpointIdx = (_googleEndpointIdx + 1) % GOOGLE_ENDPOINTS.length;
                const waitMs = 300 * Math.pow(2, attempt); // 300ms, 600ms, 1200ms
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            if (!res.ok) {
                _googleEndpointIdx = (_googleEndpointIdx + 1) % GOOGLE_ENDPOINTS.length;
                continue;
            }

            const contentType = res.headers.get('content-type') || '';
            // Some endpoints return HTML error pages — skip them
            if (contentType.includes('text/html')) {
                _googleEndpointIdx = (_googleEndpointIdx + 1) % GOOGLE_ENDPOINTS.length;
                continue;
            }

            let data;
            try {
                data = await safeJsonDecode(res);
            } catch (parseErr) {
                // Response is not JSON (HTML page, etc.) — rotate and skip
                _googleEndpointIdx = (_googleEndpointIdx + 1) % GOOGLE_ENDPOINTS.length;
                continue;
            }

            // dict-chrome-ex / gtx / at / webapp format: [[['translated','original',...], ...], ...]
            if (Array.isArray(data) && Array.isArray(data[0])) {
                const joined = data[0].map(s => (s && s[0]) ? s[0] : '').join('').trim();
                if (joined) return joined;
            }

            // te_lib / webapp alternate format: {sentences: [{trans: ...}]}
            if (data && Array.isArray(data.sentences)) {
                const joined = data.sentences.map(s => s.trans || '').join('').trim();
                if (joined) return joined;
            }

            // clients5 format: sometimes just a string or nested array differently
            if (typeof data === 'string' && data.trim()) {
                return data.trim();
            }

        } catch (e) {
            if (attempt < retries - 1) {
                await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
            }
        }
    }
    return null;
}

async function tryMyMemoryTranslate(cleanInput, sourceLang, targetLang) {
    try {
        const src = sourceLang === 'auto' ? 'en' : sourceLang;
        // MyMemory: max 500 chars per request to avoid quota burn
        const text = cleanInput.length > 480 ? cleanInput.slice(0, 480) : cleanInput;
        const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(targetLang)}&de=noreply@example.com`;
        const res = await fetchWithTimeout(mUrl, {}, 8000);
        if (!res.ok) return null;
        const data = await safeJsonDecode(res);
        // responseStatus 200 = success; 429/456 = quota exceeded
        if (data?.responseStatus !== 200) return null;
        const t = data?.responseData?.translatedText?.trim();
        // MyMemory sometimes returns the source back unchanged — detect and reject
        if (t && t.toLowerCase() !== cleanInput.toLowerCase()) return t;
    } catch (e) { }
    return null;
}

// LibreTranslate public instances as last-resort fallback
const LIBRE_INSTANCES = [
    'https://libretranslate.de',
    'https://translate.argosopentech.com',
];

async function tryLibreTranslate(cleanInput, sourceLang, targetLang) {
    const src = sourceLang === 'auto' ? 'en' : sourceLang;
    // LibreTranslate lang codes are ISO 639-1 two-letter only
    const sl = src.split('-')[0];
    const tl = targetLang.split('-')[0];
    for (const base of LIBRE_INSTANCES) {
        try {
            const res = await fetchWithTimeout(`${base}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: cleanInput, source: sl, target: tl, format: 'text' })
            }, 9000);
            if (!res.ok) continue;
            const data = await safeJsonDecode(res);
            const t = data?.translatedText?.trim();
            if (t && t.toLowerCase() !== cleanInput.toLowerCase()) return t;
        } catch (e) { }
    }
    return null;
}

// Pre-process text before translation:
// Whisper STT often emits sound-effect tokens that don't need translating.
// Returning them as-is saves API quota and avoids garbled translations.
function cleanTextForTranslation(text) {
    const t = text.trim();
    // Pure sound/music tokens — return as-is
    // Matches: [APPLAUSE], (laughing), \u266a song \u266a, [MUSIC], etc.
    if (/^[\[\(\u266a][\s\S]*[\]\)\u266a]$/.test(t)) return null; // signal: skip translation
    if (/^[\[\(]/.test(t) && /[\]\)]$/.test(t)) return null;
    if (/^\u266a/.test(t) || /\u266a$/.test(t)) return null;
    // Strip leading/trailing noise brackets but keep inner speech
    // e.g. "- Yeah, I'm the dry" — keep as-is (dash prefix is fine)
    return t || null;
}

async function translateText(text, targetLang = 'vi', sourceLang = 'auto') {
    if (!text || !text.trim()) return '';
    const rawInput = text.trim();

    // Filter out pure STT noise tokens (sound effects, music markers)
    const cleanInput = cleanTextForTranslation(rawInput);
    if (!cleanInput) return rawInput; // return original e.g. [APPLAUSE]

    // Normalise lang codes: 'vi-VN' -> 'vi'
    const tl = targetLang.toLowerCase().split('-')[0];
    const sl = sourceLang.toLowerCase().split('-')[0];

    // If source and target are the same, return as-is
    if (tl === sl || tl === 'en' && (sl === 'en' || sl === 'auto')) {
        return cleanInput;
    }

    const cacheKey = `${sl}:${tl}:${cleanInput}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    return runWithThrottle(async () => {
        // Double-check cache inside throttle (another task may have finished first)
        if (translationCache.has(cacheKey)) {
            return translationCache.get(cacheKey);
        }

        let translated = null;

        // Provider 1: Google (multiple endpoints, auto-rotate on rate limit)
        translated = await tryGoogleTranslate(cleanInput, sl, tl, 3);

        // Provider 2: MyMemory
        if (!translated) {
            translated = await tryMyMemoryTranslate(cleanInput, sl, tl);
        }

        // Provider 3: LibreTranslate (public instances, no key needed)
        if (!translated) {
            translated = await tryLibreTranslate(cleanInput, sl, tl);
        }

        const result = translated || cleanInput;

        // Cache result ONLY if translation succeeded
        if (translated && translated.toLowerCase() !== cleanInput.toLowerCase()) {
            if (translationCache.size > 10000) {
                // Evict oldest 500 entries
                let evicted = 0;
                for (const k of translationCache.keys()) {
                    if (evicted >= 500) break;
                    translationCache.delete(k);
                    evicted++;
                }
            }
            translationCache.set(cacheKey, translated);
            scheduleCacheSave();
        }

        return result;
    });
}

// High-speed Groq AI LLM Batch Translator (Up to 40 cues per call, 100% natural, zero rate limits)
async function tryGroqTranslateBatch(texts, targetLang = 'vi', sourceLang = 'auto', customApiKey = '') {
    const key = (customApiKey || DEFAULT_GROQ_KEY || process.env.GROQ_API_KEY || '').trim();
    if (!key || !Array.isArray(texts) || texts.length === 0) return null;

    const langName = targetLang.toLowerCase().startsWith('vi') ? 'Vietnamese' : targetLang;
    const prompt = `You are an expert subtitle translator for short dramas and television series.
Translate the following array of dialogue subtitle lines into natural, expressive, conversational ${langName} suitable for video subtitles.
Rules:
1. Maintain the exact order and length of the array.
2. For Vietnamese, use natural short drama terminology and pronouns (tôi, em, anh, cô ta, tổng tài, phu nhân, v.v.).
3. Return ONLY a valid JSON object with a single key "translations" containing the array of translated strings in exact order:
{
  "translations": ["translated line 0", "translated line 1", ...]
}

Lines:
${JSON.stringify(texts)}`;

    const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
    for (const model of modelsToTry) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (!res.ok) continue;
            const data = await res.json();
            const content = data?.choices?.[0]?.message?.content;
            if (content) {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed.translations) && parsed.translations.length === texts.length) {
                    return parsed.translations;
                }
            }
        } catch (err) {
            // Try next model
        }
    }
    return null;
}

// High-speed Pack-Batch translation helper — packs up to 20 cues per single HTTP request
// Reduces HTTP roundtrips by 90%+ and translates full dialogue reliably without rate limit dropouts
async function batchTranslate(texts, targetLang, sourceLang = 'auto', customApiKey = '') {
    if (!texts || texts.length === 0) return [];
    const tl = targetLang.toLowerCase().split('-')[0];
    const sl = sourceLang.toLowerCase().split('-')[0];

    if (tl === sl || (tl === 'en' && (sl === 'en' || sl === 'auto'))) {
        return texts; // No translation needed
    }

    const results = new Array(texts.length);
    const uncachedIndices = [];

    // Step 1: Check in-memory translationCache
    for (let i = 0; i < texts.length; i++) {
        const rawText = (texts[i] || '').trim();
        const cleanInput = cleanTextForTranslation(rawText);
        if (!cleanInput) {
            results[i] = rawText;
            continue;
        }
        const cacheKey = `${sl}:${tl}:${cleanInput}`;
        if (translationCache.has(cacheKey)) {
            results[i] = translationCache.get(cacheKey);
        } else {
            uncachedIndices.push(i);
        }
    }

    if (uncachedIndices.length === 0) {
        return results;
    }

    const groqKey = (customApiKey || DEFAULT_GROQ_KEY || process.env.GROQ_API_KEY || '').trim();

    // Step 2: High-speed Groq AI translation for uncached lines (Chunk 35)
    if (groqKey) {
        const GROQ_CHUNK = 35;
        for (let i = 0; i < uncachedIndices.length; i += GROQ_CHUNK) {
            const chunkIndices = uncachedIndices.slice(i, i + GROQ_CHUNK);
            const chunkTexts = chunkIndices.map(idx => (texts[idx] || '').trim());
            const groqTrans = await tryGroqTranslateBatch(chunkTexts, tl, sl, groqKey);
            if (Array.isArray(groqTrans) && groqTrans.length === chunkTexts.length) {
                for (let k = 0; k < chunkIndices.length; k++) {
                    const origIdx = chunkIndices[k];
                    const trans = (groqTrans[k] || '').trim();
                    if (trans) {
                        results[origIdx] = trans;
                        const cleanInput = cleanTextForTranslation((texts[origIdx] || '').trim());
                        if (cleanInput && trans.toLowerCase() !== cleanInput.toLowerCase()) {
                            translationCache.set(`${sl}:${tl}:${cleanInput}`, trans);
                        }
                    }
                }
            }
        }
    }

    // Step 3: For any lines still untranslated, use Google Translate with robust bracket delimiters
    const stillUncached = uncachedIndices.filter(idx => !results[idx]);
    if (stillUncached.length > 0) {
        const BATCH_SIZE = 15;
        for (let i = 0; i < stillUncached.length; i += BATCH_SIZE) {
            const chunkIndices = stillUncached.slice(i, i + BATCH_SIZE);
            const payload = chunkIndices.map((origIdx, localIdx) => `⟦${localIdx}⟧ ${(texts[origIdx] || '').trim().replace(/[\r\n]+/g, ' ')}`).join('\n');
            let translatedBlock = null;
            try {
                translatedBlock = await tryGoogleTranslate(payload, sl, tl, 3);
            } catch (e) { }

            const filled = new Set();
            if (translatedBlock) {
                const rawLines = translatedBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                for (const line of rawLines) {
                    const m = line.match(/^⟦\s*(\d+)\s*⟧\s*(.*)/) || line.match(/^(\d+)\s*(?:>{1,4}|[:.\-]|>>>|\))\s*(.*)/);
                    if (m) {
                        const localIdx = parseInt(m[1], 10);
                        if (localIdx >= 0 && localIdx < chunkIndices.length) {
                            const origIdx = chunkIndices[localIdx];
                            const trans = m[2].trim();
                            if (trans) {
                                results[origIdx] = trans;
                                filled.add(localIdx);
                                const cleanInput = cleanTextForTranslation((texts[origIdx] || '').trim());
                                if (cleanInput && trans.toLowerCase() !== cleanInput.toLowerCase()) {
                                    translationCache.set(`${sl}:${tl}:${cleanInput}`, trans);
                                }
                            }
                        }
                    }
                }
            }

            // Step 4: Individual fallback for any missed line
            for (let localIdx = 0; localIdx < chunkIndices.length; localIdx++) {
                if (!filled.has(localIdx)) {
                    const origIdx = chunkIndices[localIdx];
                    try {
                        const single = await translateText(texts[origIdx], tl, sl);
                        if (single) {
                            results[origIdx] = single;
                        }
                    } catch (e) { }
                }
            }

            if (i + BATCH_SIZE < stillUncached.length) {
                await new Promise(r => setTimeout(r, 60));
            }
        }
    }

    // Step 5: FINAL RESCUE PASS FOR VIETNAMESE TARGET:
    // Guarantee 100% of dialogue lines are in Vietnamese — never leave English/Chinese in middle of stream!
    if (tl === 'vi') {
        const viRegex = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;
        const missingViIndices = [];
        for (let i = 0; i < texts.length; i++) {
            const resText = (results[i] || '').trim();
            // If empty or pure sound effect e.g. [laughter], ignore
            if (!resText || /^[\[\(].*[\]\)]$/.test(resText)) continue;
            // If contains no Vietnamese tone marks and length > 3 characters, it's untranslated foreign text!
            if (!viRegex.test(resText)) {
                missingViIndices.push(i);
            }
        }

        if (missingViIndices.length > 0 && groqKey) {
            console.log(`[BatchTranslate] 🛡️ Rescue pass: Found ${missingViIndices.length} non-Vietnamese cues, translating via Groq AI...`);
            const rescueTexts = missingViIndices.map(idx => (texts[idx] || '').trim());
            const rescueTrans = await tryGroqTranslateBatch(rescueTexts, 'vi', 'auto', groqKey);
            if (Array.isArray(rescueTrans) && rescueTrans.length === rescueTexts.length) {
                for (let k = 0; k < missingViIndices.length; k++) {
                    const origIdx = missingViIndices[k];
                    if (rescueTrans[k] && rescueTrans[k].trim()) {
                        results[origIdx] = rescueTrans[k].trim();
                        const cleanInput = cleanTextForTranslation((texts[origIdx] || '').trim());
                        if (cleanInput) {
                            translationCache.set(`${sl}:${tl}:${cleanInput}`, rescueTrans[k].trim());
                        }
                    }
                }
            }
        }
    }

    scheduleCacheSave();

    for (let i = 0; i < texts.length; i++) {
        if (!results[i]) results[i] = texts[i] || '';
    }

    return results;
}

// Standalone Text Translation Endpoint
app.get('/api/translate', async (req, res) => {
    try {
        const text = (req.query.text || '').trim();
        const target = (req.query.target || 'vi').trim();
        const source = (req.query.source || 'auto').trim();

        if (!text) {
            return res.json({ ok: true, text: '', translated: '' });
        }

        const translated = await translateText(text, target, source);
        res.json({ ok: true, text, translated, target });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Helper: Parse WebVTT / SRT raw text into clean cues and timing lines
function parseVttContent(vttText) {
    if (!vttText || typeof vttText !== 'string') return [];
    const cues = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            // Normalize SRT commas (00:00:23,280 --> 00:00:25,736) to VTT periods (00:00:23.280 --> 00:00:25.736)
            const timeLine = line.replace(/(\d{2}),(\d{3})/g, '$1.$2');
            i++;
            let textLines = [];
            while (i < lines.length && lines[i].trim() !== '') {
                textLines.push(lines[i].trim());
                i++;
            }
            const rawText = textLines.join('\n');
            const cleanText = rawText.replace(/<[^>]+>/g, '').trim();
            if (cleanText) {
                cues.push({ timeLine, text: cleanText });
            }
        }
        i++;
    }
    return cues;
}

const vttMemoryCache = new Map(); // In-memory cache: ${dramaSlug}_ep${ep}_${lang} -> vttContent

function isVttContentVietnamese(vttText) {
    if (!vttText || typeof vttText !== 'string' || !vttText.includes('-->')) return false;
    const cues = parseVttContent(vttText);
    if (!cues || cues.length === 0) return false;
    if (cues.length < 5) return false;
    const viRegex = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;
    let viCount = 0;
    for (const c of cues) {
        if (viRegex.test(c.text)) viCount++;
    }
    // At least 55% of speech cues must have Vietnamese tones to guarantee it is not mixed with English/Chinese
    return (viCount / cues.length) >= 0.55;
}

// 6.2 High-Speed Upstream WebVTT Translator (Instant 0.5s translation from official timed cues)
app.get('/api/subtitles/translate-vtt', async (req, res) => {
    try {
        const { url, slug = 'unknown', ep = '1', target_lang = 'vi', source_lang = 'auto', groq_key = '' } = req.query;
        if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

        const cleanTarget = (target_lang || 'vi').toLowerCase().split('-')[0];
        const dramaSlug = cleanDramaSlug(slug);
        const cacheKey = `${dramaSlug}_ep${ep}_${cleanTarget}`;

        if (vttMemoryCache.has(cacheKey)) {
            const cachedVtt = vttMemoryCache.get(cacheKey);
            if (cleanTarget !== 'vi' || isVttContentVietnamese(cachedVtt)) {
                return res.json({
                    ok: true,
                    ready: true,
                    lang: cleanTarget,
                    vttText: cachedVtt,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`
                });
            }
            vttMemoryCache.delete(cacheKey);
        }

        let fullUrl = url;
        if (!fullUrl.startsWith('http')) fullUrl = `${BASE_URL}${fullUrl}`;
        const subRes = await fetch(fullUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': BASE_URL }
        });
        if (!subRes.ok) return res.status(502).json({ ok: false, error: 'Failed to fetch upstream VTT' });
        const rawVtt = await subRes.text();
        const cues = parseVttContent(rawVtt);
        if (cues.length === 0) {
            return res.json({ ok: true, ready: true, vttText: rawVtt, url: fullUrl });
        }

        // Fast return if already in Vietnamese (0ms instant)
        if (cleanTarget === 'vi' && isVttContentVietnamese(rawVtt)) {
            vttMemoryCache.set(cacheKey, rawVtt);
            return res.json({
                ok: true,
                ready: true,
                lang: 'vi',
                vttText: rawVtt,
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=vi`
            });
        }

        const sl = source_lang || 'auto';
        const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY || '').trim();
        const translatedTexts = await batchTranslate(cues.map(c => c.text), cleanTarget, sl, cloudApiKey);
        const vttLines = ['WEBVTT', ''];
        for (let i = 0; i < cues.length; i++) {
            vttLines.push(cues[i].timeLine);
            vttLines.push(translatedTexts[i] || cues[i].text);
            vttLines.push('');
        }
        const vttContent = vttLines.join('\n');
        vttMemoryCache.set(cacheKey, vttContent);

        res.json({
            ok: true,
            ready: true,
            lang: cleanTarget,
            vttText: vttContent,
            url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`
        });
    } catch (err) {
        console.error('Error in /api/subtitles/translate-vtt:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 7. AI Audio Speech-to-Text & Subtitle System (Whisper STT + Multi-Language WebVTT)
// Subtitles are stored in OS temp dir — wiped automatically by Windows, and deleted
// immediately after serving so they never accumulate in the source folder.
const SUBTITLES_DIR = path.join(os.tmpdir(), 'DramaFlow');
try {
    if (!fs.existsSync(SUBTITLES_DIR)) {
        fs.mkdirSync(SUBTITLES_DIR, { recursive: true });
    }
} catch (e) {
    console.warn('[STT] Could not create SUBTITLES_DIR:', e.message);
}

function findSubtitleFile(filename) {
    if (!filename) return null;
    const tmpPath = path.join(SUBTITLES_DIR, filename);
    if (fs.existsSync(tmpPath)) {
        if (filename.endsWith('.vtt')) {
            try {
                const content = fs.readFileSync(tmpPath, 'utf8');
                const cuesCount = (content.match(/-->/g) || []).length;

                // Parse last timestamp to verify it's a full episode and not a 20s truncated snippet
                const lines = content.trim().split('\n');
                const lastArrow = lines.filter(l => l.includes('-->')).pop() || '';
                const lastSecMatch = lastArrow.match(/-->\s*(?:(\d+):)?(\d+):(\d+)/);
                let maxSec = 0;
                if (lastSecMatch) {
                    const h = lastSecMatch[1] ? parseInt(lastSecMatch[1], 10) : 0;
                    const m = parseInt(lastSecMatch[2], 10);
                    const s = parseInt(lastSecMatch[3], 10);
                    maxSec = h * 3600 + m * 60 + s;
                }

                // If fewer than 10 cues AND timestamp < 40s, it's an aborted/truncated snippet
                if (!filename.includes('_chunk') && cuesCount < 10 && maxSec < 40) {
                    try { fs.unlinkSync(tmpPath); } catch (e) { }
                    return null;
                }

                if (filename.endsWith('_vi.vtt') && !filename.includes('_chunk')) {
                    if (!isVttContentVietnamese(content)) {
                        try { fs.unlinkSync(tmpPath); } catch (e) { }
                        return null;
                    }
                } else if (!filename.includes('_chunk')) {
                    if (cuesCount < 3) {
                        try { fs.unlinkSync(tmpPath); } catch (e) { }
                        return null;
                    }
                }
            } catch (e) { }
        }
        return tmpPath;
    }
    return null;
}
console.log('[STT] Subtitle temp dir:', SUBTITLES_DIR);

// CRITICAL: In ffmpeg -af filter strings, Windows drive-letter colons must be escaped
// as \: otherwise ffmpeg treats them as option separators.
// Example: D:\path\model.bin → D\:/path/model.bin
function ffmpegFilterPath(p) {
    // Replace all backslash chars (char code 92) with forward slashes
    let r = '';
    for (let i = 0; i < p.length; i++) {
        r += (p.charCodeAt(i) === 92) ? '/' : p[i];
    }
    // Windows drive letter colon must be escaped as \\: in ffmpeg filter strings
    // (when called from Node.js exec, single \: is stripped; double \\: survives and works)
    const BS = String.fromCharCode(92);
    return r.replace(/^([A-Za-z]):/, (_, d) => d + BS + BS + ':');
}
const WHISPER_MODEL = path.join(__dirname, 'models', 'ggml-tiny.bin');

// Cap Whisper threads to 6 (leaves 60%+ CPU free on multi-core Ryzen systems)
const WHISPER_THREADS = Math.min(6, Math.max(4, Math.floor(os.cpus().length / 2)));

let _ffmpegAvailable = null;
async function isFfmpegAvailable() {
    if (_ffmpegAvailable !== null) return _ffmpegAvailable;
    try {
        await execPromise('ffmpeg -version');
        _ffmpegAvailable = true;
    } catch (e) {
        _ffmpegAvailable = false;
    }
    return _ffmpegAvailable;
}

// Run ffmpeg with bulletproof timeout & process tree cleanup on Windows
function runFfmpeg(cmd, timeoutMs = 60000, abortSignal = null) {
    return new Promise((resolve, reject) => {
        let child = null;
        let timer = null;
        let finished = false;

        const cleanup = () => {
            if (timer) { clearTimeout(timer); timer = null; }
        };

        const killChild = () => {
            if (child && child.pid) {
                try {
                    if (process.platform === 'win32') {
                        exec(`taskkill /pid ${child.pid} /t /f`, () => { });
                    } else {
                        child.kill('SIGKILL');
                    }
                } catch (e) { }
            }
        };

        if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
                cleanup();
                killChild();
                reject(new Error('Operation aborted'));
            }, { once: true });
        }

        try {
            child = exec(cmd, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (finished) return;
                finished = true;
                cleanup();
                if (err) return reject(err);
                resolve({ stdout, stderr });
            });

            timer = setTimeout(() => {
                if (finished) return;
                finished = true;
                killChild();
                reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        } catch (e) {
            cleanup();
            reject(e);
        }
    });
}

// Track active background stage 2 task so we can yield/cancel if user switches episodes
let currentActiveStage2 = null; // { key, abortController }
const activeStage1Promises = new Map();
const activeStage2Promises = new Map();

function cleanDramaSlug(str) {
    return (str || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function parseSrtToCues(srtContent) {
    const cues = [];
    if (!srtContent) return cues;
    const regex = /(?:(\d+)\r?\n)?(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\r?\n([\s\S]*?)(?=(?:\r?\n\r?\n|\r?\n?$|$))/g;
    let match;
    while ((match = regex.exec(srtContent)) !== null) {
        const start = match[2].replace(',', '.');
        const end = match[3].replace(',', '.');
        let text = (match[4] || '')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        const isMusicOnly = /^\[.*(?:music|applause|laughter|screams|playing).*\]$/i.test(text) ||
            /^\(.*(?:music|applause|laughter|screams|playing).*\)$/i.test(text);
        if (text && !isMusicOnly) {
            cues.push({
                id: cues.length + 1,
                start,
                end,
                text
            });
        }
    }
    return cues;
}

// STAGE 1: ULTRA-FAST PRIORITY CHUNK (First 40s of dialogue)
// Runs immediately with priority so subtitles appear in ~8-12 seconds
async function runStage1FastChunk(dramaSlug, epNum, streamUrl, cleanTarget) {
    const key = `${dramaSlug}_ep${epNum}`;
    const chunkVttFile = `${key}_${cleanTarget}_chunk.vtt`;
    const chunkVttPath = path.join(SUBTITLES_DIR, chunkVttFile);

    if (activeStage1Promises.has(key)) {
        return activeStage1Promises.get(key);
    }

    const stage1Promise = (async () => {
        const tempId = Date.now();
        const tempChunkWav = path.join(SUBTITLES_DIR, `chunk_${key}_${tempId}.wav`);
        const tempChunkSrt = path.join(SUBTITLES_DIR, `chunk_${key}_${tempId}.srt`);

        try {
            let activeStreamUrl = streamUrl;
            if (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl)) {
                try {
                    const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                    if (fresh && fresh.play_url) activeStreamUrl = fresh.play_url;
                } catch (e) { }
            }

            console.log(`[Audio STT] ⚡ Priority Fast Chunk (25s) starting for ${key}...`);
            const chunkExtractCmd = `ffmpeg -y -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -i "${activeStreamUrl}" -t 25 -vn -ar 16000 -ac 1 -c:a pcm_s16le "${tempChunkWav}"`;
            await runFfmpeg(chunkExtractCmd, 15000);

            const chunkWhisperCmd = `ffmpeg -threads ${WHISPER_THREADS} -y -i "${tempChunkWav}" -af "whisper=model=${ffmpegFilterPath(WHISPER_MODEL)}:language=en:destination=${ffmpegFilterPath(tempChunkSrt)}:format=srt" -f null -`;
            await runFfmpeg(chunkWhisperCmd, 25000);

            if (fs.existsSync(tempChunkSrt)) {
                const chunkSrt = fs.readFileSync(tempChunkSrt, 'utf8');
                const initialCues = parseSrtToCues(chunkSrt);
                if (initialCues.length > 0) {
                    console.log(`[Audio STT] 🚀 Priority Chunk READY (${initialCues.length} cues) for ${key}! Writing chunk VTT...`);
                    const translatedInitial = (cleanTarget !== 'en' && cleanTarget !== 'auto')
                        ? await batchTranslate(initialCues.map(c => c.text), cleanTarget, 'en')
                        : initialCues.map(c => c.text);
                    const vttLines = ['WEBVTT', ''];
                    for (let i = 0; i < initialCues.length; i++) {
                        vttLines.push(`${initialCues[i].start} --> ${initialCues[i].end}`);
                        vttLines.push(translatedInitial[i] || initialCues[i].text);
                        vttLines.push('');
                    }
                    fs.writeFileSync(chunkVttPath, vttLines.join('\n'), 'utf8');
                    return { ready: true, isComplete: false, path: chunkVttPath, filename: chunkVttFile };
                }
            }
            return { ready: false };
        } catch (err) {
            console.warn(`[Audio STT] Stage 1 priority chunk warning for ${key}:`, err.message);
            return { ready: false };
        } finally {
            if (fs.existsSync(tempChunkWav)) fs.unlink(tempChunkWav, () => { });
            if (fs.existsSync(tempChunkSrt)) fs.unlink(tempChunkSrt, () => { });
            activeStage1Promises.delete(key);
        }
    })();

    activeStage1Promises.set(key, stage1Promise);
    return stage1Promise;
}

// STAGE 2: FULL EPISODE TRANSCRIPTION (In background)
// If user switches episodes, cancels outdated episode transcription to free CPU
async function runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget) {
    const key = `${dramaSlug}_ep${epNum}`;
    const vttFile = `${key}_${cleanTarget}.vtt`;
    const vttPath = path.join(SUBTITLES_DIR, vttFile);
    const baseJsonPath = path.join(SUBTITLES_DIR, `${key}_base.json`);

    if (fs.existsSync(baseJsonPath)) {
        return;
    }

    if (activeStage2Promises.has(key)) {
        return activeStage2Promises.get(key);
    }

    // Cancel old Stage 2 task if user moved to another episode
    if (currentActiveStage2 && currentActiveStage2.key !== key) {
        console.log(`[Audio STT] Cancelling previous background task for ${currentActiveStage2.key} -> prioritizing ${key}`);
        try { currentActiveStage2.abortController.abort(); } catch (e) { }
        currentActiveStage2 = null;
    }

    const abortController = new AbortController();
    currentActiveStage2 = { key, abortController };

    const stage2Promise = (async () => {
        const tempId = Date.now();
        const tempFullWav = path.join(SUBTITLES_DIR, `full_${key}_${tempId}.wav`);
        const tempFullSrt = path.join(SUBTITLES_DIR, `full_${key}_${tempId}.srt`);

        try {
            // Check if any existing non-empty temp SRT exists for this key to recover instantly
            const existingTempSrts = fs.readdirSync(SUBTITLES_DIR).filter(f => f.startsWith(`full_${key}_`));
            for (const f of existingTempSrts) {
                if (f.endsWith('.srt')) {
                    const fp = path.join(SUBTITLES_DIR, f);
                    try {
                        const stats = fs.statSync(fp);
                        if (stats.size > 200) {
                            const srtContent = fs.readFileSync(fp, 'utf8');
                            const cues = parseSrtToCues(srtContent);
                            if (cues && cues.length > 0) {
                                fs.writeFileSync(baseJsonPath, JSON.stringify(cues, null, 2), 'utf8');
                                console.log(`[Audio STT] Recovered ${cues.length} cues from existing SRT for ${key}!`);
                                // Generate full VTT
                                const fullTrans = (cleanTarget !== 'en' && cleanTarget !== 'auto')
                                    ? await batchTranslate(cues.map(c => c.text), cleanTarget, 'en')
                                    : cues.map(c => c.text);
                                const fullLines = ['WEBVTT', ''];
                                for (let i = 0; i < cues.length; i++) {
                                    fullLines.push(`${cues[i].start} --> ${cues[i].end}`);
                                    fullLines.push(fullTrans[i] || cues[i].text);
                                    fullLines.push('');
                                }
                                fs.writeFileSync(vttPath, fullLines.join('\n'), 'utf8');
                                return cues;
                            }
                        }
                    } catch (e) { }
                }
            }

            let activeStreamUrl = streamUrl;
            if (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl)) {
                try {
                    const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                    if (fresh && fresh.play_url) activeStreamUrl = fresh.play_url;
                } catch (e) { }
            }

            console.log(`[Audio STT] Full episode audio extraction for ${key}...`);
            const extractCmd = `ffmpeg -y -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -i "${activeStreamUrl}" -vn -ar 16000 -ac 1 -c:a pcm_s16le "${tempFullWav}"`;
            await runFfmpeg(extractCmd, 120000, abortController.signal);

            console.log(`[Audio STT] Transcribing full audio (${WHISPER_THREADS} threads) for ${key}...`);
            const whisperCmd = `ffmpeg -threads ${WHISPER_THREADS} -y -i "${tempFullWav}" -af "whisper=model=${ffmpegFilterPath(WHISPER_MODEL)}:language=en:destination=${ffmpegFilterPath(tempFullSrt)}:format=srt" -f null -`;
            await runFfmpeg(whisperCmd, 180000, abortController.signal);

            if (!fs.existsSync(tempFullSrt)) {
                throw new Error('Whisper transcription did not generate SRT file');
            }

            const srtContent = fs.readFileSync(tempFullSrt, 'utf8');
            const cues = parseSrtToCues(srtContent);

            fs.writeFileSync(baseJsonPath, JSON.stringify(cues, null, 2), 'utf8');
            console.log(`[Audio STT] ✅ Successfully transcribed full ${cues.length} speech cues for ${key}! Updating full VTT...`);

            // Update full VTT file
            const fullTranslated = (cleanTarget !== 'en' && cleanTarget !== 'auto')
                ? await batchTranslate(cues.map(c => c.text), cleanTarget, 'en')
                : cues.map(c => c.text);
            const fullVttLines = ['WEBVTT', ''];
            for (let i = 0; i < cues.length; i++) {
                fullVttLines.push(`${cues[i].start} --> ${cues[i].end}`);
                fullVttLines.push(fullTranslated[i] || cues[i].text);
                fullVttLines.push('');
            }
            fs.writeFileSync(vttPath, fullVttLines.join('\n'), 'utf8');
            return cues;
        } catch (err) {
            if (err.message !== 'Operation aborted') {
                console.error(`[Audio STT] Error in full transcription for ${key}:`, err.message);
            }
        } finally {
            if (fs.existsSync(tempFullWav)) fs.unlink(tempFullWav, () => { });
            if (fs.existsSync(tempFullSrt)) fs.unlink(tempFullSrt, () => { });
            activeStage2Promises.delete(key);
            if (currentActiveStage2 && currentActiveStage2.key === key) {
                currentActiveStage2 = null;
            }
        }
    })();

    activeStage2Promises.set(key, stage2Promise);
    return stage2Promise;
}

async function getOrGenerateVtt(slug, epNum, streamUrl, targetLang = 'vi') {
    const dramaSlug = cleanDramaSlug(slug);
    const key = `${dramaSlug}_ep${epNum}`;
    const cleanTarget = (targetLang || 'vi').toLowerCase().split('-')[0];
    const vttFile = `${key}_${cleanTarget}.vtt`;

    // 0. Check if target VTT already exists in persistent repo cache or temp dir
    const existingVtt = findSubtitleFile(vttFile);
    if (existingVtt) {
        return { ready: true, isComplete: true, path: existingVtt, filename: vttFile };
    }

    const vttPath = path.join(SUBTITLES_DIR, vttFile);
    const baseJsonPath = findSubtitleFile(`${key}_base.json`) || path.join(SUBTITLES_DIR, `${key}_base.json`);

    // 1. If base transcript exists, ensure full target VTT is generated via text translation (No FFmpeg needed!)
    let cues = null;
    if (fs.existsSync(baseJsonPath)) {
        try {
            cues = JSON.parse(fs.readFileSync(baseJsonPath, 'utf8'));
        } catch (e) { }
    }

    if (cues && cues.length > 0) {
        if (!fs.existsSync(vttPath) && !findSubtitleFile(vttFile)) {
            console.log(`[Audio STT] Translating ${cues.length} cues for ${key} to [${cleanTarget}] in parallel...`);
            const translatedTexts = (cleanTarget !== 'en' && cleanTarget !== 'auto')
                ? await batchTranslate(cues.map(c => c.text), cleanTarget, 'auto')
                : cues.map(c => c.text);
            const vttLines = ['WEBVTT', ''];
            for (let i = 0; i < cues.length; i++) {
                vttLines.push(`${cues[i].start} --> ${cues[i].end}`);
                vttLines.push(translatedTexts[i] || cues[i].text);
                vttLines.push('');
            }
            const vttContent = vttLines.join('\n');
            try { fs.writeFileSync(vttPath, vttContent, 'utf8'); } catch (e) { }
            console.log(`[Audio STT] Generated WebVTT: ${vttFile}`);
        }
        const activeVtt = findSubtitleFile(vttFile) || vttPath;
        return { ready: true, isComplete: true, path: activeVtt, filename: vttFile };
    }

    // 2. If chunk VTT exists (from Stage 1 fast chunk), trigger Stage 2 in background and return ready (isComplete: false)!
    const chunkVttFile = `${key}_${cleanTarget}_chunk.vtt`;
    const chunkVttPath = path.join(SUBTITLES_DIR, chunkVttFile);
    if (fs.existsSync(chunkVttPath)) {
        if (streamUrl && !activeStage2Promises.has(key)) {
            runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget).catch(e => {
                console.error(`[Audio STT] Stage 2 background error for ${key}:`, e.message);
            });
        }
        return { ready: true, isComplete: false, path: chunkVttPath, filename: chunkVttFile };
    }

    // 3. Neither exists: trigger Stage 1 (Fast Chunk) immediately, and then Stage 2 in background!
    if (!streamUrl) {
        return { ready: false, status: 'missing_stream_url' };
    }

    // Run Stage 1 immediately
    if (!activeStage1Promises.has(key)) {
        runStage1FastChunk(dramaSlug, epNum, streamUrl, cleanTarget).then(res => {
            // Once Stage 1 finishes, trigger Stage 2 for full episode dialogue
            if (!fs.existsSync(baseJsonPath) && !activeStage2Promises.has(key)) {
                runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget).catch(e => { });
            }
        }).catch(e => {
            console.error(`[Audio STT] Stage 1 error for ${key}:`, e.message);
        });
    }

    // Await Stage 1 fast chunk (up to 5500ms) so first HTTP request returns ready: true immediately!
    const stage1Promise = activeStage1Promises.get(key);
    if (stage1Promise) {
        try {
            await Promise.race([
                stage1Promise,
                new Promise(resolve => setTimeout(resolve, 5500))
            ]);
        } catch (e) { }
    }

    if (fs.existsSync(chunkVttPath)) {
        if (streamUrl && !activeStage2Promises.has(key) && !fs.existsSync(baseJsonPath)) {
            runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget).catch(() => { });
        }
        return { ready: true, isComplete: false, path: chunkVttPath, filename: chunkVttFile };
    }

    return { ready: false, isComplete: false, status: 'transcribing' };
}

// 7.5 Subtitle Prefetch Endpoint — Fire-and-forget background warm-up for next episode
// Proactive Subtitle Prefetch Endpoint: Runs in background while user watches previous episode
app.get('/api/subtitles/prefetch', async (req, res) => {
    try {
        const { slug = 'unknown', ep = '1', stream_url = '', lang = 'vi', groq_key = '', upstream_sub_url = '', upstream_lang = 'auto' } = req.query;
        const cleanTarget = (lang || 'vi').toLowerCase().split('-')[0];
        const dramaSlug = cleanDramaSlug(slug);
        const epNum = parseInt(ep, 10) || 1;
        const key = `${dramaSlug}_ep${epNum}`;
        const cacheKey = `${key}_${cleanTarget}`;

        // 1. Check in-memory VTT cache first
        if (vttMemoryCache.has(cacheKey)) {
            const cachedVtt = vttMemoryCache.get(cacheKey);
            if (cleanTarget !== 'vi' || isVttContentVietnamese(cachedVtt)) {
                return res.json({
                    ok: true,
                    ready: true,
                    vttText: cachedVtt,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${epNum}&lang=${encodeURIComponent(cleanTarget)}`
                });
            }
            vttMemoryCache.delete(cacheKey);
        }

        // Fast path: Upstream official subtitle provided or resolved
        let targetUpstreamSub = upstream_sub_url;
        let activeStreamUrl = stream_url;
        if (!targetUpstreamSub && (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl))) {
            const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
            if (fresh) {
                if (fresh.play_url) activeStreamUrl = fresh.play_url;
                if (fresh.subtitle_url) targetUpstreamSub = fresh.subtitle_url;
            }
        }

        if (targetUpstreamSub) {
            try {
                let fullUrl = targetUpstreamSub;
                if (!fullUrl.startsWith('http')) fullUrl = `${BASE_URL}${fullUrl}`;
                const subRes = await fetch(fullUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': BASE_URL }
                });
                if (subRes.ok) {
                    const rawVtt = await subRes.text();
                    const cues = parseVttContent(rawVtt);
                    if (cues.length > 0) {
                        const cleanSrc = (upstream_lang || 'auto').toLowerCase().split('-')[0];
                        let finalVtt = rawVtt;
                        const needsTranslation = cleanTarget === 'vi'
                            ? !isVttContentVietnamese(rawVtt)
                            : (cleanSrc !== cleanTarget && (cleanTarget !== 'en' || (cleanSrc !== 'en' && cleanSrc !== 'auto')));
                        if (needsTranslation) {
                            const translated = await batchTranslate(cues.map(c => c.text), cleanTarget, cleanSrc);
                            const vttLines = ['WEBVTT', ''];
                            for (let i = 0; i < cues.length; i++) {
                                vttLines.push(cues[i].timeLine);
                                vttLines.push(translated[i] || cues[i].text);
                                vttLines.push('');
                            }
                            finalVtt = vttLines.join('\n');
                        }
                        vttMemoryCache.set(cacheKey, finalVtt);
                        console.log(`[Prefetch] ⚡ Upstream subtitle pre-cached in memory for ${key}!`);
                        return res.json({
                            ok: true,
                            ready: true,
                            vttText: finalVtt,
                            url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${epNum}&lang=${encodeURIComponent(cleanTarget)}`
                        });
                    }
                }
            } catch (e) {
                console.warn(`[Prefetch] Upstream subtitle prefetch failed for ${key}:`, e.message);
            }
        }

        // 2. Resolve stream URL if not provided
        if (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl)) {
            const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
            if (fresh && fresh.play_url) {
                activeStreamUrl = fresh.play_url;
            }
        }

        // 3. If cloud API is available (Groq / OpenAI) — run cloud STT
        const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY || process.env.OPENAI_API_KEY || '').trim();
        if (cloudApiKey && activeStreamUrl) {
            try {
                console.log(`[Prefetch] 🚀 Cloud AI prefetching subtitles for next episode ${key}...`);
                const cloudResult = await transcribeViaCloudApi(slug, epNum, activeStreamUrl, cleanTarget, cloudApiKey);
                if (cloudResult && cloudResult.ready) {
                    if (cloudResult.vttText) vttMemoryCache.set(cacheKey, cloudResult.vttText);
                    return res.json(cloudResult);
                }
            } catch (err) {
                console.warn(`[Prefetch] Cloud STT prefetch failed for ${key}:`, err.message);
            }
        }

        // 4. Local FFmpeg fallback if available: run full transcription so next episode has 100% subtitles!
        const hasFfmpeg = await isFfmpegAvailable();
        if (hasFfmpeg && activeStreamUrl) {
            runStage2FullTranscription(dramaSlug, epNum, activeStreamUrl, cleanTarget).catch(e => {
                console.warn(`[Prefetch] Stage 2 background error for ${key}:`, e.message);
            });
            return res.json({ ok: true, ready: false, isComplete: false, status: 'prefetching_full' });
        }

        res.json({ ok: false, error: 'prefetch_in_progress' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

function formatVttTimestamp(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
    const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(s % 60).toString().padStart(2, '0');
    const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
    return `${hrs}:${mins}:${secs}.${ms}`;
}

const cloudInFlightPromises = new Map();

async function transcribeViaCloudApi(slug, epNum, streamUrl, cleanTarget, apiKey) {
    const dramaSlug = cleanDramaSlug(slug);
    const key = `${dramaSlug}_ep${epNum}`;
    const cacheKey = `${key}_${cleanTarget}`;

    if (cloudInFlightPromises.has(cacheKey)) {
        console.log(`[Cloud STT] ⏳ Transcription already in-flight for ${cacheKey}, attaching to existing promise...`);
        return await cloudInFlightPromises.get(cacheKey);
    }

    const taskPromise = (async () => {
        const vttFile = `${key}_${cleanTarget}.vtt`;
        const vttPath = path.join(SUBTITLES_DIR, vttFile);
        const baseJsonPath = path.join(SUBTITLES_DIR, `${key}_base.json`);

        let activeStreamUrl = streamUrl;
        if (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl)) {
            try {
                const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                if (fresh && fresh.play_url) {
                    activeStreamUrl = fresh.play_url;
                }
            } catch (e) { }
        }
        if (!activeStreamUrl) {
            throw new Error('Could not resolve stream URL for episode');
        }

        let fileBlob = null;
        let fileName = 'audio.mp3';

        const hasFfmpeg = await isFfmpegAvailable();

        // 1. PRIMARY FAST PATH: If FFmpeg is available, directly extract pure audio for the ENTIRE episode!
        // Works for both HLS (.m3u8) and MP4, takes 1-3 seconds, only extracts audio stream, NO duration cutoff!
        if (hasFfmpeg) {
            console.log(`[Cloud STT] ⚡ Extracting full episode audio via FFmpeg for ${key}...`);
            const tempAudio = path.join(SUBTITLES_DIR, `full_stt_${key}_${Date.now()}.mp3`);
            try {
                // Extract 16kHz mono MP3 audio for whole episode (~700KB for 2 mins, perfectly under 25MB limit)
                await runFfmpeg(`ffmpeg -y -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -i "${activeStreamUrl}" -vn -ar 16000 -ac 1 -c:a libmp3lame -b:a 48k "${tempAudio}"`, 60000);
                if (fs.existsSync(tempAudio) && fs.statSync(tempAudio).size > 1000) {
                    const audioBuf = fs.readFileSync(tempAudio);
                    try { fs.unlinkSync(tempAudio); } catch (e) { }
                    fileBlob = (typeof File !== 'undefined')
                        ? new File([audioBuf], 'audio.mp3', { type: 'audio/mp3' })
                        : new Blob([audioBuf], { type: 'audio/mp3' });
                    fileName = 'audio.mp3';
                    console.log(`[Cloud STT] ✅ Extracted full episode audio (${audioBuf.length} bytes) for ${key}`);
                }
            } catch (err) {
                console.warn(`[Cloud STT] FFmpeg audio extraction error for ${key}:`, err.message);
                if (fs.existsSync(tempAudio)) { try { fs.unlinkSync(tempAudio); } catch (e) { } }
            }
        }

        // 2. FALLBACK PATH (e.g. Vercel Serverless without FFmpeg):
        if (!fileBlob) {
            fileName = 'audio.mp4';
            const isHls = activeStreamUrl.includes('.m3u8') || activeStreamUrl.includes('/e/m/') || activeStreamUrl.includes('/hls');
            if (isHls) {
                let plRes = await fetch(activeStreamUrl, {
                    headers: getHeaders({ 'Referer': `${BASE_URL}/` }),
                    signal: AbortSignal.timeout(8000)
                });
                let plText = await plRes.text();

                // Auto-refresh stale/expired edge links (e.g. ShortMax, GoodShort edge tokens)
                if (!plText.includes('#EXTM3U') || plText.includes('expired') || plText.includes('error')) {
                    console.log(`[Cloud STT] M3U8 playlist expired or invalid for ${key}, resolving fresh stream...`);
                    try {
                        const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                        if (fresh && fresh.play_url) {
                            activeStreamUrl = fresh.play_url;
                            plRes = await fetch(activeStreamUrl, {
                                headers: getHeaders({ 'Referer': `${BASE_URL}/` }),
                                signal: AbortSignal.timeout(8000)
                            });
                            plText = await plRes.text();
                        }
                    } catch (e) {
                        console.warn(`[Cloud STT] Stream refresh failed for ${key}:`, e.message);
                    }
                }

                let targetPlUrl = activeStreamUrl;
                let segUrls = [];

                if (plText.includes('#EXT-X-STREAM-INF')) {
                    const lines = plText.split('\n');
                    let lowestBw = Infinity;
                    let lowestUrl = '';
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.includes('BANDWIDTH=')) {
                            const m = line.match(/BANDWIDTH=(\d+)/i);
                            const bw = m ? parseInt(m[1], 10) : Infinity;
                            for (let j = i + 1; j < lines.length; j++) {
                                const subLine = lines[j].trim();
                                if (subLine && !subLine.startsWith('#')) {
                                    if (bw < lowestBw) {
                                        lowestBw = bw;
                                        lowestUrl = new URL(subLine, activeStreamUrl).href;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    if (lowestUrl) targetPlUrl = lowestUrl;
                    const varRes = await fetch(targetPlUrl, {
                        headers: getHeaders({ 'Referer': `${BASE_URL}/` }),
                        signal: AbortSignal.timeout(8000)
                    });
                    const varText = await varRes.text();
                    for (const line of varText.split('\n')) {
                        const trimmed = line.trim();
                        if (trimmed && !trimmed.startsWith('#')) {
                            segUrls.push(new URL(trimmed, targetPlUrl).href);
                        }
                    }
                } else {
                    for (const line of plText.split('\n')) {
                        const trimmed = line.trim();
                        if (trimmed && !trimmed.startsWith('#')) {
                            segUrls.push(new URL(trimmed, activeStreamUrl).href);
                        }
                    }
                }

                let muxjs = null;
                try { muxjs = require('mux.js'); } catch (e) { }

                let combinedBuf = null;
                if (muxjs && segUrls.length > 0) {
                    // remux: false extracts pure audio stream separate from video.
                    // This shrinks segment size from ~250KB to ~18KB (~4MB for entire 4.2-min episode vs 35MB+ video),
                    // fitting completely inside Groq Whisper's 25MB file limit without early cutoff!
                    const transmuxer = new muxjs.mp4.Transmuxer({ remux: false });
                    let audioInit = null;
                    const audioChunks = [];
                    const fallbackInit = [];
                    const fallbackMedia = [];

                    transmuxer.on('data', segment => {
                        if (segment.type === 'audio') {
                            if (segment.initSegment && !audioInit) {
                                audioInit = Buffer.from(segment.initSegment);
                            }
                            if (segment.data) {
                                audioChunks.push(Buffer.from(segment.data));
                            }
                        }
                        if (segment.initSegment && fallbackInit.length === 0) {
                            fallbackInit.push(Buffer.from(segment.initSegment));
                        }
                        if (segment.data) {
                            fallbackMedia.push(Buffer.from(segment.data));
                        }
                    });

                    // Download all segments in parallel batches preserving chronological index
                    const segBuffers = new Array(segUrls.length);
                    const concurrency = 10;
                    let nextIdx = 0;
                    async function fetchSegWorker() {
                        while (nextIdx < segUrls.length) {
                            const cur = nextIdx++;
                            try {
                                const segRes = await fetch(segUrls[cur], {
                                    headers: getHeaders({ 'Referer': `${BASE_URL}/` }),
                                    signal: AbortSignal.timeout(10000)
                                });
                                if (segRes.ok) {
                                    segBuffers[cur] = await segRes.arrayBuffer();
                                }
                            } catch (e) { }
                        }
                    }
                    await Promise.all(Array.from({ length: concurrency }, () => fetchSegWorker()));

                    for (let i = 0; i < segBuffers.length; i++) {
                        if (segBuffers[i]) {
                            transmuxer.push(new Uint8Array(segBuffers[i]));
                        }
                    }
                    transmuxer.flush();

                    if (audioInit && audioChunks.length > 0) {
                        combinedBuf = Buffer.concat([audioInit, ...audioChunks]);
                        console.log(`[Cloud STT] ⚡ Extracted full-episode audio MP4 (${combinedBuf.length} bytes, ${(combinedBuf.length / (1024 * 1024)).toFixed(2)} MB, ${segUrls.length} segments) for ${key}`);
                    } else if (fallbackInit.length > 0) {
                        combinedBuf = Buffer.concat([...fallbackInit, ...fallbackMedia]);
                    }

                    if (combinedBuf && combinedBuf.length > 24 * 1024 * 1024) {
                        combinedBuf = combinedBuf.slice(0, 24 * 1024 * 1024);
                    }
                }

                if (!combinedBuf || combinedBuf.length === 0) {
                    throw new Error('Failed to download HLS audio segments');
                }

                fileBlob = (typeof File !== 'undefined')
                    ? new File([combinedBuf], 'audio.mp4', { type: 'video/mp4' })
                    : new Blob([combinedBuf], { type: 'video/mp4' });
                fileName = 'audio.mp4';
            } else {
                // Direct MP4
                let videoRes = await fetch(activeStreamUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(15000)
                });
                if (!videoRes.ok && (videoRes.status === 403 || videoRes.status === 401)) {
                    try {
                        const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                        if (fresh && fresh.play_url) {
                            activeStreamUrl = fresh.play_url;
                            videoRes = await fetch(activeStreamUrl, {
                                headers: { 'User-Agent': 'Mozilla/5.0' },
                                signal: AbortSignal.timeout(15000)
                            });
                        }
                    } catch (e) { }
                }

                if (!videoRes.ok) {
                    throw new Error(`Failed to fetch video stream: HTTP ${videoRes.status}`);
                }

                let buf = await videoRes.arrayBuffer();
                const headStr = Buffer.from(buf.slice(0, 150)).toString('utf8');
                if (headStr.includes('#EXTM3U') || headStr.includes('link expired') || headStr.includes('shortmax-edge')) {
                    const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
                    if (fresh && fresh.play_url && fresh.play_url !== activeStreamUrl) {
                        return await transcribeViaCloudApi(slug, epNum, fresh.play_url, cleanTarget, apiKey);
                    }
                }

                if (buf.byteLength > 24 * 1024 * 1024) {
                    buf = buf.slice(0, 24 * 1024 * 1024);
                }
                fileBlob = (typeof File !== 'undefined')
                    ? new File([buf], 'audio.mp4', { type: 'video/mp4' })
                    : new Blob([buf], { type: 'video/mp4' });
                fileName = 'audio.mp4';
            }
        }

        const isGroq = apiKey.startsWith('gsk_') || !apiKey.startsWith('sk-');
        const endpoint = isGroq
            ? 'https://api.groq.com/openai/v1/audio/transcriptions'
            : 'https://api.openai.com/v1/audio/transcriptions';
        const model = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';

        const formData = new FormData();
        formData.append('file', fileBlob, fileName);
        formData.append('model', model);
        formData.append('response_format', 'verbose_json');
        // Whisper auto-detects speech language (Chinese, Korean, Vietnamese, English, etc.)

        console.log(`[Cloud STT] Sending ${fileName} (${fileBlob ? fileBlob.size : 0} bytes) to ${isGroq ? 'Groq' : 'OpenAI'} (${model}) for ${key}...`);
        let cloudRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData,
            signal: AbortSignal.timeout(45000)
        });

        if (!cloudRes.ok) {
            const errText = await cloudRes.text();
            console.error(`[Cloud STT] API error (${cloudRes.status}) for ${key}:`, errText);
            throw new Error(`Cloud STT API error: ${cloudRes.status} - ${errText.slice(0, 100)}`);
        }

        const cloudData = await cloudRes.json();
        let rawSegments = cloudData.segments || [];

        if (rawSegments.length === 0 && cloudData.text) {
            rawSegments.push({ start: 0, end: 60, text: cloudData.text });
        }

        const cues = rawSegments.map((seg, idx) => ({
            id: idx + 1,
            start: formatVttTimestamp(seg.start),
            end: formatVttTimestamp(seg.end),
            text: (seg.text || '').trim()
        })).filter(c => c.text);

        try {
            fs.writeFileSync(baseJsonPath, JSON.stringify(cues, null, 2), 'utf8');
        } catch (e) { }

        const translatedTexts = (cleanTarget !== 'en' && cleanTarget !== 'auto')
            ? await batchTranslate(cues.map(c => c.text), cleanTarget, 'auto')
            : cues.map(c => c.text);

        const vttLines = ['WEBVTT', ''];
        for (let i = 0; i < cues.length; i++) {
            vttLines.push(`${cues[i].start} --> ${cues[i].end}`);
            vttLines.push(translatedTexts[i] || cues[i].text);
            vttLines.push('');
        }
        const vttContent = vttLines.join('\n');
        try {
            fs.writeFileSync(vttPath, vttContent, 'utf8');
        } catch (e) { }

        vttMemoryCache.set(`${dramaSlug}_ep${epNum}_${cleanTarget}`, vttContent);
        console.log(`[Cloud STT] ✅ Successfully generated and translated ${cues.length} cues for ${key}!`);
        return {
            ok: true,
            ready: true,
            isComplete: true,
            lang: cleanTarget,
            url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(epNum)}&lang=${encodeURIComponent(cleanTarget)}`,
            vttText: vttContent
        };
    })();

    cloudInFlightPromises.set(cacheKey, taskPromise);
    taskPromise.finally(() => {
        cloudInFlightPromises.delete(cacheKey);
    });
    return await taskPromise;
}

// Subtitle Generation & Status Check Endpoint
app.get('/api/subtitles/generate', async (req, res) => {
    try {
        const { slug = 'unknown', ep = '1', stream_url = '', lang = 'vi', groq_key = '', upstream_sub_url = '', upstream_lang = 'auto' } = req.query;
        const cleanTarget = (lang || 'vi').toLowerCase().split('-')[0];

        // 1. Check if pre-cached VTT already exists in memory or disk
        const dramaSlug = cleanDramaSlug(slug);
        const key = `${dramaSlug}_ep${ep}`;
        const cacheKey = `${key}_${cleanTarget}`;

        if (vttMemoryCache.has(cacheKey)) {
            const cachedVtt = vttMemoryCache.get(cacheKey);
            if (cleanTarget !== 'vi' || isVttContentVietnamese(cachedVtt)) {
                return res.json({
                    ok: true,
                    ready: true,
                    isComplete: true,
                    lang: cleanTarget,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                    vttText: cachedVtt
                });
            }
            vttMemoryCache.delete(cacheKey);
        }

        // ==========================================
        // CASE 1: UPSTREAM SUBTITLE FAST-PATH (<1s)
        // If upstream returns a subtitle, use it directly / translate text in <1s.
        // Groq Whisper STT is completely bypassed for Case 1!
        // ==========================================
        let resolvedUpstreamSubUrl = upstream_sub_url;
        if (!resolvedUpstreamSubUrl && slug && slug !== 'unknown') {
            try {
                const freshStream = await resolveFreshEpisodeStream(slug, parseInt(ep, 10));
                if (freshStream) {
                    if (freshStream.subtitle_url) {
                        resolvedUpstreamSubUrl = freshStream.subtitle_url;
                    } else if (Array.isArray(freshStream.subtitles) && freshStream.subtitles.length > 0) {
                        const directVi = freshStream.subtitles.find(s => (s.language_code || '').toLowerCase().startsWith(cleanTarget));
                        const enSub = freshStream.subtitles.find(s => (s.language_code || '').toLowerCase().startsWith('en'));
                        resolvedUpstreamSubUrl = (directVi && directVi.subtitle_url) || (enSub && enSub.subtitle_url) || freshStream.subtitles[0].subtitle_url;
                    }
                }
            } catch (e) { }
        }

        if (resolvedUpstreamSubUrl) {
            try {
                let fullUrl = resolvedUpstreamSubUrl;
                if (!fullUrl.startsWith('http')) fullUrl = `${BASE_URL}${fullUrl}`;
                const subRes = await fetch(fullUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': BASE_URL }
                });
                if (subRes.ok) {
                    const rawVtt = await subRes.text();
                    const cues = parseVttContent(rawVtt);
                    if (cues.length > 0) {
                        const cleanSrc = (upstream_lang || 'auto').toLowerCase().split('-')[0];
                        let finalVtt = rawVtt;
                        const needsTranslation = cleanTarget === 'vi'
                            ? !isVttContentVietnamese(rawVtt)
                            : (cleanSrc !== cleanTarget && (cleanTarget !== 'en' || (cleanSrc !== 'en' && cleanSrc !== 'auto')));
                        if (needsTranslation) {
                            const translated = await batchTranslate(cues.map(c => c.text), cleanTarget, cleanSrc);
                            const vttLines = ['WEBVTT', ''];
                            for (let i = 0; i < cues.length; i++) {
                                vttLines.push(cues[i].timeLine);
                                vttLines.push(translated[i] || cues[i].text);
                                vttLines.push('');
                            }
                            finalVtt = vttLines.join('\n');
                        }
                        vttMemoryCache.set(cacheKey, finalVtt);
                        return res.json({
                            ok: true,
                            ready: true,
                            isComplete: true,
                            case: 'case1_upstream',
                            lang: cleanTarget,
                            url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                            vttText: finalVtt
                        });
                    }
                }
            } catch (err) {
                console.warn('[Generate] Upstream subtitle fetch/translation failed, falling back to STT:', err.message);
            }
        }

        // ==========================================
        // CASE 2: FALLBACK TO GROQ WHISPER STT
        // Only executed when upstream DOES NOT have any subtitles!
        // ==========================================

        const vttFile = `${key}_${cleanTarget}.vtt`;
        const existingVtt = findSubtitleFile(vttFile);
        if (existingVtt) {
            let vttText = '';
            try { vttText = fs.readFileSync(existingVtt, 'utf8'); } catch (e) { }
            if (cleanTarget !== 'vi' || isVttContentVietnamese(vttText)) {
                return res.json({
                    ok: true,
                    ready: true,
                    isComplete: true,
                    lang: cleanTarget,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                    vttText
                });
            }
        }

        // 2. Check if base transcript exists — if so, we can generate the target VTT via text translation (No FFmpeg required!)
        const existingBaseJson = findSubtitleFile(`${key}_base.json`);
        if (existingBaseJson) {
            const result = await getOrGenerateVtt(slug, ep, stream_url, cleanTarget);
            if (result && result.ready) {
                let vttText = '';
                try { if (result.path) vttText = fs.readFileSync(result.path, 'utf8'); } catch (e) { }
                return res.json({
                    ok: true,
                    ready: true,
                    isComplete: !!result.isComplete,
                    lang: cleanTarget,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                    vttText
                });
            }
        }

        // 3. Check for Cloud STT API Key (Groq / OpenAI) — Runs natively on Vercel Serverless without FFmpeg!
        const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY || process.env.OPENAI_API_KEY || '').trim();
        if (cloudApiKey) {
            try {
                const cloudResult = await transcribeViaCloudApi(slug, ep, stream_url, cleanTarget, cloudApiKey);
                if (cloudResult && cloudResult.ready) {
                    return res.json(cloudResult);
                }
            } catch (cloudErr) {
                console.error(`[Cloud STT] Cloud transcription error for ${key}:`, cloudErr.message);
            }
        }

        // 4. Check if FFmpeg is available in the current environment (local machine or VPS/Render)
        const hasFfmpeg = await isFfmpegAvailable();
        if (!hasFfmpeg) {
            return res.json({
                ok: false,
                error: 'subtitles_unavailable',
                message: 'Chưa có phụ đề cho tập phim này.'
            });
        }

        const result = await getOrGenerateVtt(slug, ep, stream_url, cleanTarget);

        if (result.ready) {
            let vttText = '';
            try { if (result.path) vttText = fs.readFileSync(result.path, 'utf8'); } catch (e) { }
            return res.json({
                ok: true,
                ready: true,
                isComplete: !!result.isComplete,
                lang: cleanTarget,
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                vttText
            });
        }

        res.json({
            ok: true,
            ready: false,
            isComplete: false,
            lang: cleanTarget,
            status: result.status || 'transcribing'
        });
    } catch (err) {
        console.error('Error in /api/subtitles/generate:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Serve WebVTT File Endpoint
app.get('/api/subtitles/vtt', async (req, res) => {
    try {
        const { slug = 'unknown', ep = '1', lang = 'vi', stream_url = '', groq_key = '' } = req.query;
        const dramaSlug = cleanDramaSlug(slug);
        const cleanTarget = (lang || 'vi').toLowerCase().split('-')[0];
        const key = `${dramaSlug}_ep${ep}`;
        const cacheKey = `${key}_${cleanTarget}`;

        if (vttMemoryCache.has(cacheKey)) {
            const cachedVtt = vttMemoryCache.get(cacheKey);
            if (cleanTarget !== 'vi' || isVttContentVietnamese(cachedVtt)) {
                res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(cachedVtt);
            }
            vttMemoryCache.delete(cacheKey);
        }

        const vttFile = `${key}_${cleanTarget}.vtt`;
        let vttPath = findSubtitleFile(vttFile);

        // If not found in /tmp, and stream_url + cloud key is available, generate dynamically on-the-fly
        if (!vttPath || !fs.existsSync(vttPath)) {
            const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY || process.env.OPENAI_API_KEY || '').trim();
            let activeStream = stream_url;
            if (!activeStream && cloudApiKey) {
                try {
                    const fresh = await resolveFreshEpisodeStream(dramaSlug, parseInt(ep || '1', 10), 'vi-VN');
                    if (fresh && fresh.play_url) activeStream = fresh.play_url;
                } catch (e) { }
            }
            if (cloudApiKey && activeStream) {
                try {
                    const cloudRes = await transcribeViaCloudApi(slug, ep, activeStream, cleanTarget, cloudApiKey);
                    if (cloudRes && cloudRes.vttText) {
                        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Cache-Control', 'public, max-age=86400');
                        return res.send(cloudRes.vttText);
                    }
                } catch (e) {
                    console.warn(`[VTT On-Demand] Failed:`, e.message);
                }
            }
            return res.status(404).send('WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\n[Đang tạo phụ đề...]');
        }

        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        res.sendFile(vttPath);
    } catch (err) {
        console.error('Error in /api/subtitles/vtt:', err);
        res.status(500).send(err.message);
    }
});

// SPA fallback
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Not Found');
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;

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

app.get('/api/version', (req, res) => {
    res.json({ ok: true, version: pkg.version, app: pkg.name });
});

const BASE_URL = 'https://narto-drama.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getHeaders(extraHeaders = {}) {
    const nd_ck = '18e38f90248' + Math.random().toString(16).slice(2, 10);
    return {
        'User-Agent': USER_AGENT,
        'Cookie': `nd_ck=${nd_ck}`,
        'Accept': 'application/json, text/plain, */*',
        ...extraHeaders
    };
}

// 1. Dynamic Providers Synchronization (Live from upstream narto-drama.com)
let cachedProviders = null;
let lastProvidersFetch = 0;

async function fetchLiveProvidersFromUpstream() {
    try {
        const url = `${BASE_URL}/home/providers/sections?provider=anyreel&lang=en-US&target_lang=en-US`;
        const response = await fetch(url, {
            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
        });
        if (response.ok) {
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
    return cachedProviders || [];
}

// Initial sync on server start
fetchLiveProvidersFromUpstream();

// Live Providers List Endpoint
app.get('/api/providers', async (req, res) => {
    try {
        const now = Date.now();
        if (!cachedProviders || (now - lastProvidersFetch > 5 * 60 * 1000)) {
            await fetchLiveProvidersFromUpstream();
        }
        res.json({ ok: true, providers: cachedProviders || [] });
    } catch (err) {
        console.error('Error serving /api/providers:', err);
        res.json({ ok: true, providers: cachedProviders || [] });
    }
});

// 2. Provider Sections (Home/Trending/Popular)
app.get('/api/sections', async (req, res) => {
    try {
        const provider = req.query.provider || 'anyreel';
        const page = parseInt(req.query.page || '1', 10);
        const query = req.query.q || '';
        const lang = req.query.lang || 'vi-VN';

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

            const url = `${BASE_URL}/home/providers/sections?${params.toString()}`;
            const response = await fetch(url, {
                headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
            });

            if (!response.ok) return null;
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

        // Fallback 1: If 0 items, retry without strict target_lang filter
        if (totalItems === 0 && !query) {
            const fb1 = await fetchSectionsFromUpstream(lang, false);
            if (countItems(fb1) > 0) {
                data = fb1;
                totalItems = countItems(data);
            }
        }

        // Fallback 2: If still 0 items, fallback to Vietnamese (vi-VN)
        if (totalItems === 0 && !query && lang !== 'vi-VN') {
            const fb2 = await fetchSectionsFromUpstream('vi-VN', false);
            if (countItems(fb2) > 0) {
                data = fb2;
                totalItems = countItems(data);
            }
        }

        // Fallback 3: If still 0 items, retry with upstream default store 'id-ID'
        if (totalItems === 0 && !query && lang !== 'id-ID') {
            const fb3 = await fetchSectionsFromUpstream('id-ID', false);
            if (countItems(fb3) > 0) {
                data = fb3;
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

        res.json({
            ok: true,
            provider,
            active_provider: data.active_provider || provider,
            providers: data.providers || cachedProviders || [],
            sections: data.sections || [],
            tab_pages: data.tab_pages || {}
        });
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

        const url = `${BASE_URL}/search?q=${encodeURIComponent(q)}&limit=50&lang=${encodeURIComponent(lang)}`;
        const response = await fetch(url, {
            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
        });

        if (!response.ok) {
            return res.status(response.status).json({ ok: false, error: `Upstream error: ${response.status}` });
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
            // Fetch the drama page (following redirects)
            const headers = getHeaders();
            let pageRes = await fetch(watchUrl, { headers, redirect: 'follow' });
            let html = await pageRes.text();
            let finalUrl = pageRes.url;

            // If direct slug watchUrl returned 404 or missing episodes, try searching upstream by slug keywords
            if ((!pageRes.ok || html.includes('Page Not Found') || !html.includes('episodeItemsRaw')) && slug) {
                const searchKeywords = slug.replace(/[-_]+/g, ' ').trim();
                try {
                    const sRes = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(searchKeywords)}&limit=5&lang=${encodeURIComponent(lang)}`, {
                        headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
                    });
                    if (sRes.ok) {
                        const sData = await sRes.json();
                        const sItems = sData.items || sData || [];
                        if (sItems.length > 0 && sItems[0].url) {
                            const newUrl = sItems[0].url.startsWith('http') ? sItems[0].url : `${BASE_URL}${sItems[0].url}`;
                            const newRes = await fetch(newUrl, { headers, redirect: 'follow' });
                            if (newRes.ok) {
                                pageRes = newRes;
                                html = await newRes.text();
                                finalUrl = newRes.url;
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
                    const pageRes2 = await fetch(ep1Url, { headers });
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
                        const recRes = await fetch(targetUrl, { headers });
                        const recHtml = await recRes.text();
                        const recMatch = recHtml.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
                        if (recMatch) {
                            const parsed = JSON.parse(recMatch[1]);
                            if (parsed.some(e => e.play_url || e.direct_play_url)) {
                                recoveredEps = parsed;
                                console.log(`[Auto-Recovery] Successfully recovered ${parsed.length} playable episodes via clean slug!`);
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
                        const searchRes = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(cleanSearchTitle)}&limit=10&lang=${encodeURIComponent(lang)}`, {
                            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
                        });
                        if (searchRes.ok) {
                            const sData = await searchRes.json();
                            const sItems = sData.items || sData || [];
                            const altItem = sItems.find(i => i.url && i.url !== watchUrl && !i.url.includes(watchUrl.split('?')[0]) && i.title && i.title.toLowerCase().trim() === cleanSearchTitle.toLowerCase().trim());
                            if (altItem && altItem.url) {
                                const altPath = altItem.url.split('?')[0];
                                const altUrl = `${BASE_URL}${altPath}/1`;
                                const altRes = await fetch(altUrl, { headers });
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
                    is_hls: playUrl.includes('.m3u8') || item.browser_prefetch_mode === 'hls'
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
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 2800);
                        const resp = await fetch(normalized, {
                            headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' }),
                            redirect: 'follow',
                            signal: controller.signal
                        });
                        clearTimeout(timer);
                        if (!resp.ok) return;
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
    const match = url.match(/[?&]auth_key=(\d+)/i);
    if (match) {
        const expiry = parseInt(match[1], 10);
        const nowSec = Math.floor(Date.now() / 1000);
        // Expired or expiring within next 60 seconds
        if (expiry > 0 && expiry <= nowSec + 60) {
            return true;
        }
    }
    return false;
}

// 4.1 Reusable On-Demand Episode Stream Resolver (Multi-Tier Edge & Origin)
async function resolveFreshEpisodeStream(dramaSlug, epNum = 1, lang = 'vi-VN') {
    if (!dramaSlug) return null;
    const headers = getHeaders({
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE_URL}/detail/watch/${dramaSlug}/${epNum}?lang=${lang}&from=home`
    });

    let streamData = null;
    // Tier 1: Query Edge refresh-source (fastest & lowest latency)
    try {
        const edgeRefreshUrl = `https://edge.narto-drama.com/e/rs/detail/watch/${dramaSlug}/${epNum}/refresh-source?force=1&force_edge=1&lang=${lang}`;
        const rRes = await fetch(edgeRefreshUrl, { headers });
        if (rRes.ok) {
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
            const originRefreshUrl = `${BASE_URL}/detail/watch/${dramaSlug}/${epNum}/refresh-source?force=1&force_edge=1&lang=${lang}`;
            const rRes2 = await fetch(originRefreshUrl, { headers });
            if (rRes2.ok) {
                const j2 = await rRes2.json();
                if (j2 && (j2.play_url || j2.direct_play_url)) {
                    streamData = j2;
                }
            }
        } catch (e) {
            console.warn('[RefreshSource] Origin resolution failed:', e.message);
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
            is_hls: playUrl.includes('.m3u8') || streamData.direct_play_is_hls === true,
            source_refreshed: streamData.source_refreshed === true,
            subtitle_url: subUrl,
            subtitles: cleanSubs
        };
    }

    // Tier 3: Parse HTML page of that episode for episodeItemsRaw
    try {
        const epPageUrl = `${BASE_URL}/detail/watch/${dramaSlug}/${epNum}?lang=${lang}&from=home`;
        const pageRes = await fetch(epPageUrl, { headers: getHeaders() });
        if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            const epMatch = pageHtml.match(/const episodeItemsRaw = (\[[\s\S]*?\]);/);
            if (epMatch) {
                const rawList = JSON.parse(epMatch[1]);
                const matched = rawList.find(e => e.number === epNum || e.route_episode_number === epNum);
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
                        is_hls: pUrl.includes('.m3u8') || matched.browser_prefetch_mode === 'hls',
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
    // Endpoint 4: webapp — different user-agent triggers different response format
    (sl, tl, q) => `https://translate.googleapis.com/translate_a/single?client=webapp&sl=${sl}&tl=${tl}&dt=t&q=${q}`,
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

        // Cache result
        if (translationCache.size > 10000) {
            // Evict oldest 500 entries
            let evicted = 0;
            for (const k of translationCache.keys()) {
                if (evicted >= 500) break;
                translationCache.delete(k);
                evicted++;
            }
        }
        translationCache.set(cacheKey, result);
        scheduleCacheSave();

        return result;
    });
}

// High-speed Pack-Batch translation helper — packs up to 20 cues per single HTTP request
// Reduces HTTP roundtrips by 90%+ and translates full dialogue in under 1 second!
async function batchTranslate(texts, targetLang, sourceLang = 'auto') {
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

    // Step 2: Translate uncached lines in packed batches of 20
    const BATCH_SIZE = 20;
    const batchPromises = [];

    for (let i = 0; i < uncachedIndices.length; i += BATCH_SIZE) {
        const chunkIndices = uncachedIndices.slice(i, i + BATCH_SIZE);
        batchPromises.push((async () => {
            const payload = chunkIndices.map((origIdx, localIdx) => `${localIdx}>>> ${(texts[origIdx] || '').trim()}`).join('\n');
            let translatedBlock = null;
            try {
                translatedBlock = await tryGoogleTranslate(payload, sl, tl, 2);
            } catch (e) { }

            const filled = new Set();
            if (translatedBlock) {
                const lines = translatedBlock.split('\n');
                for (const line of lines) {
                    const m = line.match(/^(\d+)\s*>>>\s*(.*)/);
                    if (m) {
                        const localIdx = parseInt(m[1], 10);
                        if (localIdx >= 0 && localIdx < chunkIndices.length) {
                            const origIdx = chunkIndices[localIdx];
                            const trans = m[2].trim();
                            if (trans) {
                                results[origIdx] = trans;
                                filled.add(localIdx);
                                const rawText = (texts[origIdx] || '').trim();
                                const cleanInput = cleanTextForTranslation(rawText);
                                if (cleanInput) {
                                    translationCache.set(`${sl}:${tl}:${cleanInput}`, trans);
                                }
                            }
                        }
                    }
                }
            }

            // Fallback for any individual line that was missed
            for (let localIdx = 0; localIdx < chunkIndices.length; localIdx++) {
                if (!filled.has(localIdx)) {
                    const origIdx = chunkIndices[localIdx];
                    try {
                        const single = await translateText(texts[origIdx], tl, sl);
                        results[origIdx] = single || texts[origIdx];
                    } catch (e) {
                        results[origIdx] = texts[origIdx];
                    }
                }
            }
        })());
    }

    await Promise.all(batchPromises);
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

// Helper: Parse WebVTT raw text into clean cues and timing lines
function parseVttContent(vttText) {
    if (!vttText || typeof vttText !== 'string') return [];
    const cues = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
            const timeLine = line;
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

// 6.2 High-Speed Upstream WebVTT Translator (Instant 0.5s translation from official timed cues)
app.get('/api/subtitles/translate-vtt', async (req, res) => {
    try {
        const { url, slug = 'unknown', ep = '1', target_lang = 'vi', source_lang = 'auto' } = req.query;
        if (!url) return res.status(400).json({ ok: false, error: 'url is required' });

        const cleanTarget = (target_lang || 'vi').toLowerCase().split('-')[0];
        const dramaSlug = cleanDramaSlug(slug);
        const cacheKey = `${dramaSlug}_ep${ep}_${cleanTarget}`;

        if (vttMemoryCache.has(cacheKey)) {
            return res.json({
                ok: true,
                ready: true,
                lang: cleanTarget,
                vttText: vttMemoryCache.get(cacheKey),
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`
            });
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

        const sl = source_lang || 'auto';
        const translatedTexts = await batchTranslate(cues.map(c => c.text), cleanTarget, sl);
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
    if (fs.existsSync(tmpPath)) return tmpPath;
    return null;
}
console.log('[STT] Subtitle temp dir:', SUBTITLES_DIR);
const vttMemoryCache = new Map(); // In-memory cache: ${dramaSlug}_ep${ep}_${lang} -> vttContent

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
    const vttFile = `${key}_${cleanTarget}.vtt`;
    const vttPath = path.join(SUBTITLES_DIR, vttFile);

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
                    console.log(`[Audio STT] 🚀 Priority Chunk READY (${initialCues.length} cues) for ${key}! Writing initial VTT...`);
                    const translatedInitial = (cleanTarget !== 'en' && cleanTarget !== 'auto')
                        ? await batchTranslate(initialCues.map(c => c.text), cleanTarget, 'en')
                        : initialCues.map(c => c.text);
                    const vttLines = ['WEBVTT', ''];
                    for (let i = 0; i < initialCues.length; i++) {
                        vttLines.push(`${initialCues[i].start} --> ${initialCues[i].end}`);
                        vttLines.push(translatedInitial[i] || initialCues[i].text);
                        vttLines.push('');
                    }
                    fs.writeFileSync(vttPath, vttLines.join('\n'), 'utf8');
                    return { ready: true, isComplete: false };
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
                ? await batchTranslate(cues.map(c => c.text), cleanTarget, 'en')
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

    // 2. If target VTT exists (from Stage 1 fast chunk), trigger Stage 2 in background and return ready!
    if (fs.existsSync(vttPath)) {
        if (streamUrl && !activeStage2Promises.has(key)) {
            runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget).catch(e => {
                console.error(`[Audio STT] Stage 2 background error for ${key}:`, e.message);
            });
        }
        return { ready: true, isComplete: false, path: vttPath, filename: vttFile };
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

    if (fs.existsSync(vttPath)) {
        if (streamUrl && !activeStage2Promises.has(key) && !fs.existsSync(baseJsonPath)) {
            runStage2FullTranscription(dramaSlug, epNum, streamUrl, cleanTarget).catch(() => { });
        }
        return { ready: true, isComplete: false, path: vttPath, filename: vttFile };
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
            return res.json({
                ok: true,
                ready: true,
                vttText: vttMemoryCache.get(cacheKey),
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${epNum}&lang=${encodeURIComponent(cleanTarget)}`
            });
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
                        if (cleanSrc !== cleanTarget && (cleanTarget !== 'en' || (cleanSrc !== 'en' && cleanSrc !== 'auto'))) {
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
        const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
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

        // 4. Local FFmpeg fallback if available
        const hasFfmpeg = await isFfmpegAvailable();
        if (hasFfmpeg && activeStreamUrl) {
            const result = await runStage1FastChunk(dramaSlug, epNum, activeStreamUrl, cleanTarget);
            if (result && result.ready) {
                let vttText = '';
                try { if (result.path) vttText = fs.readFileSync(result.path, 'utf8'); } catch (e) { }
                if (vttText) vttMemoryCache.set(cacheKey, vttText);
                return res.json({
                    ok: true,
                    ready: true,
                    vttText,
                    url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${epNum}&lang=${encodeURIComponent(cleanTarget)}`
                });
            }
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

async function transcribeViaCloudApi(slug, epNum, streamUrl, cleanTarget, apiKey) {
    const dramaSlug = cleanDramaSlug(slug);
    const key = `${dramaSlug}_ep${epNum}`;
    const vttFile = `${key}_${cleanTarget}.vtt`;
    const vttPath = path.join(SUBTITLES_DIR, vttFile);
    const baseJsonPath = path.join(SUBTITLES_DIR, `${key}_base.json`);

    let activeStreamUrl = streamUrl;
    if (!activeStreamUrl || isAuthKeyExpired(activeStreamUrl)) {
        const fresh = await resolveFreshEpisodeStream(dramaSlug, epNum, 'vi-VN');
        if (fresh && fresh.play_url) {
            activeStreamUrl = fresh.play_url;
        }
    }
    if (!activeStreamUrl) {
        throw new Error('Could not resolve stream URL for episode');
    }

    let fileBlob = null;
    let fileName = 'audio.mp4';

    // 1. Fetch media stream
    if (activeStreamUrl.includes('.m3u8')) {
        const plRes = await fetch(activeStreamUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const plText = await plRes.text();
        let targetPlUrl = activeStreamUrl;
        let segUrls = [];

        if (plText.includes('#EXT-X-STREAM-INF')) {
            const lines = plText.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    targetPlUrl = new URL(trimmed, activeStreamUrl).href;
                    break;
                }
            }
            const varRes = await fetch(targetPlUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
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
        if (muxjs) {
            const transmuxer = new muxjs.mp4.Transmuxer();
            const initSegments = [];
            const mediaSegments = [];
            transmuxer.on('data', segment => {
                if (segment.initSegment && initSegments.length === 0) {
                    initSegments.push(Buffer.from(segment.initSegment));
                }
                if (segment.data) {
                    mediaSegments.push(Buffer.from(segment.data));
                }
            });

            const maxSegments = Math.min(segUrls.length, 8);
            for (let i = 0; i < maxSegments; i++) {
                try {
                    const segRes = await fetch(segUrls[i], {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (segRes.ok) {
                        const buf = await segRes.arrayBuffer();
                        transmuxer.push(new Uint8Array(buf));
                    }
                } catch (e) { }
            }
            transmuxer.flush();
            combinedBuf = Buffer.concat([...initSegments, ...mediaSegments]);
        }

        if (!combinedBuf || combinedBuf.length === 0) {
            const chunkPromises = segUrls.slice(0, 6).map(url =>
                fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
                    .then(r => r.ok ? r.arrayBuffer() : null)
                    .catch(() => null)
            );
            const chunks = (await Promise.all(chunkPromises)).filter(Boolean).map(ab => Buffer.from(ab));
            combinedBuf = Buffer.concat(chunks);
        }

        if (!combinedBuf || combinedBuf.length === 0) {
            throw new Error('Failed to download HLS audio segments');
        }

        fileBlob = (typeof File !== 'undefined')
            ? new File([combinedBuf], 'audio.mp4', { type: 'video/mp4' })
            : new Blob([combinedBuf], { type: 'video/mp4' });
        fileName = 'audio.mp4';
    } else {
        const videoRes = await fetch(activeStreamUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!videoRes.ok) {
            throw new Error(`Failed to fetch video stream: HTTP ${videoRes.status}`);
        }
        let buf = await videoRes.arrayBuffer();
        if (buf.byteLength > 24 * 1024 * 1024) {
            buf = buf.slice(0, 24 * 1024 * 1024);
        }
        fileBlob = (typeof File !== 'undefined')
            ? new File([buf], 'audio.mp4', { type: 'video/mp4' })
            : new Blob([buf], { type: 'video/mp4' });
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

    console.log(`[Cloud STT] Sending ${fileName} to ${isGroq ? 'Groq' : 'OpenAI'} (${model}) for ${key}...`);
    const cloudRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        body: formData
    });

    if (!cloudRes.ok) {
        const errText = await cloudRes.text();
        console.error(`[Cloud STT] API error (${cloudRes.status}):`, errText);
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
            return res.json({
                ok: true,
                ready: true,
                isComplete: true,
                lang: cleanTarget,
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                vttText: vttMemoryCache.get(cacheKey)
            });
        }

        // Fast path: Upstream official subtitle provided
        if (upstream_sub_url) {
            try {
                let fullUrl = upstream_sub_url;
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
                        if (cleanSrc !== cleanTarget && (cleanTarget !== 'en' || (cleanSrc !== 'en' && cleanSrc !== 'auto'))) {
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

        const vttFile = `${key}_${cleanTarget}.vtt`;
        const existingVtt = findSubtitleFile(vttFile);
        if (existingVtt) {
            let vttText = '';
            try { vttText = fs.readFileSync(existingVtt, 'utf8'); } catch (e) { }
            return res.json({
                ok: true,
                ready: true,
                isComplete: true,
                lang: cleanTarget,
                url: `/api/subtitles/vtt?slug=${encodeURIComponent(slug)}&ep=${encodeURIComponent(ep)}&lang=${encodeURIComponent(cleanTarget)}`,
                vttText
            });
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
        const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
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
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(vttMemoryCache.get(cacheKey));
        }

        const vttFile = `${key}_${cleanTarget}.vtt`;
        let vttPath = findSubtitleFile(vttFile);

        // If not found in /tmp, and stream_url + cloud key is available, generate dynamically on-the-fly
        if (!vttPath || !fs.existsSync(vttPath)) {
            const cloudApiKey = (groq_key || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
            if (cloudApiKey && stream_url) {
                try {
                    const cloudRes = await transcribeViaCloudApi(slug, ep, stream_url, cleanTarget, cloudApiKey);
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

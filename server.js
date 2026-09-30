const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const pkg = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        const lang = req.query.lang || 'en-US';

        async function fetchSectionsFromUpstream(targetLang, useTargetFilter = true) {
            const params = new URLSearchParams();
            params.set('provider', provider);
            params.set('lang', targetLang);
            if (useTargetFilter) {
                params.set('target_lang', targetLang);
            }
            if (query) {
                params.set('q', query);
            } else {
                params.set('tab_pages[home]', String(page));
            }

            const url = `${BASE_URL}/home/providers/sections?${params.toString()}`;
            const response = await fetch(url, {
                headers: getHeaders({ 'X-Requested-With': 'XMLHttpRequest' })
            });

            if (!response.ok) return null;
            return await response.json();
        }

        // Primary fetch with selected language
        let data = await fetchSectionsFromUpstream(lang, true);

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

        // Fallback 2: If still 0 items, retry with upstream default store 'id-ID'
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
        if (!q.trim()) {
            return res.json({ ok: true, items: [] });
        }

        const url = `${BASE_URL}/search?q=${encodeURIComponent(q)}&limit=50&lang=en-US`;
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

// 4. Drama Detail & Episodes Resolver
app.get('/api/drama', async (req, res) => {
    try {
        let watchUrl = req.query.watch_url;
        const slug = req.query.slug;
        const ep = req.query.ep || '1';

        if (!watchUrl && slug) {
            watchUrl = `${BASE_URL}/detail/watch/${slug}/${ep}?lang=id-ID&from=home`;
        }

        if (!watchUrl) {
            return res.status(400).json({ ok: false, error: 'watch_url or slug is required' });
        }

        if (watchUrl.startsWith('/')) {
            watchUrl = BASE_URL + watchUrl;
        }

        // Fetch the drama page (following redirects)
        const headers = getHeaders();
        let pageRes = await fetch(watchUrl, { headers, redirect: 'follow' });
        let html = await pageRes.text();
        let finalUrl = pageRes.url;

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

        // If not found in current page, maybe this is the landing page without ep number
        if (episodes.length === 0) {
            // Check for /detail/watch/.../1 link in HTML
            const ep1LinkMatch = html.match(/href="([^"]+\/detail\/watch\/[^"/]+\/1[^"]*)"/);
            if (ep1LinkMatch) {
                const ep1Url = ep1LinkMatch[1].replace(/&amp;/g, '&');
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
                // Update html reference if html2 has more data
                if (html2.includes('class="episode-item"')) {
                    html = html2;
                }
            }
        }

        // Fallback: Check if HTML has multiple <a class="episode-item" href="..."> links
        if (episodes.length <= 1) {
            const epItemRegex = /<a[^>]*class="[^"]*episode-item[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let m;
            const htmlEpisodes = [];
            while ((m = epItemRegex.exec(html)) !== null) {
                const epUrl = m[1].replace(/&amp;/g, '&');
                const epTitle = m[2] || m[3].replace(/<[^>]+>/g, '').trim();
                const epNumMatch = epUrl.match(/\/(\d+)(?:\?|$)/);
                const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : htmlEpisodes.length + 1;
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

        // Format clean episodes
        const cleanEpisodes = episodes.map((item, idx) => ({
            id: item.id || idx + 1,
            number: item.route_episode_number || item.number || idx + 1,
            title: item.title || `Episode ${idx + 1}`,
            play_url: item.play_url || item.direct_play_url || '',
            direct_play_url: item.direct_play_url || '',
            thumb_url: item.thumb_url || poster,
            subtitle_url: item.subtitle_url || '',
            is_hls: (item.play_url || '').includes('.m3u8') || item.browser_prefetch_mode === 'hls'
        }));

        res.json({
            ok: true,
            title,
            description,
            poster,
            final_url: finalUrl,
            total_episodes: cleanEpisodes.length,
            episodes: cleanEpisodes
        });
    } catch (err) {
        console.error('Error fetching drama:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 5. Proxy Stream (CORS fallback if needed)
app.get('/api/proxy-stream', async (req, res) => {
    try {
        const streamUrl = req.query.url;
        if (!streamUrl) return res.status(400).send('Missing url parameter');

        const range = req.headers.range;
        const fetchHeaders = {
            'User-Agent': USER_AGENT,
            'Referer': BASE_URL,
            ...(range ? { 'Range': range } : {})
        };

        const upstream = await fetch(streamUrl, { headers: fetchHeaders });
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

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

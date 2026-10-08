/**
 * Supabase PostgreSQL Database Client & Analytics Store
 * Host: db.dlywumjpdatioiayewmq.supabase.co
 * Port: 5432
 * Database: postgres
 * User: postgres
 */

const { Pool } = require('pg');

const DB_HOST = process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com';
const DB_PORT = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const DB_USER = process.env.SUPABASE_DB_USER || 'postgres.dlywumjpdatioiayewmq';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'Xuanphuong03022005@';

let pool = null;
let isConnected = false;
let lastConnectionAttempt = 0;
let connectionError = null;

// In-memory fallback buffer (used if database password is not yet configured or during temporary network drops)
const inMemoryVisitsBuffer = [];
const MAX_BUFFER_SIZE = 500;

function getPool() {
    if (pool) return pool;

    const connectionConfig = process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        }
        : {
            host: DB_HOST,
            port: DB_PORT,
            database: DB_NAME,
            user: DB_USER,
            password: DB_PASSWORD,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 8000,
            idleTimeoutMillis: 30000,
            max: 10
        };

    pool = new Pool(connectionConfig);

    pool.on('error', (err) => {
        console.error('[Supabase DB] Unexpected idle client error:', err.message);
        isConnected = false;
        connectionError = err.message;
    });

    return pool;
}

/**
 * Initialize Tables in Supabase PostgreSQL
 */
async function initDatabase() {
    if (!DB_PASSWORD && !process.env.DATABASE_URL) {
        connectionError = 'SUPABASE_DB_PASSWORD is not set in .env';
        console.warn(`[Supabase DB] Notice: ${connectionError}. Visits will be recorded in memory until password is provided.`);
        return false;
    }

    try {
        const client = getPool();
        const start = Date.now();
        const res = await client.query('SELECT NOW() AS current_time');
        const latency = Date.now() - start;
        isConnected = true;
        connectionError = null;
        console.log(`[Supabase DB] Connected successfully to ${DB_HOST} (${latency}ms latency)`);

        await client.query('SET search_path TO public;');

        // Create user_visits table
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.user_visits (
                id BIGSERIAL PRIMARY KEY,
                visitor_id VARCHAR(64),
                ip VARCHAR(64),
                user_agent TEXT,
                device VARCHAR(32),
                browser VARCHAR(32),
                os VARCHAR(32),
                path VARCHAR(255),
                referrer TEXT,
                provider VARCHAR(64),
                drama_title TEXT,
                episode_index INT DEFAULT 0,
                country VARCHAR(64),
                local_time VARCHAR(40),
                page_name VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE public.user_visits ADD COLUMN IF NOT EXISTS local_time VARCHAR(40);
            ALTER TABLE public.user_visits ADD COLUMN IF NOT EXISTS page_name VARCHAR(255);
            CREATE INDEX IF NOT EXISTS idx_user_visits_created_at ON public.user_visits (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_visits_visitor_id ON public.user_visits (visitor_id);
            CREATE INDEX IF NOT EXISTS idx_user_visits_ip ON public.user_visits (ip);
            CREATE INDEX IF NOT EXISTS idx_user_visits_drama ON public.user_visits (drama_title);
        `);

        // Create daily summary cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_traffic_stats (
                date DATE PRIMARY KEY,
                total_pageviews INT DEFAULT 0,
                unique_visitors INT DEFAULT 0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Ensure drama table exists and has all required columns
        await client.query(`
            CREATE TABLE IF NOT EXISTS drama (
                id BIGSERIAL PRIMARY KEY,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS book_id VARCHAR(128);
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS title TEXT;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS poster_url TEXT;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS watch_url TEXT;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS provider VARCHAR(64);
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS total_episodes INT DEFAULT 0;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS is_adult BOOLEAN DEFAULT false;
            ALTER TABLE drama ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

            CREATE UNIQUE INDEX IF NOT EXISTS idx_drama_book_provider ON drama (book_id, provider);
            CREATE INDEX IF NOT EXISTS idx_drama_title ON drama (title);
            CREATE INDEX IF NOT EXISTS idx_drama_provider ON drama (provider);
        `);

        console.log('[Supabase DB] Analytics and drama tables schema verified.');
        return true;
    } catch (err) {
        isConnected = false;
        connectionError = err.message;
        console.error('[Supabase DB] Failed to connect/initialize database:', err.message);
        return false;
    }
}

/**
 * Record a user visit
 */
async function recordVisit(visitData) {
    const now = new Date();
    const localTimeStr = now.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    const pageName = visitData.drama_title
        ? `Xem phim: ${visitData.drama_title}`
        : (visitData.path === '/' || !visitData.path ? 'Trang chủ' : `Trang: ${visitData.path}`);

    const visit = {
        visitor_id: visitData.visitor_id || 'anonymous',
        ip: visitData.ip || '127.0.0.1',
        user_agent: visitData.user_agent || '',
        device: visitData.device || 'Desktop',
        browser: visitData.browser || 'Unknown',
        os: visitData.os || 'Unknown',
        path: visitData.path || '/',
        referrer: visitData.referrer || '',
        provider: visitData.provider || '',
        drama_title: visitData.drama_title || null,
        episode_index: parseInt(visitData.episode_index || 0, 10),
        country: visitData.country || 'VN',
        local_time: localTimeStr,
        page_name: pageName,
        created_at: now
    };

    // Always maintain in-memory buffer for instant realtime stats
    inMemoryVisitsBuffer.unshift(visit);
    if (inMemoryVisitsBuffer.length > MAX_BUFFER_SIZE) {
        inMemoryVisitsBuffer.pop();
    }

    // If connected to Supabase PostgreSQL, write to database
    if (isConnected || DB_PASSWORD || process.env.DATABASE_URL) {
        try {
            const client = getPool();
            const sql = `
                INSERT INTO public.user_visits (
                    visitor_id, ip, user_agent, device, browser, os,
                    path, referrer, provider, drama_title, episode_index, country, local_time, page_name, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            `;
            const values = [
                visit.visitor_id,
                visit.ip,
                visit.user_agent,
                visit.device,
                visit.browser,
                visit.os,
                visit.path,
                visit.referrer,
                visit.provider,
                visit.drama_title,
                visit.episode_index,
                visit.country,
                visit.local_time,
                visit.page_name
            ];
            await client.query(sql, values);
            isConnected = true;
            return { ok: true, stored: 'database' };
        } catch (err) {
            console.error('[Supabase DB] Insert visit error:', err.message);
            isConnected = false;
            connectionError = err.message;
            return { ok: true, stored: 'memory', error: err.message };
        }
    }

    return { ok: true, stored: 'memory' };
}

/**
 * Get comprehensive analytics statistics
 */
async function getAnalyticsStats() {
    // If connected to database, query PostgreSQL
    if (isConnected) {
        try {
            const client = getPool();

            // Total visits & unique visitors
            const totalsRes = await client.query(`
                SELECT 
                    COUNT(*)::INT AS total_visits,
                    COUNT(DISTINCT visitor_id)::INT AS total_unique_visitors,
                    COUNT(DISTINCT ip)::INT AS total_unique_ips
                FROM public.user_visits
            `);

            // Today's stats
            const todayRes = await client.query(`
                SELECT 
                    COUNT(*)::INT AS today_visits,
                    COUNT(DISTINCT visitor_id)::INT AS today_unique_visitors
                FROM public.user_visits
                WHERE created_at >= CURRENT_DATE
            `);

            // Active in last 15 minutes (Real-time online estimate)
            const onlineRes = await client.query(`
                SELECT COUNT(DISTINCT visitor_id)::INT AS active_now
                FROM public.user_visits
                WHERE created_at >= NOW() - INTERVAL '15 minutes'
            `);

            // Device breakdown
            const deviceRes = await client.query(`
                SELECT device, COUNT(*)::INT AS count
                FROM public.user_visits
                GROUP BY device
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top browsers
            const browserRes = await client.query(`
                SELECT browser, COUNT(*)::INT AS count
                FROM public.user_visits
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top operating systems
            const osRes = await client.query(`
                SELECT os, COUNT(*)::INT AS count
                FROM public.user_visits
                GROUP BY os
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top viewed dramas
            const topDramasRes = await client.query(`
                SELECT drama_title, provider, COUNT(*)::INT AS views
                FROM public.user_visits
                WHERE drama_title IS NOT NULL AND drama_title != ''
                GROUP BY drama_title, provider
                ORDER BY views DESC
                LIMIT 10
            `);

            // Top providers
            const topProvidersRes = await client.query(`
                SELECT provider, COUNT(*)::INT AS views
                FROM public.user_visits
                WHERE provider IS NOT NULL AND provider != ''
                GROUP BY provider
                ORDER BY views DESC
                LIMIT 8
            `);

            // 7-day traffic trend
            const trendRes = await client.query(`
                SELECT 
                    TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
                    COUNT(*)::INT AS pageviews,
                    COUNT(DISTINCT visitor_id)::INT AS unique_visitors
                FROM public.user_visits
                WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
                GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
                ORDER BY date ASC
            `);

            return {
                ok: true,
                source: 'supabase_postgres',
                host: DB_HOST,
                totals: totalsRes.rows[0] || { total_visits: 0, total_unique_visitors: 0, total_unique_ips: 0 },
                today: todayRes.rows[0] || { today_visits: 0, today_unique_visitors: 0 },
                active_now: onlineRes.rows[0] ? onlineRes.rows[0].active_now : 0,
                breakdown: {
                    devices: deviceRes.rows,
                    browsers: browserRes.rows,
                    os: osRes.rows,
                    providers: topProvidersRes.rows
                },
                top_dramas: topDramasRes.rows,
                daily_trend: trendRes.rows
            };
        } catch (err) {
            console.error('[Supabase DB] Failed to query stats, falling back to memory:', err.message);
        }
    }

    // In-Memory Fallback calculation
    const totalVisits = inMemoryVisitsBuffer.length;
    const uniqueVisitors = new Set(inMemoryVisitsBuffer.map(v => v.visitor_id)).size;
    const uniqueIps = new Set(inMemoryVisitsBuffer.map(v => v.ip)).size;

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const activeNow = new Set(
        inMemoryVisitsBuffer
            .filter(v => new Date(v.created_at) >= fifteenMinutesAgo)
            .map(v => v.visitor_id)
    ).size;

    const deviceCounts = {};
    const browserCounts = {};
    const osCounts = {};
    const dramaCounts = {};
    const providerCounts = {};

    inMemoryVisitsBuffer.forEach(v => {
        if (v.device) deviceCounts[v.device] = (deviceCounts[v.device] || 0) + 1;
        if (v.browser) browserCounts[v.browser] = (browserCounts[v.browser] || 0) + 1;
        if (v.os) osCounts[v.os] = (osCounts[v.os] || 0) + 1;
        if (v.drama_title) dramaCounts[v.drama_title] = (dramaCounts[v.drama_title] || 0) + 1;
        if (v.provider) providerCounts[v.provider] = (providerCounts[v.provider] || 0) + 1;
    });

    const toSortedArray = (obj, keyName, limit = 5) => Object.entries(obj)
        .map(([k, count]) => ({ [keyName]: k, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    return {
        ok: true,
        source: 'in_memory_buffer',
        host: DB_HOST,
        notice: connectionError ? `Database status: ${connectionError}` : 'Awaiting SUPABASE_DB_PASSWORD in .env',
        totals: {
            total_visits: totalVisits,
            total_unique_visitors: uniqueVisitors,
            total_unique_ips: uniqueIps
        },
        today: {
            today_visits: totalVisits,
            today_unique_visitors: uniqueVisitors
        },
        active_now: activeNow,
        breakdown: {
            devices: toSortedArray(deviceCounts, 'device'),
            browsers: toSortedArray(browserCounts, 'browser'),
            os: toSortedArray(osCounts, 'os'),
            providers: toSortedArray(providerCounts, 'provider')
        },
        top_dramas: Object.entries(dramaCounts).map(([drama_title, views]) => ({ drama_title, views })).sort((a, b) => b.views - a.views).slice(0, 10),
        daily_trend: []
    };
}

/**
 * Get recent raw visits log
 */
async function getRecentVisits(limit = 50) {
    if (isConnected) {
        try {
            const client = getPool();
            const res = await client.query(`
                SELECT id, visitor_id, ip, device, browser, os, path, provider, drama_title, episode_index, local_time, page_name, created_at
                FROM public.user_visits
                ORDER BY created_at DESC
                LIMIT $1
            `, [Math.min(limit, 100)]);
            return { ok: true, source: 'supabase_postgres', visits: res.rows };
        } catch (err) {
            console.error('[Supabase DB] Failed to query recent visits:', err.message);
        }
    }

    return {
        ok: true,
        source: 'in_memory_buffer',
        visits: inMemoryVisitsBuffer.slice(0, limit)
    };
}

/**
 * Helper to parse User-Agent
 */
function parseUserAgent(uaString = '') {
    const ua = uaString.toLowerCase();
    let device = 'Desktop';
    let browser = 'Unknown';
    let os = 'Unknown';

    if (/mobile|android|iphone|ipod/i.test(ua)) {
        device = 'Mobile';
    } else if (/ipad|tablet/i.test(ua)) {
        device = 'Tablet';
    }

    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/opr\//i.test(ua)) browser = 'Opera';

    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    return { device, browser, os };
}

/**
 * Upsert a single drama into Supabase drama table
 */
async function saveDrama(drama) {
    if (!drama || (!drama.book_id && !drama.title)) return null;
    if (!isConnected && !DB_PASSWORD && !process.env.DATABASE_URL) return null;

    try {
        const client = getPool();
        const bookId = String(drama.book_id || drama.id || Math.random().toString(36).slice(2, 10));
        const provider = String(drama.provider || drama.category_name || 'dramabox').toLowerCase().trim();
        const title = String(drama.title || 'Untitled').trim();
        const description = String(drama.description || '').trim();
        const posterUrl = String(drama.poster_url || drama.poster || '').trim();
        const watchUrl = String(drama.watch_url || '').trim();
        const episodesCount = parseInt(drama.total_episodes || drama.episodes_count || (drama.episodes ? drama.episodes.length : 0), 10) || 0;
        const tags = Array.isArray(drama.tag_names || drama.tags) ? (drama.tag_names || drama.tags) : [];
        const isAdult = Boolean(drama.is_adult);

        const sql = `
            INSERT INTO drama (
                book_id, title, description, poster_url, watch_url,
                provider, total_episodes, tags, is_adult, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (book_id, provider) DO UPDATE SET
                title = CASE WHEN EXCLUDED.title != '' THEN EXCLUDED.title ELSE drama.title END,
                description = CASE WHEN EXCLUDED.description != '' THEN EXCLUDED.description ELSE drama.description END,
                poster_url = CASE WHEN EXCLUDED.poster_url != '' THEN EXCLUDED.poster_url ELSE drama.poster_url END,
                watch_url = CASE WHEN EXCLUDED.watch_url != '' THEN EXCLUDED.watch_url ELSE drama.watch_url END,
                total_episodes = GREATEST(EXCLUDED.total_episodes, drama.total_episodes),
                tags = CASE WHEN EXCLUDED.tags != '[]'::jsonb THEN EXCLUDED.tags ELSE drama.tags END,
                is_adult = EXCLUDED.is_adult,
                updated_at = NOW()
            RETURNING id, book_id, title;
        `;

        const values = [
            bookId,
            title,
            description,
            posterUrl,
            watchUrl,
            provider,
            episodesCount,
            JSON.stringify(tags),
            isAdult
        ];

        const res = await client.query(sql, values);
        return res.rows[0];
    } catch (err) {
        console.error('[Supabase DB] saveDrama error:', err.message);
        return null;
    }
}

/**
 * Batch upsert dramas into Supabase drama table
 */
async function saveDramasBatch(dramaList) {
    if (!Array.isArray(dramaList) || !dramaList.length) return 0;
    let saved = 0;
    for (const d of dramaList) {
        if (d && (d.title || d.book_id)) {
            const res = await saveDrama(d);
            if (res) saved++;
        }
    }
    return saved;
}

/**
 * Query dramas from Supabase drama table
 */
async function getDramas(limit = 50, offset = 0, provider = null) {
    if (!isConnected) return [];
    try {
        const client = getPool();
        let sql = 'SELECT * FROM drama';
        const params = [];
        if (provider) {
            params.push(provider.toLowerCase());
            sql += ' WHERE provider = $1 ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            params.push(limit, offset);
        } else {
            sql += ' ORDER BY updated_at DESC LIMIT $1 OFFSET $2';
            params.push(limit, offset);
        }
        const res = await client.query(sql, params);
        return res.rows;
    } catch (err) {
        console.error('[Supabase DB] getDramas error:', err.message);
        return [];
    }
}

/**
 * Get total dramas count in Supabase
 */
async function getDramaCount() {
    if (!isConnected) return 0;
    try {
        const client = getPool();
        const res = await client.query('SELECT COUNT(*)::INT AS count FROM drama');
        return res.rows[0]?.count || 0;
    } catch (err) {
        return 0;
    }
}

module.exports = {
    initDatabase,
    recordVisit,
    getAnalyticsStats,
    getRecentVisits,
    parseUserAgent,
    saveDrama,
    saveDramasBatch,
    getDramas,
    getDramaCount,
    getStatus: () => ({
        connected: isConnected,
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        hasPassword: Boolean(DB_PASSWORD || process.env.DATABASE_URL),
        error: connectionError
    })
};

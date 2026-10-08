/**
 * Supabase PostgreSQL Database Client & Analytics Store
 * Host: db.dlywumjpdatioiayewmq.supabase.co
 * Port: 5432
 * Database: postgres
 * User: postgres
 */

const { Pool } = require('pg');

const DB_HOST = process.env.SUPABASE_DB_HOST || 'db.dlywumjpdatioiayewmq.supabase.co';
const DB_PORT = parseInt(process.env.SUPABASE_DB_PORT || '5432', 10);
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const DB_USER = process.env.SUPABASE_DB_USER || 'postgres';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || '';

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

        // Create user_visits table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_visits (
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_user_visits_created_at ON user_visits (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_visits_visitor_id ON user_visits (visitor_id);
            CREATE INDEX IF NOT EXISTS idx_user_visits_ip ON user_visits (ip);
            CREATE INDEX IF NOT EXISTS idx_user_visits_drama ON user_visits (drama_title);
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

        console.log('[Supabase DB] Analytics tables schema verified.');
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
        created_at: new Date()
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
                INSERT INTO user_visits (
                    visitor_id, ip, user_agent, device, browser, os,
                    path, referrer, provider, drama_title, episode_index, country, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
                visit.country
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
                FROM user_visits
            `);

            // Today's stats
            const todayRes = await client.query(`
                SELECT 
                    COUNT(*)::INT AS today_visits,
                    COUNT(DISTINCT visitor_id)::INT AS today_unique_visitors
                FROM user_visits
                WHERE created_at >= CURRENT_DATE
            `);

            // Active in last 15 minutes (Real-time online estimate)
            const onlineRes = await client.query(`
                SELECT COUNT(DISTINCT visitor_id)::INT AS active_now
                FROM user_visits
                WHERE created_at >= NOW() - INTERVAL '15 minutes'
            `);

            // Device breakdown
            const deviceRes = await client.query(`
                SELECT device, COUNT(*)::INT AS count
                FROM user_visits
                GROUP BY device
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top browsers
            const browserRes = await client.query(`
                SELECT browser, COUNT(*)::INT AS count
                FROM user_visits
                GROUP BY browser
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top operating systems
            const osRes = await client.query(`
                SELECT os, COUNT(*)::INT AS count
                FROM user_visits
                GROUP BY os
                ORDER BY count DESC
                LIMIT 5
            `);

            // Top viewed dramas
            const topDramasRes = await client.query(`
                SELECT drama_title, provider, COUNT(*)::INT AS views
                FROM user_visits
                WHERE drama_title IS NOT NULL AND drama_title != ''
                GROUP BY drama_title, provider
                ORDER BY views DESC
                LIMIT 10
            `);

            // Top providers
            const topProvidersRes = await client.query(`
                SELECT provider, COUNT(*)::INT AS views
                FROM user_visits
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
                FROM user_visits
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
                SELECT id, visitor_id, ip, device, browser, os, path, provider, drama_title, episode_index, created_at
                FROM user_visits
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

module.exports = {
    initDatabase,
    recordVisit,
    getAnalyticsStats,
    getRecentVisits,
    parseUserAgent,
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

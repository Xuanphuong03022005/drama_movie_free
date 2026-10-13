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
        `);

        // Create table view as requested by user
        await client.query(`
            CREATE TABLE IF NOT EXISTS public."view" (
                id BIGSERIAL PRIMARY KEY,
                loai_thiet_bi VARCHAR(64),
                trinh_duyet VARCHAR(64),
                thoi_gian VARCHAR(64),
                device VARCHAR(64),
                browser VARCHAR(64),
                ip VARCHAR(64),
                path VARCHAR(255),
                drama_title TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_view_created_at ON public."view" (created_at DESC);
        `);

        console.log('[Supabase DB] Analytics, view and drama tables schema verified.');
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

            // Also record into table view specifically requested by user
            try {
                const viewSql = `
                    INSERT INTO public."view" (
                        loai_thiet_bi, trinh_duyet, thoi_gian,
                        device, browser, ip, path, drama_title, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                `;
                await client.query(viewSql, [
                    visit.device,
                    visit.browser,
                    visit.local_time,
                    visit.device,
                    visit.browser,
                    visit.ip,
                    visit.path,
                    visit.drama_title
                ]);
            } catch (vErr) {
                console.error('[Supabase DB] Insert into view table error:', vErr.message);
            }

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

/**
 * Helper to compute user VIP status and normalize user fields
 */
function formatUser(row) {
    if (!row) return null;
    const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
    const isVip = Boolean(expiresAt && expiresAt > new Date());
    let vipRemainingDays = 0;
    if (isVip && expiresAt) {
        const diff = expiresAt.getTime() - Date.now();
        vipRemainingDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    return {
        id: String(row.id),
        username: row.username || '',
        email: row.email || null,
        phone: row.phone || null,
        full_name: row.full_name || '',
        role: row.role || 'user',
        status: row.status || 'active',
        balance: parseFloat(row.balance) || 0,
        subscription_plan_id: row.subscription_plan_id ? String(row.subscription_plan_id) : null,
        subscription_expires_at: row.subscription_expires_at,
        avatar_url: row.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.username || 'user'}`,
        can_access_user_table: Boolean(row.can_access_user_table),
        approval_status: row.approval_status || (row.can_access_user_table ? 'approved' : 'pending'),
        approved_at: row.approved_at,
        is_vip: isVip,
        vip_remaining_days: vipRemainingDays,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

/**
 * Register user with Gmail
 */
async function registerWithGmail({ email, full_name, password }) {
    if (!email || !email.trim()) {
        throw new Error('Địa chỉ Gmail là bắt buộc');
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        throw new Error('Định dạng email không hợp lệ');
    }

    const client = getPool();
    // Check if email already registered
    const existCheck = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [cleanEmail]);
    if (existCheck.rows.length > 0) {
        throw new Error(`Địa chỉ Gmail "${cleanEmail}" đã được đăng ký trên hệ thống! Vui lòng đăng nhập.`);
    }

    // Generate unique username
    let baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (!baseUsername) baseUsername = `user_${Date.now().toString().slice(-6)}`;
    let username = baseUsername;
    let count = 1;
    while (true) {
        const uCheck = await client.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [username]);
        if (uCheck.rows.length === 0) break;
        username = `${baseUsername}_${count++}`;
    }

    const displayName = full_name && full_name.trim() ? full_name.trim() : username;
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    const insertSql = `
        INSERT INTO users (
            username, email, full_name, password_hash, role, status,
            balance, can_access_user_table, approval_status, avatar_url, updated_at
        ) VALUES ($1, $2, $3, $4, 'user', 'active', 0, false, 'pending', $5, NOW())
        RETURNING *
    `;
    const res = await client.query(insertSql, [username, cleanEmail, displayName, password || null, avatarUrl]);
    const user = formatUser(res.rows[0]);
    return {
        user,
        message: `Đăng ký thành công tài khoản Gmail "${cleanEmail}". Tài khoản được kích hoạt để xem phim!`
    };
}

/**
 * Login with email or username
 */
async function loginUser({ identifier, password }) {
    if (!identifier || !identifier.trim()) {
        throw new Error('Vui lòng nhập Email hoặc Tên tài khoản');
    }
    const cleanId = identifier.trim();
    const client = getPool();
    let res;
    if (cleanId.includes('@')) {
        res = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [cleanId.toLowerCase()]);
    } else {
        res = await client.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [cleanId.toLowerCase()]);
    }

    if (res.rows.length === 0) {
        throw new Error(`Không tìm thấy tài khoản với thông tin: ${cleanId}`);
    }

    const row = res.rows[0];
    if (row.status !== 'active') {
        throw new Error('Tài khoản này hiện đang bị tạm khóa');
    }

    const user = formatUser(row);
    return {
        user,
        canAccessUserTable: user.can_access_user_table,
        approvalStatus: user.approval_status
    };
}

/**
 * Get user by ID
 */
async function getUserById(id) {
    if (!id) return null;
    const client = getPool();
    const res = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    if (res.rows.length === 0) return null;
    return formatUser(res.rows[0]);
}

/**
 * Get demo quick accounts for fast 1-click test login
 */
async function getQuickDemoUsers() {
    try {
        const client = getPool();
        const res = await client.query(`
            SELECT id, username, email, full_name, role, balance, subscription_expires_at, can_access_user_table, approval_status, avatar_url
            FROM users
            ORDER BY id ASC
            LIMIT 5
        `);
        return res.rows.map(formatUser);
    } catch (e) {
        return [];
    }
}

/**
 * Get system policy settings
 */
async function getSystemSettings() {
    try {
        const client = getPool();
        const res = await client.query('SELECT setting_key, setting_value, description FROM system_settings');
        const settingsMap = {};
        res.rows.forEach(r => {
            settingsMap[r.setting_key] = r.setting_value;
        });
        const defaultFreePercent = parseFloat(settingsMap.default_free_episode_percent || '20');
        const defaultTotalEpisodes = parseInt(settingsMap.default_total_episodes || '30', 10);
        return {
            default_free_episode_percent: defaultFreePercent,
            default_total_episodes: defaultTotalEpisodes,
            raw: settingsMap
        };
    } catch (e) {
        return {
            default_free_episode_percent: 20,
            default_total_episodes: 30,
            raw: {}
        };
    }
}

/**
 * Get access setting for a specific drama
 */
async function getDramaAccessSetting(dramaTitle) {
    if (!dramaTitle || !dramaTitle.trim()) return null;
    try {
        const client = getPool();
        const res = await client.query(
            'SELECT * FROM drama_access_settings WHERE LOWER(TRIM(drama_title)) = LOWER(TRIM($1)) LIMIT 1',
            [dramaTitle.trim()]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const total = parseInt(row.total_episodes || 30, 10);
        const percent = parseFloat(row.free_episode_percent || 20);
        const freeCount = row.custom_free_episodes_count !== null && row.custom_free_episodes_count !== undefined
            ? parseInt(row.custom_free_episodes_count, 10)
            : Math.min(total, Math.ceil(total * (percent / 100)));

        return {
            id: String(row.id),
            drama_title: row.drama_title,
            total_episodes: total,
            free_episode_percent: percent,
            custom_free_episodes_count: row.custom_free_episodes_count,
            free_episodes_count: freeCount,
            is_all_free: Boolean(row.is_all_free),
            is_vip_only: Boolean(row.is_vip_only),
            note: row.note || ''
        };
    } catch (e) {
        return null;
    }
}

/**
 * Get all active subscription plans from admin
 */
async function getSubscriptionPlans() {
    try {
        const client = getPool();
        const res = await client.query(`
            SELECT id, name, code, duration_days, price, original_price, badge, description, features, is_active, sort_order
            FROM subscription_plans
            WHERE is_active = true
            ORDER BY sort_order ASC, price ASC
        `);
        return res.rows.map(r => ({
            id: String(r.id),
            name: r.name,
            code: r.code,
            duration_days: parseInt(r.duration_days, 10),
            price: parseFloat(r.price),
            original_price: r.original_price ? parseFloat(r.original_price) : null,
            badge: r.badge || '',
            description: r.description || '',
            features: typeof r.features === 'string' ? JSON.parse(r.features) : (r.features || []),
            is_active: Boolean(r.is_active),
            sort_order: r.sort_order || 0
        }));
    } catch (e) {
        return [];
    }
}

/**
 * Purchase a subscription plan
 */
async function purchaseSubscription({ userId, planId, paymentMethod = 'wallet' }) {
    if (!userId || !planId) {
        throw new Error('Cần cung cấp userId và planId để mua gói');
    }
    const client = getPool();

    // 1. Fetch user
    const uRes = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rows.length === 0) throw new Error('Không tìm thấy người dùng');
    const userRow = uRes.rows[0];
    if (userRow.status !== 'active') throw new Error('Tài khoản này đang bị khóa');

    // 2. Fetch plan
    const pRes = await client.query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true LIMIT 1', [planId]);
    if (pRes.rows.length === 0) throw new Error('Gói xem phim không tồn tại hoặc đã tạm ngưng');
    const plan = pRes.rows[0];
    const planPrice = parseFloat(plan.price);
    const durationDays = parseInt(plan.duration_days, 10);

    const userBalance = parseFloat(userRow.balance || 0);
    // If wallet payment, check balance (or allow demo top-up if user chooses test)
    if (paymentMethod === 'wallet' && userBalance < planPrice) {
        throw new Error(`Số dư ví (${new Intl.NumberFormat('vi-VN').format(userBalance)}đ) không đủ để mua gói (${new Intl.NumberFormat('vi-VN').format(planPrice)}đ).`);
    }

    // 3. Begin transaction
    await client.query('BEGIN');
    try {
        // Deduct balance if wallet
        if (paymentMethod === 'wallet') {
            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [planPrice, userId]);
        }

        // Extend VIP
        const updateVipSql = `
            UPDATE users
            SET 
                subscription_plan_id = $1,
                subscription_expires_at = (
                    CASE 
                        WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
                        THEN subscription_expires_at + ($2 || ' days')::INTERVAL
                        ELSE NOW() + ($2 || ' days')::INTERVAL
                    END
                ),
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `;
        const updatedUserRes = await client.query(updateVipSql, [planId, durationDays, userId]);

        // Insert order record into user_subscriptions
        const now = new Date();
        const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
        await client.query(`
            INSERT INTO user_subscriptions (
                user_id, plan_id, plan_name, duration_days, price_paid,
                payment_method, start_date, end_date, status, note, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'active', $8, NOW())
        `, [
            userId,
            planId,
            plan.name,
            durationDays,
            planPrice,
            paymentMethod,
            endDate,
            `Kích hoạt ${plan.name} qua cổng người dùng`
        ]);

        await client.query('COMMIT');
        const updatedUser = formatUser(updatedUserRes.rows[0]);
        return {
            ok: true,
            user: updatedUser,
            plan: {
                id: String(plan.id),
                name: plan.name,
                duration_days: durationDays,
                price: planPrice
            },
            message: `Kích hoạt thành công ${plan.name}! Bạn có thêm ${durationDays} ngày VIP để xem toàn bộ phim.`
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
}

/**
 * Top-up user wallet balance
 */
async function topupWallet({ userId, amount, paymentMethod = 'vietqr', transactionCode = '' }) {
    if (!userId) throw new Error('Cần cung cấp userId để nạp tiền');
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Số tiền nạp không hợp lệ (tối thiểu 10.000đ)');
    }
    const client = getPool();
    const uRes = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rows.length === 0) throw new Error('Không tìm thấy tài khoản người dùng');

    const updateRes = await client.query(
        'UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [numAmount, userId]
    );
    const updatedUser = formatUser(updateRes.rows[0]);
    return {
        user: updatedUser,
        amount: numAmount,
        paymentMethod,
        transactionCode: transactionCode || `TOPUP_${Date.now()}`
    };
}

/**
 * Check whether a user has permission to watch an episode under admin policies
 */
async function checkEpisodeAccess({ userId, dramaTitle, episodeNumber = 1, totalEpisodes }) {
    const epNum = Math.max(1, parseInt(episodeNumber, 10) || 1);
    const system = await getSystemSettings();
    const specificSetting = await getDramaAccessSetting(dramaTitle);

    let effectiveTotal = parseInt(totalEpisodes, 10) || (specificSetting && specificSetting.total_episodes) || system.default_total_episodes || 40;
    let freePercent = (specificSetting && specificSetting.free_episode_percent !== undefined)
        ? parseFloat(specificSetting.free_episode_percent)
        : (system.default_free_episode_percent || 90);
    let isAllFree = false;
    let isVipOnly = false;
    let freeCount = 0;
    let isCustomRule = false;

    if (specificSetting) {
        isCustomRule = true;
        isAllFree = specificSetting.is_all_free || freePercent >= 100;
        isVipOnly = specificSetting.is_vip_only || freePercent <= 0;
        if (specificSetting.custom_free_episodes_count !== null && specificSetting.custom_free_episodes_count !== undefined) {
            freeCount = parseInt(specificSetting.custom_free_episodes_count, 10);
        } else {
            freeCount = Math.min(effectiveTotal, Math.ceil(effectiveTotal * (freePercent / 100)));
        }
    } else {
        isAllFree = freePercent >= 100;
        isVipOnly = freePercent <= 0;
        freeCount = Math.min(effectiveTotal, Math.ceil(effectiveTotal * (freePercent / 100)));
    }

    let user = null;
    let isVip = false;
    let vipRemainingDays = 0;

    if (userId) {
        user = await getUserById(userId);
        if (user) {
            isVip = user.is_vip;
            vipRemainingDays = user.vip_remaining_days;
        }
    }

    let canWatch = false;
    let accessType = 'LOCKED';
    let message = '';

    if (isAllFree) {
        canWatch = true;
        accessType = 'ALL_FREE';
        message = 'Bộ phim này được mở miễn phí toàn bộ các tập!';
    } else if (isVipOnly) {
        if (isVip) {
            canWatch = true;
            accessType = 'VIP_EXCLUSIVE';
            message = `Bạn được xem tập ${epNum} nhờ đặc quyền VIP (còn ${vipRemainingDays} ngày).`;
        } else {
            canWatch = false;
            accessType = 'VIP_REQUIRED';
            message = 'Bộ phim này thuộc diện VIP độc quyền (Khóa 100%). Cần đăng ký gói VIP để xem.';
        }
    } else if (epNum <= freeCount) {
        canWatch = true;
        accessType = 'FREE_PREVIEW';
        message = `Tập ${epNum} nằm trong diện xem miễn phí (${freeCount}/${effectiveTotal} tập đầu - theo mức ${freePercent}% áp dụng cho tất cả phim).`;
    } else {
        if (isVip) {
            canWatch = true;
            accessType = 'VIP_UNLOCKED';
            message = `Tập ${epNum} mở khóa nhờ gói xem phim VIP của bạn (hạn còn: ${vipRemainingDays} ngày).`;
        } else {
            canWatch = false;
            accessType = 'LOCKED_BUY_PLAN';
            message = `Tập ${epNum} bị khóa! Hệ thống cho phép xem miễn phí ${freeCount}/${effectiveTotal} tập đầu (${freePercent}%). Vui lòng đăng ký gói VIP để tiếp tục theo dõi trọn bộ.`;
        }
    }

    return {
        canWatch,
        accessType,
        message,
        requestedEpisode: epNum,
        rule: {
            drama_title: dramaTitle,
            total_episodes: effectiveTotal,
            free_episode_percent: freePercent,
            free_episodes_count: freeCount,
            is_all_free: isAllFree,
            is_vip_only: isVipOnly,
            is_custom_rule: isCustomRule
        },
        user: user ? {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            is_vip: isVip,
            vip_remaining_days: vipRemainingDays,
            balance: user.balance
        } : null
    };
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
    formatUser,
    registerWithGmail,
    loginUser,
    getUserById,
    getQuickDemoUsers,
    getSystemSettings,
    getDramaAccessSetting,
    getSubscriptionPlans,
    purchaseSubscription,
    topupWallet,
    checkEpisodeAccess,
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


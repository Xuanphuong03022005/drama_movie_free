/**
 * ===================================================================
 * SUPABASE DATA PERSISTENCE & STORAGE MANAGER (supabase.js)
 * ===================================================================
 * File chuyên trách quản lý toàn bộ các tác vụ lưu và đồng bộ dữ liệu
 * lên cơ sở dữ liệu Supabase PostgreSQL:
 * 
 * 1. QUẢN LÝ KẾT NỐI: Connection Pool, Schema Init, Health Check
 * 2. LƯU DỮ LIỆU PHIM (DRAMAS): Upsert phim đơn, Batch upsert, Sync từ JSON
 * 3. LƯU LƯỢT XEM & THỐNG KÊ (VIEWS/VISITS): user_visits, view, daily_traffic_stats
 * 4. LƯU NGƯỜI DÙNG (USERS/AUTH): Google OAuth, Gmail, Password hashing
 * 5. LƯU GIAO DỊCH & VÍ (TRANSACTIONS): VIP Subscriptions, Wallet Topup
 * ===================================================================
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Tự động load biến môi trường từ .env nếu chưa được load
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

// Cấu hình kết nối Supabase PostgreSQL
const DB_HOST = process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com';
const DB_PORT = parseInt(process.env.SUPABASE_DB_PORT || '6543', 10);
const DB_NAME = process.env.SUPABASE_DB_NAME || 'postgres';
const DB_USER = process.env.SUPABASE_DB_USER || 'postgres.dlywumjpdatioiayewmq';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'Xuanphuong03022005@';

let pool = null;
let isConnected = false;
let lastConnectionAttempt = 0;
let connectionError = null;

// Bộ đệm in-memory dự phòng khi mạng chập chờn
const inMemoryVisitsBuffer = [];
const MAX_BUFFER_SIZE = 500;

/**
 * 1. KHỞI TẠO POOL KẾT NỐI SUPABASE
 */
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
 * KHỞI TẠO VÀ KIỂM TRA SCHEMA CÁC BẢNG TRÊN SUPABASE
 */
async function initDatabase() {
    const now = Date.now();
    if (now - lastConnectionAttempt < 10000 && !isConnected) {
        return false;
    }
    lastConnectionAttempt = now;

    if (!DB_PASSWORD && !process.env.DATABASE_URL) {
        connectionError = 'SUPABASE_DB_PASSWORD is not set in .env';
        console.warn(`[Supabase DB] Notice: ${connectionError}. Visits will be recorded in memory until password is provided.`);
        return false;
    }

    try {
        const client = getPool();
        const start = Date.now();
        await client.query('SELECT 1');
        const latency = Date.now() - start;
        isConnected = true;
        connectionError = null;
        console.log(`[Supabase DB] Connected successfully to ${DB_HOST} (${latency}ms latency)`);

        // Khởi tạo bảng thống kê và lượt truy cập
        await client.query(`
            CREATE TABLE IF NOT EXISTS public.user_visits (
                id BIGSERIAL PRIMARY KEY,
                visitor_id VARCHAR(128) NOT NULL,
                ip VARCHAR(64),
                user_agent TEXT,
                device VARCHAR(64),
                browser VARCHAR(64),
                os VARCHAR(64),
                path VARCHAR(255) DEFAULT '/',
                referrer TEXT,
                provider VARCHAR(64),
                drama_title TEXT,
                episode_index INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE public.user_visits ADD COLUMN IF NOT EXISTS time_local VARCHAR(64);
            ALTER TABLE public.user_visits ADD COLUMN IF NOT EXISTS time_gmt7 VARCHAR(64);
            ALTER TABLE public.user_visits ADD COLUMN IF NOT EXISTS page_name VARCHAR(255);
            CREATE INDEX IF NOT EXISTS idx_user_visits_created_at ON public.user_visits (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_visits_visitor_id ON public.user_visits (visitor_id);
            CREATE INDEX IF NOT EXISTS idx_user_visits_ip ON public.user_visits (ip);
            CREATE INDEX IF NOT EXISTS idx_user_visits_drama ON public.user_visits (drama_title);
        `);

        // Bảng tổng hợp thống kê ngày
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_traffic_stats (
                date DATE PRIMARY KEY,
                total_pageviews INT DEFAULT 0,
                unique_visitors INT DEFAULT 0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Bảng lưu phim (drama)
        await client.query(`
            CREATE TABLE IF NOT EXISTS drama (
                id BIGSERIAL PRIMARY KEY,
                book_id VARCHAR(128),
                title TEXT,
                description TEXT,
                poster_url TEXT,
                watch_url TEXT,
                provider VARCHAR(64) DEFAULT 'dramabox',
                total_episodes INT DEFAULT 0,
                tags JSONB DEFAULT '[]'::jsonb,
                is_adult BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS book_id VARCHAR(128);
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS title TEXT;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS description TEXT;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS poster_url TEXT;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS watch_url TEXT;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS provider VARCHAR(64) DEFAULT 'dramabox';
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS total_episodes INT DEFAULT 0;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS is_adult BOOLEAN DEFAULT FALSE;
            ALTER TABLE public.drama ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_drama_provider ON drama (provider);
            CREATE INDEX IF NOT EXISTS idx_drama_title ON drama (title);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_drama_book_provider ON drama (book_id, provider);
        `);

        // Bảng view lượt xem chi tiết
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

        console.log('[Supabase DB] Schema verified for all core tables.');
        return true;
    } catch (err) {
        isConnected = false;
        connectionError = err.message;
        console.error('[Supabase DB] Failed to connect/initialize database:', err.message);
        return false;
    }
}

// ===================================================================
// 2. CÁC HÀM LƯU DỮ LIỆU PHIM (DRAMAS) LÊN SUPABASE
// ===================================================================

/**
 * Lưu hoặc cập nhật (Upsert) 1 bộ phim lên Supabase
 * @param {Object} drama Dữ liệu phim cần lưu
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
 * Lưu danh sách nhiều phim lên Supabase (Batch Upsert)
 * @param {Array} dramaList Mảng các phim
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
 * Lấy danh sách phim đã lưu trên Supabase
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
 * Đếm tổng số lượng phim đã lưu trên Supabase
 */
async function getDramaCount() {
    if (!isConnected) return 0;
    try {
        const client = getPool();
        const res = await client.query('SELECT COUNT(*) as total FROM drama');
        return parseInt(res.rows[0].total, 10) || 0;
    } catch (err) {
        return 0;
    }
}

/**
 * ĐỒNG BỘ TOÀN BỘ PHIM TỪ FILE DỰ PHÒNG LÊN SUPABASE
 */
async function syncLocalDramasToSupabase() {
    const results = { totalFound: 0, savedCount: 0, errors: [] };
    try {
        const dPath = path.join(__dirname, 'data', 'fallback_dramas.json');
        if (!fs.existsSync(dPath)) {
            throw new Error(`File ${dPath} không tồn tại`);
        }
        const data = JSON.parse(fs.readFileSync(dPath, 'utf8'));
        const dramaList = Object.values(data);
        results.totalFound = dramaList.length;

        console.log(`[Supabase Sync] Bắt đầu đồng bộ ${dramaList.length} phim lên Supabase...`);
        for (const item of dramaList) {
            try {
                const res = await saveDrama(item);
                if (res) results.savedCount++;
            } catch (err) {
                results.errors.push({ title: item.title, error: err.message });
            }
        }
        console.log(`[Supabase Sync] Hoàn thành! Đã lưu thành công ${results.savedCount}/${results.totalFound} phim.`);
    } catch (err) {
        console.error('[Supabase Sync] Lỗi khi đồng bộ dữ liệu phim:', err.message);
        results.errors.push({ error: err.message });
    }
    return results;
}

// ===================================================================
// 3. CÁC HÀM LƯU THỐNG KÊ & LƯỢT XEM (VIEWS/VISITS) LÊN SUPABASE
// ===================================================================

function parseUserAgent(ua = '') {
    let device = 'Desktop';
    let browser = 'Other';
    let os = 'Unknown OS';

    if (/mobile/i.test(ua)) device = 'Mobile';
    else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    return { device, browser, os };
}

/**
 * Ghi nhận lượt truy cập và lượt xem phim lên Supabase
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

    const parsed = parseUserAgent(visitData.user_agent);
    const enriched = {
        visitor_id: visitData.visitor_id || 'anonymous',
        ip: visitData.ip || '127.0.0.1',
        user_agent: visitData.user_agent || '',
        device: visitData.device || parsed.device,
        browser: visitData.browser || parsed.browser,
        os: visitData.os || parsed.os,
        path: visitData.path || '/',
        referrer: visitData.referrer || '',
        provider: visitData.provider || '',
        drama_title: visitData.drama_title || null,
        episode_index: parseInt(visitData.episode_index || 0, 10),
        time_local: localTimeStr,
        page_name: visitData.page_name || (visitData.drama_title ? `Phim: ${visitData.drama_title}` : 'Trang chủ'),
        created_at: now.toISOString()
    };

    // Lưu đệm memory
    inMemoryVisitsBuffer.unshift(enriched);
    if (inMemoryVisitsBuffer.length > MAX_BUFFER_SIZE) {
        inMemoryVisitsBuffer.pop();
    }

    if (isConnected) {
        try {
            const client = getPool();
            const sql = `
                INSERT INTO public.user_visits (
                    visitor_id, ip, user_agent, device, browser, os,
                    path, referrer, provider, drama_title, episode_index,
                    time_local, page_name, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            `;
            const values = [
                enriched.visitor_id,
                enriched.ip,
                enriched.user_agent,
                enriched.device,
                enriched.browser,
                enriched.os,
                enriched.path,
                enriched.referrer,
                enriched.provider,
                enriched.drama_title,
                enriched.episode_index,
                enriched.time_local,
                enriched.page_name
            ];
            await client.query(sql, values);

            // Ghi vào bảng view nếu xem phim
            if (enriched.drama_title) {
                try {
                    await client.query(`
                        INSERT INTO public."view" (
                            loai_thiet_bi, trinh_duyet, thoi_gian,
                            device, browser, ip, path, drama_title, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    `, [
                        enriched.device,
                        enriched.browser,
                        enriched.time_local,
                        enriched.device,
                        enriched.browser,
                        enriched.ip,
                        enriched.path,
                        enriched.drama_title
                    ]);
                } catch (vErr) {
                    console.error('[Supabase DB] Insert into view table error:', vErr.message);
                }
            }

            return { ok: true, stored: 'supabase' };
        } catch (err) {
            console.error('[Supabase DB] Insert visit error:', err.message);
            return { ok: true, stored: 'memory_fallback', error: err.message };
        }
    }

    return { ok: true, stored: 'memory' };
}

/**
 * Lấy thống kê Analytics từ Supabase
 */
async function getAnalyticsStats() {
    if (!isConnected) {
        return {
            source: 'in_memory_cache',
            totalVisits: inMemoryVisitsBuffer.length,
            uniqueVisitors: new Set(inMemoryVisitsBuffer.map(v => v.visitor_id)).size,
            recentVisits: inMemoryVisitsBuffer.slice(0, 15)
        };
    }

    try {
        const client = getPool();
        const totalRes = await client.query('SELECT COUNT(*) as total FROM public.user_visits');
        const uniqueRes = await client.query('SELECT COUNT(DISTINCT visitor_id) as total FROM public.user_visits');
        const todayRes = await client.query("SELECT COUNT(*) as total FROM public.user_visits WHERE created_at >= CURRENT_DATE");
        const topDramasRes = await client.query(`
            SELECT drama_title, COUNT(*) as views 
            FROM public.user_visits 
            WHERE drama_title IS NOT NULL AND drama_title != ''
            GROUP BY drama_title 
            ORDER BY views DESC 
            LIMIT 10
        `);

        return {
            source: 'supabase_postgres',
            totalVisits: parseInt(totalRes.rows[0].total, 10) || 0,
            uniqueVisitors: parseInt(uniqueRes.rows[0].total, 10) || 0,
            todayVisits: parseInt(todayRes.rows[0].total, 10) || 0,
            topDramas: topDramasRes.rows
        };
    } catch (err) {
        console.error('[Supabase DB] Failed to query stats:', err.message);
        return { source: 'error_fallback', totalVisits: inMemoryVisitsBuffer.length };
    }
}

/**
 * Lấy danh sách lượt xem gần nhất
 */
async function getRecentVisits(limit = 50) {
    if (isConnected) {
        try {
            const client = getPool();
            const res = await client.query('SELECT * FROM public.user_visits ORDER BY created_at DESC LIMIT $1', [limit]);
            return { ok: true, source: 'supabase_postgres', visits: res.rows };
        } catch (err) {
            console.error('[Supabase DB] Failed to query recent visits:', err.message);
        }
    }
    return { ok: true, source: 'memory', visits: inMemoryVisitsBuffer.slice(0, limit) };
}

// ===================================================================
// 4. CÁC HÀM LƯU & XÁC THỰC NGƯỜI DÙNG (USERS / AUTH)
// ===================================================================

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
        avatar_url: (row.avatar_url && !row.avatar_url.includes('dicebear')) ? row.avatar_url : '/default-avatar.svg',
        can_access_user_table: Boolean(row.can_access_user_table),
        approval_status: row.approval_status || (row.can_access_user_table ? 'approved' : 'pending'),
        approved_at: row.approved_at,
        is_vip: isVip,
        vip_remaining_days: vipRemainingDays,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function hashPassword(password) {
    if (!password) return null;
    return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}

function verifyPassword(password, storedHash) {
    if (!storedHash) return true;
    if (!password) return false;
    const cleanPass = String(password).trim();
    if (storedHash === cleanPass) return true;
    const sha256 = crypto.createHash('sha256').update(cleanPass).digest('hex');
    if (sha256.toLowerCase() === storedHash.toLowerCase()) return true;
    const md5 = crypto.createHash('md5').update(cleanPass).digest('hex');
    if (md5.toLowerCase() === storedHash.toLowerCase()) return true;
    return false;
}

/**
 * Lưu người dùng đăng nhập bằng Google lên Supabase
 */
async function loginWithGoogle({ email, full_name, avatar_url, google_id }) {
    if (!email || !email.trim()) {
        throw new Error('Địa chỉ Gmail là bắt buộc');
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        throw new Error('Định dạng email Google không hợp lệ');
    }

    const client = getPool();
    let res = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [cleanEmail]);

    let userRow;
    if (res.rows.length > 0) {
        userRow = res.rows[0];
        if (userRow.status !== 'active') {
            throw new Error('Tài khoản này hiện đang bị tạm khóa');
        }
        if (avatar_url || full_name) {
            try {
                const updateRes = await client.query(
                    `UPDATE users 
                     SET full_name = COALESCE(NULLIF($1, ''), full_name),
                         avatar_url = CASE 
                             WHEN avatar_url IS NULL OR avatar_url = '/default-avatar.svg' OR avatar_url LIKE '%dicebear%' THEN COALESCE(NULLIF($2, ''), avatar_url)
                             ELSE avatar_url 
                         END,
                         updated_at = NOW() 
                     WHERE id = $3 RETURNING *`,
                    [full_name || '', avatar_url || '', userRow.id]
                );
                if (updateRes.rows.length > 0) userRow = updateRes.rows[0];
            } catch (e) {}
        }
    } else {
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
        const finalAvatar = avatar_url || '/default-avatar.svg';

        const insertSql = `
            INSERT INTO users (
                username, email, full_name, password_hash, role, status,
                balance, can_access_user_table, approval_status, avatar_url, updated_at
            ) VALUES ($1, $2, $3, NULL, 'user', 'active', 0, false, 'approved', $4, NOW())
            RETURNING *
        `;
        const insRes = await client.query(insertSql, [username, cleanEmail, displayName, finalAvatar]);
        userRow = insRes.rows[0];
    }

    const user = formatUser(userRow);
    return {
        user,
        message: `Đăng nhập Google thành công! Chào mừng @${user.username}`
    };
}

/**
 * Đăng ký tài khoản Gmail mới lên Supabase
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
    const existCheck = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [cleanEmail]);
    if (existCheck.rows.length > 0) {
        throw new Error(`Địa chỉ Gmail "${cleanEmail}" đã được đăng ký trên hệ thống! Vui lòng đăng nhập.`);
    }

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
    const avatarUrl = '/default-avatar.svg';
    const pwdHash = password && password.trim() ? hashPassword(password.trim()) : null;

    const insertSql = `
        INSERT INTO users (
            username, email, full_name, password_hash, role, status,
            balance, can_access_user_table, approval_status, avatar_url, updated_at
        ) VALUES ($1, $2, $3, $4, 'user', 'active', 0, false, 'pending', $5, NOW())
        RETURNING *
    `;
    const res = await client.query(insertSql, [username, cleanEmail, displayName, pwdHash, avatarUrl]);
    const user = formatUser(res.rows[0]);
    return {
        user,
        message: `Đăng ký thành công tài khoản Gmail "${cleanEmail}". Tài khoản được kích hoạt để xem phim!`
    };
}

/**
 * Đăng nhập bằng email/username & mật khẩu
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

    if (row.password_hash) {
        if (!password || !password.trim()) {
            throw new Error('Vui lòng nhập mật khẩu');
        }
        const isMatch = verifyPassword(password.trim(), row.password_hash);
        if (!isMatch) {
            throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại!');
        }
    }

    const user = formatUser(row);
    return {
        user,
        canAccessUserTable: user.can_access_user_table,
        approvalStatus: user.approval_status
    };
}

async function getUserById(id) {
    if (!id) return null;
    const client = getPool();
    const res = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    if (res.rows.length === 0) return null;
    return formatUser(res.rows[0]);
}

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

// ===================================================================
// 5. CÁC HÀM LƯU GIAO DỊCH, GÓI CƯỚC VIP VÀ VÍ
// ===================================================================

async function getSubscriptionPlans() {
    try {
        const client = getPool();
        const res = await client.query(`
            SELECT * FROM subscription_plans 
            WHERE is_active = true 
            ORDER BY sort_order ASC, price ASC
        `);
        return res.rows.map(r => ({
            id: String(r.id),
            name: r.name,
            code: r.code,
            price: parseFloat(r.price) || 0,
            original_price: parseFloat(r.original_price) || 0,
            duration_days: r.duration_days,
            description: r.description || '',
            features: Array.isArray(r.features) ? r.features : (typeof r.features === 'string' ? JSON.parse(r.features || '[]') : []),
            badge: r.badge || null,
            sort_order: r.sort_order || 0
        }));
    } catch (e) {
        return [
            { id: '1', name: 'Gói VIP 1 Ngày', code: 'vip_1d', price: 9000, duration_days: 1, description: 'Trải nghiệm 24h trọn bộ kho phim' },
            { id: '2', name: 'Gói VIP 1 Tuần', code: 'vip_7d', price: 19000, duration_days: 7, description: '7 ngày xem phim không giới hạn', badge: 'Phổ biến' },
            { id: '3', name: 'Gói VIP 1 Tháng', code: 'vip_30d', price: 59000, duration_days: 30, description: '30 ngày giải trí đỉnh cao' }
        ];
    }
}

async function purchaseSubscription({ userId, planId, paymentMethod = 'wallet' }) {
    if (!userId) throw new Error('Yêu cầu thông tin người dùng');
    if (!planId) throw new Error('Vui lòng chọn gói cước');

    const client = getPool();
    const uRes = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rows.length === 0) throw new Error('Không tìm thấy tài khoản người dùng');
    const userRow = uRes.rows[0];

    const pRes = await client.query('SELECT * FROM subscription_plans WHERE id = $1 LIMIT 1', [planId]);
    if (pRes.rows.length === 0) throw new Error('Gói cước không tồn tại');
    const plan = pRes.rows[0];

    const price = parseFloat(plan.price) || 0;
    const currentBalance = parseFloat(userRow.balance) || 0;

    if (paymentMethod === 'wallet' && currentBalance < price) {
        throw new Error(`Số dư ví (${new Intl.NumberFormat('vi-VN').format(currentBalance)}đ) không đủ để thanh toán gói ${new Intl.NumberFormat('vi-VN').format(price)}đ`);
    }

    const now = new Date();
    let newExpiresAt = new Date();
    if (userRow.subscription_expires_at) {
        const curExp = new Date(userRow.subscription_expires_at);
        if (curExp > now) {
            newExpiresAt = new Date(curExp.getTime() + (plan.duration_days * 24 * 60 * 60 * 1000));
        } else {
            newExpiresAt = new Date(now.getTime() + (plan.duration_days * 24 * 60 * 60 * 1000));
        }
    } else {
        newExpiresAt = new Date(now.getTime() + (plan.duration_days * 24 * 60 * 60 * 1000));
    }

    const newBalance = paymentMethod === 'wallet' ? (currentBalance - price) : currentBalance;

    const upRes = await client.query(`
        UPDATE users 
        SET balance = $1, 
            subscription_plan_id = $2, 
            subscription_expires_at = $3,
            updated_at = NOW() 
        WHERE id = $4 
        RETURNING *
    `, [newBalance, plan.id, newExpiresAt.toISOString(), userId]);

    // Ghi nhận transaction
    try {
        await client.query(`
            INSERT INTO transactions (
                user_id, plan_id, type, amount, status, payment_method, note, created_at
            ) VALUES ($1, $2, 'subscription_purchase', $3, 'completed', $4, $5, NOW())
        `, [
            userId,
            plan.id,
            price,
            paymentMethod,
            `Kích hoạt gói ${plan.name} (${plan.duration_days} ngày) đến ${newExpiresAt.toLocaleDateString('vi-VN')}`
        ]);
    } catch (tErr) {}

    return {
        ok: true,
        user: formatUser(upRes.rows[0]),
        plan: { id: plan.id, name: plan.name, duration_days: plan.duration_days },
        expiresAt: newExpiresAt.toISOString(),
        message: `Kích hoạt gói VIP "${plan.name}" thành công!`
    };
}

async function topupWallet({ userId, amount, paymentMethod = 'banking', transactionCode = '' }) {
    if (!userId) throw new Error('Thiếu thông tin người dùng');
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Số tiền nạp không hợp lệ');

    const client = getPool();
    const uRes = await client.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (uRes.rows.length === 0) throw new Error('Không tìm thấy người dùng');
    const userRow = uRes.rows[0];

    const currentBalance = parseFloat(userRow.balance) || 0;
    const newBalance = currentBalance + parsedAmount;

    const upRes = await client.query(`
        UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2 RETURNING *
    `, [newBalance, userId]);

    try {
        await client.query(`
            INSERT INTO transactions (
                user_id, type, amount, status, payment_method, transaction_code, note, created_at
            ) VALUES ($1, 'wallet_topup', $2, 'completed', $3, $4, $5, NOW())
        `, [
            userId,
            parsedAmount,
            paymentMethod,
            transactionCode || `TOPUP_${Date.now()}`,
            `Nạp ${new Intl.NumberFormat('vi-VN').format(parsedAmount)}đ vào ví`
        ]);
    } catch (e) {}

    return {
        ok: true,
        user: formatUser(upRes.rows[0]),
        amount: parsedAmount,
        newBalance,
        message: `Cộng thành công ${new Intl.NumberFormat('vi-VN').format(parsedAmount)}đ vào ví tài khoản!`
    };
}

async function getSystemSettings() {
    try {
        const client = getPool();
        const res = await client.query('SELECT setting_key, setting_value FROM system_settings');
        const settingsMap = {};
        res.rows.forEach(r => {
            let v = r.setting_value;
            try { v = JSON.parse(v); } catch (e) {}
            settingsMap[r.setting_key] = v;
        });
        return {
            default_free_episode_percent: parseInt(settingsMap.default_free_episode_percent || '20', 10),
            default_total_episodes: parseInt(settingsMap.default_total_episodes || '40', 10),
            vip_only_fallback: Boolean(settingsMap.vip_only_fallback)
        };
    } catch (e) {
        return { default_free_episode_percent: 20, default_total_episodes: 40, vip_only_fallback: false };
    }
}

async function getDramaAccessSetting(title) {
    if (!title) return null;
    try {
        const client = getPool();
        const res = await client.query('SELECT * FROM drama_access_settings WHERE LOWER(drama_title) = LOWER($1) LIMIT 1', [title.trim()]);
        if (res.rows.length === 0) return null;
        return res.rows[0];
    } catch (e) {
        return null;
    }
}

async function checkEpisodeAccess({ dramaTitle, episodeNumber, user, dramaMetadata = null }) {
    const epNum = parseInt(episodeNumber, 10) || 1;
    const isVip = user && user.is_vip;

    if (isVip) {
        return {
            canWatch: true,
            isVipUser: true,
            reason: 'Tài khoản VIP có quyền xem không giới hạn tất cả các tập phim.'
        };
    }

    const specific = await getDramaAccessSetting(dramaTitle);
    const system = await getSystemSettings();

    const isVipOnly = specific ? specific.is_vip_only : system.vip_only_fallback;
    if (isVipOnly) {
        return {
            canWatch: false,
            accessType: 'VIP_EXCLUSIVE',
            message: `Bộ phim "${dramaTitle}" được đặt quyền phát hành Độc quyền VIP.`,
            isVipUser: false
        };
    }

    const totalEpisodes = (specific && specific.total_episodes) ||
        (dramaMetadata && (dramaMetadata.total_episodes || (dramaMetadata.episodes ? dramaMetadata.episodes.length : 0))) ||
        system.default_total_episodes || 40;

    const freePercent = (specific && specific.free_episode_percent != null)
        ? specific.free_episode_percent
        : (system.default_free_episode_percent != null ? system.default_free_episode_percent : 20);

    const freeEpisodesCount = (specific && specific.free_episodes_count != null)
        ? specific.free_episodes_count
        : Math.ceil(totalEpisodes * (freePercent / 100));

    if (epNum <= freeEpisodesCount) {
        return {
            canWatch: true,
            isFreeEpisode: true,
            reason: `Tập ${epNum} thuộc phạm vi xem miễn phí (${freeEpisodesCount}/${totalEpisodes} tập đầu).`
        };
    }

    return {
        canWatch: false,
        accessType: 'LOCKED_BUY_PLAN',
        message: `Tập ${epNum} bị khóa. Hệ thống cho phép xem miễn phí ${freeEpisodesCount}/${totalEpisodes} tập đầu (${freePercent}%). Vui lòng đăng ký gói VIP để xem tiếp.`,
        isVipUser: false,
        episodeNumber: epNum,
        freeEpisodesCount,
        totalEpisodes,
        freePercent
    };
}

module.exports = {
    // Database connection & pool
    getPool,
    initDatabase,
    getStatus: () => ({
        connected: isConnected,
        host: DB_HOST,
        port: DB_PORT,
        database: DB_NAME,
        user: DB_USER,
        hasPassword: Boolean(DB_PASSWORD || process.env.DATABASE_URL),
        error: connectionError
    }),

    // 1. Lưu & Đồng bộ Phim (Dramas)
    saveDrama,
    saveDramasBatch,
    getDramas,
    getDramaCount,
    syncLocalDramasToSupabase,

    // 2. Lưu Lượt xem & Thống kê (Views / Visits)
    recordVisit,
    getAnalyticsStats,
    getRecentVisits,
    parseUserAgent,

    // 3. Lưu & Xác thực Người dùng (Users / Auth)
    loginWithGoogle,
    registerWithGmail,
    loginUser,
    getUserById,
    getQuickDemoUsers,
    formatUser,

    // 4. Lưu Giao dịch & Gói cước (Subscriptions / Wallet)
    getSubscriptionPlans,
    purchaseSubscription,
    topupWallet,
    getSystemSettings,
    getDramaAccessSetting,
    checkEpisodeAccess
};

/**
 * DramaFlow Admin Management Dashboard Logic
 * Real-time traffic analytics, Supabase connectivity & visitor logs
 */

document.addEventListener('DOMContentLoaded', () => {
    // State management
    let refreshInterval = null;
    let recentVisitsData = [];
    let currentStats = null;

    // DOM Elements
    const statTotalVisits = document.getElementById('statTotalVisits');
    const statTotalIpsSub = document.getElementById('statTotalIpsSub');
    const statUniqueVisitors = document.getElementById('statUniqueVisitors');
    const statUniqueRatio = document.getElementById('statUniqueRatio');
    const statTodayVisits = document.getElementById('statTodayVisits');
    const statTodayUniqueSub = document.getElementById('statTodayUniqueSub');
    const statActiveNow = document.getElementById('statActiveNow');

    const topDramasContainer = document.getElementById('topDramasContainer');
    const devicesBreakdown = document.getElementById('devicesBreakdown');
    const browsersBreakdown = document.getElementById('browsersBreakdown');
    const osBreakdown = document.getElementById('osBreakdown');

    const visitsTableBody = document.getElementById('visitsTableBody');
    const filterInput = document.getElementById('filterInput');
    const tableCountSummary = document.getElementById('tableCountSummary');

    const dbStatusBadge = document.getElementById('dbStatusBadge');
    const dbStatusLabel = document.getElementById('dbStatusLabel');
    const supabaseNoticeBanner = document.getElementById('supabaseNoticeBanner');
    const supabaseNoticeDesc = document.getElementById('supabaseNoticeDesc');
    const cfgPasswordStatus = document.getElementById('cfgPasswordStatus');
    const cfgStorageMode = document.getElementById('cfgStorageMode');

    const refreshBtn = document.getElementById('refreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    const autoRefreshSelect = document.getElementById('autoRefreshSelect');
    const btnTestDbConnection = document.getElementById('btnTestDbConnection');
    const btnExportJson = document.getElementById('btnExportJson');
    const btnShowDbConfig = document.getElementById('btnShowDbConfig');

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const adminSidebar = document.getElementById('adminSidebar');

    // =========================================================================
    // Fetch Functions
    // =========================================================================

    async function loadAllData() {
        setLoadingState(true);
        try {
            await Promise.all([
                fetchDbStatus(),
                fetchStats(),
                fetchRecentVisits()
            ]);
        } catch (err) {
            console.error('Error fetching admin data:', err);
            showToast('Không thể kết nối đến server: ' + err.message, 'error');
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            refreshIcon.classList.add('fa-spin');
        } else {
            setTimeout(() => {
                refreshIcon.classList.remove('fa-spin');
            }, 400);
        }
    }

    // 1. Fetch DB Status
    async function fetchDbStatus() {
        try {
            const res = await fetch('/api/analytics/status');
            const data = await res.json();

            if (data.ok) {
                const indicator = dbStatusBadge.querySelector('.status-indicator');
                if (data.connected && data.source === 'supabase_postgres') {
                    indicator.className = 'status-indicator success';
                    dbStatusLabel.textContent = 'Supabase PostgreSQL Đã Kết Nối';
                    supabaseNoticeBanner.style.display = 'none';

                    if (cfgPasswordStatus) {
                        cfgPasswordStatus.innerHTML = '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Đã cấu hình</span>';
                    }
                    if (cfgStorageMode) {
                        cfgStorageMode.innerHTML = '<span class="badge badge-success">Supabase Database (Bền vững)</span>';
                    }
                } else {
                    indicator.className = 'status-indicator warning';
                    dbStatusLabel.textContent = 'In-Memory Fallback (Chờ mật khẩu DB)';
                    supabaseNoticeBanner.style.display = 'flex';
                    if (supabaseNoticeDesc && data.statusMessage) {
                        supabaseNoticeDesc.innerHTML = `${data.statusMessage}. Backend tự động lưu trữ trên bộ nhớ RAM an toàn.`;
                    }

                    if (cfgPasswordStatus) {
                        cfgPasswordStatus.innerHTML = '<span class="badge badge-warning"><i class="fa-solid fa-key"></i> Chưa nhập mật khẩu trong .env</span>';
                    }
                    if (cfgStorageMode) {
                        cfgStorageMode.innerHTML = '<span class="badge badge-info">Bộ nhớ RAM (In-Memory Buffer)</span>';
                    }
                }
            }
        } catch (e) {
            console.warn('Status fetch failed', e);
        }
    }

    // 2. Fetch Stats
    async function fetchStats() {
        const res = await fetch('/api/analytics/stats');
        const data = await res.json();
        if (!data.ok) return;

        currentStats = data;

        // KPI Totals
        const totalVisits = data.totals?.total_visits || 0;
        const uniqueVisitors = data.totals?.total_unique_visitors || 0;
        const totalIps = data.totals?.total_unique_ips || 0;
        const todayVisits = data.today?.today_visits || 0;
        const todayUnique = data.today?.today_unique_visitors || 0;
        const activeNow = data.active_now || 0;

        statTotalVisits.textContent = Number(totalVisits).toLocaleString();
        statTotalIpsSub.textContent = `${Number(totalIps).toLocaleString()} địa chỉ IP ghi nhận`;

        statUniqueVisitors.textContent = Number(uniqueVisitors).toLocaleString();
        const ratio = totalVisits > 0 ? ((uniqueVisitors / totalVisits) * 100).toFixed(1) : 0;
        statUniqueRatio.textContent = `${ratio}% tỷ lệ người dùng mới`;

        statTodayVisits.textContent = Number(todayVisits).toLocaleString();
        statTodayUniqueSub.textContent = `${Number(todayUnique).toLocaleString()} khách hôm nay`;

        statActiveNow.textContent = Number(activeNow).toLocaleString();

        const cfgHostEl = document.getElementById('cfgHost');
        if (cfgHostEl && data.host) {
            cfgHostEl.textContent = data.host;
        }

        // Render Top Dramas
        renderTopDramas(data.top_dramas || []);

        // Render Breakdowns
        renderDevices(data.breakdown?.devices || []);
        renderBrowsers(data.breakdown?.browsers || []);
        renderOperatingSystems(data.breakdown?.os || []);
    }

    // 3. Fetch Recent Visits
    async function fetchRecentVisits() {
        const res = await fetch('/api/analytics/recent?limit=100');
        const data = await res.json();
        if (!data.ok) return;

        recentVisitsData = data.visits || [];
        renderTable(recentVisitsData);
    }

    // =========================================================================
    // Render Functions
    // =========================================================================

    function renderTopDramas(dramas) {
        if (!dramas.length) {
            topDramasContainer.innerHTML = `
                <div class="loading-state-sm text-center">
                    <i class="fa-solid fa-inbox text-muted"></i>
                    Chưa có lượt xem phim nào được ghi nhận.
                </div>
            `;
            return;
        }

        topDramasContainer.innerHTML = dramas.map((item, idx) => {
            const rankClass = idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : '';
            return `
                <div class="ranking-item">
                    <div class="rank-badge ${rankClass}">#${idx + 1}</div>
                    <div class="rank-details">
                        <div class="rank-title" title="${escapeHtml(item.drama_title || 'Trang chủ')}">
                            ${escapeHtml(item.drama_title || 'Trang chủ')}
                        </div>
                        <div class="rank-provider">
                            <i class="fa-solid fa-server"></i> ${escapeHtml(item.provider || 'system')}
                        </div>
                    </div>
                    <div class="rank-views">
                        <i class="fa-regular fa-eye"></i>
                        <span>${Number(item.views).toLocaleString()}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderDevices(devices) {
        if (!devices.length) {
            devicesBreakdown.innerHTML = '<div class="loading-state-sm">Chưa có dữ liệu</div>';
            return;
        }

        const total = devices.reduce((sum, d) => sum + Number(d.count), 0);
        devicesBreakdown.innerHTML = devices.map(item => {
            const count = Number(item.count);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const icon = item.device === 'mobile' ? 'fa-mobile-screen-button' : item.device === 'tablet' ? 'fa-tablet-screen-button' : 'fa-laptop';
            const name = item.device ? item.device.toUpperCase() : 'DESKTOP';

            return `
                <div class="progress-item">
                    <div class="progress-info">
                        <span class="progress-name">
                            <i class="fa-solid ${icon}"></i> ${name}
                        </span>
                        <span class="progress-val">${count} (${pct}%)</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderBrowsers(browsers) {
        if (!browsers.length) {
            browsersBreakdown.innerHTML = '<div class="loading-state-sm">Chưa có dữ liệu</div>';
            return;
        }

        const total = browsers.reduce((sum, b) => sum + Number(b.count), 0);
        browsersBreakdown.innerHTML = browsers.map(item => {
            const count = Number(item.count);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const name = item.browser || 'Unknown';
            return `
                <div class="progress-item">
                    <div class="progress-info">
                        <span class="progress-name">
                            <i class="fa-brands fa-chrome"></i> ${escapeHtml(name)}
                        </span>
                        <span class="progress-val">${count} (${pct}%)</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, #38bdf8, #818cf8);"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderOperatingSystems(osList) {
        if (!osList.length) {
            osBreakdown.innerHTML = '<div class="loading-state-sm">Chưa có dữ liệu</div>';
            return;
        }

        osBreakdown.innerHTML = osList.map(item => `
            <div class="chip-tag">
                <i class="fa-solid fa-microchip"></i>
                <span>${escapeHtml(item.os || 'Unknown')}</span>
                <strong>${Number(item.count).toLocaleString()}</strong>
            </div>
        `).join('');
    }

    function renderTable(visits) {
        if (!visits.length) {
            visitsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4 text-muted">
                        <i class="fa-solid fa-inbox"></i> Không tìm thấy bản ghi truy cập nào phù hợp.
                    </td>
                </tr>
            `;
            tableCountSummary.textContent = 'Đang hiển thị 0 lượt truy cập';
            return;
        }

        tableCountSummary.textContent = `Đang hiển thị ${visits.length} lượt truy cập`;

        visitsTableBody.innerHTML = visits.map(v => {
            const dateStr = formatDateTime(v.created_at);
            const deviceBadge = v.device === 'mobile' 
                ? '<span class="badge badge-warning"><i class="fa-solid fa-mobile-screen"></i> Mobile</span>'
                : v.device === 'tablet'
                ? '<span class="badge badge-info"><i class="fa-solid fa-tablet"></i> Tablet</span>'
                : '<span class="badge badge-subtle"><i class="fa-solid fa-laptop"></i> Desktop</span>';

            const dramaName = v.drama_title 
                ? `<strong class="text-white">${escapeHtml(v.drama_title)}</strong>` 
                : '<span class="text-muted">Xem Trang Chủ</span>';

            const providerBadge = v.provider 
                ? `<span class="badge badge-subtle">${escapeHtml(v.provider)}</span>` 
                : '<span class="text-muted">-</span>';

            return `
                <tr>
                    <td class="table-time">${dateStr}</td>
                    <td>
                        <span class="table-ip">${escapeHtml(v.ip || '127.0.0.1')}</span>
                        <div class="text-muted" style="font-size: 0.72rem;">ID: ${escapeHtml((v.visitor_id || '').slice(0, 12))}...</div>
                    </td>
                    <td>${deviceBadge}</td>
                    <td>
                        <div>${escapeHtml(v.browser || 'Browser')}</div>
                        <div class="text-muted" style="font-size: 0.75rem;">${escapeHtml(v.os || 'OS')}</div>
                    </td>
                    <td>${dramaName}</td>
                    <td>${providerBadge}</td>
                    <td><code style="font-size: 0.78rem;">${escapeHtml(v.path || '/')}</code></td>
                </tr>
            `;
        }).join('');
    }

    // =========================================================================
    // Filter / Search
    // =========================================================================

    filterInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderTable(recentVisitsData);
            return;
        }

        const filtered = recentVisitsData.filter(v => {
            const ip = (v.ip || '').toLowerCase();
            const title = (v.drama_title || '').toLowerCase();
            const browser = (v.browser || '').toLowerCase();
            const os = (v.os || '').toLowerCase();
            const provider = (v.provider || '').toLowerCase();
            const path = (v.path || '').toLowerCase();

            return ip.includes(query) ||
                   title.includes(query) ||
                   browser.includes(query) ||
                   os.includes(query) ||
                   provider.includes(query) ||
                   path.includes(query);
        });

        renderTable(filtered);
    });

    // =========================================================================
    // Controls & Actions
    // =========================================================================

    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadAllData();
        showToast('Đã làm mới dữ liệu thống kê!', 'info');
    });

    // Auto-refresh interval
    function setupAutoRefresh(seconds) {
        if (refreshInterval) clearInterval(refreshInterval);
        if (seconds > 0) {
            refreshInterval = setInterval(() => {
                loadAllData();
            }, seconds * 1000);
        }
    }

    autoRefreshSelect.addEventListener('change', (e) => {
        const seconds = parseInt(e.target.value, 10);
        setupAutoRefresh(seconds);
        showToast(seconds > 0 ? `Đã đặt tự động cập nhật mỗi ${seconds} giây` : 'Đã tắt tự cập nhật', 'info');
    });

    // Test DB connection button
    btnTestDbConnection.addEventListener('click', async () => {
        btnTestDbConnection.disabled = true;
        btnTestDbConnection.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';
        try {
            await fetchDbStatus();
            await fetchStats();
            showToast('Kiểm tra trạng thái Supabase thành công!', 'success');
        } catch (e) {
            showToast('Lỗi khi kiểm tra kết nối: ' + e.message, 'error');
        } finally {
            btnTestDbConnection.disabled = false;
            btnTestDbConnection.innerHTML = '<i class="fa-solid fa-plug"></i> Kiểm Tra Kết Nối Lại';
        }
    });

    // Export JSON
    btnExportJson.addEventListener('click', () => {
        const exportData = {
            exported_at: new Date().toISOString(),
            stats: currentStats,
            visits: recentVisitsData
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dramaflow_traffic_analytics_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Đã xuất file JSON thành công!', 'success');
    });

    // Show DB config shortcut
    if (btnShowDbConfig) {
        btnShowDbConfig.addEventListener('click', () => {
            const card = document.getElementById('supabaseConfigCard');
            if (card) {
                card.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // Mobile menu toggle
    if (mobileMenuBtn && adminSidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            adminSidebar.classList.toggle('open');
        });
    }

    // Sidebar navigation active state
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            if (window.innerWidth <= 768 && adminSidebar) {
                adminSidebar.classList.remove('open');
            }
        });
    });

    // =========================================================================
    // Utilities
    // =========================================================================

    function formatDateTime(isoString) {
        if (!isoString) return '--';
        try {
            const d = new Date(isoString);
            const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            return `${time} <span style="opacity: 0.6;">(${date})</span>`;
        } catch {
            return isoString;
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

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        const icon = type === 'success' ? 'fa-circle-check text-emerald' : type === 'error' ? 'fa-circle-exclamation text-rose' : 'fa-circle-info text-indigo';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // Initialize
    loadAllData();
    setupAutoRefresh(10);
});

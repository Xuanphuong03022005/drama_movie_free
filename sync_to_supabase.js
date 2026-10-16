#!/usr/bin/env node

/**
 * ===================================================================
 * SYNC TO SUPABASE SCRIPT (sync_to_supabase.js)
 * ===================================================================
 * Script độc lập để đồng bộ toàn bộ dữ liệu phim từ file JSON cục bộ
 * lên cơ sở dữ liệu Supabase PostgreSQL.
 * 
 * Cách dùng:
 *    node sync_to_supabase.js
 * hoặc:
 *    node sync_to_supabase.js --file=./data/fallback_dramas.json
 * ===================================================================
 */

const path = require('path');
const fs = require('fs');
const supabase = require('./supabase');

async function runSync() {
    console.log('\n======================================================');
    console.log('       SUPABASE DATA SYNC UTILITY (DramaBox / Narto)    ');
    console.log('======================================================\n');

    // 1. Kiểm tra trạng thái kết nối
    console.log('🔄 Đang kiểm tra kết nối Supabase PostgreSQL...');
    const pool = supabase.getPool();

    try {
        const client = await pool.connect();
        console.log('✅ Kết nối Supabase thành công!');
        client.release();
    } catch (err) {
        console.error('❌ Kết nối Supabase thất bại:', err.message);
        console.error('💡 Vui lòng kiểm tra lại biến môi trường SUPABASE_DB_HOST, SUPABASE_DB_PASSWORD trong file .env');
        process.exit(1);
    }

    // 2. Khởi tạo / cập nhật bảng trong Supabase
    console.log('🔄 Đang kiểm tra schema bảng (drama, users, view, user_visits, transactions)...');
    try {
        await supabase.initDatabase();
        console.log('✅ Khởi tạo schema Supabase thành công!');
    } catch (err) {
        console.warn('⚠️ Lỗi khi initDatabase (sẽ tiếp tục nếu bảng đã có sẵn):', err.message);
    }

    // 3. Đọc dữ liệu từ file JSON
    let targetFile = path.join(__dirname, 'data', 'fallback_dramas.json');
    const customArg = process.argv.find(arg => arg.startsWith('--file='));
    if (customArg) {
        targetFile = path.resolve(customArg.split('=')[1]);
    }

    if (!fs.existsSync(targetFile)) {
        console.error(`❌ Không tìm thấy file dữ liệu: ${targetFile}`);
        process.exit(1);
    }

    console.log(`📂 Đọc dữ liệu từ: ${targetFile}`);
    let rawData;
    try {
        rawData = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    } catch (err) {
        console.error('❌ File JSON không hợp lệ:', err.message);
        process.exit(1);
    }

    const dramas = Array.isArray(rawData) ? rawData : Object.values(rawData);
    console.log(`📦 Tìm thấy ${dramas.length} bộ phim để đồng bộ.`);

    // 4. Lưu từng phim lên Supabase
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    console.log('\n🚀 Bắt đầu lưu dữ liệu lên Supabase:');
    console.log('------------------------------------------------------');

    for (let i = 0; i < dramas.length; i++) {
        const drama = dramas[i];
        const title = drama.title || drama.name || `Phim #${i + 1}`;
        const dramaId = drama.id || drama.bookId || `drama_${i + 1}`;

        try {
            process.stdout.write(`[${i + 1}/${dramas.length}] Đang lưu: "${title.slice(0, 35)}"... `);
            const res = await supabase.saveDrama(drama);
            if (res) {
                successCount++;
                console.log('✅ OK');
            } else {
                failCount++;
                console.log('⚠️ Bỏ qua');
            }
        } catch (err) {
            failCount++;
            errors.push({ id: dramaId, title, error: err.message });
            console.log(`❌ Lỗi: ${err.message}`);
        }
    }

    // 5. Thống kê kết quả
    console.log('\n======================================================');
    console.log('                  KẾT QUẢ ĐỒNG BỘ                     ');
    console.log('======================================================');
    console.log(`Tổng số phim xử lý:    ${dramas.length}`);
    console.log(`Lưu thành công:         ${successCount} phim`);
    console.log(`Thất bại / Lỗi:        ${failCount} phim`);

    try {
        const totalInDb = await supabase.getDramaCount();
        console.log(`Tổng phim hiện có trên Supabase: ${totalInDb} phim`);
    } catch (e) {
        // bỏ qua nếu lỗi count
    }

    if (errors.length > 0) {
        console.log('\n⚠️ Danh sách lỗi chi tiết:');
        errors.forEach((e, idx) => {
            console.log(`  ${idx + 1}. [${e.id}] ${e.title}: ${e.error}`);
        });
    }

    console.log('======================================================\n');
    process.exit(0);
}

runSync().catch(err => {
    console.error('❌ Lỗi không xác định khi đồng bộ:', err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * DramaFlow CLI Subtitle Prefetcher
 * Usage: node scripts/prefetch_subs.js <slug> [limit]
 * Example: node scripts/prefetch_subs.js a-bond-no-one-asked-for-2 10
 */

const fs = require('fs');
const path = require('path');

const slug = process.argv[2];
const limit = parseInt(process.argv[3], 10) || 5;

if (!slug) {
    console.log('\n❌ Vui lòng nhập slug phim:');
    console.log('Ví dụ: node scripts/prefetch_subs.js a-bond-no-one-asked-for-2 5\n');
    process.exit(1);
}

const CACHE_DIR = path.join(__dirname, '..', 'subtitles_cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    console.log(`\n======================================================`);
    console.log(`🎬 Bắt đầu bóc băng phụ đề tiếng Việt cho: [${slug}]`);
    console.log(`📦 Thư mục lưu cache: ${CACHE_DIR}`);
    console.log(`======================================================\n`);

    // 1. Lấy thông tin phim
    let dramaData = null;
    try {
        const res = await fetch(`${BASE_URL}/api/drama?slug=${encodeURIComponent(slug)}`);
        dramaData = await res.json();
    } catch (e) {
        console.error(`❌ Không kết nối được server local tại ${BASE_URL}. Hãy chắc chắn bạn đã chạy 'npm start'!\nLỗi:`, e.message);
        process.exit(1);
    }

    if (!dramaData || !dramaData.episodes || dramaData.episodes.length === 0) {
        console.error(`❌ Không tìm thấy danh sách tập phim cho: ${slug}`);
        process.exit(1);
    }

    const episodes = dramaData.episodes.slice(0, limit);
    console.log(`📋 Tìm thấy ${dramaData.episodes.length} tập. Sẽ bóc băng ${episodes.length} tập đầu tiên.\n`);

    let successCount = 0;

    for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        const epNum = ep.number || (i + 1);
        const streamUrl = ep.play_url || ep.direct_play_url || '';
        const vttFile = `${slug}_ep${epNum}_vi.vtt`;
        const vttPath = path.join(CACHE_DIR, vttFile);

        if (fs.existsSync(vttPath)) {
            console.log(`[Tập ${epNum}/${episodes.length}] ⏭️  Đã có sẵn phụ đề tiếng Việt trong cache (${vttFile}). Bỏ qua.`);
            successCount++;
            continue;
        }

        console.log(`[Tập ${epNum}/${episodes.length}] 🎙️ Đang bóc băng AI và dịch tiếng Việt cho Tập ${epNum}...`);
        
        let done = false;
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes

        while (!done && attempts < maxAttempts) {
            attempts++;
            try {
                const genUrl = `${BASE_URL}/api/subtitles/generate?slug=${encodeURIComponent(slug)}&ep=${epNum}&stream_url=${encodeURIComponent(streamUrl)}&lang=vi`;
                const gRes = await fetch(genUrl);
                const gData = await gRes.json();

                if (gData.ok && gData.ready && gData.url) {
                    done = true;
                    successCount++;
                    try {
                        const vRes = await fetch(`${BASE_URL}${gData.url}`);
                        const vText = await vRes.text();
                        if (vText && vText.startsWith('WEBVTT')) {
                            fs.writeFileSync(path.join(CACHE_DIR, vttFile), vText, 'utf8');
                        }
                    } catch (err) {
                        console.warn(`[Prefetch] Error saving VTT file:`, err.message);
                    }
                    console.log(`[Tập ${epNum}/${episodes.length}] ✅ Hoàn tất Tập ${epNum}! Đã lưu: ${vttFile}`);
                    break;
                }
            } catch (e) {
                // Wait and retry
            }
            await sleep(2000);
        }

        if (!done) {
            console.warn(`[Tập ${epNum}/${episodes.length}] ⚠️ Hết thời gian chờ cho Tập ${epNum}.`);
        }
    }

    console.log(`\n======================================================`);
    console.log(`🎉 Hoàn thành! Đã có ${successCount}/${episodes.length} tập phụ đề tiếng Việt trong subtitles_cache/`);
    console.log(`🚀 Bây giờ bạn chỉ cần chạy:`);
    console.log(`   git add subtitles_cache/`);
    console.log(`   git commit -m "add subs for ${slug}"`);
    console.log(`   git push origin master`);
    console.log(`   -> Vercel sẽ tự động có phụ đề tiếng Việt vĩnh viễn!`);
    console.log(`======================================================\n`);
})();

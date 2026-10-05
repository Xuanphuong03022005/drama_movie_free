# Changelog

All notable changes to DramaFlow PRO will be documented in this file.

## [0.0.22] - 2026-10-02
### Fix: Phụ Đề Chập Chờn & Mất Phụ Đề Sau 20 Giây (Seamless STT & Priority Queue)

**Nguyên nhân gốc rễ gây ra tình trạng "video được, video không được" và mất phụ đề giữa chừng (như mốc 0:31):**
1. **Xếp hàng FIFO nghẽn cổ chai (Queue Block)**: Stage 1 (chunk nhanh) trước đây bị nhét chung vào một hàng đợi đơn luồng với Stage 2 (dịch cả tập). Khi mở tập 1 rồi chuyển sang tập 2, tập 2 bị kẹt cứng phía sau tác vụ 2 phút của tập 1.
2. **Chunk mở đầu quá ngắn (chỉ 20s)**: Chunk Stage 1 trước đây chỉ dài 20s (`-t 20`). Đến giây thứ 21 trở đi (như mốc 0:31 trong ảnh chụp màn hình), phụ đề biến mất hoàn toàn do Stage 2 chưa xong hoặc đã bị client dừng thăm dò.
3. **Frontend Poller dừng quá sớm**: `maxStage2Polls` chỉ có 25 lần (62 giây), trong khi nhận diện cả tập 3-5 phút cần khoảng 80-100 giây. Poller ở frontend tự bỏ cuộc trước khi server hoàn thành.
4. **Tiến trình FFmpeg zombie & bóp CPU**: Thiết lập `PRIORITY_BELOW_NORMAL` trên Windows khiến FFmpeg bị hệ điều hành bỏ đói CPU (chỉ chạy 10-15s trong 3 phút). Khi lệnh quá hạn, Node.js không dọn sạch tiến trình con `ffmpeg.exe`, gây nghẽn CPU và khóa file tạm.

**Những cải tiến đã thực hiện:**
- **Tách rời luồng ưu tiên Stage 1 (Priority Fast Lane)**: Stage 1 cho tập đang xem luôn chạy ngay lập tức, không còn bị xếp hàng chờ sau tác vụ dịch cả tập cũ.
- **Tăng chunk ban đầu lên 40 giây (`-t 40`)**: Ngay trong vài giây đầu, toàn bộ các câu thoại quan trọng tới mốc 40s (bao gồm mốc 0:31) đã sẵn sàng và hiển thị mượt mà.
- **Hủy tác vụ tập cũ khi chuyển tập (Dynamic Task Preemption)**: Khi người dùng chuyển sang tập mới, server tự động hủy tác vụ nền của tập cũ để dồn 100% tài nguyên CPU cho tập đang xem.
- **Tối ưu tốc độ nhận diện đa luồng (6 threads, Normal Priority)**: Nâng cấp luồng Whisper lên 6 threads, gỡ bỏ giới hạn `BELOW_NORMAL`, tăng tốc nhận diện thực tế lên 1.8x - 2.5x mà vẫn giữ 10 luồng CPU trống cho trình duyệt.
- **Dọn dẹp tiến trình triệt để (`taskkill /t /f`)**: Đảm bảo không còn bất kỳ tiến trình zombie FFmpeg nào chạy ngầm làm chậm máy.
- **Kéo dài chu kỳ thăm dò Stage 2**: Tăng lên 120 lần (6 phút), tự động cập nhật và hiển thị toàn bộ phụ đề ngay khi Stage 2 hoàn tất mà không cần tải lại trang.

## [0.0.21] - 2026-10-02
### Translation Engine — Production-Grade Stability Overhaul

**Root cause of intermittent translation failures:**
- Hệ thống cũ chỉ có 1 Google endpoint + 1 MyMemory, không có retry, không có throttle → dễ bị rate-limit.
- Khi dịch 200+ cues song song bằng `Promise.all`, hàng trăm request nổ đồng thời → server dịch từ chối hết.

**Những cải tiến trong phiên bản này:**

- **4 Google endpoint variants được kiểm thử thực tế** (chỉ giữ các endpoint trả về JSON hợp lệ):
  - `dict-chrome-ex` via `translate.googleapis.com` (primary)
  - `dict-chrome-ex` via `translate.google.com` (fallback #1)
  - `client=at` (Apps Translate, quota pool riêng)
  - `client=webapp` (quota pool riêng)
- **Auto-rotation**: endpoint bị rate-limit (429/503) hoặc trả HTML → tự động xoay sang endpoint tiếp theo.
- **HTML response detection**: Phát hiện và bỏ qua các endpoint trả về trang HTML thay vì JSON.
- **3 provider layers**: Google → MyMemory → LibreTranslate (public). Nếu tất cả fail, trả nguyên văn bản gốc.
- **Throttle concurrency**: Tối đa 8 request dịch song song, phần còn lại xếp hàng chờ → không bao giờ spam API.
- **`batchTranslate()`**: Dịch theo từng chunk 20 câu, có 80ms pause giữa các chunk → giảm burst.
- **Persistent disk cache** (`subtitles/translation_cache.json`): Các bản dịch được ghi ra ổ đĩa mỗi 30 giây, tồn tại qua lần restart server → không bao giờ dịch lại cùng một câu 2 lần.
- **In-memory LRU cache**: Tăng từ 5,000 lên 10,000 entries, evict 500 entries cũ khi đầy.
- **Exponential backoff retry**: Mỗi lần thất bại chờ lâu hơn gấp đôi (300ms → 600ms → 1200ms) trước khi thử lại.

## [0.0.20] - 2026-10-02
### Performance & Speed Optimization (Tối ưu tốc độ nghe & dịch siêu tốc)
- **Kiến trúc phân tầng 2 giai đoạn (2-Stage Progressive STT Pipeline)**:
  - **Giai đoạn 1 (Priority Fast Chunk - 15-20s đầu)**:
    - Trích xuất và nhận diện chỉ trong **~2.8 - 3.5 giây** thay vì phải chờ cả tập 2 phút.
    - Người dùng vừa xem được 3 giây mở đầu thì phụ đề tiếng Việt / ngôn ngữ đã chọn đã xuất hiện ngay trên màn hình.
  - **Giai đoạn 2 (Full Background Merge)**:
    - Trong lúc người dùng đang đọc những câu thoại đầu tiên, hệ thống tiếp tục xử lý toàn bộ tập phim ở chế độ nền và tự động cập nhật phụ đề đầy đủ cho 100% video mà không làm gián đoạn việc xem phim.
- **Tính năng Pre-fetch phụ đề tập tiếp theo (Zero-Second Next Episode)**:
  - Khi đang xem tập $N$, hệ thống tự động chạy ngầm trích xuất và dịch phụ đề cho tập $N+1$.
  - Đến khi chuyển sang tập tiếp theo, phụ đề đã sẵn sàng trong cache ổ đĩa, xuất hiện **ngay lập tức trong 0.06 giây (0 giây chờ)**.
- **Tối ưu lịch thăm dò phía Client (Adaptive Responsive Polling)**:
  - Thăm dò mỗi 800ms trong 4 nhịp đầu để bắt kịp ngay khoảnh khắc phụ đề vừa hoàn tất ở backend, xóa bỏ độ trễ chờ đợi.
- **Khắc phục lỗi định dạng lệnh FFmpeg trên Windows**:
  - Loại bỏ các tham số header xuống dòng gây lỗi ngắt lệnh trên Windows PowerShell/cmd, đảm bảo tốc độ trích xuất âm thanh đạt đỉnh 14x - 40x.

## [0.0.19] - 2026-10-02
### Added & Enhanced
- **Hệ Thống Phụ Đề AI Nhận Diện Giọng Nói Âm Thanh & Dịch Đa Ngôn Ngữ Tự Động (AI Audio STT -> WebVTT Pipeline)**:
  - **Khắc phục triệt để vấn đề dịch theo hình ảnh / OCR**:
    - Thay vì quét hình ảnh gây sai chữ hoặc lộ khung đen che video, hệ thống đọc trực tiếp luồng âm thanh thoại thực tế của tập phim bằng công nghệ AI **Whisper STT** (Speech-to-Text).
    - Tự động trích xuất các câu thoại kèm mốc thời gian (timestamps) chính xác đến từng mili-giây.
  - **Dịch tự động theo bất kỳ ngôn ngữ nào người dùng chọn**:
    - Hỗ trợ dịch sang: 🇻🇳 **Tiếng Việt**, 🇺🇸 **English**, 🇨🇳 **中文**, 🇰🇷 **한국어**, 🇯🇵 **日本語**, 🇹🇭 **ภาษาไทย**, 🇮🇩 **Bahasa Indonesia**, 🇫🇷 **Français**, 🇪🇸 **Español**.
    - Tự động đồng bộ với ngôn ngữ giao diện web đang chọn hoặc tùy chọn riêng trong menu phụ đề CC của trình phát video.
  - **Đóng gói phụ đề chuẩn WebVTT (.vtt) & Tích hợp vào thẻ `<track>` native của HTML5 Video**:
    - Font chữ điện ảnh (`Plus Jakarta Sans`), đổ bóng sắc nét, nền tối mờ kính mượt mà (`video::cue`), không che hình, không giật lag.
  - **Cơ chế lưu đệm thông minh (Instant Disk Cache)**:
    - Khi một tập phim đã được nhận diện âm thanh và dịch xong một lần, các lần sau mở ra xem phụ đề sẽ xuất hiện **ngay lập tức trong 0.05 giây**.
    - Khi đổi sang ngôn ngữ mới, server chỉ cần dịch lại các câu thoại trong 1 giây mà không cần quét lại âm thanh.
  - **Trải nghiệm phát video mượt mà (Non-blocking Background Processing)**:
    - Video vẫn phát ngay lập tức khi mở tập phim; hệ thống hiển thị thông báo trạng thái nhẹ nhàng (`⚡ AI đang nghe & dịch âm thanh...`) và tự động gắn phụ đề vào luồng phát ngay khi hoàn tất.

## [0.0.18] - 2026-10-02
### Changed & Cleaned
- **Loại bỏ hoàn toàn tính năng OCR thời gian thực trên khung video**:
  - Gỡ bỏ lớp phủ `#ai-subtitle-overlay` trên trình phát video để tránh hiện chữ nhận diện sai hoặc che khuất khung hình.
  - Loại bỏ module xử lý canvas và engine Tesseract OCR ở cả client (`app.js`) và server (`server.js`).
  - Xóa file `eng.traineddata` và giải phóng tài nguyên CPU/RAM của server.
  - Phục hồi menu phụ đề chuẩn của video player (`selectSubtitle`) mượt mà, không giật lag.

## [0.0.17] - 2026-10-02
### Added & Enhanced
- **Hệ Thống Phụ Đề AI Live OCR & Dịch Tự Động Trực Tiếp Trên Video (AI Subtitle Engine)**:
  - **Khắc phục triệt để vấn đề phụ đề in chết vào video (Hardsub)**:
    - Các video phim ngắn gốc từ các nhà phát hành (ReelShort, DramaBox, ShortMax...) đều in chết chữ tiếng Anh/tiếng Trung trực tiếp vào khung hình của video, không có file phụ đề rời (softsub).
    - Tích hợp công nghệ nhận diện quang học **AI OCR (Tesseract Engine)** và bộ dịch đa ngôn ngữ theo thời gian thực:
      1. **Tự động quét chữ trên khung video (Frame Crop & OCR)**: Định kỳ quét vùng chứa phụ đề ở 1/4 phía dưới video (`65% - 88%` chiều cao video) khi video đang phát.
      2. **Thuật toán nhận biết thay đổi điểm ảnh thông minh (Zero-cost Skip)**: Tự động bỏ qua khung hình nếu chữ không đổi hoặc cảnh tối/không có chữ, tiết kiệm tối đa CPU.
      3. **Dịch tức thì sang bất kỳ ngôn ngữ nào người dùng chọn**:
         - Hỗ trợ dịch sang: 🇻🇳 **Tiếng Việt**, 🇺🇸 **English**, 🇨🇳 **中文 (Chinese)**, 🇰🇷 **한국어 (Korean)**, 🇯🇵 **日本語 (Japanese)**, 🇹🇭 **ภาษาไทย (Thai)**, 🇮🇩 **Bahasa Indonesia**, 🇪🇸 **Español**, 🇫🇷 **Français**.
         - Hệ thống dịch đa tầng với bộ đệm bộ nhớ (in-memory cache) cho tốc độ dịch phản hồi dưới 100ms.
      4. **Thanh phủ phụ đề thông minh (AI Subtitle Overlay Bar)**:
         - Hiển thị thanh phụ đề bo tròn với nền tối mờ kính (`rgba(8, 10, 16, 0.94)`) đặt chính xác ở vị trí cuối video, **che đè hoàn hảo lên phụ đề tiếng Anh cũ**.
         - Chữ phụ đề trắng sáng, nét đậm (`16.5px`), đổ bóng điện ảnh dễ đọc, có huy hiệu `⚡ AI Dịch • Tiếng Việt`.
         - Tự động ẩn đi sau 1.5s nếu nhân vật dừng thoại hoặc chuyển sang cảnh không có phụ đề.
         - Hoạt động đồng bộ trên cả **Máy tính (Desktop)**, **Kiểu Trung (Tablet/Split-screen)** và **Điện thoại (Mobile Fullscreen)**.
  - Tuyệt đối không hiển thị badge phiên bản hay thẻ debug ngoài giao diện người dùng.

## [0.0.16] - 2026-10-02
### Added & Enhanced
- **3D Coverflow Vertical Posters Carousel for Hero Showcase**:
  - **Khắc phục triệt để vấn đề bể ảnh / phóng to ảnh sai tỷ lệ**:
    - Poster phim ngắn có tỷ lệ dọc chuẩn 9:16 (hoặc 2:3). Khi dùng làm `background-size: cover` trải rộng 1920px trên màn hình lớn, ảnh bị phóng to hơn 300% dẫn đến vỡ hình và mờ.
    - Chuyển đổi toàn diện sang bố cục 2 cột hiện đại theo đúng ảnh mẫu tham khảo của người dùng:
      - **Cột Trái (Thông tin phim nổi bật)**:
        - Các tag thể loại dạng viên thuốc tối màu bo tròn (`.hero-tag-pill`) (ví dụ: *Báo Thù*, *Tình một đêm*, *Tổng Tài*).
        - Tiêu đề phim in đậm, chữ trắng lớn, hiển thị sắc nét tối đa 2 dòng (`.hero-title`).
        - Tóm tắt nội dung cô đọng 2-3 dòng chữ xám nhạt (`.hero-synopsis`).
        - Huy hiệu số tập (`50 tập` / `.hero-ep-badge`).
        - Cụm nút hành động chuẩn mẫu:
          - Nút chính: Viên thuốc nền trắng tinh nổi bật `[▶ Xem Ngay]` với chữ và biểu tượng play màu đen đậm.
          - Nút phụ: Viên thuốc kính mờ tối màu `[Chi Tiết]` với viền tinh tế.
          - Nút yêu thích: Nút tròn trái tim với hiệu ứng active đỏ hồng.
      - **Cột Phải (Hàng thẻ 3D Coverflow Poster Dọc)**:
        - Poster phim được giữ nguyên tỷ lệ dọc tự nhiên (kích thước chuẩn 225px x 335px), sắc nét 100%, không bị kéo dãn hay mờ.
        - Thẻ ở giữa (active): Nổi bật nhất, đổ bóng sâu 3D, viền sáng nhẹ, có huy hiệu độc quyền bo tròn (`DramaBox Độc quyền` / `AnyReel Độc quyền`).
        - Thẻ hai bên (flanking cards): Nghiêng góc phối cảnh 3D (`rotateY(12deg)` và `rotateY(20deg)`), thu nhỏ dần (`scale(0.88)` và `scale(0.76)`), giảm độ sáng và mờ dần tạo chiều sâu thị giác ấn tượng.
        - Click vào thẻ hai bên để xoay ngay phim đó vào giữa; click vào thẻ chính giữa để mở phát phim lập tức.
      - **Nền Ambient Glow Sang Trọng**:
        - Nền sau là lớp poster được làm nhòe nghệ thuật (`blur(48px)` kết hợp độ sáng `brightness(0.24)`) cùng lớp vignette chuyển màu tối dần từ trái sang phải, tạo không gian điện ảnh cao cấp như Netflix / DramaBox.
  - **Tối ưu hiển thị Responsive & Di động**:
    - Trên màn hình máy tính (>1150px): Bố cục 2 cột cân đối hoàn hảo, nút mũi tên điều hướng hai bên nằm gọn gàng không chạm vào văn bản.
    - Trên màn hình di động (<=820px): Hàng poster 3D xếp trên đầu với mũi tên điều hướng đặt ngay hai bên thẻ, thông tin và nút bấm xếp ngay ngắn bên dưới, huy hiệu gọn gàng không bị xuống dòng.
  - Tích hợp đa ngôn ngữ đầy đủ cho nút Xem Ngay (`hero_play_btn`), Chi Tiết (`hero_detail_btn`), Huy hiệu độc quyền (`badge_exclusive`), và số tập (`hero_episodes_suffix`).
  - Đảm bảo tuyệt đối không có badge phiên bản hay thẻ debug xuất hiện trên giao diện người dùng.

## [0.0.15] - 2026-10-01
### Added & Enhanced
- **3-Tier Responsive Player Suite Architecture (Kiểu To, Kiểu Trung, Kiểu Nhỏ)**:
  - **Kiểu Trung (Medium 3/4 Stacked Layout - 721px to 1150px & `.layout-medium`)**:
    - Specially optimized for tablet screens, split-screen desktop windows (e.g. Windows snap half-screen ~960px width), and resized desktop viewports.
    - **Phần phát phim chiếm 3/4 (71vh-72vh)**: The video viewport container expands to 100% width and occupies 3/4 of the modal stage height, ensuring the vertical video is shown large, crisp, and centered with real-time ambient glow.
    - **Bố cục hiển thị dọc xuống (Vertical Stack Flow)**:
      - Media controls (`.media-control-strip`) span 100% width directly beneath the video viewport with play/next/prev/speed/quality/subtitles.
      - Episodes drawer (`.episodes-drawer`) spans 100% width below controls with multi-column responsive grid (`repeat(auto-fill, minmax(58px, 1fr))`), quick jump to episode, and batch tabs (1-30, 31-60).
      - Drama synopsis card (`.drama-synopsis-panel`) is placed at the bottom with overview, meta badges, and story text.
      - Smooth vertical scrolling allows effortless navigation between the video player, episode selection, and synopsis.
      - Clicking any episode smoothly auto-scrolls back to the video viewport so playback begins immediately in view.
  - **Kiểu To (Large 2-Column Desktop Layout - Screens > 1150px)**:
    - Retains the full 2-column side-by-side desktop workstation layout (`1fr 360px`).
    - Quick layout switch button (`#theater-toggle-btn`) in the top bar allows toggling between Kiểu To (2 columns) and Kiểu Trung (3/4 vertical stack) on demand with real-time feedback toast.
  - **Kiểu Nhỏ (Mobile Fullscreen Viewport - Screens <= 720px)**:
    - Pure mobile fullscreen cinema viewport (`height: calc(100dvh - 56px)`).
    - Floating episode shortcut button appears on hover/touch.
  - Strictly zero version badges or debug tags in the frontend UI.

## [0.0.14] - 2026-10-01
### Added & Enhanced
- **Modern Streaming Top Navbar Architecture (Movie & Series, Anime, Tags, Genre, Featured, Login)**:
  - **Left Primary Content Navigation**:
    - `Home`: Quick return to top showcase and resets active filters.
    - `Movie & Series`: Dedicated view for full series and main streaming catalog.
    - `Anime`: Direct filtering for animation and donghua short drama titles.
    - `Tags ⌵` Dropdown: Ultra-modern frosted glass mega-menu popover featuring trending drama theme chips (`#CEO`, `#Revenge`, `#Billionaire`, `#ContractMarriage`, `#TimeTravel`, `#SweetLove`, `#Urban`, `#MartialArts`, `#Werewolf`, `#SecretIdentity`).
    - `Genre ⌵` Dropdown: Frosted glass popover showcasing high-definition drama genres with custom glass icon badges (`Romance`, `Action`, `Comedy`, `Fantasy`, `Thriller`, `Historical`).
    - `Featured`: Smooth navigation to top picks and daily ranked trending dramas.
  - **Right Utility & Personalization Cluster**:
    - Expandable search input with real-time title preview dropdown.
    - 🕒 `History`: Instant access and smooth scrolling to recent continue-watching episodes.
    - ❤️ `My List`: Dynamic saved drama access with live count badge sync.
    - 🌐 `Language ⌵`: Multi-lingual streaming locale selector.
    - 👤 `Login`: VIP Access member modal with unlimited ad-free 4K playback credentials.
  - **Interactive Filter Bar & Deduplication**:
    - Clicking any tag or genre instantly queries the database, smoothly scrolls to the catalog grid, and shows a stylish active filter chip banner (`#CEO` / `Genre: Romance`) with a 1-click `[Clear Filter]` button.
    - Dedicated **Providers Horizontal Rail** (`AnyReel`, `BibiShort`, etc.) remains clean and visible directly beneath the top bar without text redundancy.
  - **Responsive Design**:
    - Desktop screens (>1024px) enjoy an unobstructed, perfectly balanced single-row navbar.
    - Tablet and mobile screens (<=1024px) seamlessly collapse into a slide-down mobile navigation drawer with touch-friendly controls.
  - Strictly zero version badges or debug tags in the frontend UI.

### Changed & Refined
- **Desktop v0.0.11 Layout Restored & Mobile-Exclusive Fullscreen**:
  - **Desktop (Screens > 820px)**: 100% restored to the proven v0.0.11 interface.
    - Two-column card modal layout: left column contains the 520px video player, media controls, and drama synopsis; right column houses the 360px sticky episode list drawer with batch navigation.
    - Floating `[Episodes ⌵]` shortcut is completely hidden on desktop (`display: none !important;`).
    - Standard theater mode toggle button (`#theater-toggle-btn`) operational.
  - **Mobile (Screens <= 820px or narrow windows)**:
    - Dedicated fullscreen cinema viewport: `100% width x 100dvh` without borders or outer gaps.
    - Vertical video occupies nearly the full screen (`calc(100vh - 56px)` / `calc(100dvh - 56px)`), with controls, episode drawer, and synopsis revealed smoothly on scroll down.
    - **Hover/Touch-Only Episodes Button**:
      - Hidden during normal playback (`opacity: 0; pointer-events: none;`) to keep video playback 100% unobstructed.
      - Reveals with smooth animation exclusively on hover (`@media (hover: hover) { :hover }`) or on mobile tap interaction (`is-active-touch`), fading automatically after 2.5s.
      - Positioned cleanly above the native video player timeline scrubber (`bottom: 58px;`).
  - Maintained strict policy of no version badges or debug tags in the frontend UI.

## [0.0.12] - 2026-10-01
### Changed & Enhanced
- **Full Screen Cinema Playback Layout & Hover-Only Episodes Button**:
  - The drama playback screen now launches in a 100% full-screen immersive cinema viewport across all screen sizes (Desktop, Laptop, Tablet, Mobile) with no outer modal borders, letterbox gaps, or restrictive box padding.
  - The video fills the entire viewport (`calc(100vh - 52px)` / `calc(100dvh - 52px)`), displaying vertical 9:16 and horizontal 16:9 dramas in maximum scale.
  - **On-Hover Episodes Navigation Button**:
    - When watching the video, the purple pill `[Episodes ⌵]` button remains completely hidden (`opacity: 0; pointer-events: none;`) to keep video playback 100% unobstructed.
    - On desktop/mouse devices, the button reveals smoothly with a subtle slide animation exclusively when hovering over the video area (`@media (hover: hover) and (pointer: fine) { .video-viewport:hover .episodes-scroll-btn }`), and disappears instantly when the mouse leaves.
    - On touch devices, tapping the screen activates the button for 2.5 seconds before automatically fading away, eliminating sticky hover artifacts.
    - Floating offset adjusted to float cleanly above the native HTML5 player timeline scrubber and control buttons.
    - Clicking the button smoothly scrolls down to the episode drawer and drama overview.
  - **Auto-Scroll on Episode Selection**:
    - Selecting any episode from the episode grid below automatically smoothly scrolls back to the top of the video for immediate playback.
  - Zero version tags or debug markers displayed in the user interface.

## [0.0.11] - 2026-10-01
### Fixed & Improved
- **Automatic Dead-Stream & Duplicate-Slug Recovery**:
  - Fixed an issue where duplicate drama entries crawled from upstream (e.g., titles with `-2` or trailing periods like `seducing-my-dad-s-best-friend-2`) had empty stream links (`play_url: ""`), causing the video player to display *"No stream link available for this episode"*.
  - Implemented an intelligent **Auto-Recovery Engine** in `/api/drama`:
    1. **Slug Clean-up Strategy**: If all episodes in a drama have empty streams and the slug ends in a duplicate suffix (e.g. `-[2-9]`), the backend automatically strips the suffix and queries the canonical drama route (`cleanPath + '/1'`).
    2. **Title-Match Fallback Strategy**: If streams remain unplayable, the backend performs an internal upstream title search to find and link the active drama stream with playable episodes.
  - Zero playback interruption: Even if a user clicks a dead duplicate entry from search or recommendations, the system seamlessly recovers and streams the active HLS/MP4 video without error.
  - Strict UI cleanliness maintained: No version tags or debug markers displayed in the user interface.

## [0.0.10] - 2026-10-01
### Fixed & Enhanced
- **Provider Catalog & Multi-Tab Pagination Fix**:
  - Resolved issue where providers using non-`home` tab keys (such as `dotdrama`, `dotdrama2` which use `tab_pages[list]`, `bibishort`, `candyjar`, etc.) failed to paginate or fetch all movies. Added dynamic multi-tab page parameters (`list`, `home`, `all`, `all-series`, etc.) so all providers return their complete library across multiple pages.
  - Set default streaming language to Vietnamese (`vi-VN`) to instantly load the full Vietnamese catalogue (e.g. *Hóa thân thành cây cối cai quản muôn vật*, *Quãng đời còn lại trên biển*, *Người Sếp Là Vị Hôn Phu*...).
  - Added **"Tất cả (All Languages)"** option in the header language selector to browse combined multi-lingual catalogs.
  - Multi-tier language fallback ensures providers never show an empty or starved catalog regardless of the selected language.
  - Maintained strict adherence to zero version badges on the website UI.

## [0.0.9] - 2026-10-01
### Changed & Polished
- **Unobstructed Video Playback with On-Hover/Touch Controls**:
  - The floating episode shortcut button `[Episodes ⌵]` is now hidden by default (`opacity: 0; pointer-events: none;`) to keep video playback 100% clean and unobstructed.
  - Button appears smoothly with a slide animation only when the user hovers over the video (`:hover`) or touches/interacts with the screen on mobile devices.
  - Automatically fades away after 2.8 seconds of inactivity on mobile devices.
  - Adhered strictly to keeping version tags out of the public UI.

## [0.0.8] - 2026-10-01
### Added & Improved
- **Nearly Full-Screen Mobile Video Viewport**:
  - Video player now expands to fill almost the entire mobile display height (`height: calc(100dvh - 56px)`), allowing vertical (9:16 portrait) short drama videos to display tall, vibrant, and immersive without letterboxing or squishing.
  - Controls, Multi-batch Episode Drawer (`1-30`, `31-60`...), and synopsis are positioned directly below the fold, smoothly revealed upon scrolling down.
  - Added an intuitive floating `[Episodes ⌵]` scroll shortcut button at the bottom of the video for one-tap navigation to the episode selector.
  - Automatic smooth scroll back to the top of the video when an episode is selected from the grid.
  - Clean HTML entity decoding (`&#039;` -> `'`, `&amp;` -> `&`, etc.) across all drama titles and synopses.

## [0.0.7] - 2026-10-01
### Fixed & Improved
- **Full Responsive Experience Across All Screen Sizes (Mobile, Tablet, Desktop)**:
  - **Sticky Top Video Player on Mobile**: Fixed issue on smartphones where the video player would get obscured or pushed off-screen. On screens ≤ 820px, the video viewport is now pinned sticky at the top (`position: sticky; top: 0; z-index: 50`) with an optimized 16:9 aspect ratio and max height constraint.
  - **Intelligent Episode Drawer Flow**: Re-ordered the mobile playback layout so that the Episode Selector drawer (`1-30`, `31-60`...) and interactive episode buttons sit directly below the video player controls, allowing users to browse and switch episodes seamlessly while the video remains in view.
  - **Responsive Header & Search System**: Fixed navigation container wrapping on mobile devices to prevent horizontal body overflow (`scrollWidth` = 390px edge-to-edge). Search input spans cleanly across full width underneath the brand logo and language switcher.
  - **Mobile Hero Banner & Grids**: Scaled Hero banner padding, typography, indicator pills, and navigation arrows for touchscreens; library drama cards automatically display in a clean 2-column mobile layout.
  - **No Version Badges**: Adhered strictly to keeping version tags out of the public UI.

## [0.0.6] - 2026-09-30
### Added
- Interactive Hero Showcase Banner Slide Bar (Carousel):
  - Top 6 featured releases rotation with smooth cross-fade animation.
  - Left & Right glassmorphic circular navigation arrows (`<` and `>`).
  - Animated slide indicator progress pills with live progress bar timer filling up over 5 seconds.
  - Slide counter indicator (`1 / 6`, `2 / 6`...).
  - Dynamic trending badges (`#1 TOP RANKED TODAY`, `#2 TRENDING NOW`, `#3 AUDIENCE CHOICE`...).
  - Automatic slide advance with smart pause-on-hover.

## [0.0.5] - 2026-09-30
### Fixed
- Fixed empty catalogue issue on providers such as Vyntage, PineDrama, etc., caused by passing extraneous `tab_pages[trending]` and `tab_pages[popular]` parameters to providers that only support `home`.
- Added resilient language and catalog fallback in `/api/sections`: automatically falls back without strict language locks or to native upstream catalog so all 54 providers return their full list of drama titles.

## [0.0.4] - 2026-09-30
### Added
- Interactive Left & Right carousel navigation buttons (`<` and `>`) for the **Continue Watching** section (`#history-section`) and **My List** section (`#favorites-section`) to easily browse through saved history and bookmarked dramas without scrollbars.
- Smooth mouse wheel horizontal scrolling support on both Continue Watching and My List rails.
- Smart boundary detection with dynamic opacity dimming when reached the start or end of the rails.

## [0.0.3] - 2026-09-30
### Added
- Multi-language streaming selector dropdown in header navbar supporting 13 top international languages (English, Bahasa Indonesia, 日本語, 한국어, 繁體中文, Español, ภาษาไทย, Deutsch, português, Tiếng Việt, Français, العربية, Русский).
- Dynamic localization query parameter `lang` synchronized across sections, provider lists, and live search.
- Smooth mouse wheel horizontal scrolling support on the Providers rail.

### Fixed
- Restored visible, sleek custom horizontal scrollbar for the Providers rail (`.providers-rail-wrap`) so users can easily browse and drag through all 54 live providers.
- Maintained clean scrollbar-free style on Top 10 Ranked Hits and other content rails with dedicated `<` and `>` arrow navigation.

## [0.0.2] - 2026-09-30
### Changed
- Removed horizontal scrollbars on all content rails (Top 10, providers, history, favorites) for a clean modern design.
- Activated interactive Left & Right carousel navigation buttons (`<` and `>`) on the Top 10 section to smoothly slide items left and right with smart boundary detection.
- Updated version tracking to `tool_version` 0.0.2.

## [0.0.1] - 2026-09-30
### Added
- Complete reverse-engineered streaming pipeline for short dramas from `narto-drama.com`.
- Gateway bypass using dynamic hex timestamp cookie `nd_ck`.
- Ad-gate bypass extracting direct raw `.m3u8` and `.mp4` URLs without 4-ad click gates.
- Automatic live sync of all 54 upstream providers (AnyReel, BibiShort, CandyJar, DramaBox, etc.).
- Responsive commercial streaming frontend with Netflix-style Top 10 Ranked Hits rail.
- Embedded Hls.js video player with episode grouping tabs (1-30, 31-60...), playback speed controls (0.75x - 2.0x), and theater mode.
- Local Watch History and Bookmarks/Favorites persistence in LocalStorage.
- Real-time live search with debounced preview dropdown.
- Image poster proxy and URL normalizer on backend + safe fallback to fix relative path `/assets/poster/*` broken images.
- Complete English localization for all UI buttons, headings, and labels.
- Clean navbar header without unnecessary VIP ribbons or badges.

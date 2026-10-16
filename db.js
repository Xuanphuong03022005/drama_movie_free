/**
 * ===================================================================
 * DATABASE CLIENT & SUPABASE PROXY (db.js)
 * ===================================================================
 * Lưu ý: Toàn bộ logic kết nối và lưu dữ liệu lên Supabase đã được
 * quy hoạch và tách riêng sang file:
 *    --> ./supabase.js
 * 
 * File db.js này đóng vai trò re-export / proxy tương thích ngược,
 * giúp các file cũ như server.js vẫn chạy bình thường mà không cần sửa đổi.
 * ===================================================================
 */

const supabase = require('./supabase');

module.exports = supabase;

# GPT Email API & GPT Expiry Reminder

## Tính năng repo này
- API xác thực email, deploy trên Vercel: `/api/check-email.js`
- Script tự động gửi nhắc hạn GPTs, chạy mỗi ngày qua GitHub Actions: `send-gpt-expiry-reminder.js`

## Sử dụng
1. Tải/copy code repo về máy
2. `npm install`
3. Thiết lập biến môi trường:
   - Trên Vercel (cho API xác thực)
   - Trên GitHub Secrets (cho script nhắc hạn)
4. Deploy lên Vercel và/hoặc GitHub

## Lưu ý
- `.env.example` chỉ là file mẫu, không dùng key thật
- Xem kỹ hướng dẫn cấu hình Google Sheet, Service Account, Gmail App Password trong phần trước

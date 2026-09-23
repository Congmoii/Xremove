# Kiến trúc Xremove 1.1.1

Ứng dụng có hai đường xử lý tách biệt:

| Thao tác | Nơi xử lý | Vòng đời |
| --- | --- | --- |
| Làm sạch ảnh watermark tương thích | `gemini-watermark-remover` trong trình duyệt | Dừng khi tab đóng |
| Tách nền PNG/JPEG/WebP | U2NetP ONNX + ONNX Runtime Web/WASM trong trình duyệt | Dừng khi tab đóng |
| Văn bản, PDF, DOCX, video Beta | Dịch vụ Python chạy worker riêng | Tiếp tục khi tab đóng; kết nối lại theo ID |
| Xóa metadata ảnh, video, PDF, DOCX | Dịch vụ Python chạy worker riêng | Tiếp tục khi tab đóng; kết nối lại theo ID |

Nhánh video mặc định gọi `clean_av` của upstream để làm sạch metadata/remux. Xử lý watermark ở pixel từng khung hình cần backend GPU tùy chọn mà ZIP này không đóng gói; không có tách nền video.

Giao diện React/TypeScript ở `src/App.tsx` cho người dùng chọn thao tác trước khi tải tệp. `src/background/segmentation.ts` kiểm tra chữ ký ảnh, kích thước và hash mô hình, giải mã ảnh, chạy suy luận WASM trên CPU, rồi phóng mask về kích thước gốc. Một phiên ONNX được dùng lại cho cả batch. `src/background/mask.ts` giữ mask riêng, sửa mask theo nét cọ và xuất pixel đã chỉnh. `BackgroundWorkspace.tsx` xếp hàng tuần tự, quản lý trạng thái theo ảnh và đóng ZIP chỉ từ các ảnh hoàn tất. PNG giữ alpha; JPEG dùng nền trắng nếu người dùng đang chọn trong suốt.

Mô hình cố định: `edgetools/u2netp`, `u2netp.onnx`, 4,574,861 byte, SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`. Đầu vào NCHW 320×320, đầu ra mask 320×320. Mô hình và WASM được nhúng vào HTML để hoạt động ngoại tuyến. Kích thước file HTML khoảng 61 MB; đây là đánh đổi giữa khả năng chạy độc lập và kích thước gói. Mô hình nhẹ chưa được chứng minh đạt chất lượng thương mại ở tóc/vật thể trong suốt.

## Dịch vụ job

Launcher kiểm tra `/api/health` có đúng `service=xremove-local-jobs` và `version=1.1.0`, khởi động Python đóng gói nếu cần, rồi mở `http://127.0.0.1:8765/`. Dịch vụ phục vụ HTML và API cùng nguồn. Bản `file://` vẫn dùng được cho thao tác ảnh; job tài liệu/video cần launcher.

1. Giao diện lấy token phiên từ `GET /api/session`.
2. `POST /api/jobs` gửi binary, trả ID và trạng thái `queued`.
3. Một worker xử lý từng job bằng tiến trình con có thể dừng. `GET /api/jobs/{id}` trả `queued/running/done/error/cancelling/cancelled`.
4. `GET /api/jobs/{id}/result` trả binary và MIME khi hoàn tất. `DELETE /api/jobs/{id}` hủy job chờ hoặc dừng tiến trình đang chạy.
5. Giao diện lưu ID/tên/MIME trong `localStorage` và tự kiểm tra lại khi mở tab mới. Nếu dịch vụ khởi động lại, ID cũ sẽ trả 404; giao diện không tự gửi lại tệp.

Dịch vụ bind loopback, kiểm tra Host và Origin, không phát CORS wildcard, yêu cầu Bearer token cho API job, giới hạn 100 MB/tệp, một worker và tám job chờ, 16 kết nối HTTP, 15 phút/job. Kết quả tạm tồn tại tối đa một giờ. `/api/health` chạy trên HTTP server đa luồng để còn đáp ứng khi worker bận. Xem [quyền riêng tư](PRIVACY.md) để biết vị trí tệp tạm và dọn dẹp khi crash.

Lệnh `pnpm run dev` trên cổng 8090 chỉ phù hợp cho phần ảnh vì job API yêu cầu cùng nguồn. Để phát triển job, build HTML rồi cho dịch vụ phục vụ `dist/index.html` qua biến `XREMOVE_UI_PATH`.

Các trạng thái React hiện còn tập trung ở `App.tsx`; `runIdRef` và AbortController ngăn kết quả tác vụ cũ ghi đè tác vụ mới. Đây là điểm cần tiếp tục tách thành bộ quản lý job riêng nếu mở rộng thêm nhiều loại xử lý.

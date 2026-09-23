# Quyền riêng tư và lưu giữ dữ liệu

Xremove không gửi ảnh hay tài liệu lên API đám mây và không tích hợp telemetry. Bản HTML độc lập đã nhúng mô hình U2NetP và WASM; tách nền, làm sạch ảnh và các chức năng văn bản/DOCX hỗ trợ chạy trong trình duyệt, không cần mạng. Dịch vụ cục bộ trên `127.0.0.1` chỉ thuộc quy trình Windows cũ.

## Dữ liệu trong trình duyệt

- Ảnh gốc, bitmap và mask nằm trong bộ nhớ của tab. Mã giải phóng bitmap và Blob URL khi người dùng bỏ ảnh hoặc rời workspace; thời điểm bộ thu gom bộ nhớ thu hồi các bộ đệm khác do trình duyệt quyết định.
- Hàng đợi tách nền sẽ dừng khi tab bị đóng; không có bảo đảm chạy ngầm cho suy luận WASM trong tab.
- `localStorage` giữ lựa chọn ngôn ngữ `xremove.lang`. Khi có job dịch vụ, `xremove.pendingJob` giữ **job ID, tên tệp và MIME** để giao diện mở lại có thể tiếp tục. Không lưu nội dung tệp hoặc token phiên trong `localStorage`. Mục này được xóa khi lấy được kết quả, hủy hoặc khi dịch vụ xác nhận job đã mất.

## Dữ liệu của job dịch vụ

- Giao diện gửi tệp dạng nhị phân đến dịch vụ Python cùng nguồn. Dịch vụ tạo tệp đầu vào/kết quả tạm trong thư mục `Xremove-jobs/run-*` dưới thư mục tạm của hệ điều hành (thường là `%TEMP%` trên Windows). Tệp đầu vào được xóa khi job thành công; kết quả và báo cáo được giữ tối đa một giờ để có thể kết nối lại.
- Job hủy hoặc thất bại được dọn ngay khi worker dừng. Nếu dịch vụ bị tắt bất thường, thư mục chạy cũ được dọn khi dịch vụ khởi động lại **sau 24 giờ**; có thể còn trên đĩa trước thời điểm đó.
- Dịch vụ giữ token phiên ngẫu nhiên trong bộ nhớ tiến trình. Trình duyệt nhận token từ `/api/session` cùng nguồn; API job yêu cầu token, Host/Origin hợp lệ và giới hạn kích thước/hàng đợi. Điều này bảo vệ khỏi yêu cầu web chéo nguồn thông thường, không thay thế cơ chế phân quyền giữa các chương trình cùng tài khoản Windows.
- Launcher có thể ghi đường dẫn cài đặt và lỗi khởi động vào `logs/launcher.log`. Dịch vụ không ghi token hay nội dung tệp vào log HTTP.

Sau khi đóng Xremove và khi không còn job cần lấy lại, người dùng có thể xóa thư mục `Xremove-jobs` trong thư mục tạm của hệ điều hành. Việc này làm mất các kết quả chưa tải.

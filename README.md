# Xremove 1.1.2

Xremove là ứng dụng HTML cục bộ để tách nền ảnh và làm sạch một số tệp. Tải bản HTML, mở trực tiếp bằng trình duyệt, rồi kéo tệp vào. Không cần EXE, Python hoặc tài khoản đám mây cho các chức năng của bản HTML.

## Dành cho người dùng

Vào mục **Releases** của repository GitHub, mở bản phát hành mới nhất rồi tải tệp `Xremove-v<phiên bản>.html` trong **Assets**. Nhấp đúp tệp vừa tải để mở bằng Chrome hoặc Edge. Không cần giải nén, cài đặt hay chạy máy chủ. Có thể dùng ngoại tuyến sau khi tải về. Nếu muốn tải kèm README và giấy phép, chọn tệp `Xremove-v<phiên bản>-HTML-only.zip`, giải nén rồi mở HTML bên trong. Mục **Code → Download ZIP** chỉ là mã nguồn dành cho người phát triển.

| Đầu vào | Xử lý trong HTML |
| --- | --- |
| PNG/JPEG/WebP | Làm sạch watermark ảnh tương thích hoặc tách nền bằng mô hình U2NetP ngoại tuyến; có chỉnh mask và xuất PNG/JPEG/ZIP. |
| TXT/Markdown UTF-8 | Xóa các ký tự Unicode vô hình được hỗ trợ; cũng nhận đoạn chữ kéo thả hoặc dán bằng Ctrl+V. Văn bản thuần không có metadata nhúng chuẩn. |
| DOCX | Xóa ký tự vô hình trong các đoạn chữ, loại bỏ `docProps/*` và tham chiếu tương ứng, tạo lại ZIP không giữ timestamp/comment cũ. |

PDF, video, `.doc` cũ và các thuộc tính tệp do hệ điều hành quản lý không được làm sạch bằng HTML độc lập. Xóa metadata không chứng minh một tệp không do AI tạo. Mô hình tách nền nhẹ có thể cho viền kém ở tóc, vật thể trong suốt hoặc nền gần màu chủ thể. Xem [kiến trúc](docs/ARCHITECTURE.md) và [quyền riêng tư](docs/PRIVACY.md).

## Phát triển từ mã nguồn trên GitHub

Yêu cầu Node.js 24+, pnpm 12.1.0 và Git. Repository chỉ chứa mã nguồn; không commit runtime Windows, FFmpeg, bản build, tệp người dùng hoặc trọng số mô hình. Lệnh `fetch:model` tải `u2netp.onnx` từ [trang model](https://huggingface.co/edgetools/u2netp) rồi kiểm tra kích thước và SHA-256 cố định trước khi dùng. Sau khi build, HTML hoạt động ngoại tuyến.

```bash
pnpm install --frozen-lockfile
pnpm run fetch:model
pnpm run bootstrap:vendor
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec playwright install chromium
node tests/verify_standalone_text_e2e.mjs
```

Mẫu thử ở `samples/van-ban-thu-ky-tu-an.txt` chứa đúng năm ký tự vô hình. Sau khi tải vào HTML, báo cáo cần ghi loại bỏ năm ký tự.

## Tạo gói cho GitHub Release

`pnpm run build:release` tạo hai **bản ứng viên** trong `release/github/`: một HTML độc lập có nhúng thông báo giấy phép và một ZIP chứa HTML cùng giấy phép/thông báo. Script không đóng gói EXE, Python hay FFmpeg. `node tests/verify_release_package.mjs` kiểm tra hash, nội dung ZIP và luồng `file://`. Khi đẩy thẻ phiên bản khớp với `package.json`, GitHub Actions tự tạo các tệp này, kiểm tra và đính kèm vào một Release dạng nháp. Không commit các tệp trong `release/`; chỉ công bố bản nháp sau khi xác minh quyền phân phối mô hình theo [quy trình phát hành](docs/RELEASING.md). GitHub chặn tệp lớn hơn 100 MiB trong Git thông thường, còn mỗi Release asset được phép dưới 2 GiB: [tài liệu kích thước tệp](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [tài liệu Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

**Trước khi phát hành công khai**, xác minh độc lập quyền phân phối của đúng binary ONNX được nhúng vào HTML; [model card](https://huggingface.co/edgetools/u2netp) ghi Apache-2.0 nhưng lịch sử checkpoint → ONNX chưa được xác minh độc lập. Xem [thông báo bên thứ ba](THIRD_PARTY_LICENSES.md) và [quy trình phát hành](docs/RELEASING.md). Các ZIP Windows 1.1.0/1.1.1 trong máy phát triển là bản cũ, không thuộc bản HTML 1.1.2 và không được đưa lên Release mới; chúng có FFmpeg GPLv3 cần một quy trình tuân thủ riêng.

Không có thao tác push hoặc publish tự động.

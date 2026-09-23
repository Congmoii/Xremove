# Chuẩn bị GitHub và phát hành HTML

## Repository mã nguồn

1. Chỉ commit tệp mã nguồn và tài liệu. `.gitignore` loại trừ `dist/`, `release/`, `runtime/python/`, `tools/ffmpeg/`, `models/*.onnx`, `output/`, `backups/`, `github-export/` và dữ liệu tạm. Kiểm tra danh sách tệp sẽ commit và quét bí mật trước khi push.
2. Cài dependency theo `pnpm-lock.yaml`. Chạy `pnpm run fetch:model` và `pnpm run bootstrap:vendor`; model và upstream service được kiểm tra theo hash/commit cố định. Không thay binary chưa được rà soát.
3. Chạy `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `node tests/verify_standalone_text_e2e.mjs`.

## Bản ứng viên GitHub Release

1. Chạy `pnpm run build:release`, sau đó `node tests/verify_release_package.mjs`.
2. Kiểm tra `release/github/Xremove-v<version>.html` và `Xremove-v<version>-HTML-only.zip` cùng các tệp `.sha256.txt`. ZIP chỉ chứa HTML, README và giấy phép/thông báo. Không đưa ZIP hoặc HTML 61 MB vào lịch sử Git.
3. Kiểm tra nội dung tiếng Anh/tiếng Việt trên trình duyệt phổ biến; thử ảnh và DOCX đa dạng, không chỉ fixture tự động. Nêu rõ giới hạn PDF/video và chất lượng mask.
4. **Chỉ công bố public sau khi xác nhận quyền phân phối của đúng trọng số ONNX trong HTML.** Trang mirror ghi Apache-2.0; đây không thay thế việc xác minh checkpoint và bản chuyển đổi ONNX. Nếu chưa xác nhận được, giữ artifact cục bộ hoặc private và không gắn nhãn phát hành công khai.

Gói Windows 1.1.0/1.1.1 trước đây có bản FFmpeg full build `--enable-gpl --enable-version3` (GPLv3). Quy trình HTML-only hiện không đóng gói FFmpeg. Nếu muốn phát hành lại gói Windows, cần rà soát giấy phép, thông báo, mã nguồn tương ứng và nghĩa vụ của các thư viện đi kèm theo [FFmpeg Legal](https://www.ffmpeg.org/legal.html) trước khi tạo Release riêng. Không dùng lại ZIP cũ làm asset của phiên bản HTML mới.

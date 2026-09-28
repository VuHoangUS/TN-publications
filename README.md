# Form nộp công bố khoa học

Form web thu thập thông tin bài báo khoa học của nhân viên bệnh viện, phục vụ **thống kê nội bộ** và **xét thưởng**.

- **Frontend:** trang tĩnh trên GitHub Pages (`index.html`, `assets/`), ví dụ `https://vuhoangus.github.io/tong-hop-publications/`
- **Backend:** Google Apps Script Web App (`apps-script/`), ghi dữ liệu vào Google Sheet
  [Tổng hợp Công bố Khoa học](https://docs.google.com/spreadsheets/d/1zZkQ3pSskgvwyU8NWw0HOVQ6pZDIB5UtHHEUB7UUr1U/edit)

```
Trình duyệt (GitHub Pages) ──GET ?action=config / checkDoi──▶ Apps Script ──▶ Google Sheet
                           ──POST JSON (text/plain)────────▶  (doPost)    ──▶ Drive: "Minh chứng công bố"
                           ──GET api.crossref.org (tự điền từ DOI)
```

## Cấu trúc Google Sheet

| Tab | Nội dung |
|---|---|
| `CongBo` | Mỗi hồ sơ một dòng. 3 cột cuối (**Trạng thái duyệt**, **Mức thưởng**, **Ghi chú duyệt**) dành cho người duyệt. |
| `TacGia_BV` | Mỗi tác giả là nhân viên bệnh viện một dòng, dùng để tính thưởng theo cá nhân/khoa. Cột *Trạng thái duyệt* tự lấy từ tab `CongBo`. |
| `KhoaPhong` | Danh sách Khoa/Phòng hiển thị trong form. Sửa trực tiếp ở đây, form tự cập nhật. |
| `CauHinh` | Mở/đóng form, hạn chót, mốc thống kê, thông tin liên hệ, bật/tắt email xác nhận. |

> Không đổi tên tab hoặc thứ tự cột trong `CongBo` / `TacGia_BV` vì code ghi dữ liệu theo đúng thứ tự này.

## Triển khai backend (Apps Script), làm 1 lần

1. Mở Google Sheet → **Tiện ích mở rộng → Apps Script**. Cách khác: vào [script.google.com](https://script.google.com) và tạo dự án mới.
2. Dán nội dung `apps-script/Code.gs` vào file `Code.gs`.
3. Bật hiển thị manifest: **Cài đặt dự án (⚙) → Hiển thị tệp kê khai "appsscript.json"**, rồi dán nội dung `apps-script/appsscript.json` vào.
4. Chọn hàm **`setup`** → **Chạy**. Google sẽ hỏi cấp quyền: chọn tài khoản → *Nâng cao* → *Đi tới … (không an toàn)* → *Cho phép*. Đây là bước bình thường với script tự viết.
   Hàm này tạo dropdown "Trạng thái duyệt" và tạo thư mục **Minh chứng công bố** cạnh file Sheet.
5. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**
   - *Thực thi dưới dạng:* **Tôi**
   - *Người có quyền truy cập:* **Bất kỳ ai** (bắt buộc, vì trang GitHub Pages gọi vào mà không đăng nhập Google)
6. Sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

> Mỗi lần sửa `Code.gs`, vào **Triển khai → Quản lý tùy chọn triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai**. Chỉ lưu code thôi thì URL `/exec` vẫn chạy bản cũ. Kiểm tra số phiên bản "máy chủ" ở chân trang form.

## Triển khai frontend (GitHub Pages)

1. Dán URL `/exec` vào `assets/config.js` → `API_URL`, rồi commit.
2. Trên GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Sau khoảng 1 phút, form chạy tại `https://vuhoangus.github.io/tong-hop-publications/`.

## Vận hành

- **Đóng/mở form:** sửa `CauHinh!NHAN_PHAN_HOI` thành `Có` hoặc `Không`. Form cũng tự đóng khi qua ngày `HAN_CHOT`.
- **Đợt thống kê:** `TU_NGAY` chặn các bài xuất bản trước mốc này.
- **Bài nộp trùng:** nếu DOI đã có, form cảnh báo người nộp và cột *Trùng DOI với hồ sơ* ghi mã hồ sơ trước đó để đối chiếu.
- **Duyệt/xét thưởng:** chọn *Trạng thái duyệt* và nhập *Mức thưởng* trong tab `CongBo`. Tab `TacGia_BV` tự cập nhật trạng thái để lọc hoặc lập pivot theo người/khoa.

## Lưu ý bảo mật

Web App mở cho "Bất kỳ ai" nên email người nộp không được Google xác thực. Form đã có trường bẫy bot, kiểm tra dữ liệu ở server, chặn chèn công thức vào Sheet, giới hạn file 10 MB (chỉ nhận PDF/ảnh), và mọi hồ sơ đều ở trạng thái *Chờ duyệt* cho đến khi người duyệt xác nhận.

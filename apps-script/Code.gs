/**
 * BACKEND — Form nộp công bố khoa học
 * Frontend chạy trên GitHub Pages, gọi vào Web App này qua fetch():
 *   GET  ?action=config          -> cấu hình + danh sách Khoa/Phòng
 *   GET  ?action=checkDoi&doi=.. -> kiểm tra DOI đã được nộp chưa
 *   POST (body JSON, text/plain) -> nộp hồ sơ
 *
 * Triển khai: xem README.md trong repo.
 */

var CODE_VERSION = '2026-09-28.1';

var SPREADSHEET_ID = '1zZkQ3pSskgvwyU8NWw0HOVQ6pZDIB5UtHHEUB7UUr1U';
var SHEET_CONG_BO = 'CongBo';
var SHEET_TAC_GIA = 'TacGia_BV';
var SHEET_KHOA = 'KhoaPhong';
var SHEET_CAU_HINH = 'CauHinh';
var MINH_CHUNG_FOLDER_NAME = 'Minh chứng công bố';
var MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Thứ tự cột của tab CongBo — phải khớp với hàng tiêu đề trong Sheet.
var HEADERS = [
  'Mã hồ sơ', 'Thời gian nộp', 'Email người nộp', 'Họ tên người nộp', 'Khoa/Phòng người nộp',
  'Số điện thoại', 'Vai trò người nộp', 'DOI', 'Link bài báo', 'Tên bài báo', 'Loại bài',
  'Tình trạng xuất bản', 'Ngày xuất bản', 'Năm xuất bản', 'Tập (Volume)', 'Số (Issue)', 'Trang',
  'Danh sách tác giả', 'Tác giả đứng đầu', 'Tác giả liên hệ', 'Số tác giả là NV BV',
  'Tác giả là NV BV (chi tiết)', 'Khoa/Phòng tham gia', 'Có ghi tên BV trong affiliation', 'Hợp tác',
  'Phạm vi tạp chí', 'Tên tạp chí', 'ISSN', 'Chỉ mục', 'Xếp loại SJR', 'Impact Factor',
  'Thuộc danh mục HĐGSNN', 'Điểm HĐGSNN', 'File minh chứng', 'Ghi chú', 'Trùng DOI với hồ sơ',
  'Trạng thái duyệt', 'Mức thưởng', 'Ghi chú duyệt'
];
var TAC_GIA_HEADERS = [
  'Mã hồ sơ', 'Thời gian nộp', 'DOI', 'Tên bài báo', 'Họ tên tác giả', 'Khoa/Phòng',
  'Vai trò trong bài', 'Phạm vi tạp chí', 'Xếp loại SJR', 'Thuộc danh mục HĐGSNN', 'Trạng thái duyệt'
];

var LOAI_BAI = ['Nghiên cứu gốc', 'Tổng quan', 'Tổng quan hệ thống / Phân tích gộp', 'Báo cáo ca lâm sàng',
  'Thư / Bình luận', 'Tóm tắt hội nghị', 'Khác'];
var TINH_TRANG = ['Đã xuất bản chính thức', 'Đã online (chưa in)', 'Đã được chấp nhận'];
var VAI_TRO = ['Tác giả đứng đầu', 'Tác giả liên hệ', 'Tác giả đứng đầu & liên hệ', 'Đồng tác giả'];
var VAI_TRO_NGUOI_NOP = VAI_TRO.concat(['Nộp hộ']);
var PHAM_VI = ['Trong nước', 'Quốc tế'];
var SJR = ['Q1', 'Q2', 'Q3', 'Q4', 'Không xếp loại'];
var CO_KHONG = ['Có', 'Không'];

/* ======================= HTTP entry points ======================= */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'config') return json_(getPublicConfig_());
    if (p.action === 'checkDoi') return json_({ success: true, matches: findByDoi_(p.doi) });
    return json_({ success: true, service: 'cong-bo-khoa-hoc', version: CODE_VERSION });
  } catch (err) {
    return json_({ success: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    return json_(handleSubmit_(payload));
  } catch (err) {
    console.error(err);
    return json_({ success: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ======================= Config ======================= */

function readConfig_() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_CAU_HINH);
  var rows = sh.getDataRange().getDisplayValues();
  var cfg = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) cfg[String(rows[i][0]).trim()] = String(rows[i][1] || '').trim();
  }
  return cfg;
}

function readKhoaPhong_() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_KHOA);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getDisplayValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (s) { return s; });
}

/** "dd/mm/yyyy" -> Date (00:00 giờ VN) hoặc null. */
function parseVnDate_(s) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/** Trạng thái mở/đóng tính ở server, để frontend không tự quyết. */
function formState_(cfg) {
  if (cfg.NHAN_PHAN_HOI && cfg.NHAN_PHAN_HOI.toLowerCase() !== 'có') {
    return { open: false, reason: 'Form hiện đang tạm đóng.' };
  }
  var deadline = parseVnDate_(cfg.HAN_CHOT);
  if (deadline) {
    var end = new Date(deadline.getTime() + 24 * 3600 * 1000); // hết ngày hạn chót
    if (new Date() >= end) return { open: false, reason: 'Đã hết hạn nộp (' + cfg.HAN_CHOT + ').' };
  }
  return { open: true };
}

function getPublicConfig_() {
  var cfg = readConfig_();
  var state = formState_(cfg);
  var deadline = parseVnDate_(cfg.HAN_CHOT);
  return {
    success: true,
    version: CODE_VERSION,
    open: state.open,
    closedReason: state.reason || '',
    title: cfg.TIEU_DE || 'CUNG CẤP THÔNG TIN CÔNG BỐ KHOA HỌC',
    unit: cfg.DON_VI || '',
    deadline: cfg.HAN_CHOT || '',
    // mốc kết thúc hạn chót (ms) để frontend chạy đồng hồ đếm ngược
    deadlineEndMs: deadline ? deadline.getTime() + 24 * 3600 * 1000 - 1000 : null,
    fromDate: cfg.TU_NGAY || '',
    contactEmail: cfg.EMAIL_LIEN_HE || '',
    contactPhone: cfg.SDT_LIEN_HE || '',
    trackingLink: cfg.LINK_THEO_DOI || '',
    khoaPhong: readKhoaPhong_(),
    maxFileMB: MAX_FILE_BYTES / 1024 / 1024
  };
}

/* ======================= DOI ======================= */

function normalizeDoi_(s) {
  s = String(s || '').trim();
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return s.toLowerCase();
}

function findByDoi_(doi) {
  var d = normalizeDoi_(doi);
  if (!d) return [];
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_CONG_BO);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var cId = HEADERS.indexOf('Mã hồ sơ'), cDoi = HEADERS.indexOf('DOI'),
      cName = HEADERS.indexOf('Họ tên người nộp'), cTime = HEADERS.indexOf('Thời gian nộp');
  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues();
  var out = [];
  rows.forEach(function (r) {
    if (normalizeDoi_(r[cDoi]) === d) out.push({ id: r[cId], by: r[cName], at: r[cTime] });
  });
  return out;
}

/* ======================= Submit ======================= */

function str_(v, max) {
  var s = (v === null || v === undefined) ? '' : String(v).trim();
  if (max && s.length > max) s = s.slice(0, max);
  // chặn chèn công thức vào Sheet (=, +, @ ở đầu ô)
  if (/^[=+@]/.test(s)) s = ' ' + s;
  return s;
}

function oneOf_(v, list, label) {
  var s = String(v || '').trim();
  if (list.indexOf(s) === -1) throw new Error('Giá trị không hợp lệ cho "' + label + '".');
  return s;
}

function required_(v, label) {
  if (!v) throw new Error('Thiếu thông tin bắt buộc: ' + label + '.');
  return v;
}

function validate_(p, khoaList) {
  var d = {};
  d.email = required_(str_(p.email, 200), 'Email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error('Email không hợp lệ.');
  d.hoTen = required_(str_(p.hoTen, 150), 'Họ tên người nộp');
  d.khoaNguoiNop = oneOf_(p.khoaNguoiNop, khoaList, 'Khoa/Phòng người nộp');
  d.sdt = str_(p.sdt, 30);
  d.vaiTro = oneOf_(p.vaiTro, VAI_TRO_NGUOI_NOP, 'Vai trò người nộp');

  d.doi = normalizeDoi_(p.doi);
  d.link = str_(p.link, 500);
  if (!d.doi && !d.link) throw new Error('Cần nhập DOI hoặc link bài báo.');
  if (d.doi && !/^10\.\d{4,9}\/\S+$/.test(d.doi)) throw new Error('DOI không đúng định dạng (bắt đầu bằng 10.xxxx/...).');
  d.tenBai = required_(str_(p.tenBai, 1000), 'Tên bài báo');
  d.loaiBai = oneOf_(p.loaiBai, LOAI_BAI, 'Loại bài');
  d.tinhTrang = oneOf_(p.tinhTrang, TINH_TRANG, 'Tình trạng xuất bản');

  d.ngayXB = '';
  d.namXB = '';
  if (p.ngayXB) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.ngayXB));
    if (!m) throw new Error('Ngày xuất bản không hợp lệ.');
    d.ngayXB = m[3] + '/' + m[2] + '/' + m[1];
    d.namXB = m[1];
    var from = parseVnDate_(readConfig_().TU_NGAY);
    var pub = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (from && pub < from) throw new Error('Bài xuất bản trước mốc thống kê, không thuộc đợt này.');
  } else if (d.tinhTrang !== 'Đã được chấp nhận') {
    throw new Error('Thiếu thông tin bắt buộc: Ngày xuất bản.');
  }
  d.tap = str_(p.tap, 30);
  d.so = str_(p.so, 30);
  d.trang = str_(p.trang, 30);

  d.dsTacGia = required_(str_(p.dsTacGia, 5000), 'Danh sách tác giả');
  d.tgDauTien = required_(str_(p.tgDauTien, 150), 'Tác giả đứng đầu');
  d.tgLienHe = required_(str_(p.tgLienHe, 300), 'Tác giả liên hệ');

  var staff = Array.isArray(p.tacGiaBV) ? p.tacGiaBV : [];
  d.tacGiaBV = staff.slice(0, 100).map(function (a) {
    return {
      ten: required_(str_(a && a.ten, 150), 'Họ tên tác giả là nhân viên BV'),
      khoa: oneOf_(a && a.khoa, khoaList, 'Khoa/Phòng của tác giả'),
      vaiTro: oneOf_(a && a.vaiTro, VAI_TRO, 'Vai trò của tác giả')
    };
  });
  if (!d.tacGiaBV.length) throw new Error('Cần ít nhất 1 tác giả là nhân viên bệnh viện.');

  d.affiliation = oneOf_(p.affiliation, CO_KHONG, 'Có ghi tên BV trong affiliation');
  d.hopTac = oneOf_(p.hopTac, ['Không', 'Trong nước', 'Quốc tế', 'Trong nước và quốc tế'], 'Hợp tác');

  d.phamVi = oneOf_(p.phamVi, PHAM_VI, 'Phạm vi tạp chí');
  d.tapChi = required_(str_(p.tapChi, 300), 'Tên tạp chí');
  d.issn = str_(p.issn, 40).toUpperCase();
  if (d.issn && !/^\d{4}-\d{3}[\dX](\s*[,;]\s*\d{4}-\d{3}[\dX])*$/.test(d.issn)) {
    throw new Error('ISSN không đúng định dạng (ví dụ 1234-567X).');
  }
  d.chiMuc = ''; d.sjr = ''; d.impact = ''; d.hdgs = ''; d.diemHdgs = '';
  if (d.phamVi === 'Quốc tế') {
    var cm = Array.isArray(p.chiMuc) ? p.chiMuc : [];
    d.chiMuc = cm.map(function (x) { return str_(x, 60); }).filter(String).join(', ');
    d.sjr = oneOf_(p.sjr, SJR, 'Xếp loại SJR');
    d.impact = str_(p.impact, 20);
  } else {
    d.hdgs = oneOf_(p.hdgs, ['Có', 'Không', 'Không rõ'], 'Thuộc danh mục HĐGSNN');
    d.diemHdgs = str_(p.diemHdgs, 20);
  }
  d.ghiChu = str_(p.ghiChu, 3000);
  if (p.camKet !== true) throw new Error('Vui lòng xác nhận cam kết thông tin chính xác.');
  return d;
}

function uploadMinhChung_(file, maHoSo, cfg) {
  if (!file || !file.data) return '';
  var bytes = Utilities.base64Decode(file.data);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File minh chứng vượt quá ' + (MAX_FILE_BYTES / 1048576) + ' MB.');
  var mime = String(file.mimeType || '');
  if (!/^(application\/pdf|image\/(png|jpeg|jpg|webp))$/.test(mime)) {
    throw new Error('File minh chứng chỉ nhận PDF hoặc ảnh (PNG/JPG).');
  }
  var safeName = String(file.name || 'minh-chung').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 120);
  var folder = getMinhChungFolder_(cfg);
  var f = folder.createFile(Utilities.newBlob(bytes, mime, maHoSo + ' - ' + safeName));
  return f.getUrl();
}

function getMinhChungFolder_(cfg) {
  if (cfg.THU_MUC_MINH_CHUNG_ID) {
    try { return DriveApp.getFolderById(cfg.THU_MUC_MINH_CHUNG_ID); } catch (e) { /* tạo lại bên dưới */ }
  }
  return ensureMinhChungFolder_();
}

function handleSubmit_(p) {
  if (p && p.website) return { success: true, id: '' }; // honeypot: bot điền trường ẩn

  var cfg = readConfig_();
  var state = formState_(cfg);
  if (!state.open) return { success: false, error: state.reason };

  var d = validate_(p || {}, readKhoaPhong_());

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET_CONG_BO);
    var now = new Date();
    var row = sh.getLastRow() + 1;
    var maHoSo = 'CB' + Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyMMdd') + '-' + ('0000' + (row - 1)).slice(-4);

    var dup = d.doi ? findByDoi_(d.doi).map(function (m) { return m.id; }).join(', ') : '';
    var fileUrl = uploadMinhChung_(p.file, maHoSo, cfg);

    var staffText = d.tacGiaBV.map(function (a) { return a.ten + ' – ' + a.khoa + ' (' + a.vaiTro + ')'; }).join('\n');
    var khoaThamGia = d.tacGiaBV.map(function (a) { return a.khoa; })
      .filter(function (k, i, arr) { return arr.indexOf(k) === i; }).join('\n');

    var values = [
      maHoSo, '', d.email, d.hoTen, d.khoaNguoiNop, d.sdt, d.vaiTro, d.doi, d.link, d.tenBai, d.loaiBai,
      d.tinhTrang, d.ngayXB, d.namXB, d.tap, d.so, d.trang, d.dsTacGia, d.tgDauTien, d.tgLienHe,
      String(d.tacGiaBV.length), staffText, khoaThamGia, d.affiliation, d.hopTac, d.phamVi, d.tapChi,
      d.issn, d.chiMuc, d.sjr, d.impact, d.hdgs, d.diemHdgs, fileUrl, d.ghiChu, dup,
      'Chờ duyệt', '', ''
    ];
    // Ghi dạng văn bản ('@') để Sheets không tự đổi SĐT, ISSN, trang "12-15", ngày... sang số/ngày.
    var range = sh.getRange(row, 1, 1, values.length);
    range.setNumberFormat('@').setValues([values]);
    sh.getRange(row, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss').setValue(now);

    // Mỗi tác giả là NV BV một dòng — dùng để tính thưởng theo cá nhân/khoa.
    var tg = ss.getSheetByName(SHEET_TAC_GIA);
    var tgStart = tg.getLastRow() + 1;
    var statusCol = columnLetter_(HEADERS.indexOf('Trạng thái duyệt') + 1);
    var tgRows = d.tacGiaBV.map(function (a, i) {
      return [maHoSo, '', d.doi, d.tenBai, a.ten, a.khoa, a.vaiTro, d.phamVi, d.sjr, d.hdgs,
        '=IFERROR(INDEX(' + SHEET_CONG_BO + '!' + statusCol + ':' + statusCol + ', MATCH(A' + (tgStart + i) +
        ', ' + SHEET_CONG_BO + '!A:A, 0)), "")'];
    });
    var tgRange = tg.getRange(tgStart, 1, tgRows.length, TAC_GIA_HEADERS.length);
    tg.getRange(tgStart, 1, tgRows.length, TAC_GIA_HEADERS.length - 1).setNumberFormat('@');
    tgRange.setValues(tgRows);
    tg.getRange(tgStart, 2, tgRows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss')
      .setValues(tgRows.map(function () { return [now]; }));

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  if ((cfg.GUI_EMAIL_XAC_NHAN || '').toLowerCase() === 'có') {
    try { sendReceipt_(d, maHoSo, cfg); } catch (err) { console.warn('Gửi email xác nhận lỗi: ' + err); }
  }
  return { success: true, id: maHoSo, duplicate: dup };
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function sendReceipt_(d, maHoSo, cfg) {
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var html =
    '<p>Kính gửi ' + esc(d.hoTen) + ',</p>' +
    '<p>' + esc(cfg.DON_VI || 'Đơn vị') + ' đã nhận thông tin công bố khoa học của anh/chị.</p>' +
    '<table cellpadding="4" style="border-collapse:collapse">' +
    '<tr><td><b>Mã hồ sơ</b></td><td>' + esc(maHoSo) + '</td></tr>' +
    '<tr><td><b>Tên bài báo</b></td><td>' + esc(d.tenBai) + '</td></tr>' +
    '<tr><td><b>Tạp chí</b></td><td>' + esc(d.tapChi) + '</td></tr>' +
    '<tr><td><b>DOI</b></td><td>' + esc(d.doi || d.link) + '</td></tr>' +
    '</table>' +
    '<p>Hồ sơ đang ở trạng thái <b>Chờ duyệt</b>. Nếu cần chỉnh sửa, vui lòng liên hệ ' +
    esc(cfg.EMAIL_LIEN_HE || '') + (cfg.SDT_LIEN_HE ? ' – ' + esc(cfg.SDT_LIEN_HE) : '') +
    ' và cung cấp mã hồ sơ.</p>';
  MailApp.sendEmail({
    to: d.email,
    subject: '[' + (cfg.DON_VI || 'Công bố KH') + '] Đã nhận hồ sơ ' + maHoSo,
    htmlBody: html,
    name: cfg.DON_VI || 'Công bố khoa học'
  });
}

/* ======================= Chạy 1 lần khi cài đặt ======================= */

/**
 * CHẠY HÀM NÀY 1 LẦN trong trình soạn thảo Apps Script (bằng tài khoản sẽ deploy):
 *  - cấp quyền Sheets/Drive/Gmail cho script
 *  - kiểm tra tiêu đề các tab, tạo dropdown "Trạng thái duyệt"
 *  - tạo thư mục "Minh chứng công bố" cạnh file Sheet
 */
function setup() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureHeaders_(ss, SHEET_CONG_BO, HEADERS);
  ensureHeaders_(ss, SHEET_TAC_GIA, TAC_GIA_HEADERS);

  var sh = ss.getSheetByName(SHEET_CONG_BO);
  var statusCol = HEADERS.indexOf('Trạng thái duyệt') + 1;
  sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Chờ duyệt', 'Đã duyệt', 'Cần bổ sung', 'Từ chối'], true)
      .setAllowInvalid(false).build());

  var folder = ensureMinhChungFolder_();
  // kiểm tra quyền GHI Drive thật sự (gotcha: chỉ đọc chưa đủ chứng minh)
  folder.createFile(Utilities.newBlob('test', 'text/plain', '_test.txt')).setTrashed(true);
  // kiểm tra quyền gửi mail (không gửi thật)
  Logger.log('Hạn mức email còn lại hôm nay: ' + MailApp.getRemainingDailyQuota());
  Logger.log('=> Cài đặt OK. Thư mục minh chứng: ' + folder.getUrl());
}

function ensureHeaders_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var current = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.join('|') !== headers.join('|')) {
    if (sh.getLastRow() > 1) throw new Error('Tiêu đề tab "' + name + '" không khớp với code. Kiểm tra lại trước khi tiếp tục.');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function ensureMinhChungFolder_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var cfgSheet = ss.getSheetByName(SHEET_CAU_HINH);
  var rows = cfgSheet.getDataRange().getDisplayValues();
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === 'THU_MUC_MINH_CHUNG_ID') rowIdx = i + 1;
  if (rowIdx > 0 && rows[rowIdx - 1][1]) {
    try { return DriveApp.getFolderById(rows[rowIdx - 1][1]); } catch (e) { /* tạo mới */ }
  }
  var parents = DriveApp.getFileById(SPREADSHEET_ID).getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var it = parent.getFoldersByName(MINH_CHUNG_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : parent.createFolder(MINH_CHUNG_FOLDER_NAME);
  if (rowIdx < 0) {
    cfgSheet.appendRow(['THU_MUC_MINH_CHUNG_ID', '', 'Tự điền khi chạy hàm setup() — không cần sửa']);
    rowIdx = cfgSheet.getLastRow();
  }
  cfgSheet.getRange(rowIdx, 2).setNumberFormat('@').setValue(folder.getId());
  return folder;
}

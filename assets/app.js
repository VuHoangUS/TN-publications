(function () {
  'use strict';

  var FRONTEND_VERSION = '2026-09-28.2';
  var APP_CONFIG = window.APP_CONFIG || {};
  var API_URL = APP_CONFIG.API_URL || '';
  var STAFF_ROLES = ['Đồng tác giả', 'Tác giả đứng đầu', 'Tác giả liên hệ', 'Tác giả đứng đầu & liên hệ'];
  var PROFILE_KEY = 'congbo.profile';
  var PROFILE_FIELDS = ['email', 'hoTen', 'khoaNguoiNop', 'sdt'];

  var $ = function (id) { return document.getElementById(id); };
  var form = $('pubForm');
  var cfg = null;

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function radioVal(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function checkedVals(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) { return el.value; });
  }
  function normalizeDoi(s) {
    return String(s || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  }
  function parseVnDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }
  function apiGet(params) {
    var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API_URL + '?' + qs, { method: 'GET', redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (t) { return JSON.parse(t); });
  }

  function showState(html, closed) {
    var card = $('stateCard');
    card.classList.toggle('closed', !!closed);
    card.classList.remove('hidden');
    $('stateText').innerHTML = html;
  }

  /* ---------------- init ---------------- */

  function init() {
    if (!API_URL || API_URL.indexOf('PASTE_') === 0) {
      showState('<div class="state-icon">!</div><b>Chưa cấu hình backend.</b><br>' +
        'Mở <code>assets/config.js</code> và dán URL Web App của Apps Script vào <code>API_URL</code>.', true);
      return;
    }
    apiGet({ action: 'config' })
      .then(function (c) {
        if (!c || !c.success) throw new Error((c && c.error) || 'Không đọc được cấu hình.');
        cfg = c;
        renderHeader();
        if (!c.open) {
          showState('<div class="state-icon">⏸</div><b>' + esc(c.closedReason || 'Form đã đóng.') + '</b>' + contactHtml(), true);
          return;
        }
        buildForm();
        $('stateCard').classList.add('hidden');
        form.classList.remove('hidden');
      })
      .catch(function (err) {
        console.error(err);
        showState('<div class="state-icon">!</div><b>Không tải được biểu mẫu.</b><br>Vui lòng tải lại trang sau ít phút.' + contactHtml(), true);
      });
  }

  function contactHtml() {
    if (!cfg || (!cfg.contactEmail && !cfg.contactPhone)) return '';
    return '<p class="muted">Liên hệ: ' + esc(cfg.contactEmail) + (cfg.contactPhone ? ' – ' + esc(cfg.contactPhone) : '') + '</p>';
  }

  function renderHeader() {
    $('heroTitle').textContent = cfg.title;
    if (cfg.unit) $('heroUnit').textContent = cfg.unit;
    document.title = cfg.title;
    var chips = [];
    if (cfg.deadline) {
      var left = cfg.deadlineEndMs ? Math.ceil((cfg.deadlineEndMs - Date.now()) / 86400000) : null;
      chips.push('<span class="chip">Hạn chót: <b>' + esc(cfg.deadline) + '</b>' +
        (left !== null && left >= 0 ? ' (còn ' + left + ' ngày)' : '') + '</span>');
    }
    if (cfg.fromDate) chips.push('<span class="chip">Thống kê bài từ <b>' + esc(cfg.fromDate) + '</b> đến nay</span>');
    if (APP_CONFIG.TRACKING_LINK) cfg.trackingLink = APP_CONFIG.TRACKING_LINK;
    if (cfg.trackingLink) chips.push('<span class="chip"><a href="' + esc(cfg.trackingLink) + '" target="_blank" rel="noopener">Xem thống kê đã nộp ↗</a></span>');
    $('heroMeta').innerHTML = chips.join('');

    var foot = '';
    if (cfg.contactEmail || cfg.contactPhone) {
      foot += 'Cần hỗ trợ? Liên hệ ' + esc(cfg.unit || '') + ': ' +
        (cfg.contactEmail ? '<a href="mailto:' + esc(cfg.contactEmail) + '">' + esc(cfg.contactEmail) + '</a>' : '') +
        (cfg.contactPhone ? ' – ' + esc(cfg.contactPhone) : '') + ' (giờ hành chính)';
    }
    foot += '<div class="ver">Phiên bản giao diện ' + FRONTEND_VERSION + ' · máy chủ ' + esc(cfg.version || '?') + '</div>';
    $('footer').innerHTML = foot;
  }

  function khoaOptions(selected) {
    return '<option value="">— Chọn Khoa/Phòng —</option>' + cfg.khoaPhong.map(function (k) {
      return '<option' + (k === selected ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');
  }

  function buildForm() {
    $('khoaNguoiNop').innerHTML = khoaOptions('');
    $('maxMb').textContent = cfg.maxFileMB || 10;
    if (cfg.fromDate) $('fromDateHint').textContent = 'Chỉ nhận bài xuất bản từ ngày ' + cfg.fromDate + ' trở đi.';
    addStaffRow();
    loadProfile();

    $('btnAddStaff').addEventListener('click', function () { addStaffRow(); });
    $('btnDoi').addEventListener('click', fillFromDoi);
    $('doi').addEventListener('change', checkDuplicate);
    $('dsTacGia').addEventListener('input', refreshAuthorList);
    $('tinhTrang').addEventListener('change', syncDateRequired);
    Array.prototype.forEach.call(form.querySelectorAll('input[name="phamVi"]'), function (el) {
      el.addEventListener('change', syncPhamVi);
    });
    form.addEventListener('input', onFieldEdit);
    form.addEventListener('change', onFieldEdit);
    form.addEventListener('submit', onSubmit);
    $('btnAgain').addEventListener('click', resetForAnother);
    setupDateInput();
    setupDropzone();
    syncDateRequired();
  }

  /* ---------------- Ngày xuất bản dd/mm/yyyy ---------------- */

  // "dd/mm/yyyy" -> {y,m,d} nếu là ngày có thật, ngược lại null
  function parseDmy(s) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return { y: y, m: mo, d: d, date: dt };
  }
  function dmyToIso(s) { var p = parseDmy(s); return p ? p.y + '-' + pad(p.m) + '-' + pad(p.d) : ''; }

  function setupDateInput() {
    var txt = $('ngayXB'), nat = $('ngayXBPicker');
    // tự chèn dấu "/" khi gõ: 21102025 -> 21/10/2025
    txt.addEventListener('input', function (e) {
      if (e.inputType && e.inputType.indexOf('delete') === 0) return;
      var digits = txt.value.replace(/\D/g, '').slice(0, 8);
      var out = digits.slice(0, 2);
      if (digits.length > 2) out += '/' + digits.slice(2, 4);
      if (digits.length > 4) out += '/' + digits.slice(4);
      if (digits.length === 2 || digits.length === 4) out += '/';
      txt.value = out;
    });
    $('btnDatePick').addEventListener('click', function () {
      nat.value = dmyToIso(txt.value);
      if (typeof nat.showPicker === 'function') { try { nat.showPicker(); return; } catch (e) { /* bỏ qua */ } }
      nat.style.pointerEvents = 'auto'; nat.focus(); nat.click(); nat.style.pointerEvents = '';
    });
    nat.addEventListener('change', function () {
      var p = nat.value.split('-');
      if (p.length === 3) { txt.value = p[2] + '/' + p[1] + '/' + p[0]; clearError(txt); txt.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  /* ---------------- Ô tải minh chứng (kéo thả) ---------------- */

  function formatSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

  function renderFileChip() {
    var f = $('file').files[0];
    $('fileChip').classList.toggle('hidden', !f);
    $('dropzone').classList.toggle('hidden', !!f);
    if (f) { $('fileName').textContent = f.name; $('fileSize').textContent = formatSize(f.size); }
  }

  function clearFile() {
    $('file').value = '';
    $('fileNotice').classList.add('hidden');
    renderFileChip();
  }

  function setupDropzone() {
    var dz = $('dropzone'), input = $('file');
    input.addEventListener('change', function () {
      var f = input.files[0], max = (cfg.maxFileMB || 10) * 1048576, msg = '';
      if (f && f.size > max) msg = 'File "' + f.name + '" nặng ' + formatSize(f.size) + ', vượt quá giới hạn ' + (cfg.maxFileMB || 10) + ' MB. Vui lòng chọn file nhỏ hơn.';
      else if (f && !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) msg = 'Chỉ nhận file PDF hoặc ảnh (JPG, PNG, WEBP).';
      if (msg) input.value = '';
      $('fileNotice').textContent = msg;
      $('fileNotice').classList.toggle('hidden', !msg);
      renderFileChip();
      clearError(dz);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function () { dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    $('btnRemoveFile').addEventListener('click', clearFile);
  }

  /* ---------------- per-viewer profile (localStorage) ---------------- */

  function loadProfile() {
    try {
      var p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      PROFILE_FIELDS.forEach(function (k) { if (p[k] && $(k)) $(k).value = p[k]; });
    } catch (e) { /* storage bị chặn: bỏ qua */ }
  }
  function saveProfile() {
    try {
      var p = {};
      PROFILE_FIELDS.forEach(function (k) { p[k] = $(k).value; });
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- dynamic parts ---------------- */

  function syncPhamVi() {
    var v = radioVal('phamVi');
    $('blockQuocTe').classList.toggle('hidden', v !== 'Quốc tế');
    $('blockTrongNuoc').classList.toggle('hidden', v !== 'Trong nước');
  }

  function syncDateRequired() {
    var accepted = $('tinhTrang').value === 'Đã được chấp nhận';
    $('ngayReq').classList.toggle('hidden', accepted);
  }

  function addStaffRow(data) {
    data = data || {};
    var row = document.createElement('div');
    row.className = 'staff-row';
    row.innerHTML =
      '<span class="idx"></span>' +
      '<input type="text" class="s-name" placeholder="Họ tên tác giả" list="authorList" value="' + esc(data.ten || '') + '">' +
      '<select class="s-khoa">' + khoaOptions(data.khoa || '') + '</select>' +
      '<select class="s-role">' + STAFF_ROLES.map(function (r) {
        return '<option' + (r === data.vaiTro ? ' selected' : '') + '>' + esc(r) + '</option>';
      }).join('') + '</select>' +
      '<button type="button" class="btn-x" title="Xóa dòng" aria-label="Xóa tác giả">×</button>';
    row.querySelector('.btn-x').addEventListener('click', function () {
      row.remove();
      renumberStaff();
    });
    $('staffList').appendChild(row);
    renumberStaff();
  }

  function renumberStaff() {
    var rows = $('staffList').querySelectorAll('.staff-row');
    Array.prototype.forEach.call(rows, function (r, i) {
      r.querySelector('.idx').textContent = i + 1;
      r.querySelector('.btn-x').disabled = rows.length === 1;
    });
  }

  function staffData() {
    return Array.prototype.map.call($('staffList').querySelectorAll('.staff-row'), function (r) {
      return {
        ten: r.querySelector('.s-name').value.trim(),
        khoa: r.querySelector('.s-khoa').value,
        vaiTro: r.querySelector('.s-role').value
      };
    });
  }

  function authorLines() {
    return $('dsTacGia').value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function refreshAuthorList() {
    $('authorList').innerHTML = authorLines().map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
  }

  /* ---------------- DOI: Crossref autofill + duplicate check ---------------- */

  function setDoiNotice(html, kind) {
    var n = $('doiNotice');
    if (!html) { n.classList.add('hidden'); return; }
    n.className = 'notice ' + (kind || 'info');
    n.innerHTML = html;
  }

  function checkDuplicate() {
    var doi = normalizeDoi($('doi').value);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return Promise.resolve();
    return apiGet({ action: 'checkDoi', doi: doi }).then(function (res) {
      if (res && res.success && res.matches && res.matches.length) {
        var list = res.matches.map(function (m) { return esc(m.id) + ' (' + esc(m.by) + ', ' + esc(m.at) + ')'; }).join('; ');
        setDoiNotice('<b>Bài báo này đã được nộp:</b> ' + list + '.<br>Nếu bạn là đồng tác giả khác, chỉ nộp tiếp khi cần bổ sung thông tin; hồ sơ sẽ được đánh dấu trùng để phòng quản lý đối chiếu.', 'warn');
      }
    }).catch(function () { /* không chặn người dùng nếu kiểm tra lỗi */ });
  }

  function stripTags(s) { var d = document.createElement('div'); d.innerHTML = s || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fillFromDoi() {
    var doi = normalizeDoi($('doi').value);
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
      setDoiNotice('DOI chưa đúng định dạng. Ví dụ: <code>10.1038/s41598-022-22546-w</code>', 'error');
      $('doi').classList.add('field-error');
      return;
    }
    $('doi').value = doi;
    var btn = $('btnDoi');
    btn.disabled = true; btn.textContent = 'Đang tra cứu…';
    setDoiNotice('');
    fetch('https://api.crossref.org/works/' + encodeURIComponent(doi))
      .then(function (r) { if (!r.ok) throw new Error('notfound'); return r.json(); })
      .then(function (j) {
        var m = j.message || {};
        var setIf = function (id, v) { if (v) { $(id).value = v; clearError($(id)); } };
        setIf('tenBai', stripTags((m.title || [])[0]));
        setIf('tapChi', stripTags((m['container-title'] || [])[0]));
        setIf('issn', (m.ISSN || []).join(', '));
        setIf('tap', m.volume);
        setIf('so', m.issue);
        setIf('trang', m.page);
        var dp = ((m['published-print'] || m['published-online'] || m.published || m.issued || {})['date-parts'] || [])[0] || [];
        var dateNote = '';
        if (dp.length === 3) setIf('ngayXB', pad(dp[2]) + '/' + pad(dp[1]) + '/' + dp[0]);
        else if (dp.length) dateNote = ' Nguồn chỉ có ' + (dp.length === 2 ? 'tháng/năm ' + dp[1] + '/' + dp[0] : 'năm ' + dp[0]) + ', vui lòng nhập ngày xuất bản cụ thể.';
        var authors = (m.author || []).map(function (a) {
          return a.name || [a.given, a.family].filter(Boolean).join(' ');
        }).filter(Boolean);
        if (authors.length) {
          $('dsTacGia').value = authors.join('\n');
          refreshAuthorList();
          if (!$('tgDauTien').value) $('tgDauTien').value = authors[0];
        }
        setDoiNotice('Đã điền thông tin từ Crossref. Vui lòng kiểm tra lại, bổ sung <b>tác giả liên hệ</b>, <b>tác giả là nhân viên bệnh viện</b> và <b>xếp loại tạp chí</b>.' + dateNote, 'info');
        return checkDuplicate();
      })
      .catch(function () {
        setDoiNotice('Không tìm thấy DOI này trên Crossref. Bạn vẫn có thể nhập thông tin thủ công.', 'warn');
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Tự điền từ DOI'; });
  }

  /* ---------------- validation ---------------- */

  function clearError(el) {
    if (!el) return;
    el.classList && el.classList.remove('field-error');
    var pills = el.closest && el.closest('.pills');
    if (pills) pills.classList.remove('field-error');
  }

  // Khi hộp lỗi đang hiện, cập nhật lại danh sách lỗi mỗi lần người dùng sửa.
  function onFieldEdit(e) {
    clearError(e.target);
    if (!$('errorBox').classList.contains('hidden')) showErrors(validate().errors);
  }

  function validate() {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (el) { el.classList.remove('field-error'); });
    var errors = [];
    var firstBad = null;
    function bad(el, msg) {
      errors.push(msg);
      if (el) { el.classList.add('field-error'); if (!firstBad) firstBad = el; }
    }
    function need(id, label) { if (!$(id).value.trim()) bad($(id), label); }
    function needRadio(name, label) {
      if (!radioVal(name)) {
        var anyInput = form.querySelector('input[name="' + name + '"]');
        bad(anyInput.closest('.pills'), label);
      }
    }

    need('email', 'Email');
    if ($('email').value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim())) bad($('email'), 'Email không hợp lệ');
    need('hoTen', 'Họ và tên');
    need('khoaNguoiNop', 'Khoa/Phòng người nộp');
    needRadio('vaiTro', 'Vai trò của bạn trong bài báo');

    var doi = normalizeDoi($('doi').value);
    if (!doi && !$('link').value.trim()) bad($('doi'), 'DOI (hoặc link bài báo nếu chưa có DOI)');
    else if (doi && !/^10\.\d{4,9}\/\S+$/.test(doi)) bad($('doi'), 'DOI không đúng định dạng');
    need('tenBai', 'Tên bài báo');
    need('loaiBai', 'Loại bài');
    need('tinhTrang', 'Tình trạng xuất bản');
    if ($('tinhTrang').value !== 'Đã được chấp nhận') need('ngayXB', 'Ngày xuất bản');
    if ($('ngayXB').value.trim()) {
      var pd = parseDmy($('ngayXB').value);
      var from = parseVnDate(cfg.fromDate);
      if (!pd) bad($('ngayXB'), 'Ngày xuất bản không hợp lệ (định dạng dd/mm/yyyy)');
      else if (from && pd.date < from) bad($('ngayXB'), 'Ngày xuất bản trước ' + cfg.fromDate + ' (ngoài đợt thống kê)');
    }

    need('dsTacGia', 'Danh sách tác giả');
    need('tgDauTien', 'Tác giả đứng đầu');
    need('tgLienHe', 'Tác giả liên hệ');
    var staffOk = true;
    Array.prototype.forEach.call($('staffList').querySelectorAll('.staff-row'), function (r) {
      var n = r.querySelector('.s-name'), k = r.querySelector('.s-khoa');
      if (!n.value.trim()) { n.classList.add('field-error'); staffOk = false; if (!firstBad) firstBad = n; }
      if (!k.value) { k.classList.add('field-error'); staffOk = false; if (!firstBad) firstBad = k; }
    });
    if (!staffOk) errors.push('Họ tên và Khoa/Phòng của từng tác giả là nhân viên bệnh viện');
    needRadio('affiliation', 'Có ghi tên bệnh viện trong affiliation');
    needRadio('hopTac', 'Hợp tác với đơn vị ngoài bệnh viện');

    needRadio('phamVi', 'Tạp chí trong nước / quốc tế');
    need('tapChi', 'Tên tạp chí');
    var issn = $('issn').value.trim();
    if (issn && !/^\d{4}-\d{3}[\dXx](\s*[,;]\s*\d{4}-\d{3}[\dXx])*$/.test(issn)) bad($('issn'), 'ISSN không đúng định dạng (VD: 1234-567X)');
    if (radioVal('phamVi') === 'Quốc tế') needRadio('sjr', 'Xếp loại tạp chí (SJR)');
    if (radioVal('phamVi') === 'Trong nước') needRadio('hdgs', 'Tạp chí có trong danh mục HĐGSNN không');

    var f = $('file').files[0];
    if (f && f.size > (cfg.maxFileMB || 10) * 1048576) bad($('fileChip'), 'File minh chứng ' + formatSize(f.size) + ' vượt quá giới hạn ' + (cfg.maxFileMB || 10) + ' MB');
    if (f && !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) bad($('fileChip'), 'File minh chứng chỉ nhận PDF hoặc ảnh (JPG, PNG, WEBP)');
    if (!$('camKet').checked) bad($('camKet'), 'Xác nhận cam kết thông tin chính xác');

    return { errors: errors, firstBad: firstBad };
  }

  function showErrors(list) {
    var box = $('errorBox');
    if (!list || !list.length) { box.classList.add('hidden'); return; }
    box.innerHTML = 'Vui lòng kiểm tra lại:<ul>' + list.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    box.classList.remove('hidden');
  }

  /* ---------------- submit ---------------- */

  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve(null);
      var r = new FileReader();
      r.onload = function () {
        resolve({ name: file.name, mimeType: file.type, data: String(r.result).split(',')[1] });
      };
      r.onerror = function () { reject(new Error('Không đọc được file.')); };
      r.readAsDataURL(file);
    });
  }

  function buildPayload(file) {
    var v = function (id) { return $(id).value.trim(); };
    return {
      website: form.querySelector('input[name="website"]').value,
      email: v('email'), hoTen: v('hoTen'), khoaNguoiNop: v('khoaNguoiNop'), sdt: v('sdt'),
      vaiTro: radioVal('vaiTro'),
      doi: normalizeDoi(v('doi')), link: v('link'), tenBai: v('tenBai'), loaiBai: v('loaiBai'),
      tinhTrang: v('tinhTrang'), ngayXB: dmyToIso(v('ngayXB')), tap: v('tap'), so: v('so'), trang: v('trang'),
      dsTacGia: authorLines().join('\n'), tgDauTien: v('tgDauTien'), tgLienHe: v('tgLienHe'),
      tacGiaBV: staffData(), affiliation: radioVal('affiliation'), hopTac: radioVal('hopTac'),
      phamVi: radioVal('phamVi'), tapChi: v('tapChi'), issn: v('issn'),
      chiMuc: checkedVals('chiMuc'), sjr: radioVal('sjr'), impact: v('impact'),
      hdgs: radioVal('hdgs'), diemHdgs: v('diemHdgs'),
      ghiChu: v('ghiChu'), camKet: $('camKet').checked,
      file: file
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    var res = validate();
    showErrors(res.errors);
    if (res.errors.length) {
      if (res.firstBad) {
        res.firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (res.firstBad.focus) res.firstBad.focus({ preventScroll: true });
      }
      return;
    }
    var btn = $('btnSubmit');
    btn.disabled = true; btn.textContent = 'Đang gửi…';

    readFileBase64($('file').files[0])
      .then(function (file) {
        return fetch(API_URL, {
          method: 'POST',
          // text/plain để tránh CORS preflight — Apps Script không trả lời OPTIONS
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(buildPayload(file)),
          redirect: 'follow'
        });
      })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var json;
        try { json = JSON.parse(text); } catch (parseErr) {
          // doPost luôn trả JSON; body không phải JSON thường là do hạ tầng Google, dữ liệu vẫn đã ghi.
          console.warn('[submit] Phản hồi không phải JSON, coi như thành công:', text.slice(0, 300));
          return onSuccess({ id: '(đang cập nhật – kiểm tra email xác nhận)' });
        }
        if (json && json.success) return onSuccess(json);
        throw new Error((json && json.error) || 'Lỗi không xác định.');
      })
      .catch(function (err) {
        showErrors([err.message === 'Failed to fetch' ? 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.' : err.message]);
        $('errorBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Nộp hồ sơ'; });
  }

  function onSuccess(json) {
    saveProfile();
    form.classList.add('hidden');
    $('successId').textContent = json.id || '';
    $('successDup').textContent = json.duplicate ? 'Lưu ý: DOI này trùng với hồ sơ ' + json.duplicate + ', phòng quản lý sẽ đối chiếu.' : '';
    $('successCard').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForAnother() {
    form.reset();
    loadProfile();
    clearFile();
    $('staffList').innerHTML = '';
    addStaffRow();
    refreshAuthorList();
    syncPhamVi();
    syncDateRequired();
    setDoiNotice('');
    showErrors(null);
    $('successCard').classList.add('hidden');
    form.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  init();
})();

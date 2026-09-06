/* ============================================================
   admin-edit.js —— 可视化编辑后台
   ------------------------------------------------------------
   怎么用（给站长的三句话说明）：
   1. 点右下角「✏️ 编辑」进入编辑模式
   2. 点页面上的任何文字 → 直接改，改完点别处自动保存
   3. 点任何图片 / 灰色占位框 → 选一张图替换它

   修改存在浏览器 localStorage（键名 eden_site_overrides），
   刷新后依然在。换电脑或清了缓存会丢，所以改完记得点
   「导出备份」存一份 JSON，需要时「导入」即可恢复。

   零依赖、不改 HTML 结构，靠"元素选择器"定位，纯前端实现。
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'eden_site_overrides';
  var MAX_SIDE = 1400;                 // 图片压缩后的最长边上限
  var KEEP_ORIGIN_BELOW = 200 * 1024;  // 小于 200KB 的图片不压缩，原样存

  var overrides = load();
  var panel = null;
  var editOn = false;
  var editingEl = null;
  var originalHTML = '';
  var lastHover = null;
  var toastEl = null;
  var toastTimer = null;
  var hintEl = null;

  /* ============ 存储 ============ */
  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
      return true;
    } catch (e) {
      alert('保存失败：浏览器存储空间已满。\n\n建议：先点「导出备份」把已改内容存成文件，\n再点「重置全部」清空空间，然后重新导入。');
      return false;
    }
  }

  /* ============ 生成稳定且唯一的选择器 ============ */
  function cssPath(el) {
    var parts = [], cur = el, guard = 0;
    while (cur && cur.nodeType === 1 && guard++ < 12) {
      if (cur.id) { parts.unshift('#' + cur.id); break; }
      var seg = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      if (parent) {
        var same = [], i;
        for (i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === cur.tagName) same.push(parent.children[i]);
        }
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(seg);
      cur = parent;
      if (!cur || cur === document.body) break;
    }
    return parts.join(' > ');
  }

  function fullPath(el) {
    var parts = [], cur = el, guard = 0;
    while (cur && cur.nodeType === 1 && cur.tagName !== 'HTML' && guard++ < 30) {
      var p = cur.parentElement, idx = 1;
      if (p) {
        for (var i = 0; i < p.children.length; i++) {
          if (p.children[i] === cur) { idx = i + 1; break; }
        }
      }
      parts.unshift(cur.tagName.toLowerCase() + ':nth-child(' + idx + ')');
      cur = p;
    }
    return parts.join(' > ');
  }

  function uniqueSelector(el) {
    var sel = cssPath(el);
    try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (e) {}
    return fullPath(el);
  }

  // 已经打过标记的元素用标记，保证改结构后 key 依然稳定
  function keyOf(el) {
    return el.getAttribute('data-ovr-sel') || uniqueSelector(el);
  }

  /* ============ 应用已保存的修改 ============ */
  function applyOne(sel, o) {
    var els;
    try { els = document.querySelectorAll(sel); } catch (e) { return; }
    if (!els || !els.length) return;

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      try {
        if (o.t === 'img') {
          if (el.tagName === 'IMG') {
            el.src = o.v;
            el.setAttribute('data-ovr-sel', sel);
          } else {
            // 灰色占位框 -> 换成真实图片（保留原有 class 与 data-note 小故事）
            var img = document.createElement('img');
            img.src = o.v;
            img.alt = el.getAttribute('data-alt') || el.getAttribute('alt') || '';
            img.className = el.className || '';
            var note = el.getAttribute('data-note');
            if (note) img.setAttribute('data-note', note);
            img.setAttribute('data-ovr-sel', sel);
            el.parentNode.replaceChild(img, el);
          }
        } else if (o.t === 'html') {
          el.innerHTML = o.v;
          el.setAttribute('data-ovr-sel', sel);
        } else {
          el.textContent = o.v;
          el.setAttribute('data-ovr-sel', sel);
        }
      } catch (e) { /* 单个元素失败不影响其他 */ }
    }
  }

  function applyAll() {
    Object.keys(overrides).forEach(function (sel) {
      applyOne(sel, overrides[sel]);
    });
  }

  /* ============ 小提示 / Toast ============ */
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'admin-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 1800);
  }

  function showHint(text) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.className = 'admin-hint';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = text;
    hintEl.classList.add('is-show');
  }
  function hideHint() { if (hintEl) hintEl.classList.remove('is-show'); }

  /* ============ 判断"可编辑目标" ============ */
  function editTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    if (panel && panel.contains(el)) return null;
    var tag = el.tagName;

    // 图片 / 占位框 -> 换图
    if (tag === 'IMG') return el;
    if (el.classList && el.classList.contains('ph')) return el;

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BR') return null;

    // 文字：从被点元素往上找最多 4 层，取第一个"自己直接带文字"的元素
    var cur = el, depth = 0;
    while (cur && cur.nodeType === 1 && depth < 4) {
      var direct = '';
      for (var i = 0; i < cur.childNodes.length; i++) {
        if (cur.childNodes[i].nodeType === 3) direct += cur.childNodes[i].nodeValue;
      }
      if (direct.trim()) return cur;
      cur = cur.parentElement;
      depth++;
    }
    return null;
  }

  /* ============ 文字编辑 ============ */
  function startTextEdit(el) {
    if (el.getAttribute('contenteditable') === 'true') return;
    editingEl = el;
    originalHTML = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    try { el.focus(); } catch (e) {}
    showHint('正在编辑：改完点页面别处即保存 · 按 Esc 取消本次修改');

    el.addEventListener('blur', function onBlur() {
      el.removeEventListener('blur', onBlur);
      finishTextEdit(true);
    });
  }

  function finishTextEdit(doSave) {
    if (!editingEl) return;
    var el = editingEl;
    editingEl = null;
    el.removeAttribute('contenteditable');
    hideHint();

    if (!doSave) { el.innerHTML = originalHTML; return; }

    var hasChild = el.children.length > 0;
    var val = hasChild ? el.innerHTML : (el.textContent || '');
    var key = keyOf(el);
    overrides[key] = { t: hasChild ? 'html' : 'text', v: val };
    el.setAttribute('data-ovr-sel', key);
    if (persist()) toast('已保存');
  }

  /* ============ 图片替换 ============ */
  function processImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      if (file.size <= KEEP_ORIGIN_BELOW) { cb(dataUrl); return; }

      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          cb(cv.toDataURL('image/jpeg', 0.82));
        } catch (e) { cb(dataUrl); }
      };
      img.onerror = function () { cb(dataUrl); };
      img.src = dataUrl;
    };
    reader.onerror = function () { toast('图片读取失败，换一张试试'); };
    reader.readAsDataURL(file);
  }

  function pickImage(el) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      processImage(file, function (dataUrl) {
        var key = keyOf(el);
        overrides[key] = { t: 'img', v: dataUrl };
        if (!persist()) return;
        applyOne(key, overrides[key]);
        toast('图片已替换');
      });
    });

    input.click();
  }

  /* ============ 导入 / 导出 / 重置 ============ */
  function exportJSON() {
    if (!Object.keys(overrides).length) { toast('还没有任何修改，无需导出'); return; }
    var blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'eden-site-content.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast('已导出 eden-site-content.json');
  }

  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result);
          if (!data || typeof data !== 'object') throw new Error('bad json');
          Object.keys(data).forEach(function (k) { overrides[k] = data[k]; });
          if (persist()) { applyAll(); toast('导入成功，共 ' + Object.keys(data).length + ' 项'); }
        } catch (e) {
          toast('导入失败：文件不是有效的备份 JSON');
        }
      };
      r.readAsText(file);
    });
    input.click();
  }

  function resetAll() {
    if (!Object.keys(overrides).length) { toast('当前没有任何修改'); return; }
    if (!window.confirm('确定要清空所有自定义修改吗？\n\n建议先点「导出备份」。清空后页面会刷新。')) return;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    location.reload();
  }

  /* ============ 右下角后台面板 ============ */
  function mkBtn(label, title, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'admin-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handler(b);
    });
    return b;
  }

  function setEditMode(on) {
    editOn = on;
    document.body.classList.toggle('admin-editing', on);
    if (on) {
      showHint('编辑模式：点文字改文字，点图片/灰色占位框换图。再点「✏️ 编辑」退出');
    } else {
      finishTextEdit(true);
      hideHint();
      clearHover();
    }
    if (panel) {
      var first = panel.querySelector('.admin-btn');
      if (first) { first.classList.toggle('admin-btn--on', on); first.textContent = on ? '✓ 编辑中' : '✏️ 编辑'; }
    }
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'admin-panel';

    panel.appendChild(mkBtn('✏️ 编辑', '进入/退出可视化编辑模式', function () {
      setEditMode(!editOn);
    }));
    panel.appendChild(mkBtn('导出备份', '把已改内容存成 JSON 文件', exportJSON));
    panel.appendChild(mkBtn('导入', '从备份 JSON 恢复修改', importJSON));
    panel.appendChild(mkBtn('重置全部', '清空所有自定义修改', resetAll));

    document.body.appendChild(panel);
  }

  /* ============ 悬停高亮 ============ */
  function clearHover() {
    if (lastHover) { lastHover.classList.remove('admin-hover'); lastHover = null; }
  }
  function bindHover() {
    document.addEventListener('mouseover', function (e) {
      if (!editOn) return;
      var t = editTarget(e.target);
      if (t === lastHover) return;
      clearHover();
      if (t) { t.classList.add('admin-hover'); lastHover = t; }
    }, true);

    document.addEventListener('mouseout', function (e) {
      if (!editOn) return;
      var t = editTarget(e.target);
      if (t && t === lastHover && e.relatedTarget && t.contains(e.relatedTarget)) return;
      clearHover();
    }, true);
  }

  /* ============ 事件绑定 ============ */
  function bindEvents() {
    // 捕获阶段 + stopPropagation，避免被页面原有交互（弹窗、占位块等）抢走点击
    document.addEventListener('click', function (e) {
      if (!editOn) return;
      var t = editTarget(e.target);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.tagName === 'IMG' || (t.classList && t.classList.contains('ph'))) pickImage(t);
      else startTextEdit(t);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (editingEl && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishTextEdit(false);
        toast('已取消');
      }
    }, true);

    bindHover();
  }

  /* ============ 启动 ============ */
  function init() {
    buildPanel();
    bindEvents();

    // 立刻铺一次：脚本在 body 末尾，此时 DOM 已基本就绪
    applyAll();

    // 兜底：若执行时文档仍在解析（readyState==='loading'），
    // 等 DOMContentLoaded 再铺一次，保证后插入的内容也能被覆盖
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyAll);
    }
  }

  init();
})();

/* ============================================================
   admin-edit.js —— 可视化编辑后台
   ------------------------------------------------------------
   怎么用（给站长的三句话说明）：
   1. 点右下角「✏️ 编辑」进入编辑模式
   2. 点页面上的任何文字 → 弹出「💾 保存 / 取消」按钮条，改完点保存
   3. 点任何图片 / 灰色占位框 → 选一张图替换它
   4. 点故事照片 → 弹框改「照片背后的小故事」配文（也能换图）
   5. 点博客卡片 → 弹框改整篇文章正文

   保存机制（三重保险，任一触发即写入）：
   ① 点「💾 保存」按钮（最可靠，推荐）
   ② 停止输入 0.9 秒后自动保存
   ③ 点到别处失焦时兜底保存

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
  var saveBar = null;      // 编辑时贴在元素下方的「保存 / 取消」条
  var autoTimer = null;    // 自动保存防抖计时器
  var btnSavePanel = null; // 面板上的保存按钮（显示已保存条数）
  var adminModal = null;   // 属性编辑弹框（故事配文 / 博客正文）
  var modalSaveFn = null;  // 弹框内的保存回调（Ctrl/Cmd+S 用）

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
    if (el.getAttribute('data-ovr-sel')) return el.getAttribute('data-ovr-sel');
    if (el.getAttribute('data-key')) return '[data-key="' + el.getAttribute('data-key') + '"]';
    return uniqueSelector(el);
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
            // 灰色占位框 -> 换成真实图片（保留原有 class、data-note、data-key）
            var img = document.createElement('img');
            img.src = o.v;
            img.alt = el.getAttribute('data-alt') || el.getAttribute('alt') || '';
            img.className = el.className || '';
            var note = el.getAttribute('data-note');
            if (note) img.setAttribute('data-note', note);
            if (el.getAttribute('data-key')) img.setAttribute('data-key', el.getAttribute('data-key'));
            img.setAttribute('data-ovr-sel', sel);
            el.parentNode.replaceChild(img, el);
          }
        } else if (o.t === 'html') {
          el.innerHTML = o.v;
          el.setAttribute('data-ovr-sel', sel);
        } else if (o.t === 'attr') {
          el.setAttribute(o.k, o.v);
          el.setAttribute('data-ovr-sel', sel);
        } else {
          // 防御：只跳过"内含已注册编辑位的容器"。
          // 旧版没有 data-key，位置选择器在 DOM 变动后可能失配（例如导入照片后
          // .ph 变成 <img>，层级移位，命中 .project-card__hover）。此时 textContent
          // 会把里面的悬浮说明气泡 .bubble 整个冲掉，之后永远提示「没有说明位」。
          // 注意：不能简单地"有子元素就跳过"——普通文字里常有 <span>♡</span> 这类
          // 内联装饰，那种情况必须照常覆盖，否则用户改的文字保存不进去。
          if (el.querySelector('[data-key], .bubble')) {
            if (window.console && console.warn) {
              console.warn('[admin-edit] 跳过可疑的文字覆盖（目标内含编辑位，疑似选择器失配）：', sel);
            }
            continue;
          }
          el.textContent = o.v;
          el.setAttribute('data-ovr-sel', sel);
        }
      } catch (e) { /* 单个元素失败不影响其他 */ }
    }
  }

  /* 清理历史遗留的废弃记录：早期补建气泡用 "-bubble" 派生 key（如 ph-1-bubble），
     刷新回到原始 HTML 后这些元素并不存在，内容永远套不回来，属于死数据。 */
  function purgeDeadKeys() {
    var dead = [];
    Object.keys(overrides).forEach(function (k) {
      var o = overrides[k];
      if (o && o.t === 'text' && /-bubble/.test(k)) dead.push(k);
    });
    if (!dead.length) return;
    dead.forEach(function (k) { delete overrides[k]; });
    try { localStorage.setItem(LS_KEY, JSON.stringify(overrides)); } catch (e) {}
    if (window.console && console.warn) {
      console.warn('[admin-edit] 已清理 ' + dead.length + ' 条失效的旧气泡记录（刷新后无对应元素）：', dead);
    }
  }

  function applyAll() {
    Object.keys(overrides).forEach(function (sel) {
      applyOne(sel, overrides[sel]);
    });
    purgeDeadKeys();
    updateCount();
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
    if (el.closest && el.closest('.admin-modal')) return null;
    if (panel && panel.contains(el)) return null;
    if (saveBar && saveBar.contains(el)) return null;
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

  /* 项目作品卡媒体区：点占位框、已传图片、说明条、角标任意处 -> 整块视为编辑目标，
     统一弹框处理（换图 + 改悬浮说明），不再内联编辑，杜绝图片/悬浮层互相遮挡 */
  function projectMediaEl(target) {
    if (!target || !target.closest) return null;
    if (target.closest('.admin-modal')) return null;
    var media = target.closest('.project-card__media');
    return media || null;
  }

  /* ============ 保存条（💾 保存 / 取消）============ */
  function ensureSaveBar() {
    if (saveBar) return saveBar;
    saveBar = document.createElement('div');
    saveBar.className = 'admin-savebar';

    var btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'admin-savebar__btn admin-savebar__btn--save';
    btnSave.textContent = '💾 保存';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'admin-savebar__btn';
    btnCancel.textContent = '取消';

    // 关键：mousedown 阻止默认行为，避免点按钮时编辑元素提前失焦
    btnSave.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btnCancel.addEventListener('mousedown', function (e) { e.preventDefault(); });

    btnSave.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (finishTextEdit(true)) toast('已保存 ✓');
    });
    btnCancel.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      finishTextEdit(false);
      toast('已取消修改');
    });

    saveBar.appendChild(btnSave);
    saveBar.appendChild(btnCancel);
    document.body.appendChild(saveBar);
    return saveBar;
  }

  function showSaveBar(el) {
    var bar = ensureSaveBar();
    try {
      var r = el.getBoundingClientRect();
      var left = Math.max(8, Math.min(window.innerWidth - 200, r.left));
      var top = r.bottom + 8;
      // 太靠近屏幕底部就翻到元素上方
      if (top > window.innerHeight - 60) top = Math.max(8, r.top - 48);
      // 兜底：无论元素在哪，按钮条绝不允许跑出屏幕
      if (top > window.innerHeight - 50) top = Math.max(8, window.innerHeight - 50);
      if (top < 8) top = 8;
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    } catch (e) {}
    bar.classList.add('is-show');
  }

  function hideSaveBar() { if (saveBar) saveBar.classList.remove('is-show'); }

  /* ============ 写入并持久化（不结束编辑，供自动保存复用）============ */
  function commitText(el) {
    var hasChild = el.children.length > 0;
    var val = hasChild ? el.innerHTML : (el.textContent || '');
    var key = keyOf(el);
    overrides[key] = { t: hasChild ? 'html' : 'text', v: val };
    el.setAttribute('data-ovr-sel', key);
    var ok = persist();
    if (ok) updateCount();
    return ok;
  }

  function updateCount() {
    if (!btnSavePanel) return;
    var n = Object.keys(overrides).length;
    btnSavePanel.textContent = n ? ('💾 保存 (' + n + ')') : '💾 保存';
  }

  /* ============ 文字编辑 ============ */
  function startTextEdit(el) {
    if (el.getAttribute('contenteditable') === 'true') return;
    editingEl = el;
    originalHTML = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    try { el.focus(); } catch (e) {}
    showHint('改完点下方「💾 保存」按钮；停笔 0.9 秒也会自动保存 · Esc 取消');
    showSaveBar(el);

    // 保险②：停止输入 0.9 秒自动保存
    el.addEventListener('input', function onInput() {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () {
        if (editingEl === el && commitText(el)) toast('已自动保存');
      }, 900);
    });

    // 保险③：失焦兜底保存
    el.addEventListener('blur', function onBlur() {
      el.removeEventListener('blur', onBlur);
      finishTextEdit(true);
    });
  }

  function finishTextEdit(doSave) {
    if (!editingEl) return false;
    var el = editingEl;
    editingEl = null;
    clearTimeout(autoTimer);
    el.removeAttribute('contenteditable');
    hideSaveBar();
    hideHint();

    if (!doSave) { el.innerHTML = originalHTML; return false; }
    return commitText(el);
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
        updateCount();
        toast('图片已替换并保存 ✓');
      });
    });

    input.click();
  }

  /* ============ 属性编辑弹框（故事配文 / 博客正文）============ */
  function closeAdminModal() {
    if (adminModal) { adminModal.remove(); adminModal = null; modalSaveFn = null; hideHint(); }
  }

  function openAttrModal(cfg) {
    closeAdminModal();
    var root = document.createElement('div');
    root.className = 'admin-modal';

    var panelEl = document.createElement('div');
    panelEl.className = 'admin-modal__panel';

    var head = document.createElement('div');
    head.className = 'admin-modal__head';
    var title = document.createElement('h3');
    title.className = 'admin-modal__title';
    title.textContent = cfg.title || '编辑';
    head.appendChild(title);
    panelEl.appendChild(head);

    var body = document.createElement('div');
    body.className = 'admin-modal__body';

    var showImgSection = !!cfg.imageSrc || !!cfg.onReplace;
    if (showImgSection) {
      var imgWrap = document.createElement('div');
      imgWrap.className = 'admin-modal__img-wrap';
      if (cfg.imageSrc) {
        var img = document.createElement('img');
        img.className = 'admin-modal__img';
        img.src = cfg.imageSrc;
        imgWrap.appendChild(img);
      } else {
        var empty = document.createElement('div');
        empty.className = 'admin-modal__img admin-modal__img--empty';
        empty.textContent = '还没有图片';
        imgWrap.appendChild(empty);
      }
      var repBtn = document.createElement('button');
      repBtn.type = 'button';
      repBtn.className = 'admin-modal__btn';
      repBtn.textContent = '📷 替换图片';
      repBtn.addEventListener('click', function () { if (cfg.onReplace) cfg.onReplace(); });
      imgWrap.appendChild(repBtn);
      body.appendChild(imgWrap);
    }

    var field = document.createElement('div');
    field.className = 'admin-modal__field';
    var label = document.createElement('label');
    label.className = 'admin-modal__label';
    label.textContent = cfg.textLabel || '内容';
    field.appendChild(label);
    var ta = document.createElement('textarea');
    ta.className = 'admin-modal__textarea' + (cfg.multiline ? ' admin-modal__textarea--lg' : '');
    ta.value = cfg.textValue || '';
    field.appendChild(ta);
    body.appendChild(field);
    panelEl.appendChild(body);

    var actions = document.createElement('div');
    actions.className = 'admin-modal__actions';
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'admin-modal__btn admin-modal__btn--primary';
    save.textContent = '💾 保存';
    var doSave = function () {
      if (cfg.onSave) cfg.onSave(ta.value);
      closeAdminModal();
    };
    modalSaveFn = doSave;
    save.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); doSave(); });
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'admin-modal__btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeAdminModal(); });
    actions.appendChild(save);
    actions.appendChild(cancel);
    panelEl.appendChild(actions);

    root.appendChild(panelEl);
    root.addEventListener('click', function (e) { if (e.target === root) closeAdminModal(); });
    document.body.appendChild(root);
    adminModal = root;
    showHint('改完点「💾 保存」· Esc 关闭 · Ctrl/Cmd+S 也能保存');
    try { ta.focus(); } catch (e2) {}
    if (cfg.multiline) { try { ta.setSelectionRange(0, 0); } catch (e2) {} }
  }

  function storeAttr(el, attr, val) {
    var key = keyOf(el);
    overrides[key] = { t: 'attr', k: attr, v: val };
    el.setAttribute('data-ovr-sel', key);
    if (persist()) { applyOne(key, overrides[key]); updateCount(); toast('已保存 ✓'); }
  }

  function openCaptionEditor(fig) {
    var cur = fig.getAttribute('data-note') || '';
    var imgEl = fig.querySelector('img') || fig.querySelector('.ph');
    openAttrModal({
      title: '编辑照片',
      textLabel: '这张照片背后的小故事（hover 时显示）',
      textValue: cur,
      multiline: false,
      imageSrc: (imgEl && imgEl.tagName === 'IMG') ? imgEl.src : null,
      onReplace: function () { if (imgEl) pickImage(imgEl); },
      onSave: function (val) { storeAttr(fig, 'data-note', val); }
    });
  }

  function openArticleEditor(post) {
    var cur = post.getAttribute('data-content') || '';
    openAttrModal({
      title: '编辑文章正文',
      textLabel: '文章正文（每段一行，会按换行正常显示）',
      textValue: cur,
      multiline: true,
      onSave: function (val) { storeAttr(post, 'data-content', val); }
    });
  }

  /* 直接把纯文字写入覆盖（不经过内联 contenteditable），供弹框保存用 */
  function storeText(el, val) {
    var key = keyOf(el);
    overrides[key] = { t: 'text', v: val };
    el.setAttribute('data-ovr-sel', key);
    if (persist()) { applyOne(key, overrides[key]); updateCount(); toast('已保存 ✓'); }
  }

  /* 取（必要时重建）作品卡的悬浮说明气泡。
     历史遗留：旧版没有 data-key，位置选择器在导入照片后可能失配并命中 hover 容器，
     textContent 覆盖会把 .bubble 冲掉。这里兜底重建，保证用户永远有地方可写。 */
  function ensureBubble(card) {
    var media = card.querySelector('.project-card__media');
    if (!media) return null;

    var hover = media.querySelector('.project-card__hover');
    if (!hover) {
      hover = document.createElement('div');
      hover.className = 'project-card__hover';
      media.appendChild(hover);
    }

    var b = hover.querySelector('.bubble');
    if (b) return b;

    // 补建时必须复用「这张卡原本那个气泡」的 data-key（写在 hover 容器的 data-bubble-key 上）。
    // 否则新气泡会拿到一个新 key，而刷新后页面回到原始 HTML、新 key 根本不存在，
    // 存进去的内容就永远套不回来 —— 表现为"保存成功但页面上不显示"。
    var key = hover.getAttribute('data-bubble-key');
    if (!key) {
      // 兜底：从媒体区图片的 data-key 派生（如 ph-1-bubble）
      var holder = media.querySelector('[data-key]');
      key = holder ? (holder.getAttribute('data-key') + '-bubble') : null;
    }
    if (!key) {
      var all = Array.prototype.slice.call(document.querySelectorAll('.project-card'));
      key = 'bubble-auto-' + (all.indexOf(card) + 1);
    }

    b = document.createElement('p');
    b.className = 'bubble bubble--sm';
    b.setAttribute('data-key', key);
    hover.appendChild(b);
    return b;
  }

  /* 作品卡编辑弹框：替换图片 + 修改悬浮说明，一处搞定；
     弹框居中、z-index 最高，按钮永远不会被图片或卡片遮挡 */
  function openProjectEditor(card) {
    var media = card.querySelector('.project-card__media');
    var bubble = ensureBubble(card);
    var imgEl = media ? (media.querySelector('img') || media.querySelector('.ph')) : null;
    var titleEl = card.querySelector('.project-card__title') || card.querySelector('h3, h4');
    var name = titleEl ? (titleEl.textContent || '').trim().slice(0, 18) : '';
    openAttrModal({
      title: '编辑作品卡' + (name ? '：' + name : ''),
      textLabel: '悬浮说明（鼠标放到图片上时显示的一句话）',
      textValue: bubble ? (bubble.textContent || '') : '',
      multiline: false,
      imageSrc: (imgEl && imgEl.tagName === 'IMG') ? imgEl.src : null,
      onReplace: function () { if (imgEl) pickImage(imgEl); },
      onSave: function (val) {
        if (!bubble) { toast('这张卡片没有说明位'); return; }
        storeText(bubble, val);
      }
    });
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
      showHint('✏️ 编辑模式已开启 · 点文字改字 · 点图片/占位框/故事照片弹窗编辑 · 改完点「✏️ 编辑」退出');
    } else {
      finishTextEdit(true);
      hideHint();
      hideSaveBar();
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

    btnSavePanel = mkBtn('💾 保存', '保存当前正在编辑的内容（括号里是已保存的修改条数）', function () {
      if (editingEl) {
        if (finishTextEdit(true)) toast('已保存 ✓');
      } else {
        var n = Object.keys(overrides).length;
        toast(n ? ('当前没有正在编辑的内容，已保存 ' + n + ' 项修改') : '当前没有正在编辑的内容');
      }
    });
    panel.appendChild(btnSavePanel);

    panel.appendChild(mkBtn('导出备份', '把已改内容存成 JSON 文件', exportJSON));
    panel.appendChild(mkBtn('导入', '从备份 JSON 恢复修改', importJSON));
    panel.appendChild(mkBtn('重置全部', '清空所有自定义修改', resetAll));

    document.body.appendChild(panel);
    updateCount();
  }

  /* ============ 悬停高亮 ============ */
  function clearHover() {
    if (lastHover) { lastHover.classList.remove('admin-hover'); lastHover = null; }
  }
  function bindHover() {
    document.addEventListener('mouseover', function (e) {
      if (!editOn) return;
      if (adminModal && adminModal.contains(e.target)) { clearHover(); return; }
      var t = projectMediaEl(e.target) || editTarget(e.target);
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
      // 点在后台弹框内部 -> 交给弹框自己的按钮，不要拦截
      if (adminModal && adminModal.contains(e.target)) return;

      // 故事照片墙：点照片 -> 弹框改配文（也能换图）
      var fig = e.target.closest && e.target.closest('.photo-tile');
      if (fig) { e.preventDefault(); e.stopPropagation(); openCaptionEditor(fig); return; }

      // 博客文章卡
      var post = e.target.closest && e.target.closest('.post-card');
      if (post) {
        var sub = editTarget(e.target);
        // 封面占位框 / 封面图 -> 换图
        if (sub && (sub.tagName === 'IMG' || (sub.classList && sub.classList.contains('ph')))) {
          e.preventDefault(); e.stopPropagation(); pickImage(sub); return;
        }
        // 标题 / 摘要 / 日期等可见文字 -> 内联编辑
        if (sub && sub !== post && post.contains(sub)) {
          e.preventDefault(); e.stopPropagation(); startTextEdit(sub); return;
        }
        // 卡片空白处 -> 弹框改整篇文章正文
        e.preventDefault(); e.stopPropagation(); openArticleEditor(post); return;
      }

      // 项目作品卡媒体区：点占位框/图片/说明条/角标任意处 -> 弹框（换图 + 改悬浮说明）
      var pm = projectMediaEl(e.target);
      if (pm) {
        var pcard = pm.closest('.project-card');
        if (pcard) { e.preventDefault(); e.stopPropagation(); openProjectEditor(pcard); return; }
      }

      var t = editTarget(e.target);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.tagName === 'IMG' || (t.classList && t.classList.contains('ph'))) pickImage(t);
      else startTextEdit(t);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (adminModal) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAdminModal(); }
        else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (modalSaveFn) modalSaveFn(); }
        return;
      }
      if (editingEl && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishTextEdit(false);
        toast('已取消');
      }
      // Ctrl/Cmd + S 也能保存
      if (editingEl && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        if (finishTextEdit(true)) toast('已保存 ✓');
      }
    }, true);

    // 滚动时保存条跟随，避免跑偏
    window.addEventListener('scroll', function () {
      if (editingEl) showSaveBar(editingEl);
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

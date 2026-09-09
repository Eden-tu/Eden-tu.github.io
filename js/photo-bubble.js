/* ============================================================
   photo-bubble.js —— 照片墙「点击照片弹气泡」：小作文 + 背景音乐
   ------------------------------------------------------------
   怎么用（给站长的三句话说明）：
   1. 点任意照片 → 弹出可爱气泡；再点同一张照片或点 × → 收起
   2. 气泡里直接写/改小作文（支持多行长文字），自动保存，刷新不丢
   3. 「🎵 选音乐」给这张照片配背景音乐：开气泡自动播放、关气泡停止；
      可随时换歌或删除。文字存 localStorage，音乐存 IndexedDB，
      都在浏览器本地，刷新后依然在。
   零依赖、不改 HTML 结构、纯前端实现。
   ============================================================ */
(function () {
  'use strict';

  var NOTE_PREFIX = 'pb_note_';      // localStorage 文字键：pb_note_<照片id>
  var DB_NAME = 'eden_photowall';    // IndexedDB 库名（存音乐文件）
  var STORE = 'music';
  var PLACEHOLDER_RE = /^\s*\{\{/;   // {{...}} 是模板占位符，当作没写过

  /* ---------------- IndexedDB 小封装 ---------------- */
  var dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          req.result.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbPut(key, val) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var r = d.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
        r.onsuccess = function () { resolve(true); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var r = d.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
        r.onsuccess = function () { resolve(true); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  /* ---------------- 状态 ---------------- */
  var audio = new Audio();
  audio.preload = 'auto';
  audio.loop = true;
  var urlCache = {};        // 照片id -> objectURL（避免重复创建）
  var metaCache = {};       // 照片id -> {name}（快速显示歌名）
  var bubble = null, textarea = null, hintText = null;
  var musicName = null, btnPlay = null, btnPick = null, btnDel = null;
  var fileInput = null;
  var currentId = null;     // 当前气泡属于哪张照片
  var textId = null;        // 当前 textarea 里的文字属于哪张照片
  var currentTile = null;   // 当前气泡锚定的 tile 元素
  var saveTimer = null;
  var hintTimer = null;
  var rafPending = false;

  /* ---------------- 工具 ---------------- */
  function photoId(tile, idx) {
    if (!tile.dataset.pbId) {
      tile.dataset.pbId = tile.getAttribute('data-key') || ('ph-' + idx);
    }
    return tile.dataset.pbId;
  }
  function initialNote(tile) {
    var saved = null;
    try { saved = localStorage.getItem(NOTE_PREFIX + (tile.dataset.pbId || '')); } catch (e) {}
    if (saved !== null) return saved;
    var dn = tile.getAttribute('data-note') || '';
    return PLACEHOLDER_RE.test(dn) ? '' : dn;
  }
  function saveTextNow() {
    if (textId === null) return;
    try {
      localStorage.setItem(NOTE_PREFIX + textId, textarea.value);
      // 同步悬停小提示：hover 时照片上方的小气泡跟正式内容一致
      if (currentTile && textarea.value.trim()) {
        currentTile.setAttribute('data-note', textarea.value);
      }
      flashHint('已保存 ✓');
    } catch (e) {
      flashHint('保存失败（存储空间不足？）');
    }
  }
  function saveTextDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveTextNow, 900);   // 停止输入 0.9 秒自动保存
  }
  function flashHint(msg) {
    hintText.textContent = msg;
    hintText.classList.add('is-show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintText.classList.remove('is-show'); }, 1600);
  }

  /* ---------------- 音乐 ---------------- */
  function stopMusic() {
    audio.pause();
    try { audio.currentTime = 0; } catch (e) {}
    if (btnPlay) btnPlay.textContent = '▶ 播放';
  }
  function playMusic() {
    var p = audio.play();
    if (p && p.catch) p.catch(function () { /* 浏览器拦截自动播放时，用户可手动点播放 */ });
    if (btnPlay) btnPlay.textContent = '⏸ 暂停';
  }
  function loadAndPlay(id) {
    idbGet(id).then(function (rec) {
      if (currentId !== id) return;             // 气泡已切走
      if (!rec) {                               // 这张照片没配音乐
        musicName.textContent = '未设置（点「选音乐」添加）';
        btnPick.textContent = '🎵 选音乐';
        btnDel.style.display = 'none';
        btnPlay.style.display = 'none';
        return;
      }
      metaCache[id] = { name: rec.name };
      musicName.textContent = '🎶 ' + rec.name;
      musicName.title = rec.name;
      btnDel.style.display = '';
      btnPlay.style.display = '';
      if (!urlCache[id]) urlCache[id] = URL.createObjectURL(rec.blob);
      if (audio.src !== urlCache[id]) audio.src = urlCache[id];
      playMusic();                              // 开气泡自动播放
    }).catch(function () {
      musicName.textContent = '音乐读取失败';
    });
  }
  function refreshMusicUI(id) {
    var meta = metaCache[id];
    btnDel.style.display = meta ? '' : 'none';
    btnPlay.style.display = meta ? '' : 'none';
    musicName.textContent = meta ? ('🎶 ' + meta.name) : '未设置（点「选音乐」添加）';
  }

  /* ---------------- 气泡 DOM（动态创建，不改 HTML） ---------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function buildBubble() {
    bubble = el('div', 'photo-bubble');
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', '照片小故事');

    // 可爱小图标点缀（♡ ★ ♪ ☆ 沿边角漂浮）
    ['♡', '★', '♪', '☆', '♡', '♪'].forEach(function (ch, i) {
      var d = el('span', 'pb-doodle pb-doodle--' + (i + 1), ch);
      bubble.appendChild(d);
    });

    var close = el('button', 'photo-bubble__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '收起气泡');
    close.addEventListener('click', closeBubble);
    bubble.appendChild(close);

    bubble.appendChild(el('div', 'photo-bubble__head', '📖 照片小故事'));

    textarea = document.createElement('textarea');
    textarea.className = 'photo-bubble__text';
    textarea.placeholder = '写点什么…这张照片背后的故事、当时的心情，都可以写下来～（自动保存）';
    textarea.addEventListener('input', saveTextDebounced);
    bubble.appendChild(textarea);

    var row = el('div', 'photo-bubble__row');
    var save = el('button', 'pb-btn pb-btn--save', '💾 保存文字');
    save.type = 'button';
    save.addEventListener('click', function () { saveTextNow(); });
    hintText = el('span', 'photo-bubble__hint');
    row.appendChild(save);
    row.appendChild(hintText);
    bubble.appendChild(row);

    var music = el('div', 'photo-bubble__music');
    music.appendChild(el('span', 'photo-bubble__music-title', '🎵 背景音乐'));
    musicName = el('span', 'photo-bubble__music-name', '未设置');
    btnPlay = el('button', 'pb-btn pb-btn--play', '▶ 播放');
    btnPick = el('button', 'pb-btn pb-btn--pick', '🎵 选音乐');
    btnDel = el('button', 'pb-btn pb-btn--del', '🗑 删除');
    [btnPlay, btnPick, btnDel].forEach(function (b) { b.type = 'button'; });
    btnPlay.style.display = 'none';
    btnDel.style.display = 'none';
    btnPlay.addEventListener('click', function () {
      if (audio.paused) playMusic(); else { audio.pause(); btnPlay.textContent = '▶ 播放'; }
    });
    btnPick.addEventListener('click', function () { fileInput.click(); });
    btnDel.addEventListener('click', function () {
      if (!currentId) return;
      stopMusic();
      idbDel(currentId).then(function () {
        if (urlCache[currentId]) { URL.revokeObjectURL(urlCache[currentId]); delete urlCache[currentId]; }
        delete metaCache[currentId];
        musicName.textContent = '已删除（点「选音乐」重新添加）';
        btnDel.style.display = 'none';
        btnPlay.style.display = 'none';
        flashHint('音乐已删除 🗑');
      });
    });
    music.appendChild(musicName);
    music.appendChild(btnPlay);
    music.appendChild(btnPick);
    music.appendChild(btnDel);
    bubble.appendChild(music);

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.hidden = true;
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';                        // 允许连续选同一个文件
      if (!f || !currentId) return;
      var id = currentId;
      stopMusic();
      if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
      idbPut(id, { name: f.name, type: f.type, blob: f }).then(function () {
        metaCache[id] = { name: f.name };
        if (currentId === id) {
          refreshMusicUI(id);
          urlCache[id] = URL.createObjectURL(f);
          audio.src = urlCache[id];
          playMusic();
          flashHint('音乐已保存 🎵');
        }
      }).catch(function () {
        flashHint('音乐保存失败（文件太大？）');
      });
    });
    bubble.appendChild(fileInput);

    document.body.appendChild(bubble);
  }

  /* ---------------- 开 / 关 / 定位 ---------------- */
  function place(tile) {
    var r = tile.getBoundingClientRect();
    var bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight, M = 10;
    var left = Math.min(Math.max(M, r.left + r.width / 2 - bw / 2), vw - bw - M);
    var top = r.top - bh - 12;                 // 默认弹在照片上方
    if (top < M) top = r.bottom + 12;          // 放不下就弹下方
    if (top + bh > vh - M) top = Math.max(M, vh - bh - M);
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }
  function reposition() {
    if (!bubble.classList.contains('is-open') || !currentTile) return;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () { rafPending = false; place(currentTile); });
  }
  function openFor(tile, id) {
    if (currentId === id) { closeBubble(); return; }   // 再点同一张 = 收起
    stopMusic();
    saveTextNow();                                     // 切走前把上一张的未存文字存掉
    currentId = id;
    textId = id;
    currentTile = tile;
    textarea.value = initialNote(tile);
    hintText.classList.remove('is-show');
    if (currentTile) currentTile.classList.remove('is-pb-open');
    tile.classList.add('is-pb-open');
    place(tile);
    bubble.classList.add('is-open');
    bubble.setAttribute('aria-hidden', 'false');
    refreshMusicUI(id);
    loadAndPlay(id);                                   // 有音乐就自动播放
  }
  function closeBubble() {
    if (!bubble.classList.contains('is-open')) return;
    stopMusic();                                       // 关气泡即停音乐
    bubble.classList.remove('is-open');
    bubble.setAttribute('aria-hidden', 'true');
    if (currentTile) currentTile.classList.remove('is-pb-open');
    currentId = null;
    currentTile = null;
    /* 注意：textId 不清空——关气泡前把最后输入的内容存掉 */
    saveTextNow();
    textId = null;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    var tiles = document.querySelectorAll('.photo-tile');
    Array.prototype.forEach.call(tiles, function (tile, idx) {
      var id = photoId(tile, idx);
      tile.classList.add('pb-ready');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', '查看这张照片的故事');
      tile.addEventListener('click', function () {
        if (document.body.classList.contains('admin-editing')) return;  // 让位可视化编辑
        openFor(tile, id);
      });
      tile.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!document.body.classList.contains('admin-editing')) openFor(tile, id);
        }
      });
    });

    // 点气泡外空白处收起（点其他照片由上面的 handler 处理切换）
    document.addEventListener('click', function (e) {
      if (!bubble.classList.contains('is-open')) return;
      if (bubble.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.photo-tile')) return;
      closeBubble();
    });
    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeBubble();
    });
    // 滚动 / 缩放时气泡跟着照片走
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    // 离开页面前兜底保存
    window.addEventListener('beforeunload', saveTextNow);
  }

  buildBubble();
  bind();
})();

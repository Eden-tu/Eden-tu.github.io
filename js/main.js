/* ==========================================================================
   Eden 个人作品集 · 交互脚本
   --------------------------------------------------------------------------
   纯原生 JavaScript，零依赖。双击 index.html 直接打开也能正常运行。
   ✏️ 你要改的东西基本都在文件最顶部的「数据区」，改完刷新页面即可。
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     【数据区】—— ✏️ 平时只需要改这里
     ======================================================================== */

  // ✏️ 身体数据：每加一条记录就在数组里加一行。
  //    month  = X 轴上的标签（写周、写日期都行）
  //    weight = 体重（kg）
  //    fat    = 体脂率（%）
  // 真实数据：21年 92kg/26% → 24年 74kg/21% → 现在 70kg/16%
  // 22/23/25 年为 21·24·现在 三个真实锚点之间的线性插值，有真实周数据可直接替换
  var bodyData = [
    { month: '21年', weight: 92.0, fat: 26.0 },
    { month: '22年', weight: 86.0, fat: 24.3 },
    { month: '23年', weight: 80.0, fat: 22.7 },
    { month: '24年', weight: 74.0, fat: 21.0 },
    { month: '25年', weight: 72.0, fat: 18.5 },
    { month: '现在', weight: 70.0, fat: 16.0 }
  ];

  // ✏️ 联系表单的收件邮箱：改成你自己的邮箱，别人提交留言就会发到这个地址
  var MY_EMAIL = 'your-email@example.com';

  // ✏️ 博客每页显示几篇文章（默认 6 篇）
  var POSTS_PER_PAGE = 6;

  /* ========================================================================
     下面是功能代码，一般不用改
     ======================================================================== */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // 让 CSS 知道 JS 已经跑起来了（这样滚动渐入动画才会生效）
  document.documentElement.classList.add('js-on');

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    // 强制重排，保证过渡动画能触发
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 300);
    }, 2200);
  }

  // localStorage 在部分环境（比如本地直接双击打开）可能不可用，所以包一层 try
  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* 忽略 */ } }

  /* ========================================================================
     1. 深色 / 浅色模式切换
     ======================================================================== */
  function initTheme() {
    var toggle = $('#themeToggle');
    var saved = safeGet('eden-theme');
    var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    var theme = saved || (systemDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    if (toggle) {
      toggle.addEventListener('click', function () {
        var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', now);
        safeSet('eden-theme', now);
        toast(now === 'dark' ? '已切换到深色模式 🌙' : '已切换到浅色模式 ☀️');
      });
    }
  }

  /* ========================================================================
     2. 导航栏：汉堡菜单 / 滚动贴纸效果 / 当前板块高亮 / 回到顶部
     ======================================================================== */
  function initNav() {
    var navbar = $('#navbar');
    var nav = $('#primaryNav');
    var burger = $('#navToggle');
    var backdrop = $('#navBackdrop');
    var toTop = $('#toTop');
    var links = $$('.nav__link');
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

    // ---- 汉堡菜单开合 ----
    function closeMenu() {
      if (!nav || !burger) return;
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', '打开菜单');
      if (backdrop) backdrop.hidden = true;
      document.body.style.overflow = '';
    }
    function openMenu() {
      if (!nav || !burger) return;
      nav.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', '关闭菜单');
      if (backdrop) backdrop.hidden = false;
    }
    if (burger) {
      burger.addEventListener('click', function () {
        if (nav && nav.classList.contains('is-open')) closeMenu(); else openMenu();
      });
    }
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    // 点导航链接后关闭手机菜单
    links.forEach(function (a) { a.addEventListener('click', closeMenu); });

    // 点空白处 / 按 Esc 关闭菜单
    document.addEventListener('click', function (e) {
      if (!nav || !nav.classList.contains('is-open')) return;
      if (nav.contains(e.target) || (burger && burger.contains(e.target))) return;
      closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenu(); closeModal(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 720) closeMenu(); });

    // ---- 滚动：贴纸效果 + 高亮 + 回到顶部按钮 ----
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.pageYOffset || document.documentElement.scrollTop;

        if (navbar) navbar.classList.toggle('is-stuck', y > 20);
        if (toTop) toTop.classList.toggle('is-visible', y > window.innerHeight * 0.8);

        // 找到当前视口顶部所在的板块
        var currentId = sections.length ? sections[0].id : '';
        var probe = y + (window.innerHeight * 0.28);
        for (var i = 0; i < sections.length; i++) {
          if (sections[i] && sections[i].offsetTop <= probe) currentId = sections[i].id;
        }
        links.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + currentId);
        });
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---- 回到顶部 ----
    if (toTop) {
      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    var inlineTop = $('#backToTopInline');
    if (inlineTop) {
      inlineTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  /* ========================================================================
     3. 滚动渐入动画（IntersectionObserver）
     ======================================================================== */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    function revealAll() {
      items.forEach(function (el) { el.classList.add('is-visible'); });
    }
    // 兜底：load 后仍在视口里的 reveal 若仍未触发，确保显示
    function revealAboveFold() {
      items.forEach(function (el) {
        if (!el.classList.contains('is-visible') &&
            el.getBoundingClientRect().top < window.innerHeight + 100) {
          el.classList.add('is-visible');
        }
      });
    }

    if (!('IntersectionObserver' in window)) { revealAll(); return; }

    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      items.forEach(function (el) { io.observe(el); });
    } catch (err) {
      // 观察器初始化失败 → 直接全显，避免白屏
      revealAll();
      return;
    }

    // 兜底：若 main.js 初始化在加完 js-on 之后才挂掉、或首屏 reveal 因时机未触发，
    // load 后强制把视口内未显示的元素显示出来，杜绝“JS 一报错就整页空白”
    window.addEventListener('load', function () {
      setTimeout(revealAboveFold, 250);
    });
  }

  /* ========================================================================
     4. 弹出层（Modal）—— 项目详情 & 文章详情共用
     ======================================================================== */
  var modal = null, modalBody = null, lastFocused = null;

  function openModal(html) {
    modal = modal || $('#modal');
    modalBody = modalBody || $('#modalBody');
    if (!modal || !modalBody) return;
    lastFocused = document.activeElement;
    modalBody.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var closeBtn = $('.modal__close', modal);
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function initModal() {
    modal = $('#modal');
    if (!modal) return;
    modalBody = $('#modalBody');

    // 点背景 / 点关闭按钮 / 按 Esc 都能关
    $$('[data-close]', modal).forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
  }

  // 占位图 HTML（避免重复写）
  function placeholder(cls, label, hint) {
    return '<div class="ph ' + cls + '">' +
      '<svg class="ph__icon" aria-hidden="true"><use href="#i-camera"/></svg>' +
      '<span class="ph__label">' + label + '</span>' +
      '<span class="ph__hint">' + hint + '</span>' +
      '</div>';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function linkHtml(href, text) {
    if (!href || href === '#') {
      return '<span class="btn btn--ghost is-off" aria-disabled="true">' + escapeHtml(text) + '</span>';
    }
    return '<a class="btn btn--ghost" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' +
      '<svg class="icon" aria-hidden="true"><use href="#i-link"/></svg> ' + escapeHtml(text) + '</a>';
  }

  /* ========================================================================
     5. 项目：分类筛选 + 详情弹出
     ======================================================================== */
  function initProjects() {
    var grid = $('#projectGrid');
    var filters = $('#projectFilters');
    var empty = $('#projectEmpty');
    if (!grid) return;
    var cards = $$('.project-card', grid);

    // 让它能被键盘 Tab 到，并用回车 / 空格打开
    cards.forEach(function (card) {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', '查看项目详情：' + ($('.project-card__title', card) || {}).textContent);
    });

    function openProjectDetail(card) {
      var title = ($('.project-card__title', card) || {}).textContent || '';
      var category = card.getAttribute('data-category') || '';
      var tags = $$('.tag', card).map(function (t) { return t.textContent; });
      var html = '' +
        '<h3 class="modal__title">' + escapeHtml(title) + '</h3>' +
        '<div class="modal__meta">' +
          '<span class="badge">' + escapeHtml(category) + '</span>' +
          tags.map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') +
        '</div>' +
        '<div class="modal__hero">' + placeholder('ph--16x10', '项目大图占位', 'images/project-*.jpg') + '</div>' +
        '<div class="modal__section"><h4>项目背景</h4><p>' + escapeHtml(card.getAttribute('data-detail-bg')) + '</p></div>' +
        '<div class="modal__section"><h4>技术架构</h4><p>' + escapeHtml(card.getAttribute('data-detail-tech')) + '</p></div>' +
        '<div class="modal__section"><h4>我的职责</h4><p>' + escapeHtml(card.getAttribute('data-detail-role')) + '</p></div>' +
        '<div class="modal__section"><h4>项目成果</h4><p>' + escapeHtml(card.getAttribute('data-detail-result')) + '</p></div>' +
        '<div class="modal__links">' +
          linkHtml(card.getAttribute('data-link-demo'), '在线预览') +
          linkHtml(card.getAttribute('data-link-code'), '源代码') +
        '</div>';
      openModal(html);
    }

    grid.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.project-card') : null;
      if (card) openProjectDetail(card);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.project-card') : null;
      if (card) { e.preventDefault(); openProjectDetail(card); }
    });

    // ---- 分类筛选 ----
    if (filters) {
      filters.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.chip') : null;
        if (!btn) return;
        $$('.chip', filters).forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');

        var want = btn.getAttribute('data-filter');
        var shown = 0;
        cards.forEach(function (card) {
          var match = (want === 'all') || (card.getAttribute('data-category') === want);
          card.hidden = !match;
          if (match) { shown++; card.classList.add('is-visible'); }
        });
        if (empty) empty.hidden = shown !== 0;
      });
    }
  }

  /* ========================================================================
     6. 博客：搜索 + 分类筛选 + 分页 + 文章详情弹出
     ======================================================================== */
  function initBlog() {
    var list = $('#postList');
    var filters = $('#blogFilters');
    var search = $('#blogSearch');
    var pager = $('#blogPagination');
    var empty = $('#blogEmpty');
    if (!list) return;

    var all = $$('.post-card', list);
    var state = { category: 'all', query: '', page: 1 };

    function visiblePosts() {
      var q = state.query.trim().toLowerCase();
      return all.filter(function (post) {
        var catOk = (state.category === 'all') || (post.getAttribute('data-category') === state.category);
        if (!catOk) return false;
        if (!q) return true;
        var title = ($('.post-card__title', post) || {}).textContent || '';
        return title.toLowerCase().indexOf(q) !== -1;
      });
    }

    function renderPager(total) {
      if (!pager) return;
      var pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
      if (state.page > pages) state.page = pages;
      pager.innerHTML = '';

      function mkBtn(label, page, opts) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-btn' + (opts && opts.active ? ' is-active' : '');
        b.textContent = label;
        if (opts && opts.disabled) { b.disabled = true; } else {
          b.addEventListener('click', function () {
            state.page = page;
            render();
            if (list && list.getBoundingClientRect) {
              var top = list.getBoundingClientRect().top + (window.pageYOffset || 0) - 100;
              window.scrollTo({ top: top, behavior: 'smooth' });
            }
          });
        }
        return b;
      }

      pager.appendChild(mkBtn('‹ 上一页', state.page - 1, { disabled: state.page <= 1 }));
      for (var i = 1; i <= pages; i++) {
        pager.appendChild(mkBtn(String(i), i, { active: i === state.page }));
      }
      pager.appendChild(mkBtn('下一页 ›', state.page + 1, { disabled: state.page >= pages }));
    }

    function render() {
      var visible = visiblePosts();
      var start = (state.page - 1) * POSTS_PER_PAGE;
      var end = start + POSTS_PER_PAGE;

      all.forEach(function (post) { post.hidden = true; });
      visible.slice(start, end).forEach(function (post) {
        post.hidden = false;
        post.classList.add('is-visible');
      });

      if (empty) empty.hidden = visible.length !== 0;
      renderPager(visible.length);
    }

    // 筛选
    if (filters) {
      filters.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.chip') : null;
        if (!btn) return;
        $$('.chip', filters).forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        state.category = btn.getAttribute('data-filter');
        state.page = 1;
        render();
      });
    }

    // 搜索（输入即时过滤）
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.query = search.value;
          state.page = 1;
          render();
        }, 160);
      });
      // 按 Esc 清空搜索框
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { search.value = ''; state.query = ''; state.page = 1; render(); }
      });
    }

    // 阅读全文 → 弹出详情
    list.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-read]') : null;
      if (!trigger) return;
      var post = trigger.closest('.post-card');
      if (!post) return;

      var title = ($('.post-card__title', post) || {}).textContent || '';
      var metaHtml = ($('.post-card__meta', post) || {}).innerHTML || '';
      var content = post.getAttribute('data-content') || '';

      openModal('' +
        '<h3 class="modal__title">' + escapeHtml(title) + '</h3>' +
        '<div class="modal__meta">' + metaHtml + '</div>' +
        '<div class="modal__hero">' + placeholder('ph--16x10', '文章头图占位', 'images/blog-*.jpg') + '</div>' +
        '<div class="modal__section"><p class="modal__body-text">' + escapeHtml(content) + '</p></div>');
    });

    render();
  }

  /* ========================================================================
     7. 点击复制（邮箱 / GitHub / 微信号）
     ======================================================================== */
  function copyText(text) {
    // 方案一：现代浏览器的剪贴板 API（需要 HTTPS 或 localhost）
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // 方案二：兜底 —— 造一个临时输入框，用老办法复制（本地直接打开网页时走这条）
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function initCopy() {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy') || btn.textContent;
        copyText(text).then(function () {
          toast('已复制：' + text);
        }).catch(function () {
          // 实在复制不了，就把内容选中让用户自己按 Ctrl+C
          window.prompt('复制下面的内容（Ctrl / Cmd + C）：', text);
        });
      });
    });
  }

  /* ========================================================================
     8. 联系表单：必填校验 + 邮箱格式校验 + mailto 提交
     ======================================================================== */
  function initForm() {
    var form = $('#contactForm');
    var success = $('#formSuccess');
    if (!form) return;

    var rules = {
      name: function (v) { return v.trim() ? '' : '请填写你的名字～'; },
      email: function (v) {
        if (!v.trim()) return '请填写邮箱，不然我回不了你哦';
        // 简单的邮箱格式检查
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return '邮箱格式看起来不太对，检查一下？';
        return '';
      },
      message: function (v) { return v.trim() ? '' : '总得写点什么吧 :)'; }
    };

    function fieldOf(name) {
      var input = form.querySelector('[name="' + name + '"]');
      return input ? input.closest('.field') : null;
    }
    function errorEl(name) { return form.querySelector('[data-error-for="' + name + '"]'); }

    function validateField(name) {
      if (!rules[name]) return true;
      var input = form.querySelector('[name="' + name + '"]');
      var field = fieldOf(name);
      var msg = rules[name](input ? input.value : '');
      if (field) field.classList.toggle('has-error', !!msg);
      var err = errorEl(name);
      if (err) err.textContent = msg;
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      return !msg;
    }

    // 失焦时校验一次；再次输入时清掉报错
    Object.keys(rules).forEach(function (name) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      input.addEventListener('blur', function () { validateField(name); });
      input.addEventListener('input', function () {
        var field = fieldOf(name);
        if (field && field.classList.contains('has-error')) validateField(name);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (success) success.hidden = true;

      var ok = true;
      var firstBad = null;
      Object.keys(rules).forEach(function (name) {
        var valid = validateField(name);
        if (!valid && !firstBad) firstBad = form.querySelector('[name="' + name + '"]');
        ok = ok && valid;
      });

      if (!ok) {
        if (firstBad) firstBad.focus();
        toast('还有必填项没写完哦');
        return;
      }

      var name = form.querySelector('[name="name"]').value.trim();
      var email = form.querySelector('[name="email"]').value.trim();
      var subject = form.querySelector('[name="subject"]').value;
      var message = form.querySelector('[name="message"]').value.trim();

      var mailSubject = '[网站留言] ' + subject + ' · 来自 ' + name;
      var mailBody = '姓名：' + name + '\n邮箱：' + email + '\n主题：' + subject + '\n\n留言内容：\n' + message;

      /* ------------------------------------------------------------------
         纯静态网站没有服务器，所以用 mailto 兜底：会打开访问者的邮件客户端。
         ✏️ 想让留言直接进邮箱？把 mailto 换成 Formspree 之类的第三方服务即可，
            步骤写在「使用说明.md」里。
         ------------------------------------------------------------------ */
      window.location.href = 'mailto:' + encodeURIComponent(MY_EMAIL) +
        '?subject=' + encodeURIComponent(mailSubject) +
        '&body=' + encodeURIComponent(mailBody);

      if (success) success.hidden = false;
      toast('消息已发送！我会尽快回复~');
      form.reset();
      Object.keys(rules).forEach(function (n) {
        var field = fieldOf(n);
        var err = errorEl(n);
        if (field) field.classList.remove('has-error');
        if (err) err.textContent = '';
      });
    });
  }

  /* ========================================================================
     9. 健身数据折线图（纯 SVG 手绘，不用图表库）
     ======================================================================== */
  function starPath(cx, cy, outer, inner) {
    var points = [];
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? outer : inner;
      var a = (Math.PI / 5) * i - Math.PI / 2;
      points.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return 'M' + points.join('L') + 'Z';
  }

  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function drawFitnessChart() {
    var svg = $('#fitnessChart');
    if (!svg || !bodyData.length) return;

    svg.innerHTML = '';

    var W = 760, H = 340;
    var padL = 52, padR = 54, padT = 26, padB = 46;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    var weights = bodyData.map(function (d) { return d.weight; });
    var fats = bodyData.map(function (d) { return d.fat; });

    function scale(min, max) {
      if (max - min < 1) { min = min - 1; max = max + 1; } // 防止所有值都一样导致除零
      // 顶部只留少量余量，让起始高点（92kg/26%）贴近图表顶部；底部留较多余量给当前低点
      var padTop = (max - min) * 0.06;
      var padBot = (max - min) * 0.14;
      min = min - padBot; max = max + padTop;
      return { min: min, max: max };
    }
    var sW = scale(Math.min.apply(null, weights), Math.max.apply(null, weights));
    var sF = scale(Math.min.apply(null, fats), Math.max.apply(null, fats));

    function xAt(i) {
      return bodyData.length === 1
        ? padL + plotW / 2
        : padL + (plotW * i) / (bodyData.length - 1);
    }
    function yWeight(v) { return padT + plotH * (1 - (v - sW.min) / (sW.max - sW.min)); }
    function yFat(v) { return padT + plotH * (1 - (v - sF.min) / (sF.max - sF.min)); }

    // ---- 网格线（虚线）+ 左右两侧刻度 ----
    var LINES = 5;
    for (var g = 0; g <= LINES; g++) {
      var y = padT + (plotH * g) / LINES;
      svg.appendChild(el('line', {
        x1: padL, y1: y, x2: padL + plotW, y2: y,
        class: 'chart-grid'
      }));

      var wVal = sW.max - ((sW.max - sW.min) * g) / LINES;
      var fVal = sF.max - ((sF.max - sF.min) * g) / LINES;

      var lw = el('text', { x: padL - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-label' });
      lw.textContent = wVal.toFixed(1);
      svg.appendChild(lw);

      var lf = el('text', { x: padL + plotW + 10, y: y + 4, 'text-anchor': 'start', class: 'chart-label chart-label--right' });
      lf.textContent = fVal.toFixed(1);
      svg.appendChild(lf);
    }

    // ---- 坐标轴 ----
    svg.appendChild(el('line', { class: 'chart-axis', x1: padL, y1: padT, x2: padL, y2: padT + plotH }));
    svg.appendChild(el('line', { class: 'chart-axis', x1: padL + plotW, y1: padT, x2: padL + plotW, y2: padT + plotH }));

    // ---- 折线 ----
    function polyline(points, color) {
      svg.appendChild(el('polyline', {
        points: points.map(function (p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 3.5,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }
    var ptsW = bodyData.map(function (d, i) { return { x: xAt(i), y: yWeight(d.weight) }; });
    var ptsF = bodyData.map(function (d, i) { return { x: xAt(i), y: yFat(d.fat) }; });

    var cssOrange = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim() || '#FF6B35';
    var cssPink = getComputedStyle(document.documentElement).getPropertyValue('--c-hot').trim() || '#FF6B9D';
    var cssInk = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#2D3436';

    polyline(ptsW, cssOrange);
    polyline(ptsF, cssPink);

    // ---- 数据点：星星形状 ----
    function drawStars(points, color, values, unit, name) {
      points.forEach(function (p, i) {
        var g = el('g', {});
        var star = el('path', {
          d: starPath(p.x, p.y, 9, 4.2),
          fill: color, stroke: cssInk, 'stroke-width': 2, 'stroke-linejoin': 'round'
        });
        var tip = el('title', {});
        tip.textContent = name + '：' + values[i] + unit + '（' + bodyData[i].month + '）';
        g.appendChild(tip);
        g.appendChild(star);
        svg.appendChild(g);
      });
    }
    drawStars(ptsW, cssOrange, weights, ' kg', '体重');
    drawStars(ptsF, cssPink, fats, ' %', '体脂率');

    // ---- X 轴标签 ----
    bodyData.forEach(function (d, i) {
      var t = el('text', {
        x: xAt(i), y: padT + plotH + 26,
        'text-anchor': 'middle', class: 'chart-label'
      });
      t.textContent = d.month;
      svg.appendChild(t);
    });

    // ---- 轴标题 ----
    var yTitle = el('text', { x: padL - 10, y: padT - 10, 'text-anchor': 'end', class: 'chart-label' });
    yTitle.textContent = '体重 kg';
    svg.appendChild(yTitle);

    var yTitle2 = el('text', { x: padL + plotW + 10, y: padT - 10, 'text-anchor': 'start', class: 'chart-label chart-label--right' });
    yTitle2.textContent = '体脂 %';
    svg.appendChild(yTitle2);
  }

  /* ========================================================================
     10. 启动
     ======================================================================== */
  function init() {
    initTheme();
    initNav();
    initModal();
    initProjects();
    initBlog();
    initCopy();
    initForm();
    initReveal();
    drawFitnessChart();

    // 页脚年份自动更新
    var yearEl = $('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // 切换主题后，图表颜色跟着变
    var toggle = $('#themeToggle');
    if (toggle) toggle.addEventListener('click', function () { setTimeout(drawFitnessChart, 60); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ==========================================================================
   内容管理模块 #studio —— 用户自管理 CRUD（localStorage 持久化）
   纯原生、自包含 IIFE，不依赖上方 IIFE 的私有函数。
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'eden_cms_records';
  var MAX_IMG = 2 * 1024 * 1024; // 2MB
  var CATEGORIES = ['生活', '学习', '项目', '其他'];

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var studioModal = null, studioModalBody = null;

  function cmsToast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.classList.remove('is-visible');
      el.hidden = true;
    }, 1800);
  }

  function cmsOpenForm(html) {
    studioModal = studioModal || $('#modal');
    studioModalBody = studioModalBody || $('#modalBody');
    if (!studioModal || !studioModalBody) return;
    studioModalBody.innerHTML = html;
    studioModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function cmsCloseForm() {
    if (!studioModal || studioModal.hidden) return;
    studioModal.hidden = true;
    studioModalBody.innerHTML = '';
    document.body.style.overflow = '';
  }

  function loadRecords() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveRecords(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch (e) { cmsToast('保存失败：浏览器本地存储不可用'); }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  var records = [];

  function render() {
    var grid = $('#studioGrid');
    var empty = $('#studioEmpty');
    var countEl = $('#studioCount');
    if (!grid) return;

    if (countEl) countEl.textContent = String(records.length);
    if (empty) empty.style.display = records.length ? 'none' : '';

    grid.innerHTML = records.map(function (r) {
      var media = r.image
        ? '<img class="studio-card__media" src="' + escapeHtml(r.image) + '" alt="' + escapeHtml(r.title) + '">'
        : '<div class="studio-card__media studio-card__media--ph"><svg class="ph__icon" aria-hidden="true" style="width:40px;height:40px"><use href="#i-camera"/></svg><span>无图片</span></div>';
      return '' +
        '<article class="studio-card" data-id="' + r.id + '">' +
          media +
          '<div class="studio-card__body">' +
            '<div class="studio-card__top">' +
              '<span class="studio-card__badge">' + escapeHtml(r.category || '其他') + '</span>' +
              '<input class="studio-card__check" type="checkbox" data-id="' + r.id + '" aria-label="选择此项">' +
            '</div>' +
            '<h3 class="studio-card__title">' + escapeHtml(r.title) + '</h3>' +
            (r.content ? '<p class="studio-card__excerpt">' + escapeHtml(r.content) + '</p>' : '') +
            '<div class="studio-card__meta">创建于 ' + fmtDate(r.createdAt) + '</div>' +
          '</div>' +
          '<div class="studio-card__actions">' +
            '<button class="studio-card__btn studio-card__btn--edit" data-act="edit" data-id="' + r.id + '" type="button">' +
              '<svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg> 编辑</button>' +
            '<button class="studio-card__btn studio-card__btn--del" data-act="del" data-id="' + r.id + '" type="button">' +
              '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg> 删除</button>' +
          '</div>' +
        '</article>';
    }).join('');

    syncSelection();
  }

  function syncSelection() {
    var checks = $all('.studio-card__check');
    var sel = checks.filter(function (c) { return c.checked; }).length;
    var selCount = $('#studioSelCount');
    var delBtn = $('#studioDeleteSel');
    if (selCount) selCount.textContent = String(sel);
    if (delBtn) delBtn.disabled = sel === 0;
  }

  function formHtml(rec) {
    rec = rec || {};
    var isEdit = !!rec.id;
    var opts = CATEGORIES.map(function (c) {
      return '<option value="' + c + '"' + (c === (rec.category || '其他') ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    var preview = rec.image
      ? '<div class="cms-upload__preview"><img id="cmsImg" src="' + escapeHtml(rec.image) + '" alt="预览"></div>' +
        '<div class="cms-upload__meta" id="cmsMeta">当前图片已加载</div>'
      : '<div class="cms-upload__preview" id="cmsPrevWrap" hidden><img id="cmsImg" src="" alt="预览"></div>' +
        '<div class="cms-upload__meta" id="cmsMeta">未选择图片</div>';

    return '' +
      '<form class="cms-form" id="cmsForm" novalidate>' +
        '<h3 class="cms-form__title">' + (isEdit ? '编辑内容' : '新增内容') + '</h3>' +
        '<div class="cms-field">' +
          '<label for="cmsTitle">标题 *</label>' +
          '<input type="text" id="cmsTitle" maxlength="60" value="' + escapeHtml(rec.title || '') + '" placeholder="给这条内容起个名字">' +
          '<div class="cms-field__err" id="cmsTitleErr"></div>' +
        '</div>' +
        '<div class="cms-field">' +
          '<label for="cmsCat">分类</label>' +
          '<select id="cmsCat">' + opts + '</select>' +
        '</div>' +
        '<div class="cms-field">' +
          '<label for="cmsContent">内容</label>' +
          '<textarea id="cmsContent" placeholder="写点什么…（可选）">' + escapeHtml(rec.content || '') + '</textarea>' +
        '</div>' +
        '<div class="cms-field">' +
          '<label for="cmsFile">图片（可选，≤2MB）</label>' +
          '<input type="file" id="cmsFile" accept="image/*">' +
          preview +
        '</div>' +
        '<div class="cms-form__actions">' +
          '<button class="btn btn--ghost cms-cancel" type="button">取消</button>' +
          '<button class="btn btn--primary" type="submit">' + (isEdit ? '保存修改' : '添加内容') + '</button>' +
        '</div>' +
      '</form>';
  }

  function openAdd() {
    cmsOpenForm(formHtml(null));
    bindForm(null);
  }
  function openEdit(id) {
    var rec = null;
    for (var i = 0; i < records.length; i++) { if (records[i].id === id) { rec = records[i]; break; } }
    if (!rec) return;
    cmsOpenForm(formHtml(rec));
    bindForm(rec);
  }

  function bindForm(editing) {
    var form = $('#cmsForm');
    if (!form) return;
    var fileInput = $('#cmsFile');
    var imgEl = $('#cmsImg');
    var prevWrap = $('#cmsPrevWrap');
    var metaEl = $('#cmsMeta');
    var pendingImage = editing ? (editing.image || '') : '';

    var cancelBtn = $('.cms-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', cmsCloseForm);

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.type.indexOf('image/') !== 0) { cmsToast('请选择图片文件'); fileInput.value = ''; return; }
        if (f.size > MAX_IMG) { cmsToast('图片超过 2MB，请压缩后再传'); fileInput.value = ''; return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          pendingImage = e.target.result;
          if (imgEl) imgEl.src = pendingImage;
          if (prevWrap) prevWrap.hidden = false;
          if (metaEl) metaEl.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
        };
        reader.readAsDataURL(f);
      });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var titleEl = $('#cmsTitle');
      var title = titleEl.value.trim();
      var errEl = $('#cmsTitleErr');
      if (!errEl) errEl = null;
      if (!title) {
        if (errEl) errEl.textContent = '标题不能为空';
        if (titleEl) titleEl.focus();
        return;
      }
      var cat = $('#cmsCat') ? $('#cmsCat').value : '其他';
      var content = $('#cmsContent') ? $('#cmsContent').value : '';

      if (editing) {
        editing.title = title; editing.category = cat; editing.content = content; editing.image = pendingImage;
      } else {
        records.unshift({
          id: Date.now(),
          title: title, category: cat, content: content, image: pendingImage,
          createdAt: Date.now()
        });
      }
      saveRecords(records);
      render();
      cmsCloseForm();
      cmsToast(editing ? '已保存修改' : '已添加内容');
    });
  }

  function deleteOne(id) {
    if (!window.confirm('确定删除这条内容吗？')) return;
    records = records.filter(function (r) { return r.id !== id; });
    saveRecords(records);
    render();
    cmsToast('已删除');
  }
  function deleteSelected() {
    var ids = $all('.studio-card__check').filter(function (c) { return c.checked; })
      .map(function (c) { return Number(c.getAttribute('data-id')); });
    if (!ids.length) return;
    if (!window.confirm('确定删除选中的 ' + ids.length + ' 条内容吗？')) return;
    records = records.filter(function (r) { return ids.indexOf(r.id) === -1; });
    saveRecords(records);
    render();
    cmsToast('已删除 ' + ids.length + ' 条');
  }

  function initStudio() {
    records = loadRecords();
    render();

    var addBtn = $('#studioAdd');
    if (addBtn) addBtn.addEventListener('click', openAdd);
    var delSel = $('#studioDeleteSel');
    if (delSel) delSel.addEventListener('click', deleteSelected);

    var grid = $('#studioGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var t = e.target;
        var btn = t && t.closest ? t.closest('[data-act]') : null;
        if (!btn) return;
        var id = Number(btn.getAttribute('data-id'));
        var act = btn.getAttribute('data-act');
        if (act === 'edit') openEdit(id);
        else if (act === 'del') deleteOne(id);
      });
      grid.addEventListener('change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('studio-card__check')) syncSelection();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudio);
  } else {
    initStudio();
  }
})();

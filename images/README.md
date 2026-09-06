# 📷 图片放这里

这个文件夹用来放你的**真实照片**。

---

## 一、网站现在用的是「占位块」

你现在打开网站看到的那些斜纹方块（上面写着"你的照片""项目截图占位"），
都是**用 CSS 画出来的占位块**，不是真的图片。

这样做的好处是：就算一张照片都没放，网站也不会出现"图片裂开"的破图，
你随时可以一张一张地换成自己的照片。

---

## 二、三步换成你自己的照片

### 第 1 步：把照片放进这个文件夹

把你的照片复制进 `images` 文件夹，**文件名改成下面表格里的名字**（推荐 .jpg 格式）。

### 第 2 步：在 index.html 里找到对应的位置

用记事本 / VS Code 打开**网站根目录下的 `index.html`**，
按 `Ctrl + F` 搜索表格里写的**搜索关键词**，就能定位到那一行。

### 第 3 步：把占位块换成 `<img>`

找到长这样的代码（占位块）：

```html
<div class="ph ph--avatar">
  <svg class="ph__icon" aria-hidden="true"><use href="#i-camera"/></svg>
  <span class="ph__label">你的照片</span>
  <span class="ph__hint">images/avatar.jpg</span>
</div>
```

把它**整段删掉**，换成这一行：

```html
<img src="images/avatar.jpg" alt="我的照片">
```

保存，刷新浏览器，照片就出来了 ✅

> 💡 小技巧：`src="images/xxx.jpg"` 里的文件名，必须和你放进文件夹的名字**一模一样**
> （包括大小写），否则图片不会显示。

---

## 三、需要准备哪些照片

| 建议文件名 | 用在哪儿 | 在 index.html 里搜索 | 建议尺寸 |
|---|---|---|---|
| `avatar.jpg` | 首页右上角的大头像 | `images/avatar.jpg` | 正方形，≥ 600×600 |
| `about-me.jpg` | 「关于我」板块的照片 | `images/about-me.jpg` | 竖图，3:4，≥ 600×800 |
| `project-a.jpg` | 作品集第 1 个项目 | `images/project-a.jpg` | 横图，16:10，≥ 1200×750 |
| `project-b.jpg` | 作品集第 2 个项目 | `images/project-b.jpg` | 同上 |
| `project-c.jpg` | 作品集第 3 个项目 | `images/project-c.jpg` | 同上 |
| `project-d.jpg` | 作品集第 4 个项目 | `images/project-d.jpg` | 同上 |
| `project-1.jpg` | 首页「精选作品」第 1 个 | `images/project-1.jpg` | 横图，16:10 |
| `project-2.jpg` | 首页「精选作品」第 2 个 | `images/project-2.jpg` | 横图，16:10 |
| `project-3.jpg` | 首页「精选作品」第 3 个 | `images/project-3.jpg` | 横图，16:10 |
| `blog-1.jpg` ~ `blog-5.jpg` | 博客文章封面 | `images/blog-1.jpg` | 4:3，≥ 800×600 |
| `wechat-qr.jpg` | 联系我的微信二维码 | `images/wechat-qr.jpg` | 正方形，≥ 400×400 |
| `story-main.jpg` | 「我们的故事」大合照（心形） | `images/story-main.jpg` | 正方形，≥ 700×700 |
| `story-01.jpg` ~ `story-15.jpg` | 「我们的故事」照片墙 | `images/story-01.jpg` | 正方形，≥ 500×500 |

> ⚠️ **照片墙有 15 个格子**，但你不用一次放满 15 张。
> 没放照片的格子会保持占位块的样子，不影响美观。
> 想删掉多余格子：在 index.html 里搜索 `photo-tile`，删掉整段 `<figure class="photo-tile">...</figure>` 即可。

---

## 四、照片太大怎么办？

网站上的照片建议**单张不超过 500KB**，否则手机打开会慢。

压缩方法（选一个就行）：

1. **在线压缩**：搜索「TinyPNG」或「Squoosh」，把照片拖进去，下载压缩后的版本
2. **微信/QQ 传一遍**：发给自己再保存，会自动压缩（画质会降一些）
3. **改格式**：把 `.png` 转成 `.jpg`，体积通常能小一大半

---

## 五、常见问题

**Q：照片放好了，但网页上还是占位块？**
A：说明你只放了图片，没改 `index.html` 里的代码。一定要把占位块的 `<div class="ph ...">` 整段替换成 `<img src="...">`。

**Q：图片显示成裂开的小图标？**
A：90% 是文件名对不上。检查三件事：
1. 文件是不是真的在 `images` 文件夹里（不是 `images` 的下一层子文件夹）
2. 文件名拼写、大小写是否完全一致
3. 后缀是 `.jpg` 就写 `.jpg`，是 `.png` 就写 `.png`

**Q：照片被拉变形了？**
A：尽量用上面表格里建议的比例（头像正方形、项目截图横图）。
实在不行也没关系，稍微裁切一点点不影响观感。

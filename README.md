# 词研 · 2027 一级练习

面向 2027 CFA 一级的独立学习工具。十科各有 12 道自编三选一练习和 30 个金融词卡，共 120 题、300 词。

**[在线打开词研](https://renyue-xiao.github.io/investment-study/)**

- 练习保留英文题干和选项，提交后显示中文解析。直接看答案会记为错题，错题可只读回看或重做。题干中标下划线的术语可点开查释义并收藏。
- 词卡先显示英文词头，再揭示中文释义。选择认识或不认识后，由 FSRS 排定下次复习。词库支持英文、中文和常用缩写搜索。
- 进度使用 IndexedDB 保存在当前浏览器或网页 App。「资料与备份」可导出 JSON，导入时按题、词卡和收藏保留较新的记录。备份格式适用于本项目。应用没有账号、后端和学习数据上传。

## 在设备上使用

| 设备 | 打开方式 |
| --- | --- |
| iPhone / iPad | 用 Safari 打开在线地址，在分享菜单选「添加到主屏幕」。有「作为网页 App 打开」选项时开启。 |
| Mac | Safari 可直接使用。macOS Sonoma 14 或更新版可选「文件 → 添加到程序坞」。 |
| Android | 用 Chrome 打开在线地址，在菜单选择「安装」或「添加到主屏幕」。 |
| 其他设备 | 用支持 Service Worker 和 IndexedDB 的浏览器访问即可。 |

从桌面图标联网打开一次，等页脚显示「可离线使用」，之后可断网刷题、背词和保存进度。浏览器网页与独立网页 App 可能使用不同的存储空间，切换入口或换设备时可通过备份转移进度。浏览器清理网站数据会删除进度和离线内容。

[Apple iPhone 安装说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) · [Apple iPad 安装说明](https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados) · [Apple Mac 安装说明](https://support.apple.com/104996)

## 本地构建

需要 Node.js 22 或更新版本。构建和运行无需安装 npm 依赖。

~~~sh
npm test
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
~~~

打开 [本地测试地址](http://127.0.0.1:8080/)。构建结果在 dist 目录，可发布到启用 HTTPS 的静态网站。公开站点由本仓库的 gh-pages 分支提供，更新时发布新构建的 dist 内容。离线缓存随构建更新，现有缓存会在旧窗口关闭之后切换。

## 内容来源与贡献

考点范围和权重依据 [CFA Institute 2027 一级考纲](https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam) 和 [考纲变更说明](https://www.cfainstitute.org/about/press-room/2026/cfa-institute-announces-updates-to-cfa-program-curriculum)。题面、选项、解析和词条释义独立编写。题量用于分科练习，覆盖十科中的部分考点。词研由独立项目维护。CFA® 是 CFA Institute 的注册商标。

- 题库和词库源文件在 [content](content)。请核对题干、唯一正确选项、干扰项、解析、考点与语言后提交勘误。纠正原题时沿用题目 ID，大幅改写考点或答案时使用新 ID。
- 应用代码按 [MIT](LICENSE) 分发，自编题词按 [CC BY 4.0](content/LICENSE.md) 分发。FSRS 使用上游 ts-fsrs 5.4.2，原文件和 [MIT 许可](app/vendor/FSRS-LICENSE.txt) 随仓库保留。

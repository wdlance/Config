📄 插件最终功能清单（v5.0 – 用于代码完整还原）
一、核心能力
独立标签页运行

点击浏览器扩展图标 → 打开固定标签页 main.html（非弹窗，不自动关闭）。

页面布局：标题+规则提示，信息卡片，两个按钮（刷新数据/清空记录），下载控件区（下载按钮+进度条+状态文本+统计汇总），底部页脚。

网络请求拦截与数据捕获

通过 content-script 注入 inject-script.js，拦截 fetch 和 XMLHttpRequest。

匹配规则：

当前页面域名为 macorner.co（含 www） → 接口域名为 sh.medzt.com

当前页面域名为 wanderprints.com（含 www） → 接口域名为 ext-api.buildyou.io

额外条件：接口 URL（path+search）必须包含当前页面地址最后一段路径（window.location.pathname 按 / 分割后的最后一段）。

捕获后存储字段：url、responseBody（字符串）、lastSegment（匹配段）、timestamp、pageHost（来源域名）。后台（background.js）保留最多 50 条。

数据自动加载

打开页面后自动获取最新一条捕获数据并解析。

“刷新数据”按钮：重新获取后台最新数据，自动解析最新一条并刷新统计。

“清空记录”按钮：清空后台所有捕获数据，清空界面。

二、资源解析规则（根据 pageHost 区分）
图片资源
A. 当 pageHost 包含 macorner.co

查找 JSON 中的 clipartCategories 对象（任意嵌套）。

遍历每个分组：

分组名称：使用该分组的 title字段，若存在相同名称，则按顺序加上序号，若无title字段，则按分组顺序一次命名。

提取该分组内所有 key 字段的值（字符串且包含 /） → 放入 materials/分组名/。

提取该分组内所有 thumbnail 字段的值（字符串且包含 /） → 放入 icons/分组名/。

去重（基于 URL 字符串）。

B. 当 pageHost 包含 wanderprints.com

查找 JSON 中的 cliparts 对象（任意嵌套）。

分组规则：

递归遍历整个 JSON中的cliparts对象，收集所有 path 字段的值。

每个 path 所在对象及其父级对象中查找 categoryId 字段。

若同一 categoryId 下有多个 path，则归入同一分组。

若找不到 categoryId，归入根目录。

分组名称 = categoryId 值。

递归遍历整个 JSON中的customizationForm对象中的elements，在其中收集所有thumbnailPath字段的值。

每个thumbnailPath 所在对象及其父级对象中查找 label 字段。

若同一 label 下有多个 path，则归入同一分组。

若找不到 label，归入根目录。

分组名称 = label 值。

存储规则：

path 字段的图片 → materials/分组名/

thumbnailPath 字段的图片 → icons/分组名/

去重（基于 URL 字符串）。

C. 全量图片字段提取（适用于所有域名）

递归遍历整个 JSON，查找所有以 .jpg/.jpeg/.png/.gif/.webp/.svg/.bmp 结尾且包含 / 的字符串值。

排除步骤 A/B 中已捕获的图片 URL。

分类规则：

字段名（key）包含 thumbnail（不区分大小写） → 放入 icons/ 根目录。

其他字段 → 放入 materials/ 根目录。

图片前缀：

macorner.co → https://assets.medzt.com/

wanderprints.com → https://assets.buildyou.io/

将原 JSON 中的相对路径（例如 /path/image.png）拼接前缀得到完整 URL。

字体资源
A. 当 pageHost 包含 wanderprints.com

递归遍历 JSON，查找所有 fontPath 字段（值非空字符串）。

将该值拼接前缀后作为字体 URL。

忽略 URL 本身的扩展名，保存时统一强制为 .ttf。

B. 其他域名（包括 macorner.co）

递归遍历 JSON，查找所有以 .ttf/.otf/.woff/.woff2/.eot 结尾且包含 / 的字符串值。

拼接前缀后作为字体 URL。

保存时统一强制为 .ttf。

字体保存：所有字体文件下载后放入 fonts/ 根目录，字体名称保持JSON里面的名称。

三、下载与打包
目录结构（ZIP 内）

materials/分组名/（来自分组规则中的 key / path 图片）

icons/分组名/（来自分组规则中的 thumbnail / previewPath 图片）

materials/（全量图片中非 thumbnail 字段）

icons/（全量图片中字段名包含 thumbnail）

fonts/（所有字体文件）

文件命名

顺序稳定性：每个目录内的图片文件按照 JSON 解析时的原始出现顺序命名（即从原始 JSON 中读取到的顺序，而非下载完成顺序）。

图片文件统一使用 .png 扩展名：1.png、2.png……（实际内容不改变）。

字体文件统一使用 .ttf 扩展名：名称保持JSON里面的值变，后缀统一用.ttf。

去重

基于文件二进制内容计算 SHA-256 哈希。

相同哈希的文件只保存一份，且保留其在原始顺序中 首次出现的位置索引，最终按该索引排序命名。

并发下载

同时最多 6 个请求。

进度反馈

显示“下载并去重: X/总数 (百分比%)”。

完成后显示“生成 ZIP 文件中...”，最后保存为 resources\_时间戳.zip。

四、时间限制机制
时间格式："YYYY-MM-DD HH:MM:SS"（北京时间），硬编码为 "2026-05-14 14:00:00"。

每次执行“刷新数据”、“清空记录”、“下载所有图片”前检查当前时间是否超过截止时间。

若已过期：弹出警告“插件已超过使用期限，功能已被限制。”，阻止操作，并禁用所有按钮，显示红色提示信息。

五、界面元素（main.html）
头部：标题“精准图片工厂”，双行规则提示（显示两个域名的映射关系）。

信息卡片：显示数据来源域名和图片前缀。

两个按钮：

🔍 刷新数据

🗑️ 清空记录

下载控件区（始终可见）：

📥 下载所有图片 (ZIP) 按钮

进度条（<div class="progress-bar">）

状态文本（<div id="downloadStatus">）

统计汇总区（<div id="summaryArea">）显示分组图片数、其他图片数、字体数、总计资源数。

页脚：独立标签页提示 + 下载说明（统一为 .ttf/.png 命名，按解析顺序）。

六、依赖库与文件
必须放入扩展根目录：

jszip.min.js（版本 3.10.1）

FileSaver.min.js（版本 2.0.5）

其他文件（需提供完整代码）：

manifest.json（Manifest V3）

background.js

content-script.js

inject-script.js

main.html

main.js

七、关键代码约定
通信：background.js 维护 capturedApis 数组，响应 GET_CAPTURED_DATA 和 CLEAR_DATA 消息。

拦截器：inject-script.js 捕获请求后发送 pageHost 字段。

解析：main.js 中的 processData 根据 pageHost 选择不同的分组提取函数（extractMacornerGroups / extractWanderprintsGroups）和字体提取函数（extractWanderprintsFonts / extractGenericFonts）。

稳定顺序：在 downloadAllImages 中预先为每个资源分配 originalIndex（基于解析时的顺序），去重时保留最小索引，最后按索引排序生成文件名。

八、辅助工具（混淆脚本）
提供 obfuscate.bat 脚本，功能：

将原始 JS 文件备份到 backup\_时间戳 目录。
使用 javascript-obfuscator 和 obfuscator-config.json 混淆文件，输出到 obfuscated_output 目录（不覆盖原文件）。
文件名保持不变，方便手动替换。

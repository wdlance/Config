# Font Capture Chrome Extension - 详细需求文档

## 1. 项目概述

### 1.1 项目名称
Font Capture - 字体文件抓取 Chrome 扩展插件

### 1.2 项目目标
开发一个 Google Chrome 浏览器扩展插件，支持三种模式检测和抓取网页字体文件，以及全局搜索引擎工具检测：
- **模式1**: 检测 CSS @font-face 规则中内嵌的 Base64 字体数据 URI，仅提取 TTF 格式，执行版权信息去除和重命名
- **模式2**: 拦截网络字体请求（assets.buildyou.io），支持所有字体格式，TTF 格式执行版权去除和重命名
- **模式3**: 拦截网络字体请求（assets.medzt.com），支持所有字体格式，TTF 格式执行版权去除和重命名
- **搜索引擎工具检测（全局功能）**: 适用于所有网页，自动检测当前网站使用的搜索/筛选引擎工具

模式与网站映射可配置（`mode_config.js`），不同模式逻辑分别写在独立文件中。搜索引擎工具检测为独立全局功能，不受模式限制，适用于所有网页。

### 1.3 目标网站
- **模式1 (CSS扫描)**:
  - https://www.wrappiness.co/
  - https://trendingcustom.com/
- **模式2 (网络字体拦截 - BuildYou)**:
  - https://wanderprints.com/
- **模式3 (网络字体拦截 - Medzt)**:
  - https://macorner.co/
- 字体扫描适用于以上网站及任何包含内嵌字体数据的网页
- 搜索引擎工具检测适用于所有网页（不限目标网站、不限电商平台、不限网站类型）

---

## 2. 功能需求

### 2.1 核心功能

#### 2.1.1 字体数据检测与提取
- **扫描范围**: 扫描当前页面所有 CSS 样式规则（包括 `<style>` 标签内嵌样式和外部样式表，以及 `@import` 规则嵌套的样式）
- **匹配规则**: 检测所有以 `data:` 开头、包含 `;base64,` 标记的字体数据 URI，**强制约束前缀为** `data:application/octet-stream;base64,`
- **提取内容**: 从 CSS `@font-face` 规则中提取以下信息:
  - 字体名称 (`font-family` 属性值)
  - 字体格式（通过二进制文件头 Magic Bytes 检测确定，详见 2.1.4）
  - Base64 编码数据（去掉 `data:` 前缀和 `;base64,` 标记后的纯 Base64 字符串，需去除空白字符）
  - 字体权重 (`font-weight` 属性值，如有)
  - 字体样式 (`font-style` 属性值，如有)

#### 2.1.2 字体格式过滤（可配置）
- **按模式配置格式过滤**: 每种模式通过 `mode_config.js` 中的 `allowedFormats` 数组配置允许显示的字体格式
  - 模式1: `allowedFormats: ['ttf']` — 仅显示 TTF 格式（原有行为）
  - 模式2: `allowedFormats: ['ttf', 'otf', 'woff', 'woff2']` — 显示所有常见字体格式
  - 模式3: `allowedFormats: ['ttf', 'otf', 'woff', 'woff2']` — 显示所有常见字体格式
- **过滤时机**: 在 deduplication（去重）之前执行格式过滤
- **过滤逻辑**: `!MODE_CONFIG[currentMode].allowedFormats.includes(f.format)` → 排除
- **TTF 处理规则**: 无论哪种模式，TTF 格式字体均执行版权去除和重命名；非 TTF 格式直接下载

#### 2.1.3 字体版权去除与重命名处理
- **处理时机**: 用户点击下载按钮时，在 background.js 中对 TTF 字体执行处理
- **处理模块**: `fontProcessor.js`，通过 `importScripts('fontProcessor.js')` 在 Manifest V3 service worker 中加载
- **处理内容**:
  1. 解码 Base64 数据为 Uint8Array 二进制数据
  2. 解析 TTF 二进制中的 `name` 表（name table），提取所有命名记录
  3. 删除指定 nameID 的版权/标识记录（详见 2.1.3.1）
  4. 对保留的 nameID 记录执行重命名（详见 2.1.3.2）
  5. 构建新的 name table 二进制数据
  6. 重建完整的 TTF 字体二进制（替换 name table，重新计算偏移量、4字节对齐、更新 checksum）
  7. 将处理后的二进制数据编码为 Base64，用于下载

##### 2.1.3.1 删除的 nameID（版权/标识信息）
根据 FontUtil.java 逻辑，以下 nameID 的记录全部删除：

| nameID | 含义 | 处理 |
|--------|------|------|
| 0 | Copyright Notice | **删除** |
| 7 | Trademark | **删除** |
| 8 | Manufacturer | **删除** |
| 9 | Designer | **删除** |
| 10 | Description | **删除** |
| 11 | URL Vendor | **删除** |
| 12 | URL Designer | **删除** |
| 13 | License Description | **删除** |
| 14 | License Info URL | **删除** |
| 15 | Reserved | **删除** |
| 16 | Typographic Family Name | **删除** |
| 17 | Typographic Subfamily Name | **删除** |
| 18 | Compatible Full | **删除** |

##### 2.1.3.2 保留并重命名的 nameID
删除后保留的 nameID 记录，按以下规则重命名（newFontName 为随机生成的字体名）：

| nameID | 含义 | 新值 |
|--------|------|------|
| 1 | Font Family Name | `newFontName` |
| 2 | Font Subfamily Name | `"Regular"` |
| 3 | Unique ID | `newFontName + ": 2025"` |
| 4 | Full Font Name | `newFontName` |
| 5 | Version | `"Version 1.000"` |
| 6 | PostScript Name | `newFontName` |
| 其他 | — | 保持原值不变 |

##### 2.1.3.3 随机字体名生成规则
- 函数: `generateNewFontName(min, max)`，默认参数 `min=6, max=12`
- 首字符: 大写字母 A-Z（ASCII 65-90）
- 后续字符: 小写字母 a-z（ASCII 97-122）
- 长度: 随机 6-12 位
- 示例: `Kqwmzhy`, `Hdrtxpbjk`, `Znbcfkyqwtu`

##### 2.1.3.4 字体二进制重建规则
- 新 name table 替换原 name table，保持其他所有表不变
- 所有表的偏移量重新计算（按目录表顺序排列，4字节对齐）
- name table 的 checksum 重新计算
- 其他表的 checksum 保持原值
- sfVersion、numTables、searchRange、entrySelector、rangeShift 保持原值

#### 2.1.4 字体格式检测策略

由于强制约束前缀使用 `application/octet-stream`（通用二进制 MIME 类型），无法直接从 MIME 类型推断字体格式，需采用以下策略：

**优先级顺序：**

1. **二进制文件头 Magic Bytes 检测**（最可靠，反映实际文件格式）
   - WOFF: 前 4 字节为 `0x774F4646` (`wOFF`)
   - WOFF2: 前 4 字节为 `0x774F4632` (`wOF2`)
   - TrueType/TTF: 前 4 字节为 `0x00010000` 或 `0x74727565` (`true`)
   - OpenType/OTF: 前 4 字节为 `0x4F54544F` (`OTTO`)

2. **@font-face 整个块中的 `format()` 提示**（CSS声明，可能与实际格式不符）
   - 注意: 使用整个 @font-face 块文本进行检测，而非仅 src 属性值（src 值可能被截断）
   - 例: `@font-face { src: url(data:...) format("woff"); }` → 从 block 中提取 format()
   - 映射: `"woff"` → woff, `"woff2"` → woff2, `"truetype"` → ttf, `"opentype"` → otf, `"embedded-opentype"` → eot, `"svg"` → svg

3. **MIME 类型推断**（仅对非 `octet-stream` 类型有效）
   - `application/x-font-woff` → woff
   - `application/x-font-ttf` → ttf
   - `font/woff2` → woff2, `font/woff` → woff, `font/ttf` → ttf, `font/opentype` → otf, `font/sfnt` → sfnt

4. **兜底默认值**: 当以上方法均无法确定时，默认为 `.woff`

#### 2.1.5 字体文件下载
- 支持单个字体文件下载
- 支持批量下载所有检测到的字体文件（仅下载未成功和未失败的项）
- **下载方式**: 使用 Data URI 方式下载（`data:{mimeType};base64,{base64Data}`），**不使用 Blob/ObjectURL**（Manifest V3 service worker 中无 DOM API）
- **文件命名规则（TTF 字体）**: `{newFontName}-{weight}{style}.ttf`
  - newFontName 为随机生成的字体名
  - weight 默认 `400`，style 默认 `normal`
  - 示例: `Kqwmzhy-400normal.ttf`
- **文件命名规则（非 TTF 字体）**: `{safeOriginalName}-{weight}{style}.{format}`
  - safeOriginalName 为字体名经 `[^a-zA-Z0-9_-]` 替换为 `_` 后的结果
  - 示例: `Valentine_Delight-400normal.otf`
- 下载时触发浏览器原生下载行为（使用 `chrome.downloads.download` API，`saveAs: false`）

#### 2.1.6 模式2 - 网络字体拦截 (BuildYou)
- **适用网站**: wanderprints.com 及其子域名
- **字体URL前缀**: `https://assets.buildyou.io`
- **检测机制**: 通过注入内容脚本，使用 Performance API (`performance.getEntriesByType('resource')`) 检测已加载的字体资源 URL
- **三重过滤规则**（严格执行，防止抓取到非目标字体资源）:
  1. **initiatorType 过滤**: 仅捕获 `initiatorType === 'fetch'` 或 `initiatorType === 'xmlhttprequest'` 的资源条目，排除 CSS @font-face 直接加载的网站UI字体
  2. **URL 路径过滤**: 仅捕获 URL 路径中包含 `/fonts/` 的资源，排除非字体资源（CSS、图片等）
  3. **URL 扩展名过滤**: 仅捕获 URL 扩展名为 `.ttf`、`.otf`、`.woff`、`.woff2` 或 `.undefined` 的资源，排除其他文件类型
  - 过滤顺序: initiatorType → URL路径 → URL扩展名（依次过滤，任何一层不满足即排除）
  - 配置位置: `mode_config.js` 中 MODE_CONFIG[2] 的 `initiatorTypes`、`pathFilter`、`extensionFilter` 字段
- **检测时机**: Popup 打开时注入扫描函数，Performance API 返回所有已加载的资源条目，经三重过滤后仅保留 fetch/XHR 加载的字体文件 URL
- **数据处理流程**: Popup 获取过滤后的字体 URL 列表 → 发送 `fetchFontUrls` 消息给 Background → Background 逐个 fetch URL → 获取二进制数据 → 检测格式 (Magic Bytes → URL扩展名 → 配置兜底) → 转 Base64 → 返回字体数据对象列表
- **格式检测**: 
  - 优先级1: Magic Bytes (二进制文件头检测，最可靠)
  - 优先级2: URL 扩展名 (.ttf/.otf/.woff/.woff2)
  - 优先级3: 配置兜底 (模式2默认 'ttf')
  - 注意: 模式2 URL 可能以 `.undefined` 结尾，需依赖 Magic Bytes 或兜底值
- **字体名称提取**: 从 URL 路径提取文件名（去除扩展名），例如 `22fab390-7e74-4dd9-9d84-9bcee3b7a74c`
- **格式过滤**: 显示所有常见字体格式 (TTF/OTF/WOFF/WOFF2)

#### 2.1.7 模式3 - 网络字体拦截 (Medzt)
- **适用网站**: macorner.co 及其子域名
- **字体URL前缀**: `https://assets.medzt.com/`
- **检测机制**: 同模式2，使用 Performance API 检测已加载的字体资源 URL
- **三重过滤规则**: 同模式2，严格执行 initiatorType → URL路径 → URL扩展名 过滤
  1. **initiatorType 过滤**: 仅捕获 fetch/xmlhttprequest（排除 CSS 加载的网站UI字体）
  2. **URL 路径过滤**: 仅捕获路径包含 `/fonts/` 的资源
  3. **URL 扩展名过滤**: 仅捕获 `.ttf`/`.otf`/`.woff`/`.woff2`/`.undefined` 扩展名
  - 配置位置: `mode_config.js` 中 MODE_CONFIG[3] 的 `initiatorTypes`、`pathFilter`、`extensionFilter` 字段
- **数据处理流程**: 同模式2 (Popup 获取URL → Background fetch → 格式检测 → 返回数据)
- **格式检测**: 同模式2优先级，但兜底默认 'otf'
- **字体名称提取**: 同模式2，例如 `a7M4JzNKKb__valentine-delight` → `a7M4JzNKKb-valentine-delight`
- **格式过滤**: 显示所有常见字体格式 (TTF/OTF/WOFF/WOFF2)
- **样例URL**: `https://assets.medzt.com/fonts/2026/03/22/a7M4JzNKKb__valentine-delight.otf`

#### 2.1.8 模式配置系统
- **配置文件**: `mode_config.js`
- **配置内容**: 模式编号 → { name, hostPatterns, urlPrefix (模式2/3), allowedFormats, scanType, formatFallback (模式2/3), initiatorTypes (模式2/3), pathFilter (模式2/3), extensionFilter (模式2/3) }
- **新增过滤配置字段**:
  - `initiatorTypes`: 允许的 initiatorType 数组，默认 `['fetch', 'xmlhttprequest']`，仅捕获 JavaScript 发起的请求
  - `pathFilter`: URL 路径必须包含的字符串，默认 `/fonts/`，排除非字体路径的资源
  - `extensionFilter`: 允许的 URL 扩展名数组，默认 `['ttf', 'otf', 'woff', 'woff2', 'undefined']`，排除非字体文件类型
- **模式检测函数**: `determineMode(url)` — 根据 URL hostname 匹配 hostPatterns，返回模式编号
- **子域名匹配**: 支持精确匹配和子域名后缀匹配 (hostname.endsWith('.' + pattern))
- **默认模式**: 无法匹配任何 hostPatterns 时，默认为模式1 (CSS扫描)
- **可配置性**: 新增网站只需在 MODE_CONFIG 中添加 hostPatterns 条目，无需修改其他代码；过滤规则也可按模式单独配置

#### 2.1.9 搜索引擎工具检测（全局功能，基于 DOM 检测）
- **功能**: 自动检测当前网站使用的搜索/筛选引擎工具，并在 Popup 中显示
- **适用范围**: **所有网页**（不限目标网站、不限电商平台、不限网站类型）。字体扫描按模式区分网站，但搜索引擎工具检测是全局独立功能，在任何网页上均执行检测
- **检测方法**: 通过检查页面 DOM 元素（script/link 标签的 src/href、内联脚本内容、window 全局变量）来判断搜索工具，不依赖 Performance API，不依赖外部数据文件
- **检测时机**: Popup 打开时，与字体扫描同时进行（独立模块，不受模式影响）
- **检测优先级**: Level A (script/link src) > Level B (inline 内容) > Level C (window 变量) > Level D (Shopify 原生)
- **核心优势**: 搜索工具的 SDK 脚本在页面加载时即注入 DOM，不依赖用户是否执行搜索操作

##### 2.1.9.1 检测数据结构

每个已知搜索工具定义三个维度的检测规则：

```
SEARCH_TOOL_RULES = [
  {
    name: '搜索工具名称',
    srcPatterns: ['脚本/样式 URL 中应包含的关键词'],
    contentPatterns: ['内联脚本文本中应包含的关键词'],
    globalVars: ['window 上应存在的全局变量名']
  },
  ...
]
```

- **srcPatterns**: 检查 `<script src>` 和 `<link href>` 的 URL 是否包含关键词（小写比较，使用 `url.includes(pattern)`）
- **contentPatterns**: 检查 `<script>` (无 src 属性) 的 textContent 是否包含关键词（小写比较）
- **globalVars**: 检查 `window` 对象上是否存在指定变量名（使用 `window[varName] !== undefined`）
- **关键词选择**: 使用短关键词而非完整域名（如 `searchanise` 而非 `searchanise.com`），更灵活地覆盖子域名和不同 TLD

完整规则表:

| 工具名称 | srcPatterns | contentPatterns | globalVars |
|---------|-------------|-----------------|------------|
| Searchanise Search & Filter | searchanise, searchserverapi | Searchanise | Searchanise |
| Boost Product Filter & Search | boostcommerce, mybcapps, boost-pfs | BoostPFS | BoostPFS |
| Algolia AI Search & Discovery | algolia, algoliasearch | algoliasearch, instantsearch | algoliasearch |
| Fast Simon (InstantSearch+) | fastsimon, instantsearchplus | FastSimon | FastSimon |
| Klevu | klevu, ksearchnet | klevu_js | klevu |
| Doofinder Search & Discovery | doofinder | doofinder | doofinder |
| Searchspring | searchspring | SearchSpring | SearchSpring |
| Nosto / Nosto AI Search & Discovery | nosto | nosto | nosto |
| Findify Search & Merchandise | findify | Findify | Findify |
| Sparq Product Filter & Search | sparq, searchatap | Sparq | — |
| Wizzy AI Search & Filter | wizzy | Wizzy | Wizzy |
| Search & Discovery - AI / Expertrec | expertrec | expertrec | — |
| Okas Live Search & Filter | okasconcepts | Okas | — |
| Omega Instant Search | omegacommerce, mirasvit | OmegaInstantSearch | — |

> 注: globalVars 为 "—" 表示该工具不一定在 window 上注册全局变量，依赖 srcPatterns 和 contentPatterns 检测。

##### 2.1.9.2 检测流程（四级优先）

**Level A — Script/Link src/href 匹配**（最高优先级，最可靠）
1. 获取 `document.querySelectorAll('script[src]')` 和 `document.querySelectorAll('link[href]')`
2. 对每个元素的 `.src` 或 `.href`（转小写），检查是否包含任一工具的任一 srcPatterns
3. 匹配 → 返回该工具名称，**立即停止检测**

**Level B — Inline 脚本内容匹配**（Level A 无结果时）
1. 获取 `document.querySelectorAll('script:not([src])')`
2. 对每个元素的 `.textContent`（转小写），检查是否包含任一工具的任一 contentPatterns
3. 匹配 → 返回该工具名称，**立即停止检测**

**Level C — Window 全局变量匹配**（Level A+B 无结果时）
1. 对每个工具的 globalVars，检查 `window[varName] !== undefined`
2. 存在 → 返回该工具名称，**立即停止检测**

**Level D — Shopify 原生搜索**（以上均无结果时）
1. 检查 `window.Shopify !== undefined` → 确认是 Shopify 网站
2. 检查 `document.querySelectorAll('form[action*="/search"]').length > 0` → 存在搜索表单
3. 以上 Level A/B/C 均未匹配第三方工具 → 该网站未使用第三方搜索
4. 三个条件同时满足 → "Shopify 官方 Search & Discovery"

**未检测到**: 以上所有 Level 均无匹配 → "未检测到"

> 不设"其它"类别。纯 DOM 方式下通用搜索关键词太泛化，容易误判。宁可显示"未检测到"也不误报。

##### 2.1.9.3 检测结果展示
- **展示位置**: Popup 弹窗顶部区域，在 header 下方显示
- **展示格式**: `搜索引擎: {工具名称}`
- **展示时机**: 字体扫描结果之前（检测快速，可立即显示）
- **展示示例**:
  - `搜索引擎: Searchanise Search & Filter` (script src 包含 searchanise/searchserverapi)
  - `搜索引擎: Algolia AI Search & Discovery` (script src 包含 algolia/algoliasearch)
  - `搜索引擎: Shopify 官方 Search & Discovery` (window.Shopify + form[action="/search"])
  - `搜索引擎: 未检测到` (四级检测均无匹配)

##### 2.1.9.4 模块架构
- **检测模块**: `search_detector.js`，独立文件
- **数据来源**: 检测规则直接定义在 `search_detector.js` 的 `detectSearchTool` 函数体内（SEARCH_TOOL_RULES 常量），不依赖外部数据文件
- **加载方式**: popup.html 通过 `<script src="search_detector.js">` 加载
- **检测函数**: `detectSearchTool()` — 注入到页面上下文，检查 DOM 元素和 window 对象
- **与字体扫描的关系**: 独立功能，不影响字体扫描流程，两者并行执行。搜索引擎检测不受模式限制，在任何网页上均执行
- **重要约束**: 所有常量（SEARCH_TOOL_RULES）必须定义在 `detectSearchTool` 函数体内部，因为 `chrome.scripting.executeScript` 仅序列化函数体，不序列化模块级变量
- **新增工具**: 直接在 SEARCH_TOOL_RULES 数组中添加规则对象（name + srcPatterns + contentPatterns + globalVars），无需修改检测逻辑

### 3.1 不可变更约束
1. **数据 URI 强制约束前缀**: `data:application/octet-stream;base64,`
   - 插件必须精确匹配并优先处理此前缀
   - 结构: `data:` + `application/octet-stream` + `;base64,` + `Base64编码数据`
   - 无 `charset` 参数，比之前的前缀更简洁

2. **兼容旧前缀**: 其他 MIME 类型的数据 URI 也需支持检测
   - `data:application/x-font-woff;charset=utf-8;base64,...`
   - `data:font/woff2;base64,...` 等

3. **技术栈不可变更**: HTML + JavaScript，不得引入 React/Vue/Angular 等框架

4. **Manifest 版本**: 必须使用 Manifest V3（Google Chrome 最新扩展标准）

5. **字体格式过滤按模式配置**: 模式1仅显示 TTF；模式2/3显示所有常见字体格式 (TTF/OTF/WOFF/WOFF2)，通过 `mode_config.js` 的 `allowedFormats` 配置

6. **网络字体三重过滤（模式2/3强制约束）**: 必须严格执行 initiatorType + URL路径 + URL扩展名 三重过滤，防止抓取到网站UI字体和其他非目标资源：
   - initiatorType 过滤: 仅 `fetch`/`xmlhttprequest`，排除 CSS 加载
   - URL 路径过滤: 仅 `/fonts/` 路径，排除非字体资源
   - URL 扩展名过滤: 仅 `.ttf/.otf/.woff/.woff2/.undefined`，排除非字体文件
   - 过滤规则配置化于 `mode_config.js`

6. **版权去除与重命名**: 所有下载的 TTF 字体必须经过 name table 处理（删除版权信息 + 随机重命名），完全参照 FontUtil.java 的实现逻辑

7. **下载方式**: 必须使用 Data URI 方式，不得使用 Blob/ObjectURL（Manifest V3 service worker 限制）

### 3.2 兼容性约束
- 目标 Chrome 版本: 与 `I:\chrome-win64 (1)` 目录下的 Chrome 版本兼容
- 需支持跨域样式表访问（使用 `chrome.scripting.executeScript` 注入扫描函数，通过 background.js `fetch` 获取跨域 CSS）

---

## 4. 数据 URI 格式规范

### 4.1 新前缀格式（强制约束）
```
data:application/octet-stream;base64,AAEAAAASAQAABAA...
```
- **前缀**: `data:application/octet-stream;base64,`
- **特征**: 无 `charset` 参数，MIME 类型为通用二进制
- **提取逻辑**:
  1. 检测字符串是否以 `data:application/octet-stream` 开头
  2. 定位 `;base64,` 标记
  3. 提取 `;base64,` 之后的所有内容作为纯 Base64 数据
  4. **去除 Base64 数据中的空白字符** (`replace(/\s/g, '')`)

### 4.2 旧前缀格式（兼容支持）
```
data:application/x-font-woff;charset=utf-8;base64,d09GRgABAAAAAAScAA0...
```

### 4.3 其他兼容格式
- `data:font/woff2;base64,...`
- `data:font/woff;base64,...`
- `data:application/x-font-ttf;base64,...`
- `data:application/x-font-opentype;base64,...`
- `data:font/ttf;base64,...`
- `data:font/opentype;base64,...`
- `data:font/sfnt;base64,...`

### 4.4 正则表达式设计
需匹配所有格式，核心正则:
```
data:(application/octet-stream|application/x-font-woff|application/x-font-ttf|application/x-font-opentype|font/woff2|font/woff|font/ttf|font/opentype|font/sfnt)(?:;[^;]+)*;base64,[a-zA-Z0-9+\/=]+
```
- `(?:;[^;]+)*` 匹配 `;charset=utf-8` 等可选参数
- `[a-zA-Z0-9+\/=]+` 匹配 Base64 编码数据

### 4.5 CSS 注释预处理
在解析 CSS 中的 @font-face 规则前，需先去除 CSS 注释：
```
cssText.replace(/\/\*[\s\S]*?\*\//g, '')
```
防止注释中的 `}` 等字符干扰 `[^}]+` 正则匹配。

### 4.6 字体数据传输格式（内部消息）

#### 扫描结果消息
```json
{
  "fonts": [
    {
      "name": "FontFamilyName",
      "format": "ttf",
      "weight": "400",
      "style": "normal",
      "base64Data": "AAEAAAASAQAABAA...",
      "sizeBytes": 1234,
      "sizeKB": 1.21
    }
  ],
  "crossOriginHrefs": ["https://cdn.example.com/styles.css"]
}
```

#### 下载请求消息
```json
{
  "type": "downloadFont",
  "base64Data": "AAEAAAASAQAABAA...",
  "format": "ttf",
  "filename": "OriginalFont-400normal.ttf",
  "weight": "400",
  "style": "normal"
}
```

#### 跨域 CSS 获取消息
```json
{
  "type": "fetchCrossOriginCss",
  "hrefs": ["https://cdn.example.com/styles.css"]
}
```

#### 网络字体 URL 获取消息 (模式2/3)
```json
{
  "type": "fetchFontUrls",
  "urls": ["https://assets.buildyou.io/library/fonts/22fab390-..."],
  "mode": 2
}
```

Background 返回:
```json
{
  "fonts": [
    {
      "name": "22fab390-7e74-4dd9-9d84-9bcee3b7a74c",
      "format": "ttf",
      "weight": "",
      "style": "",
      "base64Data": "AAEAAAASAQAABAA...",
      "sizeBytes": 1234,
      "sizeKB": 1.21,
      "url": "https://assets.buildyou.io/library/fonts/22fab390-..."
    }
  ]
}
```

#### 字体数据对象 (所有模式通用)
模式2/3的字体数据对象额外包含 `url` 字段（原始请求URL），其余字段与模式1相同。

---

## 5. 详细处理流程

### 5.1 字体提取流程（模式1 - CSS扫描）
```
用户点击插件图标
  → Popup 打开，determineMode(url) → 模式1
  → Popup 向当前标签页注入扫描函数（chrome.scripting.executeScript）
  → 扫描函数执行（scanAccessibleStyles，运行在页面上下文中）：
    → 遍历 document.styleSheets
      → 对每个 styleSheet 遍历 cssRules（extractFromRules 递归处理）
        → 识别 @font-face 规则（CSSRule.FONT_FACE_RULE）
          → 解析 src 属性，检测 data: URI
            → 提取 font-family、weight、style、Base64 数据
            → 使用 determineFormat 检测字体格式（Magic Bytes 优先）
        → 识别 @media 规则（CSSRule.MEDIA_RULE）→ 递归进入 cssRules
        → 识别 @import 规则（CSSRule.IMPORT_RULE）→ 递归进入 styleSheet.cssRules
      → 跨域样式表: 捕获 SecurityError，收集 href 列表
    → 遍历 inline <style> 元素 textContent
      → 去除 CSS 注释（replace(/\/\*[\s\S]*?\*\//g, '')）
      → 去除换行（replace(/[\r\n]/g, '')）
      → 文本方式解析 @font-face 规则（正则: /@font-face\s*\{([^}]+)\}/gi）
      → 提取 font-family、weight、style、data URI
  → Popup 收集同源扫描结果 + 跨域 href 列表
  → 如有跨域样式表 href，发送给 Background Script（fetchCrossOriginCss 消息）
  → Background Script 逐个 fetch CSS 文件，调用 parseCssForFonts 解析
  → 合并所有结果 → renderFonts 渲染字体列表
    → 过滤: 仅保留 allowedFormats 配置的格式（模式1: 仅TTF）
    → 去重: 基于 base64Data 内容去重（Set）
    → 显示: 字体名称、格式标签、大小、权重+样式、下载按钮
    → 重复名称: 添加序号后缀（FontName-1, FontName-2）
```

### 5.1b 字体提取流程（模式2/3 - 网络字体拦截）
```
用户点击插件图标
  → Popup 打开，determineMode(url) → 模式2 或 模式3
  → Popup 获取对应模式的 urlPrefix 和过滤配置 (从 MODE_CONFIG)
  → Popup 注入扫描函数到页面上下文 (chrome.scripting.executeScript):
    → 模式2: scanBuildyouFonts(urlPrefix, initiatorTypes, pathFilter, extensionFilter)
    → 模式3: scanMedztFonts(urlPrefix, initiatorTypes, pathFilter, extensionFilter)
  → 扫描函数执行（运行在页面上下文中）：
    → performance.getEntriesByType('resource')
    → 三重过滤:
      1. initiatorType 过滤: entry.initiatorType ∈ initiatorTypes (仅 fetch/xmlhttprequest)
      2. URL 路径过滤: entry.name 包含 pathFilter (如 /fonts/)
      3. URL 扩展名过滤: URL 扩展名 ∈ extensionFilter (如 .ttf/.otf/.woff/.woff2/.undefined)
    → 过滤顺序: initiatorType → 路径 → 扩展名（任何一层不满足即排除）
    → 返回 { fontUrls: [...] } (过滤后的URL字符串数组)
  → Popup 接收扫描结果 (fontUrls 数组)
  → 如 fontUrls 为空: renderFonts([]) → 显示空状态
  → 如 fontUrls 不为空:
    → statusEl.textContent = '获取字体文件...'
    → Popup 发送 fetchFontUrls 消息给 Background Script: { type: 'fetchFontUrls', urls: fontUrls, mode: 2/3 }
    → Background Script 逐个 fetch URL:
      → fetch(url) → arrayBuffer → Uint8Array
      → 格式检测: detectFormatByMagicBytesBinary(bytes) → detectFormatByUrlExtension(url) → MODE_CONFIG[mode].formatFallback
      → uint8ArrayToBase64(bytes) → base64Data
      → deriveFontNameFromUrl(url) → name
      → 构造字体数据对象: { name, format, weight:'', style:'', base64Data, sizeBytes, sizeKB, url }
      → 异常: .catch() 记录日志，跳过该 URL
    → 全部完成后 sendResponse({ fonts: allFonts })
  → Popup 接收 { fonts } → renderFonts 渲染字体列表
    → 过滤: 仅保留 allowedFormats 配置的格式（模式2/3: 所有常见格式）
    → 去重: 基于 base64Data 内容去重（Set）
    → 显示: 字体名称、格式标签、大小、下载按钮
```

### 5.2 字体格式检测流程
```
提取到 data: URI 和 Base64 数据后
  → Step 1: 解码 Base64 前 4 字节，检测 Magic Bytes（最可靠，反映实际格式）
    → 0x774F4646 → WOFF
    → 0x774F4632 → WOFF2
    → 0x00010000 → TrueType (TTF)
    → 0x74727565 → TrueType (TTF, Apple variant)
    → 0x4F54544F → OpenType (OTF)
  → Step 2 (无 Magic Bytes 时): 检查 @font-face 整个块中的 format() 提示
    → 注意: 使用完整 @font-face block 文本而非截断的 src 值
    → format("woff") → woff, format("truetype") → ttf 等
  → Step 3 (仍无法确定时): 使用 MIME 类型推断
    → application/octet-stream → 兜底默认 woff（此步无意义）
    → application/x-font-woff → woff, font/ttf → ttf 等
  → Step 4: 兜底 → woff
```

### 5.3 TTF 字体下载与处理流程
```
用户点击"下载"按钮
  → Popup 调用 downloadFont(idx, btnEl)
  → Popup 构造消息: { type: "downloadFont", base64Data, format, filename, weight, style }
  → Popup 发送 chrome.runtime.sendMessage 给 Background Script

  → Background Script 收到 downloadFont 消息
  → if format === 'ttf':
    → base64ToUint8Array(base64Data) → fontBytes
    → generateNewFontName(6, 12) → newFontName (随机 6-12 位，首字母大写)
    → processTtfFont(fontBytes, newFontName):
      → parseTtfNameTable(fontBytes) → parsed (解析 name table)
        → 验证 sfVersion (0x00010000 或 0x74727565)
        → 遍历 offset table 找到 'name' 表
        → 解析 name table header: format, count, stringOffset
        → 遍历 name records: 提取 platformID, encodingID, languageID, nameID, length, strOff
        → 解码字符串: platformID 3 → UTF-16BE, 其他 → ASCII
      → buildModifiedNameTable(parsed, newFontName, originalFontBytes):
        → 过滤: 删除 nameID {0,7,8,9,10,11,12,13,14,15,16,17,18}
        → 重命名: nameID 1→newFontName, 2→"Regular", 3→newFontName+": 2025", 4→newFontName, 5→"Version 1.000", 6→newFontName
        → 编码字符串: platformID 3 → encodeUtf16BE, platformID 1+encodingID 0 → encodeAscii
        → 构建新 name table 二进制: header(6B) + records(N×12B) + string storage
      → rebuildFontBinary(originalFontBytes, newNameTable, parsed):
        → 保留 sfVersion, numTables, searchRange, entrySelector, rangeShift
        → 重新计算所有表的 offset（按顺序排列，4字节对齐 padTo4Bytes）
        → name table: 使用新数据和新 checksum
        → 其他表: 使用原始数据（slice）和原始 checksum
        → 写入 offset table directory + 各表数据
    → processedBytes (处理后的完整 TTF 二进制)
    → uint8ArrayToBase64(processedBytes) → base64ToDownload
    → filename = `${newFontName}-${weight}${style}.ttf`
  → else (非 TTF):
    → base64ToDownload = 原始 base64Data (不做处理)
    → filename = 原始 filename

  → 构造 Data URI: `data:{mimeType};base64,{base64ToDownload}`
    → mimeType: ttf → "font/ttf", woff2 → "font/woff2", otf → "font/otf", 其他 → "application/x-font-woff"
  → chrome.downloads.download({ url: dataUrl, filename, saveAs: false })
  → 返回 { success: true/false, downloadId, filename } 或 { success: false, error }
  → Popup 更新按钮状态: 成功→"已下载"(绿色), 失败→"失败"(红色)
```

---

## 6. 交互界面

### 6.1 Popup 弹窗界面
- **触发方式**: 点击浏览器工具栏中的插件图标
- **界面宽度**: 360px
- **界面布局**:
  - 顶部 (header): 标题 "Font Capture" + 状态文字 + 重新扫描按钮
  - 搜索引擎信息 (search-tool-info): 显示当前网站使用的搜索引擎工具名称，适用于所有网页，如 "搜索引擎: Searchanise Search & Filter"、"搜索引擎: Shopify 原生搜索"、"搜索引擎: 未检测到"
  - 中部: 字体列表区域 (font-list)
    - 每个字体项 (font-item) 显示:
      - 字体名称 (font-name)
      - 字体元信息 (font-meta): 格式标签（TTF）| 大小 | 权重+样式
      - 单个下载按钮 (download-btn)
    - 无字体时显示提示 (empty-state): "当前页面未检测到字体"
  - 底部 (footer): "全部下载" 按钮（仅在检测到字体时显示）
  - 错误状态 (error-state): 显示扫描失败的错误消息
- **状态文字**: 显示当前模式信息，如 "检测到 2 个字体 (模式2: Network Font - BuildYou)"
- **搜索引擎检测**: 全局独立功能（适用于所有网页），不受字体扫描模式影响，检测完成后立即显示在 header 下方

### 6.2 状态反馈
- 扫描进行中: 显示加载动画 (loading-spinner) 和"扫描中..."提示，重新扫描按钮禁用
- 扫描完成: 列表刷新，显示检测结果统计（"检测到 N 个内嵌字体"）
- 扫描失败: 显示错误消息，重新扫描按钮恢复可用
- 下载成功: 对应项按钮变为"已下载"（绿色样式 .downloaded），按钮禁用
- 下载失败: 对应项按钮变为"失败"（红色样式 .error），按钮禁用
- 全部下载: 仅下载状态为未成功且未失败的项

---

## 7. 技术规范

### 7.1 技术栈
- **前端**: HTML + JavaScript（纯原生，不依赖第三方框架）
- **平台**: Google Chrome 浏览器扩展（Manifest V3）
- **运行环境**: Chrome 内嵌浏览器，路径: `I:\chrome-win64 (1)`

### 7.2 Chrome 扩展架构

#### 7.2.1 Manifest V3 配置
```json
{
  "manifest_version": 3,
  "name": "Font Capture",
  "version": "1.0.0",
  "description": "提取网页中内嵌的 Base64 字体文件并下载",
  "permissions": ["activeTab", "downloads", "scripting"],
  "host_permissions": ["<all_urls>", "file:///*"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

#### 7.2.2 核心文件结构
```
font_capture/
├── manifest.json          # 扩展配置文件
├── popup.html             # 弹窗界面 HTML
├── popup.js               # 弹窗逻辑脚本（模式调度 + 渲染 + 下载触发 + 搜索引擎检测调度）
├── popup.css              # 弹窗界面样式（360px 宽度）
├── background.js          # 后台服务脚本（下载+跨域CSS+网络字体fetch+格式检测+字体处理调度）
├── fontProcessor.js       # TTF 字体处理模块（name table 解析/修改/重建）
├── mode_config.js         # 模式配置（网站映射、URL前缀、格式过滤、兜底格式）
├── mode1_css.js           # 模式1扫描函数（scanAccessibleStyles - CSS扫描）
├── mode2_buildyou.js      # 模式2扫描函数（scanBuildyouFonts - BuildYou网络拦截）
├── mode3_medzt.js         # 模式3扫描函数（scanMedztFonts - Medzt网络拦截）
├── search_detector.js     # 搜索引擎工具检测模块（detectSearchTool - DOM脚本/内联内容/全局变量/Shopify原生检测）
├── FontUtil.java          # 参考实现（Java 原始逻辑，不参与运行）
├── test_page.html         # 测试页面（含两个 @font-face 规则）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

#### 7.2.3 模块依赖关系
```
background.js
  → importScripts('fontProcessor.js', 'mode_config.js')  // MV3 service worker 加载方式
  → 使用 fontProcessor.js 中的函数:
    - base64ToUint8Array(base64)
    - uint8ArrayToBase64(bytes)
    - generateNewFontName(min, max)
    - processTtfFont(fontBytes, newFontName)
  → 使用 mode_config.js 中的配置:
    - MODE_CONFIG (格式兜底、URL前缀等)
  → 新增消息处理: fetchFontUrls (模式2/3网络字体获取)

popup.js
  → 依赖 popup.html 中按顺序加载的脚本文件:
    - mode_config.js → MODE_CONFIG, determineMode
    - mode1_css.js → scanAccessibleStyles (模式1扫描函数)
    - mode2_buildyou.js → scanBuildyouFonts (模式2扫描函数)
    - mode3_medzt.js → scanMedztFonts (模式3扫描函数)
    - search_detector.js → detectSearchTool (搜索引擎检测函数，DOM/全局变量/Shopify原生四级检测)
  → 通过 chrome.scripting.executeScript 注入对应模式的扫描函数到页面上下文
  → 通过 chrome.scripting.executeScript 注入 detectSearchTool 检测搜索引擎工具（并行执行）
  → 通过 chrome.runtime.sendMessage 与 background.js 通信
  → 消息类型: fetchCrossOriginCss (模式1跨域), fetchFontUrls (模式2/3), downloadFont (所有模式)
```

### 7.3 fontProcessor.js 模块详解

#### 7.3.1 函数分组

| 分组 | 函数 | 说明 |
|------|------|------|
| A: 二进制读写 | `readUint16(data, offset)` | 读取 2 字节无符号整数 |
| A: 二进制读写 | `readUint32(data, offset)` | 读取 4 字节无符号整数（>>>0 防止负数） |
| A: 二进制读写 | `writeUint16(data, offset, value)` | 写入 2 字节无符号整数 |
| A: 二进制读写 | `writeUint32(data, offset, value)` | 写入 4 字节无符号整数 |
| B: Base64 转换 | `base64ToUint8Array(base64)` | Base64 → Uint8Array |
| B: Base64 转换 | `uint8ArrayToBase64(bytes)` | Uint8Array → Base64 |
| C: 字符串编解码 | `decodeUtf16BE(bytes)` | UTF-16BE 字节 → 字符串 |
| C: 字符串编解码 | `decodeAscii(bytes)` | ASCII 字节 → 字符串（跳过 0x00） |
| C: 字符串编解码 | `encodeUtf16BE(str)` | 字符串 → UTF-16BE 字节 |
| C: 字符串编解码 | `encodeAscii(str)` | 字符串 → ASCII 字节（>127 → 0x00） |
| C: 字符串编解码 | `encodeStringForRecord(str, platformID, encodingID)` | 按 platform 编码字符串 |
| D: 名称生成 | `generateNewFontName(min, max)` | 随机字体名（首大写+余小写） |
| E: Name 表解析 | `parseTtfNameTable(fontBytes)` | 解析 TTF name table，返回结构化数据 |
| F: Name 表修改 | `buildModifiedNameTable(parsed, newFontName, originalBytes)` | 构建修改后的 name table 二进制 |
| G: 字体重建 | `rebuildFontBinary(originalBytes, newNameTable, parsed)` | 重建完整 TTF 二进制 |
| G: 字体重建 | `padTo4Bytes(length)` | 4 字节对齐计算 |
| G: 字体重建 | `calculateChecksum(data)` | 计算表 checksum |
| H: 编排 | `processTtfFont(fontBytes, newFontName)` | 主流程：解析→修改→重建 |

#### 7.3.2 name table 解析细节
- 验证 sfVersion: `0x00010000`（标准 TrueType）或 `0x74727565`（Apple TrueType）
- 遍历 offset table（从第 12 字节开始，每条 16 字节），找到 tag='name' 的条目
- 解析 name table header: format(2B), count(2B), stringOffset(2B)
- 遍历 name records（每条 12 字节）: platformID, encodingID, languageID, nameID, length, strOff
- 字符串解码: platformID=3 → UTF-16BE, 其他 → ASCII
- 返回: format, count, stringOffset, records[], nameTableOffset, nameTableLength, numTables, tableEntries[], nameIdx

#### 7.3.3 name table 修改细节
- 过滤: 删除 `REMOVE_IDS = {0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18}` 的记录
- 重命名保留记录按 2.1.3.2 表规则
- 字符串编码: platformID=3 → UTF-16BE, platformID=1+encodingID=0 → ASCII, 其他 → 保持原始字节
- 构建二进制: header(6B) + records(kept.length × 12B) + string storage
- 总大小 = 6 + kept.length × 12 + 所有编码字符串总长度

#### 7.3.4 字体重建细节
- 保留原始 sfVersion, numTables, searchRange, entrySelector, rangeShift
- offset table directory: 12 + numTables × 16 字节
- 数据区: 每个表按 4 字节对齐排列（padTo4Bytes）
- name table: 使用新数据 + 新 checksum
- 其他表: 使用原始 slice 数据 + 原始 checksum
- 如果 parseTtfNameTable 失败（非 TTF 格式），返回原始 fontBytes 不做处理

### 7.4 background.js 模块详解

#### 7.4.1 消息处理

| 消息类型 | 处理逻辑 |
|----------|----------|
| `downloadFont` | TTF: 解码→processTtfFont→编码→Data URI 下载; 非 TTF: 直接 Data URI 下载 |
| `fetchCrossOriginCss` | 逐个 fetch href→parseCssForFonts→合并返回 (模式1) |
| `fetchFontUrls` | 逐个 fetch URL→arrayBuffer→格式检测→uint8ArrayToBase64→构造字体数据对象→合并返回 (模式2/3) |

#### 7.4.2 跨域 CSS 解析
- `parseCssForFonts(cssText)`:
  - 去除 CSS 注释
  - 去除换行
  - 正则匹配 @font-face 块
  - 提取 font-family, weight, style, data URI
  - 基于完整 block 文本调用 determineFormat（而非截断的 src 值）
  - Base64 数据去除空白字符

#### 7.4.3 下载流程
- Data URI 格式: `data:{mimeType};base64,{base64ToDownload}`
- mimeType 映射: ttf→font/ttf, woff2→font/woff2, otf→font/otf, 其他→application/x-font-woff
- `chrome.downloads.download({ url, filename, saveAs: false })`
- 返回 `{ success: true, downloadId, filename }` 或 `{ success: false, error }`
- `return true` 保持消息通道开放（异步响应）

### 7.5 popup.js 模块详解

#### 7.5.1 扫描函数注入
- `chrome.scripting.executeScript({ target: { tabId }, func: scanAccessibleStyles })`
- scanAccessibleStyles 返回 `{ fonts: [], crossOriginHrefs: [] }`

#### 7.5.2 scanAccessibleStyles（注入到页面上下文）
- 遍历 `document.styleSheets` → `extractFromRules(sheet.cssRules)` 递归
- 支持 `CSSRule.FONT_FACE_RULE`, `CSSRule.MEDIA_RULE`, `CSSRule.IMPORT_RULE`
- 跨域 sheet → 捕获异常，收集 href
- 遍历 inline `<style>` 元素 → 文本解析（去除注释和换行）
- 使用完整 @font-face block 文本进行 format 检测

#### 7.5.3 renderFonts 过滤与去重
- 格式过滤: `if (f.format !== 'ttf') return false;`（先执行）
- 内容去重: `seen.has(f.base64Data)` 基于 base64 内容去重（后执行）
- 重复名称处理: 计数器添加后缀 `FontName-2`, `FontName-3`

#### 7.5.4 downloadFont 消息
- 发送: `{ type: "downloadFont", base64Data, format, filename, weight, style }`
- weight 和 style 字段必须发送（background.js 用于构造处理后的文件名）

---

## 8. 日志策略

### 8.1 日志级别与标识
所有日志使用统一前缀标识：
- Popup: `[FontCapture Popup]`
- Background: `[FontCapture BG]`
- 扫描函数(模式1): `[FontCapture Scan]`
- 扫描函数(模式2): `[FontCapture Mode2]`
- 扫描函数(模式3): `[FontCapture Mode3]`
- 搜索检测: `[FontCapture SearchDetect]`
- 字体处理: `[FontProcessor]`

### 8.2 关键日志点

| 位置 | 日志内容 | 级别 |
|------|----------|------|
| popup.js scanCurrentPage | "scanCurrentPage started", tab id/url | log |
| popup.js 脚本注入 | 注入失败: lastError.message | error |
| popup.js 扫描结果 | 字体数量、跨域数量、每个字体详情 | log |
| popup.js 跨域CSS | "Fetching cross-origin CSS..." | log |
| popup.js downloadFont | filename, format, base64 length | log |
| popup.js 下载结果 | success/failure 详情 | log/error |
| background.js downloadFont | filename, format, base64 length, newFontName | log |
| background.js processTtfFont | 原始大小→新大小, name table 变化 | log |
| background.js 跨域fetch | href, status, CSS length, fonts count | log |
| background.js 下载结果 | downloadId, filename 或 lastError | log/error |
| background.js fetchFontUrls | URL, fetch status, format, size | log |
| background.js fetchFontUrls 失败 | URL, error message | error |
| popup.js 模式检测 | currentMode, URL, config.name | log |
| popup.js 搜索引擎检测 | detected tool name, detection method (Sheet1/Sheet2/Row1/Row2) | log |
| search_detector.js detectSearchTool | Level A/B/C/D matching steps, matched rule and pattern | log |
| search_detector.js 四级检测结果 | Level A script src, Level B inline, Level C global var, or Level D Shopify, final tool name | log |
| fontProcessor.js parseTtfNameTable | sfVersion, 记录数 | log/warn |
| fontProcessor.js buildModifiedNameTable | 原始记录数→保留记录数 | log |
| fontProcessor.js processTtfFont | 原始大小→新大小, name table 变化 | log |

---

## 9. 边界情况与错误处理

### 9.1 边界情况
| 场景 | 处理方式 |
|------|----------|
| 页面无内嵌字体 | Popup 显示"未检测到字体"提示，隐藏 footer |
| 页面无 TTF 字体（仅有 WOFF 等） | Popup 显示"未检测到字体"提示（模式1 TTF过滤后无结果）；模式2/3显示所有格式字体 |
| 模式2/3 initiatorType 非目标值 | 资源由 CSS 加载 (initiatorType='css') → 被过滤排除，不捕获网站UI字体 |
| 模式2/3 URL 路径不含 /fonts/ | 非字体路径的资源 (如 CSS文件、图片) → 被路径过滤排除 |
| 模式2/3 URL 扩展名不在允许列表 | 非字体扩展名 (如 .css/.js/.png) → 被扩展名过滤排除 |
| 模式2/3 URL 扩展名为 .undefined | 扩展名过滤允许 .undefined 通过，后续由 Magic Bytes 或配置兜底检测实际格式 |
| 模式3 URL扩展名为 .otf | Magic Bytes检测确认格式，同时URL扩展名辅助验证 |
| Performance API 资源条目缓冲溢出 | Console.warn 提示，用户可重新扫描刷新 |
| 网络字体 URL fetch 失败 | .catch() 捕获错误日志，跳过该URL，继续处理其他URL |
| 网站不在配置中 | 默认使用模式1 (CSS扫描)；搜索引擎检测仍正常执行（全局功能） |
| 搜索引擎检测: Level A (script/link src) | script src 或 link href 包含工具 srcPatterns → 返回对应工具名称 |
| 搜索引擎检测: Level B (inline 内容) | 内联脚本 textContent 包含工具 contentPatterns → 返回对应工具名称 |
| 搜索引擎检测: Level C (window 变量) | window 上存在工具 globalVars → 返回对应工具名称 |
| 搜索引擎检测: Level D (Shopify 原生) | window.Shopify + form[action="/search"] + 无第三方工具 → "Shopify 官方 Search & Discovery" |
| 搜索引擎检测: 无匹配 | 四级检测均无匹配 → 显示 "未检测到" |
| 搜索引擎检测: 多个工具脚本 | 仅返回第一个匹配的（按规则顺序 + DOM 元素顺序），不报告多个工具 |
| 搜索引擎检测: 优先级 | Level A > B > C > D，匹配后立即停止后续检测 |
| 搜索引擎检测: chrome:// 页面 | 无法注入脚本，显示 "检测失败" |
| 搜索引擎检测: 字体扫描失败时 | 搜索引擎检测结果仍独立显示（不受字体扫描失败影响） |
| 搜索引擎检测: 新增工具 | 在 SEARCH_TOOL_RULES 数组中添加规则对象即可，无需修改检测逻辑 |
| Base64 数据损坏或解码失败 | try-catch 包裹 atob()，sizeBytes 设为 0 |
| 跨域样式表无法访问 | 捕获 SecurityError，href 加入 crossOriginHrefs 列表 |
| 跨域 CSS fetch 失败 | .catch() 捕获错误，继续处理其他 href |
| 字体名称重复 | 添加序号后缀（FontName-1, FontName-2） |
| Base64 数据过长 | 正常处理，不截断 |
| Base64 数据含空白字符 | `replace(/\s/g, '')` 去除 |
| CSS 注释干扰解析 | 预处理去除所有 CSS 注释 |
| 页面动态加载字体 | 提供"重新扫描"按钮刷新检测结果 |
| format() 提示与实际格式不符 | Magic Bytes 优先（Step 1），format() 仅在无 Magic Bytes 时使用 |
| src 值截断 format() 提示 | 使用完整 @font-face block 文本检测 format() |
| TTF 字体无 name table | parseTtfNameTable 返回 null，processTtfFont 返回原始字节 |
| TTF 字体 sfVersion 不匹配 | parseTtfNameTable 返回 null，不做处理 |
| MV3 service worker 无 DOM API | 使用 Data URI 下载，不使用 Blob/ObjectURL |
| @import 规则嵌套 | extractFromRules 递归处理 CSSRule.IMPORT_RULE |
| @media 规则嵌套 | extractFromRules 递归处理 CSSRule.MEDIA_RULE |

### 9.2 错误处理
- `cssRules` 访问异常: 捕获 SecurityError，href 加入跨域列表
- Base64 解码异常: try-catch 包裹 atob()
- 跨域 fetch 异常: .catch() 捕获，不阻断其他 href 处理
- 脚本注入失败: 检查 chrome.runtime.lastError，在 Popup 中 showError
- 下载失败: chrome.runtime.lastError 检查，返回 `{ success: false, error }`
- 字体处理异常: try-catch 在 background.js downloadFont 中，返回 `{ success: false, error }`
- 无 active tab: showError('无法获取当前标签页')
- name table 解析失败: 返回原始字体字节，console.warn 提示

---

## 10. 测试验收标准

### 10.1 功能测试
- [ ] 在 wrappiness.co 打开插件，模式1 CSS扫描正常工作（回归测试）
- [ ] 字体格式通过 Magic Bytes 正确识别
- [ ] 模式1仅显示 TTF 格式字体
- [ ] 单个 TTF 字体下载: 文件经过版权去除+重命名处理
- [ ] 下载的 TTF 文件中无 nameID 0,7-18 的版权记录
- [ ] 全部下载功能正常
- [ ] 在 wanderprints.com 打开插件，模式2正确检测
- [ ] 模式2: Performance API 找到 assets.buildyou.io 前缀的字体 URL
- [ ] 模式2: background.js fetch 字体 URL 成功
- [ ] 模式2: 格式检测正确（.undefined URL 通过 Magic Bytes 检测）
- [ ] 模式2: 字体列表正确显示所有格式字体
- [ ] 模式2: 下载功能正常（TTF执行处理，其他格式直接下载）
- [ ] 在 macorner.co 打开插件，模式3正确检测
- [ ] 模式3: Performance API 找到 assets.medzt.com 前缀的字体 URL
- [ ] 模式3: OTF 字体正确检测和显示
- [ ] 模式3: OTF 字体直接下载（无版权去除处理）
- [ ] 不在配置中的网站默认使用模式1
- [ ] 无字体页面显示正确的空状态提示
- [ ] 重新扫描按钮正常工作（所有模式）

### 10.2 搜索引擎检测测试（全局功能，基于 DOM 检测）
- [ ] trendingcustom.com: Level A → script src 包含 searchanise/searchserverapi → 显示 "Searchanise Search & Filter"
- [ ] macorner.co: Level A → script src 包含 searchanise → 显示 "Searchanise Search & Filter"
- [ ] wrappiness.co: 搜索引擎检测正常执行，显示检测结果或 "未检测到"
- [ ] wanderprints.com: 搜索引擎检测正常执行，显示检测结果或 "未检测到"
- [ ] 使用 Algolia 的网站: Level A → script src 包含 algolia → 显示 "Algolia AI Search & Discovery"
- [ ] 无第三方搜索工具的 Shopify 网站: Level D → window.Shopify + form[action="/search"] → 显示 "Shopify 官方 Search & Discovery"
- [ ] 非电商网站: 四级检测均无匹配 → 显示 "未检测到"
- [ ] Level A 优先于 Level B/C/D: script src 包含已知工具关键词时，不再检查 inline/全局变量
- [ ] 用户未执行搜索时检测: 页面仅打开首页，不搜索 → 仍可检测到搜索工具（SDK 脚本在 DOM 中）
- [ ] 搜索引擎检测不受字体扫描模式影响（任何网页均执行检测）
- [ ] 搜索引擎检测结果在字体扫描之前或同时显示
- [ ] 新增工具规则: 在 SEARCH_TOOL_RULES 中添加新条目，无需修改检测逻辑

### 10.2 兼容性测试
- [ ] 在 `I:\chrome-win64 (1)` 目录下的 Chrome 浏览器中正常加载和运行
- [ ] Manifest V3 规范下无权限警告或错误
- [ ] 跨域样式表场景下仍能提取字体数据
- [ ] Data URI 下载方式在 MV3 service worker 中正常工作

### 10.3 日志验证
- [ ] service worker 控制台可见 FontCapture BG 日志
- [ ] 下载成功/失败均有明确日志
- [ ] 字体处理步骤（解码→生成名称→处理→编码→下载）均有日志

---

## 11. 附录

### 11.1 新前缀样例数据 URI（强制约束）
```
data:application/octet-stream;base64,AAEAAAASAQAABAAQRFNJRwAAAAEAAEP4AAAACEdERUYADwAAAAABLAAAABBHUE9T0wnn5AAAATwAAAaKR1NVQgABAAAAAAfIAAAACk9TLzKJuptFAAAH1AAAAGBjbWFwjwOIrwAACDQAAAD+Y3Z0IAu2BjwAADUEAAAANGZwZ22eNhHKAAA1OAAADhVnYXNwAAAAEAAANPwAAAAIZ2x5ZkTV55kAAAk0AAAjjmhlYWQTI9cPAAAsxAAAADZoaGVhBpsCagAALPwAAAAkaG10eH9TDscAAC0gAAABWGxvY2FwzGiMAAAueAAAAK5tYXhwAYkOtwAALygAAAAgbmFtZTJuWoUAAC9IAAAE4HBvc3Rfo1thAAA0KAAAANNwcmVwaEbInAAAQ1AAAACn...
```

### 11.2 旧前缀样例数据 URI（兼容）
```
data:application/x-font-woff;charset=utf-8;base64,d09GRgABAAAAAAScAA0AAAAABrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGRlRNAAAEgAAAABoAAAAcbyQ+3kdERUYAAARgAAAAHgAAACAAMwAGT1MvMgAAAZgAAABGAAAAVi+vS9xjbWFwAAAB8AAAAEAAAAFKwBMjvmdhc3AAAARYAAAACAAAAAj//wADZ2x5ZgAAAkAAAAEJAAABdH33LXtoZWFkAAABMAAAAC0AAAA2BroQKWhoZWEAAAFgAAAAHAAAACQD5QHQaG10eAAAAeAAAAAPAAAAFAYAAABsb2NhAAACMAAAAA4AAAAOAO4AeG1heHAAAAF8AAAAHAAAACAASgAvbmFtZQAAA0wAAADeAAABkorWfVZwb3N0AAAELAAAACkAAABEp3ubLXgBY2BkYADhPPP4OfH8Nl8ZuJkYQODS2fRrCPr/aSYGxq1ALgcDWBoAO60LkwAAAHgBY2BkYGDc+v80gx4TAwgASaAICmABAFB+Arl4AWNgZGBgYGPQYWBiAAIwyQgWc2AAAwAHVQB6eAFjYGRiYJzAwMrAwejDmMbAwOAOpb8ySDK0MDAwMbByMsCBAAMCBKS5pjA4PGB4wMR44P8BBj3GrQymQGFGkBwAjtgK/gAAeAFjYoAAEA1jAwAAZAAHAHgB3crBCcAwDEPRZydkih567CDdf4ZskmLwFBV8xBfCaC4BXkOUmx4sU0h2ngNb9V0vQCxaRKIAevT7fGWuBrEAAAAAAAAAAAA0AHgAugAAeAF9z79Kw1AUx/FzTm7un6QmJtwmQ5Bg1abgEGr/BAqlU6Gju+Cgg1MkQ/sA7Vj7BOnmO/gUvo2Lo14NqIO6/IazfD8HEODtmQCfoANwNsyp2/GJt3WKQrd1NLiYYWx2PBqOsmJMEOznPOTzfSCrhAtbbLdmeFLJV9eKd63WLrZcIcuaEVdssWCKM6pLCfTVOYbz/0pNSMSZKLIZpvh78sAUH6PlMrreTCabP9r+Z/puPZ2ur/RqpQHgh+MIegCnXeM4MRAPjYN//5tj4ZtTjkFqEdmeMShlEJ7tVAly2TAkx6R68Fl4E/aVvn8JqHFQ4JS1434gXKcuL31dDhzs3YbsEOAd/IU88gAAAHgBfY4xTgMxEEVfkk0AgRCioKFxQYd2ZRtpixxgRU2RfhU5q5VWseQ4JdfgAJyBlmNwAM7ABRhZQ0ORwp7nr+eZAa54YwYg9zm3ynPOeFRe8MCrciXOh/KSS76UV5L/iDmrLiS5AeU519wrL3jmSbkS5115yR2fyivJv9kx0ZMZ2RLZw27q87iNQi8EBo5FSPIMw3HqBboi5lKTGAGDp8FKXWP+t9TU01Lj5His1Ba6uM9dTEMwvrFmbf5GC/q2drW3ruXUhhsCiQOjznFlCzYhHUZp4xp76vsvQh89CQAAeAFjYGJABowM6IANLMrEyMTIzMjCXpyRWJBqZshWXJJYBKOMAFHFBucAAAAAAAAB//8AAngBY2BkYGDgA2IJBhBgAvKZGViBJAuYxwAABJsAOgAAeAFjYGBgZACCk535hiD60tn0azAaAEqpB6wAAA==
```

### 11.3 Magic Bytes 参考表
| 字体格式 | Magic Bytes (HEX) | Magic Bytes (ASCII) | 文件扩展名 |
|----------|-------------------|---------------------|-----------|
| WOFF | `77 4F 46 46` | `wOFF` | `.woff` |
| WOFF2 | `77 4F 46 32` | `wOF2` | `.woff2` |
| TrueType | `00 01 00 00` | - | `.ttf` |
| TrueType (Apple) | `74 72 75 65` | `true` | `.ttf` |
| OpenType | `4F 54 54 4F` | `OTTO` | `.otf` |

### 11.4 TTF Name Table nameID 完整处理规则
| nameID | 含义 | 处理 | 新值（如保留） |
|--------|------|------|----------------|
| 0 | Copyright Notice | **删除** | — |
| 1 | Font Family Name | 保留+重命名 | `newFontName` |
| 2 | Font Subfamily Name | 保留+重命名 | `"Regular"` |
| 3 | Unique ID | 保留+重命名 | `newFontName + ": 2025"` |
| 4 | Full Font Name | 保留+重命名 | `newFontName` |
| 5 | Version | 保留+重命名 | `"Version 1.000"` |
| 6 | PostScript Name | 保留+重命名 | `newFontName` |
| 7 | Trademark | **删除** | — |
| 8 | Manufacturer | **删除** | — |
| 9 | Designer | **删除** | — |
| 10 | Description | **删除** | — |
| 11 | URL Vendor | **删除** | — |
| 12 | URL Designer | **删除** | — |
| 13 | License Description | **删除** | — |
| 14 | License Info URL | **删除** | — |
| 15 | Reserved | **删除** | — |
| 16 | Typographic Family Name | **删除** | — |
| 17 | Typographic Subfamily Name | **删除** | — |
| 18 | Compatible Full | **删除** | — |
| 其他 | — | 保留原值 | `stringValue` |

### 11.5 模式2 样例字体 URL
```
https://assets.buildyou.io/library/fonts/22fab390-7e74-4dd9-9d84-9bcee3b7a74c.undefined
```
- URL前缀: `https://assets.buildyou.io`
- 扩展名: `.undefined` (非标准，需依赖 Magic Bytes 检测实际格式)
- 出现位置: Chrome DevTools Network → Font tab

### 11.6 模式3 样例字体 URL
```
https://assets.medzt.com/fonts/2026/03/22/a7M4JzNKKb__valentine-delight.otf
```
- URL前缀: `https://assets.medzt.com/`
- 扩展名: `.otf` (OpenType)
- 出现位置: Chrome DevTools Network → fetch/XHR

### 11.7 目标网站
- **模式1**: https://www.wrappiness.co/, https://trendingcustom.com/
- **模式2**: https://wanderprints.com/
- **模式3**: https://macorner.co/

### 11.8 Chrome 浏览器路径
`I:\chrome-win64 (1)`

### 11.9 参考文件
- `FontUtil.java` — Java 原始实现逻辑，位于 `E:\bookstore\font_capture\FontUtil.java`
  - `generateNewFontName(min, max)` — 随机字体名生成
  - `processFontInfo(fontUrl, newFontName)` — TTF 处理流程（TTX XML 方式，JS 版本改为直接二进制操作）
  - nameID 删除和重命名规则来源于此文件
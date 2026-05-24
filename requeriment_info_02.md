新增需求点：
1.我现在需要支持三个模式。当前已经支持(实现)了第一种模式。支持这个两个网站：https://www.wrappiness.co/和https://trendingcustom.com/；
2.第二种模式(未支持，本次支持)。适用网站：https://wanderprints.com/
  抓取规则：
     1.是通过接口请求字体文件。接口前缀https://assets.buildyou.io。抓取network的字体tab下的字体请求接口。
     样例接口：https://assets.buildyou.io/library/fonts/22fab390-7e74-4dd9-9d84-9bcee3b7a74c.undefined
     
     2.抓取后进行下载。
3.第三种模式(未支持，本次支持)。适配网站：https://macorner.co/
  抓取规则：
     1.是通过接口请求字体文件。接口前缀https://assets.medzt.com/。抓取fetch/xhr下，字体请求接口
     样例接口：https://assets.medzt.com/fonts/2026/03/22/a7M4JzNKKb__valentine-delight.otf
     


    强制要求：
    1.需要先更新需求文档：E:\bookstore\font_capture\requeriment_info_01.md。然后再更新代码。
2.三种模式写到不同的文件里。
3.核心功能点的执行和异常情况都需要打印日志。
4.模式和对应网站是可以支持配置的。

新增需求点；
显示当前网站使用了什么搜索引擎工具，判断流程：
1. 先看 Network 里的第三方域名
 重点搜索：
searchanise、boost-pfs、algolia、klevu、fastsimon、instantsearchplus、doofinder、searchspring、nosto、findify、sparq、wizzy。 
2. 再看请求路径关键词
 重点搜索：
getresults、ajax、search、autocomplete、suggest、filter、collection、facets、sort、best-selling。 
3. 最后看 Shopify 原生接口
 如果没有第三方 App，很可能是 Shopify 原生搜索/集合页排序： 
  - /search/suggest.json
  - /search?q=xxx
  - /collections/all?sort_by=best-selling
  - /collections/{collection-handle}?sort_by=best-selling


案例：
1. 网站：https://trendingcustom.com/、macorner.co
  1. 使用了搜索工具：Searchanise Search & Filter
  
  
修改搜索工具的需求，按如下新的规则判断显示
1.先把网页中的请求地址与map.xlsx中sheet1的第二列所例举的域名做比对是否包含，若满足，则显示对应的第一列搜索工具
2.先把网页中的请求地址与map.xlsx中sheet2的第二列所例举的域名做比对是否包含，若满足，则再看请求地址是否包含第三列所例举的字符，若满足，则显示对应的第一列搜索工具
  强制要求：
      1.需要先更新需求文档：E:\bookstore\font_capture\requeriment_info_01.md。然后再更新代码。
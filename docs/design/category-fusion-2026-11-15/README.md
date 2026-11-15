# 全部分类插画融合调整

## 本轮覆盖

发布页27个行业、83个分组、418个细分类目采用统一的插画展示框，分类搜索结果复用相同的取景规则。悼念专区三个入口沿用独立灰白主题。

- 餐饮初稿弱化拼版边缘及底部残留文字。
- 招聘、家政、闲置初稿分别调整主体大小与垂直位置。
- 临时图标统一为柔边展示，弱化方形底板。
- 四张透明底数码3D图直接融入卡片，五张既有房屋插画继续采用原有取景。
- 浅色模式通过柔边与底色混合衔接卡片，深色模式为实底素材保留低亮度柔边衬底。
- 图片加载失败后恢复原有图标与普通取景。

本轮通过展示层取景、混合与遮罩完成融合。素材制作进度为4张独立透明底3D图、72张原始3D初稿、337张临时图标和5张既有房屋插画。337项临时图标的专属3D制作及72张初稿的视觉定稿仍待推进。原始资源包来源状态保留76张初稿与342张临时图标的记录。

## 截图与逐项检查

下列页面截图来自微信开发者工具。分组复核图由开发者工具实际截图裁切拼接，包含各分组顶部与必要的底部视图。

| 行业 | 分组 | 分类 | 首组页面 | 分组复核图 |
| --- | --- | --- | --- | --- |
| 美食餐饮 | 3 | 18 | [页面](publish-C01.png) | [全部分组](review-C01.jpg) |
| 招聘求职 | 4 | 26 | [页面](publish-C02.png) | [全部分组](review-C02.jpg) |
| 家政维修 | 3 | 17 | [页面](publish-C03.png) | [全部分组](review-C03.jpg) |
| 二手闲置 | 3 | 15 | [页面](publish-C04.png) | [全部分组](review-C04.jpg) |
| 房屋租售 | 3 | 14 | [页面](publish-C05.png) | [全部分组](review-C05.jpg) |
| 玩乐休闲 | 3 | 19 | [页面](publish-C06.png) | [全部分组](review-C06.jpg) |
| 商场购物 | 3 | 16 | [页面](publish-C07.png) | [全部分组](review-C07.jpg) |
| 同城信息 | 3 | 14 | [页面](publish-C08.png) | [全部分组](review-C08.jpg) |
| 交通出行 | 3 | 14 | [页面](publish-C09.png) | [全部分组](review-C09.jpg) |
| 汽车用车 | 3 | 17 | [页面](publish-C10.png) | [全部分组](review-C10.jpg) |
| 丽人美业 | 3 | 13 | [页面](publish-C11.png) | [全部分组](review-C11.jpg) |
| 亲子母婴 | 3 | 13 | [页面](publish-C12.png) | [全部分组](review-C12.jpg) |
| 教育培训 | 3 | 15 | [页面](publish-C13.png) | [全部分组](review-C13.jpg) |
| 家居家装 | 3 | 15 | [页面](publish-C14.png) | [全部分组](review-C14.jpg) |
| 健康医疗 | 3 | 14 | [页面](publish-C15.png) | [全部分组](review-C15.jpg) |
| 旅游度假 | 3 | 14 | [页面](publish-C16.png) | [全部分组](review-C16.jpg) |
| 酒店住宿 | 3 | 13 | [页面](publish-C17.png) | [全部分组](review-C17.jpg) |
| 运动健身 | 3 | 17 | [页面](publish-C18.png) | [全部分组](review-C18.jpg) |
| 婚庆婚恋 | 4 | 17 | [页面](publish-C19.png) | [全部分组](review-C19.jpg) |
| 企业商务 | 3 | 18 | [页面](publish-C20.png) | [全部分组](review-C20.jpg) |
| 宠物服务 | 3 | 13 | [页面](publish-C21.png) | [全部分组](review-C21.jpg) |
| 养老助残 | 3 | 14 | [页面](publish-C22.png) | [全部分组](review-C22.jpg) |
| 殡葬服务 | 3 | 16 | [页面](publish-C23.png) | [全部分组](review-C23.jpg) |
| 快递物流 | 3 | 16 | [页面](publish-C24.png) | [全部分组](review-C24.jpg) |
| 农业农村 | 3 | 15 | [页面](publish-C25.png) | [全部分组](review-C25.jpg) |
| 政务便民 | 3 | 15 | [页面](publish-C26.png) | [全部分组](review-C26.jpg) |
| 金融保险 | 3 | 10 | [页面](publish-C27.png) | [全部分组](review-C27.jpg) |

补充状态截图见 [餐饮搜索](search-food.png)、[家政搜索](search-service.png)、[医疗搜索](search-symbol.png)、[数码搜索](publish-search.png)、[图片失败回退](publish-image-fallback.png)、[深色数码](publish-dark.png)、[深色餐饮](publish-dark-C01.png)、[深色医疗](publish-dark-C15.png)、[大字餐饮](publish-large-C01.png)及[悼念入口](memorial-placeholders.png)。

## 工程与测试

分类插画的取景类型由 `miniprogram/utils/category-art.js` 统一提供，展示样式集中于 `miniprogram/styles/catalog-art.wxss`，主包回退组件和资源分包组件复用同一套样式。

本地功能测试515项，其中497项通过，18项PostgreSQL测试因未配置测试库跳过。开发者工具50项检查通过，418项分类图片加载成功。27张分组复核图已逐一查看。分类遍历与补充状态复查时间保留于 [ui-result.json](ui-result.json)，汇总、源码哈希及包体测量见 [test-results.json](test-results.json)。真机字体、滚动性能及遮罩兼容性仍待设备验收。当前截图使用隔离内存接口，测试结束后已确认原有认证存储与接口配置恢复。

源码测量按现有打包排除项计算，主包2082847字节，资源分包1903574字节。正式编译上传包体仍待微信预览验证。

## 修改与回滚

修改清单见 [changed-files.txt](changed-files.txt)。回滚基线为 `f235f5d`。本轮独立提交可通过 `git revert <本轮提交>` 恢复此前展示，涉及公共插画样式、取景描述、发布页与悼念入口，以及对应回归检查。

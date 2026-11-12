# 视觉资产来源

## 品牌Logo

用户提供的蝴蝶Logo原始JPG保存在miniprogram/assets/brand-butterfly.jpg，页头使用CSS控制显示区域。

## 城市摄影

miniprogram/assets/xiangyang-river.jpg采用Fxqf拍摄的《Xiangyang skyline 02》，画面为襄阳汉江。授权为CC BY-SA 4.0，界面以aspectFill方式显示。页面提供摄影署名及来源说明。[原始作品](https://commons.wikimedia.org/wiki/File:Xiangyang_skyline_02.jpg) [授权](https://creativecommons.org/licenses/by-sa/4.0/)

## 分类图标与发布插画

使用内置imagegen生成并导出为项目PNG。分类图标位于miniprogram/assets/icons/industry-C01-pearl.png至industry-C27-pearl.png，更多图标位于shortcut-more-pearl.png，发布插画位于miniprogram/assets/publish-checklist.png。scripts/build_pearl_assets.js负责透明切片与尺寸导出。

### 发布插画提示词

Create one polished 3D pastel illustration for a Chinese local-life mini program publish banner. A single white pink rounded checklist sheet leaning slightly backwards on a small softly lit pale pink oval platform, four coral checkmarks and faint pink horizontal lines, with a single orange-peach pencil laid diagonally over the right edge. Match an elegant realistic soft clay product illustration, pearl whites, blush pinks and muted coral highlights, delicate shadows, bright diffused light, no text, no letters, no numbers, no watermarks. Isolated with genuinely transparent alpha background, square composition with generous margins. The image will appear at the far right of a rose colored banner and must be recognizable at small sizes.

### 分类图标提示词

Create a production sprite atlas of 28 separate small polished app category icons, matching the provided Chinese local life app style: friendly dimensional glass/clay colored icons with soft highlights, defined medium-weight rose, mauve and plum outlines and peach/pink/ivory fills. Each icon clearly recognizable at 32px. Bright transparent background with NO background tiles, NO shadows extending far outside icons, NO words, letters, numerals or labels. Strictly arrange into a regular 4 column by 7 row grid. Exactly one centered icon per equal cell, each object fits within the central 65% of its cell, equal padding, no crossing cell boundaries. Entire canvas a tall portrait 4:7 aspect ratio. Row 1 left to right: fork and knife, office briefcase, wrench, sealed parcel cardboard box. Row 2: simple house, video game controller, shopping bag, local information document with folded corner. Row 3: public transit car seen from front, passenger car seen from front, woman profile silhouette, baby stroller. Row 4: open book with small graduation cap, sofa armchair, medical cross, dumbbell. Row 5: travel suitcase with little airplane, hotel building, simple heart, business necktie. Row 6: paw print, assisting hand holding small heart, memorial candle, delivery truck. Row 7: sprouting grain plant, civic classical building with columns, insurance shield, three horizontal ellipsis dots. All 28 cells occupied exactly as specified. Restrained juicy colors only on the small objects. Predominantly rose pink and pearl white, warm orange accents for briefcase/car, lavender for house/gamepad, gentle blue for medical cross. Crisp polished professional illustration without text.

### 最终透明边缘整理提示词

Clean the transparent cutout edges of this exact 28-icon atlas. Remove ALL scattered magenta, fuchsia, red, white, grey and pink background speckles, grain, noisy partial outlines and halo fragments surrounding every icon. Only the 28 solid illustrated objects themselves and their smooth antialiased edges should remain, on perfectly clean transparent alpha. Preserve the icon artwork, colors, style and row/column order. Do not add any new details or text. Lay out the same 28 icons in an EXACT regular 4 columns x 7 rows grid, each cell square and the canvas aspect ratio exactly 4:7. Center every icon in its cell, fit object to the central 65% cell area with generous completely clean transparent space on every side. The image will be cut into individual equal square cells automatically, so NO object, shadow, fragment or pixel from a neighboring icon may enter any other cell. The transparent gutters between all cells must be completely empty. No background tile, no glow, no scattering or decoration. Production app icon sprite sheet.

## 隔离截图摄影

带“界面验收”标记的家居图片通过隔离测试库加载，用于卡片、详情和草稿的摄影布局复核。测试图片文件保存在源码外。[家居图片来源](https://images.unsplash.com/photo-1555041469-a586c61ea9bc)

# 首页与发布页资源记录

## 商家入驻插画

项目文件为 `miniprogram/assets/merchant-storefront.png`，使用内置 imagegen 工具生成。原始输出保存在源码外的 Codex generated_images 目录。导出时保留透明背景，缩放到320×240以内并压缩为索引PNG，当前文件36201字节。

最终生成提示词如下。

> Create a premium small 3D illustrated storefront cutout asset for a Chinese local-life app merchant signup banner. A single charming cream boutique shop, front view with a slight three-quarter angle, warm rose and ivory striped fabric awning, glass windows with soft golden interior light, tiny potted plants beside entrance. Polished tactile materials, restrained pearl pink palette, natural soft lighting, clean fine details readable at 160 pixels. Entire shop fully visible with generous transparent margin. Transparent background. No writing, no letters, no logo, no surrounding scene, no people. This is decorative artwork for a real UI, not a photograph of a specific business.

插画用于商家入驻入口。标题、说明和操作文字由WXML呈现。商家列表继续读取后端公开数据。

## 发布与资讯图标

`scripts/build_publish_project_icons.js`沿用现有行业图标的24单位线框网格和六套主题色板，输出手机、电脑、平板、耳机、发布须知、草稿、进度、帮助、家居、其他与资讯图标。发布须知复用现有教育行业的书本路径。

## 既有资源

蝴蝶Logo、首页分类图标、发布清单插画和襄阳摄影继续使用上一轮已记录的资源。城市摄影保留页面署名及来源说明。详见上一轮资源记录。[既有资源来源](../pearl-reference-2026-11-12/ASSET_SOURCES.md)

# 村美美｜二级分组 83 组简化展示规范

## 视觉规则
1. 分组名称以文字为主，不为 83 个分组逐一制作独立图标。
2. 标题左侧使用一个 3–4px 宽、16–18px 高的玫瑰色圆角竖标（或极小圆点）。
3. 标题文字 15–16px，字重 600；分组项目数量使用 12px 次级文字，靠右显示。
4. 组与组之间用 12–16px 垂直间距或极淡分隔线，不使用重型大卡片套小卡片。
5. 组内细分类用轻量圆角按钮/浅底标签；不重复使用行业级图标。
6. 展开箭头统一放在数量旁，展开/收起状态明确。
7. 当前选中组可使用浅玫瑰色背景或左侧品牌色标记，不要整块高饱和填色。

## 建议设计 token
- brand: `#C43F82`
- brand-soft: `rgba(217, 91, 155, 0.10)`
- text-primary: `#302833`
- text-secondary: `#8C7D88`
- divider: `rgba(155, 125, 148, 0.14)`
- group-title-size: `15px`
- group-count-size: `12px`
- group-gap: `12px`
- marker: `3px × 18px`, radius `999px`

## 小程序接入示例（WXML）
```xml
<view class="group-heading">
  <view class="group-marker"></view>
  <text class="group-name">{{group.name}}</text>
  <view class="group-meta">
    <text>{{group.item_count}}个分类</text>
    <text class="chevron">⌄</text>
  </view>
</view>
```

```css
.group-heading { display:flex; align-items:center; min-height:44rpx; gap:16rpx; }
.group-marker { width:6rpx; height:34rpx; border-radius:999rpx; background:#C43F82; }
.group-name { color:#302833; font-size:30rpx; font-weight:600; flex:1; }
.group-meta { color:#8C7D88; font-size:24rpx; display:flex; align-items:center; gap:10rpx; }
```

数据文件中的顺序按发布页左栏当前展示顺序排列；ID 保留 CxxGxx 原值，不重新编号。

"use strict";

function measure(page) {
  const state = page._pageLayout;
  if (!state?.active) return;
  let info = {};
  try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch { return; }
  if (!info.windowHeight) return;
  if (!state.keyboardHeight) state.fullHeight = info.windowHeight;
  const height = Math.min(info.windowHeight, (state.fullHeight || info.windowHeight) - (state.keyboardHeight || 0));
  const safeBottom = Math.max(0, (info.screenHeight || info.windowHeight) - (info.safeArea?.bottom || info.screenHeight || info.windowHeight));
  const version = state.version = (state.version || 0) + 1;
  const header = state.header || { height: (info.statusBarHeight || 0) + 44, statusHeight: info.statusBarHeight || 0, rowHeight: 44, titleInset: 96 };
  const apply = (bottom) => {
    if (!state.active || version !== state.version) return;
    state.bottom = bottom;
    const style = `--page-viewport:${height}px;--page-bottom:${bottom}px;--page-header:${header.height}px;--page-status:${header.statusHeight}px;--page-nav:${header.rowHeight}px;--page-capsule:${header.titleInset}px;--page-safe-bottom:${state.keyboardHeight?0:safeBottom}px;--page-dock:${state.dockHeight||0}px`;
    if (page.data.layoutStyle !== style) page.setData({ layoutStyle: style });
  };
  apply(state.tabBar ? 56 + safeBottom : 0);
  const bar = state.tabBar && page.getTabBar?.();
  if (bar?.createSelectorQuery) bar.createSelectorQuery().select(".curved-tabs").boundingClientRect((rect) => { if (rect?.height) apply(rect.height); }).exec();
  if (state.dock && page.createSelectorQuery) page.createSelectorQuery().select(state.dock).boundingClientRect((rect) => {
    if (!rect || !state.active || version !== state.version) return;
    state.dockHeight = rect.height;
    apply(state.bottom);
  }).exec();
  if (state.sentinel && page.createSelectorQuery) {
    page.createSelectorQuery().select(state.sentinel).boundingClientRect((rect) => {
      if (!rect || !state.active || version !== state.version) return;
      state.collapseAt = Math.max(1, rect.top + (state.scrollTop || 0) - header.height);
    }).exec();
  }
}

function show(page, options = {}) {
  const state = page._pageLayout = { ...page._pageLayout, ...options, active: true };
  if (options.keyboard && !state.keyboardListener && wx.onKeyboardHeightChange) {
    state.keyboardListener = (event) => { state.keyboardHeight = Math.max(0, event.height || 0); measure(page); };
    wx.onKeyboardHeightChange(state.keyboardListener);
  }
  measure(page);
}

function hide(page) {
  const state = page._pageLayout;
  if (!state) return;
  state.active = false;
  state.version = (state.version || 0) + 1;
  if (state.keyboardListener) wx.offKeyboardHeightChange?.(state.keyboardListener);
  state.keyboardListener = null;
  state.keyboardHeight = 0;
}

function header(page, event) {
  const state = page._pageLayout = page._pageLayout || {};
  state.header = event.detail;
  measure(page);
}

function scroll(page, event) {
  const state = page._pageLayout;
  if (!state?.active) return;
  const top = state.scrollTop = Math.max(0, event.scrollTop || 0);
  const threshold = state.threshold ?? state.collapseAt ?? 64;
  const compact = page.data.pageCompact ? top > Math.max(0, threshold - 8) : top >= threshold;
  if (compact !== page.data.pageCompact) page.setData({ pageCompact: compact });
}

module.exports = { show, hide, header, measure, scroll };

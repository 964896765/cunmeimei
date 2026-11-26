"use strict";
function palette(theme) {
  const dark = theme === "dark";
  return {
    background: dark ? "#191919" : "#F5F5F3",
    surface: dark ? "#242424" : "#FFFFFF",
    ink: dark ? "#F4F4F4" : "#252525",
    text: dark ? "#E1E1E1" : "#464646",
    muted: dark ? "#B7B7B7" : "#626262",
    action: dark ? "#DEDEDE" : "#4A4A4A",
    "action-end": dark ? "#C7C7C7" : "#636363",
    "on-action": dark ? "#222222" : "#FFFFFF",
    link: dark ? "#DEDEDE" : "#484848",
    brand: dark ? "#BFBFBF" : "#626262",
    soft: dark ? "#303030" : "#EEEEEE",
    "soft-alt": dark ? "#363636" : "#E7E7E7",
    border: dark ? "#454545" : "#DDDDDD",
    "control-border": dark ? "#8A8A8A" : "#777777",
    danger: dark ? "#EEEEEE" : "#393939",
    "danger-soft": dark ? "#363636" : "#E7E7E7",
    "scene-color": dark ? "#373737" : "#E6E6E6",
    "page-wash": "none",
    "button-fill": "none",
    elevation: "0 8rpx 28rpx rgba(30,30,25,.035)",
  };
}
module.exports = { palette };

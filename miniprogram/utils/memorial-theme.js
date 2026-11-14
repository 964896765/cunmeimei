"use strict";
function palette(theme) {
  const base = {
    ...require("./palettes").resolvePalette(theme, "pages/me/index"),
  };
  const dark = theme === "dark";
  return {
    ...base,
    background: dark ? "#191919" : "#F5F5F3",
    surface: dark ? "#242424" : "#FFFFFF",
    ink: dark ? "#F4F4F1" : "#262624",
    text: dark ? "#E1E1DE" : "#484844",
    muted: dark ? "#B7B7B2" : "#73736E",
    action: dark ? "#DDDDD7" : "#464640",
    "on-action": dark ? "#22221F" : "#FFFFFF",
    link: dark ? "#DEDED8" : "#4A4A43",
    brand: dark ? "#BFBFB7" : "#62625A",
    soft: dark ? "#30302D" : "#EBEBE7",
    border: dark ? "#454541" : "#E2E2DD",
    "page-wash": "none",
    "button-fill": "none",
    elevation: "0 8rpx 28rpx rgba(30,30,25,.035)",
  };
}
module.exports = { palette };

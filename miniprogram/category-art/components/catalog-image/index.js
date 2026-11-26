"use strict";

const assets = require("../../../utils/category-art");

Component({
  properties: {
    assetId: { type: String, value: "" },
    fallbackSrc: { type: String, value: "" },
    preferFallback: { type: Boolean, value: false },
    lazyLoad: { type: Boolean, value: true },
    neon: { type: Boolean, value: false },
    muted: { type: Boolean, value: false },
    blendMatte: { type: Boolean, value: false },
    dark: { type: Boolean, value: false },
  },
  data: {
    src: "",
    usingFallback: true,
    stage: "",
    frame: "plain",
    imageReady: false,
  },
  observers: {
    "assetId,fallbackSrc,preferFallback": function () {
      if (this.attachedToPage) this.refresh();
    },
  },
  lifetimes: {
    attached() {
      this.attachedToPage = true;
      this.refresh();
    },
    detached() {
      this.attachedToPage = false;
    },
  },
  methods: {
    refresh() {
      const descriptor = assets.describe(this.properties.assetId);
      const usingFallback = this.properties.preferFallback || !descriptor;
      const src = usingFallback ? this.properties.fallbackSrc : descriptor.displayPath;
      this.setData({
        src,
        usingFallback,
        frame: usingFallback ? "plain" : (descriptor.displayFrame || descriptor.frame),
        imageReady: src === this.data.src && this.data.imageReady,
        stage: this.properties.preferFallback
          ? "existing"
          : descriptor?.displayFrame ? "supplied3d" : descriptor?.stage || "",
      });
    },
    imageLoaded() {
      this.setData({ imageReady: true });
    },
    imageFailed() {
      this.setData({
        src: this.data.usingFallback ? "" : this.properties.fallbackSrc,
        usingFallback: true,
        frame: "plain",
        imageReady: false,
      });
    },
  },
});

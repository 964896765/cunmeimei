"use strict";

Component({
  properties: {
    assetId: { type: String, value: "" },
    fallbackSrc: { type: String, value: "" },
    preferFallback: { type: Boolean, value: false },
    muted: { type: Boolean, value: false },
    blendMatte: { type: Boolean, value: false },
    dark: { type: Boolean, value: false },
  },
  data: {
    src: "",
    usingFallback: true,
    stage: "fallback",
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
      this.setData({
        src: this.properties.fallbackSrc,
        usingFallback: true,
        imageReady:
          this.data.src === this.properties.fallbackSrc && this.data.imageReady,
        stage: this.properties.preferFallback ? "existing" : "fallback",
      });
    },
    imageLoaded() {
      this.setData({ imageReady: true });
    },
    imageFailed() {
      this.setData({
        src: this.data.usingFallback ? "" : this.properties.fallbackSrc,
        usingFallback: true,
        imageReady: false,
      });
    },
  },
});

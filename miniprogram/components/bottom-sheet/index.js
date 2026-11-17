Component({
  options: { multipleSlots: true },
  properties: {
    open: Boolean,
    label: String,
    structured: Boolean,
    dismissible: Boolean
  },
  methods: {
    close() {
      if (this.properties.dismissible) this.triggerEvent('close');
    },
    preventScroll() {}
  }
});

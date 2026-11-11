Component({
  properties: {
    open: Boolean,
    label: String,
    dismissible: Boolean
  },
  methods: {
    close() {
      if (this.properties.dismissible) this.triggerEvent('close');
    },
    preventScroll() {}
  }
});

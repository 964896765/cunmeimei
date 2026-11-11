Component({
  properties: {
    open: Boolean,
    title: String,
    description: String,
    error: String,
    confirmText: { type: String, value: '确认' },
    secondaryText: String,
    cancelText: { type: String, value: '取消' },
    busy: Boolean
  },
  methods: {
    confirm() {
      if (!this.properties.busy) this.triggerEvent('confirm');
    },
    secondary() {
      if (!this.properties.busy) this.triggerEvent('secondary');
    },
    cancel() {
      if (!this.properties.busy) this.triggerEvent('cancel');
    },
    preventScroll() {}
  }
});

Component({
  properties: {
    value: String,
    placeholder: { type: String, value: '搜索本地信息' },
    label: { type: String, value: '搜索' },
    focused: Boolean,
    maxLength: { type: Number, value: 80 },
    showSubmit: { type: Boolean, value: true },
    readonly: Boolean,
    disabled: Boolean
  },
  methods: {
    activate() {
      if (this.properties.readonly) this.search();
    },
    input(e) {
      this.triggerEvent('input', { value: e.detail.value });
    },
    search() {
      if (!this.properties.disabled) this.triggerEvent('search');
    },
    clear() {
      if (this.properties.disabled) return;
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
    }
  }
});

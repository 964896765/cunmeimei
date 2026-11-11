Component({
  properties: {
    value: String,
    placeholder: { type: String, value: '搜索本地信息' },
    label: { type: String, value: '搜索' },
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
      this.triggerEvent('input', { value: '' });
      this.triggerEvent('clear');
    }
  }
});

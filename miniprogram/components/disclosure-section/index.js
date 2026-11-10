Component({
  options: {styleIsolation: 'apply-shared'},
  properties: {
    title: String,
    summary: String,
    open: Boolean,
    largeText: Boolean
  },
  data: {expanded: false},
  observers: {
    open(value) {
      this.setData({expanded: !!value});
    }
  },
  methods: {
    toggle() {
      const expanded = !this.data.expanded;
      this.setData({expanded});
      this.triggerEvent('change', {expanded});
    }
  }
});

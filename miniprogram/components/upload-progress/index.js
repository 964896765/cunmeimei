Component({
  properties: {
    busy: Boolean,
    count: { type: Number, value: 0 },
    limit: { type: Number, value: 6 },
    error: String
  },
  methods: {
    retry() {
      this.triggerEvent('retry');
    }
  }
});

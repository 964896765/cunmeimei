Component({
  properties: {
    label: { type: String, value: '联系方式默认隐藏' },
    description: { type: String, value: '按本人授权范围展示' },
    actionText: String
  },
  methods: {
    act() {
      this.triggerEvent('action');
    }
  }
});

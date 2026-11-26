Component({
  properties: {
    kind: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
    actionDisabled: Boolean,
    compact: Boolean,
    embedded: Boolean,
    largeText: Boolean
  },
  data: { heading: '' },
  observers: {
    'kind,title'(kind, title) {
      this.setData({
        heading:
          title ||
          {
            loading: '正在加载',
            error: '暂时未能更新',
            empty: '暂时没有内容',
            login: '登录后继续',
            permission: '当前账号暂无权限'
          }[kind] ||
          '提示'
      });
    }
  },
  methods: {
    act() {
      if (!this.properties.actionDisabled) this.triggerEvent('action');
    }
  }
});

const api = require('../../utils/api');
const owner = () => wx.getStorageSync('city_life_user_id') || '';
Page({
  data: {
    loading: false,
    busy: false,
    error: '',
    canManage: false,
    merchantId: '',
    items: [],
    targetUser: '',
    roleIndex: 1,
    roles: ['manager', 'staff'],
    roleNames: ['经理', '店员']
  },
  onLoad(query) {
    this.setData({ merchantId: query.merchantId || '' });
  },
  onShow() {
    this.disposed = false;
    require('../../utils/theme').apply(this);
    if (this.currentOwner !== owner())
      this.setData({ items: [], canManage: false, targetUser: '', busy: false, loading: false, error: '' });
    this.currentOwner = owner();
    this.load();
  },
  onUnload() {
    this.disposed = true;
    this.version = (this.version || 0) + 1;
  },
  async load() {
    const version = (this.version = (this.version || 0) + 1),
      uid = owner();
    this.setData({ loading: true, error: '' });
    try {
      const response = await api.request(
        'GET',
        '/api/v1/merchants/' + this.data.merchantId + '/members',
        null,
        true,
        uid
      );
      if (this.disposed || version !== this.version || uid !== owner()) return;
      const items = response.items || [];
      this.setData({
        items,
        canManage: items.some(
          (item) => item.userId === uid && item.role === 'owner' && item.status === 'active'
        )
      });
    } catch (error) {
      if (!this.disposed && version === this.version && uid === owner())
        this.setData({ items: [], canManage: false, error: error.message });
    } finally {
      if (!this.disposed && version === this.version && uid === owner())
        this.setData({ loading: false });
    }
  },
  setUser(event) {
    this.setData({ targetUser: event.detail.value.trim() });
  },
  chooseRole(event) {
    this.setData({ roleIndex: Number(event.detail.value) });
  },
  async add() {
    if (!this.data.canManage || this.data.busy) return;
    const uid = owner();
    this.setData({ busy: true, error: '' });
    try {
      await api.request(
        'POST',
        '/api/v1/merchants/' + this.data.merchantId + '/members',
        { userId: this.data.targetUser, role: this.data.roles[this.data.roleIndex] },
        true,
        uid
      );
      if (this.disposed || uid !== owner()) return;
      this.setData({ targetUser: '' });
      wx.showToast({ title: '员工权限已更新' });
      await this.load();
    } catch (error) {
      if (!this.disposed && uid === owner()) this.setData({ error: error.message });
    } finally {
      if (!this.disposed && uid === owner()) this.setData({ busy: false });
    }
  },
  remove(event) {
    if (!this.data.canManage || this.data.busy) return;
    const uid = owner(),
      userId = event.currentTarget.dataset.user;
    wx.showModal({
      title: '移除员工权限？',
      content: '移除后该员工无法继续访问商家业务。',
      success: async (result) => {
        if (!result.confirm || this.disposed || uid !== owner()) return;
        this.setData({ busy: true, error: '' });
        try {
          await api.request(
            'POST',
            '/api/v1/merchants/' + this.data.merchantId + '/members/' + userId + '/remove',
            {},
            true,
            uid
          );
          if (!this.disposed && uid === owner()) await this.load();
        } catch (error) {
          if (!this.disposed && uid === owner()) this.setData({ error: error.message });
        } finally {
          if (!this.disposed && uid === owner()) this.setData({ busy: false });
        }
      }
    });
  }
});

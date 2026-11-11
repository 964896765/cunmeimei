const tones = {
  published: 'success',
  active: 'success',
  approved: 'success',
  verified: 'success',
  accepted: 'success',
  completed: 'success',
  pending: 'pending',
  pending_review: 'pending',
  in_review: 'pending',
  pending_confirm: 'pending',
  rejected: 'danger',
  removed: 'danger',
  disabled: 'danger'
};
Component({
  properties: { label: String, status: String },
  data: { tone: 'neutral' },
  observers: {
    status(value) {
      this.setData({ tone: tones[value] || 'neutral' });
    }
  }
});

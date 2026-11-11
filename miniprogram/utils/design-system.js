'use strict';

const privatePages = [
  'messages',
  'me',
  'chat',
  'login',
  'verification',
  'legal',
  'business',
  'drafts',
  'my-posts',
  'my-bookings',
  'merchant-team'
];

function materialFor(page, preferences) {
  if (preferences.theme === 'clear' || preferences.largeText) return 'clear';
  if (preferences.theme === 'warm') return 'warm';
  const project =
    page.options?.projectId || page.options?.categoryId || page._options?.categoryId ||
    page.data?.attributes?.categoryId || page.data?.workflow?.projectId || '';
  if (['C03', 'C12', 'C22'].some((category) => project.startsWith(category))) return 'warm';
  const name = String(page.route || '')
    .replace(/^\//, '')
    .split('/')[1];
  return privatePages.includes(name) ? 'pearl' : 'quiet';
}

module.exports = { materialFor };

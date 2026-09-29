/**
 * strings.js — centralized nav/label text for the Individual app.
 * Rename a label by editing the value here; do not hardcode display text elsewhere.
 */
const INDIVIDUAL_STRINGS = {
  nav: {
    home: 'Home',
    moves: 'Action',
    proxies: 'Proxies',
    ledger: 'Ledger',
    turnarounds: 'Systems',
    cooperative: 'Cooperative →',
  },
  pageTitle: {
    moves: 'Action',
    proxies: 'Proxies',
    workshop: 'Workshop',
    ledger: 'Ledger',
    turnarounds: 'Systems',
  },
  subsectionTitle: {
    home: 'Overview',
    feed: 'Feed',
    elected: 'Elected',
    financial: 'Financial',
    advocates: 'Advocates',
  },
  movesTab: {
    sign: 'Sign',
    attend: 'Attend',
    volunteer: 'Volunteer',
    vest: 'Assets',
    comments: 'Comments',
  },
  settings: {
    panelTitle: 'Settings',
    profile: 'Profile',
    location: 'Location',
    organizations: 'Organizations',
    communication: 'Communication',
    account: 'Account',
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-nav-key]').forEach((el) => {
    const key = el.getAttribute('data-nav-key');
    const label = el.querySelector('.individual-nav-label');
    if (label && INDIVIDUAL_STRINGS.nav[key]) label.textContent = INDIVIDUAL_STRINGS.nav[key];
  });
  document.querySelectorAll('[data-tab]').forEach((el) => {
    const key = el.getAttribute('data-tab');
    if (INDIVIDUAL_STRINGS.movesTab[key]) el.textContent = INDIVIDUAL_STRINGS.movesTab[key];
  });
});

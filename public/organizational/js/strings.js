/**
 * strings.js — centralized nav/label text for the Organizational app.
 * Rename a label by editing the value here; do not hardcode display text elsewhere.
 */
const ORGANIZATIONAL_STRINGS = {
  nav: {
    dashboard: 'Organization',
    budget: 'Budget',
    accounting: 'Accounting',
    grants: 'Funding',
    contacts: 'Contacts',
    compliance: 'Compliance',
    reports: 'Reports',
    library: 'Library',
    documents: 'Document Vault',
    'solid-pod': 'Solid Pod',
    membership: 'Membership',
    'sponsored-projects': 'Sponsorship',
    cooperative: 'Cooperative',
    'cooperative/workshop': 'Workshop',
    'cooperative/activities': 'Engagement',
    'cooperative/library': 'Library',
    'cooperative/members': 'Members',
    'cooperative/work-pool': 'Work pool',
    'cooperative/systems': 'Systems',
    settings: 'Settings',
  },
  backToIndividual: 'Agency',
};

function applyOrganizationalSidebarStrings() {
  document.querySelectorAll('.organizational-sidebar__link[data-organizational-route]').forEach((el) => {
    const key = el.getAttribute('data-organizational-route');
    const label = el.querySelector('.organizational-sidebar__label');
    if (label && !label.id && ORGANIZATIONAL_STRINGS.nav[key]) label.textContent = ORGANIZATIONAL_STRINGS.nav[key];
  });
}

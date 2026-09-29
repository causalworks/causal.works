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
    'solid-pod': 'Solid Pod', // placeholder name - explicit/technical on purpose while this is demo-facing; revisit once user-facing
    membership: 'Membership',
    'sponsored-projects': 'Sponsorship',
    cooperative: 'Cooperative',
    'cooperative/workshop': 'Workshop',
    'cooperative/activities': 'Engagement',
    'cooperative/library': 'Library',
    'cooperative/members': 'Members',
    'cooperative/work-pool': 'Work pool',
    settings: 'Settings',
  },
  backToIndividual: 'Agency',
};

/** Called by sidebar.js once the sidebar DOM exists (partial may be injected async via outerHTML,
 *  which does not auto-run inline <script> tags — so this can't rely on DOMContentLoaded alone). */
function applyOrganizationalSidebarStrings() {
  document.querySelectorAll('.organizational-sidebar__link[data-organizational-route]').forEach((el) => {
    const key = el.getAttribute('data-organizational-route');
    const label = el.querySelector('.organizational-sidebar__label');
    if (label && !label.id && ORGANIZATIONAL_STRINGS.nav[key]) label.textContent = ORGANIZATIONAL_STRINGS.nav[key];
  });
}

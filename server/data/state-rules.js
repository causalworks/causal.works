'use strict';

const VERIFIED = '2026-10-11';

const STATES = {
  NY: {
    name: 'New York',
    unemployment: {
      wage_base_cents: { 2026: 1760000 },
      wage_base_source: 'https://dol.ny.gov/unemployment-insurance-rate-information',
      wage_base_confidence: 'official',
      rate_note: 'New employers in 2026: 4.1% in total as listed by the state (a normal contribution rate of 3.4% plus other components). Your own rate comes in the state\'s notice to you.',
      rate_source: 'https://dol.ny.gov/unemployment-insurance-rate-information',
      rate_confidence: 'official',
      nonprofit_note: 'A nonprofit may choose to reimburse the state for unemployment benefits actually paid instead of paying contributions. A newly liable nonprofit makes the choice within 30 days after the end of the quarter in which its liability begins.',
      nonprofit_source: 'https://dol.ny.gov/unemployment-insurance-rate-information',
      nonprofit_confidence: 'official',
    },
    workers_comp: {
      note: 'Coverage is required for a nonprofit that pays anyone. The exception: a religious, charitable or educational nonprofit whose only employees are compensated executive officers who do no manual labor. The cost is a rate per $100 of payroll for each class of work, set by your insurer from the rates filed with NYCIRB. Use your policy or quote for the rate, not a guess.',
      source: 'https://www.wcb.ny.gov/content/main/coverage-requirements-wc/nonprofit-no-employees.jsp',
      confidence: 'official',
      rate_bureau: 'NYCIRB',
    },
    disability_pfl: {
      note: 'New York also requires disability and Paid Family Leave coverage for paid staff (same executive-officer exception). It is usually a rider on a disability policy; employers who must carry disability must also carry Paid Family Leave.',
      source: 'https://www.wcb.ny.gov/content/main/coverage-required-db.jsp',
      confidence: 'official',
    },
    form_1099: {
      note: 'We have not confirmed whether New York asks for a state copy of 1099-NEC or 1099-MISC. Check with the New York Department of Taxation and Finance before relying on federal filing alone.',
      source: 'https://www.tax.ny.gov/',
      confidence: 'unconfirmed',
    },
    sales_tax: {
      note: 'A 501(c)(3) applies to the Department of Taxation and Finance on Form ST-119.2. Approval gives a six-digit exemption number (not your EIN) and an exempt purchase certificate to give vendors. Tax paid before approval may be refundable.',
      source: 'https://tax.ny.gov/bus/st/exempt.htm',
      confidence: 'official',
    },
  },

  LA: {
    name: 'Louisiana',
    unemployment: {
      wage_base_cents: { 2026: 700000 },
      wage_base_source: 'https://www.laworks.net/unemploymentinsurance/ui_lainsurancetaxrates.asp',
      wage_base_confidence: 'official',
      rate_note: 'A new employer is given the average rate for its industry (NAICS code) until it qualifies for its own rate, which takes at least 24 months. The industry rate is in the state\'s rate table and your rate notice. The wage base changed from $7,700 in 2025 to $7,000 in 2026 and can change again with the state\'s trust fund balance.',
      rate_source: 'https://www.laworks.net/Downloads/UI/WTS/2026RateTable.pdf',
      rate_confidence: 'official',
      nonprofit_note: 'A 501(c)(3) nonprofit may choose to be a reimbursable employer: it pays dollar for dollar for benefits paid to its former employees and has no percentage rate. Going back to paying contributions is allowed only after two calendar years as reimbursable, and the change must be requested 30 days before the start of the year it applies to. Interest and penalties still apply.',
      nonprofit_source: 'https://www.laworks.net/Downloads/UI/WTS/UI_EmployerTaxGuidelines.pdf',
    },
    workers_comp: {
      note: 'Louisiana employers, nonprofits included, must carry workers\' compensation coverage, with narrow exceptions. The nonprofit exception covers only uncompensated officers and uncompensated board members of certain nonprofits; paid staff are employees. Fines for no coverage start at up to $250 per employee. The cost is a rate per $100 of payroll for each class of work, set by your insurer. Use your policy or quote for the rate.',
      source: 'https://www.laworks.net/FAQs/FAQ_WorkComp_EmployerCoverage.asp',
      confidence: 'official',
      rate_bureau: 'NCCI',
    },
    disability_pfl: null,
    form_1099: {
      note: 'Louisiana asks for a state copy of each 1099-NEC for services performed in Louisiana or by a Louisiana resident, due February 28. A business that files electronically with the IRS on time can use the Combined Federal/State Filing program (Louisiana code 22); otherwise it files directly with the state on transmittal R-91001, and 50 or more forms must be filed electronically. A 1099-MISC goes to the state only for payments of $1,000 or more to non-residents for rents or royalties from Louisiana property, and any form that shows Louisiana tax withheld goes with Form L-3. The Department\'s guidance found is dated 2023 to 2025; check its current instructions before filing.',
      source: 'https://dam.ldr.la.gov/lawspolicies/RIB%2023-006%20State%20Filing%20Requirements%20for%20IRS%20Form%201099-NEC.pdf',
      confidence: 'official',
    },
    sales_tax: {
      note: 'Louisiana does not give 501(c)(3) organizations a general sales tax exemption; federal tax-exempt status does not carry over. Exemptions exist only where a statute provides one, for example an annual application (Form R-1048) to not collect sales tax at qualifying fundraising events, which does not cover the organization\'s own purchases. Parish and local taxes are collected locally; ask the local tax collector.',
      source: 'https://revenue.louisiana.gov/tax-education-and-faqs/faqs/sales-tax/how-do-i-get-a-sales-tax-exempt-number-for-a-non-profit-organization/',
      confidence: 'official',
    },
  },

  NC: {
    name: 'North Carolina',
    unemployment: {
      wage_base_cents: { 2026: 3420000 },
      wage_base_source: 'https://www.des.nc.gov/employers/tax-rate-information',
      wage_base_confidence: 'official',
      rate_note: 'New employers in 2026 start at 1.000%. Your own rate comes in the state\'s notice to you.',
      rate_source: 'https://www.des.nc.gov/employers/tax-rate-information',
      rate_confidence: 'official',
      nonprofit_note: null,
    },
    workers_comp: {
      note: 'Employers with three or more employees must carry coverage; part-time and temporary workers and corporate officers count. Volunteers who receive only reasonable reimbursement are not employees, unless the nonprofit also pays others, in which case they count toward the three. The cost is a rate per $100 of payroll for each class of work, set by your insurer from the rates filed with the NC Rate Bureau. Use your policy or quote for the rate.',
      source: 'https://ncnonprofits.org/node/24394',
      confidence: 'secondary',
      confirm_with: 'the NC Industrial Commission (ic.nc.gov)',
      rate_bureau: 'NC Rate Bureau',
    },
    form_1099: {
      note: 'A copy of a 1099-NEC or 1099-MISC goes to the NC Department of Revenue only when it shows North Carolina income tax withheld. Those copies are filed with Form NC-3, electronically through eNC3, by January 31. Copies that show no NC withholding are not sent to the state.',
      source: 'https://www.ncdor.gov/taxes-forms/withholding-tax/enc3-frequently-asked-questions',
      confidence: 'official',
    },
    sales_tax: {
      note: 'North Carolina does not exempt nonprofits at the time of purchase. Qualifying 501(c)(3) organizations claim a refund of sales and use tax paid on purchases for their work, twice a year: claims for January to June are due October 15, claims for July to December are due April 15, and a claim can be filed within three years of its due date. The Department decides eligibility from your EIN, IRS determination letter and NTEE code. Some purchases (electricity, natural gas, telecommunications, motor vehicles) are not refundable.',
      source: 'https://www.ncdor.gov/taxes-forms/sales-and-use-tax/other-sales-and-use-tax-resources/nonprofit-sales-and-use-tax-information',
      confidence: 'official',
    },
  },
};

function stateRulesFor(code, year) {
  const st = STATES[String(code || '').toUpperCase()];
  if (!st) return null;
  const years = Object.keys(st.unemployment.wage_base_cents).map(Number).sort((a, b) => a - b);
  const useYear = years.includes(Number(year)) ? Number(year) : years[years.length - 1];
  return {
    state: String(code).toUpperCase(),
    state_name: st.name,
    year: Number(year),
    figure_year: useYear,
    verified_on: VERIFIED,
    unemployment: {
      wage_base_cents: st.unemployment.wage_base_cents[useYear],
      wage_base_source: st.unemployment.wage_base_source,
      wage_base_confidence: st.unemployment.wage_base_confidence,
      rate_note: st.unemployment.rate_note,
      rate_source: st.unemployment.rate_source,
      nonprofit_note: st.unemployment.nonprofit_note,
      nonprofit_source: st.unemployment.nonprofit_source || null,
    },
    workers_comp: st.workers_comp,
    disability_pfl: st.disability_pfl || null,
    form_1099: st.form_1099,
    sales_tax: st.sales_tax,
  };
}

module.exports = { STATES, stateRulesFor, VERIFIED };

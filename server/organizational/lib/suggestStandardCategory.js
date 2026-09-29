'use strict';

const { STANDARD_COA_CATEGORIES } = require('../data/standardCoaCategories');

/** Xero Account.Type → Causal org_account_type */
const XERO_TO_ACCOUNT_TYPE = {
  REVENUE: 'income',
  SALES: 'income',
  OTHERINCOME: 'income',
  EXPENSE: 'expense',
  OVERHEADS: 'expense',
  DIRECTCOSTS: 'expense',
  CURRLIAB: 'liability',
  TERMLIAB: 'liability',
  EQUITY: 'liability',
  BANK: 'asset',
  CURRENT: 'asset',
  FIXED: 'asset',
  NONCURRENT: 'asset',
};

function normalizeTypeFromXero(xeroType) {
  const t = String(xeroType || '').toUpperCase().trim();
  return XERO_TO_ACCOUNT_TYPE[t] || null;
}

/**
 * @returns {{ accountType: string, standard_category: string|null, category_label: string|null, needs_review: boolean, xero_equity?: boolean }}
 */
function suggestFromXeroAccount(xeroAccount) {
  const name = String((xeroAccount && xeroAccount.name) || '').toLowerCase();
  const code = String((xeroAccount && xeroAccount.code) || '').trim();
  const xt = String((xeroAccount && xeroAccount.type) || '').toUpperCase().trim();
  const accountType = normalizeTypeFromXero(xt);
  if (!accountType) {
    return {
      accountType: 'expense',
      standard_category: null,
      category_label: null,
      needs_review: true,
    };
  }
  const base = suggestFromNameAndType(name, code, accountType);
  if (xt === 'EQUITY') {
    return {
      ...base,
      accountType: 'liability',
      standard_category: base.standard_category || '30000',
      category_label: base.category_label || '3xxxx — Net assets / equity',
      needs_review: true,
      xero_equity: true,
    };
  }
  return base;
}

/**
 * @param {string} accountName
 * @param {string} code
 * @param {'income'|'expense'|'asset'|'liability'} accountType
 */
function suggestFromNameAndType(accountName, code, accountType) {
  const n = String(accountName || '').toLowerCase();
  let standard_category = null;
  let category_label = null;
  const codeNumMatch = /^(\d+)/.exec(String(code || '').trim());
  const codeNum = codeNumMatch ? parseInt(codeNumMatch[1], 10) : NaN;

  if (accountType === 'asset') {
    if (/cash|bank|checking|savings|petty/.test(n)) {
      standard_category = '10000';
      category_label = '1xxxx — Cash & current assets';
    } else {
      standard_category = '15000';
      category_label = '1xxxx — Other assets';
    }
    return { accountType, standard_category, category_label, needs_review: false };
  }

  if (accountType === 'liability') {
    if (/equity|net asset|fund balance|retained/.test(n)) {
      standard_category = '30000';
      category_label = '3xxxx — Net assets / equity';
    } else {
      standard_category = '20000';
      category_label = '2xxxx — Liabilities';
    }
    return { accountType, standard_category, category_label, needs_review: false };
  }

  if (accountType === 'income') {
    if (/government|federal|state|city|contract|pass.through/.test(n)) {
      standard_category = '41000';
      category_label = '41xxx — Government grants & contracts';
    } else if (/foundation|institutional|corporate grant/.test(n)) {
      standard_category = '42000';
      category_label = '42xxx — Foundation grants';
    } else if (/individual|donor|membership|contribution|donation/.test(n)) {
      standard_category = '43000';
      category_label = '43xxx — Individual contributions';
    } else if (/fee|service|program revenue|contract revenue|tuition|ticket|admission/.test(n)) {
      standard_category = '44000';
      category_label = '44xxx — Earned revenue / fees';
    } else if (/event|gala|auction/.test(n)) {
      standard_category = '45000';
      category_label = '45xxx — Special events';
    } else if (/other income|miscellaneous income|interest income/.test(n)) {
      standard_category = '46000';
      category_label = '46xxx — Other income';
    } else if (/sale|revenue|income|grant|contribution/.test(n)) {
      standard_category = '46000';
      category_label = '46xxx — Other income';
    }
    if (!standard_category && !Number.isNaN(codeNum)) {
      if (codeNum >= 5000 && codeNum <= 5499) {
        standard_category = '43000';
        category_label = '43xxx — Individual contributions';
      } else if (codeNum >= 5700 && codeNum <= 5799) {
        standard_category = '47000';
        category_label = '57xxx — Released / restricted revenue';
      } else if (codeNum >= 4000 && codeNum <= 4899) {
        standard_category = '44000';
        category_label = '44xxx — Earned revenue / fees';
      } else if (codeNum === 4999) {
        standard_category = '46000';
        category_label = '46xxx — Other income';
      }
    }
    return {
      accountType,
      standard_category,
      category_label,
      needs_review: !standard_category,
    };
  }

  if (accountType === 'expense') {
    if (/salary|wage|payroll|benefit|health|retirement|pto|personnel|staff/.test(n)) {
      standard_category = '51000';
      category_label = '51xxx — Personnel';
    } else if (/rent|lease|occupancy|utilities|facilities|janitorial/.test(n)) {
      standard_category = '52000';
      category_label = '52xxx — Occupancy';
    } else if (/phone|internet|software|technology|communications|website/.test(n)) {
      standard_category = '53000';
      category_label = '53xxx — Communications & technology';
    } else if (/travel|meeting|conference|mileage/.test(n)) {
      standard_category = '55000';
      category_label = '55xxx — Travel & meetings';
    } else if (/legal|audit|accounting|consult|professional/.test(n)) {
      standard_category = '56000';
      category_label = '56xxx — Professional services';
    } else if (/fundraising|development|grant writer/.test(n)) {
      standard_category = '58000';
      category_label = '58xxx — Fundraising / development';
    } else if (/admin|general|office|supplies|insurance|bank fee/.test(n)) {
      standard_category = '57000';
      category_label = '57xxx — Administrative & general';
    } else if (/program|project|client|direct service|mission/.test(n)) {
      standard_category = '54000';
      category_label = '54xxx — Program expenses';
    }
    if (!standard_category && !Number.isNaN(codeNum)) {
      if (codeNum >= 6000 && codeNum <= 6199) {
        standard_category = '51000';
        category_label = '51xxx — Personnel';
      } else if (codeNum >= 6200 && codeNum <= 6299) {
        standard_category = '56000';
        category_label = '56xxx — Professional services';
      } else if (codeNum >= 6400 && codeNum <= 6499) {
        standard_category = '52000';
        category_label = '52xxx — Occupancy';
      } else if (codeNum >= 6500 && codeNum <= 6999) {
        standard_category = '59000';
        category_label = '65xxx — Operations (supplies, misc.)';
      } else if (codeNum >= 7000 && codeNum <= 9998) {
        standard_category = '57000';
        category_label = '57xxx — Administrative & general';
      } else if (codeNum === 9990) {
        standard_category = '57000';
        category_label = '57xxx — Administrative & general';
      }
    }
    return {
      accountType,
      standard_category,
      category_label,
      needs_review: !standard_category,
    };
  }

  return { accountType: 'expense', standard_category: null, category_label: null, needs_review: true };
}

function labelForCode(code) {
  const row = STANDARD_COA_CATEGORIES.find((c) => c.code === code);
  return row ? row.label : code;
}

module.exports = {
  XERO_TO_ACCOUNT_TYPE,
  normalizeTypeFromXero,
  suggestFromXeroAccount,
  suggestFromNameAndType,
  labelForCode,
};

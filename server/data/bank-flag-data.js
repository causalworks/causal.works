/** Shared C4CJ / campaign URL for the four largest US fossil banks (for now). */
const PRESSURE_C4CJ_US_BIG_FOUR = 'https://www.bankingonclimatechaos.org/';
const THIRD_ACT_DEFAULT = 'https://thirdact.org';

const BANK_FLAG_DATA = {
  // US — big four share the same C4CJ URL
  chase: {
    display: 'JPMorgan Chase',
    bocc_2024: '$53.5B',
    region: 'US',
    bankgreen_slug: 'jpmorgan_chase',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/jpmorgan_chase',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  jpmorgan: {
    display: 'JPMorgan Chase',
    bocc_2024: '$53.5B',
    region: 'US',
    bankgreen_slug: 'jpmorgan_chase',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/jpmorgan_chase',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  'bank of america': {
    display: 'Bank of America',
    bocc_2024: '$40.9B',
    region: 'US',
    bankgreen_slug: 'bank_of_america',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/bank_of_america',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  citibank: {
    display: 'Citibank',
    bocc_2024: '$34.0B',
    region: 'US',
    bankgreen_slug: 'citibank',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/citibank',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  citigroup: {
    display: 'Citigroup',
    bocc_2024: '$34.0B',
    region: 'US',
    bankgreen_slug: 'citibank',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/citibank',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  'wells fargo': {
    display: 'Wells Fargo',
    bocc_2024: '$26.3B',
    region: 'US',
    bankgreen_slug: 'wells_fargo',
    pressure: {
      c4cj_url: PRESSURE_C4CJ_US_BIG_FOUR,
      bankgreen_action_url: 'https://bank.green/banks/wells_fargo',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  'goldman sachs': {
    display: 'Goldman Sachs',
    bocc_2024: '$18.0B',
    region: 'US',
    bankgreen_slug: 'goldman_sachs',
    pressure: {
      bankgreen_action_url: 'https://bank.green/banks/goldman_sachs',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  'morgan stanley': {
    display: 'Morgan Stanley',
    bocc_2024: '$15.8B',
    region: 'US',
    bankgreen_slug: 'morgan_stanley',
    pressure: {
      bankgreen_action_url: 'https://bank.green/banks/morgan_stanley',
      third_act_url: THIRD_ACT_DEFAULT,
    },
  },
  schwab: {
    display: 'Charles Schwab',
    bocc_2024: null,
    region: 'US',
    bankgreen_slug: 'charles_schwab',
    note:
      'As one of the largest asset managers in the world, Schwab offers funds that invest in fossil fuel companies and the banks that finance them.',
    pressure: {
      bankgreen_action_url: 'https://bank.green/banks/charles_schwab',
    },
  },
  // EU/UK — Bank.Green as primary pressure path
  barclays: {
    display: 'Barclays',
    bocc_2024: '$35.4B',
    region: 'EU',
    bankgreen_slug: 'barclays',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/barclays' },
  },
  hsbc: {
    display: 'HSBC',
    bocc_2024: '$17.3B',
    region: 'EU',
    bankgreen_slug: 'hsbc',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/hsbc' },
  },
  'bnp paribas': {
    display: 'BNP Paribas',
    bocc_2024: '$16.8B',
    region: 'EU',
    bankgreen_slug: 'bnp_paribas',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/bnp_paribas' },
  },
  'deutsche bank': {
    display: 'Deutsche Bank',
    bocc_2024: '$14.5B',
    region: 'EU',
    bankgreen_slug: 'deutsche_bank',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/deutsche_bank' },
  },
  santander: {
    display: 'Santander',
    bocc_2024: '$14.0B',
    region: 'EU',
    bankgreen_slug: 'banco_santander',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/banco_santander' },
  },
  ing: {
    display: 'ING',
    bocc_2024: '$12.1B',
    region: 'EU',
    bankgreen_slug: 'ing',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/ing' },
  },
  'societe generale': {
    display: 'Société Générale',
    bocc_2024: '$11.8B',
    region: 'EU',
    bankgreen_slug: 'societe_generale',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/societe_generale' },
  },
  'credit agricole': {
    display: 'Crédit Agricole',
    bocc_2024: '$10.9B',
    region: 'EU',
    bankgreen_slug: 'credit_agricole',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/credit_agricole' },
  },
  unicredit: {
    display: 'UniCredit',
    bocc_2024: '$9.2B',
    region: 'EU',
    bankgreen_slug: 'unicredit',
    pressure: { bankgreen_action_url: 'https://bank.green/banks/unicredit' },
  },
};

module.exports = { BANK_FLAG_DATA };

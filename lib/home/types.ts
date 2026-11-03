/* Plain data passed from the home page's server components to its client islands. */

export interface BankCollection {
  name: string;
  href: string;
  questions: number;
  pages: number;
}

export interface BankModule {
  name: string;
  href: string;
  questions: number;
  pages: number;
  collections: BankCollection[];
}

export interface TrialOption {
  label: string;
  /** Pre-rendered HTML (KaTeX formulas included). */
  html: string;
}

export interface TrialQuestion {
  id: string;
  subject: string;
  source: string;
  stemHtml: string;
  options: TrialOption[];
  /** Index of the correct option. */
  answer: number;
  /** All options are short enough to share one row. */
  compact: boolean;
  takeawayHtml: string;
  /** The question on its documentation page. */
  href: string;
}

export interface ExamHomeData {
  modules: BankModule[];
  totals: { questions: number; pages: number; modules: number };
  questions: TrialQuestion[];
}

import { DEFINITION_CONTRACT, DEFINITION_SECTIONS, emptySections, type DefinitionSection, type FunctionDefinition } from './definition';

// =============================================================
// Business templates (業務の型, PRODUCT.md §9.4): the starting definitions
// Clayware hands out. A company picks one when it creates a Sustainment, or
// picks a single function when it adds one, and then changes what differs
// for it. Picking copies the text into the Space, in the person's language;
// the copy is the company's own from then on.
//
// Written in English and Japanese; the other languages get the English.
// =============================================================

type Text = { en: string; ja: string };
type Lines = Partial<Record<DefinitionSection, Text[]>>;

export interface FunctionTemplate {
  key: string;
  icon: string;
  name: Text;
  intent: Text;
  sections: Lines;
}

export interface BusinessTemplate {
  key: string;
  icon: string;
  name: Text;
  /** What it is for, the Sustainment's description when picked. */
  purpose: Text;
  functions: FunctionTemplate[];
}

const T = (en: string, ja: string): Text => ({ en, ja });

const CRM: BusinessTemplate = {
  key: 'crm', icon: 'lucide:handshake',
  name: T('CRM', '顧客管理'),
  purpose: T('Keep customers, deals and inquiries in one place, so nobody loses track of who needs what.',
    '顧客・商談・問い合わせを一か所に保ち、誰に何が必要かを見失わないようにする。'),
  functions: [
    {
      key: 'crm.accounts', icon: 'lucide:building-2',
      name: T('Accounts and contacts', '取引先と担当者'),
      intent: T('Sales and support keep one record per customer company and the people they deal with.',
        '営業とサポートが、取引先の会社ごとに一つの記録と、やり取りする担当者を持つ。'),
      sections: {
        things: [T('Account — company name, industry, address, owner in our team', '取引先 — 社名・業種・所在地・自社の担当'),
          T('Contact — name, role, email, phone, which account', '担当者 — 氏名・役職・メール・電話・所属する取引先')],
        facts: [T('Contact made — date, channel, who, summary', '接触 — 日付・手段・誰が・要点')],
        norms: [T('One account per company; merging two is a proposal until someone confirms it', '会社ごとに取引先は一つ。二つをまとめるのは、人が確かめるまで提案のまま')],
        intake: [T('Business cards and email signatures', '名刺とメールの署名')],
      },
    },
    {
      key: 'crm.deals', icon: 'lucide:briefcase',
      name: T('Deals', '商談'),
      intent: T('Sales tracks each deal from first contact to signed order, with the expected amount and date.',
        '営業が商談を最初の接触から受注まで追い、見込みの金額と時期を持つ。'),
      sections: {
        things: [T('Deal — account, stage, owner', '商談 — 取引先・段階・担当')],
        commitments: [T('Expected order — amount, expected close date, confidence', '受注見込み — 金額・受注予定日・確度'),
          T('Next step — what, by when', '次の一手 — 何を・いつまでに')],
        facts: [T('Order received — date, amount', '受注 — 日付・金額'), T('Lost — date, reason', '失注 — 日付・理由')],
        matches: [T('Order received fulfils the expected order', '受注が受注見込みを果たす')],
        norms: [T('Stages: Lead → Proposal → Negotiation → Won / Lost', '段階：見込み → 提案 → 交渉 → 受注／失注')],
        time: [T('A deal with no next step for 14 days is flagged', '次の一手が 14 日ない商談は知らせる')],
        approvals: [T('Discounts over 10% need the sales manager', '10% を超える値引きは営業責任者の承認')],
      },
    },
    {
      key: 'crm.inquiries', icon: 'lucide:message-square',
      name: T('Inquiries', '問い合わせ対応'),
      intent: T('Support answers every inquiry within the promised time and keeps what was asked and answered.',
        'サポートがすべての問い合わせに約束した時間内で答え、聞かれたことと答えたことを残す。'),
      sections: {
        things: [T('Inquiry — from whom, account, topic, priority', '問い合わせ — 誰から・取引先・内容・優先度')],
        commitments: [T('Reply due — by when', '回答期限 — いつまでに')],
        facts: [T('Reply sent — date, by whom', '回答 — 日付・誰が'), T('Closed — date, outcome', '完了 — 日付・結果')],
        matches: [T('Reply sent fulfils reply due', '回答が回答期限を果たす')],
        time: [T('Reply within 1 business day; urgent within 2 hours', '1 営業日以内に回答。緊急は 2 時間以内')],
        intake: [T('Contact form, support email', '問い合わせフォーム、サポート用メール')],
        approvals: [T('Refunds and promises of new features go to a person', '返金と新機能の約束は人が判断する')],
      },
    },
  ],
};

const ACCOUNTING: BusinessTemplate = {
  key: 'accounting', icon: 'lucide:receipt',
  name: T('Accounting', '経理'),
  purpose: T('Bill customers, pay expenses and match money in and out, so the books are right at month end.',
    '請求・経費・入金を正しく記録し、月末に帳簿が合っている状態を保つ。'),
  functions: [
    {
      key: 'accounting.invoicing', icon: 'lucide:file-text',
      name: T('Invoicing', '請求'),
      intent: T('Accounting sends every customer a correct invoice on the closing day and knows what is still unpaid.',
        '経理が締め日にすべての取引先へ正しい請求書を出し、未入金を把握する。'),
      sections: {
        things: [T('Customer — billing address, payment terms', '取引先 — 請求先・支払条件'), T('Invoice — number, issue date, lines, total, tax', '請求書 — 番号・発行日・明細・合計・税')],
        commitments: [T('Payment due — amount, due date', '入金予定 — 金額・支払期日')],
        facts: [T('Delivery or work done — date, quantity, unit price', '納品・作業 — 日付・数量・単価'), T('Invoice sent — date, to whom', '請求書の送付 — 日付・送付先')],
        matches: [T('Each invoice line comes from a delivery', '請求の明細は納品から来る')],
        norms: [T('Tax: standard 10%, reduced 8%; round down per invoice', '税：標準 10%・軽減 8%、請求書ごとに切り捨て'),
          T('Qualified invoice: our registration number on every invoice', '適格請求書：登録番号をすべての請求書に記載')],
        time: [T('Close on the 20th, invoice by the 25th, due end of next month', '20 日締め、25 日までに発行、翌月末払い')],
        approvals: [T('Invoices over ¥1,000,000 are checked by the accounting lead before sending', '100 万円を超える請求書は送付前に経理責任者が確認')],
      },
    },
    {
      key: 'accounting.expenses', icon: 'lucide:wallet',
      name: T('Expenses', '経費精算'),
      intent: T('Members claim what they paid for the company; accounting checks the receipt and pays it back.',
        'メンバーが会社のために払ったものを申請し、経理が領収書を確かめて払い戻す。'),
      sections: {
        things: [T('Claim — who, date, purpose, amount, category', '申請 — 誰が・日付・用途・金額・科目'), T('Receipt — image or PDF', '領収書 — 画像または PDF')],
        commitments: [T('Reimbursement — amount, pay date', '払い戻し — 金額・支払日')],
        facts: [T('Paid by the member — date, amount, shop', '立替 — 日付・金額・店'), T('Reimbursed — date, amount', '払い戻し済み — 日付・金額')],
        matches: [T('Each claim has its receipt', '申請ごとに領収書がある')],
        norms: [T('Meals with customers up to ¥5,000 per person', '取引先との会食は 1 人 5,000 円まで'), T('Claims older than 3 months are not accepted', '3 か月より前の立替は受け付けない')],
        time: [T('Claims close at month end; paid on the 10th', '月末締め、翌 10 日払い')],
        intake: [T('Receipt photos sent by chat or email', 'チャットやメールで送られた領収書の写真')],
        approvals: [T('The member’s manager, then accounting', '本人の上長、次に経理')],
      },
    },
    {
      key: 'accounting.matching', icon: 'lucide:arrow-left-right',
      name: T('Payment matching', '入金消込'),
      intent: T('Accounting matches each bank deposit to the invoices it pays and chases what is overdue.',
        '経理が入金を対応する請求に結び付け、期日を過ぎたものを催促する。'),
      sections: {
        things: [T('Bank account', '銀行口座')],
        commitments: [T('Payment due — from invoicing', '入金予定 — 請求から')],
        facts: [T('Deposit — date, amount, payer name', '入金 — 日付・金額・振込名義')],
        matches: [T('One deposit can pay several invoices, or part of one', '入金 1 件で複数の請求、または一部を消し込める')],
        norms: [T('Bank fee differences up to ¥880 are written off as fees', '880 円までの差額は振込手数料として処理')],
        time: [T('Overdue after the due date: reminder on day 3, call on day 10', '期日を過ぎたら 3 日目に催促メール、10 日目に電話')],
        intake: [T('Bank statement (CSV) every morning', '毎朝の銀行明細（CSV）')],
        approvals: [T('Writing off an unpaid balance needs the accounting lead', '未回収の償却は経理責任者の承認')],
      },
    },
  ],
};

const HR: BusinessTemplate = {
  key: 'hr', icon: 'lucide:users',
  name: T('HR and payroll', '人事・労務'),
  purpose: T('Keep working hours and joining and leaving right, so pay and legal filings are correct.',
    '勤怠と入退社の手続きを正しく保ち、給与と届け出を間違えないようにする。'),
  functions: [
    {
      key: 'hr.attendance', icon: 'lucide:clock',
      name: T('Attendance', '勤怠'),
      intent: T('Members record their working hours; managers check overtime and leave before payroll closes.',
        'メンバーが勤務時間を記録し、上長が給与の締め前に残業と休暇を確かめる。'),
      sections: {
        things: [T('Member — contract type, standard hours', 'メンバー — 雇用形態・所定労働時間')],
        commitments: [T('Shift or planned leave', '予定の勤務・休暇')],
        facts: [T('Clock in / out — date, time', '出勤・退勤 — 日付・時刻'), T('Leave taken — date, kind', '休暇の取得 — 日付・種類')],
        matches: [T('Each day worked matches a shift or is overtime', '勤務した日は予定の勤務か残業のどちらか')],
        norms: [T('Overtime limit: 45 hours a month', '残業の上限：月 45 時間'), T('Five days of paid leave a year must be taken', '年 5 日の有給休暇を取らせる')],
        time: [T('Close on the last day of the month', '月末締め')],
        approvals: [T('Overtime and leave by the member’s manager', '残業と休暇は本人の上長が承認')],
      },
    },
    {
      key: 'hr.onboarding', icon: 'lucide:user-plus',
      name: T('Joining and leaving', '入社・退社の手続き'),
      intent: T('HR makes sure every new and leaving member gets the same steps done, on time.',
        '人事が、入社・退社するすべての人に同じ手続きを期限までに済ませる。'),
      sections: {
        things: [T('Member — start or end date, role, unit', 'メンバー — 入社日または退社日・役割・所属')],
        commitments: [T('Checklist — contract, accounts, equipment, insurance filing', '手続きの一覧 — 契約・アカウント・貸与品・保険の届け出')],
        facts: [T('Step done — date, by whom', '手続きの完了 — 日付・誰が')],
        matches: [T('Each step done ticks the checklist', '完了した手続きが一覧を埋める')],
        time: [T('Social insurance filed within 5 days of joining', '社会保険は入社から 5 日以内に届け出')],
        approvals: [T('Contract terms by the unit lead and HR', '契約条件は所属長と人事が承認')],
      },
    },
  ],
};

const INVENTORY: BusinessTemplate = {
  key: 'inventory', icon: 'lucide:package',
  name: T('Purchasing and stock', '購買・在庫'),
  purpose: T('Order what is needed in time and know how much stock there really is.',
    '必要なものを間に合うように発注し、在庫が実際にいくつあるかを把握する。'),
  functions: [
    {
      key: 'inventory.orders', icon: 'lucide:shopping-cart',
      name: T('Purchase orders', '発注'),
      intent: T('Purchasing orders from suppliers, checks what arrives and passes the supplier’s invoice to accounting.',
        '購買が仕入先へ発注し、届いたものを確かめ、仕入先の請求書を経理へ回す。'),
      sections: {
        things: [T('Supplier — terms, lead time', '仕入先 — 取引条件・納期'), T('Item — code, unit, unit price', '品目 — 品番・単位・単価')],
        commitments: [T('Purchase order — items, quantity, delivery date', '発注 — 品目・数量・納期')],
        facts: [T('Goods received — date, quantity', '入荷 — 日付・数量'), T('Supplier invoice — date, amount', '仕入先の請求 — 日付・金額')],
        matches: [T('Order, receipt and invoice agree (three-way match)', '発注・入荷・請求が一致する（三点照合）')],
        approvals: [T('Orders over ¥300,000 need the purchasing lead', '30 万円を超える発注は購買責任者の承認')],
        intake: [T('Supplier invoices and delivery notes by email', 'メールで届く仕入先の請求書と納品書')],
      },
    },
    {
      key: 'inventory.stock', icon: 'lucide:boxes',
      name: T('Stock and stocktake', '在庫と棚卸'),
      intent: T('The warehouse knows the stock of every item and corrects it with a count each month.',
        '倉庫がすべての品目の在庫を把握し、毎月の棚卸で正す。'),
      sections: {
        things: [T('Item', '品目'), T('Location — warehouse, shelf', '保管場所 — 倉庫・棚')],
        facts: [T('Stock in / out — date, quantity, why', '入庫・出庫 — 日付・数量・理由'), T('Count — date, quantity counted', '棚卸 — 日付・数えた数量')],
        norms: [T('Reorder when stock falls below the safety level', '安全在庫を下回ったら発注する')],
        time: [T('Count on the last business day of the month', '月末の最終営業日に棚卸')],
        approvals: [T('Differences over 2% after a count are checked by the warehouse lead', '棚卸の差異が 2% を超えたら倉庫責任者が確認')],
      },
    },
  ],
};

/** The templates offered when a Sustainment is created, in order. */
export const BUSINESS_TEMPLATES: readonly BusinessTemplate[] = [CRM, ACCOUNTING, HR, INVENTORY];

/** A template's text in the person's language: Japanese for 'ja', else English. */
export function say(text: Text, locale: string): string {
  return locale === 'ja' ? text.ja : text.en;
}

/** The definition a function template starts a function with, in the
 *  person's language. */
export function definitionFromTemplate(tpl: FunctionTemplate, locale: string): FunctionDefinition {
  const sections = emptySections();
  for (const s of DEFINITION_SECTIONS) sections[s] = (tpl.sections[s] ?? []).map((line) => say(line, locale));
  return { contract: DEFINITION_CONTRACT, intent: say(tpl.intent, locale), sections };
}

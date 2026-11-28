// The Space plan's strings (Settings › Plans, the Domain limit, Athena's gate),
// one row per message: [ja, ko, fr, es].
type Row = [ja: string, ko: string, fr: string, es: string];

const PLAN_MESSAGES: Record<string, Row> = {
  'Plans': ['プラン', '플랜', 'Offres', 'Planes'],
  'In the contract': ['契約で決定', '계약으로 결정', 'Au contrat', 'En el contrato'],
  'All plans': ['すべてのプラン', '모든 플랜', 'Toutes les offres', 'Todos los planes'],
  'Billed by use': ['使った分を請求', '사용량만큼 청구', 'Facturé à l’usage', 'Se cobra por uso'],
  '{n} of 2 Domains used': ['Domain 2 つ中 {n} つ使用', 'Domain 2개 중 {n}개 사용', '{n} Domains sur 2 utilisés', '{n} de 2 Domains en uso'],
  '{total} a month for {n} members': ['{n} 人で月 {total}', '{n}명 기준 월 {total}', '{total} par mois pour {n} membres', '{total} al mes para {n} miembros'],
  'One fixed price': ['定額', '정액', 'Un prix fixe', 'Un precio fijo'],
  'Unlimited members on every plan.': ['どのプランも人数は無制限です。', '모든 플랜에서 인원은 무제한입니다.', 'Membres illimités dans toutes les offres.', 'Miembros ilimitados en todos los planes.'],
  'Email us to change plan': ['メールでプラン変更を依頼', '이메일로 플랜 변경 요청', 'Nous écrire pour changer d’offre', 'Escríbenos para cambiar de plan'],
  'Current plan': ['現在のプラン', '현재 플랜', 'Offre actuelle', 'Plan actual'],
  'Fixed price': ['定額', '정액', 'Prix fixe', 'Precio fijo'],
  'per member a month': ['1 人あたり月額', '1인당 월', 'par membre et par mois', 'por miembro al mes'],
  'Unlimited': ['無制限', '무제한', 'Illimité', 'Ilimitado'],
  'Athenya (AI)': ['Athenya（AI）', 'Athenya (AI)', 'Athenya (IA)', 'Athenya (IA)'],
  'Not included': ['含まれない', '미포함', 'Non inclus', 'No incluido'],
  'The Free plan holds up to 2 Domains. Move this Space to Team to add more.': ['Free プランの Domain は 2 つまでです。増やすには、この Space を Team にしてください。', 'Free 플랜은 Domain을 2개까지 둘 수 있습니다. 더 추가하려면 이 Space를 Team으로 바꾸세요.', 'L’offre Free accepte 2 Domains au plus. Passez cet Space à Team pour en ajouter.', 'El plan Free admite hasta 2 Domains. Pasa este Space a Team para añadir más.'],
  'Free plan: up to 2 Domains.': ['Free プランの Domain は 2 つまでです。', 'Free 플랜: Domain 최대 2개.', 'Offre Free : 2 Domains au plus.', 'Plan Free: hasta 2 Domains.'],
  'See plans': ['プランを見る', '플랜 보기', 'Voir les offres', 'Ver planes'],
  'Athenya is available from the Team plan. This Space is on Free.': ['Athenya は Team プランから使えます。この Space は Free プランです。', 'Athenya는 Team 플랜부터 사용할 수 있습니다. 이 Space는 Free 플랜입니다.', 'Athenya est disponible à partir de l’offre Team. Cet Space est sur Free.', 'Athenya está disponible desde el plan Team. Este Space está en Free.'],
};

const column = (index: 0 | 1 | 2 | 3) => Object.fromEntries(Object.entries(PLAN_MESSAGES).map(([key, row]) => [key, row[index]]));

export const PLAN_TRANSLATIONS = { ja: column(0), ko: column(1), fr: column(2), es: column(3) };

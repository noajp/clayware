// A Sustainment's own strings (creating one, its functions and their
// definitions), one row per message: [ja, ko, fr, es]. Words shared with the
// rest of the product (Draft, Delete, Cancel…) keep their translations in
// the other files. "Sustainment" is a concept name and stays as written.
type Row = [ja: string, ko: string, fr: string, es: string];

const SUSTAINMENT_MESSAGES: Record<string, Row> = {
  'What will this Sustainment manage?': ['この Sustainment で何を管理しますか？', '이 Sustainment로 무엇을 관리하나요?', 'Que va gérer ce Sustainment ?', '¿Qué va a gestionar este Sustainment?'],
  'Business templates': ['業務の型', '업무 템플릿', 'Modèles métier', 'Plantillas de negocio'],
  'Blank': ['空の状態から', '빈 상태로', 'Vierge', 'En blanco'],
  'Name it now and add functions inside': ['名前だけ付けて、機能は中で足す', '이름만 정하고 기능은 안에서 추가', 'Nommez-le maintenant, ajoutez les fonctions ensuite', 'Ponle nombre ahora y añade las funciones dentro'],
  'What it is for': ['何のために使うか', '무엇을 위한 것인지', 'À quoi il sert', 'Para qué sirve'],
  'e.g. Bill customers on the 20th and know what is unpaid': ['例：20 日締めで請求し、未入金を把握する', '예: 20일 마감으로 청구하고 미수금을 파악한다', 'ex. Facturer les clients le 20 et savoir ce qui reste impayé', 'p. ej., Facturar a los clientes el día 20 y saber qué queda por cobrar'],
  'Start with these functions': ['最初に入れる機能', '처음에 넣을 기능', 'Commencer avec ces fonctions', 'Empezar con estas funciones'],
  'Each starts as a draft. Change what differs for your company, then publish it.': ['どれも下書きで始まります。自社と違うところを直してから公開します。', '모두 초안으로 시작합니다. 회사와 다른 부분을 고친 뒤 공개하세요.', 'Chacune commence en brouillon. Modifiez ce qui diffère pour votre entreprise, puis publiez-la.', 'Cada una empieza como borrador. Cambia lo que difiere en tu empresa y publícala.'],
  'Add a function': ['機能を追加', '기능 추가', 'Ajouter une fonction', 'Añadir una función'],
  'Add function': ['機能を追加', '기능 추가', 'Ajouter une fonction', 'Añadir función'],
  'Write the definition yourself': ['定義を自分で書く', '정의를 직접 작성', 'Rédiger la définition vous-même', 'Escribe tú la definición'],
  'e.g. Invoicing, Expenses': ['例：請求、経費精算', '예: 청구, 경비 정산', 'ex. Facturation, Notes de frais', 'p. ej., Facturación, Gastos'],
  'Who uses it, and what must always be right': ['誰が使い、何を必ず正しく保つか', '누가 쓰고, 무엇이 항상 맞아야 하는지', 'Qui l’utilise, et ce qui doit toujours être juste', 'Quién la usa y qué debe estar siempre bien'],
  'What differs for your company': ['自社で違うところ', '우리 회사에서 다른 점', 'Ce qui diffère pour votre entreprise', 'Lo que difiere en tu empresa'],
  'e.g. A different closing day, an extra approval step, other names for things': ['例：締め日が違う、承認が一段多い、呼び方が違う', '예: 마감일이 다르다, 승인 단계가 하나 더 있다, 부르는 이름이 다르다', 'ex. Un autre jour de clôture, une approbation de plus, d’autres noms', 'p. ej., Otro día de cierre, una aprobación más, otros nombres'],
  'Could not add the function.': ['機能を追加できませんでした。', '기능을 추가하지 못했습니다.', 'Impossible d’ajouter la fonction.', 'No se pudo añadir la función.'],
  'Add as draft': ['下書きとして追加', '초안으로 추가', 'Ajouter en brouillon', 'Añadir como borrador'],
  'Nothing written': ['まだ書かれていません', '아직 작성되지 않았습니다', 'Rien d’écrit', 'Nada escrito'],
  'Remove “{line}”': ['「{line}」を削除', '“{line}” 삭제', 'Retirer « {line} »', 'Quitar «{line}»'],
  'New line in {section}': ['{section} の新しい行', '{section}의 새 줄', 'Nouvelle ligne dans {section}', 'Nueva línea en {section}'],
  'Function name': ['機能の名前', '기능 이름', 'Nom de la fonction', 'Nombre de la función'],
  'Published {date}': ['{date} に公開', '{date} 공개', 'Publiée le {date}', 'Publicada el {date}'],
  'Published': ['公開中', '공개됨', 'Publiée', 'Publicada'],
  'Publish': ['公開', '공개', 'Publier', 'Publicar'],
  'Edit as draft': ['下書きに戻して編集', '초안으로 되돌려 편집', 'Modifier en brouillon', 'Editar como borrador'],
  'Not published yet. It still needs:': ['まだ公開されていません。次が必要です：', '아직 공개되지 않았습니다. 다음이 필요합니다:', 'Pas encore publiée. Il manque :', 'Aún no se ha publicado. Falta:'],
  'Write what this function is for.': ['この機能を何のために使うかを書く。', '이 기능이 무엇을 위한 것인지 작성하세요.', 'Écrire à quoi sert cette fonction.', 'Escribe para qué sirve esta función.'],
  'Add at least one thing it keeps track of.': ['管理する「もの」を一つ以上足す。', '관리할 ‘대상’을 하나 이상 추가하세요.', 'Ajouter au moins une chose qu’elle suit.', 'Añade al menos una cosa de la que lleva registro.'],
  'Add at least one commitment or fact.': ['「約束」か「事実」を一つ以上足す。', '‘약속’ 또는 ‘사실’을 하나 이상 추가하세요.', 'Ajouter au moins un engagement ou un fait.', 'Añade al menos un compromiso o un hecho.'],
  'In your own words. Then change the lines below to match.': ['自分の言葉で書きます。そのうえで、下の行を合わせて直します。', '자신의 말로 적습니다. 그런 다음 아래 줄을 맞게 고치세요.', 'Avec vos propres mots. Puis modifiez les lignes ci-dessous en conséquence.', 'Con tus propias palabras. Después cambia las líneas de abajo para que coincidan.'],
  'Its definition is removed for everyone in this Space. This cannot be undone.': ['この Space の全員から定義が消えます。元に戻せません。', '이 Space의 모든 사람에게서 정의가 삭제됩니다. 되돌릴 수 없습니다.', 'Sa définition est supprimée pour tout le monde dans ce Space. Cette action est irréversible.', 'Su definición se elimina para todos en este Space. No se puede deshacer.'],
  'Sustainment name': ['Sustainment の名前', 'Sustainment 이름', 'Nom du Sustainment', 'Nombre del Sustainment'],
  'What this Sustainment keeps right for the company': ['この Sustainment が会社のために正しく保つもの', '이 Sustainment가 회사를 위해 올바르게 유지하는 것', 'Ce que ce Sustainment garde en ordre pour l’entreprise', 'Lo que este Sustainment mantiene en orden para la empresa'],
  'Functions': ['機能', '기능', 'Fonctions', 'Funciones'],
  'Could not load the functions. Try again.': ['機能を読み込めませんでした。もう一度お試しください。', '기능을 불러오지 못했습니다. 다시 시도하세요.', 'Impossible de charger les fonctions. Réessayez.', 'No se pudieron cargar las funciones. Inténtalo de nuevo.'],
  'A function is one job this Sustainment does, such as invoicing or expenses. Start from a template and change what differs for your company.': ['機能は、請求や経費精算のように、この Sustainment が受け持つ一つの仕事です。型から始めて、自社と違うところを直します。', '기능은 청구나 경비 정산처럼 이 Sustainment가 맡는 하나의 일입니다. 템플릿에서 시작해 회사와 다른 부분을 고치세요.', 'Une fonction est une tâche de ce Sustainment, comme la facturation ou les notes de frais. Partez d’un modèle et modifiez ce qui diffère pour votre entreprise.', 'Una función es un trabajo que hace este Sustainment, como la facturación o los gastos. Parte de una plantilla y cambia lo que difiere en tu empresa.'],
  'No functions yet': ['まだ機能がありません', '아직 기능이 없습니다', 'Aucune fonction pour l’instant', 'Aún no hay funciones'],
  'Things': ['もの', '대상', 'Choses', 'Cosas'],
  'Commitments': ['約束', '약속', 'Engagements', 'Compromisos'],
  'Facts': ['事実', '사실', 'Faits', 'Hechos'],
  'Matches': ['対応', '대응', 'Rapprochements', 'Correspondencias'],
  'Rules': ['規範', '규범', 'Règles', 'Reglas'],
  'Dates': ['時間', '기한', 'Échéances', 'Fechas'],
  'Intake': ['取り込み口', '수집 경로', 'Entrées', 'Entradas'],
  'Parties, resources, places and documents it keeps track of': ['管理する当事者・資源・場所・文書', '관리하는 당사자·자원·장소·문서', 'Les parties, ressources, lieux et documents qu’elle suit', 'Las partes, recursos, lugares y documentos de los que lleva registro'],
  'What is expected to happen: orders, contracts, budgets': ['これから起きるはずのこと：受注・契約・予算', '앞으로 일어날 일: 수주·계약·예산', 'Ce qui doit arriver : commandes, contrats, budgets', 'Lo que se espera que ocurra: pedidos, contratos, presupuestos'],
  'What actually happened, with the day it happened': ['実際に起きたことと、その日付', '실제로 일어난 일과 그 날짜', 'Ce qui s’est réellement passé, avec sa date', 'Lo que ocurrió de verdad, con su fecha'],
  'Which facts fulfil which commitments': ['どの事実がどの約束を果たしたか', '어떤 사실이 어떤 약속을 이행했는지', 'Quels faits honorent quels engagements', 'Qué hechos cumplen qué compromisos'],
  'Calculations, checks and conditions to keep': ['計算・判定・守る条件', '계산·판정·지켜야 할 조건', 'Calculs, contrôles et conditions à respecter', 'Cálculos, comprobaciones y condiciones que cumplir'],
  'Deadlines, closing days and cycles': ['期限・締め日・周期', '기한·마감일·주기', 'Échéances, jours de clôture et cycles', 'Plazos, días de cierre y ciclos'],
  'Where records come in from: email, PDF, statements': ['記録がどこから届くか：メール・PDF・明細', '기록이 들어오는 곳: 이메일·PDF·명세서', 'D’où viennent les enregistrements : e-mail, PDF, relevés', 'De dónde llegan los registros: correo, PDF, extractos'],
  'Who confirms what, and in which order': ['誰が何を、どの順で確認するか', '누가 무엇을 어떤 순서로 확인하는지', 'Qui confirme quoi, et dans quel ordre', 'Quién confirma qué y en qué orden'],
};

const column = (index: 0 | 1 | 2 | 3) => Object.fromEntries(Object.entries(SUSTAINMENT_MESSAGES).map(([key, row]) => [key, row[index]]));

export const SUSTAINMENT_TRANSLATIONS = { ja: column(0), ko: column(1), fr: column(2), es: column(3) };

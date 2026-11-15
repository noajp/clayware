# Clayware MCP サーバー

外部の AI（Claude Code、Claude、ChatGPT など）やスクリプトから、接続した本人の権限で Clayware のデータを読み書きする入口。

- エンドポイント: `https://clayware.app/mcp`
- 方式: Streamable HTTP（状態を持たない。POST で JSON-RPC を 1 件送り、JSON で応答を受け取る）
- 認証: claude.ai・ChatGPT などのコネクタは OAuth でサインイン、Claude Code やスクリプトは `Authorization: Bearer <個人用アクセストークン>`（`alc_pat_…`）

## できること

Clayware の AI（Athena）がアプリの AI パネルでできることを、接続した外部の AI が本人として行える。考えて進めるのは外部の AI で、Clayware 側のモデルは呼ばれない（Clayware の API の費用はかからない）。

| 範囲 | 読み取り | 書き込み・削除 |
|---|---|---|
| Execution | listMyDomains / listObjects / listElements / getElement / findByText / getProgress / getRecentActivity / listWorkers / listDependencies | Element・Sub-element・Object の作成・更新・削除、移動、Object への結び付け、担当・ラベル・ラベルの色・コメント、依存の追加・削除、一括作成・一括更新・一括削除 |
| Strategy | listInitiatives / getInitiative / getInitiativeExecution | Strategy の作成・更新・削除、成功条件・前提・意思決定の追加・更新・取り下げ、ハーネスの定義を書く、campaignMeasure |
| Table | tableData（list / get） | tableData（Table・列・行・セルの create / update / delete） |
| ファイル・ハーネス | listFiles / searchFiles / readFile / listHarnesses / readHarness | writeFile / createHarness / updateHarness（保存の前にアプリと同じ検査を通し、エラーがあれば保存しない） |
| 記憶・ボード | recall_memory / widgetBoard（list / get） | remember / note_pending_capability / widgetBoard（create / update / delete） |
| 着手・報告 | | claimElement / releaseElement / logProgress / reportOutcome |

道具は Clayware の AI と同じカタログ（`_shared/catalog.ts` の入口 `external`）から出し、同じコードで実行する（`_shared/externalTools.ts` の `agentToolDefs` / `runAgentTool`）。AI パネルと同じく承認待ちにはせず、削除と上書きは MCP の `destructiveHint` を付けて、クライアント側で本人に確かめさせる。出さないのは、仕事を Clayware のモデルに渡す `start_promotion` と、外部サービスへの連携（Space の Connectors）。連携の書き込みは Clayware の AI が承認を通して行う。

REST API（[api.md](api.md)）は、このうち日常の読み書き（`_shared/externalTools.ts` の `EXTERNAL_READ_TOOLS` / `EXTERNAL_WRITE_TOOLS`）だけを、道具ごとの経路で出している。

`createSubelement` / `toggleSubelementComplete` が扱う Sub-element は、親の Element（`parent_id`）を持つ普通の Element で、親と同じ Object に入る。完了は status `done`、再開は `todo`。`getElement` は `subElements` に並べる。

見える範囲と書ける範囲は、アプリでの本人の権限（RLS）と同じ。書き込みは Element の Activity に「… — via Claude Code (MCP · token: laptop)」の形で、どのトークン経由かまで記録され、コメントは AI 名で投稿される。

担当にできるのは、Element と同じ Space の Worker だけ。`listWorkers` は `elementId` を渡すとその Element に割り当てられる Worker を、`objectId` / `domainId` を渡すとその Domain を見られる人を、引数なしなら本人が属する Space 全体の Worker を返す。`addElementAssignee` は Space の外の Worker を `Worker is outside this Element's Space` で断り、`createElement` の `assigneeWorkerIds` は割り当てられない Worker を飛ばして `assigneeError` に名前を返す。`createElement` の `basisIntentIds` には、その Element が何のためにあるか（Strategy の成功条件・前提・意思決定の intent id。`getInitiative` で読める）を渡す。一つずつ判定し、置き換えられた intent、Element の Object が属していない Strategy の intent、編集できない Strategy の intent は結び付けず、`basisError` に id と理由を返す（ほかの id は結び付く）。

Timeline に出る予定も、人が画面で組むのと同じように組める。Element の期間は `createElement`・`createElements`・`updateElement`・`bulkUpdateElements` の `start_date` / `due_date`、Object の期間・アイコン・色・type・Lead は `createObject`・`updateObject` の `start_date` / `due_date` / `icon` / `color` / `type` / `leadWorkerId` で書く。日付は `YYYY-MM-DD`（`null` で解除）で、始まりが終わりより後になる値は断る。アイコンと色はアプリが描ける形（`glyph:<Name>` / `lucide:<kebab-name>` / 絵文字、ラベルの色の名前か `#rrggbb`）だけを受け付ける。

依存は「`waitingId` が `blockerId` を待つ」で、`addDependency` / `removeDependency` / `listDependencies` が Element どうし（`target: "element"`）と Object どうし（`target: "object"`）を扱う。つなぐ端は `kind`（`fs` 終わったら始める・既定 / `ss` / `ff` / `sf`）。輪になる依存は断り、同じ組がすでにあれば、`kind` を渡したときだけ合わせ、渡さなければそのままにする。`listDependencies` は待っている相手（`waitsFor`）と待たれている相手（`blocks`）を、日付が順番に反していれば `conflict` を付けて返す。Timeline が赤い線で描くのと同じ判定。ラベルの色は `setLabelColor` で Domain ごとに決める（決めた色を外すのは Settings から）。Object の Lead にできるのは、その Domain で担当にできる Worker だけ。

## Clayware の考え方を伝える

外部の AI にも、Clayware の設計の考え方で動いてもらうために、3 段で伝える（`_shared/claywareGuide.ts`）。

1. 接続したときにサーバーが渡す説明（instructions）の冒頭に、考え方の要点を置く。人と AI の分担、Strategy → Object → Element、外の世界のものは Table に置くこと、ハーネスに従うこと、仕事を始める前に `getClaywareGuide` を読むこと。
2. `getClaywareGuide` は考え方の全体と、見られる Space ごとの目指す姿（最上位の Strategy）とハーネスの一覧を返す。道具の一覧の先頭に置く。
3. 考え方から外れた操作は、理由と、代わりにどうするかを添えて断る。judge / decide / approve / answer の Element を完了・レビュー待ちにすること（`updateElement`・`bulkUpdateElements`・Sub-element の完了・`reportOutcome` の completed）、`createElement`・`createElements` で最初から完了・レビュー待ちとして作ること、その動詞を外すことは断り、判断の材料をコメントに書くか `reportOutcome` の blocked で人に回すよう返す。REST API の同じ操作も同じく断る。よく取り違えられる道具（`createObject`・`createElement`・`createElements`・`updateElement`・`tableData`）は、説明にも置き場所を書き足す。

Element の `action`（求める行動）は `createElement`・`createElements`・`updateElement` で書ける。

## Element を進めるとき（着手・報告）

外部のエージェントは、Element を進めるあいだ、何をしているかを次の4つで Element に残す。人はアプリの Element の行・コメント・Activity で、誰（どのクライアント）がどこまで進めたかを確かめられる。

| ツール | すること |
|---|---|
| `claimElement` | 着手を宣言する。Element に lease（担い手・ブランチ・40 分の期限）が付き、一覧の行に出る。別のセッション（`.claude/ops/lease.mjs` や他の外部エージェント）が lease を持っている間は、持ち主と期限を添えて断られるので、その Element は進めない |
| `logProgress` | 計画（`steps`）や進捗をコメントに残す。このセッションが lease を持っていれば期限を延ばす。報告が途絶えれば lease は切れる |
| `reportOutcome` | 締めくくる。`completed` は Element をレビュー待ちへ、`blocked`（権限を超える判断・資格情報が要る）はブロック中へ移し、`partial` はステータスを変えない（完了・取り消し済みの Element は動かさない）。`message` は「完了報告／対応が必要です／途中報告」のコメントになり、担当者・Element の owner・Domain の owner に通知される。接続した本人にも「<クライアント名>: 対応が必要です」などの通知が1件届く（担当が本人だけの Element でも判断依頼が埋もれない）。lease は返す |
| `releaseElement` | 報告せずに手を引くときに lease を返す |

lease は `claim_element()` / `release_element()` だけを通して書く。担い手は `<記録名>@<接続した人の ID の先頭 8 文字>.<session>`（例 `Claude Code (MCP · token: laptop)@1a2b3c4d.feat-x`）で、別の人のエージェントが同じクライアント名を名乗っても、他人の lease を取ったり返したりできない。同じトークンで複数のセッションを動かすときは、`session` に作業ごとの名前（worktree 名・ブランチ名）を渡し、4つのツールで同じ値を使う。読み取りのみのトークンには4つとも出ない。

## 認証

個人用アクセストークン（PAT）を使う。アプリの Settings › API で発行する。

- 名前、有効期限（30 日・90 日・無期限）、権限（読み取りと書き込み／読み取りのみ）を選ぶ。平文が表示されるのは発行したときの 1 回だけで、DB にはハッシュだけが残る
- 一覧には、権限・有効期限・最終使用日時と接続元が出る。取り消すと、次の要求から 401 になる
- 関数はトークンを本人の 5 分間の JWT に交換して動くので、見える範囲と書ける範囲はアプリでの本人の権限と同じ。読み取りのみのトークンには読み取りのツール（と、読む操作だけが通る tableData・widgetBoard・campaignMeasure）だけが見え、書き込みは `Unknown tool` か `This connection is read-only` で断られる
- 外部の AI やスクリプトは、トークンを発行・取り消し・一覧できない（アプリからだけ）
- 有効なトークンは 1 人 20 個まで
- パスワードを変更しても、トークンは取り消されない。使わなくなったトークンは取り消す

Supabase のセッションの JWT（1 時間で切れる）も受け付けるが、検証用の代替手段にとどめる。

## claude.ai・ChatGPT から接続する（OAuth）

コネクタの設定にエンドポイントの URL を貼るだけでよい。トークンは要らない。

1. claude.ai の Settings › Connectors › Add custom connector（ChatGPT は Developer mode のコネクタ）に、エンドポイントの URL を入れる
2. Clayware のサインイン画面が開く。サインインすると同意画面（`/oauth/consent`）に、クライアント名・戻り先・できること・できないことが出る
3. 「読み取りと書き込み」か「読み取りのみ」を選んで承認する

接続したアプリは、Settings › API の「Connected apps」に並ぶ。権限を替えたり、切断したりでき、切断すると次の呼び出しから 401 になる。OAuth で発行されたトークンでデータに届くのは、Clayware の MCP（と REST API）を通したときだけで、PostgREST などに直接持ち込んでもデータは読み書きできない。書き込みは「Claude (MCP · OAuth)」の形で記録される。

仕組み：401 の `WWW-Authenticate` が `resource_metadata` で `…/clayware-mcp/.well-known/oauth-protected-resource` を指し、そこに認可サーバー（Supabase Auth の OAuth サーバー、`https://<ref>.supabase.co/auth/v1`）が書いてある。クライアントの登録・PKCE・トークンの発行と更新は Supabase が行う。

## Claude Code から接続する

トークンを発行すると、それを埋め込んだコマンドがコピーボタン付きで表示される。

```bash
claude mcp add --transport http clayware "https://clayware.app/mcp?client=Claude%20Code" --header "Authorization: Bearer alc_pat_…"
```

`?client=` に書いた名前が記録に使われる。省略した場合は、User-Agent から判別する。Authorization ヘッダーを送れる MCP クライアントやスクリプトなら、同じ方法で接続できる。

## デプロイ

```bash
env -u SUPABASE_ACCESS_TOKEN supabase functions deploy clayware-mcp --project-ref rkugtcqztkkacvoylupw --no-verify-jwt --use-api
```

`--no-verify-jwt` を付けるのは、トークンがない場合や、期限切れ・取り消し済みの場合に、関数自身が MCP の形式に沿った 401（保護リソースのメタデータを指す `WWW-Authenticate` 付き）を返し、メタデータをトークンなしで配るため。トークンの検証は関数の中で行う。`_shared/externalTools.ts`・`_shared/boardTools.ts` を変更したら `clayware-api` も、`_shared/catalog.ts` とそこから使う道具を変更したら `run-agent` も再デプロイする。

PAT と OAuth を受け付けるには、Edge Function のシークレット `CLAYWARE_JWT_SIGNING_KEY` に、プロジェクトの JWT シークレット（Legacy JWT secret）を入れる。ない場合、PAT と OAuth のトークンは 500「server not configured」で断られ、セッションの JWT だけが通る。OAuth にはさらに次を行う。

- Authentication › OAuth Server を有効にする（Authorization path は `/oauth/consent`、Dynamic client registration は ON）
- Site URL を本番のアプリにし、Redirect URLs に `<本番のアプリ>/oauth/consent**` を足す（同意画面で登録した人の確認メールが同意に戻るため）
- Authentication › Hooks の Customize Access Token に `public.custom_access_token_hook` を選ぶ。選ばないうちは、関数が OAuth のトークンを 500「OAuth access token hook not enabled」で断る
- 「Require current password when updating」と「Secure email change」を ON にする。Supabase Auth はトークンのロールを見ないので、これがないと、承認されたクライアントが本人のパスワードを変えられる
- MFA を使わない間は TOTP の登録を OFF、ID の手動リンク（Manual linking）とパスキーは OFF のままにする。どれも、承認されたクライアントが本人のトークンで操作でき、ログイン手段を足したり、本人を設定から締め出したりできる

非対称の署名鍵に移ったら、EC の秘密鍵の JWK を入れれば ES256 で署名する。

## 逆向き：Clayware のエージェントが外部サービスを使う

この文書は外部の AI が Clayware を操作する入口を扱う。Clayware のエージェント（run-agent）が Linear・Asana・任意の MCP / API を道具として使う接続は、Settings › Connectors で Space の owner が設定する。資格情報は Vault に置かれ、外部への書き込みは既定で毎回承認を待つ。エージェントは Clayware 自身を指す連携を使わず、Clayware の PAT は連携の資格情報として保存できない（エージェントは開始した人の権限で、盤面の道具をすでに持っている）。

### Google Drive（OAuth）

Google Drive は資格情報を貼り付けず、owner が Google にサインインしてつなぐ。スコープは `drive.file` だけなので、エージェントが扱えるのは Clayware が作ったファイルと利用者が選んだファイルに限られ、作ったファイルは接続した Google アカウントの名義になる。エージェントには `drive_search`・`drive_read`（読み取り）と `drive_create`・`drive_update`・`drive_create_folder`（書き込み、承認を通る）が出る。

アクセスは Google アカウントに付き、Space ごとには分かれない。同じ Google アカウントを 2 つの Space でつなぐと、どちらの Space のエージェントも、もう一方で Clayware が作ったファイルを見られる。また切断は Google で Clayware の許可全体を取り消すので、一方の Space で切断すると、同じアカウントをつないだ他の Space も次のリフレッシュで `oauth_expired`（再接続が必要）になる。

### GitHub（OAuth）

GitHub も資格情報を貼り付けず、owner が GitHub にサインインしてつなぐ（Settings › Connectors から）。スコープは `repo` で、サインインした人が触れるリポジトリを読み書きできる。この接続を、Element のコード変更（差分の取得、判定・行コメントの投稿、マージ）とエージェント（GitHub の MCP サーバー）の両方が使い、投稿・マージ・push はサインインした GitHub アカウントの名義になる。トークンは期限切れにならず、切断（GitHub の grant の取り消し）か、本人が GitHub の Settings › Applications で Clayware を外すまで使える。アクセスが GitHub アカウントに付き、一方の Space で切断すると同じアカウントの他の Space も切れるのは Google と同じ。

### Microsoft 365（OAuth）

Microsoft 365 も資格情報を貼り付けず、owner が職場または学校の Microsoft アカウントでサインインしてつなぐ（Settings › Connectors の「Microsoft 365」から）。サインインは `organizations` のエンドポイントを使うので、個人の Microsoft アカウントは使えない。いま求めるのは `openid` `profile` `offline_access` `User.Read` だけで、接続はサインインした人のプロフィールを読めるところまで。アクセストークンは短く、Microsoft はリフレッシュのたびに新しいリフレッシュトークンを返すので、そのたびに保存し直す。同じ接続を二つの実行が同時にリフレッシュしたときは、遅れた側が先に保存されたトークンを読み直して使う。

組織の多くは、社員が自分でアプリに同意することを止めている。その場合サインインは Microsoft に断られ、アプリに `integration_oauth=admin_consent` で戻って「組織の管理者の承認が必要」と示す。owner は `POST /integration-oauth/admin-consent { integrationId }` で得た承認のリンクを管理者に送り、管理者が承認したあとでもう一度サインインする。管理者の承認はサインインと同じコールバックに戻り、承認されたかを文で返すだけで、何も保存しない。

Microsoft にはこの接続の許可を取り消す口がないので、切断は Clayware に保存したトークンを消すだけで、`/revoke` は `revoked: false` を返す。許可そのものは、組織の管理者が Entra 管理センターのエンタープライズ アプリケーションで外す。

### 接続ごとの OAuth（Custom API / Custom MCP）

Clayware が登録した相手（Google・GitHub・Microsoft）のほかに、OAuth 2.0 の認可コード方式（PKCE つき）でサインインするサービスは、接続ごとの設定でつなぐ。Settings › Connectors の Custom API か Custom MCP で、認証に「Sign in (OAuth)」を選ぶ。owner は先にそのサービスでアプリを登録し、ダイアログに出るリダイレクト URI（下のサインインの流れと同じコールバック）をそこに入れておく。ダイアログに入れるのは次のもの。

| 項目 | 内容 |
| --- | --- |
| Authorization URL | サービスの認可エンドポイント |
| Token URL | サービスのトークンエンドポイント |
| Revocation URL | トークンの取り消しエンドポイント（RFC 7009）。任意 |
| Scopes | 求める scope。空白で区切る |
| Client ID | サービスで登録したアプリの ID |
| Client authentication | トークンエンドポイントでの client の認証。本文で送る（`client_secret_post`）、HTTP Basic（`client_secret_basic`）、secret なし（`none`、PKCE だけで結ぶ公開クライアント） |
| Client secret | アプリの secret。`none` 以外のとき |

設定は `integrations.oauth_config` に置き、client secret だけは Vault（`integration-oauth-client:<id>`）に置く。ブラウザは `set_integration_oauth_client_secret`（owner だけ）で書き、読み返せない。`oauth_client_secret_id` は入っているかどうかだけを示す。サーバーは使うたびに設定を検査し直し、URL は https の公開ホストだけを通す（トークンと取り消しのホストは、送る前に DNS で公開アドレスかを確かめる）。client secret と認可コードはトークン URL にだけ、アクセストークンは接続の endpoint にだけ送る。

トークンは、サインインしたときの接続（種類・endpoint・設定の全体）に結び付けて保存する。endpoint や設定を変えた接続では、それまでのトークンは使われない。データベースも、設定を変えるとトークンを消し、トークン URL・取り消し URL・client ID・client の認証方式を変えると client secret も消す（`integrations_rebind_drops_secret`）。サインインの途中で接続が変わったときは、そのサインインを捨てる。トークンの応答に `expires_in` があればその時刻の 2 分前に更新し、新しいリフレッシュトークンが返れば保存し直す。接続のテストは、Clayware が登録した相手のような本人確認の URL を持たないので、トークンで endpoint そのものを試す。

接続の起草でも、API キー方式のないサービスは OAuth の設定で起草できる。AI は公式ドキュメントから認可 URL・トークン URL・scope・client の認証方式を書き、client は書かない。認可・トークン・取り消しのホストは、人が渡した公式ホスト（なければ endpoint）と同じドメインでなければ通らない。審査画面では、サインインが開くホストと client secret の送り先を示し、API と違うドメインなら注意を出す。owner がそこで client ID と secret を入れてサインインしてから、テストを行う。既存の接続を更新する起草では、テストに使う複製に原本の資格情報を写すのは送り先が同じときだけにする。API キーは endpoint と認証の方式が原本と同じとき、OAuth の client secret はトークン URL・取り消し URL・client ID・client の認証方式がすべて同じときに限る。OAuth のトークンは写さず、owner が複製でサインインする（使うたびに入れ替わるリフレッシュトークンを、複製のテストで原本から奪わないため）。比べる基準は、人が渡したドキュメント URL のホスト（なければ endpoint）で、起草した AI が挙げた出典は使わない。github.io・vercel.app・amazonaws.com のように誰でもホストを持てるドメインでは、同じホストだけを同じとみなす。有効にするときは、テストした設定（client を除く）と仮の接続の設定が一致していることを確かめる。

### サインインの流れ（共通）

サインインは Edge Function `integration-oauth` が行い、連携の行（`google-drive` と `gmail` なら Google、`github` なら GitHub、`microsoft-365` なら Microsoft、それ以外で自分の OAuth 設定を持つ行はその設定）で相手を決める。相手ごとの URL・スコープ・トークンの扱い・本人確認・取り消しは `supabase/functions/_shared/oauthProviders.ts` の表に、接続ごとの設定の扱いは `customOAuth.ts` にある。ブラウザが JWT なしで `/go` と `/callback` に来るので `--no-verify-jwt` で配置し、`/start`・`/finish`・`/revoke`・`/admin-consent` は関数の中で JWT を確かめる。コールバックはトークンを預かるだけで連携には保存せず、アプリに戻ったあと、サインイン中の利用者の JWT で `/finish` を呼んだときに、`/start` を呼んだ本人であり今もオーナーである場合だけ、同じ相手の行に保存する。他人が完了したサインインのトークンは、相手で取り消さずに捨てる（取り消すと、その人が自分の Space で使っている接続まで切れる）。

配置は順番を守る。アプリと関数は `integrations.external_account`・`oauth_config`・`oauth_client_secret_id` を読むので、先に migration `20261006090000_integration_oauth.sql` と `20270113090000_integration_custom_oauth.sql` を本番に適用し、次に関数、最後にアプリを公開する。

```bash
env -u SUPABASE_ACCESS_TOKEN supabase functions deploy integration-oauth --project-ref rkugtcqztkkacvoylupw --no-verify-jwt --use-api
env -u SUPABASE_ACCESS_TOKEN supabase functions deploy integration-test --project-ref rkugtcqztkkacvoylupw --use-api
env -u SUPABASE_ACCESS_TOKEN supabase functions deploy run-agent --project-ref rkugtcqztkkacvoylupw --use-api
env -u SUPABASE_ACCESS_TOKEN supabase functions deploy code-changes --project-ref rkugtcqztkkacvoylupw --use-api
```

Edge Function のシークレットに次を入れる。相手ごとのクライアントか `APP_ORIGIN` がない間、`GET /integration-oauth/status` はその相手を `false`（`{ "google": false, "github": false, "microsoft": false }`）で返し、画面は「… サインインはまだ設定されていません」と示して接続を押せなくする。

| シークレット | 内容 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud の OAuth クライアント（ウェブアプリケーション）の ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 同じクライアントのシークレット |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub の OAuth App の Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | 同じ OAuth App の Client secret |
| `MICROSOFT_OAUTH_CLIENT_ID` | Entra ID のアプリの登録の「アプリケーション (クライアント) ID」 |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | 同じアプリの登録のクライアント シークレットの値。期限（最長 24 か月）が来る前に作り直して入れ替える |
| `APP_ORIGIN` | サインイン後に戻るアプリの origin（例 `https://clayware.example.com`）。パスは付けない。保存を確定する `/finish` はこのアプリから呼ばれるので、ない間はサインインを完了できない（コールバックは何も保存せず「APP_ORIGIN を設定してください」と返す） |

Google の OAuth クライアントには、承認済みのリダイレクト URI として `https://rkugtcqztkkacvoylupw.supabase.co/functions/v1/integration-oauth/callback` を登録し、同意画面に Google Drive の `https://www.googleapis.com/auth/drive.file` と、Gmail の `https://www.googleapis.com/auth/gmail.readonly`・`https://www.googleapis.com/auth/gmail.send` を加える。`gmail.readonly` は Google が制限付きとするスコープで、組織の外の人に使ってもらうには Google の審査が要る。GitHub の OAuth App（GitHub › Settings › Developer settings › OAuth Apps）は、Authorization callback URL に同じ URL を、Homepage URL に `APP_ORIGIN` を入れる。Microsoft は Entra 管理センターの「アプリの登録」で新規に登録し、サポートされるアカウントの種類を「任意の組織ディレクトリ内のアカウント（マルチテナント）」にして、プラットフォーム「Web」のリダイレクト URI に同じ URL を入れる（管理者の承認もここに戻る）。API のアクセス許可には Microsoft Graph の委任されたアクセス許可 `openid` `profile` `offline_access` `User.Read` を加える。他の組織の人が自分で同意できるようにするには、発行元の確認（Microsoft AI Cloud Partner Program の ID とドメインの確認）を済ませておく。確認のないアプリは、管理者の承認がなければ多くの組織で使えない。

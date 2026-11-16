---
name: clayware-design
description: Clayware のアプリ画面（web/）と紹介ページ（website/）の見た目・部品・文言を作る、直す、確かめるときに読む。色・状態の印・一覧の列・進み具合の帯・履歴の線・Status・紹介ページの節やボタンなど、目に見えるものに触る仕事なら必ず使う。
---

Clayware の画面を作るときの決まり。値の正本はコードにあり、ここには「どう決めるか」と「決まったこと」だけを書く。値は `scripts/tokens.mjs` でその場で読む。

## 進め方

どの画面の仕事も、この順で進める。2 と 5 を飛ばした画面は見せない。

1. **今あるものを読む** — 触る画面の部品と、近い画面で同じ役目をしている部品を先に読む。新しく作る前に、同じ形がもうないかを探す（`web/src/ui/`、`Function/shared/`、`website/assets/site.css`）
2. **原則を引く** — Better Design の `get-ui-principle`（見た目）と `get-ux-principle`（ふるまい）を、書く前に引く。デザインシステムは Clayware のもの（`globals.css` のトークンと `ui/` の部品）を使い、外のキットに差し替えない
3. **作る** — 色はトークンだけ。部品は [references/patterns.md](references/patterns.md) の形に合わせる。実際の製品の部品・ロゴ・画面を使い、飾りの絵を作らない
4. **描画して見る** — ブラウザペインで実際に開き、1440px と 390px で見る。ライトとダークの両方。横にはみ出していないかを `document.documentElement.scrollWidth > innerWidth` で確かめる。画面で見た指摘はソースで裏を取る
5. **点検する** — Better Design の `get-review-rules`・`check-comprehension`・`inspect-spacing`（描画した DOM を渡す）。critical と serious は全部直す。そのあと `cd web && npx tsc --noEmit && npm test && npm run lint:changed && npm run unwired-lint && npm run design-lint`

点検の細目は [references/review.md](references/review.md)。

## 決まっていること

### 色

- キーカラーは青 `--accent-default` 一つ。紹介ページの `--color-accent-fill` は同じ青を oklch で書いたもの。二つがずれていないかは `node .claude/skills/clayware-design/scripts/tokens.mjs --check` で見る
- 赤 `--status-danger` は「止まっている・遅れる・危ない」にだけ使う。マイルストーンの菱形も赤
- 黄 `--element-status-review` は「人の確認待ち（In Review・承認依頼）」。ライトでは文字に `--element-status-review-text` を使う（黄のままでは読めない）
- 警告の橙 `--status-warning` は High 優先度と、人だけがする動詞（Judge / Decide / Approve / Answer）
- ラベルの色は意味を持たない。ラベルの Yellow は In Review と同じ値、ラベルの Red は危険の赤に近い。状態は色だけでなく**印の形**で伝え、ラベルを状態の代わりに読ませない
- 生の色は書かない（`design-lint` が止める）。例外はラベルや予定の色のように、ユーザーが選ぶ見本の表だけ

色・面・文字・角丸の全体は [references/tokens.md](references/tokens.md)。

### 部品

- **状態の印** — Element の 7 状態は形で見分ける（点線の輪＝Backlog、輪＝Todo、輪＋扇＝In Progress、半分点線＋矢印＝In Review、塗りのチェック＝Done、輪＋棒＝Blocked、輪＋×＝Cancelled）。並び順は Backlog → Todo → In Progress → In Review → Done → Blocked → Cancelled（`STATUS_ORDER`）
- **進み具合** — Done は 100%。Done から戻すと 75%。メニューの見本は今の値を出す
- **Object と Strategy の Status** — 同じ 5 段階（Backlog / Planned / In Progress / Completed / Canceled）に、Space が独自の Status を足せる。アイコンは既定から変えられる
- **Athena** — 自分の印を持たず、名前の文字だけで出す。モデル名（Claude など）を横に出さない。性能は Most capable / Advanced / Standard / Fast と書く
- **一覧の表**・**進み具合の帯**・**マイルストーンの菱形**・**履歴の線** — 形と寸法は [references/patterns.md](references/patterns.md)

### 文言

- 比喩を使わず、何ができるかをそのまま書く。実装されていることだけを書く
- 「Task」と呼ばず「Element」。Activity の欄は「History（履歴）」
- 紹介ページの書き方・ロゴ・ボタンは [references/website.md](references/website.md)

### AI の置き方

AI はユーザーが呼んだときに使う。画面やファイルごとに AI のボタンや汎用チャットを置かない（入口は Agent 画面）。どの機能も AI なしで動く。

## 進め方の好み（ユーザーから）

- 情報は詰めて見せる。余白を広げて間延びさせない（Asana・Linear の密度）
- 寸法は「最小・既定・最大」を決めてから作る。継ぎはぎで直さず、仕組みから考え直す
- 「端子型」は角の丸い錠剤形（pill）のこと
- 言われた動きと違うことをしない。迷ったら作る前に一行で確かめる
- 見た目の判断は、文書の決まりより実際に描画したもので行う

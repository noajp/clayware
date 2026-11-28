# 器を育てるループ

Sustainment を、会社ごとの業務アプリを組み立てる器に育てるための自走ループ。人の手を待たずに回り続ける。設計は [PRODUCT.md §9](../PRODUCT.md)。

**器は Clayware、中に入るものは会社の業務。** 器のコードに、特定の業種・国・会社の語（請求・給与・消費税・円など）を書かない。それらは会社の側の定義に置く。

## 一周

```
シミュレーション（simulate）
  架空の会社の業務を、器だけで組み立てる → 組み立てられなかった所を「欠け」として起票
        ↓
欠けを直す（vessel）── 1 件 = 1 PR、マージまで
        ↓（欠けが全部閉じたら）
次のシミュレーション ── 前回の欠けが本当に直ったかも確かめる
```

- 板（開発 Domain の Object「Sustainment — 器」）に Element として起票し、dispatcher が拾う。書くのも読むのも Claude
- `simulate` の Element は `.claude/ops/prompts/simulate.md`、`vessel` の Element は `implement.md` で動く
- dispatcher は、`dispatch` の付いた `vessel` の Element が todo か in_progress の間は `simulate` を始めない。人の判断待ちで blocked になった欠けはループを止めない（次のシミュレーションがまた出会い、コメントを足す）。シミュレーションは同時に 1 件だけ
- Element を閉じるのは `vessel.mjs done` / `block`。`lease.mjs release` は lease を外すだけで、状態は変えない
- シミュレーションは終わりに次のシミュレーションを起票する。鎖が切れていたら、毎日の見回りが起票し直す

## シミュレーション

[catalog.md](catalog.md) の上から順に回す。1 件の置き場所は `simulations/<id>/`。

| ファイル | 中身 |
|---|---|
| `scenario.md` | 会社（国・規模・業種）、今のやり方（どこを Excel でつないでいるか）、できたと言える条件 C1〜Cn（観察できる形で） |
| `build.md` | FDE として組み立てた記録。条件ごとに、器のどの部品で組んだか、どこで詰まったか、会社の側に置いたもの |
| その他 | 器が受け付ける形の定義や入力（器が出している入口だけで作ったもの） |

- シミュレーションの中では FDE の立場に立つ。使えるのは器が出している入口（契約・API・画面）だけ。器のコードを書き換えない、DB に直接書かない。器を直すのは欠けの Element の仕事
- シミュレーションのセッションはブラウザを持たない。器の入口がブラウザなしで使えないこと自体が、最初の欠け（FDE の入口）になる
- 条件は、器ができていれば機械で確かめられる形にする。器が再生を持ったら、各シミュレーションは CI の回帰試験になる
- 会社の業務の中身（科目・税率・承認の段階・締め日）は会社の側に置く。器に入れるのは形だけ

## 欠け

組み立てられなかった所のうち、次の 2 つを満たすものだけを欠けとして起票する。満たさないものは会社の側の定義として `build.md` に書く。

1. 特定の会社の業務ではなく、器の部品（型・つながり・操作・規則・計算・取り込み・画面・権限・履歴など）の話である
2. catalog の別のシミュレーションも、それなしでは組み立てられない（2 件以上を名前で挙げる）

1 回のシミュレーションで起票するのは 3 件まで。同じ欠けがすでにあれば、新しく作らずその Element に観察をコメントする。

欠けの description は `## 観察`（シミュレーションの id と条件の番号、何が起きたか）/ `## 器に足りないもの`（なぜ他の会社にも要るか）/ `## 既にあるもの` / `## 最小の案` / `## 受け入れ条件`（どのシミュレーションのどの条件が通れば閉じるか）。

## 測るもの

シミュレーションごとに、条件のうち器を変えずに組み立てられた数 / 条件の数（組み立て率）を catalog に残す。目標は、新しいシミュレーションが最初の一回で組み立てられること。それが、FDE が実際の会社に入って器から即組み立てられる状態の目安になる。

## 止まるとき

[clayware スキル](../skills/clayware/SKILL.md) の 4 つ（費用・取り消せない操作・根拠で決めきれない設計の判断・同じ原因で 2 回進まない）だけ。止まるときは `node .claude/ops/vessel.mjs file --kind decision` で判断を起票し（同じ Object に `decision` ラベルで入り、Space の owner に reviewer として割り当てて通知する）、その判断に関係しない仕事を先に進める。

緊急停止は `update dev_control set paused = true, note = '理由' where id = 1;`（dispatcher がすべて止まる）。

## 道具

```bash
node .claude/ops/vessel.mjs open                                          # 開いている Element
node .claude/ops/vessel.mjs closed                                        # 閉じた Element（新しい順）
node .claude/ops/vessel.mjs done|block|reopen <display_id>                # 状態を変える（dispatch も付け外し）
node .claude/ops/vessel.mjs file --kind gap --title "…" --file body.md    # 欠け
node .claude/ops/vessel.mjs file --kind sim --title "…" --file body.md    # 次のシミュレーション
node .claude/ops/vessel.mjs file --kind decision --title "…" --file body.md
```

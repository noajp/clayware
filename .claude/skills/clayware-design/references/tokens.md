# トークン

正本はアプリが `web/src/app/globals.css`（と `web/src/shared/designTokens.ts`）、紹介ページが `website/assets/tokens.css`。今の値はその場で読む。

```bash
node .claude/skills/clayware-design/scripts/tokens.mjs            # アプリの全トークン（ライト / ダーク）
node .claude/skills/clayware-design/scripts/tokens.mjs status     # 名前に status を含むものだけ
node .claude/skills/clayware-design/scripts/tokens.mjs --site     # 紹介ページ（ダークが既定）
node .claude/skills/clayware-design/scripts/tokens.mjs --check    # キーの青の一致、ラベルと状態色の重なり
```

## 役目ごとの使い分け

| 役目 | アプリ | 紹介ページ | 使う所 |
|---|---|---|---|
| キーの青 | `--accent-default` / `--accent-hover` / `--accent-subtle` | `--color-accent-fill`（面）・`--color-accent`（文字） | 主ボタン、選択、Done、履歴の本線、予定どおりの帯 |
| 危険 | `--status-danger`（文字は `--status-danger-text`） | `--color-error` | Blocked、遅れ、Urgent、マイルストーン |
| 確認待ち | `--element-status-review`（文字は `-text`） | `--color-seal`（文字は `--color-seal-ink`） | In Review、承認依頼の枝 |
| 警告 | `--status-warning` | — | High、人だけの動詞 |
| 成功 | `--status-success` | `--color-success` | 完了の知らせ |
| 進行中 | `--element-status-in-progress` | — | In Progress の印だけ |
| 面 | `--surface-bg` < `--surface-muted` < `--surface-raised`、`--surface-rail`、`--surface-overlay` | `--color-paper` / `-2` / `-3` | 背景・島・メニュー |
| 文字 | `--text-primary` / `-secondary` / `-tertiary` / `-disabled` | `--color-ink` / `-2` / `--color-muted` | 本文・補足・無効 |
| 線 | `--border-subtle` / `-default` / `-strong` | `--color-rule` / `-strong` | 区切り |
| グラフ | `--chart-1`〜`--chart-6` | — | 系列の色（状態色を系列に流用しない） |

- 状態色には `-subtle`（15% の下地）と `-text`（文字用に濃くしたもの）がある。下地に塗るときは `-subtle`、小さな文字は `-text`
- ダークのテーマは `.dark` を土台に、Midnight / Carbon / Graphite が面だけを上書きする。ライトは Snow / Ivory / Mist。面の段の順（bg → raised → muted → rail → overlay）はどのテーマでも同じなので、値ではなく段で選ぶ

## 文字・角丸・動き

- 書体はアプリが `--font-sans`（Inter Variable ＋ Clayware JP）、本文 13px。数字の列は `tabular-nums`。紹介ページは Geist
- 角丸は `--radius-xs` 5 / `-sm` 8 / `-md` 10 / `-lg` 12、錠剤形は `--radius-full`（紹介ページは `--radius-pill`）
- 動きは `--motion-fast`（150ms）を基本に、大きく動くものだけ `--motion-slow`
- 操作部品の高さ・文字の大きさは `designTokens.ts` の `CONTROL` / `FONT` / `FIELD` を使い、その場で px を決めない

## ラベルの色

`web/src/Function/shared/labelColor.ts` の 9 色（Grey / Dark Grey / Purple / Teal / Green / Yellow / Orange / Pink / Red）と、色を選ぶ前に名前から決まる 10 色。ラベルは分類であって状態ではない。Yellow は In Review と同じ値なので、ラベルの横に状態の印を必ず並べ、色だけで読ませない。

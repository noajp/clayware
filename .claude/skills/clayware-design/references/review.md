# 点検

描画していない画面は確かめていない画面として扱う。

## Better Design

1. `get-review-rules` を引き、その観点で画面を見る
2. `check-comprehension` — 初めて見た人が、この画面が何で、次に何をすればよいか分かるか
3. `inspect-spacing` — 描画した DOM（`read_page` や `javascript_tool` で取った要素の位置と大きさ）を渡す
4. critical と serious は全部直してから、もう一度 1〜3

## 画面で見ること

- ライト / ダーク、1440px / 390px。横はみ出し：`document.documentElement.scrollWidth > innerWidth` が false
- 色はトークンから来ているか（`getComputedStyle` で値を見て、`tokens.mjs` の値と比べる）
- 状態が色だけでなく形でも分かるか。小さな黄の文字は `-text` の色か
- キーボードだけで操作でき、フォーカスが見えるか
- 文字が切れる所は「…」で終わり、全文がツールチップやメニューで読めるか
- 空のとき・1 件のとき・たくさんのとき（一覧なら 100 行以上）を見る

## ブラウザペインの注意

- `find` はボタンを generic と出すことがある。押せるかどうかはソースで確かめる
- ペインの表示言語は英語。日本語の画面は言語設定を切り替えて見る
- port 3000 が別の worktree のビルドを出していることがある。見ているのが自分の変更か、表示で確かめる

## コード

```bash
cd web && npx tsc --noEmit && npm test && npm run lint:changed && npm run unwired-lint && npm run design-lint
node .claude/skills/clayware-design/scripts/tokens.mjs --check
```

# 部品の形

どの部品も正本はコード。寸法の理由はコードのコメントにある。ここには、作り直すときに外してはいけない形だけを書く。

## 状態の印 — `Function/shared/ElementProgressMark.tsx`

- 7 状態を形で見分ける：点線の輪（Backlog）、輪（Todo）、輪＋進み具合の扇（In Progress）、半分点線＋矢印（In Review）、塗りのチェック（Done）、輪＋棒（Blocked）、輪＋×（Cancelled）
- 色は `--element-status-*`。In Progress は緑、Done はキーの青、Blocked は赤
- 並びは `designTokens.ts` の `STATUS_ORDER`。Blocked は Cancelled の前
- 進み具合：Done にすると 100%、Done から戻すと 75%（DB のトリガー `elements_reopened_progress` が守る）。選ぶメニューの見本は今の値を出し、Done は 100% と読む（`statusProgress.ts`）

## 優先度

Urgent（赤）/ High（橙）/ Medium / Low（灰の濃淡）/ 未設定。`PRIORITY_ORDER` の順。

## Status — `workStatus.ts`・`WorkStatusPicker.tsx`・`StatusPicker.tsx`・`ElementStatusMark.tsx`・`settings/StatusSettings.tsx`

- Object と Strategy は 5 段階 Backlog / Planned / In Progress / Completed / Canceled（設定 › Objects › Statuses）。Element は上の 7 段階（設定 › Elements › Statuses）。どちらも Space が段階ごとに Status を足せる
- Element の Status は段階（`status`）と、その中の Status（`status_id`）の組。書くときは必ず段階と一緒に書く（`elementStatusWrite`）。アイコンを選んでいない Element の Status は、その段階の印（`ElementProgressMark`）で描く。表示は `ElementStatusMark` と `useElementStatusName` を通す
- 一つの Status は「段階・名前・アイコン・色」。アイコンは共通の `itemIcon/IconPicker` で選ぶ：製品のアイコン、絵文字、Custom（SVG のアップロードと、Athena に言葉で頼んで描かせた下書き）。色はラベルの 9 色。アイコンを選ぶ場所を部品ごとに作らない
- アップロードや生成の SVG は `itemIcon/svgIcon.ts` が図形だけに絞り、色をすべて `currentColor` にしてから保存する。描くときも同じ規則で読み直し、React の要素で描く（innerHTML にしない）
- Object と Strategy は同じ部品を使う。片方だけの Status を作らない

## アイコン — `web/src/ui/icons/glyphs.tsx`

- 16 の格子で描く。「もの」（Box・Component・Tiers など）は塗り＋細い切れ込み、「動作」は 1.5 の線
- 概念には決まったアイコンがある：Strategy＝GuidingStar、Domain＝Tiers、Object＝Box、Element＝Component（`Function/shared/conceptIcons.tsx` の `DomainIcon` などを使い、グリフを直接選ばない）
- Lucide の名前で書き出してあるので、新しく使うときもまず `ui/icons` から探す

## 一覧の表 — `Function/shared/listTable/`

- 列はすべて同じ幅 104px（`PITCH`）で開く。これが最小でもある。見出しが等間隔に並ぶのが目的
- 最大は値の種類で決める：日付 160（月日を漢字で書く言語は 168）、人 240、チップ 320、選択肢 220、文 400、数 160、チェック 104、帯 240、更新 160、件数 120
- 数と件数は見出しも値も右揃え。ほかは左
- 右詰め：Name（題名）が列の残りを全部取る。Name は手で 800 まで広げられ、残りより狭くはならない。題名は 320 まで必ず見え、列が多いと題名の端の下へ左の列から隠れて横にスクロールする
- 境目は普通の右端の取っ手。左へ引けばその列が狭まり、境目は指の下に留まる。ダブルクリックで中身に合わせる。手で決めた幅は `user_preferences.list_layouts` に残す（`set_list_layout`）
- 80 行を超えたら見えている所だけ描く（`rowWindow.ts`）。矢印キーでセルを移れる

## 進み具合の帯 — `ProgressBelt.tsx`・`pace.ts`

- 予定どおりなら青、余裕が薄い（0 < 見込み < 0.5）と先端が赤に寄り、遅れていれば赤
- 状態で変わる：Blocked と期限切れは赤（`withStates`）。Done と Cancelled は色を塗らない（`warnsAboutTime`）
- 日付を変えたらその場で塗り直す

## マイルストーンの菱形 — `MilestoneDiamond.tsx` の `ProgressDiamond`

- 菱形の枠だけ、20px、線 1.8、色はキーの赤 `--status-danger`
- 中は進み具合で時計回りに塗る（`milestoneProgress.ts`）

## 履歴の線 — `ActivitySpace/execution/element/ActivityFeed.tsx`・`historyLine.ts`

- 欄の名前は「History（履歴）」
- 本線はキーの青。仕事を動かしたもの（作成・状態・移動・引き継ぎ）が線の上の点。いちばん新しい点は輪（今の状態）
- 承認依頼は黄の枝として本線から分かれ、承認で戻る。差し戻しと承認なしの終了も枝の上の点
- 日付・担当・文言の細かい変更は一つの番号付きの点にたたみ、開けば見える。点が 8 を超えたら古い分は「Earlier · n」にまとめる
- 1 行 26px。何が起きたかを 1 行で、時刻は右端。誰が・何を通して・全文はツールチップ
- 起票が起点。誰がしたかより、何が起きたかを線に出す

## Athena と動詞

- Athena は印を持たず名前の文字だけ。モデル名を出さない。性能は Most capable / Advanced / Standard / Fast（`athenaSettings.ts`・`AthenaControls.tsx`）
- 人だけの動詞 Judge / Decide / Approve / Answer は警告の橙。ほかの 9 動詞は AI もできる

## 面と島

- 画面は `--surface-bg` の上に `--surface-raised` の島を置く。カードは `designTokens.ts` の `CARD` / `CARD_FLAT` を使う
- メニューやダイアログは `--surface-overlay` と `--shadow-overlay`

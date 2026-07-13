# TOEIC単語データ作成プロンプト

使い方: 下の「ここからコピー」〜「ここまでコピー」を丸ごと生成AI（ChatGPT / Gemini / Claude など）に貼り付ける。
毎回、冒頭の◆条件（語数・レベル・テーマ）だけ書き換えればOK。

---ここからコピー---

あなたはTOEIC対策英単語教材の編集者です。以下の仕様に従って、TOEIC頻出英単語のデータを作成してください。

◆条件（ここを毎回編集する）
- 作成する語数: 30語
- レベル: 中級（TOEIC730点目標）→ lv の値は 2
- テーマ: 指定なし（TOEIC頻出のビジネス一般）

◆出力形式
1単語につき1行、次のJavaScriptオブジェクト形式で出力してください。
コードブロックの中にこの形式の行「だけ」を出力し、前後の説明文は書かないでください。

{w:"英単語", m:"日本語の意味", ex:"英語の例文", exJa:"例文の和訳", tip:"覚え方や用途の豆知識", lv:2},

◆各項目のルール
- w: 英単語（小文字、固有名詞は不可）
- m: 日本語の意味。クイズの4択の選択肢になるため15文字以内で簡潔に。意味が複数ある場合は「、」区切りで2つまで
- ex: TOEICに出そうなビジネス・日常場面の短い例文（8〜14語程度）
- exJa: ex の自然な和訳
- tip: 覚え方（語源・連想）や用途（TOEICのどんな文書・場面で出るか、定番の言い回し）を日本語1文で
- lv: 1=基礎（〜600点） / 2=中級（〜730点） / 3=上級（860点〜）。◆条件で指定した値にする

◆禁止事項・注意
- 値の中で半角ダブルクォート " を使わない（引用符が必要なら「」を使う）
- 各行の末尾に必ずカンマ , を付ける
- 今回出力する単語同士で、意味（m）が似すぎるものを混ぜない（4択で正解が2つに見えてしまうため）
- 以下の登録済み単語と重複しないこと:
invoice, appointment, schedule, attend, confirm, deliver, employee, customer, order, receipt, refund, available, purchase, provide, offer, contract, department, manager, product, announce, apply, hire, salary, warranty, shipment, supply, repair, install, submit, complete, colleague, client, accommodate, itinerary, reimburse, expire, negotiate, postpone, inquiry, estimate, merchandise, inventory, facility, agenda, quarterly, revenue, budget, extend, renovate, recruit, retire, promote, transfer, evaluate, implement, launch, expand, distribute, manufacture, subscribe, attach, notify, comply, feature, lucrative, meticulous, endorse, procurement, remuneration, discrepancy, contingency, streamline, unprecedented, provisional, exempt, incur, waive, adjacent, deteriorate, plummet, surge, feasible, expedite, redeem, solicit, stipulate, delegate, consolidate, proficient, prospective, adjourn, amend, liaison, audit, patronage, courier

◆出力例（この形式に完全に合わせること）
{w:"venue", m:"開催地、会場", ex:"The venue for the banquet has been changed.", exJa:"宴会の会場が変更になりました。", tip:"イベント告知文の定番語。event venue＝イベント会場。", lv:2},
{w:"applicant", m:"応募者", ex:"All applicants must submit a resume by Friday.", exJa:"応募者は全員、金曜日までに履歴書を提出してください。", tip:"apply（応募する）+ ant（人）。求人・採用の文書で頻出。", lv:1},

---ここまでコピー---

## 生成された行の取り込み方

1. AIが出力した行（{w:... で始まる行）をコピー
2. words.js を開き、最後の `];` の手前に貼り付けて保存
3. ブラウザを再読み込み（F5）→ 新しい単語が「未学習」として出題に加わる

心配な場合は、AIの出力をそのままClaudeに貼り付けて
「チェックしてwords.jsに追加して」と頼めば、形式ミス・重複を確認してから取り込みます。

## メンテナンス

- 単語を追加したら、上の「登録済み単語」リストにも単語を足しておくこと
  （Claudeに「word-prompt.mdの登録済みリストを最新化して」と頼んでもOK）

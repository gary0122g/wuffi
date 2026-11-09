wuffi — 免費開源 Markdown 編輯器

原始碼：https://github.com/gary0122g/wuffi
問題回報：https://github.com/gary0122g/wuffi/issues
客服：support@wuffi.app

使用方式
wuffi 以 MIT 授權開源，沒有試用期限、付費啟用或裝置數量限制。
所有編輯器功能可直接使用；舊版試用與授權紀錄不會再被讀取。
Ctrl+O 開啟 Markdown，Ctrl+S 儲存，Ctrl+/ 切換視覺與原始碼，Ctrl+J 開啟 AI 面板。
文章與草稿保存在本機，請定期把重要文章另存為 .md 並自行備份。
手動唯讀模式、存檔衝突確認與檔案存取保護仍然有效。

AI 連線
模型不隨編輯器安裝或啟動，需自行準備相容的 OpenAI chat-completions 模型服務。
AI 面板「⋯」可設定 API 基底網址與模型；預設為 http://127.0.0.1:8080/v1。
外部模型供應者可能另行收費。不要在網址填入密鑰。
只有送出請求時，選取或文章內容及對話才會傳給你設定的服務。
修改建議可逐句接受或拒絕，模型結果應先經使用者檢查。

隱私與離線使用
一般編輯與草稿恢復在本機進行，沒有背景上傳文章或商業授權驗證。
狗狗夥伴照片保存在本機。圖片上傳僅在使用者要求時交給已設定的服務。
首次需要 Pandoc 轉檔時會詢問下載，約 40 MiB、安裝後約 225 MiB。
驗證並安裝後可離線使用；取消或下載失敗不影響 Markdown 編輯與儲存。

版本與授權
目前主要驗證 Windows x64。原始碼與建置方法見 GitHub README。
軟體依 MIT 授權按現狀提供，完整條文見隨附 LICENSE。
第三方程式及字型保留各自授權，見 THIRD_PARTY_NOTICES.md 與 licenses 目錄。
Pandoc 的授權文件會隨工具下載。專案尚未提供自動更新器。

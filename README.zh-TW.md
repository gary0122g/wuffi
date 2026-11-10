# wuffi

自動更新：到 **設定 → 一般 → 軟體更新** 檢查版本。啟動時可背景檢查，確認後才從 GitHub Releases 下載並驗證更新簽章。請先儲存所有視窗的文件再安裝。舊版 rc.3 使用者需要先手動安裝 rc.4 一次。更新簽章與 Windows 發行者簽章不同；目前 Windows 安裝程式仍未取得 SignPath 簽章。

[Code signing policy／程式碼簽署政策](CODE_SIGNING.md) · [桌面版隱私政策](PRIVACY.md)

**留點空間，給想寫的話。也給陪你寫字的小夥伴。**

[wuffi 官網](https://wuffi.app/) · [English](README.md) · **繁體中文**

![wuffi 寫作夥伴](assets/brand/wuffi.png)

wuffi 是免費、開源的 Markdown 桌面編輯器。寫筆記、整理靈感，或慢慢完成一篇故事：文章留在自己的電腦，編輯方式由你選，想找人討論時，再叫出 AI 寫作夥伴。

文字是你的，決定也是。AI 可以提出修改，你可以逐句接受或拒絕。

## 寫得自在一點

- **用習慣的方式寫。** 視覺編輯、Markdown 原始碼、對照預覽、大綱、搜尋與取代。
- **把注意力留給文章。** 專注模式、打字機模式、主題與快捷鍵。
- **不只寫段落。** 加入表格、程式碼、本機圖片、公式與圖表。
- **作品留在身邊。** 本機檔案、持久草稿、資料夾搜尋，以及存檔衝突保護。
- **寫完就帶走。** 匯出 HTML、PDF、列印，或透過 Pandoc 轉換 Word、EPUB 等格式。
- **卡住時，聊一聊。** 和 AI 討論想法，或逐句檢視文章修改建議。
- **找個小夥伴。** 選一隻狗狗陪你寫，也可以換成自己的照片。

桌面編輯與 Local AI 不需要帳號。沒有試用倒數、啟用碼或訂閱解鎖。

## 下載與安裝

[下載 Windows x64 安裝程式](https://github.com/gary0122g/wuffi/releases/tag/v1.0.0-rc.6)

下載 `wuffi_1.0.0-rc.6_x64-setup.exe`，雙擊安裝，完成後從開始功能表開啟 **wuffi**。不需要 Node.js、Rust 或自行編譯。安裝程式會在缺少 WebView2 時連網安裝。

這份安裝程式尚未數位簽署，Windows 可能顯示未知發行者。下載頁提供 SHA-256 校驗值。支援 Windows 10／11 x64。

## 從原始碼啟動

以下建置方式適用於 **Windows x64**。請先安裝 Git、Node.js **22.13 以上**、Rust **1.90 以上**（MSVC）、包含 Windows SDK 的 Visual Studio C++ Build Tools，以及 WebView2 Runtime。

```powershell
git clone https://github.com/gary0122g/wuffi.git
cd wuffi
npm ci --ignore-scripts
npm run dev
```

`npm run dev` 會建置並啟動本機開發版；之後用 `npm start` 啟動已建置的版本。也可以雙擊 `Start-Wuffi.cmd`，第一次會安裝依賴並建置。製作安裝程式使用 `npm run release`。

Markdown 檔案放在你選擇的位置。第一次需要 Pandoc 轉檔時，會經你確認後下載；安裝完成後，這些轉檔也能離線使用。

## wuffi 雲端 AI

開啟 **設定 → AI**，把來源切換成 **wuffi 雲端 AI**，按「登入 wuffi」。在瀏覽器登入官網帳號，按一下「連結桌面版」，桌面就會自動完成登入，不需輸入配對碼。會員方案與額度沿用 [wuffi 網頁版](https://app.wuffi.app/)，可在桌面查看狀態。

只有選擇雲端並送出訊息時，才會傳送文章範圍與對話。登入憑證只保留到程式關閉；雲端方案到期不影響本機編輯與 Local AI。

## 配置 Local AI

wuffi 會連接你另外啟動的模型服務，不會自行下載或啟動語言模型。先下載本機模型並啟動本機服務，之後就能離線使用 AI。

### Ollama

1. 安裝 [Ollama](https://ollama.com/download)，並讓它保持執行。
2. 下載本機模型，例如：

   ```powershell
   ollama pull qwen2.5:7b
   ollama list
   ```

3. 開啟 **設定 → AI**；AI 面板的 **⋯** 按鈕也會直接開啟這個設定頁。
4. **Base URL** 填入 `http://127.0.0.1:11434/v1`；**Model** 填入 `qwen2.5:7b`，或你實際下載的完整模型名稱。
5. 儲存、測試連線，再送出一個簡短的寫作請求。

如果 Ollama 尚未啟動，可以執行 `ollama serve`。更多設定見 [Ollama 相容 API 文件](https://docs.ollama.com/api/openai-compatibility)。

### LM Studio

1. 安裝 [LM Studio](https://lmstudio.ai/)，下載並載入聊天／指令模型。
2. 在 **Developer** 頁面啟動本機伺服器。服務請只開放給自己的電腦。wuffi 的連線表單目前不會傳送 API 驗證 token，請使用不要求驗證的本機服務。
3. 在 wuffi 的 AI 連線設定填入 `http://127.0.0.1:1234/v1`；若更改過服務連接埠，請一併調整。
4. 把 LM Studio 顯示的完整模型識別名稱填入 **Model**，儲存並測試。

更多設定見 [LM Studio 相容 API 文件](https://lmstudio.ai/docs/developer/openai-compat)。也可以開啟 `http://127.0.0.1:1234/v1/models` 查詢模型名稱。

### 連不上時，先看這裡

| 遇到的情況 | 可以檢查 |
| --- | --- |
| 無法連線 | 模型服務是否啟動？Base URL 的連接埠是否正確？ |
| 找不到模型 | 模型名稱是否與服務 `/v1/models` 回傳的名稱一致？ |
| 連線成功，生成卻失敗 | 模型與服務需支援聊天 API 和 JSON 輸出（`response_format: json_object`）；連線測試本身不會驗證生成。 |
| 回覆很慢 | 試試較小的模型與較短的文章；模型推論會另外占用記憶體／顯示記憶體。 |

預填的 `http://127.0.0.1:8080/v1` 與模型名稱只是可修改的預設值，不代表已內建模型。請替換為自己的服務設定；網址填到 `/v1` 即可，不要加上 `/chat/completions`。

送出 AI 請求時，選取文字或文章內容，以及對話紀錄，會傳給你設定的服務。想讓推論完全留在本機，請使用 localhost 位址與本機模型，避免選到由雲端執行的模型。

## 開源，一起把它變得更好

wuffi 自行撰寫的程式碼採用 [MIT 授權](LICENSE)，歡迎使用、修改與分享。第三方元件依各自授權，詳見 [第三方聲明](THIRD_PARTY_NOTICES.md)。

有想法，或遇到打斷寫作的問題？歡迎提出 [Issue](https://github.com/gary0122g/wuffi/issues) 或 Pull Request。開發方式請參考 [貢獻指南](CONTRIBUTING.md)。

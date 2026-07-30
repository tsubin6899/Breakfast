# 初一食午營運管理網站

本資料夾的靜態頁面可放在 GitHub；薪資 APP 的雲端 AI 打卡辨識需由 Netlify 部署，才能安全保存 API 金鑰。

## 網站入口

- `index.html`：營運管理首頁
- `salary_app/`：員工打卡與薪資計算 APP
- `dashboard_cost/`：成本分析儀表板
- `.nojekyll`：讓 GitHub Pages 直接提供靜態檔案

## 薪資 APP 功能

- 員工時薪／月薪與班別設定
- 平日、週末、國定假日和颱風日規則
- 打卡照片上傳及 Gemini 免費雲端視覺辨識
- 無法判斷時間的人工複核流程
- AI 分別讀取每個印章的倒置日期、正向時間、所在欄位與信心值
- 同時比對原始照片與高對比表格副本，不依表格列位置猜測日期
- AI 低信心或點陣字無法讀取時，可用逐日放大圖批次快速核對並一次儲存
- 打卡蓋印錯位時可直接修正實際日期，並會阻止重複日期覆寫
- 全站採用較大的文字、表單與操作按鈕
- OCR 原圖／辨識影像對照與「儲存並下一筆」快速複核
- 手機版逐日出勤卡片
- 精確至分鐘的時薪計算
- 月薪員工提早上班加班費
- 獎金、禮金、加給與扣款
- 年假、月休與無薪假紀錄（月休超過 7 日自動轉抵年假）
- 每位員工 9:16 直式出席薪資明細，可下載為 1080 × 1920 JPG 交由員工核對
- 月結進度、月份鎖定與本機操作紀錄
- CSV、Excel 及 JSON 備份匯出

薪資資料預設保存在使用者瀏覽器的 `localStorage`，不會寫回網站檔案。打卡照片只用於當次瀏覽器辨識，不會存入 GitHub。

Excel 與 JPG 匯出元件由固定版本的 CDN 載入；沒有網路或 AI 服務無法使用時，仍可人工輸入打卡並匯出 CSV。

## Netlify AI 辨識設定

1. 將本資料夾上傳至 GitHub，再由 Netlify 連接該 GitHub 專案部署。
2. 在 Netlify 的 `Environment variables` 新增：
   - `GEMINI_API_KEY`：Google AI Studio API Key；設定後會優先使用 Gemini 免費方案。
   - `TIME_CARD_API_TOKEN`：自行設定一組店內連線密碼，建議至少 16 個字元。
   - `GEMINI_VISION_MODEL`：選填，預設為 `gemini-2.5-flash`。
   - `OPENAI_API_KEY`、`OPENAI_VISION_MODEL`：選填；未設定 Gemini 時才使用 OpenAI。
3. 重新部署網站。
4. 在薪資 APP 的「AI 辨識連線密碼」輸入與 `TIME_CARD_API_TOKEN` 相同的密碼。

API Key 只存在 Netlify 後端，不會出現在 GitHub 或瀏覽器中。店內連線密碼只儲存在目前瀏覽器，不會納入薪資 JSON 備份。APP 會先裁掉卡片上方姓名區，再將打卡表格裁切與高對比副本傳送至 Gemini；員工姓名不會放入 AI 請求。Gemini 免費層內容可能由 Google 用於改善產品，仍應由店內依個資管理規範限制網站與照片存取。

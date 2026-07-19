# 台4線大溪-龍潭段 防災+路殺熱點分析

靜態網站。資料主檔一份 Excel、跑一支 Python，網站就重生成。

## 目前收錄

- **14 筆可查證事件**：防災 10、路殺 4
- **時間**：2014、2020–2026（主要 2020 後）
- **範圍**：台4線 25K–41.544K，路中心線兩側 500m 廊道
- **500m 重疊熱點**：1 對（瑞安路人行道破損 ↔ 瑞安路一段龜殼花，距 82m）

## 目錄

```
tai4-hotspot/
├── data/
│   └── events.xlsx          資料主檔（Git 版控）
├── build.py                 讀 Excel → 產出 site/
├── gen_overview.py          產生 site/assets/hotspot-overview.svg
├── requirements.txt         Python 依賴
├── templates/
│   ├── index.html           首頁模板
│   └── event.html           事件詳細頁模板
├── site/                    build.py 輸出，也是 GitHub Pages 根目錄
│   ├── index.html
│   ├── q/{event_id}/index.html
│   └── assets/
│       ├── events.json
│       ├── overlap.json
│       ├── hotspot-overview.svg
│       ├── style.css
│       └── main.js
├── .github/workflows/
│   └── rebuild.yml          自動化 workflow
├── README.md                本檔
└── REPORT.md                資料統計與限制總結
```

## 更新流程

以下兩擇一，你想在電腦上改就走 A，想在 GitHub 網頁上改就走 B。

### A. 本機更新（3 步）

```bash
# 1. 拉最新的
git pull

# 2. 打開 data/events.xlsx 改資料、存檔
#    （直接改「防災事件」或「路殺事件」工作表，
#     欄位對照第 1 列表頭，事件編號 HZ-YYYYMMDD-NNN / RK-YYYYMMDD-NNN）

# 3. 重生成網站 + 推
pip install -r requirements.txt     # 首次
python build.py
python gen_overview.py
git add -A
git commit -m "資料更新：新增 X 筆事件"
git push
```

推上去後，GitHub Actions 會再跑一次確認，然後部署到 GitHub Pages。

### B. GitHub 網頁更新（3 步）

1. 進到 repo → `data/events.xlsx` → 右上角 `Download raw file`
2. 本機用 Excel 改完存回 `events.xlsx`
3. 回到 GitHub 網頁 → `data/` 資料夾 → `Add file → Upload files` → 拖入改過的 `events.xlsx` → 底下寫 commit 訊息 → `Commit changes`

GitHub Actions 會自動觸發：
- 讀新的 Excel
- 跑 `build.py` 和 `gen_overview.py`
- 把 `site/` 內容 commit 回 repo
- 部署到 GitHub Pages

**幾分鐘後**，網站就更新了。在 repo 的 `Actions` tab 可以看跑到哪。

### 手動觸發（不改資料，只想重跑一次）

進 repo → `Actions` → 左側選 `Rebuild & Deploy` → 右上角 `Run workflow`。

## 初始部署設定（一次性）

1. 在 GitHub 建 repo，把整個資料夾 push 上去
2. `Settings → Pages → Build and deployment → Source`：改成 **GitHub Actions**
3. `Settings → Actions → General → Workflow permissions`：改成 **Read and write permissions**
4. 到 `Actions` tab 手動跑一次 `Rebuild & Deploy`，成功後 URL 就在 workflow 摘要頁

## 加新事件時的欄位規則

**必填（黃色欄）：** 事件編號、里程樁、位置描述、緯度、經度、災害類型/物種、發生日期、資料來源
**選填（綠色欄）：** 其餘

**事件編號：** `HZ-YYYYMMDD-NNN`（防災）或 `RK-YYYYMMDD-NNN`（路殺）。同日多筆就 001、002…。
**座標：** WGS84 十進位度，至少 5 位小數。緯度約 24.7–24.9、經度約 121.2–121.3。找不到就用地標 Google Maps 反查，備註寫「座標推估」。
**共線段：** 台4與台3崎頂共線的事件，備註寫「共線段」。
**廊道位置：** build.py 讀備註欄的關鍵字自動分類：
- 含「非台4廊道」→ 參考事件（灰）
- 含「共線段」→ 共線段（藍框）
- 含「廊道邊緣」→ 廊道邊緣（黃）
- 其他 → 廊道內（綠）
**資料來源：** 至少一個連結。格式建議 `媒體名 編號｜https://...`。

## 常見錯誤

**Q. `python build.py` 錯 `找不到 templates/index.html`**
A. cwd 錯了。cd 到 repo 根目錄再跑。

**Q. `openpyxl.utils.exceptions.InvalidFileException`**
A. Excel 不是 .xlsx（可能還是 .xls）。用 Excel 另存為 `.xlsx`。

**Q. Actions 跑完 site/ 沒改**
A. 表示 build.py 產出跟現有 site/ 一樣，正常。看 workflow log 應該印「無變動」。

**Q. 座標明顯不對（點跑到南極洲）**
A. 緯度經度填反了。緯度是 24 開頭、經度是 121 開頭。

**Q. GitHub Pages 顯示 404**
A. 檢查 `Settings → Pages → Source` 是不是 `GitHub Actions`，不是 `Deploy from branch`。

## 依賴版本

- Python 3.10+
- openpyxl >= 3.1
- Jinja2 >= 3.1
- 前端：Leaflet 1.9.4 + leaflet.markercluster 1.5.3 + leaflet.heat 0.2.0（自 unpkg 引用，無需自建）

## 資料侷限（重要）

- 目前僅 14 筆真實可查證資料；台4線本段公開資料就是這麼少
- **未取得的資料源**列在 `REPORT.md`，多數需要登入或依《政府資訊公開法》申請
- 台4線 25K–39K 實際養護單位為公路局北養工分局**復興工務段**，不是大溪工務段
- 座標多為由地標 Google Maps 推估，詳細頁備註標明

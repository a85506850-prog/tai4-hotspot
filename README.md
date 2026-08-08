# 復興工務段 養護熱點分析（台3線・台3乙線・台4線）

靜態網站。資料主檔是 `data/` 內 6 個 JSON，跑一支 `build.py` 網站就重生成，push 到 GitHub 後自動部署。

上線網址：https://a85506850-prog.github.io/tai4-hotspot/

## 目前收錄

- **1,334 件**案件（缺失/維修 1,140、工程施工 173、查驗 21）
- **926 筆有座標**（公路局里程牌內插，誤差 ±150m）
- **52 個公里熱點**（每 1 公里聚合，含經緯度、by_year、by_category）
- **43 件路殺**（110.11–115.07，含物種與位置）
- **查驗金額約 NT$1.07 億**（2,251 項、216 查驗事件）
- 範圍：台3線 30K+560–55K+154、台3乙線 0K+000–12K+095、台4線 26K+930–39K+269
- 年度：民國 111–115（115 進行中）

前十大熱點：台3線38K(71)、台3線37K(56)、台3乙線5K(55)、台4線37K(46)、台4線35K(44)、台4線36K(41)、台3線39K(41)、台3線51K(38)、台3線36K(34)、台3乙線7K(34)。

## 目錄

```
tai4-hotspot/
├── data/                    資料主檔（Git 版控）
│   ├── cases.json           1,334 件案件明細
│   ├── hotspots_by_km.json  52 個公里熱點聚合
│   ├── roadkill.json        路殺月統計 + 位置
│   ├── patrol.json          巡查月統計 + 發現明細
│   ├── inspection.json      查驗事件 216 筆
│   └── cost_items.json      查驗金額明細 2,251 項
├── build.py                 讀 data/ → 產出 site/
├── requirements.txt         Python 依賴（jinja2）
├── templates/index.html     首頁模板
├── site/                    build.py 輸出，GitHub Pages 根目錄
│   ├── index.html
│   └── assets/              style.css, main.js, 及 build.py 產生的 JSON
├── .github/workflows/rebuild.yml
├── README.md
└── REPORT.md
```

## 更新流程

### A. 本機更新（3 步）

```bash
git pull
# 改 data/ 內的 JSON（或用你的解析工具重新產生）
pip install -r requirements.txt   # 首次
python build.py
git add -A && git commit -m "資料更新" && git push
```

push 後 GitHub Actions 自動 rebuild + 部署。

### B. GitHub 網頁更新（3 步）

1. 進 repo → `data/` → 點要改的 JSON → 右上鉛筆圖示編輯，或 `Add file → Upload files` 上傳新版
2. 底下寫 commit 訊息 → `Commit changes`
3. Actions 自動跑，幾分鐘後網站更新

### 手動觸發

repo → `Actions` → `Rebuild & Deploy` → `Run workflow`。

## 資料格式重點（cases.json）

每筆案件欄位：`id`（年度-災/養-流水號）、`year`（民國）、`kind`（災害/養護）、`nature`（缺失維修/工程施工/查驗）、`date`、`route`、`km_raw`、`km_start_m`、`category`（12 類自動初分）、`name`、`photo_count`、`lat`/`lon`、`location_suspect`。

**熱點統計以 `nature == 缺失/維修案件` 為主**，工程施工紀錄不灌入單一里程件數。類型是關鍵字自動初分，人工修正後回寫 JSON、網站讀資料不寫死。

## 常見錯誤

**`python build.py` 找不到 templates/index.html**：cd 到 repo 根目錄再跑。

**Actions 失敗於 deploy (404)**：確認 `Settings → Pages → Source` 為 `GitHub Actions`，且 `Settings → Actions → General → Workflow permissions` 為 Read and write。

**地圖泡泡沒出現**：確認 `data/hotspots_by_km.json` 每筆有 `lat`/`lon`。

**本機 file:// 打開地圖空白**：前端用 fetch 讀 JSON，需經 HTTP。本機請用 `python -m http.server` 在 site/ 目錄起服務，或直接看線上版。

## 依賴版本

- Python 3.10+，Jinja2 ≥ 3.1
- 前端：Leaflet 1.9.4 + markercluster 1.5.3 + Chart.js 4.4.1（CDN 引用）

## 限制

座標由里程牌內插（±150m，公里尺度足夠）；查驗金額為數量×單價估算非估驗定案值；路殺物種位置為巡查員手寫 AI 判讀；115 年統計至 8 月；9 筆超出公告養護範圍者已排除。詳見 REPORT.md。

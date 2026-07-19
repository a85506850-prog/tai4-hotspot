"""
產生 site/assets/hotspot-overview.svg
以 台4線大溪-龍潭段地理範圍為底，繪製事件熱點的靜態示意圖。
"""
import json, math
from pathlib import Path

ROOT = Path(__file__).parent
events = json.loads((ROOT / "site" / "assets" / "events.json").read_text(encoding="utf-8"))

# 範圍固定：涵蓋大溪(北)到龍潭(南)
LAT_N, LAT_S = 24.925, 24.795
LNG_W, LNG_E = 121.180, 121.310
W, H = 1200, 720

def project(lat, lng):
    x = (lng - LNG_W) / (LNG_E - LNG_W) * W
    y = (LAT_N - lat) / (LAT_N - LAT_S) * H
    return x, y

# 台4線大概走向：大溪 → 崁津大橋 → 沿石門水庫南岸 → 龍潭市區 → 大坪 (概略折線)
tai4_path = [
    (24.8945, 121.28680),  # 大溪橋
    (24.8811, 121.28060),  # 崁津大橋北
    (24.8760, 121.27920),  # 崁津大橋南
    (24.8712, 121.27000),  # 台4線南側轉折
    (24.8580, 121.24800),  # 中正路上林
    (24.8620, 121.22200),  # 中正路
    (24.8710, 121.21700),  # 龍潭市區
    (24.8600, 121.20200),  # 大坪終點
]
tai3_coline = [
    (24.8945, 121.28680),  # 起
    (24.8850, 121.27100),  # 崎頂共線
    (24.8811, 121.28060),
]

def path_d(points):
    xs = [project(*p) for p in points]
    d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x,y in xs)
    return d

# 熱力：合併同座標事件、以密度計半徑
from collections import defaultdict
bins = defaultdict(list)
for e in events:
    if not e.get("lat") or not e.get("lng"): continue
    key = (round(e["lat"], 3), round(e["lng"], 3))
    bins[key].append(e)

heat_blobs = []
for (lat, lng), evs in bins.items():
    x, y = project(lat, lng)
    density = len(evs)
    heat_blobs.append((x, y, density, evs))

# 座標軸與地名標
places = [
    (24.8945, 121.28680, "大溪老街"),
    (24.8760, 121.27920, "崁津大橋"),
    (24.8300, 121.24000, "石門水庫"),
    (24.8620, 121.22200, "龍潭大池"),
    (24.8600, 121.20200, "大坪 41.5K"),
]

svg = []
svg.append(f'<?xml version="1.0" encoding="UTF-8"?>')
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" preserveAspectRatio="xMidYMid meet">')
svg.append(f'<defs><radialGradient id="heat" cx="50%" cy="50%" r="50%">'
           f'<stop offset="0%" stop-color="#ff2200" stop-opacity="0.75"/>'
           f'<stop offset="55%" stop-color="#ffaa00" stop-opacity="0.35"/>'
           f'<stop offset="100%" stop-color="#ffaa00" stop-opacity="0"/></radialGradient></defs>')
svg.append(f'<rect width="{W}" height="{H}" fill="#f2f4f6"/>')
# 隱約大漢溪/石門水庫水體示意（藍面）
svg.append('<path d="M ' + " L ".join(
    f"{x:.1f},{y:.1f}" for x,y in [
        project(24.8905, 121.28900), project(24.8850, 121.29200),
        project(24.8700, 121.28500), project(24.8500, 121.26000),
        project(24.8250, 121.24500), project(24.8100, 121.23000),
        project(24.8200, 121.22000), project(24.8400, 121.23500),
        project(24.8600, 121.25500), project(24.8800, 121.27500),
        project(24.8905, 121.28900),
    ]) + ' Z" fill="#cfe3ee" fill-opacity="0.6"/>')
# 台4線
svg.append(f'<path d="{path_d(tai4_path)}" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round"/>')
# 台3共線段（虛線）
svg.append(f'<path d="{path_d(tai3_coline)}" fill="none" stroke="#333" stroke-width="4" stroke-dasharray="8,6" opacity="0.55"/>')

# 熱力層
for x,y,d,evs in heat_blobs:
    r = 55 + d*22
    svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="url(#heat)"/>')

# 事件點
for x,y,d,evs in heat_blobs:
    has_hz = any(e["type"]=="hazard" for e in evs)
    has_rk = any(e["type"]=="roadkill" for e in evs)
    if has_hz and has_rk:
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="#7d1fa8" stroke="white" stroke-width="1.5"/>')
    elif has_hz:
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#1f6feb" stroke="white" stroke-width="1.5"/>')
    else:
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#d33" stroke="white" stroke-width="1.5"/>')

# 地名
for lat,lng,name in places:
    x,y = project(lat,lng)
    svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#333"/>')
    svg.append(f'<text x="{x+8:.1f}" y="{y+4:.1f}" font-size="14" font-family="Noto Sans TC,Arial,sans-serif" fill="#333">{name}</text>')

# 圖例與標題
svg.append('<g font-family="Noto Sans TC,Arial,sans-serif">')
svg.append(f'<text x="24" y="36" font-size="20" font-weight="700" fill="#111">台4線大溪-龍潭段 事件熱點示意</text>')
svg.append(f'<text x="24" y="60" font-size="13" fill="#555">紅=路殺｜藍=防災｜紫=重疊｜黑實線=台4線本線｜虛線=台3共線段</text>')
# 圖例框
lx, ly = W-260, 24
svg.append(f'<rect x="{lx}" y="{ly}" width="240" height="120" fill="white" stroke="#ddd" rx="4"/>')
svg.append(f'<circle cx="{lx+18}" cy="{ly+30}" r="6" fill="#1f6feb"/><text x="{lx+34}" y="{ly+35}" font-size="13" fill="#333">防災事件</text>')
svg.append(f'<circle cx="{lx+18}" cy="{ly+56}" r="6" fill="#d33"/><text x="{lx+34}" y="{ly+61}" font-size="13" fill="#333">路殺事件</text>')
svg.append(f'<circle cx="{lx+18}" cy="{ly+82}" r="6" fill="#7d1fa8"/><text x="{lx+34}" y="{ly+87}" font-size="13" fill="#333">同地重疊（500m 內）</text>')
svg.append(f'<circle cx="{lx+18}" cy="{ly+108}" r="14" fill="url(#heat)"/><text x="{lx+40}" y="{ly+113}" font-size="13" fill="#333">熱力（事件密度）</text>')
svg.append('</g>')

svg.append('</svg>')
(ROOT / "site" / "assets" / "hotspot-overview.svg").write_text("\n".join(svg), encoding="utf-8")
print(f"generated. blobs={len(heat_blobs)} events={len(events)}")

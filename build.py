#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台3線 / 台3乙線 / 台4線 復興工務段 養護熱點分析 — 網站建置腳本
資料源：data/ 內 6 個 JSON（由工務段照片/查驗表/巡查表解析）
輸出：site/index.html + site/assets/*.json
"""
import json
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
DATA = ROOT / "data"
TEMPLATES = ROOT / "templates"
SITE = ROOT / "site"
ASSETS = SITE / "assets"


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


def roc_to_display(s):
    """民國日期字串原樣顯示"""
    return s or ""


def parse_km_from_note(note):
    """從路殺 note 解析里程（公尺）。例：'台3線41K+500右側' -> 41500"""
    m = re.search(r"(\d+)\s*[kK]\s*\+?\s*(\d+)?", note)
    if not m:
        return None
    km = int(m.group(1))
    plus = int(m.group(2)) if m.group(2) else 0
    return km * 1000 + plus


def main():
    cases_doc = load("cases.json")
    cases = cases_doc["cases"]
    hs_doc = load("hotspots_by_km.json")
    hotspots = hs_doc["hotspots"]
    rk_doc = load("roadkill.json")
    patrol = load("patrol.json")
    inspection = load("inspection.json")
    cost = load("cost_items.json")

    # ---- 熱點座標查表（route, km_bin -> lat/lon）給路殺定位 ----
    hs_coord = {(h["route"], h["km_bin"]): (h.get("lat"), h.get("lon")) for h in hotspots}

    # ---- 路殺事件展開為可定位點 ----
    roadkill_points = []
    for m in rk_doc["monthly"]:
        if m["roadkill_count"] <= 0:
            continue
        notes = m.get("notes") or []
        route = m["route"]
        species = m["species"]
        if notes:
            for nt in notes:
                kmm = parse_km_from_note(nt)
                lat = lon = None
                if kmm is not None:
                    kb = kmm // 1000
                    lat, lon = hs_coord.get((route, kb), (None, None))
                roadkill_points.append({
                    "month": m["month"], "route": route, "species": species,
                    "note": nt, "km_m": kmm, "lat": lat, "lon": lon,
                })
        else:
            roadkill_points.append({
                "month": m["month"], "route": route, "species": species,
                "note": "", "km_m": None, "lat": None, "lon": None,
            })

    # ---- 統計 ----
    defects = [c for c in cases if c["nature"] == "缺失/維修案件"]
    geo_cases = [c for c in cases if c.get("lat")]

    total_inspection = sum(e.get("amount") or 0 for e in inspection["events"])
    cost_by_year = Counter()
    for it in cost["items"]:
        y = it.get("year")
        if y:
            cost_by_year[y] += it.get("amount") or 0

    cases_by_year = Counter(c["year"] for c in cases)
    defects_by_year = Counter(c["year"] for c in defects)
    by_category = Counter(c["category"] or "其他" for c in defects)
    by_route = Counter(c["route"] or "未標" for c in cases)
    by_kind = Counter(c["kind"] for c in cases)

    roadkill_total = sum(m["roadkill_count"] for m in rk_doc["monthly"])
    rk_species = Counter()
    for m in rk_doc["monthly"]:
        if m["species"] and m["roadkill_count"] > 0:
            for s in re.split(r"[、,/]", m["species"]):
                s = s.strip()
                if s:
                    rk_species[s] += m["roadkill_count"] if len(re.split(r"[、,/]", m["species"])) == 1 else 1

    years = sorted(cases_by_year)
    stats = {
        "case_count": len(cases),
        "defect_count": len(defects),
        "hotspot_count": len(hotspots),
        "geo_count": len(geo_cases),
        "geo_pct": round(len(geo_cases) / len(cases) * 100),
        "roadkill_count": roadkill_total,
        "route_count": len([r for r in by_route if r != "未標"]),
        "inspection_amount": round(total_inspection),
        "inspection_events": inspection["count"],
        "cost_items": cost["count"],
        "year_min": min(years),
        "year_max": max(years),
        "category_count": len(by_category),
    }

    top_hotspots = sorted(hotspots, key=lambda h: -h["total"])[:15]

    # ---- 精簡 cases 給前端（移除 photo_folder 之類大欄位）----
    slim_cases = []
    for c in cases:
        slim_cases.append({
            "id": c["id"], "year": c["year"], "kind": c["kind"], "nature": c["nature"],
            "date": c["date"], "route": c["route"], "km_raw": c.get("km_raw", ""),
            "km_start_m": c.get("km_start_m"), "side": c.get("side", ""),
            "category": c["category"] or "其他", "name": c["name"],
            "source": c.get("source", ""), "photo_count": c.get("photo_count", 0),
            "completed_mark": c.get("completed_mark", False),
            "lat": c.get("lat"), "lon": c.get("lon"),
            "location_suspect": c.get("location_suspect", False),
        })

    # ---- 寫前端資料 ----
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "cases.json").write_text(json.dumps(slim_cases, ensure_ascii=False), encoding="utf-8")
    (ASSETS / "hotspots.json").write_text(json.dumps(hotspots, ensure_ascii=False), encoding="utf-8")
    (ASSETS / "roadkill.json").write_text(json.dumps(roadkill_points, ensure_ascii=False), encoding="utf-8")

    charts = {
        "cases_by_year": {str(y): cases_by_year[y] for y in years},
        "defects_by_year": {str(y): defects_by_year[y] for y in years},
        "cost_by_year": {str(y): round(cost_by_year[y]) for y in years},
        "by_category": dict(by_category.most_common()),
        "by_route": dict(by_route.most_common()),
        "by_kind": dict(by_kind.most_common()),
        "rk_species": dict(rk_species.most_common()),
        "patrol_monthly": [
            {"month": m["month"], "patrol_days": m.get("patrol_days"),
             "defects_found": m.get("defects_found")}
            for m in patrol["monthly"]
        ],
    }
    (ASSETS / "charts.json").write_text(json.dumps(charts, ensure_ascii=False), encoding="utf-8")

    # ---- 渲染首頁 ----
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True, lstrip_blocks=True,
    )
    tpl = env.get_template("index.html")
    html = tpl.render(
        stats=stats,
        top_hotspots=top_hotspots,
        build_time=datetime.now().strftime("%Y-%m-%d %H:%M"),
        generated=cases_doc.get("generated", ""),
    )
    (SITE / "index.html").write_text(html, encoding="utf-8")

    print(f"[build] 案件 {stats['case_count']}（缺失/維修 {stats['defect_count']}，有座標 {stats['geo_count']}）")
    print(f"[build] 熱點 {stats['hotspot_count']}｜路殺 {stats['roadkill_count']}｜查驗金額 {stats['inspection_amount']:,}")
    print(f"[build] 路殺可定位點 {sum(1 for p in roadkill_points if p['lat'])}/{len(roadkill_points)}")
    print(f"[build] 輸出：{SITE}")


if __name__ == "__main__":
    main()

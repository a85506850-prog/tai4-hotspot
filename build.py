#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台4線大溪-龍潭段 防災+路殺熱點分析 靜態網站建置腳本
讀取 data/events.xlsx → 產生 site/index.html、site/q/{id}/index.html、site/assets/events.json
"""
import json
import math
import re
import shutil
from datetime import datetime
from pathlib import Path

import openpyxl
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
DATA_XLSX = ROOT / "data" / "events.xlsx"
TEMPLATES = ROOT / "templates"
SITE = ROOT / "site"
ASSETS = SITE / "assets"

HZ_HEADERS = [
    "id", "km", "location_desc", "lat", "lng",
    "hazard_type", "date", "cause", "impact",
    "repair_hours", "repair_unit", "cost", "improved",
    "photo", "source", "notes",
]
RK_HEADERS = [
    "id", "km", "location_desc", "lat", "lng",
    "species", "count", "date", "time_of_day", "weather",
    "reporter", "source", "photo", "environment",
    "friendly_facility", "notes",
]


def extract_url(s):
    if not s:
        return None
    m = re.search(r"https?://\S+", str(s))
    return m.group(0).rstrip(".,;)") if m else None


def strip_url(s):
    if not s:
        return ""
    s = re.sub(r"[｜|]?\s*https?://\S+", "", str(s)).strip()
    return s


def read_sheet(ws, headers, event_type):
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[0] is None:
            continue
        rec = {"type": event_type}
        for i, h in enumerate(headers):
            v = row[i] if i < len(row) else None
            if isinstance(v, datetime):
                v = v.strftime("%Y-%m-%d")
            rec[h] = v
        rec["source_url"] = extract_url(rec.get("source"))
        rec["source_text"] = strip_url(rec.get("source"))
        notes = (rec.get("notes") or "")
        if "非台4廊道" in notes:
            rec["corridor"] = "reference"
        elif "共線段" in notes:
            rec["corridor"] = "co-line"
        elif "廊道邊緣" in notes:
            rec["corridor"] = "edge"
        else:
            rec["corridor"] = "inside"
        rows.append(rec)
    return rows


def build_events():
    wb = openpyxl.load_workbook(DATA_XLSX, data_only=True)
    hz = read_sheet(wb["防災事件"], HZ_HEADERS, "hazard")
    rk = read_sheet(wb["路殺事件"], RK_HEADERS, "roadkill")
    all_events = hz + rk

    for e in all_events:
        if e["type"] == "hazard":
            htype = e.get("hazard_type") or "事件"
            loc = e.get("location_desc") or ""
            e["title"] = f"{htype}｜{loc}"
            e["category"] = e.get("hazard_type") or "其他"
        else:
            sp = e.get("species") or "動物"
            loc = e.get("location_desc") or ""
            e["title"] = f"{sp}路殺｜{loc}"
            e["category"] = e.get("species") or "其他"

    all_events.sort(key=lambda e: (e.get("date") or ""), reverse=True)
    return all_events


def stats(events):
    hz = [e for e in events if e["type"] == "hazard"]
    rk = [e for e in events if e["type"] == "roadkill"]
    species = sorted({e.get("species") for e in rk if e.get("species")})
    hazard_types = sorted({e.get("hazard_type") for e in hz if e.get("hazard_type")})
    dates = [e.get("date") for e in events if e.get("date")]
    latest = max(dates) if dates else "-"
    earliest = min(dates) if dates else "-"
    corridor = [e for e in events if e["corridor"] in ("inside", "co-line", "edge")]
    return {
        "hz_count": len(hz),
        "rk_count": len(rk),
        "species_count": len(species),
        "hazard_type_count": len(hazard_types),
        "latest": latest,
        "earliest": earliest,
        "corridor_count": len(corridor),
        "verified_pct": 100,
        "total": len(events),
    }


def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def overlap_hotspots(events, radius_m=500):
    hz = [e for e in events if e["type"] == "hazard" and e.get("lat") and e.get("lng")]
    rk = [e for e in events if e["type"] == "roadkill" and e.get("lat") and e.get("lng")]
    pairs = []
    for h in hz:
        for r in rk:
            try:
                d = haversine(float(h["lat"]), float(h["lng"]), float(r["lat"]), float(r["lng"]))
            except Exception:
                continue
            if d <= radius_m:
                pairs.append({
                    "hazard_id": h["id"],
                    "hazard_title": h["title"],
                    "roadkill_id": r["id"],
                    "roadkill_title": r["title"],
                    "distance_m": round(d),
                })
    return pairs


def render(events, st, pairs):
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    tpl = env.get_template("index.html")
    events_json = json.dumps(events, ensure_ascii=False)
    html = tpl.render(events=events, stats=st, pairs=pairs,
                      events_json=events_json,
                      build_time=datetime.now().strftime("%Y-%m-%d %H:%M"))
    (SITE / "index.html").write_text(html, encoding="utf-8")

    ev_tpl = env.get_template("event.html")
    ids = [e["id"] for e in events]
    for i, e in enumerate(events):
        prev_id = ids[i-1] if i > 0 else None
        next_id = ids[i+1] if i < len(ids)-1 else None
        d = SITE / "q" / e["id"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(
            ev_tpl.render(e=e, prev_id=prev_id, next_id=next_id,
                          build_time=datetime.now().strftime("%Y-%m-%d %H:%M")),
            encoding="utf-8"
        )


def main():
    if not DATA_XLSX.exists():
        raise SystemExit(f"找不到 {DATA_XLSX}")

    q_dir = SITE / "q"
    if q_dir.exists():
        for child in q_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                try:
                    child.unlink()
                except Exception:
                    pass
    else:
        q_dir.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)

    events = build_events()
    st = stats(events)
    pairs = overlap_hotspots(events)

    (ASSETS / "events.json").write_text(
        json.dumps(events, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (ASSETS / "overlap.json").write_text(
        json.dumps(pairs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    render(events, st, pairs)

    print(f"[build] events: 防災 {st['hz_count']} 路殺 {st['rk_count']}｜總 {st['total']}")
    print(f"[build] 重疊熱點對(500m): {len(pairs)}")
    print(f"[build] 輸出：{SITE}")


if __name__ == "__main__":
    main()

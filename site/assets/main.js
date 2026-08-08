/* 復興工務段 養護熱點分析 — 前端 */
(function () {
  var ROUTE_COLOR = { "台3線": "#d9534f", "台3乙線": "#f0ad4e", "台4線": "#1f6feb", "未標": "#888" };
  var map, hotspotLayer, caseCluster, roadkillLayer;
  var DATA = { cases: [], hotspots: [], roadkill: [], charts: null };
  var listState = { shown: 0, page: 200 };

  Promise.all([
    fetch("assets/hotspots.json").then(r => r.json()),
    fetch("assets/cases.json").then(r => r.json()),
    fetch("assets/roadkill.json").then(r => r.json()),
    fetch("assets/charts.json").then(r => r.json()),
  ]).then(function (res) {
    DATA.hotspots = res[0];
    DATA.cases = res[1];
    DATA.roadkill = res[2];
    DATA.charts = res[3];
    initFilters();
    initMap();
    renderMap();
    renderCharts();
    bindControls();
    renderList(true);
  }).catch(function (e) { console.error("資料載入失敗", e); });

  function initFilters() {
    var years = {};
    DATA.cases.forEach(c => { if (c.year) years[c.year] = true; });
    var ysel = document.getElementById("f-year");
    Object.keys(years).sort().forEach(function (y) {
      var o = document.createElement("option"); o.value = y; o.textContent = "民國 " + y; ysel.appendChild(o);
    });
    var cats = {};
    DATA.cases.forEach(c => { if (c.category) cats[c.category] = (cats[c.category] || 0) + 1; });
    var csel = document.getElementById("f-category");
    Object.keys(cats).sort((a, b) => cats[b] - cats[a]).forEach(function (c) {
      var o = document.createElement("option"); o.value = c; o.textContent = c + " (" + cats[c] + ")"; csel.appendChild(o);
    });
  }

  function initMap() {
    map = L.map("map").setView([24.86, 121.26], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap 貢獻者", maxZoom: 19
    }).addTo(map);
    hotspotLayer = L.layerGroup().addTo(map);
    caseCluster = L.markerClusterGroup({ chunkedLoading: true });
    roadkillLayer = L.layerGroup();
    addSizeLegend();
  }

  function hsRadius(total) { return Math.min(6 + total * 0.55, 42); }

  function addSizeLegend() {
    var legend = L.control({ position: "bottomright" });
    legend.onAdd = function () {
      var div = L.DomUtil.create("div", "size-legend");
      var samples = [70, 40, 15, 5];
      var rows = samples.map(function (n) {
        var d = Math.round(hsRadius(n) * 2);
        return '<div class="sl-row">' +
          '<span class="sl-cw" style="width:' + d + 'px;height:' + d + 'px">' +
          '<span class="sl-circle" style="width:' + d + 'px;height:' + d + 'px"></span></span>' +
          '<span class="sl-lbl">' + n + ' 件</span></div>';
      }).join("");
      div.innerHTML = '<div class="sl-title">圈圈大小＝案件數</div>' + rows;
      return div;
    };
    legend.addTo(map);
    var s = document.createElement("style");
    s.textContent =
      ".size-legend{background:rgba(255,255,255,.92);border:1px solid #e2e4e8;border-radius:6px;padding:8px 10px;font-size:12px;color:#333;line-height:1.3}" +
      ".size-legend .sl-title{font-weight:600;margin-bottom:8px}" +
      ".size-legend .sl-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}" +
      ".size-legend .sl-cw{display:flex;align-items:center;justify-content:center;flex:none}" +
      ".size-legend .sl-circle{display:inline-block;border-radius:50%;border:1.5px solid #1f6feb;background:rgba(31,111,235,.25)}" +
      ".size-legend .sl-lbl{white-space:nowrap;color:#555}";
    document.head.appendChild(s);
  }

  function activeRoutes() {
    return Array.prototype.filter.call(document.querySelectorAll(".f-route"), cb => cb.checked).map(cb => cb.value);
  }

  function passFilter(x) {
    var routes = activeRoutes();
    var y = document.getElementById("f-year").value;
    var cat = document.getElementById("f-category").value;
    if (routes.indexOf(x.route || "未標") === -1) return false;
    if (y && String(x.year) !== y) return false;
    if (cat && x.category !== cat) return false;
    return true;
  }

  function renderMap() {
    var showHot = document.getElementById("lyr-hotspot").checked;
    var showCases = document.getElementById("lyr-cases").checked;
    var showRk = document.getElementById("lyr-roadkill").checked;
    var routes = activeRoutes();
    var y = document.getElementById("f-year").value;
    var cat = document.getElementById("f-category").value;

    hotspotLayer.clearLayers();
    caseCluster.clearLayers();
    roadkillLayer.clearLayers();

    // 熱點泡泡
    if (showHot) {
      DATA.hotspots.forEach(function (h) {
        if (!h.lat) return;
        if (routes.indexOf(h.route) === -1) return;
        // 年份/類型篩選：以該熱點是否含有符合條件案件近似（用 by_year / by_category）
        if (y && !(h.by_year && h.by_year[y])) return;
        if (cat && !(h.by_category && h.by_category[cat])) return;
        var r = Math.min(6 + h.total * 0.55, 42);
        var color = ROUTE_COLOR[h.route] || "#888";
        var m = L.circleMarker([h.lat, h.lon], {
          radius: r, color: color, weight: 1.5, fillColor: color, fillOpacity: 0.35
        });
        m.bindPopup(hotspotPopup(h));
        hotspotLayer.addLayer(m);
      });
    }

    // 個別案件點
    if (showCases) {
      DATA.cases.forEach(function (c) {
        if (!c.lat || !passFilter(c)) return;
        var color = ROUTE_COLOR[c.route] || "#888";
        var mk = L.circleMarker([c.lat, c.lon], {
          radius: 5, color: color, weight: 1, fillColor: color, fillOpacity: 0.7
        });
        mk.bindPopup(casePopup(c));
        caseCluster.addLayer(mk);
      });
      if (!map.hasLayer(caseCluster)) map.addLayer(caseCluster);
    } else if (map.hasLayer(caseCluster)) {
      map.removeLayer(caseCluster);
    }

    // 路殺
    if (showRk) {
      DATA.roadkill.forEach(function (p) {
        if (!p.lat) return;
        if (routes.indexOf(p.route) === -1) return;
        var mk = L.circleMarker([p.lat, p.lon], {
          radius: 6, color: "#7d1fa8", weight: 2, fillColor: "#b06ad6", fillOpacity: 0.7
        });
        mk.bindPopup("<b>路殺｜" + esc(p.species) + "</b><br>" + esc(p.month) + "　" + esc(p.route) + "<br>" + esc(p.note));
        roadkillLayer.addLayer(mk);
      });
      if (!map.hasLayer(roadkillLayer)) map.addLayer(roadkillLayer);
    } else if (map.hasLayer(roadkillLayer)) {
      map.removeLayer(roadkillLayer);
    }
  }

  function hotspotPopup(h) {
    var cats = Object.entries(h.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(e => e[0] + " " + e[1]).join("、");
    var yrs = Object.entries(h.by_year || {}).sort().map(e => "民" + e[0] + ":" + e[1]).join("　");
    return '<div class="p-title">' + esc(h.label) + '｜' + h.total + ' 件</div>' +
      '<div class="p-meta">' + esc(cats) + '</div>' +
      '<div class="p-meta">' + esc(yrs) + '</div>';
  }

  function casePopup(c) {
    return '<div class="p-title">' + esc(c.id) + '</div>' +
      '<div class="p-meta">' + esc(c.route || "") + " " + esc(c.km_raw || "") + "｜" + esc(c.date || "") + '</div>' +
      '<div class="p-meta">' + esc(c.category) + "｜" + esc(c.kind) + '</div>' +
      '<div style="margin-top:4px">' + esc(c.name) + '</div>';
  }

  function bindControls() {
    ["lyr-hotspot", "lyr-cases", "lyr-roadkill"].forEach(id =>
      document.getElementById(id).addEventListener("change", renderMap));
    Array.prototype.forEach.call(document.querySelectorAll(".f-route"), cb =>
      cb.addEventListener("change", function () { renderMap(); renderList(true); }));
    document.getElementById("f-year").addEventListener("change", function () { renderMap(); renderList(true); });
    document.getElementById("f-category").addEventListener("change", function () { renderMap(); renderList(true); });
    document.getElementById("list-search").addEventListener("input", function () { renderList(true); });
    document.getElementById("only-geo").addEventListener("change", function () { renderList(true); });
    document.getElementById("load-more").addEventListener("click", function () { renderList(false); });

    Array.prototype.forEach.call(document.querySelectorAll(".focus-link"), function (a) {
      a.addEventListener("click", function () {
        var lat = parseFloat(a.dataset.lat), lon = parseFloat(a.dataset.lon);
        if (!isNaN(lat)) { map.setView([lat, lon], 15); }
      });
    });
  }

  function filteredCases() {
    var q = (document.getElementById("list-search").value || "").trim();
    var onlyGeo = document.getElementById("only-geo").checked;
    return DATA.cases.filter(function (c) {
      if (!passFilter(c)) return false;
      if (onlyGeo && !c.lat) return false;
      if (q) {
        var hay = (c.name + " " + c.id + " " + (c.km_raw || "") + " " + c.category).toLowerCase();
        if (hay.indexOf(q.toLowerCase()) === -1) return false;
      }
      return true;
    });
  }

  function renderList(reset) {
    var list = document.getElementById("case-list");
    var arr = filteredCases();
    document.getElementById("list-count").textContent = arr.length + " 筆";
    if (reset) { list.innerHTML = ""; listState.shown = 0; }
    var end = Math.min(listState.shown + listState.page, arr.length);
    for (var i = listState.shown; i < end; i++) {
      list.appendChild(caseRow(arr[i]));
    }
    listState.shown = end;
    document.getElementById("load-more").style.display = end < arr.length ? "block" : "none";
  }

  function caseRow(c) {
    var li = document.createElement("li");
    li.className = "case-item";
    var color = ROUTE_COLOR[c.route] || "#888";
    var geo = c.lat ? '<span class="geo-dot" title="有座標"></span>' : "";
    li.innerHTML =
      '<div class="ci-head">' +
      '<span class="ci-route" style="background:' + color + '">' + esc(c.route || "未標") + '</span>' +
      '<span class="ci-cat">' + esc(c.category) + '</span>' +
      '<span class="ci-km">' + esc(c.km_raw || "—") + '</span>' +
      '<span class="ci-date">' + esc(c.date || "") + '</span>' + geo +
      '</div>' +
      '<div class="ci-name">' + esc(c.name) + '</div>' +
      '<div class="ci-detail">' +
      '編號 ' + esc(c.id) + '｜' + esc(c.kind) + '／' + esc(c.nature) +
      '｜來源 ' + esc(c.source || "—") + '｜照片 ' + (c.photo_count || 0) + ' 張' +
      (c.completed_mark ? '｜<span class="ok">已完工</span>' : "") +
      (c.lat ? '｜<a href="#map-section" class="jump" data-lat="' + c.lat + '" data-lon="' + c.lon + '">地圖定位 →</a>' : "") +
      '</div>';
    li.querySelector(".ci-head").addEventListener("click", function () { li.classList.toggle("open"); });
    var jump = li.querySelector(".jump");
    if (jump) jump.addEventListener("click", function () {
      map.setView([parseFloat(jump.dataset.lat), parseFloat(jump.dataset.lon)], 16);
    });
    return li;
  }

  // ---------- Charts ----------
  function renderCharts() {
    var c = DATA.charts;
    var font = { family: "'Noto Sans TC', sans-serif" };
    Chart.defaults.font.family = font.family;

    barChart("chart-year", Object.keys(c.cases_by_year).map(y => "民" + y),
      [{ label: "全部案件", data: Object.values(c.cases_by_year), backgroundColor: "#1f6feb" },
       { label: "缺失/維修", data: Object.values(c.defects_by_year), backgroundColor: "#9ec5f2" }]);

    hbarChart("chart-category", Object.keys(c.by_category), Object.values(c.by_category), "#d9534f");
    pieChart("chart-route", Object.keys(c.by_route), Object.values(c.by_route),
      Object.keys(c.by_route).map(r => ({ "台3線": "#d9534f", "台3乙線": "#f0ad4e", "台4線": "#1f6feb", "未標": "#bbb" }[r] || "#888")));
    pieChart("chart-kind", Object.keys(c.by_kind), Object.values(c.by_kind), ["#e24b4a", "#1d9e75"]);
    hbarChart("chart-species", Object.keys(c.rk_species), Object.values(c.rk_species), "#7d1fa8");

    barChart("chart-cost", Object.keys(c.cost_by_year).map(y => "民" + y),
      [{ label: "查驗金額(估)", data: Object.values(c.cost_by_year), backgroundColor: "#0f6e56" }],
      function (v) { return (v / 10000).toFixed(0) + "萬"; });
  }

  function barChart(id, labels, datasets, yfmt) {
    var el = document.getElementById(id); if (!el) return;
    new Chart(el, {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1 } },
        scales: { y: { beginAtZero: true, ticks: yfmt ? { callback: yfmt } : {} } }
      }
    });
  }
  function hbarChart(id, labels, data, color) {
    var el = document.getElementById(id); if (!el) return;
    new Chart(el, {
      type: "bar",
      data: { labels: labels, datasets: [{ data: data, backgroundColor: color }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } }
      }
    });
  }
  function pieChart(id, labels, data, colors) {
    var el = document.getElementById(id); if (!el) return;
    new Chart(el, {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: data, backgroundColor: colors }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } }
    });
  }

  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // cluster badge 顏色
  var st = document.createElement("style");
  st.textContent = ".marker-cluster{background:rgba(31,111,235,.25)}.marker-cluster div{background:rgba(31,111,235,.7);color:#fff}";
  document.head.appendChild(st);
})();

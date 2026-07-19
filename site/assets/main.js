/* 台4線大溪-龍潭段 主頁互動：Leaflet 地圖 + 圖層開關 + 熱力圖 + 篩選 + 事件列表分頁 */
(function(){
  var map, hazardCluster, roadkillCluster, heatLayer;
  var allEvents = [];
  var yearSel = document.getElementById('f-year');

  // 優先讀取嵌入的 JSON（可離線/file:// 開啟）；失敗才 fetch
  var inline = document.getElementById('events-data');
  if (inline && inline.textContent.trim()) {
    try {
      allEvents = JSON.parse(inline.textContent);
      initYearSelect(allEvents);
      initMap();
      renderMap();
      bindControls();
    } catch (e) { console.error('inline JSON parse 失敗', e); }
  } else {
    fetch('assets/events.json')
      .then(function(r){ return r.json(); })
      .then(function(events){
        allEvents = events;
        initYearSelect(events);
        initMap();
        renderMap();
        bindControls();
      })
      .catch(function(err){ console.error('讀取 events.json 失敗', err); });
  }

  function initYearSelect(events){
    var years = {};
    events.forEach(function(e){
      if (e.date) { years[e.date.substring(0,4)] = true; }
    });
    Object.keys(years).sort().reverse().forEach(function(y){
      var opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      yearSel.appendChild(opt);
    });
  }

  function initMap(){
    // 中心點：台4線 大溪-龍潭中段
    map = L.map('map').setView([24.870, 121.245], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap 貢獻者', maxZoom: 19
    }).addTo(map);

    hazardCluster = L.markerClusterGroup({
      iconCreateFunction: function(cluster){
        return L.divIcon({html: '<div class="cluster-badge cluster-hazard">'+cluster.getChildCount()+'</div>', className:'', iconSize:[36,36]});
      }
    });
    roadkillCluster = L.markerClusterGroup({
      iconCreateFunction: function(cluster){
        return L.divIcon({html: '<div class="cluster-badge cluster-roadkill">'+cluster.getChildCount()+'</div>', className:'', iconSize:[36,36]});
      }
    });
    hazardCluster.addTo(map);
    roadkillCluster.addTo(map);
  }

  function renderMap(){
    var yearFilter = yearSel.value;
    var corridorFilters = Array.prototype.filter.call(
      document.querySelectorAll('.f-corridor'),
      function(cb){ return cb.checked; }
    ).map(function(cb){ return cb.value; });
    var showHazard = document.getElementById('lyr-hazard').checked;
    var showRoad = document.getElementById('lyr-roadkill').checked;
    var showHeat = document.getElementById('lyr-heat').checked;

    hazardCluster.clearLayers();
    roadkillCluster.clearLayers();
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }

    var heatPts = [];
    var shown = 0;

    allEvents.forEach(function(e){
      if (!e.lat || !e.lng) return;
      if (yearFilter && !(e.date && e.date.startsWith(yearFilter))) return;
      if (corridorFilters.indexOf(e.corridor) === -1) return;
      if (e.type === 'hazard' && !showHazard) return;
      if (e.type === 'roadkill' && !showRoad) return;

      var lat = parseFloat(e.lat), lng = parseFloat(e.lng);
      var color = e.type === 'hazard' ? '#1f6feb' : '#d33';
      var marker = L.circleMarker([lat, lng], {
        radius: 7, color: color, weight: 2, fillColor: color, fillOpacity: 0.6
      });
      marker.bindPopup(popupHtml(e));
      if (e.type === 'hazard') hazardCluster.addLayer(marker);
      else roadkillCluster.addLayer(marker);
      heatPts.push([lat, lng, e.type === 'hazard' ? 0.8 : 0.6]);
      shown++;
    });

    if (showHeat && heatPts.length > 0 && typeof L.heatLayer === 'function') {
      heatLayer = L.heatLayer(heatPts, {radius: 32, blur: 22, maxZoom: 15}).addTo(map);
    }

    // 更新事件列表
    renderList();
  }

  function popupHtml(e){
    var tag = e.type === 'hazard' ? '防災' : '路殺';
    var url = 'q/' + e.id + '/';
    var meta = (e.km ? e.km + '｜' : '') + (e.date || '');
    return '<div class="p-title">['+tag+'] '+ escapeHtml(e.title) +'</div>'+
           '<div class="p-meta">'+ escapeHtml(meta) +'</div>'+
           '<a href="'+ url +'">開啟事件詳細頁 →</a>';
  }

  function escapeHtml(s){
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function bindControls(){
    ['lyr-hazard','lyr-roadkill','lyr-heat'].forEach(function(id){
      document.getElementById(id).addEventListener('change', renderMap);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.f-corridor'), function(cb){
      cb.addEventListener('change', renderMap);
    });
    yearSel.addEventListener('change', renderMap);

    // 事件列表分頁
    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function(btn){
      btn.addEventListener('click', function(){
        Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        renderList();
      });
    });
  }

  function renderList(){
    var activeTab = document.querySelector('.tab-btn.active');
    var tab = activeTab ? activeTab.dataset.tab : 'all';
    var yearFilter = yearSel.value;
    var corridorFilters = Array.prototype.filter.call(
      document.querySelectorAll('.f-corridor'),
      function(cb){ return cb.checked; }
    ).map(function(cb){ return cb.value; });

    Array.prototype.forEach.call(document.querySelectorAll('.ev-item'), function(li){
      var type = li.dataset.type;
      var passTab = (tab === 'all' || tab === type);
      // 從 li 找出對應 event 的 corridor / year
      // 因為 li 沒帶 attribute，我們用文字內容 fallback：直接由 checkbox 全開時忽略
      var corridorEl = li.querySelector('.ev-corridor');
      var corridorClass = corridorEl ? (corridorEl.className.match(/c-(\S+)/) || [])[1] : null;
      var dateEl = li.querySelector('.ev-date');
      var year = dateEl && dateEl.textContent ? dateEl.textContent.substring(0,4) : null;

      var passCorridor = !corridorClass || corridorFilters.indexOf(corridorClass) !== -1;
      var passYear = !yearFilter || year === yearFilter;

      li.classList.toggle('hidden', !(passTab && passCorridor && passYear));
    });
  }
})();

/* Cluster badge styles injected */
(function(){
  var s = document.createElement('style');
  s.textContent = ''+
    '.cluster-badge{display:flex;align-items:center;justify-content:center;width:36px;height:36px;'+
    'border-radius:18px;color:white;font-weight:700;font-size:13px;border:2px solid white;'+
    'box-shadow:0 1px 3px rgba(0,0,0,0.3);}'+
    '.cluster-hazard{background:#1f6feb;}'+
    '.cluster-roadkill{background:#d33;}';
  document.head.appendChild(s);
})();

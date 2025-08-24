(async function(){
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // 拉数据：优先 trips.json，不存在则尝试 trips_public.json
  async function loadData(){
    for (const f of ['trips.json','trips_public.json']) {
      try{
        const r = await fetch(f, {cache:'no-store'});
        if (r.ok) return await r.json();
      }catch(e){}
    }
    return {items:[]};
  }

  function fmtDate(dt){
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function dayKey(dt){
    if (!dt) return 'Unknown';
    const d = new Date(dt);
    return d.toISOString().slice(0,10);
  }

  function iconOf(t){
    return {
      flight:'✈️', train:'🚆', hotel:'🏨', campsite:'🏕️', rideshare:'🚗',
      rental:'🚘', ferry:'⛴️', event:'🎟️', restaurant:'🍽️', parking:'🅿️', other:'📦'
    }[t] || '📦';
  }

  function render(items){
    const type = $('#typeFilter').value.trim();
    const q = $('#q').value.trim().toLowerCase();
    const from = $('#fromDate').value ? new Date($('#fromDate').value) : null;
    const to = $('#toDate').value ? new Date($('#toDate').value) : null;

    let list = (items||[]).slice().sort((a,b)=> new Date(a.start||0) - new Date(b.start||0));

    // 过滤
    list = list.filter(it=>{
      if (type && it.type !== type) return false;
      if (q) {
        const blob = JSON.stringify(it).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (from && it.start && new Date(it.start) < from) return false;
      if (to && it.start && new Date(it.start) > to) return false;
      return true;
    });

    $('#summary').textContent = `共 ${list.length} 条 · 生成时间 ${data.generated_at || ''}`;

    // 分组渲染
    const wrap = $('#timeline');
    wrap.innerHTML = '';
    let currentDay = null;
    for (const it of list){
      const dk = dayKey(it.start);
      if (dk !== currentDay){
        currentDay = dk;
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = dk;
        wrap.appendChild(sep);
      }
      wrap.appendChild(renderCard(it));
    }
  }

  function renderCard(it){
    const card = document.createElement('div'); card.className = 'card';

    const top = document.createElement('div'); top.className='top';
    const badge = document.createElement('span'); badge.className='badge'; badge.textContent = iconOf(it.type) + ' ' + it.type;
    const title = document.createElement('div'); title.className='title';
    title.textContent = it.title || it.vendor || it.carrier || it.type;
    const sub = document.createElement('div'); sub.className='sub';
    sub.textContent = (it.origin?.code || it.origin?.name || '') + (it.destination ? ' → ' : '') + (it.destination?.code || it.destination?.name || '');
    top.append(badge, title, sub);

    const grid = document.createElement('div'); grid.className='grid';
    addKV(grid,'开始', fmtDate(it.start));
    addKV(grid,'结束', fmtDate(it.end));
    if (it.number) addKV(grid,'编号', it.number);
    if (it.confirmation) addKV(grid,'确认号', it.confirmation);
    if (it.amount?.value) addKV(grid,'金额', `${it.amount.value} ${it.amount.currency}`);
    if (it.address) addKV(grid,'地址', it.address);
    if (it.pickup) addKV(grid,'上车', it.pickup);
    if (it.dropoff) addKV(grid,'下车', it.dropoff);
    if (it.site_no) addKV(grid,'营位', it.site_no);
    if (it.hookups) addKV(grid,'接驳', it.hookups);
    if (it.passengers?.length) addKV(grid,'旅客', it.passengers.join(', '));
    if (it.status) addKV(grid,'状态', it.status);

    card.append(top, grid);
    return card;
  }
  function addKV(grid,k,v){
    const box = document.createElement('div'); box.className='kv';
    const ks = document.createElement('div'); ks.className='k'; ks.textContent = k;
    const vs = document.createElement('div'); vs.className='v'; vs.textContent = v;
    box.append(ks,vs); grid.appendChild(box);
  }

  function buildICS(list){
    const esc = s => String(s||'').replace(/[\,;\\]/g, m => '\\'+m).replace(/\n/g,'\\n');
    const dt = d => d ? new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z') : null;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Travel Timeline//EN'
    ];
    for (const it of list){
      const dtStart = dt(it.start) || null;
      const dtEnd = dt(it.end) || null;
      lines.push('BEGIN:VEVENT');
      if (dtStart) lines.push('DTSTART:' + dtStart);
      if (dtEnd) lines.push('DTEND:' + dtEnd);
      const sum = it.title || `${(it.vendor||it.carrier||it.type)} ${(it.number||'')}`.trim();
      lines.push('SUMMARY:' + esc(iconOf(it.type)+' '+sum));
      const loc = it.address || [it.origin?.code||it.origin?.name, it.destination ? '→' : '', it.destination?.code||it.destination?.name].join(' ');
      if (loc) lines.push('LOCATION:' + esc(loc));
      if (it.confirmation) lines.push('DESCRIPTION:' + esc('Confirmation: ' + it.confirmation));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function download(filename, content, type='text/plain'){
    const blob = new Blob([content], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
  }

  // 绑定事件
  $('#btnExport').addEventListener('click', ()=>{
    const type = $('#typeFilter').value.trim();
    const list = filteredItems();
    const ics = buildICS(list);
    download(type ? `travel_${type}.ics` : 'travel.ics', ics, 'text/calendar');
  });
  $('#btnReset').addEventListener('click', ()=>{
    $('#typeFilter').value = '';
    $('#q').value = '';
    $('#fromDate').value = '';
    $('#toDate').value = '';
    render(data.items);
  });
  ['typeFilter','q','fromDate','toDate'].forEach(id => {
    $( '#'+id ).addEventListener('input', ()=> render(data.items));
  });

  function filteredItems(){
    const type = $('#typeFilter').value.trim();
    const q = $('#q').value.trim().toLowerCase();
    const from = $('#fromDate').value ? new Date($('#fromDate').value) : null;
    const to = $('#toDate').value ? new Date($('#toDate').value) : null;
    return data.items.filter(it=>{
      if (type && it.type !== type) return false;
      if (q) {
        const blob = JSON.stringify(it).toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (from && it.start && new Date(it.start) < from) return false;
      if (to && it.start && new Date(it.start) > to) return false;
      return true;
    });
  }

  // 启动
  const data = await loadData();
  render(data.items);
})();

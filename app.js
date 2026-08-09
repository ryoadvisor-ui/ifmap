/* カスタムフローチャート - データ、保存、表示、操作をこの順で分けています。 */
(() => {
  'use strict';

  // ---------- 定数と共通処理 ----------
  const STORAGE_KEY = 'ifmap.maps.v1';
  const CURRENT_KEY = 'ifmap.current.v1';
  const TUTORIAL_KEY = 'ifmap.tutorial.completed.v1';
  const TYPE_INFO = {
    start: { label: '開始', defaultTitle: 'ここから開始' },
    process: { label: '処理', defaultTitle: '作業を行う' },
    question: { label: '質問・判断', defaultTitle: '条件を確認する' },
    end: { label: '終了', defaultTitle: 'ここで終了' },
    memo: { label: 'メモ', defaultTitle: '補足メモ' }
  };
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeText = value => String(value ?? '');
  const formatDate = iso => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  function makeNode(type, x, y, title) {
    const node = { id: uid('node'), type: 'process', title: title || '新しい項目', description: '', status: 'unprocessed', startDate: '', dueDate: '', x, y, targetId: null, options: [], createdAt: now(), updatedAt: now() };
    if (type === 'question') node.options = [
      { id: uid('option'), label: 'はい', targetId: null },
      { id: uid('option'), label: 'いいえ', targetId: null }
    ];
    return node;
  }

  function link(from, to) { from.targetId = to.id; }
  function optionLink(from, label, to) { from.options.push({ id: uid('option'), label, targetId: to?.id || null }); }
  function makeMap(name, nodes) { const stamp = now(); return { id: uid('map'), name, nodes, createdAt: stamp, updatedAt: stamp, version: 1 }; }

  // ---------- テンプレート ----------
  const TEMPLATES = [
    { id: 'blank', name: '空白', description: '何もない状態から作る', create: () => [] },
    { id: 'yesno', name: 'Yes / No判断', description: '2択の判断から始める', create: () => {
      const s = makeNode('start', 470, 120, '判断を開始');
      const q = makeNode('question', 460, 310, '条件に当てはまりますか？'); q.options = [];
      const y = makeNode('end', 270, 560, '「はい」の結果');
      const n = makeNode('end', 680, 560, '「いいえ」の結果');
      link(s, q); optionLink(q, 'はい', y); optionLink(q, 'いいえ', n); return [s,q,y,n];
    }},
    { id: 'trouble', name: 'トラブル対応', description: '確認→対応→完了の流れ', create: () => {
      const s=makeNode('start',480,80,'トラブルを受け付ける'), q=makeNode('question',470,260,'緊急性がありますか？'); q.options=[];
      const a=makeNode('process',250,500,'責任者へすぐ連絡する'), b=makeNode('process',690,500,'状況を詳しく確認する');
      const e=makeNode('end',480,760,'対応内容を記録して終了'); link(s,q); optionLink(q,'はい',a); optionLink(q,'いいえ',b); link(a,e); link(b,e); return[s,q,a,b,e];
    }},
    { id: 'multi', name: '複数選択判断', description: '3つの選択肢に分ける', create: () => {
      const s=makeNode('start',480,80,'受付を開始'), q=makeNode('question',470,260,'どの種類に当てはまりますか？'); q.options=[];
      const a=makeNode('process',150,530,'Aの手順を案内'), b=makeNode('process',470,530,'Bの手順を案内'), c=makeNode('process',790,530,'担当者に確認');
      link(s,q); optionLink(q,'種類A',a); optionLink(q,'種類B',b); optionLink(q,'不明・その他',c); return[s,q,a,b,c];
    }},
    { id: 'steps', name: '作業手順', description: '上から順に進む基本形', create: () => {
      const s=makeNode('start',480,80,'作業を開始'), a=makeNode('process',480,270,'必要なものを準備'), b=makeNode('process',480,470,'作業を実施'), e=makeNode('end',480,670,'確認して完了'); link(s,a);link(a,b);link(b,e);return[s,a,b,e];
    }}
  ];

  // ---------- 保存と状態管理 ----------
  const Store = {
    maps: [], currentId: null,
    load() {
      try { this.maps = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { this.maps = []; }
      this.maps = this.maps.map(normalizeMap);
      this.currentId = localStorage.getItem(CURRENT_KEY);
      if (!this.maps.length) {
        const starter = makeMap('サンプルフロー', TEMPLATES.find(t => t.id === 'yesno').create());
        this.maps = [starter]; this.currentId = starter.id; this.save();
      }
      if (!this.maps.some(m => m.id === this.currentId)) this.currentId = this.maps[0].id;
    },
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.maps));
      localStorage.setItem(CURRENT_KEY, this.currentId || '');
    },
    current() { return this.maps.find(m => m.id === this.currentId) || null; },
    add(map) { this.maps.push(normalizeMap(map)); this.currentId = map.id; this.save(); },
    remove(id) { this.maps = this.maps.filter(m => m.id !== id); if (this.currentId === id) this.currentId = this.maps[0]?.id || null; this.save(); }
  };

  function normalizeMap(raw) {
    const stamp = now();
    const savedName = safeText(raw.name || '読み込んだマップ');
    const map = { id: raw.id || uid('map'), name: savedName === 'はじめてのイフマップ' ? 'サンプルフロー' : savedName, nodes: Array.isArray(raw.nodes) ? raw.nodes : [], createdAt: raw.createdAt || stamp, updatedAt: raw.updatedAt || stamp, version: 1 };
    map.nodes = map.nodes.map((n, index) => ({
      id: n.id || uid('node'), type: TYPE_INFO[n.type] ? n.type : 'process', title: safeText(n.title || '名称未設定'), description: safeText(n.description),
      status: ['unprocessed','processing','done'].includes(n.status) ? n.status : 'unprocessed', startDate: /^\d{4}-\d{2}-\d{2}$/.test(n.startDate || '') ? n.startDate : '', dueDate: /^\d{4}-\d{2}-\d{2}$/.test(n.dueDate || '') ? n.dueDate : '',
      x: Number.isFinite(Number(n.x)) ? Number(n.x) : 400 + (index % 3) * 300, y: Number.isFinite(Number(n.y)) ? Number(n.y) : 120 + Math.floor(index / 3) * 210,
      targetId: n.targetId || null, options: Array.isArray(n.options) ? n.options.map(o => ({ id: o.id || uid('option'), label: safeText(o.label || '選択肢'), targetId: o.targetId || null })) : [],
      createdAt: n.createdAt || stamp, updatedAt: n.updatedAt || stamp
    }));
    return map;
  }

  const state = { mode: 'edit', listSort: 'status', selectedNodeId: null, mobileInspectorOpen: false, zoom: 1, panX: 20, panY: 30, mobileMapId: null, history: [], future: [], activeEdge: null, connectionDraft: null, runNodeId: null, runSteps: 0, runPath: [], printMode: null, printOrigin: null, printSelection: new Set() };
  let historyLocked = false;
  function snapshot() { if (historyLocked || !Store.current()) return; state.history.push(JSON.stringify(Store.current())); if (state.history.length > 80) state.history.shift(); state.future = []; }
  function commit(message) { const map = Store.current(); if (!map) return; map.updatedAt = now(); Store.save(); renderAll(); if (message) toast(message); }
  function undo() { if (!state.history.length) return; state.future.push(JSON.stringify(Store.current())); replaceCurrent(JSON.parse(state.history.pop())); state.selectedNodeId = null; Store.save(); renderAll(); }
  function redo() { if (!state.future.length) return; state.history.push(JSON.stringify(Store.current())); replaceCurrent(JSON.parse(state.future.pop())); state.selectedNodeId = null; Store.save(); renderAll(); }
  function replaceCurrent(map) { const index = Store.maps.findIndex(m => m.id === Store.currentId); if (index >= 0) Store.maps[index] = normalizeMap(map); }
  function getNode(id) { return Store.current()?.nodes.find(n => n.id === id) || null; }

  // ---------- 画面要素 ----------
  const $ = selector => document.querySelector(selector);
  const refs = {
    app: $('#app'), workspace: $('#workspace'), listPage: $('#listPage'), flowList: $('#flowList'), listSummary: $('#listSummary'), listSort: $('#listSort'), viewport: $('#viewport'), world: $('#world'), nodeLayer: $('#nodeLayer'), edgeLayer: $('#edgeLayer'), edgeLabelLayer: $('#edgeLabelLayer'), empty: $('#emptyState'),
    inspector: $('#inspector'), inspectorEmpty: $('#inspectorEmpty'), nodeForm: $('#nodeForm'), nodeTitle: $('#nodeTitle'), nodeDescription: $('#nodeDescription'), nodeStatus: $('#nodeStatus'),
    startYear: $('#startYear'), startMonth: $('#startMonth'), startDay: $('#startDay'), dueYear: $('#dueYear'), dueMonth: $('#dueMonth'), dueDay: $('#dueDay'),
    nodeTarget: $('#nodeTarget'), simpleConnection: $('#simpleConnection'), questionOptions: $('#questionOptions'), optionsList: $('#optionsList'),
    title: $('#mapTitleButton'), mapsDialog: $('#mapsDialog'), newMapDialog: $('#newMapDialog'), dataDialog: $('#dataDialog'), confirmDialog: $('#confirmDialog'),
    mapList: $('#mapList'), templateList: $('#templateList'), newMapName: $('#newMapName'), zoomReset: $('#zoomResetButton'), mobileEditButton: $('#mobileEditButton'), toast: $('#toast'), runPanel: $('#runPanel'), runCard: $('#runCard'),
    tutorialOverlay: $('#tutorialOverlay'), tutorialSpotlight: $('#tutorialSpotlight'), tutorialCard: $('#tutorialCard'), tutorialTitle: $('#tutorialTitle'), tutorialText: $('#tutorialText'), tutorialStep: $('#tutorialStep'), tutorialBack: $('#tutorialBack'), tutorialNext: $('#tutorialNext'),
    printBar: $('#printSelectionBar'), printTitle: $('#printSelectionTitle'), printText: $('#printSelectionText'), printConfirm: $('#printSelectionConfirm'), selectionBox: $('#selectionBox'), printSheet: $('#printSheet'), runPrintDialog: $('#runPrintDialog'), runPrintList: $('#runPrintList')
  };
  const svgNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}) { const el = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v)); return el; }
  function optionMarkup(selected, excludeId) {
    const nodes = Store.current()?.nodes || [];
    return `<option value="">接続しない</option>` + nodes.filter(n => n.id !== excludeId).map(n => `<option value="${n.id}" ${n.id === selected ? 'selected' : ''}>${escapeHtml(n.title)}</option>`).join('');
  }
  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = safeText(text); return div.innerHTML; }

  // ---------- フロー表示 ----------
  function renderAll() {
    const map = Store.current();
    refs.title.textContent = state.mode === 'list' ? 'すべてのマップ' : (map?.name || 'マップなし');
    document.title = `${state.mode === 'list' ? 'フロー一覧' : (map?.name || 'カスタムフローチャート')} | カスタムフローチャート`;
    refs.app.classList.remove('mode-view');
    refs.app.classList.toggle('mode-list', state.mode === 'list');
    refs.workspace.hidden = state.mode === 'list'; refs.listPage.hidden = state.mode !== 'list';
    document.querySelectorAll('.mode-switch button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    $('#modeHint').textContent = 'カードをドラッグして並べ替え';
    if (state.mode === 'list') renderFlowList(); else { renderNodes(); renderEdges(); renderInspector(); updateTransform(); scheduleMobileMapCenter(map); }
    $('#undoButton').disabled = !state.history.length; $('#redoButton').disabled = !state.future.length;
  }

  // ---------- フロー横断一覧 ----------
  function flowOrder(map) {
    const sorted=map.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x),incoming=new Set();
    map.nodes.forEach(n=>{if(n.targetId)incoming.add(n.targetId);n.options.forEach(o=>{if(o.targetId)incoming.add(o.targetId)})});
    const root=sorted.find(n=>!incoming.has(n.id))||sorted[0];if(!root)return[];
    const byId=new Map(map.nodes.map(n=>[n.id,n])),visited=new Set(),result=[],queue=[root];
    while(queue.length){const node=queue.shift();if(!node||visited.has(node.id))continue;visited.add(node.id);result.push(node);const targets=node.options.length?node.options.map(o=>o.targetId):[node.targetId];targets.forEach(id=>{if(id&&!visited.has(id))queue.push(byId.get(id))});}
    sorted.forEach(n=>{if(!visited.has(n.id))result.push(n)});return result;
  }
  function flowSummary(map){const order=flowOrder(map),first=order[0]||null,next=order.find(n=>n.status!=='done')||null,focus=next||first,stateInfo=focus?(next?getDisplayState(focus):{key:'done',label:'処理済み'}):{key:'done',label:'項目なし'};return{map,first,next,focus,stateInfo,startDate:focus?.startDate||'',dueDate:focus?.dueDate||''};}
  function compareFlow(a,b){const empty='9999-99-99';if(state.listSort==='startDate')return(a.startDate||empty).localeCompare(b.startDate||empty)||a.map.name.localeCompare(b.map.name,'ja');if(state.listSort==='dueDate')return(a.dueDate||empty).localeCompare(b.dueDate||empty)||a.map.name.localeCompare(b.map.name,'ja');if(state.listSort==='updated')return new Date(b.map.updatedAt)-new Date(a.map.updatedAt);const rank={overdue:0,processing:1,unprocessed:2,before:3,done:4};return(rank[a.stateInfo.key]??9)-(rank[b.stateInfo.key]??9)||(a.dueDate||empty).localeCompare(b.dueDate||empty);}
  function fullDate(value){if(!value)return'日付未設定';const[y,m,d]=value.split('-');return`${y}年${Number(m)}月${Number(d)}日`;}
  function renderFlowList(){const rows=Store.maps.map(flowSummary).sort(compareFlow),unfinished=rows.filter(r=>r.next).length,overdue=rows.filter(r=>r.stateInfo.key==='overdue').length;refs.listSort.value=state.listSort;refs.listSummary.innerHTML=`<span class="summary-chip">${rows.length}フロー</span><span class="summary-chip">未完了 ${unfinished}</span><span class="summary-chip">期限超過 ${overdue}</span>`;refs.flowList.replaceChildren();if(!rows.length){refs.flowList.innerHTML='<div class="list-empty">保存済みのフローがありません。</div>';return;}rows.forEach(row=>{const card=document.createElement('article');card.className='flow-list-card';card.dataset.phase=row.stateInfo.key;card.dataset.mapId=row.map.id;card.innerHTML=`<div class="flow-name"><span class="eyebrow">フロー</span><h2>${escapeHtml(row.map.name)}</h2><small>${row.map.nodes.length}項目</small></div><div class="list-item-block"><span>フローの最初</span><b>${escapeHtml(row.first?.title||'項目がありません')}</b><small>${row.first?fullDate(row.first.startDate):'—'}</small></div><div class="list-item-block"><span>次に対応する項目</span><b>${escapeHtml(row.next?.title||'すべて処理済み')}</b><small><span class="status-badge ${row.stateInfo.key}">${row.stateInfo.label}</span>　${row.focus?fullDate(row.focus.dueDate):'—'}</small></div><button class="button secondary" type="button">フローを開く</button>`;card.querySelector('button').onclick=()=>openFlowFromList(row.map.id,(row.next||row.first)?.id);refs.flowList.appendChild(card);});if(state.printMode==='list')decorateListPrint();}
  function openFlowFromList(mapId,nodeId){Store.currentId=mapId;Store.save();state.mode='edit';state.selectedNodeId=nodeId||null;state.mobileInspectorOpen=false;state.history=[];state.future=[];renderAll();const node=getNode(nodeId);if(node){state.panX=refs.viewport.clientWidth/2-(node.x+120)*state.zoom;state.panY=refs.viewport.clientHeight/2-(node.y+60)*state.zoom;updateTransform();}}

  function renderNodes() {
    refs.nodeLayer.replaceChildren();
    const nodes = Store.current()?.nodes || [];
    refs.empty.hidden = nodes.length > 0;
    nodes.forEach(node => {
      const el = document.createElement('article');
      el.className = `flow-node${node.id === state.selectedNodeId ? ' selected' : ''}${state.printMode==='edit'&&state.printSelection.has(node.id)?' print-picked':''}`;
      const displayState = getDisplayState(node);
      const hasBranch = node.options.length > 0;
      el.dataset.id = node.id; el.dataset.type = node.type; el.dataset.branch = String(hasBranch); el.dataset.phase = displayState.key; el.style.left = `${node.x}px`; el.style.top = `${node.y}px`;
      const overdue = displayState.key === 'overdue';
      const dates = `${node.startDate ? `<span class="date-badge">開始 ${formatShortDate(node.startDate)}</span>` : ''}${node.dueDate ? `<span class="date-badge${overdue ? ' overdue' : ''}">期限 ${formatShortDate(node.dueDate)}</span>` : ''}`;
      const ports = hasBranch
        ? `<div class="question-port-grid">${node.options.map(o => `<div class="port-unit"><span class="port-label" title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span><button class="node-port output-port" data-key="${o.id}" type="button" aria-label="「${escapeHtml(o.label)}」の出口"></button></div>`).join('')}</div>`
        : '<button class="node-port output-port single" data-key="main" type="button" aria-label="出口"></button>';
      el.innerHTML = `<button class="node-port input-port" type="button" aria-label="入口"></button><h3 class="node-title">${escapeHtml(node.title)}</h3>${node.description ? `<p class="node-description">${escapeHtml(node.description)}</p>` : ''}<div class="node-meta"><span class="status-badge ${displayState.key}">${displayState.label}</span>${dates}</div>${ports}`;
      el.querySelectorAll('.node-port').forEach(port => port.addEventListener('click', event => event.stopPropagation()));
      el.querySelectorAll('.output-port').forEach(port => port.addEventListener('pointerdown', beginConnectionDrag));
      el.addEventListener('pointerdown', beginNodeDrag);
      el.addEventListener('click', event => {
        if (Date.now() < suppressTouchClickUntil) return;
        if (el.dataset.dragged === 'true') { el.dataset.dragged = 'false'; return; }
        if (state.mode === 'edit') { state.selectedNodeId = node.id; if(window.matchMedia('(max-width: 760px)').matches)state.mobileInspectorOpen=false; renderAll(); }
        else if (state.mode === 'view') highlightNext(node);
      });
      refs.nodeLayer.appendChild(el);
    });
  }

  function scheduleMobileMapCenter(map) {
    if (!map || !window.matchMedia('(max-width: 760px)').matches || state.mobileMapId === map.id) return;
    state.mobileMapId = map.id;
    requestAnimationFrame(() => {
      const order = flowOrder(map), node = order[0] || map.nodes[0];
      if (!node || !refs.viewport.clientWidth) return;
      state.zoom = .82;
      state.panX = refs.viewport.clientWidth / 2 - (node.x + 120) * state.zoom;
      state.panY = 64 - node.y * state.zoom;
      updateTransform();
    });
  }

  function resetCanvasView() {
    const map = Store.current();
    if (window.matchMedia('(max-width: 760px)').matches && map?.nodes.length) {
      state.mobileMapId = null;
      scheduleMobileMapCenter(map);
    } else setZoom(1);
  }

  function localToday() { const d=new Date(),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function getDisplayState(node) {
    if (node.status === 'done') return { key:'done', label:'処理済み' };
    const today=localToday();
    if (node.startDate && today < node.startDate) return { key:'before', label:'開始前' };
    if (node.dueDate && today > node.dueDate) return { key:'overdue', label:'期限終了・未完了' };
    if (node.status === 'processing') return { key:'processing', label:'処理中' };
    return { key:'unprocessed', label:'未処理' };
  }
  function formatShortDate(value) { const [,month,day] = value.split('-'); return `${Number(month)}/${Number(day)}`; }

  function portPosition(nodeId, selector, fallback) {
    const node = getNode(nodeId), el = refs.nodeLayer.querySelector(`[data-id="${nodeId}"]`), port = el?.querySelector(selector);
    if (!node || !el || !port) return fallback(node);
    return { x: node.x + port.offsetLeft + port.offsetWidth / 2, y: node.y + port.offsetTop + port.offsetHeight / 2 };
  }
  function edgePath(a, b, key = 'main') {
    const start = portPosition(a.id, `.output-port[data-key="${key}"]`, n => ({ x:n.x+(n.type==='question'?140:120), y:n.y+estimateHeight(n) }));
    const end = portPosition(b.id, '.input-port', n => ({ x:n.x+(n.type==='question'?140:120), y:n.y }));
    const startX = start.x, startY = start.y, endX = end.x, endY = end.y;
    const distance = Math.max(55, Math.abs(endY - startY) * .45);
    if (endY >= startY - 20) return cubicGeometry(startX,startY,startX,startY+distance,endX,endY-distance,endX,endY);
    const side = startX <= endX ? 1 : -1; const bendX = startX + side * 170;
    return cubicGeometry(startX,startY,bendX,startY+40,bendX,endY-40,endX,endY);
  }
  function cubicGeometry(x1,y1,c1x,c1y,c2x,c2y,x2,y2){const t=.75,u=1-t,labelX=u**3*x1+3*u**2*t*c1x+3*u*t**2*c2x+t**3*x2,labelY=u**3*y1+3*u**2*t*c1y+3*u*t**2*c2y+t**3*y2;return{d:`M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,labelX,labelY};}
  function estimateHeight(n) { const el=refs.nodeLayer.querySelector(`[data-id="${n.id}"]`);return el?.offsetHeight||102; }
  function renderEdges() {
    refs.edgeLayer.replaceChildren(); refs.edgeLabelLayer.replaceChildren(); const nodes = Store.current()?.nodes || []; const byId = new Map(nodes.map(n => [n.id,n]));
    nodes.forEach(from => {
      const links = from.options.length ? from.options.map(o => ({ targetId:o.targetId, label:o.label, key:o.id })) : [{ targetId:from.targetId, label:'', key:'main' }];
      links.forEach(link => { const to=byId.get(link.targetId); if (!to) return; const p=edgePath(from,to,link.key); const active=state.activeEdge && state.activeEdge.from===from.id && state.activeEdge.key===link.key;
        const hit=svg('path',{d:p.d,class:'edge-hit','data-from':from.id,'data-key':link.key});
        hit.addEventListener('click', event => { if (state.mode !== 'edit') return; event.stopPropagation(); disconnectEdge(from.id,link.key); });
        hit.addEventListener('mouseenter',()=>path.classList.add('hovered'));hit.addEventListener('mouseleave',()=>path.classList.remove('hovered'));
        const path=svg('path',{d:p.d,class:`edge${active?' active':''}`}); refs.edgeLayer.append(hit,path);
        if (link.label) { const width=Math.min(180,Math.max(44,link.label.length*13+20)); const rect=svg('rect',{x:p.labelX-width/2,y:p.labelY-13,width,height:26,class:'edge-label-bg'}); const text=svg('text',{x:p.labelX,y:p.labelY+1,class:'edge-label'}); text.textContent=link.label; refs.edgeLabelLayer.append(rect,text); }
      });
    });
    if (state.connectionDraft) {
      const { fromId, key, pointer } = state.connectionDraft, from = byId.get(fromId);
      if (from) { const start=portPosition(fromId,`.output-port[data-key="${key}"]`,n=>({x:n.x+120,y:n.y+estimateHeight(n)}));const d=draftPath(start,pointer);refs.edgeLayer.appendChild(svg('path',{d,class:'edge-draft'})); }
    }
  }

  function draftPath(start,end){const distance=Math.max(55,Math.abs(end.y-start.y)*.45);return `M ${start.x} ${start.y} C ${start.x} ${start.y+distance}, ${end.x} ${end.y-distance}, ${end.x} ${end.y}`;}
  function disconnectEdge(fromId,key){const from=getNode(fromId);if(!from)return;snapshot();setLinkTarget(from,key,null);commit('接続を外しました');}

  function highlightNext(node) {
    if (node.options.length) {
      state.selectedNodeId = node.id; renderAll();
      const card = refs.nodeLayer.querySelector(`[data-id="${node.id}"]`); if (!card) return;
      let picker = card.querySelector('.view-picker');
      if (!picker) { picker=document.createElement('div');picker.className='node-options-preview view-picker'; node.options.forEach(o=>{const b=document.createElement('button');b.className='small-button';b.textContent=o.label;b.onclick=e=>{e.stopPropagation();showHighlight(node.id,o.id,o.targetId)};picker.appendChild(b)});card.appendChild(picker); }
    } else if (node.targetId) showHighlight(node.id,'main',node.targetId);
  }
  function showHighlight(from,key,targetId) { state.activeEdge={from,key}; renderEdges(); const target=refs.nodeLayer.querySelector(`[data-id="${targetId}"]`); target?.classList.add('highlighted'); target?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); setTimeout(()=>target?.classList.remove('highlighted'),1500); }

  // ---------- 編集欄 ----------
  function renderInspector() {
    const node = getNode(state.selectedNodeId);
    const mobile=window.matchMedia('(max-width: 760px)').matches;
    refs.inspector.classList.toggle('mobile-open', !!node&&(!mobile||state.mobileInspectorOpen));
    refs.mobileEditButton.hidden=!mobile||!node||state.mobileInspectorOpen;
    refs.inspectorEmpty.hidden = !!node; refs.nodeForm.hidden = !node; if (!node) return;
    refs.nodeTitle.value=node.title; refs.nodeDescription.value=node.description;refs.nodeStatus.value=node.status;setDateParts('start',node.startDate);setDateParts('due',node.dueDate);
    refs.simpleConnection.hidden = node.options.length > 0;
    refs.questionOptions.hidden = false; refs.nodeTarget.innerHTML=optionMarkup(node.targetId,node.id);
    refs.optionsList.replaceChildren();
    node.options.forEach(option => {
      const row=document.createElement('div');row.className='option-editor';row.dataset.optionId=option.id;
      row.innerHTML=`<div class="option-top"><input class="option-label" type="text" maxlength="80" value="${escapeHtml(option.label)}" aria-label="選択肢名"><button class="remove-option" type="button" aria-label="選択肢を削除">×</button></div><select class="option-target" aria-label="接続先">${optionMarkup(option.targetId,node.id)}</select>`;
      row.querySelector('.option-label').addEventListener('change', e=>updateOption(option.id,'label',e.target.value||'選択肢'));
      row.querySelector('.option-target').addEventListener('change', e=>updateOption(option.id,'targetId',e.target.value||null));
      row.querySelector('.remove-option').addEventListener('click',()=>removeOption(option.id)); refs.optionsList.appendChild(row);
    });
  }
  function changeNode(field,value) { const node=getNode(state.selectedNodeId);if(!node)return;snapshot();node[field]=value;node.updatedAt=now(); if(field==='type'){ if(value==='question'&&!node.options.length)node.options=[{id:uid('option'),label:'はい',targetId:null},{id:uid('option'),label:'いいえ',targetId:null}]; if(value==='end')node.targetId=null;}commit(); }
  function updateOption(id,field,value){const node=getNode(state.selectedNodeId),option=node?.options.find(o=>o.id===id);if(!option)return;snapshot();option[field]=value;node.updatedAt=now();commit();}
  function setDateParts(prefix,value){const parts=value?value.split('-'):['','',''];refs[`${prefix}Year`].value=parts[0]||'';refs[`${prefix}Month`].value=parts[1]?Number(parts[1]):'';refs[`${prefix}Day`].value=parts[2]?Number(parts[2]):'';}
  function readDateParts(prefix,showError=false){const year=refs[`${prefix}Year`].value.trim(),month=refs[`${prefix}Month`].value.trim(),day=refs[`${prefix}Day`].value.trim();if(!year&&!month&&!day)return'';if(!year||!month||!day)return null;const y=Number(year),m=Number(month),d=Number(day),date=new Date(y,m-1,d);if(y<2000||y>2100||date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d){if(showError)toast('正しい年月日を入力してください');return null;}return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  function updateDate(prefix,field,showError=false){const value=readDateParts(prefix,showError);if(value===null)return;const node=getNode(state.selectedNodeId);if(!node||node[field]===value)return;changeNode(field,value);}
  const dateInputTimers={start:null,due:null};
  function bindDateInputs(prefix,field){['Year','Month','Day'].forEach(part=>{const input=refs[`${prefix}${part}`];input.addEventListener('input',()=>{clearTimeout(dateInputTimers[prefix]);dateInputTimers[prefix]=setTimeout(()=>updateDate(prefix,field,false),250)});input.addEventListener('blur',()=>{clearTimeout(dateInputTimers[prefix]);updateDate(prefix,field,true)});});}
  function removeOption(id){const node=getNode(state.selectedNodeId);if(!node)return;snapshot();node.options=node.options.filter(o=>o.id!==id);commit('選択肢を削除しました');}
  function addOption(){const node=getNode(state.selectedNodeId);if(!node)return;snapshot();node.options.push({id:uid('option'),label:`選択肢${node.options.length+1}`,targetId:null});commit();setTimeout(()=>refs.optionsList.lastElementChild?.querySelector('input')?.focus(),0);}

  // ---------- ノード・キャンバス操作 ----------
  function addNode() { const map=Store.current();if(!map)return;snapshot(); const visibleX=(refs.viewport.clientWidth/2-state.panX)/state.zoom-120, visibleY=(refs.viewport.clientHeight/2-state.panY)/state.zoom-50; const node=makeNode('process',Math.max(30,Math.round(visibleX)),Math.max(30,Math.round(visibleY))); map.nodes.push(node);state.selectedNodeId=node.id;commit('項目を作成しました'); }
  function deleteNode(){const map=Store.current(),node=getNode(state.selectedNodeId);if(!map||!node)return;confirmAction('項目を削除しますか？',`「${node.title}」と、この項目につながる接続を削除します。`,()=>{snapshot();map.nodes=map.nodes.filter(n=>n.id!==node.id);map.nodes.forEach(n=>{if(n.targetId===node.id)n.targetId=null;n.options.forEach(o=>{if(o.targetId===node.id)o.targetId=null})});state.selectedNodeId=null;commit('項目を削除しました')});}
  function duplicateNode(){const map=Store.current(),node=getNode(state.selectedNodeId);if(!map||!node)return;snapshot();const copy=clone(node);copy.id=uid('node');copy.title=`${node.title}（コピー）`;copy.x+=35;copy.y+=35;copy.createdAt=copy.updatedAt=now();copy.options=copy.options.map(o=>({...o,id:uid('option')}));map.nodes.push(copy);state.selectedNodeId=copy.id;commit('項目を複製しました');}
  let activeNodeDragPointer=null;
  const touchPoints=new Map(),pinchSequencePointers=new Set();let pinchGesture=null,suppressTouchClickUntil=0;
  function beginNodeDrag(event){if(state.mode!=='edit'||event.button!==0||event.target.closest('.node-port')||pinchSequencePointers.has(event.pointerId)||activeNodeDragPointer!==null)return;event.stopPropagation();const el=event.currentTarget,node=getNode(el.dataset.id);if(!node)return;activeNodeDragPointer=event.pointerId;const startX=event.clientX,startY=event.clientY,originX=node.x,originY=node.y;let moved=false,recorded=false;el.setPointerCapture(event.pointerId);
    const move=e=>{if(pinchSequencePointers.has(e.pointerId))return;const dx=(e.clientX-startX)/state.zoom,dy=(e.clientY-startY)/state.zoom,threshold=e.pointerType==='touch'?18:5;if(Math.abs(dx)+Math.abs(dy)>threshold){moved=true;if(!recorded){snapshot();recorded=true;}node.x=Math.max(0,Math.round(originX+dx));node.y=Math.max(0,Math.round(originY+dy));el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;renderEdges();}};
    const up=e=>{const touchTap=e.type==='pointerup'&&e.pointerType==='touch'&&!moved&&!pinchSequencePointers.has(e.pointerId);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);if(activeNodeDragPointer===event.pointerId)activeNodeDragPointer=null;if(moved){el.dataset.dragged='true';node.updatedAt=now();Store.current().updatedAt=now();Store.save();}else if(touchTap){state.selectedNodeId=node.id;state.mobileInspectorOpen=false;renderAll();}};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  function clientToWorld(clientX,clientY){const rect=refs.viewport.getBoundingClientRect();return{x:(clientX-rect.left-state.panX)/state.zoom,y:(clientY-rect.top-state.panY)/state.zoom};}
  function setLinkTarget(from,key,targetId){if(key==='main')from.targetId=targetId;else{const option=from.options.find(o=>o.id===key);if(option)option.targetId=targetId;}from.updatedAt=now();}
  function findConnectionTarget(clientX,clientY,fromId,pointerType){const margin=pointerType==='touch'?34:12;let best=null,bestDistance=Infinity;document.querySelectorAll('.input-port').forEach(port=>{const card=port.closest('.flow-node');if(!card||card.dataset.id===fromId)return;const rect=port.getBoundingClientRect(),cx=(rect.left+rect.right)/2,cy=(rect.top+rect.bottom)/2;if(clientX<rect.left-margin||clientX>rect.right+margin||clientY<rect.top-margin||clientY>rect.bottom+margin)return;const distance=Math.hypot(clientX-cx,clientY-cy);if(distance<bestDistance){best=port;bestDistance=distance;}});return best;}
  function beginConnectionDrag(event){if(state.mode!=='edit'||event.button!==0||pinchSequencePointers.has(event.pointerId))return;event.preventDefault();event.stopPropagation();const port=event.currentTarget,card=port.closest('.flow-node'),from=getNode(card.dataset.id),key=port.dataset.key;if(!from)return;const currentTarget=key==='main'?from.targetId:from.options.find(o=>o.id===key)?.targetId;card.classList.add('connecting-source');document.querySelectorAll('.input-port').forEach(p=>{if(p.closest('.flow-node')?.dataset.id!==from.id)p.classList.add('connection-target')});state.connectionDraft={fromId:from.id,key,pointer:clientToWorld(event.clientX,event.clientY)};renderEdges();port.setPointerCapture(event.pointerId);
    const move=e=>{if(!state.connectionDraft||pinchSequencePointers.has(e.pointerId))return;state.connectionDraft.pointer=clientToWorld(e.clientX,e.clientY);renderEdges()};
    const up=e=>{port.removeEventListener('pointermove',move);port.removeEventListener('pointerup',up);port.removeEventListener('pointercancel',cancel);card.classList.remove('connecting-source');document.querySelectorAll('.input-port').forEach(p=>p.classList.remove('connection-target'));if(pinchSequencePointers.has(e.pointerId)){state.connectionDraft=null;renderEdges();return;}const targetEl=findConnectionTarget(e.clientX,e.clientY,from.id,e.pointerType),targetId=targetEl?.closest('.flow-node')?.dataset.id;state.connectionDraft=null;if(targetId&&targetId!==from.id){if(targetId!==currentTarget){snapshot();setLinkTarget(from,key,targetId);commit('項目を接続しました')}else renderEdges();}else if(currentTarget){snapshot();setLinkTarget(from,key,null);commit('接続を外しました')}else renderEdges();};
    const cancel=()=>{state.connectionDraft=null;card.classList.remove('connecting-source');document.querySelectorAll('.input-port').forEach(p=>p.classList.remove('connection-target'));renderEdges()};port.addEventListener('pointermove',move);port.addEventListener('pointerup',up);port.addEventListener('pointercancel',cancel);
  }
  function beginPan(event){if(event.button!==0||event.target.closest('.flow-node')||pinchSequencePointers.has(event.pointerId))return;const sx=event.clientX,sy=event.clientY,px=state.panX,py=state.panY;refs.viewport.classList.add('panning');refs.viewport.setPointerCapture(event.pointerId);const move=e=>{if(pinchSequencePointers.has(e.pointerId))return;state.panX=px+e.clientX-sx;state.panY=py+e.clientY-sy;updateTransform()};const up=()=>{refs.viewport.classList.remove('panning');refs.viewport.removeEventListener('pointermove',move);refs.viewport.removeEventListener('pointerup',up)};refs.viewport.addEventListener('pointermove',move);refs.viewport.addEventListener('pointerup',up);}
  function pinchDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function handleTouchPointerDown(event){if(event.pointerType!=='touch')return;touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touchPoints.size!==2)return;const entries=[...touchPoints.entries()],a=entries[0][1],b=entries[1][1],rect=refs.viewport.getBoundingClientRect(),midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top;entries.forEach(([id])=>pinchSequencePointers.add(id));suppressTouchClickUntil=Date.now()+500;pinchGesture={ids:entries.map(([id])=>id),distance:Math.max(1,pinchDistance(a,b)),zoom:state.zoom,worldX:(midX-state.panX)/state.zoom,worldY:(midY-state.panY)/state.zoom};refs.viewport.classList.add('pinching');}
  function handleTouchPointerMove(event){if(event.pointerType!=='touch'||!touchPoints.has(event.pointerId))return;touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!pinchGesture||!pinchGesture.ids.every(id=>touchPoints.has(id)))return;event.preventDefault();const a=touchPoints.get(pinchGesture.ids[0]),b=touchPoints.get(pinchGesture.ids[1]),rect=refs.viewport.getBoundingClientRect(),midX=(a.x+b.x)/2-rect.left,midY=(a.y+b.y)/2-rect.top,newZoom=Math.min(1.7,Math.max(.35,pinchGesture.zoom*pinchDistance(a,b)/pinchGesture.distance));state.zoom=newZoom;state.panX=midX-pinchGesture.worldX*newZoom;state.panY=midY-pinchGesture.worldY*newZoom;updateTransform();}
  function handleTouchPointerEnd(event){if(event.pointerType!=='touch')return;touchPoints.delete(event.pointerId);setTimeout(()=>pinchSequencePointers.delete(event.pointerId),0);if(pinchGesture?.ids.includes(event.pointerId)){pinchGesture=null;refs.viewport.classList.remove('pinching');}}
  function setZoom(value){state.zoom=Math.min(1.7,Math.max(.35,value));updateTransform();}
  function updateTransform(){refs.world.style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;refs.zoomReset.textContent=`${Math.round(state.zoom*100)}%`;}

  // ---------- 複数マップとJSON ----------
  function renderMapList(){refs.mapList.replaceChildren();Store.maps.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).forEach(map=>{const item=document.createElement('div');item.className=`map-item${map.id===Store.currentId?' current':''}`;item.innerHTML=`<div class="map-main"><b>${escapeHtml(map.name)}</b><small>${map.nodes.length}項目 · 更新 ${formatDate(map.updatedAt)}</small></div><div class="map-actions"><button class="small-button open">開く</button><button class="small-button rename">名前変更</button><button class="small-button duplicate">複製</button><button class="small-button danger-text remove">削除</button></div>`;
      const open=()=>{Store.currentId=map.id;Store.save();state.selectedNodeId=null;state.history=[];state.future=[];refs.mapsDialog.close();renderAll()};item.querySelector('.map-main').onclick=open;item.querySelector('.open').onclick=open;
      item.querySelector('.rename').onclick=()=>renameMap(map);item.querySelector('.duplicate').onclick=()=>duplicateMap(map);item.querySelector('.remove').onclick=()=>removeMap(map);refs.mapList.appendChild(item);});}
  function renameMap(map){const name=prompt('新しいマップ名を入力してください',map.name);if(!name?.trim())return;map.name=name.trim();map.updatedAt=now();Store.save();renderMapList();renderAll();toast('名前を変更しました');}
  function duplicateMap(map){const copy=clone(map);copy.id=uid('map');copy.name=`${map.name}（コピー）`;copy.createdAt=copy.updatedAt=now();copy.nodes.forEach(n=>{});Store.maps.push(copy);Store.save();renderMapList();toast('マップを複製しました');}
  function removeMap(map){confirmAction('マップを削除しますか？',`「${map.name}」をこの端末から削除します。この操作は元に戻せません。`,()=>{Store.remove(map.id);if(!Store.maps.length){const empty=makeMap('新しいフロー',[]);Store.add(empty)}state.selectedNodeId=null;state.history=[];renderMapList();renderAll();toast('マップを削除しました')});}
  function renderTemplates(){refs.templateList.innerHTML=TEMPLATES.map((t,i)=>`<label class="template-choice"><input type="radio" name="template" value="${t.id}" ${i===0?'checked':''}><span><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.description)}</small></span></label>`).join('');}
  function createMapFromForm(event){event.preventDefault();const id=new FormData(event.currentTarget).get('template')||'blank',template=TEMPLATES.find(t=>t.id===id),name=refs.newMapName.value.trim()||'新しいフロー';const map=makeMap(name,template.create());Store.add(map);state.selectedNodeId=null;state.history=[];state.future=[];refs.newMapDialog.close();refs.mapsDialog.close();state.panX=20;state.panY=30;setZoom(1);renderAll();toast('新しいマップを作成しました');}
  async function exportMap(){const map=Store.current();if(!map)return;const content=JSON.stringify(map,null,2),fileName=`${map.name.replace(/[\\/:*?"<>|]/g,'_')}.json`;if(window.ifmapDesktop?.saveJson){try{const result=await window.ifmapDesktop.saveJson(content,fileName);if(result?.saved)toast('JSONを保存しました');return}catch{toast('JSONを保存できませんでした');return}}const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('JSONを保存しました');}
  async function importMap(file){try{const raw=JSON.parse(await file.text());if(!raw||!Array.isArray(raw.nodes))throw new Error();const map=normalizeMap(raw);map.id=uid('map');map.name=`${map.name}（読込）`;map.createdAt=map.updatedAt=now();Store.add(map);state.selectedNodeId=null;state.history=[];refs.dataDialog.close();renderAll();toast('マップを読み込みました');}catch{toast('読み込めないJSONファイルです');}}

  // ---------- 実行モード ----------
  function startRun(){const map=Store.current();if(!map)return;const start=map.nodes.find(n=>n.type==='start')||map.nodes[0];if(!start){toast('実行する項目がありません');setMode('edit');return;}state.runNodeId=start.id;state.runSteps=0;state.runPath=[start.id];refs.runPanel.hidden=false;renderRun();}
  function renderRun(){const node=getNode(state.runNodeId);if(!node){refs.runCard.innerHTML='<div class="run-end">✓</div><h1>ここで終了です</h1><p>接続先が設定されていないため、実行を終了しました。</p><button class="button primary run-next" id="runRestart">最初からやり直す</button>';$('#runProgress').textContent=`${state.runSteps}項目進みました`;$('#runRestart').onclick=startRun;return;}
    $('#runProgress').textContent=`${state.runSteps+1}項目目`;refs.runCard.style.borderTopColor=getComputedStyle(document.documentElement).getPropertyValue(`--${node.type}`).trim()||'#2563eb';
    let controls='';if(node.options.length){controls=`<div class="run-options">${node.options.map(o=>`<button data-target="${o.targetId||''}">${escapeHtml(o.label)}</button>`).join('')}</div>`;}else{controls=`<button class="button primary run-next" data-target="${node.targetId||''}">${node.targetId?'次へ進む':'ここで終了する'} →</button>`;}
    refs.runCard.innerHTML=`<div class="run-kind">項目</div><h1>${escapeHtml(node.title)}</h1>${node.description?`<p>${escapeHtml(node.description)}</p>`:''}${controls}`;
    refs.runCard.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{state.runSteps++;state.runNodeId=b.dataset.target||null;if(state.runNodeId&&!state.runPath.includes(state.runNodeId))state.runPath.push(state.runNodeId);renderRun()});refs.runCard.querySelector('[data-restart]')?.addEventListener('click',startRun);
  }
  function setMode(mode){if(state.printMode)finishPrintSelection();state.mode=mode;if(mode==='run'){startRun();return;}refs.runPanel.hidden=true;state.selectedNodeId=null;state.mobileInspectorOpen=false;renderAll();}

  // ---------- 印刷 ----------
  function startPrint(){if(state.mode==='list')startListPrint();else startEditPrint();}
  function showPrintBar(title,text,confirmText){refs.printTitle.textContent=title;refs.printText.textContent=text;refs.printConfirm.textContent=confirmText;refs.printBar.hidden=false;}
  function finishPrintSelection(){const returnToRun=state.printOrigin==='run';state.printMode=null;state.printOrigin=null;state.printSelection.clear();refs.printBar.hidden=true;refs.selectionBox.hidden=true;document.body.classList.remove('run-print-select');document.querySelectorAll('.print-picked,.print-choice').forEach(el=>el.classList.remove('print-picked','print-choice'));document.querySelectorAll('.list-print-check').forEach(el=>el.remove());if(returnToRun){state.mode='run';refs.runPanel.hidden=false;renderAll();}}
  function startListPrint(){state.printMode='list';state.printSelection=new Set(Store.maps.map(m=>m.id));showPrintBar('印刷するものにチェック','デフォルトですべて選択されています。不要なフローのチェックを外してください。','チェックしたフローを印刷');renderFlowList();updateListPrintCount();}
  function decorateListPrint(){refs.flowList.querySelectorAll('.flow-list-card').forEach(card=>{card.classList.add('print-choice');const label=document.createElement('label');label.className='list-print-check';label.title='印刷する';label.innerHTML=`<input type="checkbox" ${state.printSelection.has(card.dataset.mapId)?'checked':''} aria-label="このフローを印刷">`;label.querySelector('input').onchange=e=>{e.target.checked?state.printSelection.add(card.dataset.mapId):state.printSelection.delete(card.dataset.mapId);updateListPrintCount()};card.prepend(label)});}
  function updateListPrintCount(){refs.printTitle.textContent='印刷するものにチェック';refs.printText.textContent=`${state.printSelection.size}件を印刷します。チェックを外すと印刷範囲から除外されます。`;refs.printConfirm.disabled=state.printSelection.size===0;}
  function startEditPrint(){state.printMode='edit';state.printSelection=new Set();state.selectedNodeId=null;renderAll();showPrintBar('印刷範囲を選択','余白をドラッグ、またはCtrl＋クリックで複数選択できます。','選択した項目を印刷');updateEditPrintSelection();}
  function startRunDiagramPrint(){state.printOrigin='run';refs.runPanel.hidden=true;state.mode='edit';document.body.classList.add('run-print-select');renderAll();startEditPrint();refs.printTitle.textContent='全体フローから実行ページを選択';refs.printText.textContent='余白をドラッグ、またはCtrl＋クリックで複数選択してください。選んだ項目を実行画面形式で印刷します。';refs.printConfirm.textContent='選択した実行ページを印刷';}
  function updateEditPrintSelection(){refs.nodeLayer.querySelectorAll('.flow-node').forEach(el=>el.classList.toggle('print-picked',state.printSelection.has(el.dataset.id)));const count=state.printSelection.size;refs.printTitle.textContent=count?`${count}項目を印刷しますか？`:'印刷範囲を選択';refs.printText.textContent=count?'青く変色した項目と、その間の矢印を印刷します。':'範囲をドラッグ、またはCtrl＋クリックで複数選択してください。';refs.printConfirm.disabled=count===0;}
  function handlePrintSelectionPointer(event){if(state.printMode!=='edit'||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();const nodeEl=event.target.closest('.flow-node');if(nodeEl){if(!event.ctrlKey&&!event.metaKey)state.printSelection.clear();const id=nodeEl.dataset.id;if((event.ctrlKey||event.metaKey)&&state.printSelection.has(id))state.printSelection.delete(id);else state.printSelection.add(id);updateEditPrintSelection();return;}const wrap=$('#canvasWrap').getBoundingClientRect(),sx=event.clientX,sy=event.clientY;refs.selectionBox.hidden=false;const move=e=>{const l=Math.min(sx,e.clientX),t=Math.min(sy,e.clientY),r=Math.max(sx,e.clientX),b=Math.max(sy,e.clientY);Object.assign(refs.selectionBox.style,{left:`${l-wrap.left}px`,top:`${t-wrap.top}px`,width:`${r-l}px`,height:`${b-t}px`})};const up=e=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);refs.selectionBox.hidden=true;const area={left:Math.min(sx,e.clientX),top:Math.min(sy,e.clientY),right:Math.max(sx,e.clientX),bottom:Math.max(sy,e.clientY)};if(!event.ctrlKey&&!event.metaKey)state.printSelection.clear();refs.nodeLayer.querySelectorAll('.flow-node').forEach(el=>{const r=el.getBoundingClientRect();if(r.left<area.right&&r.right>area.left&&r.top<area.bottom&&r.bottom>area.top)state.printSelection.add(el.dataset.id)});updateEditPrintSelection()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});move(event);}
  function confirmPrintSelection(){if(state.printMode==='list')printSelectedFlows();else if(state.printMode==='edit')printSelectedDiagram();}
  function sendToPrinter(){refs.printSheet.setAttribute('aria-hidden','false');setTimeout(()=>window.print(),80);}
  function cleanupPrintedSheet(){refs.printSheet.replaceChildren();refs.printSheet.setAttribute('aria-hidden','true');}
  function printSelectedFlows(){const rows=Store.maps.filter(m=>state.printSelection.has(m.id)).map(flowSummary).sort(compareFlow);refs.printSheet.innerHTML=`<div class="print-list-document"><h1 class="print-document-title">カスタムフローチャート フロー一覧</h1>${rows.map(r=>`<article class="print-list-row"><h2>${escapeHtml(r.map.name)}</h2><p><b>フローの最初：</b>${escapeHtml(r.first?.title||'項目なし')}</p><p><b>次に対応：</b>${escapeHtml(r.next?.title||'すべて処理済み')}（${r.stateInfo.label}）</p><p>開始 ${r.focus?fullDate(r.focus.startDate):'—'}　／　完了期限 ${r.focus?fullDate(r.focus.dueDate):'—'}</p></article>`).join('')}</div>`;finishPrintSelection();sendToPrinter();}
  function connectedNodeIds(seedIds){const map=Store.current(),adj=new Map(map.nodes.map(n=>[n.id,new Set()]));map.nodes.forEach(n=>{const targets=n.options.length?n.options.map(o=>o.targetId):[n.targetId];targets.forEach(id=>{if(!id||!adj.has(id))return;adj.get(n.id).add(id);adj.get(id).add(n.id)})});const seen=new Set(),queue=[...seedIds].filter(id=>adj.has(id));while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);adj.get(id).forEach(next=>{if(!seen.has(next))queue.push(next)})}return seen;}
  function currentRunFlow(){const map=Store.current(),seed=state.runNodeId||state.runPath.at(-1)||flowOrder(map)[0]?.id,ids=connectedNodeIds(seed?[seed]:[]);return flowOrder(map).filter(n=>ids.has(n.id));}
  function openRunPrint(){const nodes=currentRunFlow();refs.runPrintList.innerHTML=nodes.map(n=>`<label class="print-check-row"><input type="checkbox" value="${n.id}" checked><span><b>${escapeHtml(n.title)}</b><small>${getDisplayState(n).label}</small></span><small>${fullDate(n.dueDate)}</small></label>`).join('');openDialog(refs.runPrintDialog);}
  function printableCard(node){const source=refs.nodeLayer.querySelector(`[data-id="${node.id}"]`);if(source)return source.cloneNode(true);const card=document.createElement('article'),display=getDisplayState(node);card.className='flow-node';card.dataset.phase=display.key;card.innerHTML=`<h3 class="node-title">${escapeHtml(node.title)}</h3>${node.description?`<p class="node-description">${escapeHtml(node.description)}</p>`:''}<div class="node-meta"><span class="status-badge ${display.key}">${display.label}</span>${node.startDate?`<span class="date-badge">開始 ${formatShortDate(node.startDate)}</span>`:''}${node.dueDate?`<span class="date-badge">期限 ${formatShortDate(node.dueDate)}</span>`:''}</div>${node.options.length?`<div class="node-options-preview">${node.options.map(o=>`<span>${escapeHtml(o.label)}</span>`).join('')}</div>`:''}`;return card;}
  function printCurve(start,end){const distance=Math.max(55,Math.abs(end.y-start.y)*.45);return cubicGeometry(start.x,start.y,start.x,start.y+distance,end.x,end.y-distance,end.x,end.y);}
  function renderDiagramPrint(idSource,title,closeEditSelection=false){
    const ids=new Set(idSource),map=Store.current(),nodes=map.nodes.filter(n=>ids.has(n.id));
    if(!nodes.length){toast('印刷する項目を選んでください');return false;}
    const sizes=new Map(nodes.map(n=>{const el=refs.nodeLayer.querySelector(`[data-id="${n.id}"]`),w=el?.offsetWidth||((n.options.length)?280:240),h=el?.offsetHeight||Math.max(110,105+Math.ceil(n.options.length/2)*42);return[n.id,{w,h,el}]}));
    const minX=Math.min(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y)),maxX=Math.max(...nodes.map(n=>n.x+sizes.get(n.id).w)),maxY=Math.max(...nodes.map(n=>n.y+sizes.get(n.id).h)),pad=70,w=maxX-minX+pad*2,h=maxY-minY+pad*2,scale=Math.min(1.3,960/w,580/h);
    refs.printSheet.replaceChildren();const page=document.createElement('div');page.className='print-flow-page';const heading=document.createElement('h1');heading.className='print-flow-title';heading.textContent=title;page.appendChild(heading);
    const stage=document.createElement('div');stage.className='print-flow-stage';stage.style.width=`${w}px`;stage.style.height=`${h}px`;stage.style.transform=`translate(-50%,-46%) scale(${scale})`;
    const lines=svg('svg',{width:w,height:h}),labels=svg('svg',{width:w,height:h,class:'print-label-layer'}),defs=svg('defs'),marker=svg('marker',{id:'print-arrow',markerWidth:9,markerHeight:7,refX:8,refY:3.5,orient:'auto'});
    marker.appendChild(svg('path',{d:'M0,0 L9,3.5 L0,7 Z',fill:'#8b98a9'}));defs.appendChild(marker);lines.appendChild(defs);
    nodes.forEach(from=>{const links=from.options.length?from.options.map(o=>({targetId:o.targetId,label:o.label})):[{targetId:from.targetId,label:''}];links.forEach(link=>{const to=map.nodes.find(n=>n.id===link.targetId);if(!to||!ids.has(to.id))return;const fs=sizes.get(from.id),ts=sizes.get(to.id),start={x:from.x-minX+pad+fs.w/2,y:from.y-minY+pad+fs.h},end={x:to.x-minX+pad+ts.w/2,y:to.y-minY+pad},curve=printCurve(start,end);lines.appendChild(svg('path',{d:curve.d,class:'edge','marker-end':'url(#print-arrow)'}));if(link.label){const x=curve.labelX,y=curve.labelY,width=Math.max(44,Math.min(180,link.label.length*13+20));labels.appendChild(svg('rect',{x:x-width/2,y:y-13,width,height:26,class:'edge-label-bg'}));const text=svg('text',{x,y:y+1,class:'edge-label'});text.textContent=link.label;labels.appendChild(text)}})});
    stage.append(lines,labels);nodes.forEach(n=>{const card=printableCard(n);card.classList.remove('selected','print-picked','highlighted');card.style.left=`${n.x-minX+pad}px`;card.style.top=`${n.y-minY+pad}px`;stage.appendChild(card)});page.appendChild(stage);refs.printSheet.appendChild(page);if(closeEditSelection)finishPrintSelection();sendToPrinter();return true;
  }
  function printSelectedRunPages(){const map=Store.current(),ids=new Set(state.printSelection),nodes=flowOrder(map).filter(n=>ids.has(n.id));if(!nodes.length){toast('印刷する項目を選んでください');return;}refs.printSheet.replaceChildren();nodes.forEach((node,index)=>{const page=document.createElement('section');page.className='print-run-page';const progress=document.createElement('div');progress.className='print-run-progress';progress.textContent=`${index+1} / ${nodes.length}`;const card=document.createElement('article');card.className='run-card print-run-card';const display=getDisplayState(node),controls=node.options.length?`<div class="run-options">${node.options.map(o=>`<button type="button">${escapeHtml(o.label)}</button>`).join('')}</div>`:`<button class="button primary run-next" type="button">${node.targetId?'次へ進む':'ここで終了する'} →</button>`;card.innerHTML=`<div class="run-kind">項目</div><h1>${escapeHtml(node.title)}</h1>${node.description?`<p>${escapeHtml(node.description)}</p>`:''}<div class="print-run-status"><span class="status-badge ${display.key}">${display.label}</span></div>${controls}`;page.append(progress,card);refs.printSheet.appendChild(page)});finishPrintSelection();sendToPrinter();}
  function printSelectedDiagram(){if(state.printOrigin==='run')printSelectedRunPages();else renderDiagramPrint(state.printSelection,Store.current().name,true);}
  function printRunItems(){const seeds=[...refs.runPrintList.querySelectorAll('input:checked')].map(i=>i.value);if(!seeds.length){toast('印刷する系統を選んでください');return;}const connected=connectedNodeIds(seeds);if(renderDiagramPrint(connected,`${Store.current().name}／開始から全分岐の末端まで`))refs.runPrintDialog.close();}

  // ---------- 小さなUI補助 ----------
  let toastTimer;function toast(message){refs.toast.textContent=message;refs.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>refs.toast.classList.remove('show'),2200);}
  let confirmCallback=null;function confirmAction(title,message,callback,okLabel='削除する'){$('#confirmTitle').textContent=title;$('#confirmMessage').textContent=message;$('#confirmOk').textContent=okLabel;confirmCallback=callback;refs.confirmDialog.showModal();}
  function resetApplication(){confirmAction('すべて初期化しますか？','保存済みの全フロー、状態、設定、チュートリアル履歴を削除します。この操作は元に戻せません。必要なフローは先にJSONで保存してください。',()=>{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CURRENT_KEY);localStorage.removeItem(TUTORIAL_KEY);location.reload();},'すべて初期化');}
  function openDialog(dialog){if(!dialog.open)dialog.showModal();}

  // ---------- 初回チュートリアル ----------
  let tutorialIndex=0;
  const prepareTutorialEditor=()=>{state.mode='edit';state.selectedNodeId=Store.current()?.nodes[0]?.id||null;renderAll()};
  const TUTORIAL_STEPS=[
    {target:()=>$('.brand-button'),title:'カスタムフローチャートへようこそ',text:'作業や判断の流れを、カードをつないで整理するアプリです。\nまずは基本操作を順番に見ていきましょう。',prepare:()=>setMode('edit')},
    {target:()=>$('#mapsButton'),title:'1. フローを用意する',text:'ここから保存済みフローを開いたり、新しいフローをひな形から作成したりできます。'},
    {target:()=>$('.create-item-button'),title:'2. 項目を作成する',text:'「項目を作成」を押すと、新しいカードが中央へ追加されます。最初は「未処理」です。',prepare:()=>setMode('edit')},
    {target:()=>$('.flow-node')||$('#canvasWrap'),title:'3. カードを並べる',text:'カードはドラッグして自由に移動できます。カードをクリックすると、右側に編集欄が開きます。',prepare:prepareTutorialEditor},
    {target:()=>$('#nodeForm:not([hidden])')||$('#inspector'),title:'4. 内容と状態を入力する',text:'タイトルや説明を入力し、作業を始めたら「処理中」、終わったら「処理済み」へ変更します。',prepare:prepareTutorialEditor},
    {target:()=>$('.date-field'),title:'5. 開始日と完了期限を設定する',text:'年・月・日を入力します。開始前は青、処理中は緑、期限を過ぎた未完了は赤で表示されます。',prepare:prepareTutorialEditor},
    {target:()=>$('.flow-node .output-port')||$('.flow-node'),title:'6. カードを接続する',text:'カード下の出口から、別カード上の入口までドラッグすると矢印で接続できます。余白へドラッグすると外せます。',prepare:prepareTutorialEditor},
    {target:()=>$('#questionOptions'),title:'7. 必要な場所だけ分岐する',text:'「選択肢を追加」で、はい・いいえなどの分岐を作れます。選択肢ごとに別の出口が表示されます。',prepare:prepareTutorialEditor},
    {target:()=>$('.mode-switch [data-mode="list"]'),title:'8. 全フローを一覧で確認する',text:'上部の「一覧」を押すと、各フローの先頭と次に対応する項目をまとめて確認できます。状態や日付で並べ替えもできます。',prepare:()=>setMode('edit')},
    {target:()=>$('.mode-switch [data-mode="run"]'),title:'9. 実際の流れを実行する',text:'実行モードではカードを1つずつ進みます。分岐の選択肢を選び、実際の判断支援として使えます。'},
    {target:()=>$('#moreButton'),title:'10. バックアップして運用する',text:'変更は自動保存されます。大切なフローはJSONでも保存すると、別のPCやElectron版へ移せます。',prepare:()=>setMode('edit')}
  ];
  function startTutorial(){tutorialIndex=0;refs.tutorialOverlay.hidden=false;showTutorialStep();}
  function showTutorialStep(){const step=TUTORIAL_STEPS[tutorialIndex];step.prepare?.();refs.tutorialStep.textContent=`${tutorialIndex+1} / ${TUTORIAL_STEPS.length}`;refs.tutorialTitle.textContent=step.title;refs.tutorialText.textContent=step.text;refs.tutorialBack.disabled=tutorialIndex===0;refs.tutorialNext.textContent=tutorialIndex===TUTORIAL_STEPS.length-1?'完了':'次へ';requestAnimationFrame(()=>requestAnimationFrame(positionTutorial));}
  function positionTutorial(){if(refs.tutorialOverlay.hidden)return;const step=TUTORIAL_STEPS[tutorialIndex],target=step.target?.();let rect=target?.getBoundingClientRect();if(!rect||rect.width<2||rect.height<2)rect=$('.topbar').getBoundingClientRect();const pad=7,left=Math.max(5,rect.left-pad),top=Math.max(5,rect.top-pad),width=Math.min(innerWidth-left-5,rect.width+pad*2),height=Math.min(innerHeight-top-5,rect.height+pad*2);Object.assign(refs.tutorialSpotlight.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});const cardWidth=Math.min(390,innerWidth-28),below=top+height+14,cardHeight=refs.tutorialCard.offsetHeight||230,cardTop=below+cardHeight<innerHeight-12?below:Math.max(12,top-cardHeight-14),cardLeft=Math.min(innerWidth-cardWidth-14,Math.max(14,left+width/2-cardWidth/2));Object.assign(refs.tutorialCard.style,{left:`${cardLeft}px`,top:`${cardTop}px`});}
  function finishTutorial(){refs.tutorialOverlay.hidden=true;localStorage.setItem(TUTORIAL_KEY,'1');}
  function nextTutorial(){if(tutorialIndex>=TUTORIAL_STEPS.length-1){finishTutorial();return;}tutorialIndex++;showTutorialStep();}
  function previousTutorial(){if(tutorialIndex===0)return;tutorialIndex--;showTutorialStep();}

  // ---------- イベント設定と起動 ----------
  function bindEvents(){
    document.querySelectorAll('[data-add-type]').forEach(b=>b.onclick=()=>addNode(b.dataset.addType));
    document.querySelectorAll('.mode-switch button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
    $('#undoButton').onclick=undo;$('#redoButton').onclick=redo;$('#zoomInButton').onclick=()=>setZoom(state.zoom+.15);$('#zoomOutButton').onclick=()=>setZoom(state.zoom-.15);refs.zoomReset.onclick=resetCanvasView;
    refs.viewport.addEventListener('pointerdown',handleTouchPointerDown,true);refs.viewport.addEventListener('pointermove',handleTouchPointerMove,true);refs.viewport.addEventListener('pointerup',handleTouchPointerEnd,true);refs.viewport.addEventListener('pointercancel',handleTouchPointerEnd,true);
    refs.viewport.addEventListener('pointerdown',beginPan);refs.viewport.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(state.zoom+(e.deltaY<0?.1:-.1));}},{passive:false});
    $('#mapsButton').onclick=()=>{renderMapList();openDialog(refs.mapsDialog)};refs.title.onclick=()=>{if(state.mode==='list'){renderMapList();openDialog(refs.mapsDialog)}else renameMap(Store.current())};$('#moreButton').onclick=()=>openDialog(refs.dataDialog);
    refs.listSort.onchange=e=>{state.listSort=e.target.value;renderFlowList()};
    document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog')?.close());
    $('#newMapButton').onclick=()=>{refs.newMapName.value='新しいフロー';renderTemplates();openDialog(refs.newMapDialog)};$('#newMapForm').onsubmit=createMapFromForm;
    $('#exportButton').onclick=exportMap;$('#importInput').onchange=e=>{const file=e.target.files[0];if(file)importMap(file);e.target.value=''};
    $('#resetAppButton').onclick=resetApplication;
    refs.nodeTitle.onchange=e=>changeNode('title',e.target.value.trim()||'名称未設定');refs.nodeDescription.onchange=e=>changeNode('description',e.target.value);refs.nodeStatus.onchange=e=>changeNode('status',e.target.value);bindDateInputs('start','startDate');bindDateInputs('due','dueDate');refs.nodeTarget.onchange=e=>changeNode('targetId',e.target.value||null);
    $('#addOptionButton').onclick=addOption;$('#deleteNodeButton').onclick=deleteNode;$('#duplicateNodeButton').onclick=duplicateNode;refs.mobileEditButton.onclick=()=>{state.mobileInspectorOpen=true;renderInspector()};$('#closeInspector').onclick=()=>{state.mobileInspectorOpen=false;state.selectedNodeId=null;renderAll()};
    $('#confirmCancel').onclick=()=>refs.confirmDialog.close();$('#confirmOk').onclick=()=>{refs.confirmDialog.close();const cb=confirmCallback;confirmCallback=null;cb?.()};$('#runExitButton').onclick=()=>setMode('edit');
    $('#tutorialButton').onclick=startTutorial;refs.tutorialNext.onclick=nextTutorial;refs.tutorialBack.onclick=previousTutorial;$('#tutorialSkip').onclick=finishTutorial;window.addEventListener('resize',positionTutorial);
    $('#printButton').onclick=startPrint;$('#runPrintButton').onclick=startRunDiagramPrint;$('#runPrintConfirm').onclick=printRunItems;$('#printSelectionCancel').onclick=finishPrintSelection;refs.printConfirm.onclick=confirmPrintSelection;refs.viewport.addEventListener('pointerdown',handlePrintSelectionPointer,true);window.addEventListener('afterprint',cleanupPrintedSheet);
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}if(e.key==='Delete'&&state.selectedNodeId&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))deleteNode();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!refs.tutorialOverlay.hidden)finishTutorial()});
    window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){Store.load();renderAll();toast('別の画面での変更を反映しました')}});
  }
  Store.load();bindEvents();renderTemplates();renderAll();if(!localStorage.getItem(TUTORIAL_KEY))setTimeout(startTutorial,500);
})();

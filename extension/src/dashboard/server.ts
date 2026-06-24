import * as http from "http";
import type { FindingsStore } from "../store";
import { buildDependencyGraph, collectSourceFiles } from "../graph/builder";
import { buildFunctionGraph } from "../graph/functions";

export class DashboardServer {
  private server: http.Server | null = null;
  private readonly store: FindingsStore;
  private readonly port: number;
  private workspaceRoot: string = "";

  constructor(store: FindingsStore, port: number) {
    this.store = store;
    this.port = port;
  }

  start(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    if (this.server) return;
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.listen(this.port, "127.0.0.1", () => {
      console.log(`[watsonsec] Dashboard at http://127.0.0.1:${this.port}`);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? "/";

    if (url === "/api/findings") {
      json(res, this.store.getAll());
      return;
    }
    if (url === "/api/scans") {
      json(res, this.store.getRecentScans());
      return;
    }
    if (url === "/api/graph") {
      const graph = buildDependencyGraph(this.workspaceRoot, this.store.getAll());
      json(res, graph);
      return;
    }
    if (url === "/api/graph/functions") {
      const files = collectSourceFiles(this.workspaceRoot);
      const fgraph = buildFunctionGraph(files, this.workspaceRoot, this.store.getAll());
      json(res, fgraph);
      return;
    }

    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(dashboardHtml());
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }
}

function json(res: http.ServerResponse, data: unknown): void {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WatsonSec</title>
<style>
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a; --text: #e2e8f0;
    --muted: #718096; --critical: #fc5c65; --high: #fd9644; --medium: #fed330;
    --low: #26de81; --info: #45aaf2; --radius: 6px;
    --font: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    --mono: 'Cascadia Code','Fira Code','JetBrains Mono',monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px}
  header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:12px}
  header h1{font-size:18px;font-weight:700}
  .badge{background:#4a4e69;color:#fff;font-size:11px;padding:2px 8px;border-radius:20px}
  .last-scan{font-size:12px;color:var(--muted);margin-left:auto}
  nav{display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface)}
  nav button{background:none;border:none;color:var(--muted);padding:10px 20px;cursor:pointer;font-size:13px;border-bottom:2px solid transparent;transition:all .15s}
  nav button.active{color:var(--text);border-bottom-color:var(--info)}
  nav button:hover{color:var(--text)}
  .toolbar{padding:12px 24px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border)}
  .toolbar label{color:var(--muted);font-size:12px}
  select,input{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:var(--radius);font-size:13px;outline:none}
  select:focus,input:focus{border-color:var(--info)}
  .btn{background:var(--info);color:#000;border:none;padding:7px 14px;border-radius:var(--radius);cursor:pointer;font-weight:600;font-size:13px;margin-left:auto}
  .btn:hover{opacity:.85}
  .stats{display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 18px;min-width:110px;text-align:center}
  .card .num{font-size:28px;font-weight:700;line-height:1}
  .card .lbl{font-size:11px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .card.critical .num{color:var(--critical)} .card.high .num{color:var(--high)}
  .card.medium .num{color:var(--medium)} .card.low .num{color:var(--low)}
  .findings-table{padding:0 24px 40px}
  table{width:100%;border-collapse:collapse}
  thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--border)}
  tbody tr{border-bottom:1px solid var(--border);transition:background .1s}
  tbody tr:hover{background:var(--surface)}
  td{padding:10px 12px;vertical-align:top}
  .sev{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.3px}
  .sev.critical{background:#3d1a1a;color:var(--critical)} .sev.high{background:#3a2210;color:var(--high)}
  .sev.medium{background:#38330a;color:var(--medium)} .sev.low{background:#0d3322;color:var(--low)}
  .sev.info{background:#0d2033;color:var(--info)}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
  .dot.new{background:var(--info)} .dot.confirmed{background:var(--high)}
  .dot.resolved{background:var(--low)} .dot.reopened{background:var(--critical)}
  .fp{font-family:var(--mono);font-size:12px;color:var(--info)}
  .msg{max-width:380px;word-break:break-word}
  .chip{display:inline-block;font-size:10px;background:#1e2233;border:1px solid var(--border);padding:1px 6px;border-radius:3px;margin-right:3px;color:var(--muted)}
  .empty{text-align:center;padding:60px;color:var(--muted)}
  #page-graph{padding:16px 24px}
  #page-graph canvas,#page-graph svg{width:100%;background:var(--surface);border-radius:var(--radius);border:1px solid var(--border)}
  .graph-legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px}
  .graph-legend span{display:flex;align-items:center;gap:5px}
  .graph-legend .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
  .page{display:none} .page.active{display:block}
</style>
</head>
<body>
<header>
  <h1>🔐 WatsonSec</h1>
  <span class="badge" id="total-badge">—</span>
  <span class="last-scan" id="last-scan-text"></span>
</header>
<nav>
  <button class="active" onclick="showPage('findings',this)">Findings</button>
  <button onclick="showPage('graph',this)">File Graph</button>
  <button onclick="showPage('fngraph',this)">Function Graph</button>
  <button onclick="showPage('scans',this)">Scan History</button>
</nav>

<!-- ═══════════════ FINDINGS PAGE ═══════════════ -->
<div id="page-findings" class="page active">
  <div class="toolbar">
    <label>Severity</label>
    <select id="filter-sev"><option value="">All</option><option>critical</option><option>high</option><option>medium</option><option>low</option></select>
    <label>Status</label>
    <select id="filter-status"><option value="">All</option><option>new</option><option>confirmed</option><option>resolved</option><option>reopened</option></select>
    <label>Tool</label><select id="filter-tool"><option value="">All</option></select>
    <input type="search" id="filter-search" placeholder="Search message / file…" style="width:210px">
    <button class="btn" onclick="load()">⟳ Refresh</button>
  </div>
  <div class="stats">
    <div class="card critical"><div class="num" id="n-critical">0</div><div class="lbl">Critical</div></div>
    <div class="card high"><div class="num" id="n-high">0</div><div class="lbl">High</div></div>
    <div class="card medium"><div class="num" id="n-medium">0</div><div class="lbl">Medium</div></div>
    <div class="card low"><div class="num" id="n-low">0</div><div class="lbl">Low</div></div>
  </div>
  <div class="findings-table">
    <table>
      <thead><tr><th>Severity</th><th>Status</th><th>File</th><th>Message</th><th>Rule</th><th>Tool(s)</th><th>First seen</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="empty" class="empty" style="display:none"><h2>No findings yet</h2><p>Save a file to trigger a scan, or use WatsonSec: Run Full Scan.</p></div>
  </div>
</div>

<!-- ═══════════════ GRAPH PAGE ═══════════════ -->
<div id="page-graph" class="page">
  <div class="graph-legend">
    <span><span class="dot" style="background:var(--critical)"></span>Critical findings</span>
    <span><span class="dot" style="background:var(--high)"></span>High findings</span>
    <span><span class="dot" style="background:var(--medium)"></span>Medium findings</span>
    <span><span class="dot" style="background:#4a4e69"></span>No findings</span>
    <span style="margin-left:auto;color:var(--muted)">Nodes = source files · Edges = imports · Drag to reposition</span>
  </div>
  <svg id="graph-svg" style="height:600px"></svg>
</div>

<!-- ═══════════════ FUNCTION GRAPH PAGE ══════ -->
<div id="page-fngraph" class="page">
  <div id="page-fngraph" style="padding:16px 24px">
    <div class="graph-legend">
      <span><span class="dot" style="background:var(--critical)"></span>Critical</span>
      <span><span class="dot" style="background:var(--high)"></span>High</span>
      <span><span class="dot" style="background:var(--medium)"></span>Medium</span>
      <span><span class="dot" style="background:#4a4e69"></span>No findings</span>
      <span style="margin-left:auto;color:var(--muted)">Nodes = functions · Edges = calls within same file · Drag to reposition</span>
    </div>
    <svg id="fn-graph-svg" style="height:600px;width:100%;background:var(--surface);border-radius:var(--radius);border:1px solid var(--border)"></svg>
  </div>
</div>

<!-- ═══════════════ SCANS PAGE ═══════════════ -->
<div id="page-scans" class="page">
  <div style="padding:16px 24px 40px">
    <table>
      <thead><tr><th>Scan ID</th><th>Started</th><th>Duration</th><th>Tools Run</th><th>Findings</th><th>Errors</th></tr></thead>
      <tbody id="scans-tbody"></tbody>
    </table>
  </div>
</div>

<script>
// ─── D3-lite force graph (no CDN dependency — pure vanilla) ───────────────
// Minimal spring simulation for the dependency graph view.

let allFindings=[], allScans=[], graphData={nodes:[],edges:[]};
let simNodes=[], simEdges=[], animFrame=null;

const SEV_COLOR={'critical':'#fc5c65','high':'#fd9644','medium':'#fed330','low':'#26de81','none':'#4a4e69'};
const SEV_RANK={critical:4,high:3,medium:2,low:1,info:0};

async function load(){
  try{
    const [fr,sr]=await Promise.all([fetch('/api/findings'),fetch('/api/scans')]);
    allFindings=await fr.json(); allScans=await sr.json();
    updateToolFilter(); updateBadge(); renderFindings(); renderScans();
    if(document.getElementById('page-graph').classList.contains('active')) loadGraph();
  }catch(e){console.error(e)}
}

async function loadGraph(){
  try{
    const r=await fetch('/api/graph'); graphData=await r.json();
    renderGraph();
  }catch(e){console.error(e)}
}

let fnGraphData={functions:[],calls:[]};
async function loadFunctionGraph(){
  try{
    const r=await fetch('/api/graph/functions'); fnGraphData=await r.json();
    renderFunctionGraph();
  }catch(e){console.error(e)}
}

function showPage(name,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  btn.classList.add('active');
  if(name==='graph') loadGraph();
  if(name==='fngraph') loadFunctionGraph();
}

function updateToolFilter(){
  const sel=document.getElementById('filter-tool');
  const have=new Set(Array.from(sel.options).map(o=>o.value).filter(Boolean));
  new Set(allFindings.flatMap(f=>f.tool)).forEach(t=>{
    if(!have.has(t)){const o=document.createElement('option');o.value=t;o.textContent=t;sel.appendChild(o)}
  });
}

function updateBadge(){
  const active=allFindings.filter(f=>f.status!=='resolved');
  document.getElementById('total-badge').textContent=active.length+' active';
  const last=allScans[0];
  document.getElementById('last-scan-text').textContent=last?'Last scan: '+new Date(last.startedAt).toLocaleTimeString():'';
}

function renderFindings(){
  const sev=document.getElementById('filter-sev').value;
  const st=document.getElementById('filter-status').value;
  const tool=document.getElementById('filter-tool').value;
  const q=document.getElementById('filter-search').value.toLowerCase();
  const f=allFindings.filter(x=>{
    if(sev&&x.severity!==sev) return false;
    if(st&&x.status!==st) return false;
    if(tool&&!x.tool.includes(tool)) return false;
    if(q&&!x.message.toLowerCase().includes(q)&&!x.filePath.toLowerCase().includes(q)) return false;
    return true;
  });
  const c={critical:0,high:0,medium:0,low:0};
  allFindings.filter(x=>x.status!=='resolved').forEach(x=>{if(c[x.severity]!==undefined)c[x.severity]++});
  ['critical','high','medium','low'].forEach(s=>document.getElementById('n-'+s).textContent=c[s]);
  const tbody=document.getElementById('tbody'),empty=document.getElementById('empty');
  if(!f.length){tbody.innerHTML='';empty.style.display='block';return}
  empty.style.display='none';
  f.sort((a,b)=>(SEV_RANK[b.severity]||0)-(SEV_RANK[a.severity]||0));
  tbody.innerHTML=f.map(x=>{
    const ln=x.startLine===x.endLine?x.startLine:x.startLine+'-'+x.endLine;
    return '<tr>'+
      '<td><span class="sev '+x.severity+'">'+x.severity+'</span></td>'+
      '<td><span class="dot '+x.status+'"></span>'+x.status+'</td>'+
      '<td class="fp">'+esc(x.filePath)+':'+ln+'</td>'+
      '<td class="msg">'+esc(x.message)+'</td>'+
      '<td class="fp">'+esc(x.ruleId[0]||'')+'</td>'+
      '<td>'+x.tool.map(t=>'<span class="chip">'+esc(t)+'</span>').join('')+'</td>'+
      '<td>'+new Date(x.firstSeen).toLocaleDateString()+'</td></tr>';
  }).join('');
}

function renderScans(){
  document.getElementById('scans-tbody').innerHTML=(allScans||[]).map(s=>{
    const dur=((s.finishedAt-s.startedAt)/1000).toFixed(1)+'s';
    const errs=Object.keys(s.errorsByTool||{}).length;
    return '<tr>'+
      '<td class="fp">'+esc(s.scanId.slice(0,8))+'…</td>'+
      '<td>'+new Date(s.startedAt).toLocaleString()+'</td>'+
      '<td>'+dur+'</td>'+
      '<td>'+esc((s.toolsRun||[]).join(', '))+'</td>'+
      '<td>'+s.findingCount+'</td>'+
      '<td style="color:'+(errs?'var(--high)':'var(--low)')+'">'+errs+' error(s)</td></tr>';
  }).join('');
}

// ─── Force-directed graph ──────────────────────────────────────────────────

function renderGraph(){
  const svg=document.getElementById('graph-svg');
  const W=svg.clientWidth||900, H=svg.clientHeight||600;
  svg.innerHTML='';
  const ns='http://www.w3.org/2000/svg';

  if(!graphData.nodes.length){
    const t=document.createElementNS(ns,'text');
    t.setAttribute('x',W/2);t.setAttribute('y',H/2);t.setAttribute('text-anchor','middle');
    t.setAttribute('fill','#718096');t.textContent='No source files found';
    svg.appendChild(t);return;
  }

  // Init nodes with random positions.
  simNodes=graphData.nodes.map((n,i)=>({...n,x:W/2+(Math.random()-.5)*300,y:H/2+(Math.random()-.5)*300,vx:0,vy:0}));
  const nodeById=Object.fromEntries(simNodes.map(n=>[n.id,n]));
  simEdges=graphData.edges.map(e=>({source:nodeById[e.source],target:nodeById[e.target]})).filter(e=>e.source&&e.target);

  // SVG elements
  const defs=document.createElementNS(ns,'defs');
  const marker=document.createElementNS(ns,'marker');
  marker.setAttribute('id','arrow');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');
  marker.setAttribute('refX','14');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d','M0,0 L0,6 L6,3 z');path.setAttribute('fill','#4a4e69');
  marker.appendChild(path);defs.appendChild(marker);svg.appendChild(defs);

  const edgeGroup=document.createElementNS(ns,'g');
  const nodeGroup=document.createElementNS(ns,'g');
  svg.appendChild(edgeGroup);svg.appendChild(nodeGroup);

  const lineEls=simEdges.map(()=>{
    const l=document.createElementNS(ns,'line');
    l.setAttribute('stroke','#2a2d3a');l.setAttribute('stroke-width','1');
    l.setAttribute('marker-end','url(#arrow)');
    edgeGroup.appendChild(l);return l;
  });

  const nodeEls=simNodes.map(n=>{
    const g=document.createElementNS(ns,'g');g.style.cursor='pointer';
    const r=n.findings.length?9:6;
    const c=document.createElementNS(ns,'circle');
    c.setAttribute('r',r);c.setAttribute('fill',SEV_COLOR[n.maxSeverity]||'#4a4e69');
    c.setAttribute('stroke','#1a1d27');c.setAttribute('stroke-width','1.5');
    const t=document.createElementNS(ns,'text');
    t.setAttribute('dy','20');t.setAttribute('text-anchor','middle');t.setAttribute('fill','#718096');
    t.setAttribute('font-size','10');t.textContent=n.label;
    const title=document.createElementNS(ns,'title');
    title.textContent=n.id+(n.findings.length?' ('+n.findings.length+' finding'+( n.findings.length===1?'':'s')+')'  :'');
    g.appendChild(c);g.appendChild(t);g.appendChild(title);
    // drag
    let dragging=false,ox=0,oy=0;
    g.addEventListener('mousedown',e=>{dragging=true;ox=e.clientX-n.x;oy=e.clientY-n.y;n.pinned=true});
    svg.addEventListener('mousemove',e=>{if(!dragging)return;n.x=e.clientX-ox;n.y=e.clientY-oy});
    svg.addEventListener('mouseup',()=>{dragging=false});
    nodeGroup.appendChild(g);return{g,c};
  });

  // Spring simulation
  if(animFrame) cancelAnimationFrame(animFrame);
  let tick=0;
  function step(){
    tick++;
    // Repulsion between all node pairs
    for(let i=0;i<simNodes.length;i++){
      for(let j=i+1;j<simNodes.length;j++){
        const a=simNodes[i],b=simNodes[j];
        const dx=b.x-a.x,dy=b.y-a.y;
        const d=Math.max(1,Math.sqrt(dx*dx+dy*dy));
        const f=800/(d*d);
        a.vx-=f*dx/d;a.vy-=f*dy/d;
        b.vx+=f*dx/d;b.vy+=f*dy/d;
      }
    }
    // Spring attraction along edges
    for(const e of simEdges){
      const dx=e.target.x-e.source.x,dy=e.target.y-e.source.y;
      const d=Math.max(1,Math.sqrt(dx*dx+dy*dy));
      const f=(d-100)*0.05;
      e.source.vx+=f*dx/d;e.source.vy+=f*dy/d;
      e.target.vx-=f*dx/d;e.target.vy-=f*dy/d;
    }
    // Center gravity
    for(const n of simNodes){
      n.vx+=(W/2-n.x)*0.005;n.vy+=(H/2-n.y)*0.005;
    }
    // Integrate & damp
    for(const n of simNodes){
      if(n.pinned) continue;
      n.x+=n.vx*0.8;n.y+=n.vy*0.8;
      n.vx*=0.7;n.vy*=0.7;
      n.x=Math.max(20,Math.min(W-20,n.x));
      n.y=Math.max(20,Math.min(H-20,n.y));
    }
    // Update SVG positions
    simNodes.forEach((n,i)=>{
      nodeEls[i].g.setAttribute('transform','translate('+n.x+','+n.y+')');
    });
    simEdges.forEach((e,i)=>{
      lineEls[i].setAttribute('x1',e.source.x);lineEls[i].setAttribute('y1',e.source.y);
      lineEls[i].setAttribute('x2',e.target.x);lineEls[i].setAttribute('y2',e.target.y);
    });
    if(tick<200) animFrame=requestAnimationFrame(step);
  }
  animFrame=requestAnimationFrame(step);
}

// ─── Function graph renderer (reuses same force simulation logic) ──────────

function renderFunctionGraph(){
  const svg=document.getElementById('fn-graph-svg');
  const W=svg.clientWidth||900,H=svg.clientHeight||600;
  svg.innerHTML='';
  const ns='http://www.w3.org/2000/svg';
  const fns=fnGraphData.functions||[], calls=fnGraphData.calls||[];

  if(!fns.length){
    const t=document.createElementNS(ns,'text');
    t.setAttribute('x',W/2);t.setAttribute('y',H/2);t.setAttribute('text-anchor','middle');
    t.setAttribute('fill','#718096');t.textContent='No functions extracted — save a Python/JS/TS/Go file first';
    svg.appendChild(t);return;
  }

  const simFn=fns.map(n=>({...n,x:W/2+(Math.random()-.5)*400,y:H/2+(Math.random()-.5)*400,vx:0,vy:0}));
  const fnById=Object.fromEntries(simFn.map(n=>[n.id,n]));
  const simCalls=calls.map(e=>({source:fnById[e.caller],target:fnById[e.callee]})).filter(e=>e.source&&e.target);

  const defs=document.createElementNS(ns,'defs');
  const marker=document.createElementNS(ns,'marker');
  marker.setAttribute('id','fn-arrow');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');
  marker.setAttribute('refX','16');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');
  const mp=document.createElementNS(ns,'path');
  mp.setAttribute('d','M0,0 L0,6 L6,3 z');mp.setAttribute('fill','#45aaf2');
  marker.appendChild(mp);defs.appendChild(marker);svg.appendChild(defs);

  const eg=document.createElementNS(ns,'g'),ng=document.createElementNS(ns,'g');
  svg.appendChild(eg);svg.appendChild(ng);

  const lineEls=simCalls.map(()=>{
    const l=document.createElementNS(ns,'line');
    l.setAttribute('stroke','#45aaf2');l.setAttribute('stroke-width','1');l.setAttribute('opacity','0.5');
    l.setAttribute('marker-end','url(#fn-arrow)');
    eg.appendChild(l);return l;
  });

  const nodeEls=simFn.map(n=>{
    const g=document.createElementNS(ns,'g');g.style.cursor='pointer';
    const hasFinding=n.findings&&n.findings.length>0;
    const r=hasFinding?10:6;
    const c=document.createElementNS(ns,'circle');
    c.setAttribute('r',r);c.setAttribute('fill',SEV_COLOR[n.maxSeverity]||'#4a4e69');
    c.setAttribute('stroke',hasFinding?'#fff':'#1a1d27');c.setAttribute('stroke-width','1.5');
    const t=document.createElementNS(ns,'text');
    t.setAttribute('dy','18');t.setAttribute('text-anchor','middle');t.setAttribute('fill','#a0aec0');
    t.setAttribute('font-size','9');t.textContent=n.functionName;
    const title=document.createElementNS(ns,'title');
    title.textContent=n.id+' L'+n.startLine+'-'+n.endLine+(hasFinding?' ('+n.findings.length+' finding'+(n.findings.length===1?'':'s')+')':'');
    g.appendChild(c);g.appendChild(t);g.appendChild(title);
    let dragging=false,ox=0,oy=0;
    g.addEventListener('mousedown',e=>{dragging=true;ox=e.clientX-n.x;oy=e.clientY-n.y;n.pinned=true});
    svg.addEventListener('mousemove',e=>{if(!dragging)return;n.x=e.clientX-ox;n.y=e.clientY-oy});
    svg.addEventListener('mouseup',()=>{dragging=false});
    ng.appendChild(g);return{g};
  });

  let tick2=0;
  function step2(){
    tick2++;
    for(let i=0;i<simFn.length;i++){for(let j=i+1;j<simFn.length;j++){
      const a=simFn[i],b=simFn[j];const dx=b.x-a.x,dy=b.y-a.y;
      const d=Math.max(1,Math.sqrt(dx*dx+dy*dy));const f=600/(d*d);
      a.vx-=f*dx/d;a.vy-=f*dy/d;b.vx+=f*dx/d;b.vy+=f*dy/d;
    }}
    for(const e of simCalls){const dx=e.target.x-e.source.x,dy=e.target.y-e.source.y;
      const d=Math.max(1,Math.sqrt(dx*dx+dy*dy));const f=(d-80)*0.06;
      e.source.vx+=f*dx/d;e.source.vy+=f*dy/d;e.target.vx-=f*dx/d;e.target.vy-=f*dy/d;
    }
    for(const n of simFn){n.vx+=(W/2-n.x)*0.004;n.vy+=(H/2-n.y)*0.004;}
    for(const n of simFn){if(n.pinned)continue;n.x+=n.vx*0.8;n.y+=n.vy*0.8;n.vx*=0.7;n.vy*=0.7;
      n.x=Math.max(20,Math.min(W-20,n.x));n.y=Math.max(20,Math.min(H-20,n.y));}
    simFn.forEach((n,i)=>nodeEls[i].g.setAttribute('transform','translate('+n.x+','+n.y+')'));
    simCalls.forEach((e,i)=>{lineEls[i].setAttribute('x1',e.source.x);lineEls[i].setAttribute('y1',e.source.y);
      lineEls[i].setAttribute('x2',e.target.x);lineEls[i].setAttribute('y2',e.target.y);});
    if(tick2<200) requestAnimationFrame(step2);
  }
  requestAnimationFrame(step2);
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

['filter-sev','filter-status','filter-tool','filter-search'].forEach(id=>{
  document.getElementById(id).addEventListener('input',renderFindings);
});

load();
setInterval(load,30000);
</script>
</body>
</html>`;
}

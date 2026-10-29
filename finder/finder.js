/* Local DOM filtering only. No network calls or account actions. */
(() => {
  'use strict';
  if (!/^(www\.)?wiki-masters\.com$/.test(location.hostname) || globalThis.__wmFinder12) return;
  globalThis.__wmFinder12=true;
  const C=globalThis.WMFinderCore,P=globalThis.WMFinderPanel;
  const KEY='wmFinder12Prefs',WATCH_KEY='wmshV5Watchlist',LIMIT=2000,DELAY=5000,WAIT=20000;
  let prefs={...C.DEFAULTS},enabled=false,ui=null,main=null,grid=null,tabbar=null,browse=false;
  let pendingNavigation=null,scan=null,disposed=false;
  let batchTimer=null,syncTimer=null,timeTimer=null,message='Prêt. Active les filtres pour analyser les annonces.';
  const cards=new Map(),dirty=new Set(),added=new Set(),timeDirty=new Set();
  let removed=false,favorites=new Set();
  const metrics={fullScans:0,parsed:0,timeReads:0,flushes:0,loadClicks:0,maxFlushMs:0};
  const rootPath=()=>/^\/marketplace\/?$/.test(location.pathname);
  const timeActive=()=>prefs.minMinutes!==null || prefs.maxMinutes!==null;
  const visible=el=>!!el?.isConnected && !el.closest('[hidden],[aria-hidden="true"]') && !!el.getClientRects().length;
  const own=el=>!!el?.closest?.('wm-shiny-finder');
  function setAttr(el,name,value) {
    if(value===null){if(el.hasAttribute(name))el.removeAttribute(name);}
    else if(el.getAttribute(name)!==value)el.setAttribute(name,value);
  }
  function clearMark(card){card.root.removeAttribute('data-wmsf-hidden');card.root.removeAttribute('data-wmsf-state');}
  async function save() {
    try{await chrome.storage.local.set({[KEY]:prefs,[WATCH_KEY]:[...favorites].slice(0,1000)});}
    catch{message='Sauvegarde indisponible. Réglages conservés dans cet onglet seulement.';render();}
  }
  function stopScan(reason) {
    if(!scan)return;
    const old=scan;scan=null;old.abort.abort();
    if(reason)message=reason;
    render();
  }
  function stopWork() {
    gridObserver.disconnect();clearTimeout(batchTimer);batchTimer=null;clearInterval(timeTimer);timeTimer=null;
    dirty.clear();added.clear();timeDirty.clear();removed=false;
    for(const card of cards.values())clearMark(card);
    cards.clear();
  }
  function suspend(reason) {
    stopScan(reason);stopWork();browse=false;
    if(ui){ui.host.remove();ui=null;}
  }
  function activeView() {
    if(!rootPath() || document.hidden)return null;
    const scope=document.querySelector('main,[role="main"]');
    if(!scope)return null;
    if([...scope.querySelectorAll('[role="dialog"],[aria-modal="true"]')].some(visible))return null;
    const tabs=[...scope.querySelectorAll('button,[role="tab"]')].filter(el=>!own(el) && visible(el) && C.tabName(el.textContent));
    const active=tabs.filter(el=>el.getAttribute('aria-selected')==='true' || el.getAttribute('aria-current')==='page' ||
      el.getAttribute('data-state')==='active' || el.classList.contains('border-b-2') || el.classList.contains('border-b-4'));
    if(active.length!==1)return null;
    const kind=C.tabName(active[0].textContent);
    if(pendingNavigation?.kind && pendingNavigation.kind!==kind)return null;
    if(pendingNavigation?.path && pendingNavigation.path!==location.pathname)return null;
    pendingNavigation=null;
    if(kind!=='browse')return null;
    let listingGrid=null;
    for(const a of scope.querySelectorAll(C.LINK)) {
      if(a.closest('[role="dialog"],[aria-modal="true"]') || !C.identity(a,location.origin) || !a.querySelector(C.FRAME))continue;
      for(let el=a.parentElement,depth=0;el && el!==scope && depth<4;el=el.parentElement,depth++) {
        if(el.classList.contains('flex-wrap') || el.classList.contains('grid')){listingGrid=el;break;}
      }
      if(listingGrid)break;
    }
    return {scope,bar:active[0].parentElement,grid:listingGrid};
  }
  function observeMain() {
    const next=document.querySelector('main,[role="main"]');
    if(main===next)return;
    pageObserver.disconnect();main=next;
    if(main)pageObserver.observe(main,{childList:true,subtree:true});
  }
  function sync() {
    syncTimer=null;if(disposed)return;
    observeMain();const view=activeView();
    if(!view){suspend('Exploration arrêtée : sortie de Parcourir ou onglet masqué.');return;}
    browse=true;
    if(tabbar!==view.bar) {
      tabsObserver.disconnect();tabbar=view.bar;
      tabsObserver.observe(tabbar,{attributes:true,subtree:true,attributeFilter:['class','aria-selected','aria-current','data-state']});
    }
    if(!ui?.host.isConnected) {
      if(ui)ui.host.remove();
      ui=P.create({change:onSettings,toggle:toggleEnabled,reset,start:startScan,stop:()=>stopScan('Exploration arrêtée.'),
        export:exportResults,diagnostic:exportDiagnostic,favorite:toggleFavorite});
      tabbar.insertAdjacentElement('afterend',ui.host);
    }
    if(grid!==view.grid) {
      stopScan('Exploration arrêtée : la liste du marché a changé.');
      stopWork();grid=view.grid;if(enabled && grid)activateGrid();
    } else if(enabled && grid && !cards.size)activateGrid();
    updateTimeTimer();render();
  }
  function scheduleSync(){if(!disposed && syncTimer===null)syncTimer=setTimeout(sync,60);}
  function rootOf(anchor) {
    let el=anchor;while(el.parentElement && el.parentElement!==grid)el=el.parentElement;
    return el.parentElement===grid ? el : anchor;
  }
  function apply(card) {
    card.result=C.evaluate(card,prefs);
    setAttr(card.root,'data-wmsf-hidden',card.result.match || card.result.pending ? null : 'true');
    setAttr(card.root,'data-wmsf-state',card.result.state==='deal' || card.result.pending ? card.result.state : null);
  }
  function readCard(anchor) {
    if(!grid?.contains(anchor))return;
    const previous=cards.get(anchor),card=C.read(anchor,location.origin);metrics.parsed++;
    if(!card){if(previous)clearMark(previous);cards.delete(anchor);return;}
    card.root=rootOf(anchor);if(previous && previous.root!==card.root)clearMark(previous);
    cards.set(anchor,card);apply(card);
  }
  function activateGrid() {
    if(!enabled || !browse || !grid || document.hidden)return;
    const anchors=grid.querySelectorAll(C.LINK);
    if(anchors.length>LIMIT){enabled=false;message=`Limite de ${LIMIT} annonces atteinte. Filtres suspendus.`;return;}
    metrics.fullScans++;for(const a of anchors)readCard(a);
    gridObserver.observe(grid,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','href','data-shiny','data-is-shiny']});
    updateTimeTimer();render();
  }
  function scheduleFlush(){if(batchTimer===null)batchTimer=setTimeout(flush,120);}
  function flush() {
    clearTimeout(batchTimer);batchTimer=null;
    if(!enabled || !browse || document.hidden || !rootPath() || !grid?.isConnected)return;
    const begin=performance.now();metrics.flushes++;
    if(removed){for(const [a,c] of cards)if(!grid.contains(a)){clearMark(c);cards.delete(a);}removed=false;}
    for(const node of added) {
      if(!grid.contains(node))continue;
      if(node.matches?.(C.LINK))dirty.add(node);
      for(const a of node.querySelectorAll?.(C.LINK)||[])dirty.add(a);
    }
    added.clear();
    if(cards.size+[...dirty].filter(a=>!cards.has(a)).length>LIMIT) {
      stopScan('Limite de mémoire atteinte.');enabled=false;stopWork();message=`Plus de ${LIMIT} annonces : filtres suspendus.`;render();return;
    }
    for(const a of dirty)readCard(a);
    for(const a of timeDirty) {
      if(dirty.has(a))continue;
      const c=cards.get(a);if(!c || !grid.contains(a))continue;
      c.seconds=c.fields.time && !c.fields.time.ambiguous ? C.seconds(c.fields.time.value.textContent) : null;
      metrics.timeReads++;apply(c);
    }
    dirty.clear();timeDirty.clear();
    if(scan?.check)scan.check();
    render();metrics.maxFlushMs=Math.max(metrics.maxFlushMs,performance.now()-begin);
  }
  const gridObserver=new MutationObserver(records=>{
    if(!enabled || !browse || document.hidden)return;
    for(const change of records) {
      const el=change.target.nodeType===1 ? change.target : change.target.parentElement;
      const anchor=el?.closest(C.LINK),card=cards.get(anchor);
      if(anchor && grid.contains(anchor)) {
        if(card?.fields.time?.value?.contains(el)) {
          if(timeActive() || prefs.dealsOnly)timeDirty.add(anchor);
        } else dirty.add(anchor);
      } else if(change.type==='childList') {
        for(const node of change.addedNodes)if(node.nodeType===1)added.add(node);
        if(change.removedNodes.length)removed=true;
      }
    }
    if(dirty.size || added.size || timeDirty.size || removed)scheduleFlush();
  });
  const pageObserver=new MutationObserver(records=>{
    if(document.hidden || disposed)return;
    for(const r of records) {
      if(own(r.target) || (grid?.isConnected && (r.target===grid || grid.contains(r.target))))continue;
      if([...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 && !own(n))){scheduleSync();break;}
    }
  });
  const shellObserver=new MutationObserver(scheduleSync),tabsObserver=new MutationObserver(scheduleSync);
  function updateTimeTimer() {
    const needed=enabled && browse && grid && timeActive() && !document.hidden;
    if(!needed && timeTimer!==null){clearInterval(timeTimer);timeTimer=null;}
    if(needed && timeTimer===null)timeTimer=setInterval(()=>{
      // Re-read cached fields only; never guess time from the wall clock.
      for(const [a,c] of cards)if(c.fields.time?.value?.isConnected)timeDirty.add(a);
      if(timeDirty.size)scheduleFlush();
    },1000);
  }
  function onSettings(patch) {
    const onlyFold=Object.keys(patch).every(k=>k==='collapsed');prefs=C.settings({...prefs,...patch});save();
    if(!onlyFold && enabled && browse){for(const a of cards.keys())dirty.add(a);flush();updateTimeTimer();}
    render();
  }
  function toggleEnabled() {
    enabled=!enabled;
    if(enabled){message='Filtres actifs sur les annonces chargées.';sync();}
    else{stopScan('Exploration arrêtée.');stopWork();message='Filtres désactivés. Toutes les annonces sont restaurées.';render();}
  }
  function reset() {
    stopScan();enabled=false;stopWork();prefs={...C.DEFAULTS,collapsed:prefs.collapsed};save();
    message='Réglages réinitialisés. Filtres désactivés.';render();
  }
  function stats() {
    const s={total:cards.size,matched:0,pending:0,priced:0,timed:0,quotes:0,deals:0,unreliable:0,shiny:0};
    const unique=new Set();
    for(const c of cards.values()) {
      if(!unique.has(c.id)){if(c.result.match)s.matched++;if(c.result.pending)s.pending++;if(c.result.state==='deal')s.deals++;unique.add(c.id);}
      if(c.price!==null)s.priced++;
      if(c.seconds!==null)s.timed++;if(c.quote.state==='ready')s.quotes++;
      if(c.result.state==='unreliable')s.unreliable++;if(c.shiny)s.shiny++;
    }
    return s;
  }
  function results() {
    const found=new Map();for(const c of cards.values())if(c.result.match && !found.has(c.id))found.set(c.id,c);
    return [...found.values()];
  }
  function nativeWarning() {
    if(!main || !browse)return '';
    const active=[...main.querySelectorAll('button')].some(b=>C.RARITIES.includes(b.textContent.trim()) && (b.classList.contains('ring-2') || b.getAttribute('aria-pressed')==='true'));
    const search=main.querySelector('input[type="search"],input[placeholder*="Rechercher"]');
    return active || search?.value ? 'Un filtre natif du marché est actif. « Toutes les cartes » couvre les annonces chargées : efface aussi la recherche et les raretés du site pour élargir le marché.' : '';
  }
  function render() {
    if(ui)ui.render({prefs,enabled,stats:stats(),message,nativeWarning:nativeWarning(),scan:scan?{done:scan.done,max:scan.max}:null,
      results:results().slice(0,100),favorites,version:C.VERSION});
  }
  function loadButton() {
    if(!browse || !main)return null;
    const buttons=[...main.querySelectorAll('button')].filter(b=>!own(b) && C.clean(b.textContent)==='Charger la suite' &&
      !b.closest('[role="dialog"],[aria-modal="true"]') && visible(b) && !b.disabled && b.getAttribute('aria-disabled')!=='true');
    return buttons.length===1 ? buttons[0] : null;
  }
  function delay(ms,signal) {
    return new Promise(resolve=>{
      if(signal.aborted){resolve(false);return;}
      const onAbort=()=>{clearTimeout(timer);resolve(false);};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve(true);},ms);
      signal.addEventListener('abort',onAbort,{once:true});
    });
  }
  function waitNew(run,known) {
    return new Promise(resolve=>{
      let timer;
      const finish=value=>{clearTimeout(timer);run.abort.signal.removeEventListener('abort',onAbort);run.check=null;resolve(value);};
      const onAbort=()=>finish(false);
      run.check=()=>{if([...cards.values()].some(c=>!known.has(c.id)))finish(true);};
      timer=setTimeout(()=>finish(false),WAIT);run.abort.signal.addEventListener('abort',onAbort,{once:true});run.check();
    });
  }
  async function startScan() {
    if(scan || !browse || document.hidden)return;
    if(!enabled){enabled=true;message='Filtres actifs.';sync();}
    if(!enabled || !grid){message='Aucune grille reconnue. Aucun chargement lancé.';render();return;}
    const run={abort:new AbortController(),max:prefs.batches,done:0,started:Date.now(),check:null};scan=run;message='Exploration en cours…';render();
    const deadline=setTimeout(()=>{if(scan===run)stopScan('Arrêt après 3 minutes maximum.');},180000);
    try {
      // Count additional lots; never count the initial lot as a new load.
      for(let i=0;i<run.max;i++) {
        if(!await delay(DELAY,run.abort.signal))break;
        if(scan!==run || !activeView() || document.hidden || !enabled)break;
        if(Date.now()-run.started>180000){message='Arrêt après 3 minutes maximum.';break;}
        const button=loadButton();if(!button){message='Fin de l’exploration : aucun bouton « Charger la suite » disponible.';break;}
        const known=new Set([...cards.values()].map(c=>c.id)),waiting=waitNew(run,known);
        metrics.loadClicks++;button.click();
        if(!await waiting){if(scan===run)message='Chargement non confirmé en 20 s. Arrêt sans nouvelle tentative automatique.';break;}
        if(scan!==run)break;
        run.done++;message=`${run.done} / ${run.max} lots supplémentaires chargés.`;render();
      }
    }catch{if(scan===run)message='Exploration interrompue : le marché a changé.';}
    finally{clearTimeout(deadline);run.abort.abort();if(scan===run){scan=null;render();}}
  }
  function download(name,text,type) {
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function exportResults() {
    const rows=[['Carte','Rareté','Shiny','Minimum pour miser (WB)','Cote Toolbox affichée (WB)','Décote théorique (%)','Durée affichée (s)','Lien','Favori']];
    for(const c of results())rows.push([c.title,c.rarity,c.shiny?'Oui':'Non',c.price,c.quote.value,c.result.discount?.toFixed(2),c.seconds,location.origin+c.id,favorites.has(c.id)?'Oui':'Non']);
    const text=C.csv(rows);
    ui.preview('Export CSV des résultats',text,()=>download('wikimasters-resultats.csv',text,'text/csv;charset=utf-8'));
  }
  function exportDiagnostic() {
    const text=JSON.stringify({version:C.VERSION,enabled,browse,stats:stats(),metrics,timeTimerActive:timeTimer!==null,
      exploring:!!scan,limit:LIMIT,scope:'DOM local uniquement ; aucune donnée de compte'},null,2);
    ui.preview('Diagnostic local',text,()=>download('wikimasters-diagnostic.json',text,'application/json'));
  }
  function toggleFavorite(id){if(favorites.has(id))favorites.delete(id);else if(favorites.size<1000)favorites.add(id);save();render();}
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element ? event.target.closest('button,a,[role="tab"]') : null;
    if(!target || own(target))return;
    const kind=C.tabName(target.textContent);
    if(rootPath() && kind){pendingNavigation={kind};suspend('Exploration arrêtée : changement d’onglet.');scheduleSync();return;}
    if(target.tagName==='A')try{
      const url=new URL(target.href,location.href);
      if(url.origin===location.origin && url.pathname!==location.pathname && target.target!=='_blank' && !event.ctrlKey && !event.metaKey){
        pendingNavigation={path:url.pathname};suspend('Exploration arrêtée : navigation.');scheduleSync();
      }
    }catch{}
    if(rootPath() && target.closest('main'))scheduleSync();
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){stopScan('Exploration arrêtée : onglet en arrière-plan.');gridObserver.disconnect();clearInterval(timeTimer);timeTimer=null;clearTimeout(batchTimer);batchTimer=null;}
    else{stopWork();scheduleSync();}
  });
  document.addEventListener('change',e=>{if(!own(e.target) && rootPath()){stopScan('Exploration arrêtée : tri ou filtre natif modifié.');scheduleSync();}},true);
  window.addEventListener('popstate',()=>{pendingNavigation=null;suspend('Exploration arrêtée : navigation.');scheduleSync();});
  if(window.navigation)window.navigation.addEventListener('currententrychange',()=>{pendingNavigation=null;suspend('Exploration arrêtée : navigation.');scheduleSync();});
  window.addEventListener('pagehide',()=>{stopScan();stopWork();pageObserver.disconnect();tabsObserver.disconnect();shellObserver.disconnect();clearTimeout(syncTimer);syncTimer=null;disposed=true;});
  window.addEventListener('pageshow',()=>{if(disposed){disposed=false;enabled=false;main=null;tabbar=null;startObservers();scheduleSync();}});
  function startObservers() {
    shellObserver.observe(document.body,{childList:true});
    for(const el of document.querySelectorAll('main,[role="main"]'))for(let p=el.parentElement;p && p!==document.body;p=p.parentElement)shellObserver.observe(p,{childList:true});
    observeMain();
  }
  async function init() {
    try{
      const saved=await chrome.storage.local.get([KEY,WATCH_KEY]);prefs=C.settings(saved[KEY]);
      favorites=new Set((Array.isArray(saved[WATCH_KEY])?saved[WATCH_KEY]:[]).filter(x=>typeof x==='string').map(x=>{
        try{return new URL(x,location.origin).pathname;}catch{return '';}
      }).filter(x=>/^\/marketplace\/[^/]+$/.test(x)).slice(0,1000));
    }catch{message='Sauvegarde indisponible ; réglages par défaut dans cet onglet.';}
    // Ignore legacy filters and scan-session keys. Activation is never persisted.
    startObservers();sync();
  }
  if(document.body)init();else document.addEventListener('DOMContentLoaded',init,{once:true});
})();

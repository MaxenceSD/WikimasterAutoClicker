/* Shared, side-effect-free parsers. Browser: isolated extension world; Node: tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WMFinderCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RARITIES = ['C', 'PC', 'R', 'SR', 'UR', 'L'];
  const FRAME = '.glow-c,.glow-pc,.glow-r,.glow-sr,.glow-ur,.glow-l,.shiny-card,.glow-shiny';
  const LINK = 'a.card-frame[href]';
  const DEFAULTS = Object.freeze({rarity:'all', minPrice:null, maxPrice:null, minMinutes:null, maxMinutes:null,
    dealsOnly:false, discount:0, batches:5, collapsed:false});
  const clean = value => String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g,' ').trim();
  const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function number(value, max = 100000000) {
    if (value === null || value === undefined || clean(value) === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  }
  function settings(value = {}) {
    const p = value && typeof value === 'object' ? value : {};
    return {rarity:['all','shiny',...RARITIES].includes(p.rarity) ? p.rarity : 'all',
      minPrice:number(p.minPrice), maxPrice:number(p.maxPrice), minMinutes:number(p.minMinutes,43200), maxMinutes:number(p.maxMinutes,43200),
      dealsOnly:p.dealsOnly === true, discount:number(p.discount,99) ?? 0,
      batches:[2,5,10,20].includes(p.batches) ? p.batches : 5, collapsed:p.collapsed === true};
  }
  // Accept the whole value field, never the first number of a free-form sentence.
  function money(value, decimal = false) {
    let s = clean(value).replace(/^(?:₩|WB|W)\s*/i,'').replace(/\s*(?:₩|WB|W|wikibidous?)$/i,'').trim();
    const integer = '(?:\\d{1,3}(?:[ .\u2019\u0027]\\d{3})+|\\d+)';
    const pattern = new RegExp('^'+integer+(decimal ? '(?:,\\d{1,2})?' : '')+'$');
    if (!pattern.test(s)) return null;
    s = s.replace(/[ .’']/g,'').replace(',','.');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null;
  }
  function seconds(value) {
    const s = norm(value);
    if (/^(terminee?|expiree?|finie?|cloturee?)$/.test(s)) return 0;
    if (/^\d{1,4}:\d{2}(?::\d{2})?$/.test(s)) {
      const p = s.split(':').map(Number);
      if (p[1]>59 || (p.length===3 && p[2]>59)) return null;
      return p.length===2 ? p[0]*60+p[1] : p[0]*3600+p[1]*60+p[2];
    }
    const re = /(\d{1,5})\s*(jours?|j|days?|d|heures?|hrs?|h|minutes?|mins?|min|m|secondes?|secs?|sec|s)/g;
    let match, total=0, end=0, previous=Infinity, count=0;
    while ((match=re.exec(s))) {
      if (s.slice(end,match.index).trim()) return null;
      const multiplier = /^[jd]/.test(match[2]) ? 86400 : /^h/.test(match[2]) ? 3600 : /^m/.test(match[2]) ? 60 : 1;
      if (multiplier >= previous) return null;
      total += Number(match[1])*multiplier;
      previous=multiplier; end=re.lastIndex; count++;
    }
    return count && !s.slice(end).trim() ? total : null;
  }
  const LABELS = Object.freeze({
    'mise de depart':'start', 'mise actuelle':'current', 'enchere actuelle':'current',
    'enchere en cours':'current', 'prix actuel':'current', 'meilleure enchere':'current',
    'mise minimale':'minimum', 'mise minimum':'minimum', 'minimum de mise':'minimum',
    'duree':'time', 'temps restant':'time'
  });
  function fieldNodes(anchor, frame) {
    const fields = {};
    for (const label of anchor.querySelectorAll('span,dt,label,small')) {
      if (frame.contains(label) || label.closest('[class*="wmt-"]')) continue;
      const kind = LABELS[norm(label.textContent).replace(/\s*:$/,'')];
      const value = label.nextElementSibling;
      if (!kind || !value || label.parentElement !== value.parentElement) continue;
      if (fields[kind]) { fields[kind] = {ambiguous:true}; continue; }
      fields[kind] = {label, value};
    }
    return fields;
  }
  function auctionPrice(fields) {
    // A broken CURRENT field must not silently fall back to an old starting bid.
    for (const [key, increment] of [['minimum',0],['current',1],['start',0]]) {
      if (!fields[key]) continue;
      const visible = fields[key].ambiguous ? null : money(fields[key].value.textContent);
      return {price:visible === null ? null : visible+increment, displayed:visible, source:key};
    }
    return {price:null, displayed:null, source:'unknown'};
  }
  function quote(anchor) {
    const badges = anchor.querySelectorAll('.wmt-chip-price');
    if (!badges.length) return {state:'pending',value:null};
    if (badges.length !== 1) return {state:'unreliable',value:null};
    const badge=badges[0], text=clean(badge.textContent);
    if (!text || /^(?:…|\.\.\.|chargement)$/i.test(text)) return {state:'pending',value:null};
    if (badge.classList.contains('wmt-chip-approx') || /[≈~]/.test(text)) return {state:'unreliable',value:null};
    if (!/(?:₩|WB|W)\s*$/i.test(text)) return {state:'unreliable',value:null};
    const value=money(text,true);
    return value !== null && value>0 ? {state:'ready',value} : {state:'unreliable',value:null};
  }
  function identity(anchor, origin) {
    try {
      const url=new URL(anchor.getAttribute('href'),origin);
      return url.origin === new URL(origin).origin && /^\/marketplace\/[^/?#]+\/?$/.test(url.pathname) ? url.pathname.replace(/\/$/,'') : null;
    } catch { return null; }
  }
  function read(anchor, origin) {
    const id=identity(anchor,origin), frame=anchor.querySelector(FRAME);
    if (!id || !frame || !frame.querySelector('h3')) return null;
    const shiny=frame.classList.contains('shiny-card') || frame.classList.contains('glow-shiny');
    const rarity=shiny ? 'L' : (frame.className.match(/(?:^|\s)glow-(c|pc|r|sr|ur|l)(?:\s|$)/i)?.[1] || '').toUpperCase();
    const fields=fieldNodes(anchor,frame);
    return {id, anchor, frame, fields, rarity, shiny, title:clean(frame.querySelector('h3').textContent),
      ...auctionPrice(fields), seconds:fields.time && !fields.time.ambiguous ? seconds(fields.time.value.textContent) : null,
      quote:quote(anchor)};
  }
  function inRange(value,min,max) {
    return (min===null && max===null) || (value!==null && (min===null || value>=min) && (max===null || value<=max));
  }
  function evaluate(card,p) {
    const rare=p.rarity==='all' || (p.rarity==='shiny' ? card.shiny : card.rarity===p.rarity && (p.rarity!=='L' || !card.shiny));
    const time=inRange(card.seconds,p.minMinutes===null?null:p.minMinutes*60,p.maxMinutes===null?null:p.maxMinutes*60);
    const basic=rare && inRange(card.price,p.minPrice,p.maxPrice) && time;
    if (!basic) return {state:'excluded',match:false,pending:false,discount:null};
    if (!p.dealsOnly) return {state:'match',match:true,pending:false,discount:null};
    if (card.quote.state==='pending') return {state:'pending',match:false,pending:true,discount:null};
    if (card.quote.state!=='ready' || card.price===null || card.seconds===0) return {state:'unreliable',match:false,pending:false,discount:null};
    const discount=100*(card.quote.value-card.price)/card.quote.value;
    const match=card.price<card.quote.value && discount+1e-9>=p.discount;
    return {state:match?'deal':'no-deal',match,pending:false,discount};
  }
  function tabName(text) {
    const t=norm(text).replace(/\s*\(\s*\d+\s*(?:\/\s*\d+)?\s*\)\s*$/,'');
    return t==='parcourir' ? 'browse' : ['mes encheres','mes ventes','gagnees','historique'].includes(t) ? 'other' : null;
  }
  function csv(rows) {
    const cell=value => '"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
  }
  return {RARITIES,FRAME,LINK,DEFAULTS,clean,norm,number,settings,money,seconds,fieldNodes,auctionPrice,quote,identity,read,inRange,evaluate,tabName,csv};
});

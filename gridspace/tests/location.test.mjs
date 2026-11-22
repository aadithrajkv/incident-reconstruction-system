import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// Exercise the shipped browser functions without starting the app, auth or real GPS.
const acquisition = source.slice(source.indexOf('function stopLocationRequest()'), source.indexOf('function applyInviteGrid()'));
const geometry = source.slice(source.indexOf('const merc='),source.indexOf('const nb='));
const tracking = source.slice(source.indexOf('function startWatching()'), source.indexOf('function granted('));
function setup() {
  let now = 0, timerId = 0;
  const timers = new Map(), watches = [], fallbacks = [], clears = [], grants = [];
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: true, disabled: false, textContent: '' });
    return nodes.get(selector);
  };
  const context = {
    navigator: { geolocation: {
      watchPosition(success, error, options) { watches.push({success,error,options}); return watches.length; },
      clearWatch(id) { clears.push(id); },
      getCurrentPosition(success, error, options) { fallbacks.push({success,error,options}); },
    } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id,{fn,at:now+delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    $: node, optionalHidden: (selector,value) => { node(selector).hidden=value; },
    optionalText: (selector,value) => { node(selector).textContent=value; },
    introLocationVisible: () => true, getLastGrid: () => null, ageText: () => 'recently',
    granted: (...args) => grants.push(args), toast() {}, render() {}, nameArea() {}, maybeOpenBusinessWizard() {}, setPos() {},
    ACC_MAX:1000, MAX_FIX_AGE:120000, R0:6378137, S3:Math.sqrt(3), RM:(1000/Math.cos(20*Math.PI/180))/Math.sqrt(3), locationFix:null, locationIsManual:false, acquiringWatch:null, locationTimer:0, locationRequestVersion:0,
    trackingWatch:null, trackingSequence:0, watching:false, pendingApproxPosition:null,
    locationIsCached:false, locationReadOnly:false, started:0, sharedAssignedGrid:'old-grid',
    sharedAssignmentPendingGrid:'old-grid', sharedAssignmentSequence:0,
  };
  vm.createContext(context); vm.runInContext(geometry+'\n'+acquisition+'\n'+tracking,context);
  function advance(ms) {
    const end=now+ms;
    while (true) {
      const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      now=next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now=end;
  }
  return {context,watches,fallbacks,clears,grants,timers,node,advance};
}
const position = (accuracy=50) => ({coords:{latitude:0,longitude:0,accuracy},timestamp:Date.now()});

test('temporary provider failure keeps watching and can recover', () => {
  const h=setup();h.context.ask();h.watches[0].error({code:2});
  assert.equal(h.clears.length,0);assert.equal(h.fallbacks.length,0);
  h.watches[0].success(position());assert.equal(h.grants.length,1);assert.equal(h.timers.size,0);
});
test('full 25-second window precedes bounded low-accuracy fallback', () => {
  const h=setup();h.context.ask();h.advance(15000);assert.equal(h.fallbacks.length,0);
  h.advance(10000);assert.equal(h.fallbacks.length,1);assert.equal(h.fallbacks[0].options.enableHighAccuracy,false);
  h.advance(12000);assert.equal(h.node('#retry').hidden,false);assert.match(h.node('#imsg').textContent,/could not find/);
});
test('permission denial is terminal and does not retry automatically', () => {
  const h=setup();h.context.ask();h.watches[0].error({code:1});h.advance(40000);
  assert.equal(h.fallbacks.length,0);assert.equal(h.grants.length,0);assert.match(h.node('#imsg').textContent,/permission is blocked/);
});
test('late results from a superseded request cannot change the location', () => {
  const h=setup();h.context.ask();h.advance(25000);h.context.ask();
  h.fallbacks[0].success(position());h.watches[0].success(position());assert.equal(h.grants.length,0);
  h.watches[1].success(position());assert.equal(h.grants.length,1);
});
test('coarse fixes offer browsing without granting precise location', () => {
  const h=setup();h.context.ask();h.watches[0].success(position(2500));assert.equal(h.node('#approxloc').hidden,false);
  h.advance(25000);assert.equal(h.grants.length,0);assert.equal(h.node('#approxloc').hidden,false);
  assert.match(h.node('#imsg').textContent,/sharing stays off/);
});
test('a fallback can recover after provider failures', () => {
  const h=setup();h.context.ask();h.watches[0].error({code:2});h.advance(25000);
  h.fallbacks[0].success(position(400));assert.equal(h.grants.length,1);
});
test('invalid coordinate data never unlocks the app', () => {
  const h=setup();h.context.ask();h.watches[0].success(position(NaN));
  h.watches[0].success({coords:{latitude:200,longitude:80,accuracy:1}});assert.equal(h.grants.length,0);
});
test('permission revocation pauses sharing and permits a fresh watch later', () => {
  const h=setup();h.context.startWatching();h.watches[0].error({code:1});
  assert.equal(h.context.locationReadOnly,true);assert.equal(h.context.sharedAssignedGrid,null);
  assert.equal(h.context.sharedAssignmentPendingGrid,null);assert.equal(h.context.watching,false);
  h.context.startWatching();assert.equal(h.watches.length,2);
});
test('insecure contexts produce actionable guidance without requesting GPS', () => {
  const h=setup();h.context.isSecureContext=false;h.context.ask();assert.equal(h.watches.length,0);
  assert.match(h.node('#imsg').textContent,/HTTPS/);
});

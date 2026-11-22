/* Tiles: OpenStreetMap needs no key but is for light use only. For production, swap TILE for MapTiler/Stadia/Mapbox with your own key. */
const TILE=(z,x,y)=>`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const TPC=15,PAGE=4,MAXADS=3,BASE=9,MAXC=4,DAYS=30,MAXKM=20,ACC_MAX=1000,MAX_FIX_AGE=120000,R0=6378137,S3=Math.sqrt(3),RM=(1000/Math.cos(20*Math.PI/180))/S3,HALF=20037508.34;
const DIRS=[["East",1,0],["West",-1,0],["North-east",0,1],["North-west",-1,1],["South-east",1,-1],["South-west",0,-1]];
const CHAINS=/(apple|sony|reliance|jio|tata|amazon|google|microsoft|samsung|walmart|flipkart|adani|mcdonald|starbucks|nike|coca|pepsi|unilever|nestle|meta|facebook|infosys|wipro|hdfc|icici|airtel|vodafone|bigbasket|dmart|zomato|swiggy)/i;
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
function emptyState(){return{credits:0,liked:{},cells:{},notes:[],areas:{},name:"",subscriptions:[],gridNotifications:[],browserAlerts:false}}
function readState(key){let s;try{s=JSON.parse(localStorage.getItem(key))}catch(e){}s=s||{};s.credits=s.credits||0;s.liked=s.liked||{};s.cells=s.cells||{};s.notes=s.notes||[];s.areas=s.areas||{};s.name=s.name||"";s.subscriptions=Array.isArray(s.subscriptions)?s.subscriptions:[];s.gridNotifications=Array.isArray(s.gridNotifications)?s.gridNotifications:[];s.browserAlerts=!!s.browserAlerts;
 /* Remove known synthetic fixture rows once, preserving anything the user entered locally. */
 if(s.fixtureCleanupVersion!==1){for(const c of Object.values(s.cells)){if(!c)continue;if(Array.isArray(c.th))c.th=c.th.filter(t=>!/(?:t\d+|demo\d+)$/.test(String(t.id||"")));if(Array.isArray(c.ads))c.ads=c.ads.filter(a=>!/(?:a\d+|r\d+)$/.test(String(a.id||"")))}s.gridNotifications=s.gridNotifications.filter(n=>!/^gn/.test(String(n.id||"")));s.notes=s.notes.filter(n=>n.type!=="challenge"&&!/Sunrise Juice Corner|Your ₹/.test(String(n.text||"")));s.fixtureCleanupVersion=1}
 const today=new Date().toISOString().slice(0,10);if(s.seedDay!==today){s.credits=Math.min(3,s.credits+1);s.seedDay=today}
 try{localStorage.setItem(key,JSON.stringify(s))}catch(e){}return s}
let activeSharedEpoch=0,accountUsername="",sharedRefreshBusy=false;
let storageKey="gs2",S=emptyState(),authClient=null,realAuth=false,currentUserId=null,captchaToken=null,turnstileId=null;
const save=()=>{if(realAuth)return;try{localStorage.setItem(storageKey,JSON.stringify(S))}catch(e){}};
const hash=s=>{let h=7;for(const c of s)h=h*31+c.charCodeAt(0)|0;return h};
const merc=(la,lo)=>[R0*lo*Math.PI/180,R0*Math.log(Math.tan(Math.PI/4+la*Math.PI/360))];
function hexOf(X,Y){const q=(S3/3*X-Y/3)/RM,r=(2/3*Y)/RM,s=-q-r;let a=Math.round(q),b=Math.round(r),c=Math.round(s);const da=Math.abs(a-q),db=Math.abs(b-r),dc=Math.abs(c-s);if(da>db&&da>dc)a=-b-c;else if(db>dc)b=-a-c;return[a,b]}
const hexC=(q,r)=>[RM*S3*(q+r/2),RM*1.5*r];
const nb=(id,dq,dr)=>{const[q,r]=id.split(",").map(Number);return(q+dq)+","+(r+dr)};
/* New grids start empty. The only posts/offers shown are user entries stored in this browser. */
const T={};
function cell(id,w){let c=S.cells[id]||T[id];if(!c)c=T[id]={th:[],ads:[]};if(!Array.isArray(c.th))c.th=[];if(!Array.isArray(c.ads))c.ads=[];if(!Array.isArray(c.issues))c.issues=[];if(w&&!S.cells[id])S.cells[id]=c;c.ads=c.ads.filter(a=>a.exp>Date.now());return c}
let pos,here,viewHex,hoverHex=null,areaName="",adStep=1,composerEmoji=null,mode="map",tab="feed",cat="All",page=0,picks=new Set(),adPin=null,adKind="listed",adDraft=null,pickingPin=false,adOriginMode="list",composerKind="thought",composerOpen=false,issueDraftImage=null,activityLayer=false,M={z:14,X:0,Y:0},last=null,locationFix=null,untrust=0,started=0,locationIsCached=false,locationReadOnly=false,locationIsManual=false,watching=false,trackingWatch=null,trackingSequence=0,acquiringWatch=null,locationTimer=0,locationRequestVersion=0,pendingApproxPosition=null,pendingBusinessWizard=false,placeResults=[],placeSearchCache=new Map(),placeSearchAt=0,dark=matchMedia("(prefers-color-scheme:dark)").matches;
const toast=t=>{const e=$("#toast");e.textContent=t;e.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.opacity=0,2800)};
function applyTheme(){document.documentElement.dataset.theme=dark?"dark":"light"}
$("#theme").onclick=()=>{dark=!dark;applyTheme();if(mode==="map")drawMap()};applyTheme();
/* ---------- location gate + intro ---------- */
function when(ts){if(!Number.isFinite(ts)||ts<1e9)return"Today";const m=Math.max(0,Math.floor((Date.now()-ts)/60000));return m<1?"now":m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:new Date(ts).toLocaleDateString()}
function ageText(ts){const t=when(ts);return t==="now"?"just now":t.endsWith("ago")?t:`${t}`}
function locationCacheKey(){return `gs2_last_grid_${storageKey}`}
function getLastGrid(){try{const d=JSON.parse(localStorage.getItem(locationCacheKey()));if(d&&/^[-]?\d+,[-]?\d+$/.test(d.id)&&Date.now()-d.t<90*86400000)return d}catch(e){}return null}
function introLocationVisible(){const e=$("#intro");return !started&&!!e&&e.isConnected}
function optionalHidden(selector,value){const e=$(selector);if(e)e.hidden=value}
function optionalText(selector,value){const e=$(selector);if(e)e.textContent=value}
function forgetLastGrid(){try{localStorage.removeItem(locationCacheKey())}catch(e){}optionalHidden("#lastloc",true);optionalHidden("#forgetloc",true);optionalHidden("#forgetactive",true);optionalText("#locationstate","Saved grid forgotten.");if(started)toast("Saved grid forgotten from this device")}
function stopLocationRequest(){locationRequestVersion++;if(acquiringWatch!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(acquiringWatch)}catch(e){}}acquiringWatch=null;clearTimeout(locationTimer);locationTimer=0}
function assessGridFix(la,lo,accuracy,timestamp){
 const now=Date.now(),age=now-timestamp,gridId=hexOf(...merc(la,lo)).join(","),[q,r]=gridId.split(",").map(Number),[cx,cy]=hexC(q,r),[x,y]=merc(la,lo),apothem=RM*S3/2,dx=x-cx,dy=y-cy;
 let furthest=0;for(let i=0;i<6;i++){const angle=Math.PI/6+i*Math.PI/3;furthest=Math.max(furthest,dx*Math.cos(angle)+dy*Math.sin(angle))}
 const boundaryMarginMeters=Math.max(0,(apothem-furthest)*Math.cos(la*Math.PI/180)),fresh=Number.isFinite(timestamp)&&age>=-30000&&age<=MAX_FIX_AGE,accurate=Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=ACC_MAX,insideWithMargin=boundaryMarginMeters>accuracy;
 return{gridId,accuracy,boundaryMarginMeters,age,fresh,accurate,insideWithMargin,canConfirm:fresh&&accurate&&insideWithMargin};
}
function fixAge(){return locationFix?Date.now()-locationFix.timestamp:Infinity}
function canContributeToGrid(gridId=here){return !!(gridId&&locationFix&&!locationIsManual&&!locationIsCached&&!locationReadOnly&&locationFix.gridId===gridId&&fixAge()>=-30000&&fixAge()<=MAX_FIX_AGE&&locationFix.accuracy<=ACC_MAX&&locationFix.boundaryMarginMeters>locationFix.accuracy&&trusted()&&(!realAuth||sharedAssignedGrid===gridId))}
function locationHoldReason(){if(locationIsManual)return"Browsing a chosen area is read-only. Try your current location to contribute.";if(locationIsCached)return"This saved grid is for browsing only. Try your current location to contribute.";if(!locationFix)return"A fresh location is needed before you can contribute.";if(fixAge()>MAX_FIX_AGE)return"Your location fix is more than two minutes old. Refresh it before contributing.";if(locationFix.accuracy>ACC_MAX)return`Location accuracy is about ±${Math.round(locationFix.accuracy)} m. Browsing is available; sharing needs a clearer fix.`;if(locationFix.boundaryMarginMeters<=locationFix.accuracy)return`Your ±${Math.round(locationFix.accuracy)} m uncertainty overlaps a neighboring grid. Move farther inside this grid or retry.`;if(!trusted())return"Location is paused briefly while we check a recent movement.";if(realAuth&&sharedAssignedGrid!==here)return"Confirming this grid with the pilot service. Sharing will unlock when it is confirmed.";return"Sharing is paused until your current grid is confirmed."}
function showApproximateChoice(){stopLocationRequest();if(!pendingApproxPosition)return fail("Your device hasn’t returned a location yet. Turn on Location Services or Wi‑Fi and try again.");const accuracy=Math.round(pendingApproxPosition.coords.accuracy);if(!introLocationVisible()){pendingApproxPosition=null;const b=$("#locretry");if(b){b.hidden=false;b.disabled=false;b.textContent="Try location again"}optionalText("#city",locationIsCached?`Last known · ${ageText(getLastGrid()?.t)} · read only`:"Still showing your last confirmed grid");toast(`A location fix is only accurate to about ${accuracy} m. Keeping your current grid.`);return}$("#imsg").textContent=`We found the general area (±${accuracy} m). Explore it now; sharing stays off until we can confirm your grid.`;$("#retry").hidden=false;$("#retry").textContent="Keep looking for a precise location";$("#approxloc").hidden=false;const d=getLastGrid();if(d){$("#lastloc").hidden=false;$("#lastloc").textContent=`Use saved area · ${ageText(d.t)}`;$("#forgetloc").hidden=false;$("#locationstate").textContent="A saved area is stored on this device only."}}
function fail(m){stopLocationRequest();optionalHidden("#location-help",false);if(introLocationVisible()){$("#imsg").textContent=m;$("#retry").hidden=false;$("#retry").disabled=false;$("#retry").textContent="Try location again";$("#approxloc").hidden=true;const d=getLastGrid();if(d){$("#lastloc").hidden=false;$("#forgetloc").hidden=false;$("#lastloc").textContent=`Use last known grid · ${ageText(d.t)}`;$("#locationstate").textContent="Saved on this device as a coarse grid. It may be out of date."}}else{const b=$("#locretry");if(b){b.hidden=false;b.disabled=false;b.textContent="Try location again"}if(locationReadOnly||locationIsCached)optionalHidden("#choose-neighborhood-open",false);const d=getLastGrid();optionalText("#city",locationIsManual?"Chosen neighborhood · read only":locationIsCached&&d?`Last known · ${ageText(d.t)} · read only`:locationReadOnly?"Approximate area · read only":d?"Showing your last confirmed grid":"Location refresh unavailable");toast(m)}}
function validLocation(position){const c=position?.coords;return !!c&&Number.isFinite(c.latitude)&&Math.abs(c.latitude)<90&&Number.isFinite(c.longitude)&&Math.abs(c.longitude)<=180&&Number.isFinite(c.accuracy)&&c.accuracy>=0}
function stopTrackingLocation(){trackingSequence++;if(trackingWatch!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(trackingWatch)}catch{}}trackingWatch=null;watching=false}
function ask(){
 stopLocationRequest();stopTrackingLocation();pendingApproxPosition=null;
 const request=locationRequestVersion,active=()=>request===locationRequestVersion;
 const inIntro=introLocationVisible(),saved=getLastGrid();
 optionalHidden("#location-help",true);
 if(inIntro){
  optionalHidden("#retry",true);optionalText("#retry","Try location again");optionalHidden("#approxloc",true);
  optionalText("#locationstate","Your browser may ask permission. A desktop location can take a little longer.");
  optionalText("#imsg","Finding your neighborhood…");optionalHidden("#lastloc",!saved);optionalHidden("#forgetloc",!saved);
  if(saved)optionalText("#lastloc",`Use last known grid · ${ageText(saved.t)}`);
 }else{const button=$("#locretry");if(button){button.hidden=false;button.disabled=true;button.textContent="Locating…"}optionalText("#city","Checking your location…")}
 if(globalThis.isSecureContext===false)return fail("Location needs a secure connection. Open this app over HTTPS, or use localhost for a local preview.");
 if(!navigator.geolocation)return fail("This browser does not provide location. Try another browser or open Thotox on your phone.");
 const denied="Location permission is blocked. Check both macOS Location Services for your browser and this website’s location permission, then retry.";
 const unavailable="Your device could not find a location right now. This can happen on a Mac even after you allow access. Check Wi‑Fi and Location Services below, then retry or use a saved area.";
 let fallbackTried=false;
 const status=message=>optionalText(introLocationVisible()?"#imsg":"#city",message);
 const fallback=()=>{
  if(!active()||fallbackTried)return;
  if(pendingApproxPosition)return showApproximateChoice();
  fallbackTried=true;
  if(acquiringWatch!==null){try{navigator.geolocation.clearWatch(acquiringWatch)}catch{}acquiringWatch=null}
  clearTimeout(locationTimer);
  status("Trying a recent device location…");
  locationTimer=setTimeout(()=>{if(active())fail(unavailable)},12000);
  try{navigator.geolocation.getCurrentPosition(found,error,{enableHighAccuracy:false,timeout:12000,maximumAge:60000})}
  catch{if(active())fail("This browser could not start a location check. Check site permissions, or try another browser.")}
 };
 const error=event=>{
  if(!active())return;
  if(event.code===1)return fail(denied);
  if(fallbackTried)return pendingApproxPosition?showApproximateChoice():fail(unavailable);
  // POSITION_UNAVAILABLE can be transient on Core Location. Keep the watch alive
  // until the bounded deadline instead of cancelling on its first provider error.
  if(event.code===2){status("The device is still trying to find your location…");optionalHidden("#location-help",false);return}
  if(event.code===3)return fallback();
  fail(unavailable);
 };
 const found=position=>{
  if(!active()||!validLocation(position))return;
  const accuracy=position.coords.accuracy;
  if(!pendingApproxPosition||accuracy<pendingApproxPosition.coords.accuracy)pendingApproxPosition=position;
  const confidence=assessGridFix(position.coords.latitude,position.coords.longitude,accuracy,position.timestamp);
  if(confidence.canConfirm){stopLocationRequest();pendingApproxPosition=null;granted(position.coords.latitude,position.coords.longitude,accuracy,position.timestamp);return}
  if(accuracy<=ACC_MAX&&confidence.fresh)status(`The location is near a grid edge (about ${Math.round(confidence.boundaryMarginMeters)} m from the boundary). Looking for a clearer fix…`);
  else status(`We found an approximate area (±${Math.round(pendingApproxPosition.coords.accuracy)} m). Still checking for a more precise fix…`);
  if(introLocationVisible()){optionalHidden("#approxloc",false);optionalText("#locationstate",accuracy<=ACC_MAX?"You can browse this area. Sharing needs a fix that stays inside one grid.":"You can browse the approximate area now. Sharing needs a precise location.")}
  if(fallbackTried)showApproximateChoice();
 };
 // The browser timeout and our UI deadline agree; the old UI deadline was 15 s.
 locationTimer=setTimeout(()=>{if(active())pendingApproxPosition?showApproximateChoice():fallback()},25000);
 try{acquiringWatch=navigator.geolocation.watchPosition(found,error,{enableHighAccuracy:true,timeout:25000,maximumAge:60000})}
 catch{if(active())fail("This browser could not start a location check. Check site permissions, or try another browser.")}
}
function applyInviteGrid(){const id=new URL(location.href).searchParams.get("grid");if(!id||!/^[-]?\d+,[-]?\d+$/.test(id)||!landReady)return;const [q,r]=id.split(",").map(Number),[x,y]=hexC(q,r);if(!landAtMerc(x,y))return;viewHex=id;mode="list";tab="feed"}
$("#retry").onclick=ask;
$("#locretry").onclick=ask;
$("#forgetactive").onclick=forgetLastGrid;
$("#lastloc").onclick=useLastGrid;$("#forgetloc").onclick=forgetLastGrid;$("#approxloc").onclick=()=>{const p=pendingApproxPosition;if(!p)return;pendingApproxPosition=null;granted(p.coords.latitude,p.coords.longitude,p.coords.accuracy,p.timestamp)};
function openNeighborhoodPicker(){const dialog=$("#neighborhood-dialog");if(!dialog)return;if(dialog.showModal)dialog.showModal();else{dialog.setAttribute("open","");dialog.style.display="block"}setTimeout(()=>$("#neighborhood-query")?.focus(),30)}
$("#choose-neighborhood-open").onclick=openNeighborhoodPicker;$("#browse-area").onclick=openNeighborhoodPicker;$("#neighborhood-close").onclick=()=>$("#neighborhood-dialog").close();
$("#neighborhood-search-form").onsubmit=async event=>{event.preventDefault();const query=$("#neighborhood-query").value.trim().replace(/\s+/g," ").slice(0,80),results=$("#place-results"),button=$("#neighborhood-search");if(query.length<2){results.textContent="Enter a neighborhood or public place name.";return}const key=query.toLocaleLowerCase();results.replaceChildren();results.setAttribute("aria-busy","true");button.disabled=true;try{let found=placeSearchCache.get(key);if(!found){const wait=Math.max(0,1100-(Date.now()-placeSearchAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));placeSearchAt=Date.now();const url=new URL("https://nominatim.openstreetmap.org/search");url.search=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"6",countrycodes:"in",q:query});const response=await fetch(url,{headers:{Accept:"application/json"}});if(!response.ok)throw Error(`Search service returned ${response.status}`);found=await response.json();if(!Array.isArray(found))throw Error("Unexpected search results");placeSearchCache.set(key,found)}placeResults=found.filter(item=>Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lon))).slice(0,6);if(!placeResults.length){results.textContent="No matching places found. Try a nearby landmark or locality.";return}results.innerHTML=placeResults.map((item,index)=>{const address=item.address||{},title=address.neighbourhood||address.suburb||address.quarter||address.city_district||address.town||address.city||item.name||String(item.display_name||"").split(",")[0]||"Place",detail=[address.city||address.town||address.municipality||address.state_district,address.state].filter(Boolean).join(", ")||item.display_name||"Public place";return `<button class="place-result" type="button" data-place-index="${index}"><strong>${esc(title)}</strong><small>${esc(detail)}</small></button>`}).join("");results.querySelectorAll("[data-place-index]").forEach(result=>result.onclick=()=>chooseNeighborhood(Number(result.dataset.placeIndex)))}catch(error){console.warn("Public neighborhood search failed.",error);results.textContent="Place search is unavailable right now. Try again in a moment."}finally{results.removeAttribute("aria-busy");button.disabled=false}};
async function chooseNeighborhood(index){const place=placeResults[index],lat=Number(place?.lat),lon=Number(place?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>=90||Math.abs(lon)>180)return toast("That place could not be opened.");const[X,Y]=merc(lat,lon),id=hexOf(X,Y).join(","),[cx,cy]=hexC(...id.split(",").map(Number));if(!landReady)await loadLandMask();if(landReady&&!landFailed&&!landAtMerc(cx,cy))return toast("That result appears to be outside a land grid. Try a nearby public place.");stopLocationRequest();stopTrackingLocation();pendingApproxPosition=null;sharedAssignmentSequence++;sharedAssignedGrid=null;sharedAssignmentPendingGrid=null;locationFix=null;locationIsManual=true;locationIsCached=false;locationReadOnly=true;last=null;pos=[lat,lon];here=viewHex=id;M.X=cx;M.Y=cy;M.z=14;mode="list";tab="feed";page=0;started=1;const address=place.address||{},label=address.neighbourhood||address.suburb||address.quarter||address.city_district||address.residential||address.town||address.city||place.name||String(place.display_name||"").split(",")[0]||"Chosen neighborhood",city=address.city||address.town||address.municipality||address.state_district||address.state||"India";areaName=label;S.areas[id]={p:label,c:city};optionalText("#area",label);optionalText("#city","Chosen place · read only");optionalHidden("#browse-area",false);optionalHidden("#locretry",false);optionalText("#locretry","Locate");optionalHidden("#forgetactive",true);const pinSlot=$("#pinslot");if(pinSlot)pinSlot.style.visibility="visible";$("#intro")?.remove();$("#neighborhood-dialog").close();render();toast("Browsing this neighborhood · read only")}
function useLastGrid(){const d=getLastGrid();if(!d)return fail("There isn’t a recent saved grid on this device.");stopLocationRequest();pendingApproxPosition=null;locationFix=null;locationIsManual=false;locationIsCached=true;locationReadOnly=true;mode="map";tab="feed";const[q,r]=d.id.split(",").map(Number),[X,Y]=hexC(q,r),la=(2*Math.atan(Math.exp(Y/R0))-Math.PI/2)*180/Math.PI,lo=X/R0*180/Math.PI;pos=[la,lo];here=viewHex=d.id;M.X=X;M.Y=Y;areaName="Last known area";started=1;optionalText("#area",areaName);optionalText("#city",`Last known · ${ageText(d.t)} · read only`);optionalHidden("#browse-area",false);optionalHidden("#locretry",false);optionalHidden("#forgetactive",false);const pinSlot=$("#pinslot");if(pinSlot)pinSlot.style.visibility="visible";const intro=$("#intro");if(intro)intro.remove();render();nameArea();startWatching();toast(`Showing last known grid · ${ageText(d.t)}`)}
function maybeOpenBusinessWizard(){if(!pendingBusinessWizard||locationReadOnly||locationIsCached||!here)return;const button=$("#businessstart");if(!button||button.disabled)return;pendingBusinessWizard=false;button.click()}
function startBusinessFlow(){composerOpen=true;composerKind="business";mode="list";tab="feed";if(!realAuth)return showLogin("Sign in to register your business.");render()}
function startWatching(){
 if(watching||!navigator.geolocation)return;
 const sequence=++trackingSequence;watching=true;
 try{trackingWatch=navigator.geolocation.watchPosition(position=>{
  if(sequence!==trackingSequence||!validLocation(position))return;
  const confidence=assessGridFix(position.coords.latitude,position.coords.longitude,position.coords.accuracy,position.timestamp);
  if(!confidence.canConfirm&&here&&!locationIsManual&&!locationIsCached){const wasWritable=!locationReadOnly;locationFix=confidence;locationReadOnly=true;if(wasWritable){if(mode==="list")renderList();else bar();toast("Location uncertainty reaches a neighboring grid. Sharing is paused; your map stays in place.")}return}
  const wasReadOnly=locationReadOnly||locationIsCached||locationIsManual;
  setPos(position.coords.latitude,position.coords.longitude,position.coords.accuracy,position.timestamp);
  if(wasReadOnly){optionalHidden("#locretry",true);optionalHidden("#forgetactive",true);render();nameArea();toast(locationReadOnly?"Location found, but its uncertainty reaches a neighboring grid. Browsing stays read only.":"Current grid confirmed");if(!locationReadOnly)maybeOpenBusinessWizard()}
 },error=>{
  if(sequence!==trackingSequence)return;
  if(error.code===1){
   stopTrackingLocation();stopLocationRequest();pendingApproxPosition=null;locationReadOnly=true;
   sharedAssignedGrid=null;sharedAssignmentPendingGrid=null;sharedAssignmentSequence++;
   optionalHidden("#locretry",false);optionalText("#city","Location permission blocked · read only");
   if(started)render();toast("Location permission was turned off. Browsing remains available; sharing is paused.");
  }
 },{enableHighAccuracy:true,maximumAge:30000,timeout:25000})}
 catch{stopTrackingLocation();optionalHidden("#locretry",false)}
}
function granted(la,lo,acc,timestamp=Date.now()){stopLocationRequest();locationIsManual=false;locationIsCached=false;locationReadOnly=!assessGridFix(la,lo,acc,timestamp).canConfirm;optionalHidden("#retry",true);optionalHidden("#approxloc",true);optionalHidden("#lastloc",true);optionalHidden("#forgetloc",true);optionalText("#locationstate",locationReadOnly?"Browsing only · the location is too uncertain or close to a grid edge to enable sharing.":"");optionalHidden("#browse-area",false);optionalHidden("#locretry",false);optionalHidden("#forgetactive",true);const retryButton=$("#locretry");if(retryButton){retryButton.disabled=false;retryButton.textContent="Locate"}const intro=introLocationVisible(),introText=$("#itext"),pinSlot=$("#pinslot");setPos(la,lo,acc,timestamp);applyInviteGrid();if(!started){started=1;
 if(introText)introText.style.opacity=0;render();
 const bp=$("#intro-pin"),a=bp?.getBoundingClientRect(),b=pinSlot?.getBoundingClientRect();
 if(bp&&a&&b.width&&a.width)requestAnimationFrame(()=>{bp.style.transform=`translate(${b.left+b.width/2-a.left-a.width/2}px,${b.top+b.height/2-a.top-a.height/2}px) scale(${b.width/a.width})`});
 setTimeout(()=>{if(pinSlot)pinSlot.style.visibility="visible";const introEl=$("#intro");if(introEl)introEl.style.opacity=0;nameArea();setTimeout(()=>{const currentIntro=$("#intro");if(currentIntro)currentIntro.remove();maybeOpenBusinessWizard()},700)},1050)}else{render();nameArea();maybeOpenBusinessWizard()}
 startWatching()}
async function nameArea(){const k=here;if(!k)return;let a=S.areas[k];
 if(!a){try{const[q,r]=k.split(",").map(Number),[gx,gy]=hexC(q,r),gridLat=(2*Math.atan(Math.exp(gy/R0))-Math.PI/2)*180/Math.PI,gridLon=gx/R0*180/Math.PI;const j=await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=en&lat=${gridLat}&lon=${gridLon}`)).json(),d=j.address||{};
  a={p:d.neighbourhood||d.suburb||d.quarter||d.city_district||d.residential||d.village||"",c:d.city||d.town||d.municipality||d.state_district||d.county||""};S.areas[k]=a;save()}catch(e){a={p:"",c:""}}}
 if(k!==here)return;areaName=a.p||a.c||"Your area";const areaEl=$("#area"),cityEl=$("#city");if(areaEl)areaEl.textContent=areaName;if(cityEl)cityEl.textContent=locationIsManual?"Chosen place · read only":locationIsCached?`Last known · ${ageText(getLastGrid()?.t)} · read only`:locationReadOnly?"Location uncertain · read only":a.p&&a.c?a.c+" · ":"";if(mode==="list")renderList();else bar()}
function setPos(la,lo,acc,timestamp=Date.now()){const now=Date.now();
 if(last){const d=Math.hypot((lo-last[1])*111320*Math.cos(la*Math.PI/180),(la-last[0])*110540),dt=Math.max((now-last[2])/1000,1);if(d>500&&d/dt>85){untrust=now+30000;toast("Location jumped unrealistically. Reading is paused for 30 s.")}}
 last=[la,lo,now];pos=[la,lo];locationIsManual=false;locationIsCached=false;
 const[X,Y]=merc(la,lo),h=hexOf(X,Y).join(","),moved=h!==here;
 locationFix=assessGridFix(la,lo,acc,timestamp);locationReadOnly=!locationFix.canConfirm;
 if(locationReadOnly){sharedAssignedGrid=null;sharedAssignmentPendingGrid=null;sharedAssignmentSequence++}
 if(locationFix.canConfirm)try{localStorage.setItem(locationCacheKey(),JSON.stringify({id:h,t:now}))}catch(e){}
 if(!here){here=h;viewHex=h}else if(moved){if(viewHex===here)viewHex=h;here=h}
 if(!M.X){M.X=X;M.Y=Y}
 if(realAuth&&locationFix.canConfirm&&(moved||sharedAssignedGrid!==h))void assignSharedGrid(la,lo,acc,h,timestamp);
 if(started&&moved)nameArea()
 if(started&&moved){if(mode==="map")drawMap();else render()}}
const trusted=()=>Date.now()>untrust;
/* ---------- navigation ---------- */
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{if(b.dataset.m==="map"&&!pos){toast("Find your grid to open the live map.");return}mode=b.dataset.m;render()});
$("#bell").onclick=()=>{mode="list";tab="alerts";render()};
function render(){document.querySelectorAll(".seg button").forEach(b=>{const active=b.dataset.m===mode;b.classList.toggle("on",active);b.setAttribute("aria-pressed",String(active))});
 const un=S.notes.filter(n=>!n.done).length+S.gridNotifications.filter(n=>!n.read).length;$("#bd").hidden=!un;$("#bd").textContent=un;
 mode==="map"?renderMap():renderList()}
const sharedGridCache=new Set(),sharedGridLoads=new Map();let sharedFollowsLoaded=false,sharedSeedsLoaded=false,sharedAssignedGrid=null,sharedAssignmentPendingGrid=null,sharedAssignmentSequence=0,moderatorChecked=false,isModerator=false;
function sharedReady(){return realAuth&&!!authClient}
function sharedError(error,fallback){console.warn(fallback,error);toast(fallback)}
async function refreshSharedSeeds(){if(!sharedReady()||sharedSeedsLoaded)return;const epoch=activeSharedEpoch;const{data,error}=await authClient.rpc("refresh_my_thought_seeds");if(error)throw error;if(epoch!==activeSharedEpoch)return;S.credits=Number(data)||0;sharedSeedsLoaded=true;save()}
async function refreshSharedFollows(force=false){if(!sharedReady()||sharedFollowsLoaded&&!force)return;const epoch=activeSharedEpoch;const{data,error}=await authClient.from("grid_subscriptions").select("grid_id,label,created_at").order("created_at",{ascending:true});if(error)throw error;if(epoch!==activeSharedEpoch)return;S.subscriptions=(data||[]).map((row,index)=>({gridId:row.grid_id,label:row.label||`Saved grid ${index+1}`,createdAt:Date.parse(row.created_at)||Date.now()}));sharedFollowsLoaded=true;save()}
async function refreshSharedGrid(gridId){
 if(!sharedReady()||!gridId||sharedGridCache.has(gridId))return;
 if(sharedGridLoads.has(gridId))return sharedGridLoads.get(gridId);
 const epoch=activeSharedEpoch;
 const task=(async()=>{
  const[thoughtResult,issueResult,offerResult]=await Promise.all([
   authClient.from("thoughts").select("id,grid_id,author_id,body,emoji,moderation_status,created_at").eq("grid_id",gridId).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(TPC),
   authClient.from("grid_issues").select("id,grid_id,author_id,category,body,image_path,moderation_status,created_at").eq("grid_id",gridId).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(40),
   authClient.from("offers").select("id,business_id,owner_id,grid_id,message,active_hours,moderation_status,starts_at,ends_at,created_at").eq("grid_id",gridId).gt("ends_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(40)
  ]);
  for(const result of [thoughtResult,issueResult,offerResult])if(result.error)throw result.error;
  if(epoch!==activeSharedEpoch)return;
  const offers=offerResult.data||[],businessIds=[...new Set(offers.map(row=>row.business_id))];
  let businesses=[];
  if(businessIds.length){const{data,error}=await authClient.from("business_profiles").select("id,public_name,category,latitude,longitude,verification_status").in("id",businessIds);if(error)throw error;businesses=data||[]}
  const byBusiness=new Map(businesses.map(row=>[row.id,row]));
  const issues=await Promise.all((issueResult.data||[]).map(async row=>{
   let image=null;if(row.image_path){const{data,error}=await authClient.storage.from("grid-issue-images").createSignedUrl(row.image_path,1800);if(!error)image=data?.signedUrl||null}
   return{id:row.id,category:row.category,txt:row.body,t:Date.parse(row.created_at)||Date.now(),image,moderationStatus:row.moderation_status,isMine:row.author_id===currentUserId}
  }));
  if(epoch!==activeSharedEpoch)return;
  const c=cell(gridId,true);
  c.th=(thoughtResult.data||[]).map(row=>({id:row.id,cat:"Thought",txt:row.body,emoji:row.emoji,votes:0,t:Date.parse(row.created_at)||Date.now(),isMine:row.author_id===currentUserId,moderationStatus:row.moderation_status}));
  c.issues=issues;
  c.ads=offers.filter(row=>byBusiness.has(row.business_id)).map(row=>{const business=byBusiness.get(row.business_id);return{id:row.id,businessId:row.business_id,name:business.public_name,msg:row.message,kind:business.category,lat:business.latitude,lon:business.longitude,starts:Date.parse(row.starts_at),exp:Date.parse(row.ends_at),openTime:row.active_hours?.open,closeTime:row.active_hours?.close,timeZone:row.active_hours?.timezone||"Asia/Kolkata",moderationStatus:row.moderation_status,businessStatus:business.verification_status,isMine:row.owner_id===currentUserId}});
  sharedGridCache.add(gridId);
 })().finally(()=>{if(sharedGridLoads.get(gridId)===task)sharedGridLoads.delete(gridId)});
 sharedGridLoads.set(gridId,task);try{await task}catch{if(epoch===activeSharedEpoch)toast("Shared activity couldn’t load. Check your connection and retry.")}
}
async function refreshVisibleSharedData(){
 const grid=viewHex||here;if(!sharedReady()||!grid||document.hidden||sharedRefreshBusy)return;
 const epoch=activeSharedEpoch;sharedRefreshBusy=true;sharedGridCache.delete(grid);sharedSeedsLoaded=false;
 try{await refreshSharedView(grid)}finally{if(epoch===activeSharedEpoch)sharedRefreshBusy=false}
}
async function refreshBusinessReviewQueue(){
 if(!sharedReady()||!isModerator)return;
 const epoch=activeSharedEpoch;
 const{data,error}=await authClient.from("offers").select("id,business_id,grid_id,message,active_hours,moderation_status,created_at").in("moderation_status",["pending_review","approved"]).gt("ends_at",new Date().toISOString()).order("created_at",{ascending:true}).limit(100);
 if(error)throw error;
 const ids=[...new Set((data||[]).map(row=>row.business_id))];let names=[];
 if(ids.length){const result=await authClient.from("business_profiles").select("id,public_name,category,latitude,longitude").in("id",ids);if(result.error)throw result.error;names=result.data||[]}
 if(epoch!==activeSharedEpoch)return;
 const byId=new Map(names.map(row=>[row.id,row]));S.businessReviewQueue=(data||[]).map(row=>({...row,business:byId.get(row.business_id)})).filter(row=>row.business);
}
async function removeOwnBusiness(businessId){
 if(!realAuth||!confirm("Remove this business listing and its updates? This cannot be undone."))return;
 const{data,error}=await authClient.from("business_profiles").delete().eq("id",businessId).select("id").single();
 if(error||!data)return toast("Your listing could not be removed. Please retry.");
 sharedGridCache.clear();await refreshSharedGrid(viewHex||here);renderList();toast("Your business listing was removed.");
}
async function reviewBusinessOffer(id,action){
 const{error}=await authClient.rpc("review_business_offer",{p_offer_id:id,p_action:action});
 if(error)return toast("That business review could not be saved.");
 await refreshBusinessReviewQueue();sharedGridCache.clear();if(viewHex||here)await refreshSharedGrid(viewHex||here);renderList();toast(action==="approve"?"Business update approved.":"Business update hidden.");
}
async function refreshModeratorStatus(){if(!sharedReady()||moderatorChecked)return;const epoch=activeSharedEpoch;const{data,error}=await authClient.rpc("moderator_access_status");if(error)throw error;if(epoch!==activeSharedEpoch)return;isModerator=data===true;moderatorChecked=true;if(isModerator)await Promise.all([refreshModerationQueue(),refreshBusinessReviewQueue()])}
async function refreshModerationQueue(){if(!sharedReady()||!isModerator)return;const epoch=activeSharedEpoch;const{data:reports,error}=await authClient.from("reports").select("id,thought_id,issue_id,reason,details,created_at").eq("status","pending").order("created_at",{ascending:true}).limit(100);if(error)throw error;const rows=reports||[],thoughtIds=rows.map(r=>r.thought_id).filter(Boolean),issueIds=rows.map(r=>r.issue_id).filter(Boolean);let thoughts=[],issues=[];if(thoughtIds.length){const result=await authClient.from("thoughts").select("id,grid_id,body,emoji,moderation_status").in("id",thoughtIds);if(result.error)throw result.error;thoughts=result.data||[]}if(issueIds.length){const result=await authClient.from("grid_issues").select("id,grid_id,body,category,moderation_status").in("id",issueIds);if(result.error)throw result.error;issues=result.data||[]}const targets=new Map([...thoughts.map(x=>[x.id,{...x,targetType:"thought"}]),...issues.map(x=>[x.id,{...x,targetType:"issue"}])]);const pending=await authClient.from("grid_issues").select("id,grid_id,body,category,moderation_status,created_at").eq("moderation_status","pending_review").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:true}).limit(100);if(pending.error)throw pending.error;if(epoch!==activeSharedEpoch)return;const reported=new Set(rows.map(r=>r.issue_id));S.moderationQueue=[...(pending.data||[]).filter(row=>!reported.has(row.id)).map(row=>({id:`pending-${row.id}`,issue_id:row.id,reason:"New issue awaiting review",created_at:row.created_at,target:{...row,targetType:"issue"}})),...rows.map(r=>({...r,target:targets.get(r.thought_id||r.issue_id)})).filter(r=>r.target)]}
async function refreshSharedView(gridId){if(!sharedReady())return;const epoch=activeSharedEpoch;try{await Promise.all([refreshSharedFollows(),refreshSharedGrid(gridId),refreshSharedSeeds(),refreshModeratorStatus()]);if(epoch!==activeSharedEpoch)return;if((viewHex||here)===gridId&&mode==="list")renderList();else if(mode==="map")drawMap()}catch(error){if(epoch===activeSharedEpoch)sharedError(error,"Your shared activity couldn’t load. Please retry.")}}
async function assignSharedGrid(lat,lng,accuracy,expectedGrid,observedAt=Date.now()){if(!sharedReady()||!locationFix?.canConfirm||sharedAssignedGrid===expectedGrid||sharedAssignmentPendingGrid===expectedGrid)return;const sequence=++sharedAssignmentSequence;sharedAssignmentPendingGrid=expectedGrid;sharedAssignedGrid=null;try{const{data,error}=await authClient.functions.invoke("assign-home-grid",{body:{lat,lng,accuracy,observedAt}});if(sequence!==sharedAssignmentSequence)return;if(error)throw error;if(!data?.gridId||data.gridId!==expectedGrid)throw Error("The server and device selected different grids.");sharedAssignedGrid=data.gridId;sharedGridCache.delete(data.gridId);await refreshSharedView(data.gridId);if(mode==="list")renderList()}catch(error){if(sequence!==sharedAssignmentSequence)return;sharedAssignedGrid=null;locationReadOnly=true;sharedError(error,"We couldn’t confirm your grid with the pilot service. You can browse, but sharing is paused.");render()}finally{if(sequence===sharedAssignmentSequence)sharedAssignmentPendingGrid=null}}
async function reportContent(type,id){if(!realAuth)return toast("Reporting is available to pilot members only.");const details=prompt("Tell the moderators why this should be reviewed (optional):")??null;if(details===null)return;const values=type==="thought"?{thought_id:id,reason:"other",details:details.slice(0,400)}:{issue_id:id,reason:"other",details:details.slice(0,400)};const{error}=await authClient.from("reports").insert(values);if(error)return sharedError(error,"This item could not be reported. You may have already reported it.");toast("Report sent to the pilot moderators.")}
async function deleteOwnContent(type,id){if(!realAuth||!confirm("Delete this contribution? This cannot be undone."))return;const{error}=await authClient.functions.invoke("delete-own-content",{body:{contentType:type,contentId:id}});if(error)return sharedError(error,"This contribution could not be deleted.");sharedGridCache.delete(viewHex||here);await refreshSharedGrid(viewHex||here);renderList();toast("Contribution deleted.")}
async function moderateContent(targetType,targetId,action){const{error}=await authClient.functions.invoke("moderate-content",{body:{targetType,targetId,action}});if(error)return sharedError(error,"That moderation action could not be applied.");await refreshModerationQueue();sharedGridCache.clear();if(viewHex||here)await refreshSharedGrid(viewHex||here);renderList();toast(action==="hide"?"Content hidden from the pilot feed.":"Content published to the pilot feed.")}
/* ---------- list mode: explore nearby, contribute in your own grid ---------- */
function renderList(){
 const target=viewHex||here,local=!!here&&target===here,canAct=local&&canContributeToGrid(here),c=cell(target,local),alerts=tab==="alerts",subscription=S.subscriptions.find(s=>s.gridId===target);if(realAuth&&target&&(!sharedGridCache.has(target)||!sharedFollowsLoaded||!sharedSeedsLoaded||!moderatorChecked)&&!sharedGridLoads.has(target))refreshSharedView(target);
 if(local&&!canAct)optionalHidden("#locretry",false);
 let h=`<div class="list"><div class="listhead"><div><h1>${alerts?"Alerts":tab==="moderation"?"Review reports":local?(locationIsManual?"Browsing neighborhood":locationIsCached||locationReadOnly?"Nearby area":"Your neighborhood"):here?"Exploring nearby":"Shared neighborhood"}</h1><div class="sub">${alerts?"Grid updates and account activity":tab==="moderation"?"Pilot member reports and flagged contributions":local?(locationIsManual?"Chosen place · read-only":locationIsCached?`Last known · ${ageText(getLastGrid()?.t)} · read-only`:locationReadOnly?"Location uncertain · read-only":esc(areaName||"A small place, shared")):here?"Showing this selected grid · read-only":"Shared grid · read-only"}</div></div><div class="head-actions">${alerts?'<button class="btn" id="homefeed">Back to your grid</button>':`<div class="grid-actions"><div class="grid-actions-main"><button class="btn follow-action ${subscription?"is-following":"p"}" id="follow" aria-pressed="${subscription?"true":"false"}" aria-label="${subscription?"Unfollow this grid":"Follow this grid"}">${subscription?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10 3.4 3.4 7.6-7.2"/></svg><span>Following</span>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v13M3.5 10h13"/></svg><span>Follow grid</span>'}</button><button class="btn share-action" id="sharegrid" aria-label="Share this grid"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3.5m0 0L6.5 7M10 3.5 13.5 7M4 10.5v5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-5"/></svg><span>Share</span></button></div>${local?"":`<button class="mygrid-link" id="mygrid"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4m0 0 4-4m-4 4 4 4"/></svg><span>Return to my grid</span></button>`}</div>`}<button class="btn" id="refresh-feed">Refresh</button>${isModerator?'<button class="btn" id="moderation-open">Review submissions</button>':""}</div></div>`;
 if(alerts){
  const unread=S.gridNotifications.filter(n=>!n.read).length;
  h+=`<section class="alert-section"><div class="row"><h2>Followed grids <span class="mute">${S.subscriptions.length}/6</span></h2></div><p class="sub">Save up to six grids and give each one a name you’ll recognize.</p><p class="testnote">Browser alerts are a local preview. Shared updates and push notifications are not connected yet.</p>`;
  if(!S.subscriptions.length)h+='<div class="feedempty">No grids followed yet. Open a grid and choose “Follow this grid”.</div>';
  else{h+='<div class="following-list">'+S.subscriptions.map((s,i)=>`<div class="follow-row"><input data-label="${i}" aria-label="Name for followed grid" maxlength="32" value="${esc(s.label)}"><button class="btn" data-unfollow="${i}">Unsubscribe</button></div>`).join("")+'</div>'}
  h+=`</section><section class="alert-section"><div class="row"><h2>Updates ${unread?`<span class="mute">${unread} new</span>`:""}</h2>${unread?'<button class="btn" id="readall">Mark all read</button>':""}</div>`;
  const updates=S.gridNotifications.slice().reverse().slice(0,60);
  h+=updates.map(n=>`<article class="card notification ${n.read?"":"unread"}"><div class="body"><div><b>${esc(S.subscriptions.find(s=>s.gridId===n.gridId)?.label||"Followed grid")}</b><span class="mute"> · ${when(n.createdAt)}</span></div><div style="margin-top:5px">${esc(n.body)}</div></div><button class="btn" data-openupdate="${esc(n.gridId)}">Open</button></article>`).join("")||'<div class="feedempty">No grid updates yet.</div>';
  h+=`</section><section class="alert-section"><h2>Other alerts</h2>`;
  h+=S.notes.length?S.notes.slice().reverse().map(n=>`<div class="card">${esc(n.text)}</div>`).join(""):'<div class="sub">No other alerts.</div>';
  h+='</section>';
 } else if(tab==="moderation") {
  const queue=S.moderationQueue||[];h+='<section class="alert-section"><h2>Open reports</h2>';
  h+=queue.length?queue.map(row=>{const targetRow=row.target,content=targetRow.targetType==="thought"?`${targetRow.emoji||""} ${targetRow.body}`:targetRow.body,kind=targetRow.targetType==="thought"?"Thought":"Local issue",status=targetRow.moderation_status;return `<article class="card notification"><div><div class="thoughtmeta"><span class="tag">${kind}</span><span class="mute">${esc(row.reason)} · grid ${esc(targetRow.grid_id)}</span></div><div class="thoughtbody">${esc(content)}</div>${row.details?`<p class="mute">${esc(row.details)}</p>`:""}<p class="mute">Reported ${when(Date.parse(row.created_at))} · ${status}</p></div><div class="row">${status!=="hidden"?`<button class="btn" data-mod-target="${row.thought_id||row.issue_id}" data-mod-type="${targetRow.targetType}" data-mod-action="hide">Hide</button>`:""}${status!=="published"?`<button class="btn p" data-mod-target="${row.thought_id||row.issue_id}" data-mod-type="${targetRow.targetType}" data-mod-action="publish">Publish</button>`:""}</div></article>`}).join(""):'<div class="feedempty">No open reports.</div>';
  h+='</section><section class="alert-section"><h2>Business submissions</h2><p class="sub">Review the public name, pin, hours and offer. Approval is not proof of ownership.</p>';
  const businesses=S.businessReviewQueue||[];
  h+=businesses.length?businesses.map(row=>`<article class="card"><div class="thoughtmeta"><span class="tag">${esc(row.moderation_status)}</span><span class="mute">Grid ${esc(row.grid_id)}</span></div><h3>${esc(row.business.public_name)}</h3><p>${esc(row.message)}</p><p class="mute">${esc(row.active_hours?.open||"")}–${esc(row.active_hours?.close||"")} · Asia/Kolkata</p><a class="btn" target="_blank" rel="noopener noreferrer" href="${directionsUrl(`${row.business.latitude},${row.business.longitude}`)}">Review public pin</a><div class="row" style="margin-top:12px">${row.moderation_status!=="approved"?`<button class="btn p" data-business-review="${esc(row.id)}" data-business-action="approve">Approve update</button>`:""}<button class="btn" data-business-review="${esc(row.id)}" data-business-action="hide">Hide update</button></div></article>`).join(""):'<div class="feedempty">No business submissions to review.</div>';
  h+='</section>';
 } else {
  const offers=c.ads.filter(a=>adAvailable(a)||(a.isMine&&a.exp>Date.now())).slice(0,40);
  const contributions=[
   ...c.th.map(t=>({kind:"thought",t,at:t.t||0})),
   ...c.issues.map(i=>({kind:"issue",i,at:i.t||0})),
   ...offers.map(a=>({kind:"business",a,at:a.starts||0}))
  ].sort((a,b)=>b.at-a.at);
  if(local){
   h+=`<button class="add-trigger" id="add-toggle" type="button" aria-expanded="${composerOpen}"><span class="add-trigger-icon" aria-hidden="true">+</span><span>Add to this grid</span></button>`;
   if(composerOpen){h+=`<section class="contribute"><div class="kindpick" role="group" aria-label="Choose what to add"><button class="chip ${composerKind==="issue"?"on":""}" data-kind="issue">Issue</button><button class="chip ${composerKind==="business"?"on":""}" data-kind="business">Business</button><button class="chip ${composerKind==="thought"?"on":""}" data-kind="thought">Thought</button></div>`;
   if(composerKind==="business"){
    const businessHold=canAct?"":locationHoldReason();
    h+=`<div class="note">Business updates belong to one grid and are labeled separately from civic issues and thoughts.</div>${realAuth?'<div class="note">Register your business and submit a free update. It appears to neighbors after moderator approval.</div>':""}${businessHold?`<div class="note" role="status">${businessHold}</div>`:""}<button class="btn p" id="businessstart" type="button" ${canAct?"":"disabled"}>Register a business update</button>`;
   } else if(composerKind==="issue") {
    h+=`<div class="issue-help"><img src="./assets/local-issue-example.webp" alt="Example illustration of neighbors photographing a small pothole" loading="lazy"><p>Example only. A clear, current photo can help make the issue easier to understand.</p></div><label class="fieldlbl" for="icategory">What needs attention?</label><select id="icategory"><option value="roads_paths">Roads & paths</option><option value="water">Water</option><option value="waste">Waste</option><option value="lighting">Lighting</option><option value="accessibility">Accessibility</option><option value="safety">Safety</option><option value="other">Other</option></select><label class="fieldlbl" for="tx">Add a short note</label><textarea id="tx" rows="3" maxlength="400" placeholder="What did you notice, and where in this grid?" aria-label="Describe a local issue"></textarea><label class="issue-photo fieldlbl" for="issue-photo">Add a photo <span class="mute">(optional)</span><input id="issue-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><span class="mute">${realAuth?"A small, cropped WebP is stored privately with this report.":"A small, cropped copy is kept in this browser preview."} Avoid faces, number plates, and private details.</span><span id="photo-preview"></span></label><div class="composerow"><span class="mute">${canAct?realAuth?"New issues wait for review":"Local preview only":esc(locationHoldReason())}</span><button class="btn p" id="share-issue" ${canAct?"":"disabled"}>Raise issue</button></div>`;
   } else {
    const ok=canAct&&S.credits>0;
    h+=`<textarea id="tx" rows="2" maxlength="140" placeholder="What’s one thing nearby people should know?" aria-label="Share a thought"></textarea><div class="composerow"><div class="emojis" aria-label="Add an emoji">${["🙂","💭","✨","😔","☕"].map(x=>`<button type="button" class="emojibtn ${composerEmoji===x?"on":""}" data-emoji="${x}" aria-label="Add ${x}" aria-pressed="${composerEmoji===x}">${x}</button>`).join("")}<span class="seedhint">${S.credits} seed${S.credits===1?"":"s"}</span></div><button class="btn p" id="post" ${ok?"":"disabled"}>Share thought</button></div>${!canAct?`<div class="note">${esc(locationHoldReason())}</div>`:!S.credits?'<div class="note">Your next thought seed arrives tomorrow.</div>':""}`;
   }
   h+=`</section>`;}
  } else h+='<div class="note">You’re exploring this grid. Contributions are read-only outside your current grid.</div>';
   h+=`<div class="feedlabel">Grid activity <span class="scope">${local?(locationIsManual?"Browsing · read only":"Your grid"):"Selected grid"}</span></div>`;
  if(!contributions.length){if(local)h+=`<figure class="feedempty local-empty"><img src="./assets/neighborhood-grid-story.webp" alt="Illustration of ordinary neighborhood life arranged within local hexagonal grid cells" loading="lazy"><div><b>Small things start close to home.</b><p>Thoughts, local issues, and nearby places belong to the grid where they happen.</p><small>Illustration · The highlighted cells are not live activity.</small></div></figure>`;else h+='<div class="feedempty">Nothing has been shared in this grid yet.</div>'}
  contributions.forEach((item,i)=>{
   if(item.kind==="issue"){
    const x=item.i,photo=typeof x.image==="string"&&(/^(?:data:image\/(?:webp|jpeg|png);base64,|https:\/\/)/.test(x.image))?`<img src="${esc(x.image)}" alt="Photo attached to local issue" loading="lazy">`:"",status=x.moderationStatus==="pending_review"?'<span class="mute">Awaiting review</span>':"";
    h+=`<article class="issue-item contribution issue-card"><div class="thoughtmeta"><span class="tag">Local issue</span><span class="issue-cat">${esc(issueLabel(x.category))}</span><span class="mute">${when(x.t)}</span>${status}</div><div class="thoughtbody">${esc(x.txt)}</div>${photo}${realAuth&&x.isMine?`<button class="btn" data-delete-content-type="issue" data-delete-content-id="${esc(x.id)}">Delete my issue</button>`:""}${realAuth&&!x.isMine&&x.moderationStatus!=="pending_review"?`<button class="btn" data-report-type="issue" data-report-id="${esc(x.id)}">Report</button>`:""}</article>`;
   } else if(item.kind==="business"){
    const a=item.a,dest=adDest(a,target);
    h+=`<article class="card ad contribution business-card"><div class="thoughtmeta"><span class="tag a">Local business</span><span class="mute">${a.moderationStatus==="pending_review"?"Awaiting review":a.moderationStatus==="paused"?"Hidden after review":adAvailable(a)?"Open now":"Outside opening hours"}</span></div><div class="t" style="margin:6px 0">${esc(a.name)}</div><div>${esc(a.msg)}</div><div class="row" style="margin-top:10px"><span class="mute">${a.kind==="street"?"Street vendor":"Nearby place"}</span><a class="btn" href="${directionsUrl(dest)}" target="_blank" rel="noopener noreferrer">Directions ↗</a></div>${realAuth&&a.isMine?`<button class="btn" data-remove-business="${esc(a.businessId)}">Remove my listing</button>`:""}</article>`;
   } else {
    const t=item.t;
    h+=`<article class="thought contribution thought-card"><div class="thoughtnum">${String(i+1).padStart(2,"0")}</div><div class="thoughtmain"><div class="thoughtmeta"><span class="tag">Thought</span><span class="mute">${when(t.t)}</span>${t.moderationStatus==="hidden"?'<span class="mute">Hidden after review</span>':""}</div><div class="thoughtbody">${t.emoji?`<span class="thoughtemoji">${esc(t.emoji)}</span> `:""}${esc(t.txt)}</div>${realAuth&&t.isMine?`<button class="btn" data-delete-content-type="thought" data-delete-content-id="${esc(t.id)}">Delete my thought</button>`:""}${realAuth&&!t.isMine?`<button class="btn" data-report-type="thought" data-report-id="${esc(t.id)}">Report</button>`:""}</div></article>`;
   }
  });
  h+=realAuth?'<p class="testnote">Shared neighborhood · thoughts are shared with signed-in members. Issues and business updates appear to others after review.</p>':'<p class="testnote">Prototype preview · contributions are saved only in this browser. They are not visible to other people yet.</p>';
 }
 $("#main").innerHTML=h+"</div>";
 const g=id=>document.getElementById(id);
 if(g("mygrid"))g("mygrid").onclick=()=>{if(!here){ask();return}viewHex=here;hoverHex=null;tab="feed";render()};if(g("add-toggle"))g("add-toggle").onclick=()=>{composerOpen=!composerOpen;render()};if(g("homefeed"))g("homefeed").onclick=()=>{tab="feed";render()};
 if(g("follow"))g("follow").onclick=()=>toggleGridFollow(target);
 if(g("refresh-feed"))g("refresh-feed").onclick=async event=>{const button=event.currentTarget;button.disabled=true;await refreshVisibleSharedData();button.disabled=false};
 if(g("moderation-open"))g("moderation-open").onclick=async()=>{tab="moderation";await Promise.all([refreshModerationQueue(),refreshBusinessReviewQueue()]);renderList()};
 document.querySelectorAll("[data-report-id]").forEach(button=>button.onclick=()=>reportContent(button.dataset.reportType,button.dataset.reportId));
 document.querySelectorAll("[data-delete-content-id]").forEach(button=>button.onclick=()=>deleteOwnContent(button.dataset.deleteContentType,button.dataset.deleteContentId));
 document.querySelectorAll("[data-remove-business]").forEach(button=>button.onclick=()=>removeOwnBusiness(button.dataset.removeBusiness));
 document.querySelectorAll("[data-business-review]").forEach(button=>button.onclick=()=>reviewBusinessOffer(button.dataset.businessReview,button.dataset.businessAction));
 document.querySelectorAll("[data-mod-target]").forEach(button=>button.onclick=()=>moderateContent(button.dataset.modType,button.dataset.modTarget,button.dataset.modAction));
 if(g("sharegrid"))g("sharegrid").onclick=()=>shareGrid(target);
 document.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>{composerKind=b.dataset.kind;composerOpen=true;render()});
 if(g("businessstart"))g("businessstart").onclick=()=>{if(!canContributeToGrid(here)){toast(locationHoldReason());if(!locationIsManual)ask();return}try{adSheet()}catch(err){console.error("Could not open the business update flow.",err);toast("The business form could not open. Please try again.")}};
 document.querySelectorAll("[data-label]").forEach(input=>input.onchange=async()=>{const sub=S.subscriptions[Number(input.dataset.label)];if(!sub)return;const label=input.value.trim().slice(0,32)||`Saved grid ${Number(input.dataset.label)+1}`;if(realAuth){const{error}=await authClient.from("grid_subscriptions").update({label}).eq("grid_id",sub.gridId);if(error)return sharedError(error,"Couldn’t rename that followed grid.")}sub.label=label;save();render()});
 document.querySelectorAll("[data-unfollow]").forEach(b=>b.onclick=()=>{const sub=S.subscriptions[Number(b.dataset.unfollow)];if(sub)removeGridFollow(sub.gridId)});
 document.querySelectorAll("[data-openupdate]").forEach(b=>b.onclick=()=>{const id=b.dataset.openupdate;S.gridNotifications.filter(n=>n.gridId===id).forEach(n=>n.read=true);viewHex=id;tab="feed";mode="list";save();render()});
 if(g("readall"))g("readall").onclick=()=>{S.gridNotifications.forEach(n=>n.read=true);save();render()};
 document.querySelectorAll("[data-emoji]").forEach(b=>b.onclick=()=>{composerEmoji=composerEmoji===b.dataset.emoji?null:b.dataset.emoji;document.querySelectorAll("[data-emoji]").forEach(x=>{x.classList.toggle("on",x===b&&!!composerEmoji);x.setAttribute("aria-pressed",String(x===b&&!!composerEmoji))})});
 if(g("issue-photo"))g("issue-photo").onchange=async e=>{const f=e.target.files?.[0],preview=g("photo-preview");issueDraftImage=null;if(!f){preview.innerHTML="";return}if(!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size>12*1024*1024){e.target.value="";preview.textContent="Choose a JPEG, PNG, or WebP image under 12 MB.";return}try{issueDraftImage=await compressIssueImage(f);preview.innerHTML=`<img src="${issueDraftImage}" alt="Cropped photo preview">`}catch(err){preview.textContent="This photo could not be prepared. Try a different image."}};
 if(g("share-issue"))g("share-issue").onclick=async()=>{if(!canContributeToGrid(here))return toast(locationHoldReason());const tx=g("tx").value.trim();if(!tx)return toast("Add a short note first");const button=g("share-issue");button.disabled=true;try{let imagePath=null;if(realAuth&&issueDraftImage)imagePath=await uploadIssueImage(issueDraftImage,here);if(realAuth){const{data,error}=await authClient.from("grid_issues").insert({grid_id:here,category:g("icategory").value,body:tx,image_path:imagePath}).select("id").single();if(error){if(imagePath)await authClient.storage.from("grid-issue-images").remove([imagePath]);throw error}void data;sharedGridCache.delete(here);await refreshSharedGrid(here);await refreshSharedFollows();toast("Issue submitted · it will appear to neighbors after review")}else{cell(here,true).issues.push({id:here+"i"+Date.now(),category:g("icategory").value,txt:tx,t:Date.now(),image:issueDraftImage});save();toast("Issue added to this browser preview")}issueDraftImage=null;render()}catch(error){sharedError(error,"The issue could not be saved. Please try again.")}finally{if(button.isConnected)button.disabled=false}};
 if(g("post"))g("post").onclick=async()=>{if(!canContributeToGrid(here))return toast(locationHoldReason());const tx=g("tx").value.trim();if(!tx)return toast("Write a thought first");if(!S.credits)return toast("Your next seed arrives tomorrow");const button=g("post");button.disabled=true;try{if(realAuth){const{error}=await authClient.from("thoughts").insert({grid_id:here,body:tx,emoji:composerEmoji});if(error)throw error;sharedGridCache.delete(here);await refreshSharedGrid(here);sharedSeedsLoaded=false;await refreshSharedSeeds();toast("Thought shared with your pilot neighborhood")}else{if(c.th.length>=TPC){const z=c.th.slice().sort((a,b)=>a.t-b.t)[0];c.th.splice(c.th.indexOf(z),1)}c.th.push({id:here+"u"+Date.now(),cat:"Thought",txt:tx,emoji:composerEmoji,votes:0,t:Date.now()});S.credits--;save();toast("Thought added to this browser preview")}composerEmoji=null;render()}catch(error){sharedError(error,"The thought could not be shared. Check your seed balance and try again.")}finally{if(button.isConnected)button.disabled=false}};
 document.querySelectorAll("[data-keep]").forEach(b=>b.onclick=()=>resolve(b.dataset.keep,true));document.querySelectorAll("[data-let]").forEach(b=>b.onclick=()=>resolve(b.dataset.let,false))}
function compressIssueImage(file){return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{const max=512,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d",{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);const data=canvas.toDataURL("image/webp",.68);if(data.length>160000)return reject(Error("image exceeds local preview limit"));resolve(data)};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error("bad image"))};image.src=url})}
async function uploadIssueImage(dataUrl,gridId){const match=dataUrl.match(/^data:image\/webp;base64,(.+)$/);if(!match)throw Error("The prepared image is invalid.");const bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0)),path=`${storageKey.replace("gs2_user_","")}/${gridId}/${crypto.randomUUID()}.webp`,{error}=await authClient.storage.from("grid-issue-images").upload(path,new Blob([bytes],{type:"image/webp"}),{contentType:"image/webp",upsert:false});if(error)throw error;return path}
function shareGrid(id){const url=new URL(location.href);url.searchParams.set("grid",id);const title="Thotox · Neighborhood grid";const text=`Open grid ${id} on Thotox.`;if(navigator.share){navigator.share({title,text,url:url.toString()}).catch(()=>{})}else if(navigator.clipboard?.writeText){navigator.clipboard.writeText(url.toString()).then(()=>toast("Grid invite link copied")).catch(()=>toast(url.toString()))}else toast(url.toString())}
function issueLabel(value){return ({roads_paths:"Roads & paths",water:"Water",waste:"Waste",lighting:"Lighting",accessibility:"Accessibility",safety:"Safety",other:"Other"})[value]||"Other"}
function activityCount(c,cutoff=Date.now()-7*864e5){return c.th.filter(x=>(x.t||0)>=cutoff).length+c.issues.filter(x=>(x.t||0)>=cutoff).length+c.ads.filter(x=>(x.starts||0)>=cutoff&&x.exp>Date.now()).length}
function activityLevel(count){return count<1?0:count<3?1:count<6?2:3}

const MAX_FOLLOWED_GRIDS=6;
async function toggleGridFollow(id){const old=S.subscriptions.find(s=>s.gridId===id);if(old)return removeGridFollow(id);if(S.subscriptions.length>=MAX_FOLLOWED_GRIDS){toast(`You can follow up to ${MAX_FOLLOWED_GRIDS} grids.`);return}const label=id===here?"My neighborhood":`Saved grid ${S.subscriptions.length+1}`;if(realAuth){const{error}=await authClient.from("grid_subscriptions").insert({grid_id:id,label});if(error)return sharedError(error,"This grid could not be followed. You may already follow six grids.");await refreshSharedFollows(true)}else{S.subscriptions.push({gridId:id,label,createdAt:Date.now()});save()}toast("Grid followed");render()}
async function removeGridFollow(id){if(realAuth){const{error}=await authClient.from("grid_subscriptions").delete().eq("grid_id",id);if(error)return sharedError(error,"That grid could not be unfollowed.");await refreshSharedFollows(true)}else{S.subscriptions=S.subscriptions.filter(s=>s.gridId!==id);save()}render()}

/* ---------- map mode (real OSM tiles, limited to 20 km around you) ---------- */
let tiles={},drag=null,raf=0,wl=0,zoomTween=null,zoomTimer=0,mapMarkers=[],LAND=[],LAND_LAT_EDGES=[],LAND_PARITY=new Uint8Array(0),LAND_MARKS=new Uint32Array(0),LAND_QUERY=0,LAND_CACHE=new Map(),landReady=false,landFailed=false;
const mpp=()=>156543.03392/2**M.z;
async function loadLandMask(){try{
 const r=await fetch("./landmask.json.gz");if(!r.ok)throw Error("land mask unavailable");
 const stream=r.body.pipeThrough(new DecompressionStream("gzip"));LAND=await new Response(stream).json();
 LAND_LAT_EDGES=Array.from({length:90},()=>[]);LAND_PARITY=new Uint8Array(LAND.length);LAND_MARKS=new Uint32Array(LAND.length);
 for(let r=0;r<LAND.length;r++){const p=LAND[r][5];for(let i=0;i<p.length-2;i+=2){const y1=p[i+1],y2=p[i+3];if(y1===y2)continue;
   const b0=Math.max(0,Math.floor((Math.min(y1,y2)+90)/2)),b1=Math.min(89,Math.floor((Math.max(y1,y2)+90)/2));for(let b=b0;b<=b1;b++)LAND_LAT_EDGES[b].push(r,i)}}
 }catch(e){landFailed=true;toast("Land boundary data couldn’t load. Check your connection and reload.")}
 landReady=true;applyInviteGrid();if(mode==="map"){drawMap();bar()}else if(started)renderList()}
function isLand(lon,lat){if(!landReady||landFailed)return false;const band=Math.max(0,Math.min(89,Math.floor((lat+90)/2))),edges=LAND_LAT_EDGES[band];let q=++LAND_QUERY;if(q>=0xffffffff){LAND_MARKS.fill(0);LAND_QUERY=q=1}const touched=[];
 for(let j=0;j<edges.length;j+=2){const r=edges[j],i=edges[j+1],p=LAND[r][5],x1=p[i],y1=p[i+1],x2=p[i+2],y2=p[i+3];if((y1>lat)!==(y2>lat)){const cross=x1+(lat-y1)*(x2-x1)/(y2-y1);if(lon<cross){if(LAND_MARKS[r]!==q){LAND_MARKS[r]=q;LAND_PARITY[r]=1;touched.push(r)}else LAND_PARITY[r]^=1}}}
 let winding=0;for(const r of touched)if(LAND_PARITY[r])winding+=LAND[r][4];return winding!==0}
function landAtMerc(X,Y){const lon=X/R0*180/Math.PI,lat=(2*Math.atan(Math.exp(Y/R0))-Math.PI/2)*180/Math.PI;return isLand(lon,lat)}
function isLandHex(id){if(id===here||id===viewHex)return true;if(!landReady||landFailed)return false;if(LAND_CACHE.has(id))return LAND_CACHE.get(id);const[q,r]=id.split(",").map(Number),[x,y]=hexC(q,r),yes=landAtMerc(x,y);LAND_CACHE.set(id,yes);return yes}
function clampM(){const[ux,uy]=merc(pos[0],pos[1]),L=MAXKM*1000/Math.cos(pos[0]*Math.PI/180),dx=M.X-ux,dy=M.Y-uy,d=Math.hypot(dx,dy);if(d>L){M.X=ux+dx*L/d;M.Y=uy+dy*L/d}}
function renderMap(){if(zoomTimer){clearTimeout(zoomTimer);zoomTimer=0}zoomTween=null;tiles={};
 $("#main").innerHTML=`<div id="mp"><div id="tiles"></div><div id="vignette"></div><svg id="hx"></svg><svg id="signal" aria-hidden="true"><polygon class="signal-ring"/><polygon class="signal-ring later"/></svg>
 <div class="ov zoom"><button id="zi" aria-label="Zoom in">+</button><button id="zo" aria-label="Zoom out">−</button><button id="loc" aria-label="Recenter">◎</button></div><button class="ov activity-toggle ${activityLayer?"on":""}" id="activity-toggle" aria-pressed="${activityLayer}">Activity</button><div class="ov activity-note" id="activity-note" ${activityLayer?"":"hidden"}>This browser · activity over 7 days</div>
 <div class="ov attr">© OpenStreetMap contributors · Natural Earth land mask · ${MAXKM} km</div><div class="ov legend" aria-label="Map key"><span><i class="homekey"></i>${locationReadOnly||locationIsCached?"Approximate":"You"}</span><span><i class="selectkey"></i>Selected</span><span><i></i>Business</span></div><div class="ov" id="pinpick" hidden><span><b>Place your business pin</b><br><small>Tap the exact spot on the map.</small></span><button class="btn" id="cancelpin">Cancel</button></div><div class="ov" id="bar"></div></div>`;
 const mp=$("#mp");
 $("#pinpick").hidden=!pickingPin;
 $("#cancelpin").onclick=()=>{pickingPin=false;mode=adOriginMode;render();adSheet()};
 $("#zi").onclick=()=>zoom(1);$("#zo").onclick=()=>zoom(-1);$("#loc").onclick=()=>{[M.X,M.Y]=merc(pos[0],pos[1]);viewHex=here;drawMap();bar()};$("#activity-toggle").onclick=e=>{activityLayer=!activityLayer;e.currentTarget.classList.toggle("on",activityLayer);e.currentTarget.setAttribute("aria-pressed",String(activityLayer));$("#activity-note").hidden=!activityLayer;drawMap();bar()};
 mp.onpointerdown=e=>{if(zoomTween||e.target.closest(".ov"))return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,originX:M.X,originY:M.Y,scale:mpp(),m:0,dx:0,dy:0};mp.setPointerCapture(e.pointerId)};
 mp.onpointermove=e=>{if(zoomTween)return;if(drag){drag.m+=Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;M.X=drag.originX-(e.clientX-drag.startX)*drag.scale;M.Y=drag.originY+(e.clientY-drag.startY)*drag.scale;clampM();drag.dx=(drag.originX-M.X)/drag.scale;drag.dy=(M.Y-drag.originY)/drag.scale;if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(!drag)return;for(const layer of [$("#tiles"),$("#hx"),$("#signal")])if(layer)layer.style.transform=`translate3d(${drag.dx}px,${drag.dy}px,0)`});return}
  if(e.pointerType!=="touch"&&!e.target.closest(".ov")){setHoverHex(hexAt(e.clientX,e.clientY))}};
 mp.onpointerleave=e=>{if(e.relatedTarget?.closest?.(".ov"))return;setHoverHex(null)};
 const finishDrag=e=>{if(!drag)return;const m=drag.m;drag=null;if(raf){cancelAnimationFrame(raf);raf=0}for(const layer of [$("#tiles"),$("#hx"),$("#signal")])if(layer)layer.style.transform="";if(m<8)tap(e);else drawMap()};
 mp.onpointerup=finishDrag;mp.onpointercancel=finishDrag;
 mp.onwheel=e=>{e.preventDefault();const t=Date.now();if(t-wl<110)return;wl=t;zoom(e.deltaY<0?1:-1,e.clientX,e.clientY)};
 drawMap();bar()}
function setHoverHex(id){if(id===hoverHex)return;const sv=$("#hx");sv?.querySelector(".hex.hover")?.classList.remove("hover");hoverHex=id;if(id)sv?.querySelector(`[data-cell="${id}"]`)?.classList.add("hover");bar()}
function zoom(d,clientX,clientY){const mp=$("#mp"),layers=[$("#tiles"),$("#hx"),$("#signal")];if(!mp||layers.some(x=>!x))return;
 if(!zoomTween){const rect=mp.getBoundingClientRect(),ax=clientX==null?rect.width/2:clientX-rect.left,ay=clientY==null?rect.height/2:clientY-rect.top;zoomTween={baseZ:M.z,baseX:M.X,baseY:M.Y,targetZ:M.z,ax,ay,width:rect.width,height:rect.height}}
 const state=zoomTween;state.targetZ=Math.min(16,Math.max(13,state.targetZ+d));const scale=2**(state.targetZ-state.baseZ);
 for(const layer of layers){layer.style.transformOrigin=`${state.ax}px ${state.ay}px`;layer.style.transition="transform 360ms cubic-bezier(.2,.72,.25,1)"}
 requestAnimationFrame(()=>{for(const layer of layers)layer.style.transform=`scale(${scale})`});
 clearTimeout(zoomTimer);zoomTimer=setTimeout(()=>{const done=zoomTween;if(!done)return;const changed=done.targetZ!==done.baseZ;if(changed){const a=156543.03392/2**done.baseZ,b=156543.03392/2**done.targetZ,dx=done.ax-done.width/2,dy=done.ay-done.height/2;M.X=done.baseX+dx*(a-b);M.Y=done.baseY+dy*(b-a);M.z=done.targetZ}zoomTween=null;zoomTimer=0;for(const layer of layers){layer.style.transition="none";layer.style.transform="none";layer.style.transformOrigin=""}if(changed){drawMap();bar()}},410)}
function hexAt(x,y){const r=$("#mp").getBoundingClientRect(),m=mpp(),[X,Y]=[M.X+(x-r.left-r.width/2)*m,M.Y-(y-r.top-r.height/2)*m],id=hexOf(X,Y).join(",");return isLandHex(id)?id:null}
function tap(e){const r=$("#mp").getBoundingClientRect(),m=mpp(),X=M.X+(e.clientX-r.left-r.width/2)*m,Y=M.Y-(e.clientY-r.top-r.height/2)*m,id=hexOf(X,Y).join(",");
 if(pickingPin){if(!isLandHex(id)){toast("Choose a spot on land.");return}const[ux,uy]=merc(pos[0],pos[1]),limit=MAXKM*1000/Math.cos(pos[0]*Math.PI/180);if(Math.hypot(X-ux,Y-uy)>limit){toast(`Choose a spot within ${MAXKM} km.`);return}adPin={lat:(2*Math.atan(Math.exp(Y/R0))-Math.PI/2)*180/Math.PI,lon:X/R0*180/Math.PI};if(adDraft)adDraft.picks=[id];pickingPin=false;mode=adOriginMode;render();adSheet();return}
 if(!isLandHex(id)){toast("There’s no neighborhood grid over open water.");return}viewHex=id;hoverHex=null;mode="list";tab="feed";page=0;render()}
function drawMap(){const mp=$("#mp");if(!mp)return;clampM();const w=mp.clientWidth,h=mp.clientHeight,m=mpp(),n=2**M.z,ts=2*HALF/n;
 $("#tiles").classList.toggle("dk",dark);
 const want=new Set(),x0=Math.floor((M.X-w/2*m+HALF)/ts),x1=Math.floor((M.X+w/2*m+HALF)/ts),y0=Math.floor((HALF-(M.Y+h/2*m))/ts),y1=Math.floor((HALF-(M.Y-h/2*m))/ts);
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){if(y<0||y>=n)continue;const xx=((x%n)+n)%n,k=M.z+"/"+x+"/"+y;want.add(k);
  let im=tiles[k];if(!im){im=tiles[k]=new Image();im.draggable=false;im.src=TILE(M.z,xx,y);$("#tiles").appendChild(im)}
  im.style.left=(w/2+(x*ts-HALF-M.X)/m)+"px";im.style.top=(h/2-((HALF-y*ts)-M.Y)/m)+"px"}
 for(const k in tiles)if(!want.has(k)){tiles[k].remove();delete tiles[k]}
 const R=RM/m,[q0,r0]=hexOf(M.X,M.Y),rad=Math.ceil(Math.max(w,h)/(R*S3))+2,showAds=M.z>=14,showCounts=M.z>=15,followingIds=new Set(S.subscriptions.map(x=>x.gridId)),updatedIds=new Set(S.gridNotifications.filter(x=>!x.read).map(x=>x.gridId));let s="",signalPts="";mapMarkers=[];
 for(let r=r0-rad;r<=r0+rad;r++)for(let q=q0-rad;q<=q0+rad;q++){const[hx,hy]=hexC(q,r),cx=w/2+(hx-M.X)/m,cy=h/2-(hy-M.Y)/m,id=q+","+r,knownGrid=id===here||id===viewHex;if(cx<-R*2||cx>w+R*2||cy<-R*2||cy>h+R*2||(!knownGrid&&!landAtMerc(hx,hy)))continue;
  const c=cell(id),level=activityLayer&&id!==here&&id!==viewHex&&id!==hoverHex?activityLevel(activityCount(c)):0,pts=[0,1,2,3,4,5].map(i=>{const a=Math.PI/180*(60*i-30);return(cx+R*Math.cos(a)).toFixed(1)+","+(cy+R*Math.sin(a)).toFixed(1)}).join(" ");
  s+=`<polygon class="hex ${id===here?(locationIsManual?"browse-center":"here"):""} ${id===viewHex?"view":""} ${id===hoverHex?"hover":""} ${followingIds.has(id)?"following":""} ${updatedIds.has(id)?"has-update":""} ${level?"activity-"+level:""}" data-cell="${id}" points="${pts}"/>`;
  if(id===here&&!locationIsManual)signalPts=pts;
  if(R>26&&showCounts&&activityLayer){const n=activityCount(c);if(n)s+=`<text class="hl" x="${cx.toFixed(1)}" y="${(cy+4).toFixed(1)}">${n}</text>`}
  if(R>26&&id!==here){const imgs=[...c.ads.filter(a=>a.imageUrl&&a.exp>Date.now()&&/^https:\/\//i.test(a.imageUrl)).map(a=>a.imageUrl),...c.issues.filter(i=>i.image&&i.moderationStatus!=="hidden"&&(/^(?:data:image\/webp;base64,|https:\/\/)/.test(i.image))).map(i=>i.image).map(imageUrl=>({imageUrl}))],thoughts=c.th.filter(t=>t.emoji&&t.moderationStatus!=="hidden");if(imgs.length||thoughts.length){const size=Math.min(34,Math.max(22,R*.8),R*1.15),ptsM=[0,1,2,3,4,5].map(i=>{const a=Math.PI/3*i-Math.PI/2;return(cx+size/2*Math.cos(a)).toFixed(1)+","+(cy+size/2*Math.sin(a)).toFixed(1)}).join(" ");mapMarkers.push({id,cx,cy,size,ptsM,off:Math.abs(hash(id)),imgs,thoughts})}}}
 if(pickingPin&&adPin){const[px,py]=merc(adPin.lat,adPin.lon);s+=`<circle cx="${w/2+(px-M.X)/m}" cy="${h/2-(py-M.Y)/m}" r="8" fill="${dark?"#f5f5f7":"#343438"}" stroke="${dark?"#111":"#fff"}" stroke-width="3"/>`}
 
 const sv=$("#hx");sv.classList.toggle("overview",M.z===13);sv.setAttribute("viewBox",`0 0 ${w} ${h}`);sv.innerHTML=s+'<g id="markers"></g>';const signal=$("#signal");signal.setAttribute("viewBox",`0 0 ${w} ${h}`);signal.style.display=signalPts?"block":"none";signal.querySelectorAll(".signal-ring").forEach(p=>p.setAttribute("points",signalPts));renderMapMarkers()}
function markerIndex(item,items){return Math.floor(Date.now()/6500+item.off)%items.length}
function markerTone(emoji){const happy=/🙂|😊|😄|😃|😁|✨|☀️|☕|🎉/.test(emoji),sad=/😔|😢|😭|😞|🌧️|☁️/.test(emoji);return happy?"#edbd77":sad?"#8795aa":dark?"#d9d9dd":"#fafafa"}
function renderMapMarkers(){const layer=$("#markers");if(!layer)return;layer.innerHTML=mapMarkers.map(item=>{const group=`<g class="mood-marker" data-marker="${item.id}" style="animation-delay:-${item.off%4}s">`;if(item.imgs.length){const raw=item.imgs[markerIndex(item,item.imgs)],img=typeof raw==="string"?{imageUrl:raw}:raw,clip="img"+item.id.replace(",","x");return `${group}<defs><clipPath id="${clip}"><polygon points="${item.ptsM}"/></clipPath></defs><image href="${esc(img.imageUrl)}" x="${(item.cx-item.size/2).toFixed(1)}" y="${(item.cy-item.size/2).toFixed(1)}" width="${item.size.toFixed(1)}" height="${item.size.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/><polygon points="${item.ptsM}" fill="none" stroke="${dark?"rgba(255,255,255,.8)":"rgba(0,0,0,.55)"}" stroke-width="1.4"/></g>`}const t=item.thoughts[markerIndex(item,item.thoughts)];return `${group}<polygon points="${item.ptsM}" fill="${markerTone(t.emoji)}" stroke="${dark?"#222":"#fff"}" stroke-width="2"/><text x="${item.cx.toFixed(1)}" y="${(item.cy+item.size*.18).toFixed(1)}" text-anchor="middle" font-size="${(item.size*.58).toFixed(1)}">${esc(t.emoji)}</text></g>`}).join("")}
function cycleMapMarkers(){const layer=$("#markers");if(!layer)return;for(const item of mapMarkers){const group=layer.querySelector(`[data-marker="${item.id}"]`);if(!group)continue;if(item.imgs.length){const raw=item.imgs[markerIndex(item,item.imgs)],img=typeof raw==="string"?raw:raw.imageUrl;group.querySelector("image")?.setAttribute("href",img)}else if(item.thoughts.length){const t=item.thoughts[markerIndex(item,item.thoughts)];group.querySelector("text").textContent=t.emoji;group.querySelector("polygon").setAttribute("fill",markerTone(t.emoji))}}}
function bar(){const b=$("#bar");if(!b)return;if(pickingPin){b.style.display="none";return}b.style.display="flex";const target=hoverHex||viewHex||here,c=cell(target),mine=target===here,active=c.ads.filter(a=>adAvailable(a)).length;
 const issues=c.issues.length;b.innerHTML=`<div><b>${mine?(locationIsManual?esc(areaName||"Chosen neighborhood"):locationReadOnly||locationIsCached?"Nearby area":esc(areaName||"Your neighborhood")):"Selected neighborhood"}</b><div class="mute">This grid · ${c.th.length} thoughts · ${issues} issues · ${active} businesses${mine?(locationReadOnly||locationIsCached?" · read only":""):" · browsing only"}</div></div><button class="btn ${mine&&!locationReadOnly&&!locationIsCached?"p":""}" id="go">${mine?(locationReadOnly||locationIsCached?"Keep exploring":"Open neighborhood"):"Explore this grid"}</button>`;
 $("#go").onclick=()=>{viewHex=target;hoverHex=null;mode="list";tab="feed";render()}}
/* ---------- advertising ---------- */
function openSheet(h){$("#sheet").innerHTML=h;$("#sheetbg").style.display="flex"}
const closeSheet=()=>$("#sheetbg").style.display="none";
$("#sheetbg").onclick=e=>{if(e.target.id==="sheetbg")closeSheet()};
function adBase(){return hexOf(...merc(adPin.lat,adPin.lon)).join(",")}
function adDest(a,id){if(a.lat!=null&&a.lon!=null)return `${a.lat},${a.lon}`;const[q,r]=id.split(",").map(Number),[x,y]=hexC(q,r);return `${(2*Math.atan(Math.exp(y/R0))-Math.PI/2)*180/Math.PI},${x/R0*180/Math.PI}`}
function adAvailable(a,now=new Date()){if(a.exp<=now.getTime()||(a.starts&&a.starts>now.getTime()))return false;if(realAuth&&(a.moderationStatus!=="approved"||a.businessStatus!=="approved"))return false;if(!a.openTime||!a.closeTime)return true;const hm=a.timeZone?new Intl.DateTimeFormat("en-GB",{timeZone:a.timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now):now.toTimeString().slice(0,5);return a.openTime<=a.closeTime?(hm>=a.openTime&&hm<a.closeTime):(hm>=a.openTime||hm<a.closeTime)}
function directionsUrl(dest){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`}
function localDateTime(ms){const d=new Date(ms);return new Date(ms-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function adCost(){let t=0;picks.forEach(i=>{const c=cell(i);t+=c.ads.length>=MAXADS?Math.min(...c.ads.map(a=>a.paid))+5:BASE});return t}
function stashAdDraft(){adDraft={...(adDraft||{}),name:$("#bn")?.value??adDraft?.name??S.name,msg:$("#bm")?.value??adDraft?.msg??"",kind:adKind,local:$("#lc")?$("#lc").checked:(adDraft?.local||false),openTime:$("#starts")?.value??adDraft?.openTime??"09:00",closeTime:$("#ends")?.value??adDraft?.closeTime??"18:00",picks:[...picks]}}
function pickAdPin(){stashAdDraft();adOriginMode=mode;pickingPin=true;closeSheet();mode="map";render()}
function adSheet(step=1){if(!adPin)adPin={lat:pos[0],lon:pos[1]};adStep=step;const base=here;picks=new Set([base]);adKind=adDraft?.kind||"listed";
 const openTime=adDraft?.openTime||"09:00",closeTime=adDraft?.closeTime||"18:00",name=adDraft?.name||S.name;
 const placeStep=`<label class="fieldlbl" for="bn">Business or stall</label><input id="bn" placeholder="Name people know you by" maxlength="40" value="${esc(name)}"><div class="adtools"><button class="btn" id="findmaps">Search this place ↗</button><button class="btn" id="setpin">Drop a pin</button></div><div class="note">Current pin: ${esc(areaName||"your neighborhood")}. Search a listing or drop a pin for a street stall.</div>`;
 const offerStep=`<label class="fieldlbl" for="bm">What’s the offer?</label><textarea id="bm" rows="3" maxlength="120" placeholder="A short, useful message…">${esc(adDraft?.msg||"")}</textarea><div class="note">Shown for 30 days · visible during your opening hours.</div><div class="row"><label class="fieldlbl" for="starts">Opens</label><label class="fieldlbl" for="ends">Closes</label></div><div class="row"><input id="starts" type="time" value="${openTime}"><input id="ends" type="time" value="${closeTime}"></div>`;
 const areaStep=`<b>This grid only</b><div class="note">Your business pin and update are public after review · Up to 30 days · No payment during this trial.</div><label class="fieldlbl"><input id="lc" type="checkbox" ${adDraft?.local?"checked":""}> I confirm this is a local business or stall.</label>`;
 const body=adStep===1?placeStep:adStep===2?offerStep:areaStep;
 openSheet(`<div class="adwizard"><div class="wizardtop"><span>LOCAL BUSINESS</span><span>${adStep} / 3</span></div><h1>${adStep===1?"Register your business":adStep===2?"What should they know?":"Review your business update"}</h1><div class="wizardprogress"><i style="width:${adStep*33.333}%"></i></div>${body}<div class="row wizardnav">${adStep>1?'<button class="btn" id="adback">Back</button>':'<button class="btn" id="adcancel">Cancel</button>'}${adStep<3?'<button class="btn p" id="adnext">Continue</button>':'<button class="btn p" id="buy">Submit for review · free trial</button>'}</div><div class="note" id="err" hidden></div></div>`);
 if(adStep===1){if(!document.querySelector("#sheet [data-ad-kind]")){const row=document.createElement("div");row.className="adtypes";row.innerHTML=`<button class="chip ${adKind==="listed"?"on":""}" data-ad-kind="listed">Listed place</button><button class="chip ${adKind==="street"?"on":""}" data-ad-kind="street">Street vendor</button>`;$("#bn").before(row);row.querySelectorAll("[data-ad-kind]").forEach(x=>x.onclick=()=>{adKind=x.dataset.adKind;row.querySelectorAll(".chip").forEach(y=>y.classList.toggle("on",y===x))})}
  $("#findmaps").onclick=()=>{const n=$("#bn").value.trim();if(!n)return toast("Enter a place name first");window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n)}`,"_blank","noopener")};$("#setpin").onclick=pickAdPin}
 
 if($("#adcancel"))$("#adcancel").onclick=closeSheet;if($("#adback"))$("#adback").onclick=()=>{stashAdDraft();adSheet(adStep-1)};
 if($("#adnext"))$("#adnext").onclick=()=>{stashAdDraft();if(adStep===1&&!adDraft.name.trim())return toast("Add your business or stall name");if(adStep===2&&(!adDraft.msg.trim()||adDraft.openTime===adDraft.closeTime))return toast("Add an offer and opening hours");adSheet(adStep+1)};
 if($("#buy"))$("#buy").onclick=()=>{stashAdDraft();publish()}}

async function publish(){
 const name=(adDraft?.name||"").trim(),message=(adDraft?.msg||"").trim(),openTime=adDraft?.openTime,closeTime=adDraft?.closeTime;
 const errorText=text=>{$("#err").hidden=false;$("#err").textContent=text};
 if(!realAuth)return errorText("Sign in before registering a business.");
 if(!canContributeToGrid(here))return errorText(locationHoldReason());
 if(!name||!message)return errorText("Add a business name and a useful update.");
 if(adBase()!==here)return errorText("Place the business pin inside your confirmed grid.");
 if(CHAINS.test(name+" "+message))return errorText("This trial is for local businesses and street vendors.");
 if(!adDraft?.local)return errorText("Please confirm this is a local business or stall.");
 if(!openTime||!closeTime||openTime===closeTime)return errorText("Choose different daily opening and closing times.");
 const button=$("#buy");button.disabled=true;
 try{
  const{data,error}=await authClient.rpc("submit_business_offer",{p_name:name,p_kind:adKind,p_message:message,p_lat:adPin.lat,p_lng:adPin.lon,p_open:openTime,p_close:closeTime,p_local:true});
  if(error)throw error;if(data?.status!=="pending_review")throw Error("Invalid submission result");
  adDraft=null;adPin=null;picks=new Set();closeSheet();sharedGridCache.delete(here);await refreshSharedGrid(here);render();toast("Business update submitted. Neighbors can see it after review.");
 }catch{errorText("Your update could not be confirmed. Check your grid and connection, then refresh before retrying. You may have up to three active or pending updates.")}
 finally{button.disabled=false}
}
addEventListener("resize",()=>mode==="map"&&drawMap());
function authMessage(id,message,ok=false){const e=$(id);if(!e)return;e.textContent=message;e.classList.toggle("ok",ok)}
function authConfigured(){const cfg=window.GRIDSPACE_AUTH_CONFIG||{};return !!(cfg.url&&cfg.publishableKey&&cfg.phoneAuthEnabled===true)}
function beginApp(isVerified,userId="preview"){const nextKey=isVerified?`gs2_user_${userId}`:"gs2";if($("#authgate").hidden&&realAuth===!!isVerified&&storageKey===nextKey)return;activeSharedEpoch++;sharedRefreshBusy=false;storageKey=nextKey;S=isVerified?emptyState():readState(nextKey);realAuth=!!isVerified;currentUserId=realAuth?userId:null;if(realAuth){for(const key in T)delete T[key];sharedGridCache.clear();sharedGridLoads.clear();sharedFollowsLoaded=false;sharedSeedsLoaded=false;sharedAssignedGrid=null;sharedAssignmentPendingGrid=null;sharedAssignmentSequence++;moderatorChecked=false;isModerator=false}document.body.classList.toggle("local-preview",!realAuth);$("#account").hidden=!realAuth;$("#authgate").hidden=true;const invite=new URL(location.href).searchParams.get("grid");if(invite&&/^[-]?\d+,[-]?\d+$/.test(invite)){viewHex=invite;mode="list";tab="feed";started=1;locationReadOnly=true;optionalText("#city","Shared grid · read only");const intro=$("#intro");if(intro)intro.remove();loadLandMask();render();return}loadLandMask();ask()}
let pendingPhone="",otpMode="sms",otpSentAt=0,otpCooldownTimer=0,phoneAuthBusy=false,completingPhoneSession=null;
function normalizeIndianPhone(value){let digits=String(value||"").replace(/[\s()+-]/g,"");if(digits.length===12&&digits.startsWith("91"))digits=digits.slice(2);return /^[6-9][0-9]{9}$/.test(digits)?`+91${digits}`:null}
function phoneSessionVerified(session){return !!(session?.user?.phone_confirmed_at&&session.user.is_anonymous!==true&&normalizeIndianPhone(session.user.phone))}
function authFailure(error){const code=String(error?.code||""),message=String(error?.message||"");if(error?.status===429||/rate_limit|too_many/i.test(code+message))return "Too many attempts. Please wait before trying again.";if(/captcha/i.test(code+message))return "Complete the security check, then try again.";if(/otp_expired|invalid_otp|token.*expired/i.test(code+message))return "That code is invalid or expired. Check it or request a new code.";if(/phone_exists|phone.*already|identity_already/i.test(code+message))return "This number already belongs to an account. Contact support before moving activity from your existing pilot account.";if(/provider_disabled|sms_send_failed|sms.*provider|phone_provider|phone.*disabled/i.test(code+message))return "Phone sign-in is not available right now. Please try again later.";return "We couldn’t complete sign-in. Check your connection and try again."}
function resetCaptcha(){captchaToken=null;if(window.turnstile&&turnstileId!==null)window.turnstile.reset(turnstileId)}
function updateOtpCooldown(){const remaining=Math.max(0,Math.ceil((otpSentAt+60000-Date.now())/1000)),button=$("#resend-otp");if(button){button.disabled=phoneAuthBusy||remaining>0;button.textContent=remaining?`Resend in ${remaining}s`:"Resend code"}if(!remaining){clearInterval(otpCooldownTimer);otpCooldownTimer=0}}
function showPhoneEntry(){optionalHidden("#phone-form",false);optionalHidden("#otp-form",true);authMessage("#auth-msg","");$("#phone-number").focus()}
function showLogin(message=""){
 activeSharedEpoch++;sharedRefreshBusy=false;stopLocationRequest();stopTrackingLocation();started=0;realAuth=false;currentUserId=null;accountUsername="";moderatorChecked=false;isModerator=false;S=emptyState();storageKey="gs2";
 sharedGridCache.clear();sharedGridLoads.clear();sharedFollowsLoaded=false;sharedSeedsLoaded=false;sharedAssignedGrid=null;sharedAssignmentPendingGrid=null;sharedAssignmentSequence++;
 document.body.classList.remove("local-preview");optionalHidden("#account",true);optionalHidden("#authgate",false);showPhoneEntry();if(message)authMessage("#auth-msg",message);
}
async function completePhoneSession(session){
 if(!phoneSessionVerified(session))return false;
 if(realAuth&&currentUserId===session.user.id&&$("#authgate").hidden)return true;
 if(completingPhoneSession?.userId===session.user.id)return completingPhoneSession.promise;
 const epoch=activeSharedEpoch;
 const promise=(async()=>{try{
  const{data,error}=await authClient.rpc("ensure_phone_account");if(error)throw error;
  if(epoch!==activeSharedEpoch)return false;
  if(!/^neighbor_[a-f0-9]{32}$/.test(data?.username||""))throw Error("Invalid profile response");
  accountUsername=data.username;$("#account-username").value=accountUsername;
  $("#otp-code").value="";$("#phone-number").value="";pendingPhone="";clearInterval(otpCooldownTimer);otpCooldownTimer=0;
  beginApp(true,session.user.id);return true;
 }catch{if(epoch===activeSharedEpoch)authMessage("#auth-msg","Your number was verified, but account setup could not finish. Please retry or contact support.");return false}})();
 completingPhoneSession={userId:session.user.id,promise};try{return await promise}finally{if(completingPhoneSession?.promise===promise)completingPhoneSession=null}
}
async function sendPhoneOtp(event){
 event?.preventDefault();if(phoneAuthBusy)return;
 if(!authClient)return authMessage("#auth-msg","Phone sign-in is not available yet. Please try again later.");
 const phone=normalizeIndianPhone($("#phone-number").value);
 if(!phone)return authMessage("#auth-msg","Enter a valid 10-digit Indian mobile number.");
 if(!$("#phone-consent").checked)return authMessage("#auth-msg","Please read and acknowledge how your number is used.");
 if(otpSentAt&&Date.now()-otpSentAt<60000)return authMessage("#auth-msg","Please wait a minute before requesting another code.");
 if(window.GRIDSPACE_AUTH_CONFIG?.turnstileSiteKey&&!captchaToken)return authMessage("#auth-msg","Complete the security check first.");
 phoneAuthBusy=true;$("#send-otp").disabled=true;$("#resend-otp").disabled=true;authMessage("#auth-msg","");
 try{
  const{data:{session},error:sessionError}=await authClient.auth.getSession();if(sessionError)throw sessionError;
  let result;
  if(session?.user?.is_anonymous===true){otpMode="phone_change";result=await authClient.auth.updateUser({phone})}
  else{otpMode="sms";result=await authClient.auth.signInWithOtp({phone,options:{shouldCreateUser:true,...(captchaToken?{captchaToken}:{})}})}
  if(result.error)throw result.error;
  pendingPhone=phone;otpSentAt=Date.now();optionalHidden("#phone-form",true);optionalHidden("#otp-form",false);
  optionalText("#otp-destination",`Enter the code sent to +91 ••••••${phone.slice(-4)}.`);$("#otp-code").value="";$("#otp-code").focus();
  clearInterval(otpCooldownTimer);otpCooldownTimer=setInterval(updateOtpCooldown,1000);resetCaptcha();
 }catch(error){authMessage("#auth-msg",authFailure(error));resetCaptcha()}
 finally{phoneAuthBusy=false;$("#send-otp").disabled=false;updateOtpCooldown()}
}
async function verifyPhoneOtp(event){
 event.preventDefault();if(phoneAuthBusy)return;if(!authClient||!pendingPhone)return authMessage("#auth-msg","Request a sign-in code first.");
 const token=$("#otp-code").value.trim();if(!/^[0-9]{6}$/.test(token))return authMessage("#auth-msg","Enter the 6-digit code from your message.");
 phoneAuthBusy=true;$("#verify-otp").disabled=true;authMessage("#auth-msg","");
 try{
  const existing=await authClient.auth.getSession();if(existing.error)throw existing.error;
  let session=existing.data.session;
  if(!phoneSessionVerified(session)||normalizeIndianPhone(session.user.phone)!==pendingPhone){
   const result=await authClient.auth.verifyOtp({phone:pendingPhone,token,type:otpMode});if(result.error)throw result.error;session=result.data.session;
  }
  if(!phoneSessionVerified(session)||normalizeIndianPhone(session.user.phone)!==pendingPhone)throw Error("Phone verification incomplete");
  await completePhoneSession(session);
 }catch(error){authMessage("#auth-msg",authFailure(error))}finally{phoneAuthBusy=false;$("#verify-otp").disabled=false}
}
function initTurnstile(){const siteKey=window.GRIDSPACE_AUTH_CONFIG?.turnstileSiteKey;if(!siteKey)return;const box=$("#turnstile-box");if(!box)return;box.hidden=false;const render=()=>{if(!window.turnstile||turnstileId!==null)return;turnstileId=window.turnstile.render(box,{sitekey:siteKey,callback:token=>{captchaToken=token},"expired-callback":()=>{captchaToken=null},"error-callback":()=>{captchaToken=null;authMessage("#auth-msg","Security check could not load. Please retry.")}})};if(window.turnstile){render();return}const script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";script.async=true;script.defer=true;script.onload=render;script.onerror=()=>authMessage("#auth-msg","Security check could not load. Check your connection.");document.head.appendChild(script)}
function initPhoneAuth(){
 $("#phone-form").onsubmit=sendPhoneOtp;$("#otp-form").onsubmit=verifyPhoneOtp;$("#edit-phone").onclick=showPhoneEntry;
 $("#resend-otp").onclick=()=>{if(window.GRIDSPACE_AUTH_CONFIG?.turnstileSiteKey&&!captchaToken){showPhoneEntry();return authMessage("#auth-msg","Complete the security check again, then request a new code.")}sendPhoneOtp()};
 if(!authConfigured())return authMessage("#auth-msg","Phone sign-in is not available yet. Please try again later.");
 if(!window.supabase?.createClient)return authMessage("#auth-msg","The sign-in service could not load. Check your connection and reload.");
 try{const cfg=window.GRIDSPACE_AUTH_CONFIG;authClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}})}
 catch{return authMessage("#auth-msg","The sign-in service could not start. Please try again later.")}
 initTurnstile();
 authClient.auth.getSession().then(({data,error})=>{if(error)throw error;if(phoneSessionVerified(data.session))return completePhoneSession(data.session);if(data.session?.user?.is_anonymous)authMessage("#auth-msg","Add and verify your number to keep your existing pilot activity on this account.")}).catch(()=>authMessage("#auth-msg","Your previous session could not be restored. Sign in again."));
 // Auth callbacks stay synchronous; API calls are deferred to avoid the Auth lock.
 authClient.auth.onAuthStateChange((event,session)=>{
  if((event==="SIGNED_IN"||event==="USER_UPDATED")&&phoneSessionVerified(session))setTimeout(()=>completePhoneSession(session),0);
  if(event==="SIGNED_OUT")showLogin("You signed out. Use the same number and a new OTP to return.");
 });
}
const accountDialog=$("#account-dialog");
$("#account").onclick=()=>{$("#account-username").value=accountUsername;accountDialog.showModal()};
$("#account-close").onclick=()=>accountDialog.close();
$("#copy-username").onclick=async()=>{try{await navigator.clipboard.writeText(accountUsername);toast("Username copied. Sign in with your phone number to recover your account.")}catch{$("#account-username").select();toast("Select and copy your username.")}};
$("#account-signout").onclick=async()=>{const{error}=await authClient.auth.signOut();if(error)return toast("Sign-out failed. Check your connection and try again.");accountDialog.close();showLogin("You signed out. Your shared activity stays with your account.")};
$("#account-delete").onclick=async event=>{
 if(!confirm("Permanently delete your account and all its contributions? This cannot be undone."))return;
 if(prompt("Type DELETE to confirm.")!=="DELETE")return;
 const button=event.currentTarget;button.disabled=true;
 try{const{error}=await authClient.functions.invoke("delete-account",{body:{}});if(error)throw error;
  try{localStorage.removeItem(locationCacheKey());localStorage.removeItem(`gs2_user_${currentUserId}`)}catch{}
  accountDialog.close();await authClient.auth.signOut({scope:"local"});showLogin("Your account and contributions were deleted.");
 }catch{toast("Your account could not be deleted. Please retry or contact support.")}finally{button.disabled=false}
};
initPhoneAuth();
let deferredInstallPrompt=null,installPromptState="idle",installEventSeen=false;
function initPWA(){const button=$("#install-app");if(!button)return;const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1),standalone=matchMedia("(display-mode:standalone)").matches||navigator.standalone===true;if(standalone)button.hidden=true;else if(ios)button.hidden=false;
 const showInstallHelp=()=>{const title=$("#install-title"),copy=$("#install-instructions"),dialog=$("#install-help");if(title)title.textContent=ios?"Add Thotox to your Home Screen":"Install Thotox";if(copy)copy.innerHTML=ios?'In Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>. Open Thotox from the new Home Screen icon.':'Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. Then launch Thotox from its new icon.';if(dialog?.showModal)dialog.showModal();else toast(ios?"In Safari, tap Share, then Add to Home Screen.":"Use your browser menu to install Thotox.")};
 const confirmInstalled=()=>{if(installPromptState!=="accepted")return;installPromptState="installed";installEventSeen=false;button.hidden=true;toast("Thotox is installed. Open it from your Home screen.")};
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;button.hidden=false});window.addEventListener("appinstalled",()=>{if(installPromptState==="prompting"){installEventSeen=true;return}if(installPromptState==="accepted")confirmInstalled()});
 button.onclick=async()=>{if(!deferredInstallPrompt)return showInstallHelp();const prompt=deferredInstallPrompt;deferredInstallPrompt=null;installPromptState="prompting";installEventSeen=false;try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==="accepted"){installPromptState="accepted";if(installEventSeen)confirmInstalled();else{button.hidden=true;toast("Install request accepted. Check your Home screen for Thotox.")}}else{installPromptState="idle";installEventSeen=false;button.hidden=false;button.textContent="Install Thotox";toast("Installation cancelled. Thotox is still available in your browser.")}}catch(e){installPromptState="idle";installEventSeen=false;deferredInstallPrompt=null;button.hidden=false;console.warn("The browser install prompt could not be opened.",e);toast("The install prompt could not open. Try your browser menu instead.")}};
 const close=$("#install-help-close"),dialog=$("#install-help");if(close&&dialog)close.onclick=()=>dialog.close();if("serviceWorker"in navigator&&location.protocol!=="file:")navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(e=>console.warn("Thotox offline shell could not be registered.",e))}
initPWA();
setInterval(()=>{if(started&&mode==="map")bar();else if(started&&mode==="list"&&locationFix&&fixAge()>MAX_FIX_AGE)renderList()},30000);
setInterval(()=>{if(started&&mode==="map")cycleMapMarkers()},6500);

setInterval(()=>{void refreshVisibleSharedData()},30000);
addEventListener("focus",()=>{void refreshVisibleSharedData()});

const $ = id => document.getElementById(id);

const LAUNCH_SITE = { lat: 28.5, lon: -80.6, name: 'Demo Launch Site' };
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAUNCH_SITE.lat}&longitude=${LAUNCH_SITE.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,cloud_cover,wind_speed_10m,pressure_msl,weather_code&timezone=auto`;
const ISS_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const TLE_CACHE_KEY = 'astrawatch_iss_tle_v2';
const TLE_CACHE_MS = 2 * 60 * 60 * 1000;

const data = {
LEO:{inc:'45.1°',win:'CALCULATED',dur:'4 min',inj:'MODELLED',vehicle:510,elev:'38°',view:'2m 50s'},
POLAR:{inc:'89.0°',win:'CALCULATED',dur:'5 min',inj:'MODELLED',vehicle:545,elev:'46°',view:'3m 45s'},
SSO:{inc:'98.1°',win:'CALCULATED',dur:'4 min',inj:'MODELLED',vehicle:530,elev:'42°',view:'3m 20s'}
};

let orbit='SSO', countdown=0, mission=0, issSatrec=null, issName='ISS (ZARYA)', weatherData=null;

function fmt(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function localTime(){return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}
function setStatus(id,text,kind){const e=$(id); if(!e)return; e.textContent=text; e.className=`badge ${kind}`;}

function nextCalculatedWindow(){
const now = new Date();
const base = new Date(now);
const minuteBlock = Math.ceil(now.getMinutes()/15)*15;
base.setMinutes(minuteBlock, 0, 0);
const offsets = {LEO: 2, POLAR: 5, SSO: 8};
base.setMinutes(base.getMinutes() + offsets[orbit]);
if(base <= now) base.setMinutes(base.getMinutes()+15);
return base;
}
function renderCountdown(){
const target=nextCalculatedWindow();
countdown=Math.max(0,Math.floor((target-Date.now())/1000));
$('countdown').textContent=fmt(countdown);
$('bar').style.width=Math.max(4,100-Math.min(96,countdown/9))+'%';
const end=new Date(target.getTime()+data[orbit].vehicle*1000);
$('window').textContent=`${target.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}–${new Date(target.getTime()+4*60000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
$('injection').textContent=end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function renderOrbit(){
const d=data[orbit];
$('chip').textContent=`${orbit} · ${d.inc}`;
$('duration').textContent=d.dur;
$('vehicle').innerHTML=`${Math.floor(d.vehicle/60)}:${String(d.vehicle%60).padStart(2,'0')} <small>modelled to injection</small>`;
$('elev').textContent=d.elev;$('view').textContent=d.view;
$('align').textContent=`${orbit} target inclination (${d.inc}) is evaluated against this prototype's demonstration launch profile.`;
renderCountdown(); updateMission();
}

function weatherImpact(w){
const wind=w.wind_speed_10m||0, rain=w.rain||0, cloud=w.cloud_cover||0;
if(wind>=45 || rain>=6) return ['RED','red','Launch conditions may be unfavorable under this prototype weather heuristic.'];
if(wind>=30 || rain>=2 || cloud>=85) return ['YELLOW','yellow','Weather has a moderate impact under this prototype heuristic.'];
return ['GREEN','green','Current conditions look favorable under this prototype weather heuristic.'];
}
function weatherIcon(code){
if(code===0)return '☀'; if(code<=3)return '⛅'; if(code<=48)return '☁'; if(code<=67)return '☂'; if(code<=77)return '❄'; return '⛈';
}
async function loadWeather(){
$('weatherText').textContent='Fetching live launch-site weather…';
try{
const r=await fetch(WEATHER_URL,{cache:'no-store'}); if(!r.ok) throw new Error('Weather request failed');
const j=await r.json(); weatherData=j.current;
$('weatherTemp').textContent=Math.round(j.current.temperature_2m)+'°C';
$('weatherIcon').textContent=weatherIcon(j.current.weather_code);
$('wind').textContent=Math.round(j.current.wind_speed_10m)+' km/h';
$('cloud').textContent=Math.round(j.current.cloud_cover)+'%';
$('rain').textContent=Number(j.current.precipitation||0).toFixed(1)+' mm';
$('pressure').textContent=Math.round(j.current.pressure_msl)+' hPa';
$('weatherUpdated').textContent='LIVE · updated '+localTime();
const [label,kind,msg]=weatherImpact(j.current); setStatus('weatherBadge',label,kind); $('weatherText').textContent=msg;
}catch(e){
setStatus('weatherBadge','OFFLINE','yellow'); $('weatherText').textContent='Live weather unavailable right now. Demo values are not being presented as live.';
$('weatherUpdated').textContent='SOURCE UNAVAILABLE';
}
}

function parseTLE(text){
const lines=text.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const i=lines.findIndex(x=>x.startsWith('1 '));
if(i<0 || !lines[i+1]) throw new Error('TLE not found');
const name=i>0 && !lines[i-1].startsWith('2 ') ? lines[i-1] : 'ISS (ZARYA)';
return {name,line1:lines[i],line2:lines[i+1]};
}
async function loadISS(){
$('satStatus').textContent='FETCHING ORBITAL ELEMENTS…';
try{
let cached=null;
try{cached=JSON.parse(localStorage.getItem(TLE_CACHE_KEY)||'null')}catch{}
let tle;
if(cached && Date.now()-cached.saved<TLE_CACHE_MS){tle=cached.tle; $('satSource').textContent='CelesTrak · cached < 2h';}
else{
const r=await fetch(ISS_TLE_URL,{cache:'no-store'}); if(!r.ok) throw new Error('CelesTrak request failed');
tle=parseTLE(await r.text());
localStorage.setItem(TLE_CACHE_KEY,JSON.stringify({saved:Date.now(),tle}));
$('satSource').textContent='CelesTrak · fresh orbital data';
}
issSatrec=window.satellite.twoline2satrec(tle.line1,tle.line2); issName=tle.name;
$('satName').textContent=issName; $('satStatus').textContent='LIVE ORBITAL TRACK'; setStatus('satBadge','LIVE','green');
updateISS();
}catch(e){
setStatus('satBadge','OFFLINE','yellow'); $('satStatus').textContent='Orbital feed unavailable'; $('satSource').textContent='CelesTrak unavailable';
}
}
function updateISS(){
if(!issSatrec || !window.satellite) return;
const now=new Date();
const pv=window.satellite.propagate(issSatrec,now);
if(!pv || !pv.position) return;
const gmst=window.satellite.gstime(now);
const geo=window.satellite.eciToGeodetic(pv.position,gmst);
const lat=window.satellite.degreesLat(geo.latitude), lon=window.satellite.degreesLong(geo.longitude);
const alt=geo.height;
$('issLat').textContent=lat.toFixed(2)+'°'; $('issLon').textContent=lon.toFixed(2)+'°'; $('issAlt').textContent=Math.round(alt)+' km';
$('issTime').textContent='LIVE · '+now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
// Use the real satellite position as a live reference marker on the schematic map.
const x=Math.max(4,Math.min(96,(lon+180)/360*100)); const y=Math.max(8,Math.min(92,(90-lat)/180*100));
$('issPin').style.left=x+'%'; $('issPin').style.top=y+'%';
$('issMapLabel').textContent=`ISS · ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
}

function updateMission(){
const d=data[orbit],t=Math.min(mission,d.vehicle),p=t/d.vehicle;
const x=95+(680-95)*p, y=430+(55-430)*p+Math.sin(p*Math.PI)*(-55);
$('dot').setAttribute('cx',x);$('dot').setAttribute('cy',y);$('dotGlow').setAttribute('cx',x);$('dotGlow').setAttribute('cy',y);
$('missionTime').textContent=fmt(t);
let phase='LIFTOFF',alt=0,lat=28.5,lon=-80.6;
if(t<130){phase='ASCENT';alt=110*t/130;lat=28.5+1.5*t/130;lon=-80.6+4*t/130}
else if(t<360){phase='STAGE EVENT';alt=110+260*(t-130)/230;lat=30+3*(t-130)/230;lon=-76.6+10*(t-130)/230}
else{phase='INJECTION';alt=370+120*(t-360)/170;lat=33+4*(t-360)/170;lon=-66.6+18*(t-360)/170}
$('phase').textContent=phase;$('alt').textContent=Math.round(alt)+' km';$('lat').textContent=lat.toFixed(1)+'°';$('lon').textContent=lon.toFixed(1)+'°';
$('comms').textContent=Math.floor(t/45)%5===4?'HANDOFF':'CONNECTED';
document.querySelectorAll('.timeline>div').forEach((e,i)=>e.classList.toggle('active',(i===0&&t<1)||(i===1&&t>=1&&t<130)||(i===2&&t>=130&&t<360)||(i===3&&t>=360)));
}

$('orbit').addEventListener('change',e=>{orbit=e.target.value;renderOrbit()});
$('delay').addEventListener('input',e=>{let n=+e.target.value;$('delayVal').textContent=n+' min';$('what').textContent=n?`${n}-minute delay applied to the calculated window.`:'No launch delay applied.';renderCountdown()});
$('mission').addEventListener('input',e=>{mission=+e.target.value;updateMission()});
$('reset').addEventListener('click',()=>{orbit='SSO';$('orbit').value='SSO';$('delay').value=0;$('delayVal').textContent='0 min';$('mission').value=0;$('what').textContent='No launch delay applied.';mission=0;renderOrbit()});
$('whatBtn').addEventListener('click',()=>{$('delay').value=10;$('delayVal').textContent='10 min';$('what').textContent='10-minute delay applied to the calculated window.';renderCountdown()});

renderOrbit(); updateMission(); loadWeather(); loadISS();
setInterval(()=>{renderCountdown(); updateISS()},1000);
setInterval(loadWeather,5*60*1000);
setInterval(loadISS,2*60*60*1000);
/* Target-string tuning state. No microphone, timers, storage or inferred hardware calibration. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SVViolinTuner=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const NOTES=Object.freeze({G3:55,D4:62,A4:69,E5:76});
 const finite=(value,min,max,label)=>{if(!Number.isFinite(value)||value<min||value>max)throw Error(label+' out of range');return value;};
 const median=values=>{const copy=values.slice().sort((a,b)=>a-b);return copy[Math.floor(copy.length/2)];};
 function create(options={}){
  const now=typeof options.now==='function'?options.now:()=>globalThis.performance?.now?.()??Date.now();
  let target=options.target||'A4',a4=options.a4??440;
  if(!Object.hasOwn(NOTES,target))throw Error('Unknown target string');finite(a4,400,480,'A4');
  const stableMs=finite(options.stableMs??350,200,2000,'Stable window'),staleMs=finite(options.staleMs??500,100,2000,'Stale window'),tolerance=finite(options.toleranceCents??5,1,15,'Tolerance');
  let state,frames=[],holdStart=null,lastUpdate=null,suppressedUntil=-Infinity,lastClock=-Infinity;
  const targetHz=()=>a4*2**((NOTES[target]-69)/12);
  const fresh=(name,reason=null)=>({target,targetHz:targetHz(),a4,frequency:null,cents:null,direction:'none',state:name,reliable:false,stable:false,level:0,peak:0,gate:.008,reason,actualInputSettings:{}});
  function clear(name,reason,meta={}){frames=[];holdStart=null;state={...fresh(name,reason),level:Number.isFinite(meta.rms)?Math.max(0,meta.rms):Number.isFinite(meta.level)?Math.max(0,meta.level):0,peak:Number.isFinite(meta.peak)?Math.max(0,meta.peak):0,gate:Number.isFinite(meta.gate)?meta.gate:state?.gate??.008,actualInputSettings:{...(meta.inputSettings||state?.actualInputSettings||{})}};return clone();}
  function clone(){return {...state,actualInputSettings:{...state.actualInputSettings}};}
  function time(){const at=Number(now());if(!Number.isFinite(at))throw Error('Tuner clock unavailable');if(at<lastClock){frames=[];holdStart=null;lastUpdate=null;suppressedUntil=-Infinity;state=fresh('waiting','clock-reset');}lastClock=at;return at;}
  function snapshot(){const at=time();if(at<suppressedUntil){if(state.state!=='reference')clear('reference','reference-suppressed');}else if(state.state==='reference')clear('waiting');else if(lastUpdate!==null&&at-lastUpdate>staleMs)clear('no-input','stale-input');return clone();}
  function reset(reason='waiting'){lastUpdate=null;return clear(reason==='reference'?'reference':'waiting',reason==='waiting'?null:reason);}
  function setTarget(value){if(!Object.hasOwn(NOTES,value))throw Error('Unknown target string');target=value;return reset();}
  function setReference(value){a4=finite(value,400,480,'A4');return reset();}
  function suppressFor(ms){const at=time();suppressedUntil=Math.max(suppressedUntil,at+finite(ms,0,10000,'Suppression'));lastUpdate=null;return clear('reference','reference-suppressed');}
  function update(hz,meta={}){
   const at=time();lastUpdate=at;
   if(at<suppressedUntil)return clear('reference','reference-suppressed',meta);
   if(meta.clipping===true||Number.isFinite(meta.peak)&&meta.peak>=.985)return clear('overload','clipping',meta);
   if(meta.reason==='below-noise-gate'||meta.reason==='no-input'||Number.isFinite(meta.rms)&&meta.rms<(Number.isFinite(meta.gate)?meta.gate:state.gate))return clear('no-input',meta.reason||'below-noise-gate',meta);
   if(meta.valid!==true||!Number.isFinite(meta.confidence)||meta.confidence<.85||!Number.isFinite(hz)||hz<80||hz>3000)return clear('uncertain',meta.reason||'unreliable-input',meta);
   const raw=1200*Math.log2(hz/targetHz());
   if(Math.abs(raw)>180){clear('wrong-string',Math.abs(raw)>1000?'octave-or-wrong-string':'wrong-string',meta);state.frequency=hz;return clone();}
   if(frames.length&&(at-frames[frames.length-1].at>150||Math.abs(raw-frames[frames.length-1].cents)>12)){frames=[];holdStart=null;}
   frames.push({at,cents:raw});frames=frames.filter(frame=>frame.at>=at-stableMs-100);
   const spread=Math.max(...frames.map(f=>f.cents))-Math.min(...frames.map(f=>f.cents));
   if(holdStart===null||spread>6){holdStart=at;if(spread>6)frames=frames.slice(-1);}
   const cents=median(frames.slice(-5).map(frame=>frame.cents)),stable=frames.length>=5&&at-holdStart>=stableMs&&spread<=6;
   const close=Math.abs(cents)<=tolerance,name=close?(stable?'in-tune':'listening'):cents<0?'low':'high';
   state={...fresh(name),frequency:hz,cents:Math.round(cents*10)/10,direction:close?(stable?'hold':'none'):cents<0?'tighten':'loosen',reliable:true,stable,level:Number.isFinite(meta.rms)?meta.rms:Number.isFinite(meta.level)?meta.level:0,peak:Number.isFinite(meta.peak)?meta.peak:0,gate:Number.isFinite(meta.gate)?meta.gate:state.gate,actualInputSettings:{...(meta.inputSettings||{})}};
   return clone();
  }
  state=fresh('waiting');return Object.freeze({setTarget,setReference,update,reset,suppressFor,snapshot});
 }
 return Object.freeze({create,NOTES});
});

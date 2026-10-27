/* Shared workspace choices and per-piece resume points; never rewrites legacy musical data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SVWorkspaces=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const KEY='smartvio-workspaces-v1';
  const PRIMARY=['home','practice','learn','studio','community'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const initial=()=>({schema:1,practiceSource:'catalog',soundTab:'tones',midiVoice:'demo',catalogPositions:{},returnTo:null});
  function primary(route){return ['library','lessons','tuner','metronome'].includes(route)?'practice':['tones','midi','performance'].includes(route)?'studio':PRIMARY.includes(route)?route:null;}
  function valid(value){return value?.schema===1&&['catalog','guided'].includes(value.practiceSource)&&['tones','midi'].includes(value.soundTab)&&['demo','preset'].includes(value.midiVoice)&&value.catalogPositions&&typeof value.catalogPositions==='object'&&!Array.isArray(value.catalogPositions)&&Object.entries(value.catalogPositions).every(([key,row])=>key.length<=240&&row&&Number.isFinite(row.position)&&row.position>=0&&row.position<=7200&&Number.isFinite(row.duration)&&row.duration>0&&row.duration<=7200);}
  function create(options={}){
    let storage;try{storage=options.storage===undefined?globalThis.localStorage:options.storage;}catch{storage=null;}let state=initial(),writable=true,generation=0;
    try{const raw=storage?.getItem(KEY);if(raw){const parsed=JSON.parse(raw);if(valid(parsed))state={...state,...parsed};else writable=false;}}catch{writable=false;}
    const save=()=>{if(!writable)return false;try{storage?.setItem(KEY,JSON.stringify(state));return Boolean(storage?.setItem);}catch{return false;}};
    async function select(change,transition={}){
      if(transition.busy?.())return {changed:false,reason:'recording'};
      const accepted={};if(['catalog','guided'].includes(change.practiceSource))accepted.practiceSource=change.practiceSource;if(['tones','midi'].includes(change.soundTab))accepted.soundTab=change.soundTab;if(['demo','preset'].includes(change.midiVoice))accepted.midiVoice=change.midiVoice;
      if(!Object.keys(accepted).length)return {changed:false,reason:'invalid'};
      const request=++generation;await transition.stop?.();if(request!==generation||transition.busy?.())return {changed:false,reason:'superseded'};
      state={...state,...accepted};return {changed:true,persisted:save(),state:clone(state)};
    }
    return {state:()=>clone(state),select,primary,savePosition(key,position,duration){if(typeof key!=='string'||key.length>240||!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||duration>7200)return false;state.catalogPositions[key]={position:Math.max(0,Math.min(duration,position)),duration};const keys=Object.keys(state.catalogPositions);if(keys.length>100)delete state.catalogPositions[keys[0]];return save();},position(key,duration){const value=state.catalogPositions[key];return value&&Math.abs(value.duration-duration)<.01&&value.position<duration-.1?value.position:0;},setReturnTo(value){state.returnTo=value==='learn'?'learn':null;return save();},clear(){generation++;try{storage?.removeItem(KEY);state=initial();writable=true;return {committed:Boolean(storage?.removeItem)};}catch{return {committed:false};}},status:()=>({writable})};
  }
  return {KEY,PRIMARY,primary,valid,create};
});

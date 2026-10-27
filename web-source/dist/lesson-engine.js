/* One lesson timeline for audio, score and movement cues. No camera or teacher
 * assessment is inferred from microphone pitch. The host owns microphone access. */
(function (global) {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const copy=value=>JSON.parse(JSON.stringify(value));
  const hz=midi=>440*Math.pow(2,(midi-69)/12);
  function failure(code,message){const error=new Error(message);error.code=code;return error;}
  function number(value,min,max,name){if(!Number.isFinite(value)||value<min||value>max)throw failure('INVALID_VALUE',name);return value;}
  function validateManifest(input){
    if(!input||typeof input!=='object'||!Array.isArray(input.events)||!input.events.length||input.events.length>512)throw failure('INVALID_LESSON','Lesson events are missing or too numerous.');
    number(input.duration,.01,3600,'Lesson duration is invalid.');
    const ids=new Set();let previousEnd=0;
    for(const event of input.events){
      if(!event||typeof event.id!=='string'||!event.id||ids.has(event.id))throw failure('INVALID_LESSON','Each note needs a unique ID.');ids.add(event.id);
      number(event.start,0,input.duration,'Note start is invalid.');number(event.end,event.start+.01,input.duration+.00001,'Note end is invalid.');
      if(event.start<previousEnd-.00001)throw failure('INVALID_LESSON','This player requires non-overlapping notes.');previousEnd=event.end;
      if(!Number.isInteger(event.midi)||event.midi<48||event.midi>96||!['G','D','A','E'].includes(event.string)||!Number.isInteger(event.finger)||event.finger<0||event.finger>4||!['up','down'].includes(event.bow)||typeof event.vibrato!=='boolean')throw failure('INVALID_LESSON','The note or movement annotation is invalid.');
      const open={G:55,D:62,A:69,E:76}[event.string];
      if(event.midi<open||event.midi>open+7||(event.finger===0?event.midi!==open:event.midi===open))throw failure('INVALID_LESSON','This movement guide supports first-position notes only.');
    }
    if(!input.media||!['animation','video'].includes(input.media.kind))throw failure('INVALID_LESSON','Unknown lesson media.');
    validateAnchors(input.media.anchors||[]);
    return copy(input);
  }
  function validateAnchors(anchors){
    if(!Array.isArray(anchors)||anchors.length>512)throw failure('INVALID_ANCHORS','Invalid media anchors.');
    let previousTime=-1,previousScore=-1;
    for(const anchor of anchors){if(!anchor||!Number.isFinite(anchor.time)||!Number.isFinite(anchor.scoreTime)||anchor.time<0||anchor.scoreTime<0||anchor.time<=previousTime||anchor.scoreTime<=previousScore)throw failure('INVALID_ANCHORS','Media anchors must increase in both timelines.');previousTime=anchor.time;previousScore=anchor.scoreTime;}
    return anchors;
  }
  function mapTime(value,anchors=[],inverse=false){
    if(!Number.isFinite(value))return 0;
    const from=inverse?'scoreTime':'time',to=inverse?'time':'scoreTime';
    if(!anchors.length)return Math.max(0,value);
    if(anchors.length===1)return Math.max(0,value-anchors[0][from]+anchors[0][to]);
    let i=anchors.findIndex(anchor=>anchor[from]>value);i=i<0?anchors.length-1:Math.max(1,i);
    const a=anchors[i-1],b=anchors[i];return Math.max(0,a[to]+(value-a[from])*(b[to]-a[to])/(b[from]-a[from]));
  }
  function assessPitch(frequency,analysis,event){
    const confidence=Number.isFinite(analysis?.confidence)?clamp(analysis.confidence,0,1):0;
    if(!event||analysis?.valid!==true||confidence<.85||!Number.isFinite(frequency)||frequency<80||frequency>3000)return {status:'uncertain',confidence,cents:null};
    const cents=1200*Math.log2(frequency/hz(event.midi));
    return {status:Math.abs(cents)<=35?'in-tune':cents<0?'low':'high',cents:Math.round(cents),confidence};
  }
  function create(options={}){
    const audio=options.audioEngine,env=options.environment||global,now=options.now||(()=>env.performance?.now?.()??Date.now());
    if(!audio?.play||!audio?.stop)throw failure('AUDIO_REQUIRED','A lesson audio engine is required.');
    let manifest=null,position=0,rate=1,mode='demo',loop={enabled:false,start:0,end:0},playing=false,pending=false,completed=false,error=null,disposed=false,generation=0,video=null,videoFrame=null,videoTimer=null,audioTimer=null,latency=0;
    let feedback={status:'idle'},holdStart=null,holdLast=null,holdEvent=null,releaseRequired=false,releaseStart=null,lastMatchedMidi=null,lastPitch=null,lastOnset=null,listenReleased=true;
    const videoListeners=[],doc=env.document;
    const activeIndex=(at=position)=>manifest?manifest.events.findIndex(event=>event.start<=at+.000001&&event.end>at+.000001):-1;
    const nextIndex=()=>{const active=activeIndex();return active>=0?active:manifest.events.findIndex(event=>event.start>=position-.000001);};
    function state(){const index=activeIndex();return {manifest,playing,pending,position,duration:manifest?.duration||0,rate,loop:{...loop},mode,event:manifest?.events[index]||null,index,feedback:{...feedback},latencyMs:latency,completed,error,videoBound:Boolean(video),disposed};}
    function emit(){options.onState?.(state());}
    function ensure(){if(disposed)throw failure('DISPOSED','Lesson player is disposed.');if(!manifest)throw failure('NO_LESSON','Choose a lesson first.');}
    function resetFeedback(){feedback={status:'idle'};holdStart=null;holdLast=null;holdEvent=null;releaseRequired=false;releaseStart=null;lastMatchedMidi=null;lastPitch=null;lastOnset=null;listenReleased=true;}
    function stopFrames(){if(videoFrame!==null)video?.cancelVideoFrameCallback?.(videoFrame);videoFrame=null;if(videoTimer!==null)(env.clearInterval||clearInterval)(videoTimer);videoTimer=null;if(audioTimer!==null)(env.clearInterval||clearInterval)(audioTimer);audioTimer=null;}
    function stopPlayback(){generation++;playing=false;pending=false;audio.stop();stopFrames();if(video&&!video.paused)video.pause();}
    function pause(){if(disposed)return state();stopPlayback();holdStart=null;holdLast=null;holdEvent=null;emit();return state();}
    function load(input){if(disposed)throw failure('DISPOSED','Lesson player is disposed.');const validated=validateManifest(input);stopPlayback();unbindVideo();manifest=validated;position=0;rate=1;mode='demo';loop={enabled:false,start:0,end:manifest.duration};completed=false;error=null;resetFeedback();emit();return state();}
    function reportError(cause,token){if(disposed||token!==generation)return;stopPlayback();error={code:cause?.code||'PLAYBACK_FAILED',message:cause?.message||'Lesson playback failed.'};emit();options.onError?.(cause);}
    function finish(token){if(token!==generation||disposed)return;if(loop.enabled){position=loop.start;playing=false;pending=false;play().catch(()=>{});return;}position=manifest.duration;playing=false;pending=false;completed=true;stopFrames();emit();}
    const anchors=()=>manifest?.media?.anchors||[];
    function videoTick(token){
      if(disposed||token!==generation||!playing||!video)return;
      position=clamp(mapTime(video.currentTime,anchors()),0,manifest.duration);
      if(loop.enabled&&position>=loop.end-.01){video.currentTime=mapTime(loop.start,anchors(),true);position=loop.start;resetFeedback();}
      else if(position>=manifest.duration-.005){video.pause();finish(token);return;}
      emit();
    }
    function startVideoFrames(token){stopFrames();if(typeof video?.requestVideoFrameCallback==='function'){const frame=()=>{videoFrame=null;videoTick(token);if(!disposed&&token===generation&&playing)videoFrame=video.requestVideoFrameCallback(frame);};videoFrame=video.requestVideoFrameCallback(frame);}else videoTimer=(env.setInterval||setInterval)(()=>videoTick(token),40);}
    async function play(){
      ensure();if(playing||pending)return {started:playing,pending};
      if(position>=manifest.duration-.005)position=loop.enabled?loop.start:0;
      if(loop.enabled&&(position<loop.start||position>=loop.end))position=loop.start;
      completed=false;error=null;const token=++generation;pending=true;emit();
      try{
        if(mode==='wait'){
          audio.stop();if(video){video.pause();video.muted=true;}const index=nextIndex();if(index<0){finish(token);return {started:false,completed:true};}
          position=Math.max(loop.enabled?loop.start:0,manifest.events[index].start);pending=false;playing=true;emit();return {started:true,source:'microphone-wait'};
        }
        if(video&&manifest.media.kind==='video'){
          const bound=video;audio.stop();bound.currentTime=mapTime(position,anchors(),true);bound.playbackRate=rate;bound.preservesPitch=true;bound.muted=mode!=='demo';
          await bound.play();if(disposed||token!==generation){if(!playing&&!pending)bound.pause();return {started:false,cancelled:true};}pending=false;playing=true;startVideoFrames(token);emit();return {started:true,source:'lesson-video'};
        }
        if(mode==='listen'){
          // Reuse the shared AudioContext clock without creating silent voices
          // or requiring an audible master volume. Microphone input stays local.
          audio.stop();if(typeof audio.ready!=='function')throw failure('CLOCK_UNAVAILABLE','The shared audio clock is unavailable.');
          const context=await audio.ready();if(disposed||token!==generation)return {started:false,cancelled:true};
          if(!Number.isFinite(context?.currentTime))throw failure('CLOCK_UNAVAILABLE','The shared audio clock is unavailable.');
          const base=context.currentTime,start=position,end=loop.enabled?loop.end:manifest.duration;pending=false;playing=true;
          const tick=()=>{if(disposed||token!==generation)return;const raw=start+Math.max(0,context.currentTime-base)*rate;
            if(raw>=end){if(!loop.enabled){finish(token);return;}const next=loop.start+(raw-end)%(loop.end-loop.start);if(next<position)resetFeedback();position=next;}
            else position=raw;emit();};
          audioTimer=(env.setInterval||setInterval)(tick,25);tick();return {started:true,source:'silent-audio-clock'};
        }
        const start=position,end=loop.enabled?loop.end:manifest.duration,continuousLoop=loop.enabled&&Math.abs(start-loop.start)<.001;
        const plan=manifest.events.map((event,i)=>({...event,i})).filter(event=>event.end>start&&event.start<end).map(event=>({i:event.i,start:Math.max(0,event.start-start)/rate,end:(Math.min(end,event.end)-start)/rate,freq:mode==='demo'?hz(event.midi):0})).filter(event=>event.end-event.start>=.01);
        const tail=(end-start)/rate;
        if(!plan.length||plan[plan.length-1].end<tail-.01)plan.push({i:-1,start:plan.length?plan[plan.length-1].end:0,end:tail,freq:0});
        if(!plan.length||tail<.01){finish(token);return {started:false,completed:true};}
        const result=await audio.play(plan,{voice:mode==='demo'?'violin-sample':'clean-synth',loop:continuousLoop,
          onPosition(index,time){if(disposed||token!==generation)return;const next=clamp(start+time*rate,start,end);if(next<position)resetFeedback();position=next;pending=false;playing=true;emit();},
          onEnd(outcome){if(outcome?.error){reportError(outcome.error,token);return;}finish(token);},onError:cause=>reportError(cause,token)});
        if(disposed||token!==generation)return {started:false,cancelled:true};
        if(result?.started===false){pending=false;playing=false;emit();return result;}
        pending=false;playing=true;emit();return {started:true,source:mode==='demo'?'violin-sample':'silent-audio-clock'};
      }catch(cause){if(disposed||token!==generation)return {started:false,cancelled:true};reportError(cause,token);throw cause;}
    }
    async function seek(value){ensure();number(value,0,manifest.duration,'Seek position is invalid.');const resume=playing||pending;stopPlayback();position=clamp(value,0,manifest.duration);completed=false;resetFeedback();if(video)video.currentTime=mapTime(position,anchors(),true);emit();return resume?play():state();}
    async function replay(){ensure();stopPlayback();position=loop.enabled?loop.start:0;completed=false;resetFeedback();return play();}
    async function setRate(value){ensure();number(value,.5,1.25,'Playback rate must be 0.5–1.25.');const resume=playing||pending;stopPlayback();rate=value;emit();return resume?play():state();}
    async function setLoop(value){ensure();if(!value||typeof value.enabled!=='boolean')throw failure('INVALID_LOOP','Loop state is invalid.');const start=number(value.start,0,manifest.duration,'Loop start is invalid.'),end=number(value.end,0,manifest.duration,'Loop end is invalid.');if(end-start<.1)throw failure('INVALID_LOOP','A loop must be at least 0.1 seconds.');const resume=playing||pending;stopPlayback();loop={enabled:value.enabled,start,end};if(loop.enabled&&(position<start||position>=end))position=start;completed=false;resetFeedback();emit();return resume?play():state();}
    async function setMode(value){ensure();if(!['demo','listen','wait'].includes(value))throw failure('INVALID_MODE','Unknown lesson mode.');const resume=playing||pending;stopPlayback();mode=value;resetFeedback();emit();return resume?play():state();}
    function setLatency(value){latency=number(value,0,500,'Latency must be 0–500 milliseconds.');emit();return state();}
    function unbindVideo(){stopFrames();for(const [name,fn] of videoListeners)video?.removeEventListener?.(name,fn);videoListeners.length=0;video=null;}
    function bindVideo(element){if(disposed)throw failure('DISPOSED','Lesson player is disposed.');pause();unbindVideo();if(element){video=element;video.playsInline=true;video.preservesPitch=true;const ended=()=>{if(video?.ended&&!completed)finish(generation);};const interrupted=()=>{if(playing&&video.paused){playing=false;pending=false;stopFrames();emit();}};const failed=()=>reportError(failure('VIDEO_FAILED','Lesson video could not be played.'),generation);for(const pair of [['ended',ended],['pause',interrupted],['error',failed]]){video.addEventListener?.(...pair);videoListeners.push(pair);}}emit();return state();}
    function ingestPitch(frequency,analysis={}){
      if(disposed||!manifest||!playing||mode==='demo')return state();
      const clock=now(),at=mode==='listen'?Math.max(0,position-latency/1000):position,index=activeIndex(at),event=manifest.events[index];
      feedback=assessPitch(frequency,analysis,event);
      if(mode==='listen'){
        if(feedback.status==='uncertain'){listenReleased=true;lastPitch=null;}
        else{
          const changed=lastPitch===null||Math.abs(1200*Math.log2(frequency/lastPitch))>80;
          if(listenReleased||changed){lastOnset=clock;listenReleased=false;if(event)feedback.rhythmMs=Math.round((at-event.start)*1000);}
          lastPitch=frequency;
        }
        emit();return state();
      }
      if(!event){finish(generation);return state();}
      if(releaseRequired){
        const different=feedback.status==='uncertain'||Math.abs(1200*Math.log2(frequency/hz(lastMatchedMidi)))>80;
        if(different){if(releaseStart===null)releaseStart=clock;if(clock-releaseStart>=120){releaseRequired=false;releaseStart=null;holdStart=null;}}else releaseStart=null;
        if(releaseRequired){feedback={...feedback,status:'release'};emit();return state();}
      }
      if(feedback.status==='in-tune'){
        if(holdEvent!==event.id||holdStart===null||holdLast===null||clock-holdLast>150||clock<holdLast){holdStart=clock;holdEvent=event.id;}holdLast=clock;
        if(clock-holdStart>=220){
          feedback={...feedback,status:'matched'};lastMatchedMidi=event.midi;holdStart=null;holdLast=null;holdEvent=null;const end=loop.enabled?loop.end:manifest.duration,next=manifest.events.findIndex((item,i)=>i>index&&item.start<end-.001);
          if(next>=0){position=manifest.events[next].start;releaseRequired=manifest.events[next].midi===lastMatchedMidi;}
          else if(loop.enabled){position=loop.start;const target=manifest.events[activeIndex()];releaseRequired=target?.midi===lastMatchedMidi;}
          else{position=manifest.duration;playing=false;completed=true;}
        }
      }else{holdStart=null;holdLast=null;holdEvent=null;}
      emit();return state();
    }
    const onHidden=()=>{if(doc?.hidden&&manifest&&(playing||pending))pause();};doc?.addEventListener?.('visibilitychange',onHidden);
    function dispose(){if(disposed)return;stopPlayback();unbindVideo();doc?.removeEventListener?.('visibilitychange',onHidden);disposed=true;manifest=null;}
    return {load,play,pause,replay,seek,setRate,setLoop,setMode,setLatency,bindVideo,ingestPitch,state,dispose};
  }
  const api={create,validateManifest,validateAnchors,mapTime,assessPitch};
  if(typeof module==='object'&&module.exports)module.exports=api;
  global.SVLessonEngine=api;
})(typeof window!=='undefined'?window:globalThis);

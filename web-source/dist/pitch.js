'use strict';
/* Browser-local monophonic pitch monitor. Confidence is periodicity, not a
 * probability of correct violin fundamental detection. Physical instruments,
 * vibrato, double stops and input latency still require separate validation. */
const SVPitch=(()=>{
  const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const MIN_HZ=80,MAX_HZ=3000;
  let gate=0.008;
  function rms(buf){let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];return Math.sqrt(sum/buf.length);}
  const windows=new Map();
  function hann(length){if(!windows.has(length)){if(windows.size>=4)windows.clear();const weights=new Float64Array(length);for(let i=0;i<length;i++)weights[i]=.5-.5*Math.cos(2*Math.PI*i/(length-1));windows.set(length,weights);}return windows.get(length);}
  // Weighted sinusoid fit. Used only to reject unsupported/subharmonic estimates,
  // never to turn an arbitrary detected octave into a guessed fundamental.
  function fitTone(buf,hz,sampleRate,subtract=false){
    let cc=0,ss=0,cs=0,xc=0,xs=0;
    const step=2*Math.PI*hz/sampleRate,n=buf.length,weights=hann(n),cosStep=Math.cos(step),sinStep=Math.sin(step);let c=1,s=0;
    for(let i=0;i<n;i++){const w=weights[i];cc+=w*c*c;ss+=w*s*s;cs+=w*c*s;xc+=w*buf[i]*c;xs+=w*buf[i]*s;const next=c*cosStep-s*sinStep;s=s*cosStep+c*sinStep;c=next;}
    const d=cc*ss-cs*cs;if(d<=1e-9)return 0;const a=(xc*ss-xs*cs)/d,b=(xs*cc-xc*cs)/d;
    if(subtract){c=1;s=0;for(let i=0;i<n;i++){buf[i]-=a*c+b*s;const next=c*cosStep-s*sinStep;s=s*cosStep+c*sinStep;c=next;}}
    return Math.hypot(a,b);
  }
  function spectralCheck(buf,hz,sampleRate){
    const remaining=new Float64Array(buf),amplitudes=[];
    for(let harmonic=1;harmonic<=6&&hz*harmonic<sampleRate*.48;harmonic++)amplitudes.push(fitTone(remaining,hz*harmonic,sampleRate,true));
    const fundamental=amplitudes[0]||0,strongest=Math.max(...amplitudes,0),residual=rms(remaining);
    if(strongest>0&&fundamental<strongest*.06)return {reason:'missing-fundamental',fundamentalRatio:fundamental/strongest};
    const half=hz/2>=MIN_HZ?fitTone(remaining,hz/2,sampleRate):0,thirdHalf=hz*1.5<sampleRate*.48?fitTone(remaining,hz*1.5,sampleRate):0;
    const residualPower=residual*residual,halfSupport=residualPower>1e-12?.5*half*half/residualPower:0,pairSupport=residualPower>1e-12?.5*(half*half+thirdHalf*thirdHalf)/residualPower:0;
    if(fundamental>0&&half/fundamental>.003&&((thirdHalf/fundamental>.003&&pairSupport>.30)||halfSupport>.65))return {reason:'ambiguous-octave',fundamentalRatio:fundamental/(strongest||1)};
    if(residualPower>rms(buf)**2*.15)return {reason:'multiple-or-noisy',fundamentalRatio:fundamental/(strongest||1)};
    return {reason:null,fundamentalRatio:fundamental/(strongest||1)};
  }
  function refineFrequency(buf,hz,sampleRate,level){
    // A small phase drift between two Hann windows refines the same candidate.
    // Missing fundamentals are not strong enough to qualify for this step.
    const half=Math.floor(buf.length/2),fits=[],weights=hann(half),step=2*Math.PI*hz/sampleRate,cosStep=Math.cos(step),sinStep=Math.sin(step);
    for(const start of [0,half]){
      let cc=0,ss=0,cs=0,xc=0,xs=0,c=Math.cos(step*start),s=Math.sin(step*start);
      for(let i=start;i<start+half;i++){const w=weights[i-start];cc+=w*c*c;ss+=w*s*s;cs+=w*c*s;xc+=w*buf[i]*c;xs+=w*buf[i]*s;const next=c*cosStep-s*sinStep;s=s*cosStep+c*sinStep;c=next;}
      const d=cc*ss-cs*cs;if(d<=1e-9)return hz;const a=(xc*ss-xs*cs)/d,b=(xs*cc-xc*cs)/d;fits.push({phase:Math.atan2(a,b),amplitude:Math.hypot(a,b)});
    }
    if(fits.some(f=>f.amplitude<level*.08))return hz;
    const difference=fits[1].phase-fits[0].phase,delta=Math.atan2(Math.sin(difference),Math.cos(difference))*sampleRate/(2*Math.PI*half);
    return Math.abs(delta)<hz*.01?hz+delta:hz;
  }
  function estimatePitch(buf,sampleRate){
    const level=rms(buf);let peak=0,flat=0;for(let i=0;i<buf.length;i++)peak=Math.max(peak,Math.abs(buf[i]));
    for(let i=2;i<buf.length;i++)if(peak>.01&&Math.abs(Math.abs(buf[i])-peak)<1e-6&&Math.abs(Math.abs(buf[i-1])-peak)<1e-6&&Math.abs(Math.abs(buf[i-2])-peak)<1e-6)flat++;
    const clipping=peak>=.985||flat/Math.max(1,buf.length)>.03;
    const invalid=reason=>({frequency:0,confidence:0,rms:Number.isFinite(level)?level:0,level:Number.isFinite(level)?level:0,peak:Number.isFinite(peak)?peak:0,clipping,gate,valid:false,reason,minFrequency:MIN_HZ,maxFrequency:MAX_HZ,method:'yin-periodicity'});
    if(!Number.isFinite(sampleRate)||sampleRate<=0||buf.length<128||!Number.isFinite(level))return invalid('invalid-input');
    if(level<gate)return invalid('below-noise-gate');
    if(clipping)return invalid('clipping');
    const minLag=Math.max(2,Math.ceil(sampleRate/MAX_HZ));
    const maxLag=Math.min(Math.floor(sampleRate/MIN_HZ),Math.floor(buf.length/2)-1);
    if(minLag>=maxLag)return invalid('insufficient-window');
    const length=buf.length-maxLag,values=new Float64Array(maxLag+1);
    let running=0;
    for(let lag=1;lag<=maxLag;lag++){
      let difference=0;
      for(let i=0;i<length;i++){const d=buf[i]-buf[i+lag];difference+=d*d;}
      running+=difference;
      values[lag]=running>0?difference*lag/running:1;
    }
    let candidate=-1;
    for(let lag=minLag;lag<maxLag;lag++){
      if(values[lag]<0.1){while(lag+1<maxLag&&values[lag+1]<values[lag])lag++;candidate=lag;break;}
    }
    if(candidate<0)return invalid('low-periodicity');
    // A very weak fundamental can produce an early octave minimum. Prefer a
    // substantially stronger doubled-period minimum, but do not infer certainty.
    let ambiguous=false;
    const twice=candidate*2;
    if(values[candidate]>0.015&&twice+2<maxLag){
      let alternate=twice;
      for(let lag=twice-2;lag<=twice+2;lag++)if(values[lag]<values[alternate])alternate=lag;
      if(values[alternate]<values[candidate]*0.25){candidate=alternate;ambiguous=true;}
    }
    let lag=candidate;
    if(candidate>minLag&&candidate<maxLag){
      const a=values[candidate-1],b=values[candidate],c=values[candidate+1],denom=a-2*b+c;
      if(denom!==0)lag=candidate+Math.max(-0.5,Math.min(0.5,0.5*(a-c)/denom));
    }
    const frequency=refineFrequency(buf,sampleRate/lag,sampleRate,level);
    const confidence=Math.max(0,Math.min(1,1-values[candidate]));
    const spectrum=Number.isFinite(frequency)&&frequency>=MIN_HZ&&frequency<=MAX_HZ?spectralCheck(buf,frequency,sampleRate):{reason:null};
    const valid=Number.isFinite(frequency)&&frequency>=MIN_HZ&&frequency<=MAX_HZ&&confidence>=0.85&&!ambiguous&&!spectrum.reason;
    return {frequency:valid?frequency:0,candidateFrequency:frequency,confidence:ambiguous||spectrum.reason?Math.min(confidence,0.5):confidence,rms:level,level,peak,clipping,gate,valid,reason:ambiguous?'ambiguous-period':spectrum.reason||(valid?'periodic':'out-of-range'),fundamentalRatio:spectrum.fundamentalRatio,minFrequency:MIN_HZ,maxFrequency:MAX_HZ,method:'yin-periodicity'};
  }
  function detectPitch(buf,sampleRate){return estimatePitch(buf,sampleRate).frequency;}
  function freqToNote(freq,a4=440){
    if(!Number.isFinite(freq)||freq<=0||!Number.isFinite(a4)||a4<=0)return null;
    const n=Math.round(12*Math.log2(freq/a4))+69;
    const cents=Math.round(1200*Math.log2(freq/(a4*Math.pow(2,(n-69)/12))));
    return {name:NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1),cents,midi:n};
  }
  function monitor(stream,cb,settings={}){
    const shared=settings?.context,ownsContext=!shared,Ctx=ownsContext&&(window.AudioContext||window.webkitAudioContext),context=shared||new Ctx();
    if(shared&&context.state!=='running')throw Error('Shared audio context must be running before pitch monitoring');
    let source,analyser,timer=null,alive=true;
    const stop=()=>{if(!alive)return;alive=false;if(timer!==null)clearInterval(timer);timer=null;try{source?.disconnect();}catch{}try{analyser?.disconnect();}catch{}if(ownsContext)try{context.close().catch(()=>{});}catch{}};
    try{
      source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=4096;source.connect(analyser);
      const buf=new Float32Array(analyser.fftSize);
      // The engine supplies an already unlocked context. Borrow it without
      // another resume call or speaker connection; its owner controls disposal.
      if(ownsContext&&context.state==='suspended')context.resume().catch(()=>{});
      timer=setInterval(()=>{
        if(!alive)return;
        analyser.getFloatTimeDomainData(buf);
        const result=estimatePitch(buf,context.sampleRate);
        cb(result.frequency,{...result,audioTime:context.currentTime,analysisWindowMs:buf.length/context.sampleRate*1000});
      },40);
      return {context,stop};
    }catch(cause){stop();throw cause;}
  }
  function setGate(v){gate=Math.min(0.05,Math.max(0.001,Number(v)||0.008));return gate;}
  function getGate(){return gate;}
  return {rms,estimatePitch,detectPitch,freqToNote,monitor,setGate,getGate,MIN_HZ,MAX_HZ};
})();
if(typeof module==='object'&&module.exports)module.exports=SVPitch;

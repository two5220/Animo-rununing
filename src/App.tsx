import React, { useState, useRef, useCallback, useEffect } from 'react';
import { OdometerGroup, type AnimStyle } from './components/Odometer';
import { translations, LANG_NAMES, type Language } from './i18n';

/* ─── Types ─── */
interface TextOverlay { id: string; text: string; x: number; y: number; fontSize: number; color: string; fontFamily: string; rotation: number; }
interface EmojiOverlay { id: string; emoji: string; x: number; y: number; size: number; rotation: number; }
interface StickerData { id: string; url: string; x: number; y: number; size: number; rotation: number; borderWidth: number; borderColor: string; aspectRatio: number; img?: HTMLImageElement; useTimeRange?: boolean; startTime?: number; endTime?: number; rounded?: boolean; }

/* ─── Constants ─── */
const FONTS = ['Orbitron','Russo One','Black Ops One','Bungee','Silkscreen'];
const RUNNING_EMOJIS = ['🏃','🏃‍♂️','🏃‍♀️','👟','🥇','🏅','⏱️','🔥','💪','❤️','🎯','⚡','🌟','🏆','🎽','💨','👣','🏁','🥈','🥉','⭐','✨','🎉','💯','❤️‍🔥','🦵','🫀','🌈','🌅','🌄','😤','🤩','💫','🎵','🌸','🍀','🌺','🌻','💐','🌿'];
const ASPECT_RATIOS: Record<string, { w: number; h: number; label: string }> = { '1:1': { w: 1080, h: 1080, label: '1:1' }, '16:9': { w: 1920, h: 1080, label: '16:9' }, '9:16': { w: 1080, h: 1920, label: '9:16' } };
const SOUND_TYPES = ['drop','bubble','tick'] as const;
let CURRENT_SPIN = 3;

const THEMES = [
  { name: 'Midnight', digit: '#e94560', label: '#a0aec0' },
  { name: 'Classic', digit: '#ffffff', label: '#94a3b8' },
  { name: 'Dark', digit: '#111111', label: '#555555' },
  { name: 'Fluorescent', digit: '#ccff00', label: '#333333' },
  { name: 'Power Red', digit: '#ff0000', label: '#ffffff' },
  { name: 'Silver', digit: '#d1d5db', label: '#4b5563' },
  { name: 'Nature', digit: '#4ade80', label: '#064e3b' },
  { name: 'Violet', digit: '#c084fc', label: '#4c1d95' },
];

type TextAlign = 'left' | 'center' | 'right';
type IntroEffect = 'fade' | 'slide-up' | 'zoom-in' | 'none';
const ANIM_DELAY = 300;
const DEFAULT_STAGGER = 80;

/* ─── Easing ─── */
function bezierComp(t: number, p1: number, p2: number) { const mt=1-t; return 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t; }
function makeCubicBezier(x1:number,y1:number,x2:number,y2:number){return(x:number)=>{if(x<=0)return 0;if(x>=1)return 1;let lo=0,hi=1;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(bezierComp(m,x1,x2)<x)lo=m;else hi=m;}const u=(lo+hi)/2;return bezierComp(u,y1,y2);}};
const EASINGS: Record<AnimStyle,(t:number)=>number> = {
  default: makeCubicBezier(0.1,0.9,0.2,1),
  bounce: makeCubicBezier(0.34,1.56,0.64,1),
  machine: makeCubicBezier(0.77,0,0.175,1)
};

/* ─── Sound (WebAudio) ─── */
function playSound(type: string, volume: number, durationMs: number, animStyle: AnimStyle, ctx?: AudioContext, dests?: AudioNode[]): AudioContext {
  const audioCtx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => undefined);
  }
  const destinations = dests || [audioCtx.destination];
  
  try{
    const now = audioCtx.currentTime;
    const totalDur = Math.max(0.2, durationMs/1000);
    const easingFn = EASINGS[animStyle];
    const isMachine = animStyle==='machine';
    const isSmooth = animStyle==='default';
    const baseInterval = isMachine?45:(isSmooth?108:90);
    const baseClicks = Math.floor(durationMs/baseInterval);
    const totalClicks = Math.max(15, Math.min(baseClicks, 250));
    const inv = (y:number)=>{ if(y<=0)return 0; if(y>=1)return 1; let lo=0,hi=1; for(let i=0;i<24;i++){const m=(lo+hi)/2; if(easingFn(m)<y)lo=m; else hi=m;} return (lo+hi)/2; };
    
    let last = -1;
    for(let i=0;i<=totalClicks;i++){
      const p=i/totalClicks; const pj=Math.max(0,Math.min(1,p+(Math.random()-0.5)*0.005));
      const tNorm=inv(pj); const t=tNorm*totalDur; if(t>totalDur+0.05)break; const u=t/totalDur;
      let minGap=0.06; if(animStyle==='default'){ const low=CURRENT_SPIN<=2; minGap = low ? (u<0.4?0.18:0.05) : (u<0.35?0.13:0.05); } else if(animStyle==='bounce'){ minGap = u<0.35?0.11:0.06; } else if(animStyle==='machine'){ const s1=CURRENT_SPIN===1; minGap = (u>0.22&&u<0.78)?(s1?0.095:0.08):0.05; }
      if(last>=0 && (t-last)<minGap) continue; last=t; const fade=1-(t/totalDur)*0.4;
      
      destinations.forEach(dest => {
        if(type==='tick'){
          const osc=audioCtx.createOscillator(); const g=audioCtx.createGain(); osc.connect(g); g.connect(dest);
          osc.type='square'; osc.frequency.setValueAtTime(600+Math.random()*400, now+t);
          g.gain.setValueAtTime(volume*0.15*fade, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.03);
          osc.start(now+t); osc.stop(now+t+0.04);
        } else if(type==='casual'){
          const len=Math.floor(audioCtx.sampleRate*0.012); const buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate); const d=buf.getChannelData(0);
          for(let j=0;j<len;j++) d[j]=(Math.random()*2-1)*(1-j/len);
          const src=audioCtx.createBufferSource(); src.buffer=buf; const bp=audioCtx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(2500+Math.random()*500, now+t); bp.Q.setValueAtTime(2, now+t);
          const g=audioCtx.createGain(); src.connect(bp); bp.connect(g); g.connect(dest);
          g.gain.setValueAtTime(volume*0.12*fade, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.015); src.start(now+t);
          const o=audioCtx.createOscillator(); const g2=audioCtx.createGain(); o.connect(g2); g2.connect(dest); o.type='triangle'; o.frequency.setValueAtTime(800+Math.random()*300, now+t);
          g2.gain.setValueAtTime(volume*0.06*fade, now+t); g2.gain.exponentialRampToValueAtTime(0.001, now+t+0.02); o.start(now+t); o.stop(now+t+0.025);
        } else if(type==='drop'){
          const o=audioCtx.createOscillator(); const g=audioCtx.createGain(); o.connect(g); g.connect(dest); o.type='sine'; const f0=1400+Math.random()*600; o.frequency.setValueAtTime(f0, now+t);
          o.frequency.exponentialRampToValueAtTime(Math.max(500,f0*0.35), now+t+0.06); g.gain.setValueAtTime(volume*0.12*fade, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.08); o.start(now+t); o.stop(now+t+0.09);
        } else if(type==='bubble'){
          const nlen=Math.floor(audioCtx.sampleRate*0.016); const nbuf=audioCtx.createBuffer(1,nlen,audioCtx.sampleRate); const nd=nbuf.getChannelData(0);
          for(let k=0;k<nlen;k++) nd[k]=(Math.random()*2-1)*(1-k/nlen);
          const src=audioCtx.createBufferSource(); src.buffer=nbuf; const bp=audioCtx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(3000, now+t); bp.Q.setValueAtTime(3, now+t);
          const g=audioCtx.createGain(); src.connect(bp); bp.connect(g); g.connect(dest); g.gain.setValueAtTime(volume*0.1*fade, now+t); g.gain.exponentialRampToValueAtTime(0.001, now+t+0.02); src.start(now+t);
          const o=audioCtx.createOscillator(); const g2=audioCtx.createGain(); o.connect(g2); g2.connect(dest); o.type='sine'; const f=1000+Math.random()*400; o.frequency.setValueAtTime(f, now+t);
          g2.gain.setValueAtTime(volume*0.05*fade, now+t); g2.gain.exponentialRampToValueAtTime(0.001, now+t+0.035); o.start(now+t); o.stop(now+t+0.04);
        }
      });
    }
  }catch(_e){}
  return audioCtx;
}

/* ─── Canvas ─── */
function drawCanvasDigit(ctx: CanvasRenderingContext2D, x:number,y:number, width:number,height:number, scrollPos:number, fontFamily:string, fontSize:number, textColor:string, spinCycles:number){
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,width,height); ctx.clip(); ctx.fillStyle=textColor; ctx.font=`bold ${fontSize}px ${fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const offset=scrollPos*height; const total=10*(spinCycles+1); for(let i=0;i<total;i++){ const ny=y+height/2+i*height-offset; if(ny>y-height && ny<y+height*2){ ctx.fillText(String(i%10), x+width/2, ny); }} ctx.restore();
}

interface SceneConfig { digitColor:string; labelColor:string; fontFamily:string; layout:'vertical'|'horizontal'; textAlign:TextAlign; spacing:number; recordX:number; recordY:number; baseFontSize:number; labelDuration:string; labelDistance:string; labelPace:string; unitKm:string; unitPace:string; durationStr:string; distanceStr:string; paceStr:string; showLabels:boolean; showUnits:boolean; labelScale:number; spinCycles:number; animDuration:number; staggerDelay:number; animStyle:AnimStyle; textOverlays:TextOverlay[]; emojiOverlays:EmojiOverlay[]; stickerData:StickerData[]; bgMedia: HTMLImageElement|HTMLVideoElement|null; bgMediaX:number; bgMediaY:number; bgMediaScale:number; greenScreen:boolean; labelGapPx:number; canvasW:number; canvasH:number; previewW:number; previewH:number; waitBeforeAnim:number; introEffect:IntroEffect; animEnabled: boolean; videoMuted: boolean; videoVolume: number; }

function calcDigitsWidth(value:string, digitW:number, digitGap:number, sepW:number){
  let w=0;
  const chars = value.split('');
  chars.forEach((ch, i)=>{
    if(/[0-9]/.test(ch)){ w += digitW; }
    else { w += sepW; }
    if(i < chars.length - 1) w += digitGap;
  });
  return w;
}

function drawScene(ctx:CanvasRenderingContext2D, w:number,h:number, elapsedMs:number, cfg:SceneConfig){
  ctx.clearRect(0,0,w,h); if(cfg.greenScreen && !cfg.bgMedia){ ctx.fillStyle='#00FF00'; ctx.fillRect(0,0,w,h); }
  if(cfg.bgMedia){ 
    ctx.save();
    ctx.beginPath();
    ctx.rect(0,0,w,h);
    ctx.clip(); // Clip everything to the canvas boundaries
    const mw=(cfg.bgMedia as HTMLImageElement).naturalWidth || (cfg.bgMedia as HTMLVideoElement).videoWidth || w; const mh=(cfg.bgMedia as HTMLImageElement).naturalHeight || (cfg.bgMedia as HTMLVideoElement).videoHeight || h; const fitScale=Math.min(w/mw,h/mh); const fitW=mw*fitScale; const fitH=mh*fitScale; const userScale=cfg.bgMediaScale/100; const finalW=fitW*userScale; const finalH=fitH*userScale; const cx=w/2+(cfg.bgMediaX-50)*0.01*w; const cy=h/2+(cfg.bgMediaY-50)*0.01*h; const dx=cx-finalW/2; const dy=cy-finalH/2; ctx.drawImage(cfg.bgMedia, dx,dy,finalW,finalH); 
    ctx.restore();
  }
  
  const waitMs = cfg.animEnabled ? cfg.waitBeforeAnim * 1000 : 0;
  if(cfg.animEnabled && elapsedMs < waitMs) return; // Hidden during wait time if anim enabled

  const actualElapsed = cfg.animEnabled ? Math.max(0, elapsedMs - waitMs) : 100000; // Force end state if no anim
  const scaleX=w/cfg.previewW, scaleY=h/cfg.previewH, scale=Math.min(scaleX,scaleY);
  const baseFS=cfg.baseFontSize*scale; const digitW=baseFS*0.7, digitH=baseFS*1.35, digitGap=baseFS*0.06*(cfg.spacing/10), sepW=baseFS*0.35; const labelFS=baseFS*0.4*(cfg.labelScale/100); const labelGap=(cfg.labelGapPx-10)*scale; const suffixFS=baseFS*0.54; const metricGap=(15+cfg.spacing*3)*scale; const easingFn=EASINGS[cfg.animStyle];
  const metrics=[{label:cfg.labelDuration,value:cfg.durationStr,suffix:''},{label:cfg.labelDistance,value:cfg.distanceStr,suffix:cfg.unitKm},{label:cfg.labelPace,value:cfg.paceStr,suffix:cfg.unitPace}];
  const widths=metrics.map(m=>calcDigitsWidth(m.value,digitW,digitGap,sepW)); const blockH=(cfg.showLabels?labelFS+labelGap:0)+digitH; const centerX=(cfg.recordX/100)*w, centerY=(cfg.recordY/100)*h; const isVert=cfg.layout==='vertical';
  let totalW:number,totalH:number; if(isVert){ totalH=metrics.length*blockH+(metrics.length-1)*metricGap; totalW=Math.max(...widths);} else { totalW=widths.reduce((s,d)=>s+d,0)+(metrics.length-1)*metricGap; totalH=blockH; }
  let curX:number, curY:number; if(isVert){ curX=centerX; curY=centerY-totalH/2;} else { curX=centerX-totalW/2; curY=centerY-totalH/2; }

  // Intro Effect Calculation (First 500ms of actual playback)
  const introDur = cfg.animEnabled ? 500 : 0;
  const introProg = introDur > 0 ? Math.min(actualElapsed / introDur, 1) : 1;
  let globalAlpha = 1;
  let offsetY = 0;
  let globalScale = 1;

  if(cfg.animEnabled) {
    if(cfg.introEffect === 'fade') { globalAlpha = introProg; }
    else if(cfg.introEffect === 'slide-up') { globalAlpha = introProg; offsetY = (1 - introProg) * 30 * scale; }
    else if(cfg.introEffect === 'zoom-in') { globalAlpha = introProg; globalScale = 0.8 + 0.2 * introProg; }
  }

  ctx.save();
  ctx.globalAlpha = globalAlpha;
  ctx.translate(centerX, centerY);
  ctx.scale(globalScale, globalScale);
  ctx.translate(-centerX, -centerY + offsetY);

  metrics.forEach((m,mi)=>{
    const dw=widths[mi];
    let blockCX:number, blockTop:number;
    let labelAlign: CanvasTextAlign;
    let labelX: number;

    if(isVert){
      blockTop = curY;
      if(cfg.textAlign === 'left') {
        blockCX = (centerX - totalW/2) + dw/2;
        labelX = centerX - totalW/2;
        labelAlign = 'left';
      } else if(cfg.textAlign === 'right') {
        blockCX = (centerX + totalW/2) - dw/2;
        labelX = centerX + totalW/2;
        labelAlign = 'right';
      } else {
        blockCX = centerX;
        labelX = centerX;
        labelAlign = 'center';
      }
    } else {
      blockCX = curX + dw/2;
      blockTop = curY;
      labelX = blockCX;
      labelAlign = cfg.textAlign;
    }

    if(cfg.showLabels){
      ctx.fillStyle=cfg.labelColor; ctx.font=`600 ${labelFS}px ${cfg.fontFamily}`; ctx.textBaseline='top';
      ctx.textAlign = labelAlign;
      let lx = labelX;
      if(!isVert && cfg.textAlign==='left') lx = blockCX - dw/2;
      if(!isVert && cfg.textAlign==='right') lx = blockCX + dw/2;
      ctx.fillText(m.label.toUpperCase(), lx, blockTop);
    }

    const digitTop = blockTop + (cfg.showLabels?labelFS+labelGap:0);
    let dx = blockCX - dw/2;
    const chars = m.value.split('');
    chars.forEach((ch,ci)=>{
      if(/[0-9]/.test(ch)){
        const target=parseInt(ch); 
        const dDur=cfg.animDuration+ci*cfg.staggerDelay; 
        const prog=cfg.animEnabled ? Math.min(Math.max(actualElapsed,0)/dDur,1) : 1; 
        const eased=easingFn(prog); 
        const scroll=(cfg.animEnabled ? cfg.spinCycles*10+target : target)*eased;
        drawCanvasDigit(ctx,dx,digitTop,digitW,digitH,scroll,cfg.fontFamily,baseFS,cfg.digitColor,cfg.animEnabled ? cfg.spinCycles : 0);
        dx+=digitW;
      } else {
        ctx.fillStyle=cfg.digitColor; ctx.font=`bold ${baseFS*0.9}px ${cfg.fontFamily}`; ctx.textAlign='left'; ctx.textBaseline='top';
        ctx.fillText(ch, dx, digitTop+digitH*0.15);
        dx+=sepW;
      }
      if(ci < chars.length - 1) dx += digitGap;
    });

    if(m.suffix && cfg.showUnits){
      ctx.fillStyle=cfg.labelColor; ctx.font=`500 ${suffixFS}px ${cfg.fontFamily}`; ctx.textAlign='left'; ctx.textBaseline='bottom';
      ctx.fillText(m.suffix, dx+digitGap, digitTop+digitH-baseFS*0.15);
    }

    if(isVert){ curY+=blockH+metricGap;} else { curX+=dw+metricGap; }
  });
  ctx.restore();

  cfg.textOverlays.forEach(ov=>{
    ctx.save();
    ctx.translate((ov.x/100)*w, (ov.y/100)*h);
    ctx.rotate((ov.rotation * Math.PI) / 180);
    ctx.fillStyle=ov.color; ctx.font=`600 ${ov.fontSize*scale}px ${ov.fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(ov.text,0,0);
    ctx.restore();
  });
  cfg.emojiOverlays.forEach(ov=>{
    ctx.save();
    ctx.translate((ov.x/100)*w, (ov.y/100)*h);
    ctx.rotate((ov.rotation * Math.PI) / 180);
    ctx.font=`${ov.size*scale}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(ov.emoji,0,0);
    ctx.restore();
  });
  cfg.stickerData.forEach(st=>{
    if(!st.img) return;
    if(st.useTimeRange && cfg.animEnabled){
        const curSec = elapsedMs / 1000;
        if(curSec < (st.startTime || 0) || curSec > (st.endTime || 999)) return;
    }
    const sizeBase = st.size * scale;
    const finalW = st.aspectRatio >= 1 ? sizeBase : sizeBase * st.aspectRatio;
    const finalH = st.aspectRatio >= 1 ? sizeBase / st.aspectRatio : sizeBase;
    const sx=(st.x/100)*w; const sy=(st.y/100)*h;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((st.rotation * Math.PI) / 180);
    
    if(st.rounded){
        const r = Math.min(finalW, finalH) * 0.15;
        ctx.beginPath();
        ctx.roundRect(-finalW/2, -finalH/2, finalW, finalH, r);
        ctx.closePath();
        ctx.clip();
    }
    
    ctx.drawImage(st.img,-finalW/2,-finalH/2,finalW,finalH);
    
    if(st.borderWidth>0){
      ctx.restore();
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate((st.rotation * Math.PI) / 180);
      ctx.strokeStyle=st.borderColor;
      ctx.lineWidth=st.borderWidth*scale;
      if(st.rounded){
          const r = Math.min(finalW, finalH) * 0.15;
          ctx.beginPath();
          ctx.roundRect(-finalW/2, -finalH/2, finalW, finalH, r);
          ctx.stroke();
      } else {
          ctx.strokeRect(-finalW/2, -finalH/2, finalW, finalH);
      }
    }
    ctx.restore();
  });
}

/* ─── Utils ─── */
const uid = () => Math.random().toString(36).slice(2,10);
const pad2 = (n: string|number) => String(n).padStart(2,'0');

/* ─── Collapsible ─── */
function Section({ title, children }: { title: string; children: React.ReactNode; }){
  return(<div className="glass-panel p-3 fade-in"><div className="w-full flex items-center justify-between text-left"><span className="section-title mb-0">{title}</span></div><div className="mt-3 space-y-3">{children}</div></div>);
}

function ClampedNumberInput({ value, min, max, step, onChange, className, title, disabled }:{ value:number; min:number; max:number; step?:number; onChange:(v:number)=>void; className?:string; title?:string; disabled?:boolean; }){
  const [raw,setRaw]=useState(String(value)); const prev=useRef(value); useEffect(()=>{ if(value!==prev.current){ setRaw(String(value)); prev.current=value; }},[value]);
  const handleChange=(e:React.ChangeEvent<HTMLInputElement>)=>{ const v=e.target.value; setRaw(v); const n=Number(v); if(v!==''&&!isNaN(n)) onChange(n); };
  const handleBlur=()=>{ const n=Number(raw); const clamped=isNaN(n)||raw===''?Math.max(min,Math.min(max,value)):Math.max(min,Math.min(max,n)); onChange(clamped); setRaw(String(clamped)); prev.current=clamped; };
  return(<input type="number" min={min} max={max} step={step} className={className} value={raw} onChange={handleChange} onBlur={handleBlur} title={title} disabled={disabled}/>);
}

/* ─── Main App ─── */
export function App(){
  const [language,setLanguage]=useState<Language>('ko'); const t=useCallback((k:string)=>translations[language]?.[k]||k,[language]);
  const [hours,setHours]=useState('0'); const [minutes,setMinutes]=useState('32'); const [seconds,setSeconds]=useState('15'); const [distance,setDistance]=useState('5.21'); const [paceMin,setPaceMin]=useState('6'); const [paceSec,setPaceSec]=useState('12'); const [labelLang,setLabelLang]=useState<'en'|'ko'>('ko');
  const [showLabels,setShowLabels]=useState(true); const [showUnits,setShowUnits]=useState(true); const [digitColor,setDigitColor]=useState('#e94560'); const [labelColor,setLabelColor]=useState('#a0aec0'); const [metricFontSize,setMetricFontSize]=useState(100); const [labelFontSize,setLabelFontSize]=useState(105); const [metricAlign,setMetricAlign]=useState<TextAlign>('center'); const [selectedFont,setSelectedFont]=useState('Orbitron'); const [layout,setLayout]=useState<'vertical'|'horizontal'>('vertical'); const [spacing,setSpacing]=useState(3); const [labelGapValue,setLabelGapValue]=useState(4); const [recordX,setRecordX]=useState(50); const [recordY,setRecordY]=useState(50);
  const [animStyle,setAnimStyle]=useState<AnimStyle>('machine'); const [animDuration,setAnimDuration]=useState(5000); const [spinCycles,setSpinCycles]=useState(3); useEffect(()=>{ CURRENT_SPIN=spinCycles; },[spinCycles]); const [showValues,setShowValues]=useState(false); const [isAnimating,setIsAnimating]=useState(false); const [animKey,setAnimKey]=useState(0); const [layoutChanging,setLayoutChanging]=useState(false);
  const [soundEnabled,setSoundEnabled]=useState(true); const [soundVolume,setSoundVolume]=useState(0.5); const [soundType,setSoundType]=useState('tick'); const activeAudioCtxRef=useRef<AudioContext|null>(null); const previewAudioCtxRef=useRef<AudioContext|null>(null);
  const [extraHoldTime, setExtraHoldTime] = useState(2);
  const [waitBeforeAnim, setWaitBeforeAnim] = useState(2);
  const [useWait, setUseWait] = useState(false);
  const [introEffect, setIntroEffect] = useState<IntroEffect>('fade');
  const [animEnabled,setAnimEnabled]=useState(true);
  const [stickers,setStickers]=useState<StickerData[]>([]);
  const stickerInputRef=useRef<HTMLInputElement>(null);
  const recAudioCtxRef=useRef<AudioContext|null>(null);
  const [textOverlays,setTextOverlays]=useState<TextOverlay[]>([]); const [emojiOverlays,setEmojiOverlays]=useState<EmojiOverlay[]>([]);
  const [bgMediaUrl,setBgMediaUrl]=useState<string|null>(null); const [bgMediaType,setBgMediaType]=useState<'image'|'video'>('image'); const [bgMediaScale,setBgMediaScale]=useState(100); const [bgMediaX,setBgMediaX]=useState(50); const [bgMediaY,setBgMediaY]=useState(50);
  const [bgEnlargeEnabled, setBgEnlargeEnabled] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1);
  const [videoPaused, setVideoPaused] = useState(true);
  const [aspectRatio,setAspectRatio]=useState('1:1'); const [customAR,setCustomAR]=useState<{w:number;h:number}|null>(null); const [greenScreen,setGreenScreen]=useState(false); const [isRecording,setIsRecording]=useState(false); const [videoUrl,setVideoUrl]=useState<string|null>(null); const [videoMimeType,setVideoMimeType]=useState<string|null>(null);
  const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);
  const [activeTab,setActiveTab]=useState(0); const [selectedElement,setSelectedElement]=useState<string|null>(null);
  const [isResizing,setIsResizing]=useState(false); const resizeTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null); const markResizing=useCallback(()=>{ setIsResizing(true); if(resizeTimerRef.current)clearTimeout(resizeTimerRef.current); resizeTimerRef.current=setTimeout(()=>setIsResizing(false),150); },[]);

  const [previewElapsed, setPreviewElapsed] = useState(0);
  const previewTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    if(isAnimating) {
        const start = performance.now();
        previewTimerRef.current = setInterval(() => {
            setPreviewElapsed(performance.now() - start);
        }, 16);
    } else {
        if(previewTimerRef.current) clearInterval(previewTimerRef.current);
        setPreviewElapsed(0);
    }
    return () => { if(previewTimerRef.current) clearInterval(previewTimerRef.current); };
  }, [isAnimating]);

  useEffect(() => {
    if(!animEnabled) {
      setShowValues(true);
      setAnimKey(k => k + 1);
    }
  }, [animEnabled]);

  const interactionRef = useRef({
    active: false,
    mode: 'none' as 'drag' | 'pinch' | 'none',
    startX: 0, startY: 0,
    origX: 0, origY: 0,
    origSize: 0, origRotation: 0,
    initialDist: 0, initialAngle: 0,
    type: '' as 'record' | 'text' | 'emoji' | 'sticker' | 'bg',
    id: ''
  });

  const selectedElementRef=useRef<string|null>(null); selectedElementRef.current=selectedElement;
  const stickersRef = useRef<StickerData[]>([]); stickersRef.current = stickers;
  const textOverlaysRef = useRef<TextOverlay[]>([]); textOverlaysRef.current = textOverlays;
  const emojiOverlaysRef = useRef<EmojiOverlay[]>([]); emojiOverlaysRef.current = emojiOverlays;
  const metricFontSizeRef = useRef(100); metricFontSizeRef.current = metricFontSize;
  const bgMediaStateRef = useRef({ x: 50, y: 50, scale: 100 });
  bgMediaStateRef.current = { x: bgMediaX, y: bgMediaY, scale: bgMediaScale };
  const bgEnlargeEnabledRef = useRef(false); bgEnlargeEnabledRef.current = bgEnlargeEnabled;

  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(!selectedElement)return; const tag=(e.target as HTMLElement)?.tagName; if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return; if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); if(selectedElement.startsWith('text-')){ const id=selectedElement.replace('text-',''); setTextOverlays(p=>p.filter(o=>o.id!==id)); } else if(selectedElement.startsWith('emoji-')){ const id=selectedElement.replace('emoji-',''); setEmojiOverlays(p=>p.filter(o=>o.id!==id)); } else if(selectedElement.startsWith('sticker-')){ const id=selectedElement.replace('sticker-',''); setStickers(p=>p.filter(s=>s.id!==id)); } setSelectedElement(null);} }; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey); },[selectedElement]);

  useEffect(()=>{
    const el = previewContainerRef.current; if(!el) return;
    
    const getDist = (t1: {clientX:number, clientY:number}, t2: {clientX:number, clientY:number}) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const getAngle = (t1: {clientX:number, clientY:number}, t2: {clientX:number, clientY:number}) => Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;

    const startInteraction = (clientX: number, clientY: number, touches?: TouchList) => {
      const sel = selectedElementRef.current;
      if(!sel) return;
      
      let ox=50, oy=50, os=100, or=0;
      let type: any = 'record';
      let id = '';

      if(sel === 'record') { ox=recordX; oy=recordY; os=metricFontSizeRef.current; }
      else if(sel === 'bg') { ox=bgMediaStateRef.current.x; oy=bgMediaStateRef.current.y; os=bgMediaStateRef.current.scale; type='bg'; }
      else if(sel.startsWith('text-')) { id=sel.replace('text-',''); const f=textOverlaysRef.current.find(o=>o.id===id); if(f){ox=f.x;oy=f.y;os=f.fontSize;or=f.rotation;} type='text'; }
      else if(sel.startsWith('emoji-')) { id=sel.replace('emoji-',''); const f=emojiOverlaysRef.current.find(o=>o.id===id); if(f){ox=f.x;oy=f.y;os=f.size;or=f.rotation;} type='emoji'; }
      else if(sel.startsWith('sticker-')) { id=sel.replace('sticker-',''); const f=stickersRef.current.find(s=>s.id===id); if(f){ox=f.x;oy=f.y;os=f.size;or=f.rotation;} type='sticker'; }

      interactionRef.current = {
        active: true, 
        mode: (touches && touches.length >= 2) ? 'pinch' : 'drag',
        startX: clientX, startY: clientY,
        origX: ox, origY: oy, origSize: os, origRotation: or,
        initialDist: (touches && touches.length >= 2) ? getDist(touches[0], touches[1]) : 0,
        initialAngle: (touches && touches.length >= 2) ? getAngle(touches[0], touches[1]) : 0,
        type, id
      };
    };

    const moveInteraction = (clientX: number, clientY: number, touches?: TouchList) => {
      const ir = interactionRef.current;
      if(!ir.active) return;
      const rect = el.getBoundingClientRect();

      if(touches && touches.length >= 2 && (ir.mode === 'pinch' || (touches.length >= 2 && ir.type === 'bg'))) {
        const dist = getDist(touches[0], touches[1]);
        const angle = getAngle(touches[0], touches[1]);
        if (ir.mode !== 'pinch') {
            ir.mode = 'pinch';
            ir.initialDist = dist;
            ir.initialAngle = angle;
        }
        const scale = dist / ir.initialDist;
        const angleDiff = angle - ir.initialAngle;
        const nextSize = Math.max(ir.type === 'bg' ? 10 : 10, Math.min(1000, Math.round(ir.origSize * scale)));
        markResizing();

        if(ir.type === 'record') setMetricFontSize(nextSize);
        else if(ir.type === 'bg') setBgMediaScale(nextSize);
        else if(ir.type === 'text') setTextOverlays(p => p.map(o => o.id === ir.id ? { ...o, fontSize: nextSize, rotation: ir.origRotation + angleDiff } : o));
        else if(ir.type === 'emoji') setEmojiOverlays(p => p.map(o => o.id === ir.id ? { ...o, size: nextSize, rotation: ir.origRotation + angleDiff } : o));
        else if(ir.type === 'sticker') setStickers(p => p.map(s => s.id === ir.id ? { ...s, size: nextSize, rotation: ir.origRotation + angleDiff } : s));
      } else if(ir.mode === 'drag') {
        const dx = clientX - ir.startX;
        const dy = clientY - ir.startY;
        const nx = Math.max(-100, Math.min(200, ir.origX + (dx / rect.width) * 100)); // Loosened constraints for BG
        const ny = Math.max(-100, Math.min(200, ir.origY + (dy / rect.height) * 100));

        if(ir.type === 'record') { setRecordX(Math.round(Math.max(0, Math.min(100, nx)) * 10) / 10); setRecordY(Math.round(Math.max(0, Math.min(100, ny)) * 10) / 10); }
        else if(ir.type === 'bg') { setBgMediaX(Math.round(nx * 10) / 10); setBgMediaY(Math.round(ny * 10) / 10); }
        else if(ir.type === 'text') setTextOverlays(p => p.map(o => o.id === ir.id ? { ...o, x: Math.round(Math.max(0, Math.min(100, nx)) * 10) / 10, y: Math.round(Math.max(0, Math.min(100, ny)) * 10) / 10 } : o));
        else if(ir.type === 'emoji') setEmojiOverlays(p => p.map(o => o.id === ir.id ? { ...o, x: Math.round(Math.max(0, Math.min(100, nx)) * 10) / 10, y: Math.round(Math.max(0, Math.min(100, ny)) * 10) / 10 } : o));
        else if(ir.type === 'sticker') setStickers(p => p.map(s => s.id === ir.id ? { ...s, x: Math.round(Math.max(0, Math.min(100, nx)) * 10) / 10, y: Math.round(Math.max(0, Math.min(100, ny)) * 10) / 10 } : s));
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if(e.pointerType === 'touch' && !e.isPrimary) return;
      const target = e.target as HTMLElement;
      const item = target.closest('.draggable-item');
      
      // Escape focus from inputs when touching or dragging in the preview
      if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
      }

      if (bgEnlargeEnabledRef.current) {
        // 배경 확대 모드일 때는 배경 미디어만 선택 가능하게 강제
        e.preventDefault();
        if (selectedElementRef.current !== 'bg') setSelectedElement('bg');
        startInteraction(e.clientX, e.clientY);
        return;
      }

      if (item) {
        e.preventDefault();
        const id = item.getAttribute('data-id');
        const type = item.getAttribute('data-type');
        const sel = type === 'record' ? 'record' : type === 'bg' ? 'bg' : `${type}-${id}`;
        if (selectedElementRef.current !== sel) {
          setSelectedElement(sel);
        }
        startInteraction(e.clientX, e.clientY);
      } else if (target === el) {
        if (selectedElementRef.current) {
            e.preventDefault();
            startInteraction(e.clientX, e.clientY);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => { if(e.pointerType === 'mouse') moveInteraction(e.clientX, e.clientY); };
    const handlePointerUp = () => { interactionRef.current.active = false; };
    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length >= 2) {
            e.preventDefault();
            startInteraction(e.touches[0].clientX, e.touches[0].clientY, e.touches);
        }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if(interactionRef.current.active) e.preventDefault();
      if(e.touches.length === 1) moveInteraction(e.touches[0].clientX, e.touches[0].clientY);
      else if(e.touches.length >= 2) moveInteraction(0, 0, e.touches);
    };

    el.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('touchstart', handleTouchStart, {passive: false});
    el.addEventListener('touchmove', handleTouchMove, {passive: false});
    el.addEventListener('touchend', handlePointerUp);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handlePointerUp);
    };
  }, [recordX, recordY]);

  const [isDragOver,setIsDragOver]=useState(false); const bgVideoRef=useRef<HTMLVideoElement|null>(null); const bgImageRef=useRef<HTMLImageElement|null>(null); const mediaInputRef=useRef<HTMLInputElement>(null); const previewContainerRef=useRef<HTMLDivElement>(null);
  const h=parseInt(hours)||0; const durationStr=h>0?`${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`:`${pad2(minutes)}:${pad2(seconds)}`; const durationZero=h>0?'00:00:00':'00:00'; const distStr=parseFloat(distance||'0').toFixed(2); const paceStr=`${pad2(paceMin)}:${pad2(paceSec)}`; const lblDuration=labelLang==='ko'?'시간':'TIME'; const lblDistance=labelLang==='ko'?'거리':'Distance'; const lblPace=labelLang==='ko'?'페이스':'Pace'; const unitKm='km'; const unitPace='/km';
  const getPreviewFontSize=()=> (layout==='vertical'?42:36)*(metricFontSize/100);
  const alignClass = metricAlign==='left'?'items-start':metricAlign==='right'?'items-end':'items-center';
  const getExportDims=()=> customAR?customAR:ASPECT_RATIOS['1:1']; const getPreviewStyle=():React.CSSProperties=> customAR?{aspectRatio:`${customAR.w} / ${customAR.h}`} : {}; const getPreviewClass=()=> customAR?'':'aspect-square';
  const stopAllSounds=useCallback(()=>{ try{ if(activeAudioCtxRef.current&&activeAudioCtxRef.current.state!=='closed'){ activeAudioCtxRef.current.close(); } }catch{} activeAudioCtxRef.current=null; try{ if(previewAudioCtxRef.current&&previewAudioCtxRef.current.state!=='closed'){ previewAudioCtxRef.current.close(); } }catch{} previewAudioCtxRef.current=null; },[]);
  
  const playAnimation=()=>{
    if(!animEnabled) return;
    stopAllSounds(); setShowValues(false); setIsAnimating(false); setAnimKey(k=>k+1);
    
    // Video Playback logic
    if(bgMediaType==='video' && bgVideoRef.current) {
        const vid = bgVideoRef.current;
        vid.muted = videoMuted;
        vid.volume = videoVolume;
        vid.play();
        setVideoPaused(false);
    }

    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
      setIsAnimating(true);
      const totalWaitMs = useWait ? waitBeforeAnim * 1000 : 0;
      if(soundEnabled){ setTimeout(()=>{ const ctx=playSound(soundType,soundVolume,animDuration,animStyle); activeAudioCtxRef.current=ctx; },ANIM_DELAY + totalWaitMs);}
      setTimeout(()=>setShowValues(true),ANIM_DELAY + totalWaitMs);
      setTimeout(()=>{
        setIsAnimating(false);
        if(bgVideoRef.current) {
            bgVideoRef.current.pause();
            setVideoPaused(true);
        }
      },ANIM_DELAY + totalWaitMs + animDuration + DEFAULT_STAGGER*10 + extraHoldTime*1000);
    }); });
  };
  
  const resetAnimation=()=>{ 
    stopAllSounds(); 
    setShowValues(!animEnabled); 
    setIsAnimating(false); 
    setAnimKey(k=>k+1); 
    if(bgVideoRef.current) {
        bgVideoRef.current.currentTime = 0;
        bgVideoRef.current.pause();
        setVideoPaused(true);
    }
  };
  
  const previewSoundFn=(type:string)=>{
    try{ if(previewAudioCtxRef.current&&previewAudioCtxRef.current.state!=='closed'){ previewAudioCtxRef.current.close(); } }catch{}
    const temp=new (window.AudioContext|| (window as any).webkitAudioContext)();
    if(temp.state==='suspended') temp.resume().catch(()=>{});
    playSound(type,soundVolume,1500,'machine',temp);
    previewAudioCtxRef.current=temp;
    setTimeout(()=>{ try{ if(temp.state!=='closed') temp.close(); }catch{} },1500);
  };

  const handleWheel=useCallback((e:React.WheelEvent)=>{ if(e.ctrlKey||!selectedElement)return; e.preventDefault(); markResizing(); const delta=e.deltaY>0?-1:1; if(selectedElement==='record'){ setMetricFontSize(p=>Math.max(30,Math.min(300,p+delta*5))); } else if(selectedElement==='bg'){ setBgMediaScale(p=>Math.max(10,Math.min(1000,p+delta*5))); } else if(selectedElement.startsWith('text-')){ const id=selectedElement.replace('text-',''); setTextOverlays(p=>p.map(o=>o.id===id?{...o,fontSize:Math.max(6,Math.min(200,o.fontSize+delta*2))}:o)); } else if(selectedElement.startsWith('sticker-')){ const id=selectedElement.replace('sticker-',''); setStickers(p=>p.map(s=>s.id===id?{...s,size:Math.max(20,Math.min(500,s.size+delta*5))}:o)); } else if(selectedElement.startsWith('emoji-')){ const id=selectedElement.replace('emoji-',''); setEmojiOverlays(p=>p.map(o=>o.id===id?{...o,size:Math.max(8,Math.min(200,o.size+delta*2))}:o)); } },[selectedElement,markResizing]);
  const handleDragOver=(e:React.DragEvent)=>{ e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }; const handleDragLeave=(e:React.DragEvent)=>{ e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }; const handleDrop=(e:React.DragEvent)=>{ e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const file=e.dataTransfer.files?.[0]; if(!file)return; if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))return; processMediaFile(file); };
  
  const processMediaFile=(file:File)=>{
    const url=URL.createObjectURL(file);
    if(file.type.startsWith('video/')){
      setBgMediaType('video'); setBgMediaUrl(url);
      const video=document.createElement('video'); video.src=url; video.loop=false; video.muted=videoMuted; video.playsInline=true; bgVideoRef.current=video; bgImageRef.current=null;
      video.addEventListener('loadedmetadata',()=>{ 
        const vw=video.videoWidth, vh=video.videoHeight; 
        if(vw&&vh){ 
            const short=Math.min(vw,vh); 
            const sc=1080/short; 
            setCustomAR({w:Math.round(vw*sc),h:Math.round(vh*sc)}); 
            setAspectRatio('custom'); 
        }
        video.currentTime = 0;
        setVideoPaused(true);
      });
    } else {
      setBgMediaType('image'); setBgMediaUrl(url);
      const img=new Image(); img.src=url; bgImageRef.current=img; bgVideoRef.current=null;
      img.addEventListener('load',()=>{ const iw=img.naturalWidth, ih=img.naturalHeight; if(iw&&ih){ const short=Math.min(iw,ih); const sc=1080/short; setCustomAR({w:Math.round(iw*sc),h:Math.round(ih*sc)}); setAspectRatio('custom'); }});
    }
  };

  const captureImage = async () => {
    await document.fonts.ready;
    const dims = getExportDims();
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx2 = canvas.getContext('2d')!;
    
    const previewRect = previewContainerRef.current?.getBoundingClientRect();
    const previewW = previewRect?.width || 500;
    const previewH = previewRect?.height || 500;

    const stickerData: StickerData[] = await Promise.all(stickers.map(st => new Promise<StickerData>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = st.url;
      img.onload = () => resolve({ ...st, img });
      img.onerror = () => resolve({ ...st, img });
    })));

    let bgMedia: HTMLImageElement | null = null;
    if (bgMediaUrl && bgMediaType === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = bgMediaUrl;
      await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
      bgMedia = img;
    }

    const previewFS = getPreviewFontSize();
    const cfg: SceneConfig = {
      digitColor, labelColor, fontFamily: selectedFont, layout, textAlign: metricAlign, spacing, recordX, recordY,
      baseFontSize: previewFS, labelDuration: lblDuration, labelDistance: lblDistance, labelPace: lblPace,
      unitKm, unitPace, durationStr, distanceStr: distStr, paceStr, showLabels, showUnits, labelScale: labelFontSize,
      spinCycles: 0, animDuration: 0, staggerDelay: 0, animStyle: 'default',
      textOverlays, emojiOverlays, stickerData, bgMedia, bgMediaX, bgMediaY, bgMediaScale, greenScreen,
      labelGapPx: labelGapValue, canvasW: dims.w, canvasH: dims.h, previewW, previewH,
      waitBeforeAnim: 0, introEffect: 'none', animEnabled: false, videoMuted: true, videoVolume: 0
    };

    drawScene(ctx2, canvas.width, canvas.height, 100000, cfg);

    const link = document.createElement('a');
    link.download = `runviz-record-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const startRecording=async()=>{
    await document.fonts.ready;
    const dims=getExportDims(); const canvas=document.createElement('canvas'); canvas.width=dims.w; canvas.height=dims.h; const ctx2=canvas.getContext('2d')!;
    const previewRect=previewContainerRef.current?.getBoundingClientRect(); const previewW=previewRect?.width||500; const previewH=previewRect?.height||500;
    const canvasStream=(canvas as any).captureStream(60) as MediaStream;
    
    let audioCtx:AudioContext|null=null; let audioDest:MediaStreamAudioDestinationNode|null=null;
    let finalStream = canvasStream;

    if((soundEnabled && animEnabled) || (bgMediaType==='video' && !videoMuted)) {
      try{
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
        await audioCtx.resume();
        audioDest = audioCtx.createMediaStreamDestination();
        
        const bufferSize = audioCtx.sampleRate * 1;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1) * 0.0001; }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        noise.connect(audioDest);
        noise.start();

        if(bgMediaType==='video' && !videoMuted && bgVideoRef.current) {
            const vidNode = audioCtx.createMediaElementSource(bgVideoRef.current);
            const gain = audioCtx.createGain();
            gain.gain.value = videoVolume;
            vidNode.connect(gain);
            gain.connect(audioDest);
            gain.connect(audioCtx.destination);
        }

        if (audioDest.stream.getAudioTracks().length > 0) {
          finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
        }
        recAudioCtxRef.current = audioCtx;
      }catch(e){ console.warn('Audio capture failed:',e);}
    }

    const preferredTypes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=h264', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const mimeType = preferredTypes.find(t2 => (window as any).MediaRecorder && MediaRecorder.isTypeSupported(t2)) || 'video/webm';
    
    const recorder=new MediaRecorder(finalStream,{mimeType,videoBitsPerSecond:100_000_000, audioBitsPerSecond:320_000}); const chunks:Blob[]=[];
    recorder.ondataavailable=(e)=>{ if(e.data.size>0)chunks.push(e.data); };
    recorder.onstop=async()=>{
      const containerType = mimeType.split(';')[0];
      const blob=new Blob(chunks,{type:containerType});
      const url = URL.createObjectURL(blob); 
      setVideoUrl(url); 
      setVideoMimeType(containerType);
      setIsRecording(false);
      if(audioCtx&&audioCtx.state!=='closed'){ audioCtx.close(); }
    };

    const stickerData:StickerData[]=await Promise.all(stickers.map(st=>new Promise<StickerData>((resolve)=>{const img=new Image();img.crossOrigin='anonymous';img.src=st.url;img.onload=()=>resolve({...st,img});img.onerror=()=>resolve({...st,img});})));
    let bgMedia:HTMLImageElement|HTMLVideoElement|null=null; 
    if(bgMediaUrl&&bgMediaType==='image'){ 
        const img=new Image(); img.crossOrigin='anonymous'; img.src=bgMediaUrl; 
        await new Promise<void>(res=>{ img.onload=()=>res(); img.onerror=()=>res(); }); bgMedia=img; 
    } else if(bgMediaUrl&&bgMediaType==='video'&&bgVideoRef.current){ 
        bgVideoRef.current.play(); bgMedia=bgVideoRef.current; 
    }
    
    setIsRecording(true); setVideoUrl(null); recorder.start(); setShowValues(!animEnabled); setIsAnimating(animEnabled); setAnimKey(k=>k+1);
    
    const totalWaitMs = (animEnabled && useWait) ? waitBeforeAnim * 1000 : 0;
    if(animEnabled) {
      setTimeout(()=>setShowValues(true),ANIM_DELAY + totalWaitMs);
      if(soundEnabled && audioCtx && audioDest){
        setTimeout(()=>{
          playSound(soundType, soundVolume, animDuration, animStyle, audioCtx!, [audioCtx!.destination, audioDest!]);
        },ANIM_DELAY + totalWaitMs);
      }
      setTimeout(()=>setIsAnimating(false),ANIM_DELAY + totalWaitMs + animDuration + DEFAULT_STAGGER*10 + 300);
    }

    const startTime=performance.now(); 
    const holdMs=extraHoldTime*1000; 
    let totalMs = animEnabled ? (totalWaitMs+animDuration+holdMs+ANIM_DELAY+DEFAULT_STAGGER*10) : 3000;
    
    if(!animEnabled && bgMediaType==='video' && bgVideoRef.current) {
        totalMs = (bgVideoRef.current.duration - bgVideoRef.current.currentTime) * 1000;
    }

    const previewFS=getPreviewFontSize();
    const cfg:SceneConfig={ digitColor,labelColor,fontFamily:selectedFont, layout,textAlign:metricAlign,spacing,recordX,recordY, baseFontSize:previewFS, labelDuration:lblDuration,labelDistance:lblDistance,labelPace:lblPace, unitKm,unitPace,durationStr,distanceStr:distStr,paceStr, showLabels,showUnits,labelScale:labelFontSize,spinCycles,animDuration, staggerDelay:DEFAULT_STAGGER,animStyle, textOverlays,emojiOverlays,stickerData,bgMedia,bgMediaX,bgMediaY,bgMediaScale,greenScreen, labelGapPx:labelGapValue, canvasW:dims.w,canvasH:dims.h, previewW,previewH, waitBeforeAnim: (animEnabled && useWait) ? waitBeforeAnim : 0, introEffect, animEnabled, videoMuted, videoVolume };
    
    function animate(now:number){ 
        const elapsed=now-startTime; 
        const aElapsed=Math.max(0,elapsed-ANIM_DELAY); 
        drawScene(ctx2,canvas.width,canvas.height,aElapsed,cfg); 
        if(elapsed<totalMs){ requestAnimationFrame(animate);} else { recorder.stop(); if(bgVideoRef.current) bgVideoRef.current.pause(); } 
    }
    requestAnimationFrame(animate);
  };

  const handleMediaUpload=(e:React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file)return; processMediaFile(file); };
  const removeMedia=()=>{ setBgMediaUrl(null); bgVideoRef.current=null; bgImageRef.current=null; if(mediaInputRef.current) mediaInputRef.current.value=''; setCustomAR(null); setBgEnlargeEnabled(false); };
  const deleteSelected=()=>{ if(!selectedElement)return; if(selectedElement.startsWith('text-')){ const id=selectedElement.replace('text-',''); setTextOverlays(p=>p.filter(o=>o.id!==id)); } else if(selectedElement.startsWith('emoji-')){ const id=selectedElement.replace('emoji-',''); setEmojiOverlays(p=>p.filter(o=>o.id!==id)); } else if(selectedElement.startsWith('sticker-')){ const id=selectedElement.replace('sticker-',''); setStickers(p=>p.filter(s=>s.id!==id)); } setSelectedElement(null); };
  const addTextOverlay=()=>{ setTextOverlays(p=>[...p,{id:uid(),text:new Date().toLocaleDateString(),x:50,y:90,fontSize:16,color:labelColor,fontFamily:selectedFont, rotation: 0}]); };
  const updateTextOverlay=(id:string,field:keyof TextOverlay,value:string|number)=>{ setTextOverlays(p=>p.map(o=>o.id===id?{...o,[field]:value}:o)); };
  const addEmojiOverlay=(emoji:string)=>{ setEmojiOverlays(p=>[...p,{id:uid(),emoji,x:10+Math.random()*80,y:10+Math.random()*80,size:28, rotation: 0}]); };
  const updateEmojiOverlay=(id:string,field:keyof EmojiOverlay,value:string|number)=>{ setEmojiOverlays(p=>p.map(o=>o.id===id?{...o,[field]:value}:o)); };

  const tabLabels=[{icon:'📊',label:language==='ko'?'기록':t('sectionData')},{icon:'🎨',label:language==='ko'?'스타일':t('sectionStyle')},{icon:'⚡',label:language==='ko'?'효과':t('sectionAnimation')},{icon:'📝',label:language==='ko'?'텍스트':t('sectionText')},{icon:'📁',label:language==='ko'?'미디어':t('sectionMedia')}];
  const fontSize=getPreviewFontSize(); const RECORD_GAP_PX=15+spacing*3; const LABEL_GAP_PX=labelGapValue-10;

  // Actual preview visibility during playback
  const totalWaitMs = (animEnabled && useWait) ? waitBeforeAnim * 1000 : 0;
  const isCurrentlyWaiting = animEnabled && isAnimating && previewElapsed < totalWaitMs;
  const isActuallyPlaying = isAnimating && (!animEnabled || previewElapsed >= totalWaitMs);
  const actualPlayElapsed = isActuallyPlaying ? (animEnabled ? previewElapsed - totalWaitMs : 100000) : 0;

  // Intro Effect Style for Preview
  const introDur = animEnabled ? 500 : 0;
  const introProg = introDur > 0 ? Math.min(actualPlayElapsed / introDur, 1) : 1;
  let previewIntroStyle: React.CSSProperties = { transform: 'translate(-50%, -50%)' };
  if(animEnabled && isActuallyPlaying) {
    if(introEffect === 'fade') { previewIntroStyle = { ...previewIntroStyle, opacity: introProg }; }
    else if(introEffect === 'slide-up') { previewIntroStyle = { opacity: introProg, transform: `translate(-50%, calc(-50% + ${(1 - introProg) * 30}px))` }; }
    else if(introEffect === 'zoom-in') { previewIntroStyle = { opacity: introProg, transform: `translate(-50%, -50%) scale(${0.8 + 0.2 * introProg})` }; }
  }

  const handleVideoToggle = () => {
    if(bgVideoRef.current) {
        if(bgVideoRef.current.paused) {
            bgVideoRef.current.play();
            setVideoPaused(false);
        } else {
            bgVideoRef.current.pause();
            setVideoPaused(true);
        }
    }
  };
  const handleVideoStop = () => { if(bgVideoRef.current) { bgVideoRef.current.pause(); bgVideoRef.current.currentTime = 0; setVideoPaused(true); } };

  return(<div className="min-h-screen" style={{background:'#08080f'}}>
    <header className="border-b border-white/5 px-3 py-2.5 safe-top"><div className="max-w-[1600px] mx-auto flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#e94560] to-[#c23152] flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-red-500/20">R</div><div><h1 className="text-base font-bold tracking-tight">{t('appTitle')}</h1><p className="text-[10px] text-white/40 hidden sm:block">{t('appSubtitle')}</p></div></div><div className="flex items-center gap-2"><span className="text-xs text-white/40">🌐</span><select className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none cursor-pointer" value={language} onChange={(e)=>setLanguage(e.target.value as Language)}>{Object.entries(LANG_NAMES).map(([code,name])=>(<option key={code} value={code} className="bg-gray-900">{name}</option>))}</select></div></div></header>
    <main className="max-w-[1600px] mx-auto flex flex-col lg:flex-row gap-3 p-3">
      <aside className="w-full lg:w-[340px] space-y-2.5 lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto lg:pr-1 order-2 lg:order-1">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide sticky top-0 z-40 bg-[#08080f]/98 backdrop-blur-sm py-2 border-b border-white/8 lg:overflow-x-visible lg:flex-nowrap lg:justify-between">
          {tabLabels.map((tab,i)=>(<button key={i} className={`flex-shrink-0 lg:flex-1 lg:px-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${activeTab===i? (i===0?'bg-blue-600 border-blue-500 shadow-blue-500/30':i===1?'bg-purple-600 border-purple-500 shadow-purple-500/30':i===2?'bg-amber-600 border-amber-500 shadow-amber-500/30':i===3?'bg-emerald-600 border-emerald-500 shadow-emerald-500/30':'bg-pink-600 border-pink-500 shadow-pink-500/30') + ' text-white shadow-lg' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'}`} onClick={()=>setActiveTab(i)}><span className="mr-1 lg:hidden">{tab.icon}</span>{tab.label}</button>))}
        </div>
        <div className={`${activeTab===0?'block':'hidden'}`}><Section title={t('sectionData')}>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer select-none scale-125 origin-left ml-1">
                <input type="checkbox" checked={showLabels} onChange={(e)=>setShowLabels(e.target.checked)} className="w-4 h-4 rounded accent-[#e94560] cursor-pointer" />
                <span className="text-[10px] font-bold text-white/80" style={{fontFamily:selectedFont}}>{t('showLabels')}</span>
              </label>
              <div className="flex items-center ml-12">
                <label className="flex items-center cursor-pointer select-none scale-125 origin-left">
                  <input type="checkbox" checked={showUnits} onChange={(e)=>setShowUnits(e.target.checked)} className="w-4 h-4 rounded accent-[#e94560] cursor-pointer" />
                  <span className="text-[10px] font-bold text-white/80" style={{fontFamily:selectedFont}}>{language==='ko'?'단위표시':'Show Units'}</span>
                </label>
                <button 
                  disabled={!showUnits}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition scale-110 origin-left ml-8 ${!showUnits ? 'opacity-30 cursor-not-allowed grayscale border-white/10' : 'bg-[#e94560] border-[#e94560] text-white shadow-sm'}`} 
                  onClick={()=>setLabelLang(prev => prev === 'ko' ? 'en' : 'ko')}
                >
                  {labelLang==='ko'?'한글':'영어'}
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-2">
            <label className="text-xs font-medium text-white/60 mb-1 block">{t('duration')}</label>
            <div className="flex gap-2"><div className="flex-1"><input type="number" min="0" max="99" className="input-field text-center" value={hours} onChange={(e)=>setHours(e.target.value)} placeholder={t('hours')} /><span className="text-[10px] text-white/30 block text-center mt-0.5">{t('hours')}</span></div><span className="text-white/30 self-start pt-2">:</span><div className="flex-1"><input type="number" min="0" max="59" className="input-field text-center" value={minutes} onChange={(e)=>setMinutes(e.target.value)} placeholder={t('minutes')} /><span className="text-[10px] text-white/30 block text-center mt-0.5">{t('minutes')}</span></div><span className="text-white/30 self-start pt-2">:</span><div className="flex-1"><input type="number" min="0" max="59" className="input-field text-center" value={seconds} onChange={(e)=>setSeconds(e.target.value)} placeholder={t('seconds')} /><span className="text-[10px] text-white/30 block text-center mt-0.5">{t('seconds')}</span></div></div>
          </div>
          <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-white/60 mb-1 block">{t('distance')} ({t('km')})</label><input type="number" step="0.01" min="0" className="input-field" value={distance} onChange={(e)=>setDistance(e.target.value)} /></div><div><label className="text-xs font-medium text-white/60 mb-1 block">{t('pace')} ({t('minKm')})</label><div className="flex gap-1 items-center"><input type="number" min="0" max="59" className="input-field text-center flex-1" value={paceMin} onChange={(e)=>setPaceMin(e.target.value)} /><span className="text-white/30 text-xs">:</span><input type="number" min="0" max="59" className="input-field text-center flex-1" value={paceSec} onChange={(e)=>setSeconds(e.target.value)} /></div></div></div>
        </Section></div>
        <div className={`${activeTab===1?'block':'hidden'}`}><Section title={t('sectionStyle')}>
          <div>
            <label className="text-xs font-medium text-white/60 mb-1 block">{t('layout')} & {t('font')}</label>
            <div className="flex gap-1.5">
              <button className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition border ${layout==='vertical'?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`} onClick={()=>{ setLayout('vertical'); setLayoutChanging(true); setTimeout(()=>setLayoutChanging(false),200); }}>{t('vertical')}</button>
              <button className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition border ${layout==='horizontal'?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`} onClick={()=>{ setLayout('horizontal'); setMetricFontSize(40); setSpacing(10); setLayoutChanging(true); setTimeout(()=>setLayoutChanging(false),200); }}>{t('horizontal')}</button>
              <select className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition border bg-white/10 text-white/80 border-white/20 hover:bg-white/20 outline-none appearance-none cursor-pointer text-center`} value={selectedFont} onChange={(e)=>setSelectedFont(e.target.value)}>{FONTS.map(f=><option key={f} value={f} style={{fontFamily:f}} className="bg-gray-900">{f}</option>)}</select>
            </div>
          </div>
          <div><label className="text-xs font-medium text-white/60 mb-1 block">{t('textAlign')}</label><div className="flex gap-1.5">{(['left','center','right'] as TextAlign[]).map(a=>(<button key={a} className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition border ${metricAlign===a?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`} onClick={()=>setMetricAlign(a)}>{a==='left'?'◀ ':a==='right'?' ▶':'◆ '}{t(`align${a.charAt(0).toUpperCase()+a.slice(1)}`)}</button>))}</div></div>
          <div>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">{language==='ko'?'색상 및 테마':'Colors & Themes'}</label>
            <div className="flex gap-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-white/5 p-1.5 rounded-lg border border-white/10 w-[95px]">
                  <span className="text-xs text-white/80 font-bold px-1">{language==='ko'?'기록':'Digit'}</span>
                  <input type="color" value={digitColor} onChange={(e)=>setDigitColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"/>
                </div>
                <div className="flex items-center justify-between bg-white/5 p-1.5 rounded-lg border border-white/10 w-[95px]">
                  <span className="text-xs text-white/80 font-bold px-1">{language==='ko'?'라벨':'Label'}</span>
                  <input type="color" value={labelColor} onChange={(e)=>setLabelColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"/>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-4 gap-1.5">
                {THEMES.map(th => (
                  <button key={th.name} className="group relative flex flex-col items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:border-[#e94560] transition-all overflow-hidden p-1.5" onClick={() => { setDigitColor(th.digit); setLabelColor(th.label); }} title={th.name}>
                    <div className="flex w-full h-6 rounded-sm overflow-hidden">
                      <div style={{backgroundColor: th.digit}} className="flex-1"/>
                      <div style={{backgroundColor: th.label}} className="flex-1"/>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="grid grid-cols-4 gap-1.5">
              <div><span className="text-[10px] text-white/80 font-bold block mb-1 truncate text-center">{language==='ko'?'전체 크기':'Size'}</span><ClampedNumberInput value={metricFontSize-80} min={0} max={410} onChange={(v)=>setMetricFontSize(v+80)} className="input-field text-[11px] text-center p-1.5 w-full"/></div>
              <div><span className="text-[10px] text-white/80 font-bold block mb-1 truncate text-center">{language==='ko'?'라벨 크기':'Label'}</span><ClampedNumberInput value={labelFontSize-85} min={0} max={270} onChange={(v)=>setLabelFontSize(v+85)} className="input-field text-[11px] text-center p-1.5 w-full"/></div>
              <div><span className="text-[10px] text-white/80 font-bold block mb-1 truncate text-center">{language==='ko'?'기록 간격':'Gap'}</span><ClampedNumberInput value={spacing+7} min={0} max={80} onChange={(v)=>setSpacing(v-7)} className="input-field text-[11px] text-center p-1.5 w-full"/></div>
              <div><span className="text-[10px] text-white/80 font-bold block mb-1 truncate text-center">{language==='ko'?'라벨 간격':'L-Gap'}</span><ClampedNumberInput value={labelGapValue+6} min={0} max={20} onChange={(v)=>setLabelGapValue(v-6)} className="input-field text-[11px] text-center p-1.5 w-full"/></div>
            </div>
          </div>
        </Section></div>
        <div className={`${activeTab===2?'block':'hidden'} space-y-2.5`}><Section title={t('sectionAnimation')}>
          <div className="flex items-center justify-between mb-2"><label className="text-sm font-semibold text-white/80">{language==='ko'?'애니메이션':'Animation'}</label><button className={`w-12 h-6 rounded-full transition-colors relative border ${animEnabled?'bg-[#e94560] border-[#e94560]':'bg-white/15 border-white/30'}`} onClick={()=>setAnimEnabled(!animEnabled)}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${animEnabled?'left-6':'left-0.5'}`}/></button></div>
          
          <div><label className="text-xs font-medium text-white/60 mb-1 block">{t('animStyle')}</label><div className="flex gap-1.5">{(['machine','default','bounce'] as AnimStyle[]).map(s=>(<button key={s} disabled={!animEnabled} className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition border ${animStyle===s?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'} ${!animEnabled?'opacity-40 cursor-not-allowed':''}`} onClick={()=>setAnimStyle(s)}>{t(`style${s.charAt(0).toUpperCase()+s.slice(1)}`)}</button>))}</div></div>
          <div><label className="text-xs font-medium text-white/60 mb-1 block">{t('animSpeed')}: {animDuration/1000}s</label><input type="range" min="1000" max="10000" step="1000" disabled={!animEnabled} className="thumb-only-slider" value={animDuration} onChange={(e)=>setAnimDuration(Number(e.target.value))}/></div>
          
          <div className="border-t border-white/10 pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-white/80">{language==='ko'?'재생 전 대기':'Wait Before Start'}</label>
              <button className={`w-12 h-6 rounded-full transition-colors relative border ${useWait?'bg-[#e94560] border-[#e94560]':'bg-white/15 border-white/30'}`} onClick={()=>setUseWait(!useWait)}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${useWait?'left-6':'left-0.5'}`}/></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {(['fade','slide-up','zoom-in','none'] as IntroEffect[]).map(eff => (
                  <button key={eff} disabled={!useWait} className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition border ${introEffect===eff?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'} ${!useWait?'opacity-40 cursor-not-allowed':''}`} onClick={()=>setIntroEffect(eff)}>{t(`intro${eff.charAt(0).toUpperCase() + eff.slice(1).replace('-','')}`)}</button>
                ))}
              </div>
              <div><label className="text-xs font-medium text-white/60 mb-1 block">{language==='ko'?`대기 시간(초): ${waitBeforeAnim}s`:`Wait Time: ${waitBeforeAnim}s`}</label><input type="range" min="1" max="10" step="1" disabled={!useWait} value={waitBeforeAnim} onChange={(e)=>setWaitBeforeAnim(Number(e.target.value))} className="flex-1 thumb-only-slider"/></div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-3">
            <label className="text-xs font-medium text-white/60 mb-1 block">{t('extraHold')}</label>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="10" step="1" value={extraHoldTime} onChange={(e)=>setExtraHoldTime(Number(e.target.value))} className="flex-1 thumb-only-slider"/><span className="text-xs text-white/40">{extraHoldTime}s</span>
            </div>
          </div>
        </Section>
        <Section title={t('sectionSound')}>
          <div className="flex items-center justify-between"><label className="text-sm font-semibold text-white/80">{t('soundOn')}</label><button className={`w-12 h-6 rounded-full transition-colors relative border ${soundEnabled?'bg-[#e94560] border-[#e94560]':'bg-white/15 border-white/30'}`} onClick={()=>setSoundEnabled(!soundEnabled)}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${soundEnabled?'left-6':'left-0.5'}`}/></button></div>
          <div className="flex gap-1.5 mt-2">
            {SOUND_TYPES.map(st=>(
                <button key={st} disabled={!soundEnabled} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition border ${soundType===st?'bg-[#e94560] text-white border-[#e94560]':'bg-white/10 text-white/80 border-white/20'} ${!soundEnabled?'opacity-40 cursor-not-allowed':''}`} onClick={()=>{setSoundType(st); previewSoundFn(st);}}>{t(st)}</button>
            ))}
          </div>
          <div><label className="text-xs font-medium text-white/60 mb-1 block">{t('volume')}: {Math.round(soundVolume*100)}%</label><input type="range" min="0" max="1" step="0.05" disabled={!soundEnabled} value={soundVolume} onChange={(e)=>setSoundVolume(Number(e.target.value))} className="thumb-only-slider"/></div>
        </Section></div>
        <div className={`${activeTab===3?'block':'hidden'} space-y-2.5`}><Section title={t('sectionText')}>
          <button className="w-full py-3 rounded-xl font-semibold text-sm bg-white/15 hover:bg-white/25 text-white border border-white/30 transition active:scale-95" onClick={addTextOverlay}>✏️ {t('addText')}</button>
          {textOverlays.map(ov=>(<div key={ov.id} className="bg-white/3 rounded-lg p-2 flex items-center gap-2 border border-white/5"><input className="flex-1 input-field text-sm h-9" value={ov.text} onChange={(e)=>updateTextOverlay(ov.id,'text',e.target.value)} placeholder="텍스트 입력"/><input type="color" value={ov.color} onChange={(e)=>updateTextOverlay(ov.id,'color',e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"/><button className="bg-red-500/20 text-red-400 p-2 rounded-lg hover:bg-red-500/30 shrink-0 h-9 w-9 flex items-center justify-center" onClick={()=>setTextOverlays(p=>p.filter(o=>o.id!==ov.id))}>✕</button></div>))}
        </Section>
        <Section title={t('sectionEmoji')}><div className="grid grid-cols-8 gap-0.5">{RUNNING_EMOJIS.map((emoji,i)=>(<button key={`${emoji}-${i}`} className="text-lg hover:scale-125 p-1 rounded hover:bg-white/5 active:scale-95" onClick={()=>addEmojiOverlay(emoji)}>{emoji}</button>))}</div></Section></div>
        <div className={`${activeTab===4?'block':'hidden'} space-y-2.5`}><Section title={t('sectionMedia')}>
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaUpload}/>
          <button className="w-full py-3 rounded-xl font-semibold text-sm bg-white/15 hover:bg-white/25 text-white border border-white/30 transition active:scale-95" onClick={()=>mediaInputRef.current?.click()}>📁 {t('uploadMedia')}</button>
          {bgMediaUrl&&(
            <div className="space-y-3 mt-2">
                <div className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                        <input type="checkbox" checked={bgEnlargeEnabled} onChange={(e)=>{ setBgEnlargeEnabled(e.target.checked); if(e.target.checked) setSelectedElement('bg'); else if(selectedElement==='bg') setSelectedElement(null); }} className="w-4 h-4 rounded accent-[#e94560] cursor-pointer" />
                        <span className="text-[11px] font-bold text-white/80">{t('bgEnlarge')}</span>
                    </label>
                    <button className="bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-lg" onClick={removeMedia}>✕ {t('removeMedia')}</button>
                </div>
                {bgMediaType==='video' && (
                    <div className="bg-white/5 p-3 rounded-xl space-y-3 border border-white/10">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-white/80">{t('vidMute')}</label>
                            <button className={`w-12 h-6 rounded-full transition-colors relative border ${videoMuted?'bg-[#e94560] border-[#e94560]':'bg-white/15 border-white/30'}`} onClick={()=>setVideoMuted(!videoMuted)}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${videoMuted?'left-6':'left-0.5'}`}/></button>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-white/60 mb-1 block">{t('vidVolume')}: {Math.round(videoVolume*100)}%</label>
                            <input type="range" min="0" max="1" step="0.05" disabled={videoMuted} value={videoVolume} onChange={(e)=>setVideoVolume(Number(e.target.value))} className="thumb-only-slider"/>
                        </div>
                    </div>
                )}
            </div>
          )}
          <div className="border-t border-white/10 pt-3 mt-3"><label className="text-xs font-medium text-white/60 mb-2 block">🖼️ {language==='ko'?'스티커 이미지 (최대 2장)':'Sticker Image (max 2)'}</label>
          <input ref={stickerInputRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{
            const file=e.target.files?.[0]; if(!file||stickers.length>=2)return;
            const url=URL.createObjectURL(file);
            const img=new Image(); img.src=url;
            img.onload=()=>{
                setStickers(p=>[...p, {id:uid(),url,x:50,y:50,size:150,rotation:0,borderWidth:1,borderColor:'#ffffff',aspectRatio:img.width/img.height, useTimeRange: false, startTime: 0, endTime: (waitBeforeAnim + (animDuration/1000) + extraHoldTime), rounded: false}]);
                if(stickerInputRef.current)stickerInputRef.current.value='';
            };
          }}/>
          {stickers.length<2&&(<button className="w-full py-2.5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 transition active:scale-95 mb-2" onClick={()=>stickerInputRef.current?.click()}>📎 {language==='ko'?'스티커 추가':'Add Sticker'}</button>)}
          {stickers.map(st=>(<div key={st.id} className="bg-white/3 rounded-lg p-2.5 space-y-2 border border-white/5 mb-2">
            <div className="flex items-center gap-3">
              <img src={st.url} alt="" className="w-10 h-10 object-contain rounded border border-white/10 shrink-0"/>
              <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-white/50 font-bold whitespace-nowrap">{language==='ko'?'윤곽':'Border'}</span>
                  <ClampedNumberInput value={st.borderWidth} min={0} max={5} onChange={(v)=>setStickers(p=>p.map(s=>s.id===st.id?{...s,borderWidth:v}:s))} className="input-field text-[10px] text-center p-1 w-6 h-7"/>
                </div>
                <input type="color" value={st.borderColor} onChange={(e)=>setStickers(p=>p.map(s=>s.id===st.id?{...s,borderColor:e.target.value}:s))} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"/>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={st.rounded} onChange={(e)=>setStickers(p=>p.map(s=>s.id===st.id?{...s,rounded:e.target.checked}:s))} className="w-3.5 h-3.5 rounded accent-[#e94560] cursor-pointer"/>
                  <span className="text-[12px] text-white/50 font-bold">{language==='ko'?'라운드':'Round'}</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input type="checkbox" checked={st.useTimeRange} onChange={(e)=>{
                    const checked = e.target.checked;
                    const defaultEnd = waitBeforeAnim + (animDuration / 1000) + extraHoldTime;
                    setStickers(p=>p.map(s=>s.id===st.id?{...s,useTimeRange:checked, endTime: checked ? defaultEnd : s.endTime}:s));
                  }} className="w-3.5 h-3.5 rounded accent-[#e94560] cursor-pointer"/>
                  <span className="text-[12px] text-white/50 font-bold">{t('timeSetting')}</span>
                </label>
              </div>
              <button className="bg-red-500/20 text-red-400 p-1.5 rounded-lg hover:bg-red-500/30 shrink-0" onClick={()=>setStickers(p=>p.filter(s=>s.id!==st.id))}>✕</button>
            </div>
            {st.useTimeRange && (
              <div className="flex gap-2 pt-1 border-t border-white/5 mt-1">
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-[11px] text-white/30 font-bold">START</span>
                  <ClampedNumberInput value={st.startTime || 0} min={0} max={60} step={0.5} onChange={(v)=>setStickers(p=>p.map(s=>s.id===st.id?{...s,startTime:v}:s))} className="input-field text-[10px] text-center p-1 w-1/2 h-7"/>
                </div>
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-[11px] text-white/30 font-bold">END</span>
                  <ClampedNumberInput value={st.endTime || 5} min={0} max={60} step={0.5} onChange={(v)=>setStickers(p=>p.map(s=>s.id===st.id?{...s,endTime:v}:s))} className="input-field text-[10px] text-center p-1 w-1/2 h-7"/>
                </div>
              </div>
            )}
          </div>))}</div>
        </Section>
        <Section title={t('sectionExport')}><div className="bg-white/3 rounded-lg p-2.5 border border-white/5"><div className="flex items-center justify-between mb-1.5"><span className="text-sm font-semibold text-white/80">🟢 {t('greenScreen')}</span><button className={`w-12 h-6 rounded-full transition-colors relative border ${greenScreen?'bg-green-500 border-green-500':'bg-white/15 border-white/30'}`} onClick={()=>setGreenScreen(!greenScreen)}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${greenScreen?'left-6':'left-0.5'}`}/></button></div></div></Section></div>
      </aside>
      <section className="flex-1 space-y-3 order-1 lg:order-2">
        <div className="glass-panel p-3 sm:p-4">
          <div ref={previewContainerRef} className={`${getPreviewClass()} max-h-[60vh] sm:max-h-[70vh] mx-auto rounded-xl overflow-hidden relative`} style={{background:isDragOver?'rgba(233,69,96,0.15)':(greenScreen?'#00FF00':'repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, rgba(255,255,255,0.06) 0% 50%) 0 0 / 20px 20px'), border:isDragOver?'2px dashed #e94560':'2px solid transparent', ...getPreviewStyle()}} onWheel={handleWheel} onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {bgMediaUrl&&(()=>{ const userScale=bgMediaScale/100; const tx=(bgMediaX-50)*1.0; const ty=(bgMediaY-50)*1.0; const mediaStyle:React.CSSProperties={position:'absolute',width:`${userScale*100}%`,height:`${userScale*100}%`,objectFit:'contain',top:'50%',left:'50%',transform:`translate(calc(-50% + ${tx}%), calc(-50% + ${ty}%))`,transformOrigin:'center center', outline: (bgEnlargeEnabled && selectedElement==='bg') ? '3px dashed #e94560' : 'none', outlineOffset: '-4px'}; return(<div className={`draggable-item absolute inset-0 ${bgEnlargeEnabled ? 'cursor-grab active:cursor-grabbing pointer-events-auto' : 'pointer-events-none'}`} data-type="bg" data-id="bg" style={{overflow:'hidden'}}>{bgMediaType==='image'?(<img src={bgMediaUrl} alt="" style={mediaStyle}/>):(<video ref={bgVideoRef} src={bgMediaUrl} style={mediaStyle} muted={videoMuted} playsInline/>)}</div>); })()}
            
            <div className={`draggable-item absolute z-10 select-none cursor-grab active:cursor-grabbing ${isCurrentlyWaiting ? 'opacity-0 pointer-events-none' : ''} ${bgEnlargeEnabled ? 'pointer-events-none' : ''}`} data-type="record" data-id="record" style={{left:`${recordX}%`,top:`${recordY}%`,outline:(selectedElement==='record' && !bgEnlargeEnabled)?'1.5px dashed rgba(96,165,250,0.8)':'none', outlineOffset:'10px', padding:'4px', touchAction:'none', transition: (isResizing||layoutChanging||isAnimating) ? 'none' : 'opacity 0.2s ease', ...previewIntroStyle}}>
              <div className={`flex ${layout==='vertical'?`flex-col ${alignClass}`:'flex-row items-center'}`} style={{gap:`${RECORD_GAP_PX}px`,flexWrap:'nowrap',whiteSpace:'nowrap'}}>
                <div className="relative flex-shrink-0 inline-block">{showLabels&&(<span className={`absolute whitespace-nowrap font-bold uppercase ${metricAlign==='center'?'left-1/2 -translate-x-1/2':metricAlign==='right'?'right-0':'left-0'}`} style={{color:labelColor,fontFamily:selectedFont,fontSize:fontSize*0.4*(labelFontSize/100),bottom:'100%',marginBottom:LABEL_GAP_PX,letterSpacing:'0.02em'}}>{lblDuration.toUpperCase()}</span>)}<OdometerGroup key={`t-${animKey}`} value={showValues?durationStr:durationZero} fontSize={fontSize} duration={animDuration} color={digitColor} bgColor="transparent" fontFamily={selectedFont} animStyle={animStyle} staggerDelay={DEFAULT_STAGGER} spinCycles={showValues?spinCycles:0} noTransition={isResizing||layoutChanging} digitGap={fontSize*0.06*(spacing/10)}/></div>
                <div className="relative flex-shrink-0 inline-block">{showLabels&&(<span className={`absolute whitespace-nowrap font-bold uppercase ${metricAlign==='center'?'left-1/2 -translate-x-1/2':metricAlign==='right'?'right-0':'left-0'}`} style={{color:labelColor,fontFamily:selectedFont,fontSize:fontSize*0.4*(labelFontSize/100),bottom:'100%',marginBottom:LABEL_GAP_PX,letterSpacing:'0.02em'}}>{lblDistance.toUpperCase()}</span>)}<div className="relative inline-block"><OdometerGroup key={`d-${animKey}`} value={showValues?distStr:'0.00'} fontSize={fontSize} duration={animDuration} color={digitColor} bgColor="transparent" fontFamily={selectedFont} animStyle={animStyle} staggerDelay={DEFAULT_STAGGER} spinCycles={showValues?spinCycles:0} noTransition={isResizing||layoutChanging} digitGap={fontSize*0.06*(spacing/10)}/>{showUnits&&(<span className="font-medium whitespace-nowrap absolute" style={{color:labelColor,fontFamily:selectedFont,fontSize:fontSize*0.54,left:'100%',bottom:fontSize*0.18,marginLeft:fontSize*0.12,lineHeight:1}}>{unitKm}</span>)}</div></div>
                <div className="relative flex-shrink-0 inline-block">{showLabels&&(<span className={`absolute whitespace-nowrap font-bold uppercase ${metricAlign==='center'?'left-1/2 -translate-x-1/2':metricAlign==='right'?'right-0':'left-0'}`} style={{color:labelColor,fontFamily:selectedFont,fontSize:fontSize*0.4*(labelFontSize/100),bottom:'100%',marginBottom:LABEL_GAP_PX,letterSpacing:'0.02em'}}>{lblPace.toUpperCase()}</span>)}<div className="relative inline-block"><OdometerGroup key={`p-${animKey}`} value={showValues?paceStr:'00:00'} fontSize={fontSize} duration={animDuration} color={digitColor} bgColor="transparent" fontFamily={selectedFont} animStyle={animStyle} staggerDelay={DEFAULT_STAGGER} spinCycles={showValues?spinCycles:0} noTransition={isResizing||layoutChanging} digitGap={fontSize*0.06*(spacing/10)}/>{showUnits&&(<span className="font-medium whitespace-nowrap absolute" style={{color:labelColor,fontFamily:selectedFont,fontSize:fontSize*0.54,left:'100%',bottom:fontSize*0.18,marginLeft:fontSize*0.12,lineHeight:1}}>{unitPace}</span>)}</div></div>
              </div>
            </div>

            {textOverlays.map(ov=>(<div key={ov.id} className={`draggable-item absolute z-20 select-none cursor-grab active:cursor-grabbing ${bgEnlargeEnabled ? 'pointer-events-none' : ''}`} data-type="text" data-id={ov.id} style={{left:`${ov.x}%`,top:`${ov.y}%`,transform:`translate(-50%, -50%) rotate(${ov.rotation}deg)`,color:ov.color,fontSize:ov.fontSize,fontFamily:ov.fontFamily,fontWeight:600,textShadow:'0 2px 8px rgba(0,0,0,0.5)',whiteSpace:'nowrap',outline:(selectedElement===`text-${ov.id}` && !bgEnlargeEnabled)?'1.5px dashed rgba(96,165,250,0.8)':'none', outlineOffset:'6px', padding:'4px', touchAction:'none'}}>{ov.text}</div>))}
            {emojiOverlays.map(ov=>(<div key={ov.id} className={`draggable-item absolute z-20 select-none cursor-grab active:cursor-grabbing ${bgEnlargeEnabled ? 'pointer-events-none' : ''}`} data-type="emoji" data-id={ov.id} style={{left:`${ov.x}%`,top:`${ov.y}%`,transform:`translate(-50%, -50%) rotate(${ov.rotation}deg)`,fontSize:ov.size,outline:(selectedElement===`emoji-${ov.id}` && !bgEnlargeEnabled)?'1.5px dashed rgba(96,165,250,0.8)':'none', outlineOffset:'6px', padding:'4px', touchAction:'none'}}>{ov.emoji}</div>))}
            {stickers.map(st=>{
                if(st.useTimeRange && isAnimating){
                    const curSec = previewElapsed / 1000;
                    if(curSec < (st.startTime || 0) || curSec > (st.endTime || 999)) return null;
                }
                return (<div key={st.id} className={`draggable-item absolute z-20 select-none cursor-grab active:cursor-grabbing flex items-center justify-center shrink-0 ${st.rounded ? 'rounded-[15%]' : ''} ${bgEnlargeEnabled ? 'pointer-events-none' : ''}`} data-type="sticker" data-id={st.id} style={{left:`${st.x}%`,top:`${st.y}%`,width:st.aspectRatio>=1?st.size:st.size*st.aspectRatio,height:st.aspectRatio>=1?st.size/st.aspectRatio:st.size,transform:`translate(-50%, -50%) rotate(${st.rotation}deg)`,outline:(selectedElement===`sticker-${st.id}` && !bgEnlargeEnabled)?'1.5px dashed rgba(96,165,250,0.8)':'none', outlineOffset:'6px', padding:'0', touchAction:'none', border:st.borderWidth>0?`${st.borderWidth}px solid ${st.borderColor}`:'none', overflow:st.rounded?'hidden':'visible'}}><img src={st.url} alt="" className="w-full h-full object-fill pointer-events-none"/></div>);
            })}

            {bgEnlargeEnabled && (
                <div className="absolute top-3 left-3 z-50">
                    <button className="bg-[#e94560] text-white px-3 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 active:scale-95" onClick={() => { setBgEnlargeEnabled(false); if(selectedElement==='bg') setSelectedElement(null); }}>
                        📌 {t('fix')}
                    </button>
                </div>
            )}

            {selectedElement && !['record','bg'].includes(selectedElement) && !bgEnlargeEnabled && ( <div className="absolute top-2 left-2 z-40 scale-[0.4] origin-top-left"><button className="bg-red-500/80 hover:bg-red-500 text-white rounded-xl shadow-lg flex items-center justify-center w-12 h-12" onClick={deleteSelected} title="삭제"><span className="text-4xl font-bold">🗑</span></button></div>)}
            {isRecording&&(<div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-red-600/80 text-white text-[10px] px-2 py-1 rounded-full recording-pulse"><span className="w-1.5 h-1.5 bg-white rounded-full"/> REC</div>)}
          </div>
          
          {bgMediaUrl && bgMediaType === 'video' && (
            <div className="flex items-center justify-center gap-4 mt-4 py-2 border-t border-white/5">
                <button className="text-white/60 hover:text-white transition-colors" onClick={handleVideoToggle} title={videoPaused ? t('vidPlay') : t('vidPause')}>
                    <span className="text-2xl">{videoPaused ? '▶' : 'Ⅱ'}</span>
                </button>
                <button className="text-white/60 hover:text-white transition-colors" onClick={handleVideoStop} title={t('vidStop')}><span className="text-2xl">■</span></button>
                <div className="h-4 w-[1px] bg-white/10 mx-2"/>
                <span className="text-[10px] font-mono text-white/40">{bgVideoRef.current ? `${bgVideoRef.current.currentTime.toFixed(1)}s / ${bgVideoRef.current.duration.toFixed(1)}s` : '0.0s / 0.0s'}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 lg:grid-cols-2 gap-2.5 max-w-md mx-auto">
          <button className="w-full h-9 rounded-xl font-bold text-sm lg:text-xl bg-[#e94560] text-white active:scale-95 disabled:opacity-40" onClick={playAnimation} disabled={isAnimating||isRecording||!animEnabled}>{t('play')}</button>
          <button className="w-full h-9 rounded-xl font-bold text-sm lg:text-xl bg-white/15 text-white border border-white/30 active:scale-95 disabled:opacity-40" onClick={resetAnimation} disabled={isRecording}>{t('reset')}</button>
          <button 
            className="w-full h-9 rounded-xl font-bold text-sm lg:text-xl active:scale-95 disabled:opacity-40" 
            onClick={animEnabled ? startRecording : (bgMediaType === 'video' ? startRecording : captureImage)} 
            disabled={isRecording} 
            style={{background:isRecording?'#dc2626':'#7c3aed',color:'white'}}
          >
            {isRecording ? t('recording') : (animEnabled ? t('record') : (bgMediaType === 'video' ? t('record') : (language === 'ko' ? '이미지 저장' : 'Save Image')))}
          </button>
          <a 
            href={videoUrl || '#'} 
            download={videoUrl ? `runviz-record.${videoMimeType === 'video/mp4' ? 'mp4' : 'webm'}` : undefined}
            className={`w-full h-9 flex items-center justify-center rounded-xl font-bold text-sm lg:text-xl bg-[#059669] text-white active:scale-95 no-underline ${!videoUrl ? 'opacity-40 pointer-events-none' : ''}`}
            onClick={(e) => { if (!videoUrl) e.preventDefault(); }}
            aria-disabled={!videoUrl}
          >💾 {language==='ko'?'다운로드':'Download'}</a>
        </div>
        {videoUrl && (
          <p className="text-[10px] text-white/40 text-center mt-1.5">
            ※ {language==='ko' ? `모바일 다운로드 시 ${isSamsungBrowser && videoMimeType !== 'video/mp4' ? '고화질 WebM으로 저장될 수 있습니다. ' : ''}크롬 브라우저 사용을 권장합니다.` : `For mobile downloads, ${isSamsungBrowser && videoMimeType !== 'video/mp4' ? 'a high-quality WebM may be saved. ' : ''}using Chrome browser is recommended.`}
          </p>
        )}
        {videoUrl&&(<div className="glass-panel p-3 fade-in"><video src={videoUrl} controls className="w-full max-w-md mx-auto rounded-lg" style={{maxHeight:'300px'}}/></div>)}
      </section>
    </main>
    <footer className="border-t border-white/5 mt-6 py-3 text-center text-[10px] text-white/20">RunViz — Running Record Visualization Tool</footer>
  </div>);
}

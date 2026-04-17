import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Zap, Maximize, MousePointer2, Info, Eye, EyeOff, 
  Smartphone, Maximize2, Sun, Moon, PanelLeftClose, PanelLeftOpen, 
  ChevronRight, ChevronLeft 
} from 'lucide-react';

const App = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowSize.width < 768;
  const BASE_PX_PER_CM = isMobile ? 3.5 : 6; 

  // --- State ---
  const [theme, setTheme] = useState('dark'); 
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [mirrorType, setMirrorType] = useState('concave'); 
  const [u_cm, setU] = useState(60); 
  const [f_cm, setF] = useState(30); 
  const [objHeight_cm, setObjHeight] = useState(15);
  const [zoom, setZoom] = useState(1.0);
  
  // Interaction State
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Interaction Tracking
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(0);
  const activePointers = useRef(new Map()); 
  
  const [visibleRays, setVisibleRays] = useState({
    parallel: true,
    focal: true,
    center: false,
    pole: true
  });
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // --- Theme Colors ---
  const colors = useMemo(() => ({
    bg: theme === 'dark' ? '#020617' : '#f8fafc',
    grid: theme === 'dark' ? '#0f172a' : '#e2e8f0',
    axis: theme === 'dark' ? '#1e293b' : '#cbd5e1',
    text: theme === 'dark' ? '#f1f5f9' : '#0f172a',
    mirrorBack: theme === 'dark' ? '#1e293b' : '#94a3b8',
    hatch: theme === 'dark' ? '#334155' : '#cbd5e1',
  }), [theme]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  };

  const pxPerCm = useMemo(() => BASE_PX_PER_CM * zoom, [zoom, BASE_PX_PER_CM]);

  const physics = useMemo(() => {
    const signedU = -u_cm;
    const signedF = mirrorType === 'concave' ? -f_cm : f_cm;
    const signedV = (signedU * signedF) / (signedU - signedF);
    const m = -signedV / signedU;
    const imgHeight = objHeight_cm * m;

    let nature = "";
    if (Math.abs(u_cm - f_cm) < 0.5) {
      nature = "At Infinity (Parallel Rays)";
    } else if (signedV < 0) {
      nature = `Real & Inverted | ${Math.abs(m).toFixed(1)}x`;
    } else {
      nature = `Virtual & Erect | ${Math.abs(m).toFixed(1)}x`;
    }

    return { v: signedV, m, h_i: imgHeight, nature, f: signedF, u: signedU, c: 2 * signedF };
  }, [u_cm, f_cm, mirrorType, objHeight_cm]);

  const getCenters = (width, height) => {
    const baseOffset = (sidebarOpen && !isMobile) ? 140 : 0;
    const defaultCenterX = isMobile ? width * 0.7 : width / 2 + baseOffset; 
    const defaultCenterY = height / 2;
    return { 
      centerX: defaultCenterX + panOffset.x, 
      centerY: defaultCenterY + panOffset.y 
    };
  };

  const getMirrorIntersection = (x1, y1, x2, y2, centerX, centerY, radius, isConcave) => {
    const circleX = isConcave ? centerX - radius : centerX + radius;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const A = dx * dx + dy * dy;
    if (A === 0) return { x: centerX, y: y1 };
    const B = 2 * (dx * (x1 - circleX) + dy * (y1 - centerY));
    const C = (x1 - circleX) * (x1 - circleX) + (y1 - centerY) * (y1 - centerY) - radius * radius;
    const det = B * B - 4 * A * C;
    
    if (det < 0) return { x: centerX, y: y1 }; 
    const t1 = (-B + Math.sqrt(det)) / (2 * A);
    const t2 = (-B - Math.sqrt(det)) / (2 * A);
    
    const p1 = { x: x1 + t1 * dx, y: y1 + t1 * dy };
    const p2 = { x: x1 + t2 * dx, y: y1 + t2 * dy };
    
    return Math.abs(p1.x - centerX) < Math.abs(p2.x - centerX) ? p1 : p2;
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(activePointers.current.values());

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { centerX, centerY } = getCenters(rect.width, rect.height);
    const objX = centerX - (u_cm * pxPerCm);
    const objY = centerY - (objHeight_cm * pxPerCm);

    if (pointers.length === 1) {
      const distToTip = Math.sqrt(Math.pow(x - objX, 2) + Math.pow(y - objY, 2));
      const nearBase = Math.abs(x - objX) < 45 && y < centerY + 30 && y > objY - 30;

      if (distToTip < 60 || nearBase) {
        setIsDraggingObject(true);
      } else {
        setIsPanning(true);
      }
      lastTouchPos.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.length === 2) {
      const dist = Math.sqrt(Math.pow(pointers[0].x - pointers[1].x, 2) + Math.pow(pointers[0].y - pointers[1].y, 2));
      lastPinchDist.current = dist;
      setIsDraggingObject(false);
      setIsPanning(true);
    }
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(activePointers.current.values());

    if (isDraggingObject && pointers.length === 1) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const { centerX } = getCenters(rect.width, rect.height);
      const x = e.clientX - rect.left;
      const newU = (centerX - x) / pxPerCm;
      if (newU > 0.05) setU(Number(Math.min(newU, 500).toFixed(1)));
    } else if (isPanning) {
      if (pointers.length === 1) {
        const dx = e.clientX - lastTouchPos.current.x;
        const dy = e.clientY - lastTouchPos.current.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastTouchPos.current = { x: e.clientX, y: e.clientY };
      } else if (pointers.length === 2) {
        const dist = Math.sqrt(Math.pow(pointers[0].x - pointers[1].x, 2) + Math.pow(pointers[0].y - pointers[1].y, 2));
        if (lastPinchDist.current > 0) {
          const ratio = dist / lastPinchDist.current;
          setZoom(prev => Math.min(Math.max(prev * ratio, 0.05), 20.0));
        }
        lastPinchDist.current = dist;
        const midX = (pointers[0].x + pointers[1].x) / 2;
        const midY = (pointers[0].y + pointers[1].y) / 2;
        if (lastTouchPos.current.midX) {
            const dx = midX - lastTouchPos.current.midX;
            const dy = midY - lastTouchPos.current.midY;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }
        lastTouchPos.current = { ...lastTouchPos.current, midX, midY };
      }
    }
  };

  const handlePointerUp = (e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) lastPinchDist.current = 0;
    if (activePointers.current.size === 0) {
      setIsDraggingObject(false);
      setIsPanning(false);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.05), 20.0));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { width, height } = rect;
    const { centerX, centerY } = getCenters(width, height);
    const toPx = (cm) => cm * pxPerCm;
    const { v, h_i, f, u, c } = physics;
    const radiusPx = Math.abs(toPx(c));

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridStep = 50 * zoom;
    const startX = (panOffset.x % gridStep);
    const startY = (panOffset.y % gridStep);
    for (let i = startX; i < width; i += gridStep) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let j = startY; j < height; j += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke();
    }

    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); ctx.stroke();

    const angleRange = 0.55;
    ctx.save();
    if (mirrorType === 'concave') {
      const mCX = centerX - radiusPx; 
      ctx.strokeStyle = colors.mirrorBack; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx + 2, -angleRange, angleRange); ctx.stroke();
      ctx.strokeStyle = colors.hatch; ctx.lineWidth = 1;
      for (let a = -angleRange; a <= angleRange; a += 0.04) {
        const xs = mCX + radiusPx * Math.cos(a); const ys = centerY + radiusPx * Math.sin(a);
        ctx.beginPath(); ctx.moveTo(xs, ys); ctx.lineTo(xs + 6, ys + 6); ctx.stroke();
      }
      const grad = ctx.createLinearGradient(centerX - 20, centerY - 100, centerX, centerY + 100);
      grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(1, '#94a3b8');
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx, -angleRange, angleRange);
      ctx.strokeStyle = grad; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    } else {
      const mCX = centerX + radiusPx; 
      ctx.strokeStyle = colors.mirrorBack; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx - 2, Math.PI - angleRange, Math.PI + angleRange); ctx.stroke();
      ctx.strokeStyle = colors.hatch; ctx.lineWidth = 1;
      for (let a = Math.PI - angleRange; a <= Math.PI + angleRange; a += 0.04) {
        const xs = mCX + radiusPx * Math.cos(a); const ys = centerY + radiusPx * Math.sin(a);
        ctx.beginPath(); ctx.moveTo(xs, ys); ctx.lineTo(xs - 6, ys + 6); ctx.stroke();
      }
      const grad = ctx.createLinearGradient(centerX - 20, centerY - 100, centerX + 20, centerY + 100);
      grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.5, '#f8fafc'); grad.addColorStop(1, '#94a3b8');
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx, Math.PI - angleRange, Math.PI + angleRange);
      ctx.strokeStyle = grad; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();

    const drawP = (x, label, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, centerY, 4, 0, 7); ctx.fill();
      ctx.font = 'bold 11px Inter';
      ctx.fillStyle = colors.text;
      ctx.fillText(label, x - 5, centerY + 22);
    };
    drawP(centerX, 'P', '#64748b');
    drawP(centerX + toPx(f), 'F', '#fbbf24');
    drawP(centerX + toPx(c), 'C', '#f97316');

    const objX = centerX + toPx(u);
    const objY = centerY - toPx(objHeight_cm);
    drawArrow(ctx, objX, centerY, objX, objY, '#ef4444', 'Object', isDraggingObject);

    if (Math.abs(u_cm - f_cm) > 0.5) {
      const imgX = centerX + toPx(v);
      const imgY = centerY - toPx(h_i);
      const isConcave = mirrorType === 'concave';

      const drawRayPath = (startX, startY, midX, midY, endX, endY, color, isVisible) => {
        if (!isVisible) return;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(midX, midY); ctx.stroke();
        drawDirArrow(ctx, startX, startY, midX, midY);
        if (v < 0) {
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
          drawDirArrow(ctx, midX, midY, endX, endY);
        } else {
          const angle = Math.atan2(endY - midY, endX - midX);
          const extX = midX - 300 * Math.cos(angle);
          const extY = midY - 300 * Math.sin(angle);
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(extX, extY); ctx.stroke();
          drawDirArrow(ctx, midX, midY, extX, extY);
          ctx.setLineDash([4,4]);
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
          ctx.setLineDash([]);
        }
      };

      const hit1 = getMirrorIntersection(objX, objY, centerX + (isConcave ? 200 : -200), objY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit1.x, hit1.y, imgX, imgY, '#22c55e', visibleRays.parallel);
      const hit2 = getMirrorIntersection(objX, objY, centerX + toPx(f), centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit2.x, hit2.y, imgX, imgY, '#3b82f6', visibleRays.focal);
      const hit3 = getMirrorIntersection(objX, objY, centerX + toPx(c), centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit3.x, hit3.y, imgX, imgY, '#f97316', visibleRays.center);
      drawRayPath(objX, objY, centerX, centerY, imgX, imgY, '#ec4899', visibleRays.pole);

      drawArrow(ctx, imgX, centerY, imgX, imgY, '#a855f7', `Image (${Math.abs(v).toFixed(1)}cm)`);
    }
  }, [physics, mirrorType, u_cm, f_cm, objHeight_cm, pxPerCm, zoom, isDraggingObject, isPanning, panOffset, visibleRays, colors, sidebarOpen]);

  const drawDirArrow = (ctx, x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(0, 0); ctx.lineTo(-8, 5); ctx.stroke();
    ctx.restore();
  };

  const drawArrow = (ctx, x1, y1, x2, y2, color, label, glow) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = glow ? 5 : 3;
    if (glow) { ctx.shadowBlur = 15; ctx.shadowColor = color; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 12 * Math.cos(a - 0.5), y2 - 12 * Math.sin(a - 0.5));
    ctx.lineTo(x2 - 12 * Math.cos(a + 0.5), y2 - 12 * Math.sin(a + 0.5)); ctx.fill();
    ctx.shadowBlur = 0; ctx.font = '800 13px Inter';
    ctx.fillText(label, x2 - 30, y2 < y1 ? y2 - 15 : y2 + 25);
  };

  const navThemeClass = theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200';
  const sidebarThemeClass = theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200';
  const btnThemeClass = theme === 'dark' ? 'bg-slate-800 border-white/5 hover:bg-slate-700 text-slate-100' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-900';

  return (
    <div ref={containerRef} className={`flex flex-col h-dvh ${theme === 'dark' ? 'bg-[#020617] text-slate-100' : 'bg-slate-50 text-slate-900'} overflow-hidden font-sans transition-colors duration-300 relative`}>
      <nav className={`flex items-center justify-between px-4 md:px-6 py-4 border-b z-50 transition-colors duration-300 ${navThemeClass}`}>
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2 rounded-lg border transition-colors ${btnThemeClass}`}>
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="p-1.5 md:p-2 bg-blue-600 rounded-lg shadow-blue-500/20"><Zap className="w-4 h-4 md:w-5 md:h-5 text-white" /></div>
          <h1 className="text-sm md:text-lg font-black uppercase tracking-tighter">Optics<span className="text-blue-500">Master</span></h1>
        </div>
        <div className="flex gap-1.5 md:gap-2">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg border transition-colors ${btnThemeClass}`} title="Toggle Theme">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
            </button>
            <button onClick={toggleFullScreen} className={`p-2 rounded-lg border transition-colors ${btnThemeClass}`}>
              <Maximize2 className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`} />
            </button>
            <div className={`flex p-0.5 md:p-1 rounded-xl border ${theme === 'dark' ? 'bg-slate-800 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                <button onClick={() => setMirrorType('concave')} className={`px-2 md:px-4 py-1 text-[9px] md:text-[10px] font-black rounded-lg transition-all ${mirrorType === 'concave' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}>CONCAVE</button>
                <button onClick={() => setMirrorType('convex')} className={`px-2 md:px-4 py-1 text-[9px] md:text-[10px] font-black rounded-lg transition-all ${mirrorType === 'convex' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500'}`}>CONVEX</button>
            </div>
            <button onClick={() => {setZoom(1.0); setPanOffset({x:0, y:0});}} className={`p-2 rounded-lg border transition-colors ${btnThemeClass}`}><Maximize className="w-4 h-4" /></button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className={`
          absolute top-0 left-0 bottom-0 z-[100] md:relative
          ${sidebarOpen ? 'w-72 sm:w-80 translate-x-0' : '-translate-x-full md:w-0'}
          backdrop-blur-xl border-r flex flex-col transition-all duration-300 ease-in-out ${sidebarThemeClass} overflow-hidden
        `}>
          <div className="p-5 md:p-6 space-y-5 md:space-y-6 flex-1 overflow-y-auto w-72 sm:w-80">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Lab Setup</h3>
               <button onClick={() => setSidebarOpen(false)} className="p-2 bg-slate-800/20 rounded-lg hover:bg-slate-800/40"><ChevronLeft className="w-4 h-4" /></button>
            </div>

            <section className="space-y-6">
              <SliderWithInput theme={theme} label="Distance (u)" val={u_cm} min={5} max={300} unit="cm" onChange={setU} color="blue" />
              <SliderWithInput theme={theme} label="Focal (f)" val={f_cm} min={10} max={150} unit="cm" onChange={setF} color="amber" />
              <SliderWithInput theme={theme} label="Height" val={objHeight_cm} min={5} max={80} unit="cm" onChange={setObjHeight} color="red" />
            </section>

            <section>
              <h3 className={`text-[10px] font-black uppercase tracking-widest mb-4 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Ray Visibility</h3>
              <div className="grid grid-cols-2 gap-2">
                <ToggleButton theme={theme} label="Parallel" active={visibleRays.parallel} color="#22c55e" onClick={() => setVisibleRays(v => ({...v, parallel: !v.parallel}))} />
                <ToggleButton theme={theme} label="Focal" active={visibleRays.focal} color="#3b82f6" onClick={() => setVisibleRays(v => ({...v, focal: !v.focal}))} />
                <ToggleButton theme={theme} label="Center" active={visibleRays.center} color="#f97316" onClick={() => setVisibleRays(v => ({...v, center: !v.center}))} />
                <ToggleButton theme={theme} label="Pole" active={visibleRays.pole} color="#ec4899" onClick={() => setVisibleRays(v => ({...v, pole: !v.pole}))} />
              </div>
            </section>

            <section className={`p-4 rounded-2xl border mt-auto shadow-inner transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900/80 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center text-[10px] md:text-xs mb-1.5">
                <span className={`uppercase font-black ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Image Distance</span>
                <span className="font-mono font-bold text-blue-400">{Math.abs(physics.v).toFixed(1)} cm</span>
              </div>
              <p className={`text-[10px] md:text-xs font-bold italic truncate ${theme === 'dark' ? 'text-white' : 'text-slate-700'}`}>"{physics.nature}"</p>
            </section>
          </div>
        </aside>

        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-[60] p-3 rounded-r-2xl border transition-all duration-300 ${btnThemeClass} shadow-2xl`}
          >
            <ChevronRight className="w-5 h-5 text-blue-500" />
          </button>
        )}

        {isMobile && sidebarOpen && (
          <div className="absolute inset-0 bg-black/40 z-[90] backdrop-blur-[1px]" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 relative touch-none overflow-hidden transition-all duration-300" style={{ backgroundColor: colors.bg }}>
          <canvas 
            ref={canvasRef} 
            onWheel={handleWheel} 
            onPointerDown={handlePointerDown} 
            onPointerMove={handlePointerMove} 
            onPointerUp={handlePointerUp} 
            onPointerCancel={handlePointerUp}
            className={`w-full h-full ${isDraggingObject ? 'cursor-grabbing' : 'cursor-crosshair'}`} 
          />
        </main>
      </div>
    </div>
  );
};

const ToggleButton = ({ label, active, onClick, color, theme }) => {
  const activeClass = theme === 'dark' ? 'bg-slate-800 border-white/20 text-white' : 'bg-blue-50 border-blue-200 text-blue-700';
  const inactiveClass = theme === 'dark' ? 'bg-slate-900/50 border-white/5 text-slate-600' : 'bg-slate-100 border-slate-200 text-slate-400';
  return (
    <button onClick={onClick} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all text-[9px] font-bold ${active ? activeClass : inactiveClass}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{backgroundColor: active ? color : (theme === 'dark' ? '#334155' : '#cbd5e1')}} />
        {label}
      </div>
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
    </button>
  );
};

const SliderWithInput = ({ label, val, min, max, unit, onChange, color, theme }) => {
  const accentColors = { blue: 'accent-blue-500', amber: 'accent-amber-500', red: 'accent-red-500' };
  const borderColors = { blue: 'border-blue-500/30', amber: 'border-amber-500/30', red: 'border-red-500/30' };
  const inputBg = theme === 'dark' ? 'bg-slate-800' : 'bg-white';
  const labelColor = theme === 'dark' ? 'text-slate-500' : 'text-slate-400';
  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';

  return (
    <div className="space-y-1.5 md:space-y-3">
      <div className="flex justify-between items-center text-[8px] md:text-[10px] font-black uppercase mb-1">
        <span className={labelColor}>{label}</span>
        <div className={`flex items-center border ${borderColors[color]} rounded px-2 py-1 ${inputBg}`}>
          <input 
            type="number" 
            inputMode="decimal"
            value={val} 
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (!isNaN(num)) onChange(num);
            }}
            className={`w-10 md:w-12 bg-transparent font-mono text-center outline-none ${textColor}`}
          />
          <span className={`${labelColor} ml-0.5 font-bold`}>{unit}</span>
        </div>
      </div>
      <input 
        type="range" min={min} max={max} step="0.5" value={val} 
        onChange={(e) => onChange(Number(e.target.value))} 
        className={`w-full h-1.5 md:h-2 rounded-full appearance-none cursor-pointer transition-all ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'} ${accentColors[color]}`} 
      />
    </div>
  );
};

export default App;
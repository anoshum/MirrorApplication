import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, RefreshCcw, HelpCircle, Zap, Move, Search, Maximize, MousePointer2, Info, Eye, EyeOff, Grab } from 'lucide-react';

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
  const BASE_PX_PER_CM = isMobile ? 4 : 6; 

  // --- State ---
  const [mirrorType, setMirrorType] = useState('concave'); 
  const [u_cm, setU] = useState(60); 
  const [f_cm, setF] = useState(30); 
  const [objHeight_cm, setObjHeight] = useState(15);
  const [zoom, setZoom] = useState(1.0);
  
  // Interaction State
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const lastPointerPos = useRef({ x: 0, y: 0 });
  
  // Ray Visibility State
  const [visibleRays, setVisibleRays] = useState({
    parallel: true,
    focal: true,
    center: false,
    pole: false
  });
  
  const canvasRef = useRef(null);

  // --- Derived Calculations ---
  const pxPerCm = useMemo(() => BASE_PX_PER_CM * zoom, [zoom, BASE_PX_PER_CM]);

  const physics = useMemo(() => {
    const signedU = -u_cm;
    const signedF = mirrorType === 'concave' ? -f_cm : f_cm;
    const signedV = (signedU * signedF) / (signedU - signedF);
    const magnification = -signedV / signedU;
    const imgHeight = objHeight_cm * magnification;

    let nature = "";
    if (Math.abs(u_cm - f_cm) < 0.5) {
      nature = "At Infinity (Parallel Rays)";
    } else if (signedV < 0) {
      nature = `Real & Inverted | ${Math.abs(magnification).toFixed(1)}x`;
    } else {
      nature = `Virtual & Erect | ${Math.abs(magnification).toFixed(1)}x`;
    }

    return { v: signedV, m: magnification, h_i: imgHeight, nature, f: signedF, u: signedU, c: 2 * signedF };
  }, [u_cm, f_cm, mirrorType, objHeight_cm]);

  const getCenters = (width, height) => {
    const defaultCenterX = isMobile ? width * 0.75 : width / 2 + 150; 
    const defaultCenterY = height / 2;
    return { 
      centerX: defaultCenterX + panOffset.x, 
      centerY: defaultCenterY + panOffset.y 
    };
  };

  // --- Circle Intersection Math ---
  const getMirrorIntersection = (x1, y1, x2, y2, centerX, centerY, radius, isConcave) => {
    const circleX = isConcave ? centerX - radius : centerX + radius;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const A = dx * dx + dy * dy;
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

  // --- Interaction Handlers ---
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.2), 5.0));
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { centerX, centerY } = getCenters(rect.width, rect.height);
    const objX = centerX - (u_cm * pxPerCm);
    const objY = centerY - (objHeight_cm * pxPerCm);
    
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    // Hit detection for dragging the object
    if (Math.abs(x - objX) < 40 && y < centerY + 20 && y > objY - 20) {
      setIsDraggingObject(true);
      canvas.setPointerCapture(e.pointerId);
    } else {
      // Start panning the environment
      setIsPanning(true);
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    if (isDraggingObject) {
      const { centerX } = getCenters(rect.width, rect.height);
      const x = e.clientX - rect.left;
      const newU = (centerX - x) / pxPerCm;
      if (newU > 1) setU(Math.min(newU, 400));
    } else if (isPanning) {
      const dx = e.clientX - lastPointerPos.current.x;
      const dy = e.clientY - lastPointerPos.current.y;
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e) => {
    setIsDraggingObject(false);
    setIsPanning(false);
    if (canvasRef.current) canvasRef.current.releasePointerCapture(e.pointerId);
  };

  // --- Drawing Loop ---
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

    // 1. Grid (relative to pan and zoom)
    ctx.strokeStyle = '#0f172a';
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

    // 2. Axis
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(width, centerY); ctx.stroke();

    // 3. Mirror Construction
    const angleRange = 0.55;
    ctx.save();
    if (mirrorType === 'concave') {
      const mCX = centerX - radiusPx;
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx + 2, -angleRange, angleRange); ctx.stroke();
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
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
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(mCX, centerY, radiusPx - 2, Math.PI - angleRange, Math.PI + angleRange); ctx.stroke();
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
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

    // 4. Points
    const drawP = (x, label, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, centerY, 4, 0, 7); ctx.fill();
      ctx.font = 'bold 11px Inter'; ctx.fillText(label, x - 5, centerY + 22);
    };
    drawP(centerX, 'P', '#fff');
    drawP(centerX + toPx(f), 'F', '#fbbf24');
    drawP(centerX + toPx(c), 'C', '#f97316');

    // 5. Object
    const objX = centerX + toPx(u);
    const objY = centerY - toPx(objHeight_cm);
    drawArrow(ctx, objX, centerY, objX, objY, '#ef4444', 'Object', isDraggingObject);

    // 6. Rays
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
          const extX = midX - 200 * Math.cos(angle);
          const extY = midY - 200 * Math.sin(angle);
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(extX, extY); ctx.stroke();
          drawDirArrow(ctx, midX, midY, extX, extY);
          ctx.setLineDash([4,4]);
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
          ctx.setLineDash([]);
        }
      };

      // Ray 1: Parallel to Axis
      const hit1 = getMirrorIntersection(objX, objY, centerX + (isConcave ? 200 : -200), objY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit1.x, hit1.y, imgX, imgY, '#22c55e', visibleRays.parallel);

      // Ray 2: Through F
      const fX = centerX + toPx(f);
      const hit2 = getMirrorIntersection(objX, objY, fX, centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit2.x, hit2.y, imgX, imgY, '#3b82f6', visibleRays.focal);

      // Ray 3: Through C
      const cX = centerX + toPx(c);
      const hit3 = getMirrorIntersection(objX, objY, cX, centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit3.x, hit3.y, imgX, imgY, '#f97316', visibleRays.center);

      // Ray 4: To Pole P
      const hit4 = { x: centerX, y: centerY };
      drawRayPath(objX, objY, hit4.x, hit4.y, imgX, imgY, '#ec4899', visibleRays.pole);

      // 7. Image
      drawArrow(ctx, imgX, centerY, imgX, imgY, '#a855f7', `Image (${Math.abs(v).toFixed(1)}cm)`);
    }

  }, [physics, mirrorType, u_cm, f_cm, objHeight_cm, pxPerCm, zoom, isDraggingObject, isPanning, panOffset, visibleRays]);

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

  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 overflow-hidden font-sans">
      <nav className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-white/5 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20"><Zap className="w-5 h-5" /></div>
          <h1 className="text-lg font-black uppercase">Optics<span className="text-blue-500">Master</span></h1>
        </div>
        <div className="flex gap-2">
            <div className="flex bg-slate-800 p-1 rounded-xl border border-white/5">
                <button onClick={() => setMirrorType('concave')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${mirrorType === 'concave' ? 'bg-blue-600' : 'text-slate-500'}`}>CONCAVE</button>
                <button onClick={() => setMirrorType('convex')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${mirrorType === 'convex' ? 'bg-blue-600' : 'text-slate-500'}`}>CONVEX</button>
            </div>
            <button onClick={resetView} className="p-2 bg-slate-800 rounded-lg border border-white/5" title="Reset Zoom and Pan">
              <Maximize className="w-4 h-4" />
            </button>
        </div>
      </nav>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <aside className="w-full md:w-80 bg-slate-900/30 border-r border-white/5 flex flex-col p-6 space-y-8 z-40 overflow-y-auto">
          <section className="space-y-6">
            <Slider label="Object Dist (u)" val={u_cm} min={5} max={180} unit="cm" onChange={setU} color="blue" />
            <Slider label="Focal Length (f)" val={f_cm} min={10} max={80} unit="cm" onChange={setF} color="amber" />
            <Slider label="Object Height" val={objHeight_cm} min={5} max={50} unit="cm" onChange={setObjHeight} color="red" />
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Ray Visibility</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton label="Parallel" active={visibleRays.parallel} color="#22c55e" onClick={() => setVisibleRays(v => ({...v, parallel: !v.parallel}))} />
              <ToggleButton label="Focal" active={visibleRays.focal} color="#3b82f6" onClick={() => setVisibleRays(v => ({...v, focal: !v.focal}))} />
              <ToggleButton label="Center" active={visibleRays.center} color="#f97316" onClick={() => setVisibleRays(v => ({...v, center: !v.center}))} />
              <ToggleButton label="Pole" active={visibleRays.pole} color="#ec4899" onClick={() => setVisibleRays(v => ({...v, pole: !v.pole}))} />
            </div>
          </section>

          <section className="p-5 bg-slate-900/80 rounded-2xl border border-white/10 mt-auto">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="text-slate-500 uppercase font-black">Image Dist</span>
              <span className="font-mono font-bold text-blue-400">{Math.abs(physics.v).toFixed(1)} cm</span>
            </div>
            <p className="text-xs font-bold text-white leading-tight italic">"{physics.nature}"</p>
          </section>
        </aside>

        <main className="flex-1 relative bg-slate-950 touch-none">
          <canvas 
            ref={canvasRef} 
            onWheel={handleWheel} 
            onPointerDown={handlePointerDown} 
            onPointerMove={handlePointerMove} 
            onPointerUp={handlePointerUp} 
            className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`} 
          />
          
          <div className="absolute top-6 left-6 flex flex-col gap-2 z-10 pointer-events-none">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 backdrop-blur-md rounded-full border border-white/5 text-[9px] font-black uppercase">
                <Search className="w-3 h-3 text-slate-400" /> Zoom: Scroll / Pinch
             </div>
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 backdrop-blur-md rounded-full border border-white/5 text-[9px] font-black uppercase">
                <Grab className="w-3 h-3 text-slate-400" /> Left-Click & Drag: Move Workspace
             </div>
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 backdrop-blur-md rounded-full border border-white/5 text-[9px] font-black uppercase">
                <MousePointer2 className="w-3 h-3 text-slate-400" /> Drag red arrow: move object
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const ToggleButton = ({ label, active, onClick, color }) => (
  <button onClick={onClick} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-[10px] font-bold ${active ? 'bg-slate-800 border-white/20 text-white' : 'bg-slate-900/50 border-white/5 text-slate-600'}`}>
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{backgroundColor: active ? color : '#334155'}} />
      {label}
    </div>
    {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
  </button>
);

const Slider = ({ label, val, min, max, unit, onChange, color }) => {
  const accentColors = { blue: 'accent-blue-500', amber: 'accent-amber-500', red: 'accent-red-500' };
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[10px] font-black uppercase">
        <span className="text-slate-500">{label}</span>
        <span className="text-white">{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={val} onChange={(e) => onChange(Number(e.target.value))} className={`w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer ${accentColors[color]}`} />
    </div>
  );
};

export default App;
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, RefreshCcw, HelpCircle, Zap, Move, Search, Maximize, MousePointer2, Info, Eye, EyeOff, Grab, Smartphone, Maximize2 } from 'lucide-react';

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
  const [mirrorType, setMirrorType] = useState('concave'); 
  const [u_cm, setU] = useState(60); 
  const [f_cm, setF] = useState(30); 
  const [objHeight_cm, setObjHeight] = useState(15);
  const [zoom, setZoom] = useState(1.0);
  
  // Interaction State
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Mobile Touch Tracking
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(0);
  const activePointers = useRef(new Map()); 
  
  // Ray Visibility State
  const [visibleRays, setVisibleRays] = useState({
    parallel: true,
    focal: true,
    center: false,
    pole: true
  });
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // --- Full Screen Logic ---
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // --- Derived Calculations ---
  const pxPerCm = useMemo(() => BASE_PX_PER_CM * zoom, [zoom, BASE_PX_PER_CM]);

  const physics = useMemo(() => {
    const signedU = -u_cm;
    // Cartesian: Concave f is negative (left), Convex f is positive (right)
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
    // Corrected geometry logic:
    // Concave: Center is at centerX - radius (to the left of Pole)
    // Convex: Center is at centerX + radius (to the right of Pole)
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
    // We want the point closest to the Pole (centerX)
    return Math.abs(p1.x - centerX) < Math.abs(p2.x - centerX) ? p1 : p2;
  };

  // --- INTERACTION HANDLERS ---
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(activePointers.current.values());

    if (pointers.length === 1) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { centerX, centerY } = getCenters(rect.width, rect.height);
      const objX = centerX - (u_cm * pxPerCm);
      const objY = centerY - (objHeight_cm * pxPerCm);
      
      const distToTip = Math.sqrt(Math.pow(x - objX, 2) + Math.pow(y - objY, 2));
      const nearBase = Math.abs(x - objX) < 40 && y < centerY + 10 && y > objY - 10;

      if (distToTip < 40 || nearBase) {
        setIsDraggingObject(true);
      } else {
        setIsPanning(true);
      }
      lastTouchPos.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.length === 2) {
      const dist = Math.sqrt(
        Math.pow(pointers[0].x - pointers[1].x, 2) + 
        Math.pow(pointers[0].y - pointers[1].y, 2)
      );
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
      if (newU > 0.1) setU(Number(Math.min(newU, 500).toFixed(1)));
    } else if (isPanning) {
      if (pointers.length === 1) {
        const dx = e.clientX - lastTouchPos.current.x;
        const dy = e.clientY - lastTouchPos.current.y;
        setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastTouchPos.current = { x: e.clientX, y: e.clientY };
      } else if (pointers.length === 2) {
        const dist = Math.sqrt(
          Math.pow(pointers[0].x - pointers[1].x, 2) + 
          Math.pow(pointers[0].y - pointers[1].y, 2)
        );
        
        if (lastPinchDist.current > 0) {
          const ratio = dist / lastPinchDist.current;
          setZoom(prev => Math.min(Math.max(prev * ratio, 0.1), 10.0));
        }
        lastPinchDist.current = dist;

        const midX = (pointers[0].x + pointers[1].x) / 2;
        const midY = (pointers[0].y + pointers[1].y) / 2;
        if (lastTouchPos.current.midX) {
            const dx = midX - lastTouchPos.current.midX;
            const dy = midY - lastTouchPos.current.midY;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }
        lastTouchPos.current = { x: e.clientX, y: e.clientY, midX, midY };
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
    setZoom(prev => Math.min(Math.max(prev * delta, 0.1), 10.0));
  };

  // --- Drawing Logic ---
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

    // 1. Grid
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
    // Orientation Fixed: 
    // Concave should curve around the object (opening left).
    // Convex should curve away from the object (opening right).
    if (mirrorType === 'concave') {
      const mCX = centerX - radiusPx; // Center is left of pole
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
      // Arc on the RIGHT of the center point is Concave if object is LEFT
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
      const mCX = centerX + radiusPx; // Center is right of pole
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8;
      // Arc on the LEFT of the center point is Convex if object is LEFT
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
        if (v < 0) { // Real
          ctx.beginPath(); ctx.moveTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
          drawDirArrow(ctx, midX, midY, endX, endY);
        } else { // Virtual
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

      // Intersection logic adjusted for new mirror orientations
      const hit1 = getMirrorIntersection(objX, objY, centerX + (isConcave ? 200 : -200), objY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit1.x, hit1.y, imgX, imgY, '#22c55e', visibleRays.parallel);
      
      const fX = centerX + toPx(f);
      const hit2 = getMirrorIntersection(objX, objY, fX, centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit2.x, hit2.y, imgX, imgY, '#3b82f6', visibleRays.focal);
      
      const cX = centerX + toPx(c);
      const hit3 = getMirrorIntersection(objX, objY, cX, centerY, centerX, centerY, radiusPx, isConcave);
      drawRayPath(objX, objY, hit3.x, hit3.y, imgX, imgY, '#f97316', visibleRays.center);
      
      // Ray hitting exactly at the pole
      drawRayPath(objX, objY, centerX, centerY, imgX, imgY, '#ec4899', visibleRays.pole);

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

  return (
    <div ref={containerRef} className="flex flex-col h-screen bg-[#020617] text-slate-100 overflow-hidden font-sans">
      <nav className="flex items-center justify-between px-4 md:px-6 py-4 bg-slate-900 border-b border-white/5 z-50 shadow-xl">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-1.5 md:p-2 bg-blue-600 rounded-lg shadow-blue-500/20"><Zap className="w-4 h-4 md:w-5 md:h-5" /></div>
          <h1 className="text-sm md:text-lg font-black uppercase tracking-tighter">Optics<span className="text-blue-500">Master</span></h1>
        </div>
        <div className="flex gap-2">
            <button onClick={toggleFullScreen} className="p-2 bg-slate-800 rounded-lg border border-white/5 hover:bg-slate-700 transition-colors" title="Full Screen">
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="flex bg-slate-800 p-0.5 md:p-1 rounded-xl border border-white/5">
                <button onClick={() => setMirrorType('concave')} className={`px-2 md:px-4 py-1 text-[9px] md:text-[10px] font-black rounded-lg transition-all ${mirrorType === 'concave' ? 'bg-blue-600' : 'text-slate-500'}`}>CONCAVE</button>
                <button onClick={() => setMirrorType('convex')} className={`px-2 md:px-4 py-1 text-[9px] md:text-[10px] font-black rounded-lg transition-all ${mirrorType === 'convex' ? 'bg-blue-600' : 'text-slate-500'}`}>CONVEX</button>
            </div>
            <button onClick={() => {setZoom(1.0); setPanOffset({x:0, y:0});}} className="p-2 bg-slate-800 rounded-lg border border-white/5"><Maximize className="w-4 h-4" /></button>
        </div>
      </nav>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <aside className="w-full md:w-80 bg-slate-900/40 backdrop-blur-md border-b md:border-b-0 md:border-r border-white/5 flex flex-col p-4 md:p-6 space-y-4 md:space-y-6 z-40 overflow-y-auto">
          <section className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-4 md:gap-6">
            <SliderWithInput label="Distance (u)" val={u_cm} min={5} max={180} unit="cm" onChange={setU} color="blue" />
            <SliderWithInput label="Focal (f)" val={f_cm} min={10} max={80} unit="cm" onChange={setF} color="amber" />
            <SliderWithInput label="Height" val={objHeight_cm} min={5} max={50} unit="cm" onChange={setObjHeight} color="red" />
          </section>

          <section className="hidden md:block">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Ray Visibility</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton label="Parallel" active={visibleRays.parallel} color="#22c55e" onClick={() => setVisibleRays(v => ({...v, parallel: !v.parallel}))} />
              <ToggleButton label="Focal" active={visibleRays.focal} color="#3b82f6" onClick={() => setVisibleRays(v => ({...v, focal: !v.focal}))} />
              <ToggleButton label="Center" active={visibleRays.center} color="#f97316" onClick={() => setVisibleRays(v => ({...v, center: !v.center}))} />
              <ToggleButton label="Pole" active={visibleRays.pole} color="#ec4899" onClick={() => setVisibleRays(v => ({...v, pole: !v.pole}))} />
            </div>
          </section>

          <section className="p-3 md:p-5 bg-slate-900/80 rounded-2xl border border-white/10 mt-auto shadow-inner">
            <div className="flex justify-between items-center text-[10px] md:text-xs mb-1">
              <span className="text-slate-500 uppercase font-black">Image Position</span>
              <span className="font-mono font-bold text-blue-400">{Math.abs(physics.v).toFixed(1)} cm</span>
            </div>
            <p className="text-[10px] md:text-xs font-bold text-white italic truncate">"{physics.nature}"</p>
          </section>
        </aside>

        <main className="flex-1 relative bg-slate-950 touch-none overflow-hidden">
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

const ToggleButton = ({ label, active, onClick, color }) => (
  <button onClick={onClick} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-[9px] font-bold ${active ? 'bg-slate-800 border-white/20 text-white' : 'bg-slate-900/50 border-white/5 text-slate-600'}`}>
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{backgroundColor: active ? color : '#334155'}} />
      {label}
    </div>
    {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
  </button>
);

const SliderWithInput = ({ label, val, min, max, unit, onChange, color }) => {
  const accentColors = { blue: 'accent-blue-500', amber: 'accent-amber-500', red: 'accent-red-500' };
  const borderColors = { blue: 'border-blue-500/30', amber: 'border-amber-500/30', red: 'border-red-500/30' };

  return (
    <div className="space-y-1 md:space-y-3">
      <div className="flex justify-between items-center text-[8px] md:text-[10px] font-black uppercase mb-1">
        <span className="text-slate-500">{label}</span>
        <div className={`flex items-center bg-slate-800 border ${borderColors[color]} rounded px-1.5 py-0.5`}>
          <input 
            type="number" 
            value={val} 
            onChange={(e) => {
              const num = parseFloat(e.target.value);
              if (!isNaN(num)) onChange(num);
            }}
            className="w-8 md:w-10 bg-transparent text-white font-mono text-center outline-none"
          />
          <span className="text-slate-500 ml-0.5">{unit}</span>
        </div>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step="0.5"
        value={val} 
        onChange={(e) => onChange(Number(e.target.value))} 
        className={`w-full h-1 md:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer ${accentColors[color]}`} 
      />
    </div>
  );
};

export default App;
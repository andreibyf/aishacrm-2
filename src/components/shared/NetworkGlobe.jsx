import React, { useRef, useEffect } from 'react';

const NODES_COUNT = 150;
const CONNECTION_DISTANCE = 110;
const SPHERE_RADIUS = 250;
const ROTATION_SPEED = 0.001;

export const NetworkGlobe = ({ logoUrl }) => {
  const canvasRef = useRef(null);
  const [logoImg, setLogoImg] = React.useState(null);

  useEffect(() => {
    if (!logoUrl) return;
    const img = new Image();
    img.src = logoUrl;
    img.onload = () => setLogoImg(img);
  }, [logoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width;
    let height = canvas.height;
    
    // Setup resize handler
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        width = canvas.width;
        height = canvas.height;
      }
    };
    
    // Robust resize observations
    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    setTimeout(resizeCanvas, 100);
    setTimeout(resizeCanvas, 500);

    // Initialize nodes
    const nodes = [];
    const colors = ['#22D3EE', '#9DFF00', '#0891b2', '#10b981'];
    
    for (let i = 0; i < NODES_COUNT; i++) {
      // Golden spiral distribution for initial uniform coverage on a sphere
      const phi = Math.acos(1 - 2 * (i + 0.5) / NODES_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      
      const x = SPHERE_RADIUS * Math.cos(theta) * Math.sin(phi);
      const y = SPHERE_RADIUS * Math.sin(theta) * Math.sin(phi);
      const z = SPHERE_RADIUS * Math.cos(phi);
      
      nodes.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        vz: (Math.random() - 0.5) * 0.5,
        ox: 0, oy: 0, tx: 0, ty: 0,
        pulseRadius: 0, isPulsing: false,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let angleX = 0;
    let angleY = 0;
    let animationFrameId;

    const mouseRef = { x: -1000, y: -1000, isHovering: false };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.x = e.clientX - rect.left;
      mouseRef.y = e.clientY - rect.top;
      mouseRef.isHovering = true;
    };

    const handleMouseLeave = () => {
      mouseRef.isHovering = false;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      
      const cx = width / 2;
      const cy = height / 2;

      // Auto rotation
      angleY += ROTATION_SPEED;
      angleX += ROTATION_SPEED * 0.5;

      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      const projectedNodes = nodes.map(node => {
        // Rotate
        const y1 = node.y * cosX - node.z * sinX;
        const z1 = node.y * sinX + node.z * cosX;
        const x2 = node.x * cosY + z1 * sinY;
        const z2 = -node.x * sinY + z1 * cosY;

        // Add 3D perspective distortion
        const k = 400 / (400 + z2);
        
        const basePx = cx + x2 * k;
        const basePy = cy + y1 * k;
        
        node.tx = 0;
        node.ty = 0;

        // Interaction processing
        if (mouseRef.isHovering) {
            const dx = basePx - mouseRef.x;
            const dy = basePy - mouseRef.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const interactionRadius = 130;
            
            // Front-facing nodes get pulled stronger than back-facing nodes
            if (dist < interactionRadius && z2 > -100) {
               const pull = 1 - (dist / interactionRadius);
               const depthMultiplier = z2 > 0 ? 1 : 0.4; // Nodes in front pull more dynamically
               // Pull node towards the cursor
               node.tx = -dx * pull * 1.5 * depthMultiplier; 
               node.ty = -dy * pull * 1.5 * depthMultiplier;
            }
        }
        
        // Spring physics for smooth transitions
        node.ox += (node.tx - node.ox) * 0.12;
        node.oy += (node.ty - node.oy) * 0.12;
        
        return {
          px: basePx + node.ox,
          py: basePy + node.oy,
          pz: z2,
          radius: Math.max(0.5, 3 * k),
          original: node
        };
      });

      // Z-sort nodes
      projectedNodes.sort((a, b) => b.pz - a.pz);

      // Helper function to draw connections
      const drawConnections = (filterFn, isFront = false) => {
        for (let i = 0; i < projectedNodes.length; i++) {
          for (let j = i + 1; j < projectedNodes.length; j++) {
            const n1 = projectedNodes[i];
            const n2 = projectedNodes[j];
            const avgZ = (n1.pz + n2.pz) / 2;
            
            if (!filterFn(avgZ)) continue;

            // distance in 3D
            const dx = n1.original.x - n2.original.x;
            const dy = n1.original.y - n2.original.y;
            const dz = n1.original.z - n2.original.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < CONNECTION_DISTANCE) {
              const alpha = 1 - Math.pow(dist / CONNECTION_DISTANCE, 2);
              ctx.beginPath();
              ctx.moveTo(n1.px, n1.py);
              ctx.lineTo(n2.px, n2.py);
              let strokeAlpha = isFront ? alpha * 1.0 : alpha * 0.5; // Brighter in front, darker in back
              let color = `rgba(34, 211, 238, ${strokeAlpha})`;
              if (n1.original.color === '#9DFF00' || n2.original.color === '#9DFF00') {
                 color = `rgba(157, 255, 0, ${strokeAlpha})`;
              }
              ctx.strokeStyle = color;
              
              if (isFront) {
                 ctx.lineWidth = alpha * 3.0;
                 ctx.shadowColor = color;
                 ctx.shadowBlur = 10;
              } else {
                 ctx.lineWidth = alpha * 2.0;
                 ctx.shadowBlur = 0;
              }
              ctx.stroke();
              ctx.shadowBlur = 0; // Reset for next items
            }
          }
        }
      };

      // Helper function to draw single node
      const drawNode = (n) => {
        const orig = n.original;
        
        if (!orig.isPulsing && Math.random() > 0.995) {
            orig.isPulsing = true;
            orig.pulseRadius = 0;
        }

        ctx.beginPath();
        ctx.arc(n.px, n.py, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = orig.color;
        
        if (n.pz < -100) {
           ctx.globalAlpha = 0.3;
        } else {
           ctx.globalAlpha = 1;
        }
        ctx.fill();

        if (orig.isPulsing) {
            orig.pulseRadius += 0.8;
            const maxRadius = Math.max(n.radius * 8, 20);
            
            if (orig.pulseRadius > maxRadius) {
                orig.isPulsing = false;
                orig.pulseRadius = 0;
            } else {
                const alpha = Math.max(0, 1 - (orig.pulseRadius / maxRadius));
                ctx.beginPath();
                ctx.arc(n.px, n.py, orig.pulseRadius, 0, Math.PI * 2);
                ctx.strokeStyle = orig.color;
                ctx.globalAlpha = (n.pz < -100 ? 0.3 : 1) * alpha;
                ctx.lineWidth = 1.0;
                ctx.stroke();
            }
        }
        
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      };

      // 1. Draw BACK connections and nodes
      drawConnections((avgZ) => avgZ < 0, false);
      projectedNodes.filter(n => n.pz < 0).forEach(drawNode);

      // 2. Draw 3D Centered Logo!
      if (logoImg) {
          const drawH = 192; 
          const drawW = logoImg.width * (drawH / logoImg.height);
          
          ctx.save();
          // Restore logo to full opacity so back nodes are hidden
          ctx.globalAlpha = 1.0;
          
          // Drop shadow effect directly on canvas image
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;
          
          ctx.drawImage(logoImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
          
          // Additional neon glow behind the logo
          ctx.shadowColor = 'rgba(34,211,238,0.3)';
          ctx.shadowBlur = 40;
          ctx.shadowOffsetY = 0;
          ctx.drawImage(logoImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
          ctx.restore();
      }

      // 3. Draw FRONT connections and nodes
      drawConnections((avgZ) => avgZ >= 0, true);
      projectedNodes.filter(n => n.pz >= 0).forEach(drawNode);

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [logoImg]); // Re-bind animate loop if logoImg finishes loading

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0, opacity: 1, pointerEvents: 'auto' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', filter: 'blur(0.5px)' }}/>
    </div>
  );
};

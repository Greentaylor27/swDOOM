import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    Module?: any;
    FS?: {
      writeFile: (path: string, data: Uint8Array, opts?: any) => void;
      readdir: (path: string) => string[];
    };
  }
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    const preventFullscreen = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.requestFullscreen = () => {
          console.warn('Preventing canvas from going Full Screen on load');
        };
      }
    };

    preventFullscreen();

    const canvas = canvasRef.current;
    const resizeCanvas = () => {
      if (!canvas) return;
    
      const parent = canvas.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      const aspectRatio = 4 / 3; 

      let width = parentWidth;
      let height = parentWidth / aspectRatio;

      if (height > parentHeight) {
        height = parentHeight;
        width = height * aspectRatio;
      }

      // Scalling visuals to fit the parent container
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    window.Module = {
      canvas: canvasRef.current,
      arguments: ['-iwad', '/DOOM1.WAD'],
      onRuntimeInitialized: () => {
        console.log('[WASM] Runtime initialized');
        setRuntimeReady(true); // mark runtime as ready to start
      }
    };

    const existingScript = document.querySelector('script[data-wasm="chocolate-doom"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '/Doom_wasm/build/src/chocolate-doom.js';
      script.async = true;
      script.setAttribute('data-wasm', 'chocolate-doom');
      document.body.appendChild(script);
    }

    // Clean up 
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    }
  }, []);

  return (
    <div className="screen">
      <canvas
        id='canvas'
        ref={canvasRef}
        className='block'
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

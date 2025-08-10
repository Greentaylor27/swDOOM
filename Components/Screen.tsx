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
  const screenDivRef = useRef<HTMLDivElement | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = screenDivRef.current;
    if (canvas && container) {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

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

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    }

  }, []);

  return (
    <div className="screen" ref={screenDivRef}>
      <canvas
        id='canvas'
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

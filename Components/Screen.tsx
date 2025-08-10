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

    const width = screenDivRef.current?.clientWidth || 800;
    const height = screenDivRef.current?.clientHeight || 600;

    window.Module = {
      canvas: canvasRef.current,
      arguments: [
        '-iwad', '/DOOM1.WAD',
        '-width', String(width),
        '-height', String(height)
      ],
      onRuntimeInitialized: () => {
        console.log('[WASM] Runtime initialized');
        console.log(`Width: ${width}, Height: ${height}`)
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

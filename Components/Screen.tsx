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

  useEffect(() => {
    let originalFullscreenRequest: HTMLCanvasElement['requestFullscreen'] | null = null;


    // Used to prevent fullscreen on load
    const preventFullscreenOnLoad = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        originalFullscreenRequest = canvas.requestFullscreen.bind(canvas);

        canvas.requestFullscreen = () => {
          console.warn('Preventing canvas full screen on load');
          return Promise.resolve();
        };
      }
    };

    preventFullscreenOnLoad(); 
    // This is used to set the arguement '-width' and '-height' for the WAD file.
    const width = screenDivRef.current?.clientWidth || 800;
    const height = screenDivRef.current?.clientHeight || 600;

    window.Module = {
      canvas: canvasRef.current,
      // The way this is initializing you can actually set the width and height arguements
      arguments: [
        '-iwad', '/DOOM1.WAD',
        '-width', String(width),
        '-height', String(height)
      ],
      onRuntimeInitialized: () => {
        console.log('[WASM] Runtime initialized');
        
        // Used to return the request back to the user after inital load
        if (canvasRef.current && originalFullscreenRequest) {
          canvasRef.current.requestFullscreen = originalFullscreenRequest;
        }

        setRuntimeReady(true); // mark runtime as ready to start
      }
    };
    
    const existingScript = document.querySelector('script[data-wasm="chocolate-doom"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '/Doom_wasm/chocolate-doom.js';
      script.async = true;
      script.setAttribute('data-wasm', 'chocolate-doom');
      document.body.appendChild(script);
    }
  }, []);

  if (runtimeReady) {
    console.log('Game start!!');
  };

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

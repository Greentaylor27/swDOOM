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

  }, []);

  return (
    <div>
      <canvas
        id='canvas'
        ref={canvasRef}
        width={640}
        height={480}
        style={{ display: 'block', width: '100%' }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

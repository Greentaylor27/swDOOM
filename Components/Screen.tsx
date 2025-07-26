// src/components/GameCanvas.tsx
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Module?: any;
  }
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Only set up Module and script if not already present
    if (!window.Module) {
      window.Module = {
        canvas: canvasRef.current,
        arguments: ['-iwad', '/DOOM1.WAD'], // update path as needed
        onRuntimeInitialized: () => {
          console.log('WASM Module initialized');
        }
      };
    } else {
      // If Module exists, just update the canvas reference
      window.Module.canvas = canvasRef.current;
    }

    // Check if the script is already present
    let script = document.querySelector('script[data-wasm="chocolate-doom"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = '/Doom_wasm/build/src/chocolate-doom.js'; // update path as needed
      script.async = true;
      script.setAttribute('data-wasm', 'chocolate-doom');
      document.body.appendChild(script);
    }

    // Do not remove the script or Module on unmount to avoid double-initialization

    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}
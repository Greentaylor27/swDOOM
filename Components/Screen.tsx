// src/components/GameCanvas.tsx
import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    window.Module = {
      canvas: canvasRef.current,
      arguments: ['-iwad', '/doom1.wad'], // lowercased for compatibility
      onRuntimeInitialized: async () => {
        console.log('[WASM] Runtime initialized');

        try {
          const res = await fetch('/doom1.wad'); // also lowercase
          const buffer = await res.arrayBuffer();
          const wadData = new Uint8Array(buffer);

          if (window.FS) {
            window.FS.writeFile('/doom1.wad', wadData); // lowercase here too
            console.log('[WAD LOADER] WAD loaded into FS at /doom1.wad');

            // Confirm FS contents
            const files = window.FS.readdir('/');
            console.log('[FS] Root dir:', files);
          } else {
            console.error('[WAD LOADER] FS is not available');
            return;
          }

          // ✅ Now that FS and WAD are ready, call main
          if (typeof window.Module.callMain === 'function') {
            console.log('[GAME] Starting Chocolate Doom...');
            window.Module.callMain();
          } else {
            console.error('[GAME] callMain is not available');
          }
        } catch (err) {
          console.error('[WAD LOADER] Failed to load WAD file:', err);
        }
      }
    };

    // Dynamically inject the WASM glue code
    const existingScript = document.querySelector('script[data-wasm="chocolate-doom"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = '/Doom_wasm/build/src/chocolate-doom.js';
      script.async = true;
      script.setAttribute('data-wasm', 'chocolate-doom');
      document.body.appendChild(script);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <canvas id='canvas'
        ref={canvasRef}
        width={640}
        height={480}
        style={{ width: '100%', height: '100%' }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

export function resizeCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();

  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.width * window.devicePixelRatio;

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

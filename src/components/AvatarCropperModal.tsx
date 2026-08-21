import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface Props {
  file: File;
  open: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 320;

export default function AvatarCropperModal({ file, open, onCancel, onConfirm }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  function minZoomFor(width: number, height: number) {
    if (!width || !height) return 1;
    return VIEWPORT_SIZE / Math.min(width, height);
  }

  const baseZoom = minZoomFor(imageSize.width, imageSize.height);
  const effectiveZoom = baseZoom * zoom;
  const displayWidth = imageSize.width * effectiveZoom;
  const displayHeight = imageSize.height * effectiveZoom;

  function clampOffset(x: number, y: number, width: number, height: number) {
    const maxX = Math.max(0, (width - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (height - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.originX + dx, dragState.current.originY + dy, displayWidth, displayHeight));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleZoomChange(value: number) {
    setZoom(value);
    const newDisplayWidth = imageSize.width * baseZoom * value;
    const newDisplayHeight = imageSize.height * baseZoom * value;
    setOffset((prev) => clampOffset(prev.x, prev.y, newDisplayWidth, newDisplayHeight));
  }

  function handleConfirm() {
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const scale = OUTPUT_SIZE / VIEWPORT_SIZE;
      const drawWidth = displayWidth * scale;
      const drawHeight = displayHeight * scale;
      const drawX = OUTPUT_SIZE / 2 + offset.x * scale - drawWidth / 2;
      const drawY = OUTPUT_SIZE / 2 + offset.y * scale - drawHeight / 2;

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      canvas.toBlob(
        (blob) => {
          if (blob) onConfirm(blob);
        },
        'image/webp',
        0.92
      );
    };
    img.src = imageUrl;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar foto de perfil</DialogTitle>
          <DialogDescription>Arraste para posicionar e use o controle para dar zoom.</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto overflow-hidden rounded-full bg-muted ring-1 ring-border"
          style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {imageUrl && imageSize.width > 0 && (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute top-1/2 left-1/2 max-w-none select-none"
              style={{
                width: displayWidth,
                height: displayHeight,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Usar esta foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

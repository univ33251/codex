import { useState } from 'react';

interface ColorPaletteProps {
  colors: string[];
  selectedColor: string;
  onColorChange: (color: string) => void;
  onPaletteChange: (palette: string[]) => void;
}

const ColorPalette = ({ colors, selectedColor, onColorChange, onPaletteChange }: ColorPaletteProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftColor, setDraftColor] = useState(selectedColor);

  return (
    <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
      {colors.map((color) => (
        <button
          key={color}
          className={color === selectedColor ? 'active' : ''}
          onClick={() => onColorChange(color)}
          onPointerDown={(e) => {
            if ((e as PointerEvent).pointerType === 'pen') {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setDraftColor(color);
            setIsEditing(true);
          }}
          onPointerUp={(e) => {
            if ((e as PointerEvent).pointerType === 'pen') {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        >
          <span style={{ background: color }} />
        </button>
      ))}
      {isEditing && (
        <div style={{ position: 'absolute', background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 12px 24px rgba(0,0,0,0.2)' }}>
          <input
            type="color"
            value={draftColor}
            onChange={(e) => setDraftColor(e.target.value)}
          />
          <button
            className="control-button"
            onClick={() => {
              const newPalette = colors.map((color) => (color === selectedColor ? draftColor : color));
              onPaletteChange(newPalette);
              onColorChange(draftColor);
              setIsEditing(false);
            }}
          >
            更新
          </button>
          <button className="control-button" onClick={() => setIsEditing(false)}>
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
};

export default ColorPalette;

import { AnnotationLayer } from '../types/annotations';

interface LayerPanelProps {
  layers: AnnotationLayer[];
  selectedLayerId: string | null;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onDelete: (layerId: string) => void;
}

const LayerPanel = ({
  layers,
  selectedLayerId,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDelete,
}: LayerPanelProps) => {
  return (
    <div className="layer-panel">
      <h3>レイヤー</h3>
      {layers.map((layer) => (
        <div key={layer.id} className="layer-item">
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <input
              type="text"
              value={layer.name}
              onChange={(e) => onRename(layer.id, e.target.value)}
              style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, padding: '4px 8px' }}
            />
            <small>図形: {layer.shapes.length}</small>
          </div>
          <button className="control-button" onClick={() => onToggleVisibility(layer.id)}>
            {layer.visible ? '表示' : '非表示'}
          </button>
          <button className="control-button" onClick={() => onToggleLock(layer.id)}>
            {layer.locked ? 'ロック' : '解除'}
          </button>
          <button
            className="control-button"
            onClick={() => onDelete(layer.id)}
            disabled={layers.length <= 1}
            style={{ background: layer.id === selectedLayerId ? '#ffd1d1' : undefined }}
          >
            削除
          </button>
        </div>
      ))}
    </div>
  );
};

export default LayerPanel;

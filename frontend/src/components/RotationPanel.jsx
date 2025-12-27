import React from 'react';

const RotationPanel = ({ rotationEnabled, onToggle }) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Rotation</h3>
          <p className="text-sm text-zinc-400">Enable fair singer rotation</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={!!rotationEnabled}
            onChange={(e) => onToggle?.(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
          />
          Enabled
        </label>
      </div>
    </div>
  );
};

export default RotationPanel;

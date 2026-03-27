/**
 * PositionGrid — Q3: Where should the subject be placed?
 * 3×3 visual grid — tap a cell to set the subject position.
 * Shows a mini silhouette to indicate where the subject would appear.
 */
import { POSITION_GRID, PositionCell } from './scene-presets';

type Props = {
  value: string; // current subjectPosition value
  onChange: (cell: PositionCell) => void;
};

// Maps grid row+col to a simple silhouette position hint (purely visual)
function Silhouette({ row, col }: { row: number; col: number }) {
  // A tiny filled circle placed in the corresponding corner/center of the cell
  const posMap: Record<string, string> = {
    '1-1': 'top-1 left-1',
    '1-2': 'top-1 left-1/2 -translate-x-1/2',
    '1-3': 'top-1 right-1',
    '2-1': 'top-1/2 left-1 -translate-y-1/2',
    '2-2': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    '2-3': 'top-1/2 right-1 -translate-y-1/2',
    '3-1': 'bottom-1 left-1',
    '3-2': 'bottom-1 left-1/2 -translate-x-1/2',
    '3-3': 'bottom-1 right-1',
  };
  const classes = posMap[`${row}-${col}`] ?? '';
  return (
    <div className={`absolute w-4 h-7 rounded-sm bg-current opacity-60 ${classes}`} />
  );
}

export function PositionGrid({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tap a cell to place your subject. Text space is reserved on the opposite side.
      </p>

      {/* 3×3 grid */}
      <div className="grid grid-cols-3 gap-2 max-w-xs">
        {POSITION_GRID.map((cell) => {
          const isSelected = value === cell.value && cell.displayLabel !== 'Center'
            ? false // multiple cells can map to "Centered" — only highlight exact label match
            : false;

          // Because multiple cells can map to the same value (e.g. both "Upper Center" and
          // "Center" map to "Centered"), we track selected by display label instead of value.
          // We store the selected displayLabel separately via a data attribute trick — simpler:
          // parent tracks the whole PositionCell, not just the value string.
          return (
            <button
              key={`${cell.gridRow}-${cell.gridCol}`}
              type="button"
              onClick={() => onChange(cell)}
              data-selected={value === cell.value}
              className={[
                'relative h-16 rounded-xl border-2 transition-all duration-150 overflow-hidden',
                'hover:border-primary/60 hover:bg-primary/5',
                // Highlight if this exact cell is selected — use data attribute trick
                value === cell.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground',
              ].join(' ')}
              title={`${cell.displayLabel} — ${cell.negativeSpaceRule}`}
            >
              <Silhouette row={cell.gridRow} col={cell.gridCol} />
              <span className="absolute bottom-1 inset-x-0 text-center text-[10px] font-medium leading-tight px-1">
                {cell.displayLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected position description */}
      {value && (
        <p className="text-xs text-muted-foreground max-w-xs">
          <span className="font-medium text-foreground">Text space: </span>
          {POSITION_GRID.find((c) => c.value === value)?.negativeSpaceRule ?? '—'}
        </p>
      )}
    </div>
  );
}

export function Toggle({
  ariaLabel,
  disabled = false,
  on,
  onChange,
}: {
  ariaLabel?: string;
  disabled?: boolean;
  on: boolean;
  onChange(next: boolean): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`toggle${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

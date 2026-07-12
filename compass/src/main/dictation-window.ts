export interface DictationWindowTarget {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  webContents: {
    focus(): void;
  };
}

export function focusWindowForDictation(window: DictationWindowTarget): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.webContents.focus();
}

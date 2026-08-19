/**
 * TextPanel (M0.3): one independent, scrollable TextVersion panel.
 *
 * - header shows language tag, label and a hide/close control (accessible
 *   name);
 * - body renders the EXACT canonical server content as plain React text with
 *   ``white-space: pre-wrap`` so whitespace/newlines are preserved;
 * - NO ``dangerouslySetInnerHTML`` (XSS-like input renders as text);
 * - NO selection listeners, run wrappers, annotation indicators or
 *   connectors — those belong to M0.4/M0.5/M0.6.
 */

import type { TextVersion } from './api';

export interface TextPanelProps {
  version: TextVersion;
  onHide: () => void;
}

export function TextPanel({ version, onHide }: TextPanelProps) {
  return (
    <section
      className="text-panel"
      data-text-version-id={version.id}
      aria-label={`Text version ${version.label} (${version.language_tag})`}
    >
      <header className="text-panel-header">
        <span className="language-tag">{version.language_tag}</span>
        <h3 className="panel-label" title={version.label}>
          {version.label}
        </h3>
        <button
          type="button"
          className="panel-close"
          aria-label={`Hide ${version.label} panel`}
          onClick={onHide}
        >
          ✕
        </button>
      </header>
      <div className="text-panel-body" style={{ whiteSpace: 'pre-wrap' }}>
        {version.content}
      </div>
    </section>
  );
}

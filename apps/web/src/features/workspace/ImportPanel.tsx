/**
 * Import UI (M0.3): create a TextVersion by pasting plain text or uploading a
 * strict UTF-8 ``.txt`` file.
 *
 * After creation/import the panel opens and renders the CANONICAL server
 * content returned by the API — never assumes the client input was already
 * canonical (report section 6 / ADR-002).
 */

import { useState, type FormEvent } from 'react';
import {
  useCreateTextVersion,
  useImportTextVersionFile,
} from './api';
import { useWorkspaceState } from './state/workspaceContext';
import { ErrorMessage } from '../../shared/ui/feedback';

export function ImportPanel({ documentId }: { documentId: string }) {
  const createMutation = useCreateTextVersion(documentId);
  const importMutation = useImportTextVersionFile(documentId);
  const { openPanel } = useWorkspaceState();

  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [languageTag, setLanguageTag] = useState('en');
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const isPending = createMutation.isPending || importMutation.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!languageTag.trim() || !label.trim()) {
      return;
    }
    if (mode === 'upload') {
      if (!file) {
        return;
      }
      importMutation.mutate(
        { file, language_tag: languageTag.trim(), label: label.trim() },
        {
          onSuccess: (version) => {
            // Display the canonical content returned by the server.
            openPanel(version.id);
            resetForm();
          },
        },
      );
      return;
    }
    createMutation.mutate(
      {
        language_tag: languageTag.trim(),
        label: label.trim(),
        content,
      },
      {
        onSuccess: (version) => {
          openPanel(version.id);
          resetForm();
        },
      },
    );
  }

  function resetForm() {
    setLabel('');
    setContent('');
    setFile(null);
  }

  return (
    <section className="import-panel" aria-label="Add text version">
      <h3>Add text version</h3>
      <form onSubmit={handleSubmit} className="import-form">
        <div className="import-mode" role="group" aria-label="Import mode">
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === 'paste'}
              onChange={() => setMode('paste')}
            />
            Paste
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === 'upload'}
              onChange={() => setMode('upload')}
            />
            Upload .txt
          </label>
        </div>

        <label>
          Language tag (BCP-47)
          <input
            value={languageTag}
            onChange={(event) => setLanguageTag(event.target.value)}
            required
            aria-required="true"
          />
        </label>
        <label className="import-label-row">
          Label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
            aria-required="true"
          />
        </label>

        {mode === 'paste' ? (
          <label>
            Text
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
            />
          </label>
        ) : (
          <label>
            UTF-8 .txt file
            <input
              type="file"
              accept=".txt"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <button
          type="submit"
          disabled={isPending || (mode === 'upload' && !file)}
        >
          {isPending
            ? 'Adding…'
            : mode === 'upload'
              ? 'Import .txt'
              : 'Add version'}
        </button>

        {createMutation.isError ? (
          <ErrorMessage error={createMutation.error} />
        ) : null}
        {importMutation.isError ? (
          <ErrorMessage error={importMutation.error} />
        ) : null}
      </form>
    </section>
  );
}

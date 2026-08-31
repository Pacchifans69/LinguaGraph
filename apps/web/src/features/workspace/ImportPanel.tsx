/** Create a TextVersion by paste or strict UTF-8 .txt upload. */

import { useState, type FormEvent } from 'react';
import {
  useCreateTextVersion,
  useImportTextVersionFile,
} from './api';
import { useWorkspaceState } from './state/workspaceContext';
import { ErrorMessage } from '../../shared/ui/feedback';
import { Button } from '../../shared/ui/Button';

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
    <section className="import-panel workbench-surface" aria-label="Add text version">
      <header className="workbench-surface-header">
        <div>
          <p className="section-kicker">Workspace content</p>
          <h3>Add text version</h3>
        </div>
      </header>
      <p className="surface-description">
        Add canonical text by paste or upload. Language remains data via BCP-47.
      </p>
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

        <div className="form-actions">
          <Button
            type="submit"
            variant="primary"
            disabled={mode === 'upload' && !file}
            isPending={isPending}
          >
            {isPending
              ? 'Adding…'
              : mode === 'upload'
                ? 'Import .txt'
                : 'Add version'}
          </Button>
        </div>

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

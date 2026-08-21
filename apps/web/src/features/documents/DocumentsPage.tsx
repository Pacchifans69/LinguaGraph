/**
 * Documents page (M0.3): list / create / delete the ParallelDocuments of one
 * project and navigate into a document workspace.
 */

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCreateDocument, useDeleteDocument, useDocuments } from './api';
import { useProject } from '../projects/api';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';

export function DocumentsPage() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const projectQuery = useProject(projectId);
  const documentsQuery = useDocuments(projectId);
  const createDocument = useCreateDocument(projectId);
  const deleteDocument = useDeleteDocument(projectId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createDocument.mutate(
      { title: title.trim(), description: description.trim() || null },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
        },
      },
    );
  }

  return (
    <section aria-labelledby="documents-heading" className="documents-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/projects">Projects</Link>
        <span aria-hidden="true"> / </span>
        <span>{projectQuery.data?.name ?? '…'}</span>
      </nav>

      <h2 id="documents-heading">Documents</h2>

      <form onSubmit={handleCreate} className="create-form" aria-label="Create document">
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            aria-required="true"
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
          />
        </label>
        <button type="submit" disabled={createDocument.isPending}>
          {createDocument.isPending ? 'Creating…' : 'Create document'}
        </button>
        {createDocument.isError ? <ErrorMessage error={createDocument.error} /> : null}
      </form>

      {/* M0.7 W3 hardening: a failed document delete must never fail silently
          — the stable API error is surfaced with the same envelope as every
          other mutation failure. */}
      {deleteDocument.isError ? <ErrorMessage error={deleteDocument.error} /> : null}

      {documentsQuery.isPending ? (
        <LoadingMessage>Loading documents…</LoadingMessage>
      ) : documentsQuery.isError ? (
        <ErrorMessage error={documentsQuery.error} />
      ) : documentsQuery.data.length === 0 ? (
        <EmptyState>No documents in this project yet.</EmptyState>
      ) : (
        <ul className="document-list">
          {documentsQuery.data.map((document) => (
            <li key={document.id} className="document-row">
              <Link
                to={`/documents/${document.id}/workspace`}
                className="document-link"
              >
                <span className="document-title">{document.title}</span>
                {document.description ? (
                  <span className="document-description">{document.description}</span>
                ) : null}
              </Link>
              <button
                type="button"
                aria-label={`Delete document ${document.title}`}
                onClick={() => deleteDocument.mutate(document.id)}
                disabled={deleteDocument.isPending}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

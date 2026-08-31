/** Documents page: create, list, delete and enter document workspaces. */

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCreateDocument, useDeleteDocument, useDocuments } from './api';
import { useProject } from '../projects/api';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';
import { Button } from '../../shared/ui/Button';
import { PageHeader } from '../../shared/ui/PageHeader';

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

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/projects">Projects</Link>
      <span aria-hidden="true">/</span>
      <span>{projectQuery.data?.name ?? '…'}</span>
    </nav>
  );

  return (
    <section aria-labelledby="documents-heading" className="documents-page page-stack">
      <PageHeader
        eyebrow="Project"
        title="Documents"
        titleId="documents-heading"
        description="Create parallel documents, then open a document to align its text versions."
        breadcrumb={breadcrumb}
      />

      <div className="page-content-grid">
        <form
          onSubmit={handleCreate}
          className="create-form surface-card"
          aria-label="Create document"
        >
          <div className="surface-card-header">
            <p className="section-kicker">New document</p>
            <h3>Start a parallel document</h3>
            <p>Use a descriptive title so the workbench context stays clear.</p>
          </div>
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
          <div className="form-actions">
            <Button
              type="submit"
              variant="primary"
              isPending={createDocument.isPending}
            >
              {createDocument.isPending ? 'Creating…' : 'Create document'}
            </Button>
          </div>
          {createDocument.isError ? <ErrorMessage error={createDocument.error} /> : null}
        </form>

        <div className="collection-section">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Document index</p>
              <h3>Parallel documents</h3>
            </div>
            {documentsQuery.data ? (
              <span
                className="count-badge"
                aria-label={`${documentsQuery.data.length} documents`}
              >
                {documentsQuery.data.length}
              </span>
            ) : null}
          </div>

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
                <li key={document.id} className="document-row collection-row">
                  <Link
                    to={`/documents/${document.id}/workspace`}
                    className="document-link collection-link"
                  >
                    <span className="document-title collection-title">{document.title}</span>
                    <span className="collection-meta">
                      {document.description || 'No description'}
                    </span>
                  </Link>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    aria-label={`Delete document ${document.title}`}
                    onClick={() => deleteDocument.mutate(document.id)}
                    disabled={deleteDocument.isPending}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

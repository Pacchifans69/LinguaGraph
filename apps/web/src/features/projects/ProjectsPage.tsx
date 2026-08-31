/** Projects page: create, list, delete and enter project work. */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateProject, useDeleteProject, useProjects } from './api';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';
import { Button } from '../../shared/ui/Button';
import { PageHeader } from '../../shared/ui/PageHeader';

export function ProjectsPage() {
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createProject.mutate(
      { name: name.trim(), description: description.trim() || null },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
        },
      },
    );
  }

  return (
    <section aria-labelledby="projects-heading" className="projects-page page-stack">
      <PageHeader
        eyebrow="Library"
        title="Projects"
        titleId="projects-heading"
        description="Organize parallel documents into focused alignment workspaces."
      />

      <div className="page-content-grid">
        <form
          onSubmit={handleCreate}
          className="create-form surface-card"
          aria-label="Create project"
        >
          <div className="surface-card-header">
            <p className="section-kicker">New project</p>
            <h3>Create a workspace collection</h3>
            <p>Give the project a stable name; the description is optional.</p>
          </div>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              isPending={createProject.isPending}
            >
              {createProject.isPending ? 'Creating…' : 'Create project'}
            </Button>
          </div>
          {createProject.isError ? <ErrorMessage error={createProject.error} /> : null}
        </form>

        <div className="collection-section">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Project index</p>
              <h3>Your projects</h3>
            </div>
            {projectsQuery.data ? (
              <span className="count-badge" aria-label={`${projectsQuery.data.length} projects`}>
                {projectsQuery.data.length}
              </span>
            ) : null}
          </div>

          {deleteProject.isError ? <ErrorMessage error={deleteProject.error} /> : null}

          {projectsQuery.isPending ? (
            <LoadingMessage>Loading projects…</LoadingMessage>
          ) : projectsQuery.isError ? (
            <ErrorMessage error={projectsQuery.error} />
          ) : projectsQuery.data.length === 0 ? (
            <EmptyState>No projects yet — create one to begin.</EmptyState>
          ) : (
            <ul className="project-list">
              {projectsQuery.data.map((project) => (
                <li key={project.id} className="project-row collection-row">
                  <Link
                    to={`/projects/${project.id}/documents`}
                    className="project-link collection-link"
                  >
                    <span className="project-name collection-title">{project.name}</span>
                    <span className="collection-meta">
                      {project.description || 'No description'}
                    </span>
                  </Link>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    aria-label={`Delete project ${project.name}`}
                    onClick={() => deleteProject.mutate(project.id)}
                    disabled={deleteProject.isPending}
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

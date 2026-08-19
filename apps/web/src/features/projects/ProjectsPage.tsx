/**
 * Projects page (M0.3): create / list / delete projects and navigate into a
 * project's documents. Server state via TanStack Query; mutations invalidate
 * ['projects'] on success.
 */

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateProject, useDeleteProject, useProjects } from './api';
import { EmptyState, ErrorMessage, LoadingMessage } from '../../shared/ui/feedback';

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
    <section aria-labelledby="projects-heading" className="projects-page">
      <h2 id="projects-heading">Projects</h2>

      <form onSubmit={handleCreate} className="create-form" aria-label="Create project">
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
        <button type="submit" disabled={createProject.isPending}>
          {createProject.isPending ? 'Creating…' : 'Create project'}
        </button>
        {createProject.isError ? <ErrorMessage error={createProject.error} /> : null}
      </form>

      {projectsQuery.isPending ? (
        <LoadingMessage>Loading projects…</LoadingMessage>
      ) : projectsQuery.isError ? (
        <ErrorMessage error={projectsQuery.error} />
      ) : projectsQuery.data.length === 0 ? (
        <EmptyState>No projects yet — create one to begin.</EmptyState>
      ) : (
        <ul className="project-list">
          {projectsQuery.data.map((project) => (
            <li key={project.id} className="project-row">
              <Link
                to={`/projects/${project.id}/documents`}
                className="project-link"
              >
                <span className="project-name">{project.name}</span>
                {project.description ? (
                  <span className="project-description">{project.description}</span>
                ) : null}
              </Link>
              <button
                type="button"
                aria-label={`Delete project ${project.name}`}
                onClick={() => deleteProject.mutate(project.id)}
                disabled={deleteProject.isPending}
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

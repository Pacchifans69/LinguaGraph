/**
 * M0.3 route tree (report section 10):
 *
 *   /                                -> redirect to /projects
 *   /projects                        -> project list/create
 *   /projects/:projectId/documents   -> document list/create
 *   /documents/:documentId/workspace -> TextPanels
 */

import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from './layout';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { WorkspacePage } from '../features/workspace/WorkspacePage';

/** The M0 route tree, exported separately so tests can build a memory router. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId/documents', element: <DocumentsPage /> },
      { path: 'documents/:documentId/workspace', element: <WorkspacePage /> },
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

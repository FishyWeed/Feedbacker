import { lazy } from 'solid-js';
import { render } from 'solid-js/web';
import './design/tokens.css';
import './design/bundle.css';
import './app.css';

// Two separate bundles: the public form never downloads the editor or drag-and-drop code.
const PublicForm = lazy(() => import('./form/PublicForm'));
const AdminApp = lazy(() => import('./admin/App'));
const Landing = lazy(() => import('./landing/Landing'));

const path = location.pathname;
const formId = path.match(/^\/f\/([\w-]+)/)?.[1];
render(() => (formId ? <PublicForm id={formId} /> : path.startsWith('/admin') ? <AdminApp /> : <Landing />), document.getElementById('app')!);

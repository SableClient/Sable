import { createRoot } from 'react-dom/client';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';
import './index.css';
import './app/styles/themes.css';

document.body.classList.add(configClass, varsClass);

const rootContainer = document.getElementById('root');
if (rootContainer === null) throw new Error('Root container element not found!');
const root = createRoot(rootContainer);

if (window.location.pathname.startsWith('/lp/')) {
  import('./app/pages/LandingRouter').then(({ LandingRouter }) => root.render(<LandingRouter />));
} else {
  import('./main').then(({ mountApp }) => mountApp(root));
}

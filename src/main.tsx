import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

window.addEventListener('error', (event) => {
  console.error(
    '[bootstrap] window error:',
    event.message,
    event.filename,
    event.lineno,
    event.colno,
  );
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[bootstrap] unhandled rejection:', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

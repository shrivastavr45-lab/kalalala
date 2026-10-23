import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { PrivacyPage, TermsPage } from './LegalPage.jsx';
import './styles.css';
import './theme.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const RootPage = pathname === '/privacy' ? PrivacyPage : pathname === '/terms' ? TermsPage : App;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);

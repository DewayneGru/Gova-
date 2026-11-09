import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AudioVoiceProvider } from './context/AudioContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AudioVoiceProvider>
        <App />
      </AudioVoiceProvider>
    </AuthProvider>
  </StrictMode>,
);


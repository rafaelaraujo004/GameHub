
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ToastContainer } from './components/Toast';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const LoginPageEmail = lazy(() => import('./pages/LoginPageEmail'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'));

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AuthGate() {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={user ? <LibraryPage /> : <Navigate to="/login" replace />} />
      <Route path="/downloads" element={user ? <DownloadsPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/login-email" element={<LoginPageEmail />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Rotas protegidas e padrão */}
          <Route path="/*" element={<AuthGate />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  );
}

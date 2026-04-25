import { memo, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logout } from '../services/auth';
import { useAuthStore, useToastStore, useDownloadsStore } from '../store';

export const Header = memo(function Header() {
  const user = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);
  const activeCount = useDownloadsStore((s) => s.active.length);
  const location = useLocation();

  // useCallback: referência estável → botão "Sair" não dispara re-render dos filhos
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {
      addToast('Erro ao sair. Tente novamente.', 'error');
    }
  }, [addToast]);

  return (
    <header className="glass sticky top-0 z-30 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            <span className="font-black text-white text-xl tracking-tight">
              Game<span className="text-[#00ff88]">Hub</span>
            </span>
          </Link>
          {user && (
            <Link
              to="/downloads"
              className={`ml-4 relative text-xs px-3 py-1.5 rounded-lg border transition-colors
                ${location.pathname === '/downloads'
                  ? 'text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10'
                  : 'text-gray-400 border-transparent hover:text-[#00ff88] hover:border-[#00ff88]/20 hover:bg-[#00ff88]/5'
                }`}
            >
              ↓ Downloads
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#00ff88] text-black text-[9px] font-bold flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </Link>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <img
              src={user.photoURL ?? ''}
              alt={user.displayName ?? 'User'}
              className="w-8 h-8 rounded-full border-2 border-white/10"
            />
            <span className="hidden sm:block text-sm text-gray-400 max-w-35 truncate">
              {user.displayName}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5
                rounded-lg hover:bg-red-400/10 border border-transparent hover:border-red-400/20"
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
});

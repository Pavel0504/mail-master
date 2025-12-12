import { useState } from 'react';
import { Mail, Users, CheckCircle, Send, Settings, LogOut, Sun, Moon, ChevronLeft, ChevronRight, Home } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export function Sidebar({ currentPage, onPageChange, theme, onThemeToggle }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();

  const menuItems = [
    { id: 'emails', label: 'Почты', icon: Mail },
    { id: 'contacts', label: 'Контакты', icon: Users },
    { id: 'check', label: 'Проверка почты', icon: CheckCircle },
    { id: 'mailings', label: 'Рассылки', icon: Send },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  const adminItems = [
    { id: 'all-contacts', label: 'Все контакты', icon: Users },
    { id: 'all-mailings', label: 'Все рассылки', icon: Send },
    { id: 'users', label: 'Пользователи', icon: Users },
  ];

  return (
    <div className={`${collapsed ? 'w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300`}>
      <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        {!collapsed && <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Меню</h2>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => onPageChange('dashboard')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-2 ${
            currentPage === 'dashboard'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title={collapsed ? 'Главная' : ''}
        >
          <Home className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Главная</span>}
        </button>
        <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={collapsed ? item.label : ''}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}

        {user?.role === 'admin' && (
          <>
            <div className="my-3 border-t border-gray-200 dark:border-gray-700" />
            {!collapsed && <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Администрирование</div>}
            {adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onPageChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={collapsed ? item.label : ''}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </button>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-3 space-y-1 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onThemeToggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={collapsed ? 'Сменить тему' : ''}
        >
          {theme === 'light' ? <Moon className="w-5 h-5 flex-shrink-0" /> : <Sun className="w-5 h-5 flex-shrink-0" />}
          {!collapsed && <span className="text-sm font-medium">Сменить тему</span>}
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title={collapsed ? 'Выйти' : ''}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Выйти</span>}
        </button>
      </div>
    </div>
  );
}

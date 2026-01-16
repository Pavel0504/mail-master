import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { EmailsPage } from './components/EmailsPage';
import { ContactsWrapper } from './components/ContactsWrapper';
import { EmailCheckPage } from './components/EmailCheckPage';
import { SettingsPage } from './components/SettingsPage';
import { MailingsPage } from './components/MailingsPage';
import { AdminDashboard } from './components/AdminDashboard';
import { AllContactsPage } from './components/AllContactsPage';
import { AllMailingsPage } from './components/AllMailingsPage';
import { UsersPage } from './components/UsersPage';
import { StatsPage } from './components/StatsPage';

function MainApp() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

const renderPage = () => {
  switch (currentPage) {
    case 'dashboard':
      return user?.role === 'admin' ? <AdminDashboard /> : <Dashboard />;
    case 'emails':
      return <EmailsPage />;
    case 'contacts':
      return <ContactsWrapper />;
    case 'check':
      return <EmailCheckPage />;
    case 'stats':  // НОВЫЙ CASE
      return <StatsPage />;
    case 'mailings':
      return <MailingsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'all-contacts':
      return <AllContactsPage />;
    case 'all-mailings':
      return <AllMailingsPage />;
    case 'users':
      return <UsersPage />;
    default:
      return user?.role === 'admin' ? <AdminDashboard /> : <Dashboard />;
  }
};


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        theme={theme}
        onThemeToggle={toggleTheme}
      />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">{renderPage()}</main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;

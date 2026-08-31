import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ForgotPassword from '@/pages/ForgotPassword';
import IndependentLogin from '@/pages/IndependentLogin';
import IndependentRegister from '@/pages/IndependentRegister';
import IndependentAuthTest from '@/pages/IndependentAuthTest';
import NeonDataTest from '@/pages/NeonDataTest';
import Layout from '@/components/Layout';
import Taxes from '@/pages/Taxes';
import Reports from '@/pages/Reports';
import Assistant from '@/pages/Assistant';
import { Navigate } from 'react-router-dom';
import { ThemeProvider } from "next-themes";
import Account from '@/pages/Account';
import Calendar from '@/pages/Calendar';
import Gallery from '@/pages/Gallery';
import Mileage from '@/pages/Mileage';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import Support from '@/pages/Support';
import EtsyCallback from '@/pages/EtsyCallback';
import EbayCallback from '@/pages/EbayCallback';
import MobileSaleCapture from '@/pages/MobileSaleCapture';
// Add page imports here

const TabShell = () => null;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Legal pages must be publicly accessible for Google OAuth verification and app users.
  const publicPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (publicPath === '/privacy' || publicPath === '/privacy-policy' || publicPath === '/terms-of-service' || publicPath === '/terms' || publicPath === '/support') {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
        <Route path="/support" element={<Support />} />
        <Route path="*" element={<Navigate to="/privacy-policy" replace />} />
      </Routes>
    );
  }

  // Login and recovery pages must render even while authentication is broken or unresolved.
  if (publicPath === '/login' || publicPath === '/register' || publicPath === '/forgot-password' || publicPath === '/new-login' || publicPath === '/new-register' || publicPath === '/new-auth-test' || publicPath === '/new-data-test') {
    return (
      <Routes>
        <Route path="/login" element={<IndependentLogin />} />
        <Route path="/register" element={<IndependentRegister />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/new-login" element={<IndependentLogin />} />
        <Route path="/new-register" element={<IndependentRegister />} />
        <Route path="/new-auth-test" element={<IndependentAuthTest />} />
        <Route path="/new-data-test" element={<NeonDataTest />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <Navigate to="/login" replace />;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<IndependentLogin />} />
      <Route path="/register" element={<IndependentRegister />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/new-login" element={<IndependentLogin />} />
      <Route path="/new-register" element={<IndependentRegister />} />
      <Route path="/new-auth-test" element={<IndependentAuthTest />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
      <Route path="/support" element={<Support />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<TabShell />} />
          <Route path="/orders" element={<TabShell />} />
          <Route path="/inventory" element={<TabShell />} />
          <Route path="/expenses" element={<TabShell />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/account" element={<Account />} />
          <Route path="/send-sale" element={<MobileSaleCapture />} />
          <Route path="/etsy/callback" element={<EtsyCallback />} />
          <Route path="/ebay/callback" element={<EbayCallback />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/mileage" element={<Mileage />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAuthPage = path === '/login' || path === '/register' || path === '/forgot-password' || path === '/new-login' || path === '/new-register' || path === '/new-auth-test' || path === '/new-data-test';
  const isLegalPage = path === '/privacy' || path === '/privacy-policy' || path === '/terms-of-service' || path === '/terms' || path === '/support';

  // Render public/auth recovery pages without mounting AuthProvider at all.
  // This guarantees they still render even if the external Google/Base44 auth
  // configuration is broken or throws before auth state can initialize.
  if (isAuthPage || isLegalPage) {
    return (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <Routes>
              <Route path="/login" element={<IndependentLogin />} />
              <Route path="/register" element={<IndependentRegister />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/new-login" element={<IndependentLogin />} />
              <Route path="/new-register" element={<IndependentRegister />} />
              <Route path="/new-auth-test" element={<IndependentAuthTest />} />
        <Route path="/new-data-test" element={<NeonDataTest />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
              <Route path="/support" element={<Support />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
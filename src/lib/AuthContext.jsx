import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

const withTimeout = (promise, ms = 8000, label = 'Request') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  const syncInFlight = useRef(false);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    // Keep the app shell loadable even if Base44's external Google OAuth
    // configuration is temporarily invalid. The local login page can still
    // render and the SDK auth check can recover once the configuration is fixed.
    setIsLoadingPublicSettings(false);
    setAuthError(null);

    if (!appParams.token) {
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      return;
    }

    await checkUserAuth();
  };

  const ensureBusinessWorkspace = useCallback(async (currentUser) => {
    if (!currentUser?.email) return null;
    const email = String(currentUser.email).toLowerCase();
    const currentId = currentUser.active_business_id || currentUser.data?.active_business_id || null;

    try {
      const businesses = await base44.entities.Business.list('name', 100);
      let business = businesses.find((b) => b.id === currentId);
      if (!business) {
        business = businesses.find((b) =>
          (b.member_emails || []).some((member) => String(member).toLowerCase() === email)
        );
      }
      if (!business) {
        business = await base44.entities.Business.create({
          name: currentUser.business_name || currentUser.data?.business_name || 'My Business',
          primary_email: currentUser.email,
          member_emails: [currentUser.email],
          sales_emails: [currentUser.email],
        });
      } else {
        const members = Array.from(new Set([...(business.member_emails || []), currentUser.email]));
        if (members.length !== (business.member_emails || []).length) {
          try {
            await base44.entities.Business.update(business.id, {
              member_emails: members,
              primary_email: business.primary_email || currentUser.email,
            });
          } catch {
            // A shared member can still use the workspace even if they cannot edit membership.
          }
        }
      }

      if (business?.id && currentId !== business.id) {
        await base44.auth.updateMe({ active_business_id: business.id });
      }
      return business?.id || null;
    } catch (e) {
      console.error('Could not prepare business workspace:', e);
      return currentId;
    }
  }, []);

  const publishSyncState = useCallback((state) => {
    try {
      localStorage.setItem('artflow_last_sync', JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('artflow:sync-state', { detail: state }));
    } catch {}
  }, []);

  const triggerLoginSync = useCallback(async ({ includeExpenses = false } = {}) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    publishSyncState({ status: 'syncing', at: new Date().toISOString() });
    try {
      const [sales, expenses] = await Promise.allSettled([
        base44.functions.invoke('processSaleEmails'),
        includeExpenses
          ? base44.functions.invoke('processExpenseEmails')
          : Promise.resolve({ data: null }),
      ]);

      let salesData = sales.status === 'fulfilled' ? sales.value?.data || null : null;
      const expenseData = expenses.status === 'fulfilled' ? expenses.value?.data || null : null;

      // Do not drain historical backfill from the browser. The server already
      // runs the importer on a schedule, and repeatedly invoking it here can
      // exhaust connector / AI integration quotas and cause every sync to fail.
      // One foreground pass is enough to prioritize fresh orders; background
      // runs continue the historical catch-up safely.

      const state = {
        status: 'ok',
        at: new Date().toISOString(),
        sales: salesData,
        expenses: expenseData,
      };
      publishSyncState(state);
      window.dispatchEvent(new CustomEvent('artflow:data-synced', { detail: state }));
    } catch (e) {
      publishSyncState({ status: 'error', at: new Date().toISOString(), message: e?.message || 'Sync failed' });
    } finally {
      syncInFlight.current = false;
    }
  }, [publishSyncState]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Keep sales reasonably fresh without burning integration credits every minute.
    // Expense classification can invoke AI, so run that automatically only once per
    // hour while the app is open (plus the initial login sync and the manual button).
    const salesId = window.setInterval(() => triggerLoginSync(), 5 * 60 * 1000);
    const expenseId = window.setInterval(
      () => triggerLoginSync({ includeExpenses: true }),
      60 * 60 * 1000
    );
    const syncWhenActive = () => {
      if (document.visibilityState === 'visible') triggerLoginSync();
    };
    window.addEventListener('focus', syncWhenActive);
    window.addEventListener('online', syncWhenActive);
    document.addEventListener('visibilitychange', syncWhenActive);
    return () => {
      window.clearInterval(salesId);
      window.clearInterval(expenseId);
      window.removeEventListener('focus', syncWhenActive);
      window.removeEventListener('online', syncWhenActive);
      document.removeEventListener('visibilitychange', syncWhenActive);
    };
  }, [isAuthenticated, triggerLoginSync]);

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await withTimeout(base44.auth.me(), 8000, 'Authentication check');
      const businessId = await ensureBusinessWorkspace(currentUser);
      const hydratedUser = businessId
        ? { ...currentUser, active_business_id: businessId, data: { ...(currentUser.data || {}), active_business_id: businessId } }
        : currentUser;
      setUser(hydratedUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      // Sync immediately after login, including expenses. After that, sales refresh
      // every five minutes while the app is open and expenses refresh hourly.
      triggerLoginSync({ includeExpenses: true });
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);

    // Clear the cached Base44 token too. Otherwise a broken/custom Google OAuth
    // setup can reload the same authenticated Account page immediately.
    try {
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('token');
    } catch {}

    try {
      await base44.auth.logout(false);
    } catch (error) {
      console.error('Logout cleanup failed:', error);
    }

    if (shouldRedirect) {
      window.location.replace('/login?clear_access_token=true');
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
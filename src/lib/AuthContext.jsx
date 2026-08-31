import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { artflowAuthClient } from '@/lib/artflowAuthClient';

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
  const [authBackend, setAuthBackend] = useState(null);
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

  const triggerLoginSync = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    publishSyncState({ status: 'syncing', at: new Date().toISOString() });
    try {
      // Pull every connected email source first. Each source processes up to
      // 500 pending emails per pass and failures are isolated so one unconnected
      // provider never blocks the others.
      const [gmailSales, outlookSales, gmailExpenses, outlookExpenses] = await Promise.allSettled([
        base44.functions.invoke('processSaleEmails'),
        base44.functions.invoke('processOutlookSaleEmails'),
        base44.functions.invoke('processExpenseEmails'),
        base44.functions.invoke('processOutlookExpenseEmails'),
      ]);

      // Browser captures and email discoveries are persisted into the shared
      // spreadsheet. Then reconcile the spreadsheet back into the app so the
      // ArtFlow Creative Tracker remains the master record.
      const [browserQueue, sheetOrders, sheetExpenses] = await Promise.allSettled([
        base44.functions.invoke('flushBrowserCaptures'),
        base44.functions.invoke('importFromSheets', { mode: 'orders', sheetName: 'Orders' }),
        base44.functions.invoke('syncSheetExpenseFallback', {}),
      ]);

      const dataOf = (result) => result.status === 'fulfilled' ? result.value?.data || null : null;
      const state = {
        status: 'ok',
        at: new Date().toISOString(),
        sales: {
          gmail: dataOf(gmailSales),
          outlook: dataOf(outlookSales),
        },
        expenses: {
          gmail: dataOf(gmailExpenses),
          outlook: dataOf(outlookExpenses),
        },
        spreadsheet: {
          browser: dataOf(browserQueue),
          orders: dataOf(sheetOrders),
          expenses: dataOf(sheetExpenses),
        },
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
    if (!isAuthenticated || authBackend !== 'base44') return undefined;

    // Pull sales and expenses from every connected email source every five
    // minutes while the app is open. Server-side Gmail schedules use the same
    // five-minute cadence for accounts whose connector can run without a browser session.
    const syncId = window.setInterval(() => triggerLoginSync(), 5 * 60 * 1000);
    const syncWhenActive = () => {
      if (document.visibilityState === 'visible') triggerLoginSync();
    };
    window.addEventListener('focus', syncWhenActive);
    window.addEventListener('online', syncWhenActive);
    document.addEventListener('visibilitychange', syncWhenActive);
    return () => {
      window.clearInterval(syncId);
      window.removeEventListener('focus', syncWhenActive);
      window.removeEventListener('online', syncWhenActive);
      document.removeEventListener('visibilitychange', syncWhenActive);
    };
  }, [isAuthenticated, authBackend, triggerLoginSync]);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    // The new Art Flow account system is authoritative. It is backed by Neon
    // through Better Auth and is used by Art Flow's server APIs.
    try {
      const sessionResult = await artflowAuthClient.getSession();
      const session = sessionResult?.data || sessionResult;
      if (session?.user) {
        let summary = null;
        try {
          const response = await fetch('/api/neon-data?op=summary', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (response.ok) summary = await response.json();
        } catch {
          // A summary failure must not invalidate a valid login session.
        }

        const activeBusinessId = summary?.user?.activeBusinessId || null;
        const currentUser = {
          id: session.user.id,
          email: session.user.email,
          full_name: session.user.name || summary?.user?.name || 'Artist',
          name: session.user.name || summary?.user?.name || 'Artist',
          role: 'user',
          active_business_id: activeBusinessId,
          data: { active_business_id: activeBusinessId },
          auth_backend: 'neon',
        };

        setUser(currentUser);
        setAuthBackend('neon');
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }
    } catch (error) {
      console.warn('Neon auth check did not return a session:', error?.message || error);
    }

    // Temporary compatibility fallback for accounts that have not yet moved
    // from Base44. This can be removed after the migration is complete.
    if (appParams.token) {
      try {
        const currentUser = await withTimeout(base44.auth.me(), 8000, 'Authentication check');
        const businessId = await ensureBusinessWorkspace(currentUser);
        const hydratedUser = businessId
          ? { ...currentUser, active_business_id: businessId, data: { ...(currentUser.data || {}), active_business_id: businessId }, auth_backend: 'base44' }
          : { ...currentUser, auth_backend: 'base44' };
        setUser(hydratedUser);
        setAuthBackend('base44');
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        triggerLoginSync();
        return;
      } catch (error) {
        console.warn('Legacy auth check failed:', error?.message || error);
      }
    }

    setUser(null);
    setAuthBackend(null);
    setIsLoadingAuth(false);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);
    setAuthBackend(null);

    try {
      await artflowAuthClient.signOut();
    } catch {
      // Continue clearing the legacy local session even if server sign-out fails.
    }

    try {
      localStorage.removeItem('base44_access_token');
      localStorage.removeItem('token');
    } catch {}

    if (shouldRedirect) {
      window.location.replace('/login?clear_access_token=true');
    }
  };

  const navigateToLogin = () => {
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
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
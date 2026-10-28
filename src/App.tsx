import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './lib/supabase';
import Login from './screens/Login';
import Board from './screens/Board';
import JobDetail from './screens/JobDetail';
import Estimate from './screens/Estimate';
import Orders from './screens/Orders';
import Measurements from './screens/Measurements';
import Templates from './screens/Templates';
import Unmatched from './screens/Unmatched';

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const f = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return hash;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const hash = useHash();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (configError) return <div className="page"><div className="error">{configError}</div></div>;
  if (!ready) return <div className="page center muted">Loading…</div>;
  if (!session) return <Login />;

  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'job' && parts[1]) {
    if (parts[2] === 'estimate') return <Estimate jobId={parts[1]} />;
    if (parts[2] === 'orders') return <Orders jobId={parts[1]} />;
    if (parts[2] === 'measurements') return <Measurements jobId={parts[1]} docId={parts[3]} />;
    return <JobDetail jobId={parts[1]} />;
  }
  if (parts[0] === 'templates') return <Templates />;
  if (parts[0] === 'unmatched') return <Unmatched />;
  return <Board email={session.user.email ?? ''} />;
}

import { useEffect, useState } from 'react';
import {
  clear,
  decrement,
  increment,
  setProfile,
  trackEvent,
} from '@mixan-test/next';
import Link from 'next/link';

export default function Test() {
  const [id, setId] = useState('');
  const [auth, setAuth] = useState<string | null>(null);

  function handleLogin() {
    if (id) {
      localStorage.setItem('auth', id);
      setAuth(id);
    }
  }

  function handleLogout() {
    localStorage.removeItem('auth');
    setAuth(null);
  }

  useEffect(() => {
    setAuth(localStorage.getItem('auth') ?? null);
  }, []);

  useEffect(() => {
    console.log('auth', auth);

    if (auth) {
      console.log('set profile?', auth);

      setProfile({
        profileId: auth,
      });
    } else {
      clear();
    }
  }, [auth]);

  if (auth === null) {
    return (
      <div>
        <input
          type="text"
          placeholder="Login with user id"
          onChange={(e) => setId(e.target.value)}
        />
        <button onClick={handleLogin}>Login</button>
      </div>
    );
  }
  return (
    <div>
      <Link href="/">Home</Link>
      <button
        onClick={() => {
          setProfile({
            firstName: 'Maja',
            lastName: 'Klara',
            profileId: auth,
          });
        }}
      >
        Set user
      </button>
      <button
        onClick={() => {
          increment('app_open', 1);
        }}
      >
        Increment
      </button>
      <button
        onClick={() => {
          decrement('app_open', 1);
        }}
      >
        Decrement
      </button>
      <button
        onClick={() => {
          localStorage.clear();
          window.location.reload();
        }}
      >
        Clear storage and reload
      </button>
      <button
        onClick={() => {
          trackEvent('custom_click', {
            custom_string: 'test',
            custom_number: 1,
          });
        }}
      >
        Trigger event
      </button>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

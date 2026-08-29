import { signOut } from '../lib/supabase';

export function HomePage() {
  return (
    <div>
      <p>Signed in.</p>
      <button type="button" onClick={() => signOut()}>Sign out</button>
    </div>
  );
}

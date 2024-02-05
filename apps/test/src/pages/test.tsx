import { mixan } from '@/analytics';
import Link from 'next/link';

export default function Test() {
  return (
    <div>
      <Link href="/">Home</Link>
      <button
        onClick={() => {
          mixan.setUser({
            first_name: 'John',
          });
          mixan.setUser({
            last_name: 'Doe',
          });
          mixan.setUser({
            email: 'john.doe@gmail.com',
          });
          mixan.setUser({
            id: '1234',
          });
        }}
      >
        Set user
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
          // @ts-ignore
          window.openpanel.event('custom_click', {
            custom_string: 'test',
            custom_number: 1,
          });
        }}
      >
        Trigger event
      </button>
      <button
        onClick={() => {
          mixan.clear();
        }}
      >
        Logout
      </button>
    </div>
  );
}

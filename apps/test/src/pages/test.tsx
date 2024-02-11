import Link from 'next/link';

export default function Test() {
  return (
    <div>
      <Link href="/">Home</Link>
      <button
        onClick={() => {
          // @ts-expect-error
          window.openpanel.setUser({
            first_name: 'John',
            last_name: 'Doe',
            email: 'john.doe@gmail.com',
            id: '1234',
          });
        }}
      >
        Set user
      </button>
      <button
        onClick={() => {
          // @ts-expect-error
          window.openpanel.increment('app_open', 1);
        }}
      >
        Increment
      </button>
      <button
        onClick={() => {
          // @ts-expect-error
          window.openpanel.decrement('app_open', 1);
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
          // @ts-expect-error
          window.openpanel.clear();
        }}
      >
        Logout
      </button>
    </div>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/test">Test</Link>
      <a href="https://google.se">Google</a>
      <a href="https://kiddokitchen.se">KiddoKitchen</a>
      <a href="https://kiddokitchen.se" target="_blank" rel="noreferrer">
        KiddoKitchen (_blank)
      </a>
    </div>
  );
}

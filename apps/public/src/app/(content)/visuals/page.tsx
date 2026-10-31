import type { Metadata } from 'next';
import { HeroContainer } from '@/app/(home)/_sections/hero';
import { SectionHeader } from '@/components/section';
import {
  VISUAL_MOCK_NAMES,
  VisualMock,
  type VisualMockName,
} from '@/components/visual-mock';

// Internal gallery of every product mock, so a page author can pick one by
// name. Not indexed and not in the sitemap.
export const metadata: Metadata = {
  title: 'Visual mocks',
  robots: { index: false, follow: false },
};

const MINIS = VISUAL_MOCK_NAMES.filter((name) => name.startsWith('mini-'));
const VIEWS = VISUAL_MOCK_NAMES.filter((name) => !name.startsWith('mini-'));

function Example({ name }: { name: VisualMockName }) {
  return (
    <div className="col gap-6">
      <h2 className="font-mono text-sm">
        {'<VisualMock name="'}
        {name}
        {'" />'}
      </h2>
      <VisualMock name={name} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="col gap-2">
          <span className="font-mono text-neutral-500 text-xs">
            frame="inset"
          </span>
          <VisualMock frame="inset" name={name} />
        </div>
        <div className="col gap-2">
          <span className="font-mono text-neutral-500 text-xs">
            frame="inset" side="bottom"
          </span>
          <VisualMock frame="inset" name={name} side="bottom" />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div>
      <HeroContainer className="pb-6">
        <SectionHeader
          as="h1"
          description="Every product mock available to pages, by name. Use frame=&quot;window&quot; (default), &quot;inset&quot; to cut it off at a panel edge, or &quot;bare&quot; for the view alone."
          title="Visual mocks"
        />
      </HeroContainer>
      <div className="col container gap-24 pb-24">
        {VIEWS.map((name) => (
          <Example key={name} name={name} />
        ))}
        <div className="col gap-6">
          <h2 className="font-mono text-sm">Minis, for feature cards</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MINIS.map((name) => (
              <li className="surface col gap-4 p-6" key={name}>
                <div className="h-40 overflow-hidden">
                  <VisualMock frame="bare" name={name} />
                </div>
                <span className="font-mono text-neutral-500 text-xs">
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

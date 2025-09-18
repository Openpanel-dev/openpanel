import { useState } from 'react';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';

export function SpinnerDemo() {
  const [loading, setLoading] = useState(false);
  const [activeSpinner, setActiveSpinner] = useState<string | null>(null);

  const simulateLoading = (spinnerId: string) => {
    setActiveSpinner(spinnerId);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setActiveSpinner(null);
    }, 3000);
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">
          ✨ Cool Spinning Loading Effects
        </h2>
        <p className="text-muted-foreground mb-6">
          Click any button to see the spinning animations in action! Each
          animation runs for 3 seconds.
        </p>
      </div>

      {/* Standalone Spinners */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Standalone Spinners</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {(['circle', 'dots', 'pulse', 'bars', 'ring'] as const).map(
            (type) => (
              <div key={type} className="flex flex-col items-center gap-2">
                <div className="h-16 w-16 flex items-center justify-center border rounded-lg bg-card">
                  <Spinner type={type} size="lg" />
                </div>
                <span className="text-sm font-medium capitalize">{type}</span>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Spinner Sizes */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Spinner Sizes</h3>
        <div className="flex items-center gap-4">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Spinner size={size} />
              <span className="text-xs text-muted-foreground">{size}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spinner Speeds */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Spinner Speeds</h3>
        <div className="flex items-center gap-6">
          {(['slow', 'normal', 'fast'] as const).map((speed) => (
            <div key={speed} className="flex flex-col items-center gap-2">
              <Spinner speed={speed} size="lg" />
              <span className="text-sm capitalize">{speed}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Button Examples */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Button Loading States</h3>
        <div className="space-y-4">
          {/* Different Button Variants */}
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => simulateLoading('default')}
              loading={loading && activeSpinner === 'default'}
              loadingType="circle"
            >
              Default Circle
            </Button>
            <Button
              variant="cta"
              onClick={() => simulateLoading('cta-dots')}
              loading={loading && activeSpinner === 'cta-dots'}
              loadingType="dots"
            >
              CTA with Dots
            </Button>
            <Button
              variant="outline"
              onClick={() => simulateLoading('outline-bars')}
              loading={loading && activeSpinner === 'outline-bars'}
              loadingType="bars"
            >
              Outline Bars
            </Button>
            <Button
              variant="secondary"
              onClick={() => simulateLoading('secondary-ring')}
              loading={loading && activeSpinner === 'secondary-ring'}
              loadingType="ring"
            >
              Secondary Ring
            </Button>
            <Button
              variant="destructive"
              onClick={() => simulateLoading('destructive-pulse')}
              loading={loading && activeSpinner === 'destructive-pulse'}
              loadingType="pulse"
            >
              Destructive Pulse
            </Button>
          </div>

          {/* Different Speeds */}
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => simulateLoading('slow')}
              loading={loading && activeSpinner === 'slow'}
              loadingSpeed="slow"
            >
              Slow Loading
            </Button>
            <Button
              onClick={() => simulateLoading('normal')}
              loading={loading && activeSpinner === 'normal'}
              loadingSpeed="normal"
            >
              Normal Loading
            </Button>
            <Button
              onClick={() => simulateLoading('fast')}
              loading={loading && activeSpinner === 'fast'}
              loadingSpeed="fast"
            >
              Fast Loading
            </Button>
          </div>

          {/* Icon Buttons */}
          <div className="flex gap-4">
            <Button
              size="icon"
              onClick={() => simulateLoading('icon-circle')}
              loading={loading && activeSpinner === 'icon-circle'}
              loadingType="circle"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => simulateLoading('icon-dots')}
              loading={loading && activeSpinner === 'icon-dots'}
              loadingType="dots"
            />
            <Button
              size="icon"
              variant="secondary"
              onClick={() => simulateLoading('icon-pulse')}
              loading={loading && activeSpinner === 'icon-pulse'}
              loadingType="pulse"
            />
          </div>
        </div>
      </div>

      {/* Real-world Example */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Real-world Examples</h3>
        <div className="space-y-4 bg-card p-6 rounded-lg border">
          <h4 className="font-medium">User Actions</h4>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => simulateLoading('save')}
              loading={loading && activeSpinner === 'save'}
              loadingType="circle"
              loadingSpeed="normal"
            >
              {loading && activeSpinner === 'save'
                ? 'Saving...'
                : 'Save Changes'}
            </Button>
            <Button
              variant="cta"
              onClick={() => simulateLoading('upload')}
              loading={loading && activeSpinner === 'upload'}
              loadingType="bars"
              loadingSpeed="fast"
            >
              {loading && activeSpinner === 'upload'
                ? 'Uploading...'
                : 'Upload File'}
            </Button>
            <Button
              variant="outline"
              onClick={() => simulateLoading('delete')}
              loading={loading && activeSpinner === 'delete'}
              loadingType="ring"
              loadingSpeed="slow"
            >
              {loading && activeSpinner === 'delete'
                ? 'Deleting...'
                : 'Delete Item'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => simulateLoading('refresh')}
              loading={loading && activeSpinner === 'refresh'}
              loadingType="dots"
              loadingSpeed="normal"
            >
              {loading && activeSpinner === 'refresh'
                ? 'Refreshing...'
                : 'Refresh Data'}
            </Button>
          </div>
        </div>
      </div>

      {/* Usage Tips */}
      <div className="bg-blue-50 dark:bg-blue-950/30 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          💡 Usage Tips
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>
            • Use{' '}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              circle
            </code>{' '}
            for general loading states
          </li>
          <li>
            • Use{' '}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              dots
            </code>{' '}
            for data fetching
          </li>
          <li>
            • Use{' '}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              bars
            </code>{' '}
            for file uploads/processing
          </li>
          <li>
            • Use{' '}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              ring
            </code>{' '}
            for search operations
          </li>
          <li>
            • Use{' '}
            <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
              pulse
            </code>{' '}
            for subtle loading states
          </li>
          <li>
            • Match spinner speed to the expected duration of the operation
          </li>
        </ul>
      </div>
    </div>
  );
}

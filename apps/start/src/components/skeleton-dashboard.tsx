export function SkeletonDashboard() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-def-100 to-def-200">
      <div className="fixed inset-0 z-10 bg-background/10 backdrop-blur-xs" />
      {/* Sidebar Skeleton */}
      <div className="fixed top-0 left-0 h-full w-72 border-def-300/50 border-r bg-background/80 backdrop-blur-sm">
        {/* Logo area */}
        <div className="flex h-16 items-center border-def-300/50 border-b px-4">
          <div className="h-8 w-8 rounded-lg bg-def-300/60" />
          <div className="ml-3 h-4 w-24 rounded bg-def-300/60" />
        </div>

        {/* Navigation items */}
        <div className="space-y-3 p-4">
          {[
            'Dashboard',
            'Analytics',
            'Reports',
            'Settings',
            'Users',
            'Projects',
          ].map((item, i) => (
            <div
              className="flex items-center space-x-3 rounded-lg p-2"
              key={`nav-${item.toLowerCase()}`}
            >
              <div className="h-5 w-5 rounded bg-def-300/60" />
              <div className="h-3 w-20 rounded bg-def-300/60" />
            </div>
          ))}
        </div>

        {/* Project section */}
        <div className="px-4 py-2">
          <div className="mb-3 h-3 w-16 rounded bg-def-300/60" />
          {['Project Alpha', 'Project Beta', 'Project Gamma'].map(
            (project, i) => (
              <div
                className="mb-2 flex items-center space-x-3 rounded-lg p-2"
                key={`project-${project.toLowerCase().replace(' ', '-')}`}
              >
                <div className="h-4 w-4 rounded bg-def-300/60" />
                <div className="h-3 w-24 rounded bg-def-300/60" />
              </div>
            )
          )}
        </div>
      </div>

      {/* Main content area skeleton */}
      <div className="ml-72 p-8">
        {/* Header area */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-6 w-48 rounded bg-def-300/60" />
            <div className="flex space-x-2">
              <div className="h-8 w-20 rounded bg-def-300/60" />
              <div className="h-8 w-20 rounded bg-def-300/60" />
            </div>
          </div>
        </div>

        {/* Dashboard grid */}
        <div className="mb-8 grid grid-cols-3 gap-6">
          {[
            'Total Users',
            'Active Sessions',
            'Page Views',
            'Bounce Rate',
            'Conversion',
            'Revenue',
          ].map((metric, i) => (
            <div
              className="rounded-xl border border-def-300/50 bg-card/60 p-6"
              key={`metric-${metric.toLowerCase().replace(' ', '-')}`}
            >
              <div className="mb-3 h-4 w-16 rounded bg-def-300/60" />
              <div className="mb-2 h-8 w-24 rounded bg-def-300/60" />
              <div className="h-3 w-32 rounded bg-def-300/60" />
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 rounded-xl border border-def-300/50 bg-card/60 p-6">
            <div className="mb-4 h-4 w-20 rounded bg-def-300/60" />
            <div className="space-y-3">
              {['Desktop', 'Mobile', 'Tablet', 'Other'].map((device, i) => (
                <div
                  className="flex items-center space-x-3"
                  key={`chart-${device.toLowerCase()}`}
                >
                  <div className="h-3 w-3 rounded-full bg-def-300/60" />
                  <div className="h-2 flex-1 rounded bg-def-300/60" />
                  <div className="h-3 w-8 rounded bg-def-300/60" />
                </div>
              ))}
            </div>
          </div>

          <div className="h-64 rounded-xl border border-def-300/50 bg-card/60 p-6">
            <div className="mb-4 h-4 w-20 rounded bg-def-300/60" />
            <div className="space-y-3">
              {[
                'John Doe',
                'Jane Smith',
                'Bob Johnson',
                'Alice Brown',
                'Charlie Wilson',
              ].map((user, i) => (
                <div
                  className="flex items-center space-x-3"
                  key={`user-${user.toLowerCase().replace(' ', '-')}`}
                >
                  <div className="h-8 w-8 rounded-full bg-def-300/60" />
                  <div className="flex-1">
                    <div className="mb-1 h-3 w-24 rounded bg-def-300/60" />
                    <div className="h-2 w-16 rounded bg-def-300/60" />
                  </div>
                  <div className="h-3 w-12 rounded bg-def-300/60" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

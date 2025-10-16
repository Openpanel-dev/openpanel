export function SkeletonDashboard() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-def-100 to-def-200 overflow-hidden">
      <div className="inset-0 fixed backdrop-blur-xs bg-background/10 z-10" />
      {/* Sidebar Skeleton */}
      <div className="fixed left-0 top-0 w-72 h-full bg-background/80 border-r border-def-300/50 backdrop-blur-sm">
        {/* Logo area */}
        <div className="h-16 border-b border-def-300/50 flex items-center px-4">
          <div className="w-8 h-8 bg-def-300/60 rounded-lg" />
          <div className="ml-3 w-24 h-4 bg-def-300/60 rounded" />
        </div>

        {/* Navigation items */}
        <div className="p-4 space-y-3">
          {[
            'Dashboard',
            'Analytics',
            'Reports',
            'Settings',
            'Users',
            'Projects',
          ].map((item, i) => (
            <div
              key={`nav-${item.toLowerCase()}`}
              className="flex items-center space-x-3 p-2 rounded-lg"
            >
              <div className="w-5 h-5 bg-def-300/60 rounded" />
              <div className="w-20 h-3 bg-def-300/60 rounded" />
            </div>
          ))}
        </div>

        {/* Project section */}
        <div className="px-4 py-2">
          <div className="w-16 h-3 bg-def-300/60 rounded mb-3" />
          {['Project Alpha', 'Project Beta', 'Project Gamma'].map(
            (project, i) => (
              <div
                key={`project-${project.toLowerCase().replace(' ', '-')}`}
                className="flex items-center space-x-3 p-2 rounded-lg mb-2"
              >
                <div className="w-4 h-4 bg-def-300/60 rounded" />
                <div className="w-24 h-3 bg-def-300/60 rounded" />
              </div>
            ),
          )}
        </div>
      </div>

      {/* Main content area skeleton */}
      <div className="ml-72 p-8">
        {/* Header area */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="w-48 h-6 bg-def-300/60 rounded" />
            <div className="flex space-x-2">
              <div className="w-20 h-8 bg-def-300/60 rounded" />
              <div className="w-20 h-8 bg-def-300/60 rounded" />
            </div>
          </div>
        </div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {[
            'Total Users',
            'Active Sessions',
            'Page Views',
            'Bounce Rate',
            'Conversion',
            'Revenue',
          ].map((metric, i) => (
            <div
              key={`metric-${metric.toLowerCase().replace(' ', '-')}`}
              className="bg-card/60 rounded-xl p-6 border border-def-300/50"
            >
              <div className="w-16 h-4 bg-def-300/60 rounded mb-3" />
              <div className="w-24 h-8 bg-def-300/60 rounded mb-2" />
              <div className="w-32 h-3 bg-def-300/60 rounded" />
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-card/60 rounded-xl p-6 border border-def-300/50 h-64">
            <div className="w-20 h-4 bg-def-300/60 rounded mb-4" />
            <div className="space-y-3">
              {['Desktop', 'Mobile', 'Tablet', 'Other'].map((device, i) => (
                <div
                  key={`chart-${device.toLowerCase()}`}
                  className="flex items-center space-x-3"
                >
                  <div className="w-3 h-3 bg-def-300/60 rounded-full" />
                  <div className="flex-1 h-2 bg-def-300/60 rounded" />
                  <div className="w-8 h-3 bg-def-300/60 rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card/60 rounded-xl p-6 border border-def-300/50 h-64">
            <div className="w-20 h-4 bg-def-300/60 rounded mb-4" />
            <div className="space-y-3">
              {[
                'John Doe',
                'Jane Smith',
                'Bob Johnson',
                'Alice Brown',
                'Charlie Wilson',
              ].map((user, i) => (
                <div
                  key={`user-${user.toLowerCase().replace(' ', '-')}`}
                  className="flex items-center space-x-3"
                >
                  <div className="w-8 h-8 bg-def-300/60 rounded-full" />
                  <div className="flex-1">
                    <div className="w-24 h-3 bg-def-300/60 rounded mb-1" />
                    <div className="w-16 h-2 bg-def-300/60 rounded" />
                  </div>
                  <div className="w-12 h-3 bg-def-300/60 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

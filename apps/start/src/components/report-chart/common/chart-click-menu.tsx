import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export interface ChartClickMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ChartClickMenuProps {
  children: React.ReactNode;
  /**
   * Function that receives the click event and clicked data, returns menu items
   * This allows conditional menu items based on what was clicked
   */
  getMenuItems: (e: any, clickedData: any) => ChartClickMenuItem[];
  /**
   * Optional callback when menu closes
   */
  onClose?: () => void;
}

export interface ChartClickMenuHandle {
  setPosition: (position: { x: number; y: number } | null) => void;
  getContainerElement: () => HTMLDivElement | null;
}

/**
 * Reusable component for handling chart clicks and showing a dropdown menu
 * Wraps the chart and handles click position tracking and dropdown positioning
 */
export const ChartClickMenu = forwardRef<
  ChartClickMenuHandle,
  ChartClickMenuProps
>(({ children, getMenuItems, onClose }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clickPosition, setClickPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [clickedData, setClickedData] = useState<any>(null);

  const [clickEvent, setClickEvent] = useState<any>(null);

  const handleChartClick = useCallback((e: any) => {
    if (e?.activePayload?.[0] && containerRef.current) {
      const payload = e.activePayload[0].payload;

      // Calculate click position relative to chart container
      const containerRect = containerRef.current.getBoundingClientRect();

      // Try to get viewport coordinates from the event
      // Recharts passes nativeEvent with clientX/clientY (viewport coordinates)
      let clientX = 0;
      let clientY = 0;

      if (
        e.nativeEvent?.clientX !== undefined &&
        e.nativeEvent?.clientY !== undefined
      ) {
        // Best case: use nativeEvent client coordinates (viewport coordinates)
        clientX = e.nativeEvent.clientX;
        clientY = e.nativeEvent.clientY;
      } else if (e.clientX !== undefined && e.clientY !== undefined) {
        // Fallback: use event's clientX/Y directly
        clientX = e.clientX;
        clientY = e.clientY;
      } else if (e.activeCoordinate) {
        // Last resort: activeCoordinate is SVG-relative, need to find SVG element
        // and convert to viewport coordinates
        const svgElement = containerRef.current.querySelector('svg');
        if (svgElement) {
          const svgRect = svgElement.getBoundingClientRect();
          clientX = svgRect.left + (e.activeCoordinate.x ?? 0);
          clientY = svgRect.top + (e.activeCoordinate.y ?? 0);
        } else {
          // If no SVG found, use container position + activeCoordinate
          clientX = containerRect.left + (e.activeCoordinate.x ?? 0);
          clientY = containerRect.top + (e.activeCoordinate.y ?? 0);
        }
      }

      setClickedData(payload);
      setClickEvent(e); // Store the full event
      setClickPosition({
        x: clientX - containerRect.left,
        y: clientY - containerRect.top,
      });
    }
  }, []);

  const menuItems =
    clickedData && clickEvent ? getMenuItems(clickEvent, clickedData) : [];

  const handleItemClick = useCallback(
    (item: ChartClickMenuItem) => {
      item.onClick();
      setClickPosition(null);
      setClickedData(null);
      setClickEvent(null);
      if (onClose) {
        onClose();
      }
    },
    [onClose],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setClickPosition(null);
        setClickedData(null);
        setClickEvent(null);
        if (onClose) {
          onClose();
        }
      }
    },
    [onClose],
  );

  // Expose methods via ref (for advanced use cases)
  useImperativeHandle(
    ref,
    () => ({
      setPosition: (position: { x: number; y: number } | null) => {
        setClickPosition(position);
      },
      getContainerElement: () => containerRef.current,
    }),
    [],
  );

  // Clone children and add onClick handler to chart components
  const chartWithClickHandler = React.useMemo(() => {
    const addClickHandler = (node: React.ReactNode): React.ReactNode => {
      // Handle null, undefined, strings, numbers
      if (!React.isValidElement(node)) {
        return node;
      }

      // Check if this is a chart component
      const componentName =
        (node.type as any)?.displayName || (node.type as any)?.name;
      const isChartComponent =
        componentName === 'ComposedChart' ||
        componentName === 'LineChart' ||
        componentName === 'BarChart' ||
        componentName === 'AreaChart' ||
        componentName === 'PieChart' ||
        componentName === 'ResponsiveContainer';

      // Process children recursively - handle arrays, fragments, and single elements
      const processChildren = (children: React.ReactNode): React.ReactNode => {
        if (children == null) {
          return children;
        }

        // Handle arrays
        if (Array.isArray(children)) {
          return children.map(addClickHandler);
        }

        // Handle React fragments
        if (
          React.isValidElement(children) &&
          children.type === React.Fragment
        ) {
          const fragmentElement = children as React.ReactElement<{
            children?: React.ReactNode;
          }>;
          return React.cloneElement(fragmentElement, {
            children: processChildren(fragmentElement.props.children),
          });
        }

        // Recursively process single child
        return addClickHandler(children);
      };

      const element = node as React.ReactElement<{
        children?: React.ReactNode;
        onClick?: (e: any) => void;
      }>;

      if (isChartComponent) {
        // For ResponsiveContainer, we need to add onClick to its child (ComposedChart, etc.)
        if (componentName === 'ResponsiveContainer') {
          return React.cloneElement(element, {
            children: processChildren(element.props.children),
          });
        }
        // For chart components, add onClick directly
        return React.cloneElement(element, {
          onClick: handleChartClick,
          children: processChildren(element.props.children),
        });
      }

      // Recursively process children for non-chart components
      if (element.props.children != null) {
        return React.cloneElement(element, {
          children: processChildren(element.props.children),
        });
      }

      return node;
    };

    // Handle multiple children (array) or single child
    if (Array.isArray(children)) {
      return children.map(addClickHandler);
    }
    return addClickHandler(children);
  }, [children, handleChartClick]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <DropdownMenu
        open={clickPosition !== null}
        onOpenChange={handleOpenChange}
      >
        <DropdownMenuTrigger asChild>
          <div
            style={{
              position: 'absolute',
              left: clickPosition?.x ?? -9999,
              top: clickPosition?.y ?? -9999,
              pointerEvents: 'none',
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" sideOffset={5}>
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
            >
              {item.icon && <span className="mr-2">{item.icon}</span>}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {chartWithClickHandler}
    </div>
  );
});

ChartClickMenu.displayName = 'ChartClickMenu';

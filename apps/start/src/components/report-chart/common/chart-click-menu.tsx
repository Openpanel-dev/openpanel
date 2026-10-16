import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ChartClickMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ChartClickMenuProps {
  children: React.ReactNode;
  /** Returns menu items for the clicked data, so items can be conditional on it. */
  getMenuItems: (e: any, clickedData: any) => ChartClickMenuItem[];
  onClose?: () => void;
}

export interface ChartClickMenuHandle {
  setPosition: (position: { x: number; y: number } | null) => void;
  getContainerElement: () => HTMLDivElement | null;
}

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

      const containerRect = containerRef.current.getBoundingClientRect();

      // Recharts passes nativeEvent with clientX/clientY (viewport coordinates).
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
          clientX = containerRect.left + (e.activeCoordinate.x ?? 0);
          clientY = containerRect.top + (e.activeCoordinate.y ?? 0);
        }
      }

      setClickedData(payload);
      setClickEvent(e);
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
    [onClose]
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
    [onClose]
  );

  useImperativeHandle(
    ref,
    () => ({
      setPosition: (position: { x: number; y: number } | null) => {
        setClickPosition(position);
      },
      getContainerElement: () => containerRef.current,
    }),
    []
  );

  const chartWithClickHandler = React.useMemo(() => {
    const addClickHandler = (node: React.ReactNode): React.ReactNode => {
      if (!React.isValidElement(node)) {
        return node;
      }

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

        if (Array.isArray(children)) {
          return children.map(addClickHandler);
        }

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
        return React.cloneElement(element, {
          onClick: handleChartClick,
          children: processChildren(element.props.children),
        });
      }

      if (element.props.children != null) {
        return React.cloneElement(element, {
          children: processChildren(element.props.children),
        });
      }

      return node;
    };

    if (Array.isArray(children)) {
      return children.map(addClickHandler);
    }
    return addClickHandler(children);
  }, [children, handleChartClick]);

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <DropdownMenu
        onOpenChange={handleOpenChange}
        open={clickPosition !== null && menuItems.length > 0}
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
              disabled={item.disabled}
              key={item.label}
              onClick={() => handleItemClick(item)}
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

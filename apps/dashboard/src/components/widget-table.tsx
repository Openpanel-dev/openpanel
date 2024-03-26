interface Props<T> {
  columns: {
    name: string;
    render: (item: T) => React.ReactNode;
  }[];
  keyExtractor: (item: T) => string;
  data: T[];
}

export function WidgetTable<T>({ columns, data, keyExtractor }: Props<T>) {
  return (
    <table className="w-full">
      <thead className="border-b border-border bg-slate-50 text-sm text-slate-500 [&_th:last-child]:text-right [&_th]:whitespace-nowrap [&_th]:p-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium">
        <tr>
          {columns.map((column) => (
            <th key={column.name}>{column.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr
            key={keyExtractor(item)}
            className="border-b border-border text-right text-sm last:border-0 [&_td:first-child]:text-left [&_td]:p-4"
          >
            {columns.map((column) => (
              <td key={column.name}>{column.render(item)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

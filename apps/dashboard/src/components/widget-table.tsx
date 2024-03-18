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
      <thead className="bg-slate-50 border-b border-border text-slate-500 [&_th]:font-medium text-sm [&_th]:p-4 [&_th]:py-2 [&_th]:text-left [&_th:last-child]:text-right [&_th]:whitespace-nowrap">
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
            className="text-sm border-b border-border last:border-0 [&_td]:p-4 [&_td:first-child]:text-left text-right"
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

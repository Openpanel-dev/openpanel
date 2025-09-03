import { Pagination, type Props } from './pagination';

export function FloatingPagination(props: Props) {
  return (
    <div className="fixed bottom-8 left-72 right-0 row justify-center">
      <div className="card p-8 py-4 backdrop-blur-sm bg-background/50 shadow-lg">
        <Pagination {...props} />
      </div>
    </div>
  );
}

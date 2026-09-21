import { Pagination, type Props } from './pagination';

export function FloatingPagination(props: Props) {
  return (
    <div className="row fixed right-0 bottom-8 left-0 justify-center lg:left-72">
      <div className="card bg-background/50 p-8 py-4 shadow-lg backdrop-blur-sm">
        <Pagination {...props} />
      </div>
    </div>
  );
}

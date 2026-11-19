import ReactAnimateHeight from 'react-animate-height';

type Props = {
  children: React.ReactNode;
  className?: string;
  open: boolean;
};

const AnimateHeight = ({ children, className, open }: Props) => {
  return (
    <ReactAnimateHeight
      className={className}
      duration={300}
      height={open ? 'auto' : 0}
    >
      {children}
    </ReactAnimateHeight>
  );
};

export default AnimateHeight;

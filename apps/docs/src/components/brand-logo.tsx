interface Props {
  src: string;
  isDark?: boolean;
}
export function BrandLogo({ src, isDark }: Props) {
  if (isDark) {
    return (
      <div className="h-9 w-9 rounded-full bg-white p-1">
        <img className="h-full w-full object-contain" src={src} />
      </div>
    );
  }

  return <img className="h-9 w-9 object-contain" src={src} />;
}

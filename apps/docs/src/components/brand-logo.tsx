interface Props {
  src: string;
  isDark?: boolean;
}
export function BrandLogo({ src, isDark }: Props) {
  if (isDark) {
    return (
      <div className="w-9 h-9 p-1 rounded-full bg-white">
        <img className="w-full h-full object-contain" src={src} />
      </div>
    );
  }

  return <img className="w-9 h-9 object-contain" src={src} />;
}

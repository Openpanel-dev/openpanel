type InputErrorProps = { message?: string };

export function InputError({ message }: InputErrorProps) {
  if (!message) {
    return null;
  }

  return <div className="mt-1 text-sm text-red-600">{message}</div>;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-muted/10 p-4">
      {children}
    </div>
  );
}

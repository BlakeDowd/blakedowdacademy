export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-layout w-full max-w-full min-w-0 overflow-x-clip box-border">
      {children}
    </div>
  );
}

import { Sidebar } from "@/components/shared/sidebar";
import { Navbar } from "@/components/shared/navbar";
import { PayrollStoreProvider } from "@/lib/payroll-store";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <PayrollStoreProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 pl-64">
          <Navbar />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </PayrollStoreProvider>
  );
}

import { Sidebar } from "@/components/shared/sidebar";
import { Navbar } from "@/components/shared/navbar";
import { PayrollStoreProvider } from "@/lib/payroll-store";
import { SidebarProvider } from "@/lib/sidebar-context";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <PayrollStoreProvider>
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 lg:pl-64">
            <Navbar />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </PayrollStoreProvider>
  );
}

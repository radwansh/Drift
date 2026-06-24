"use client";
import { UserButton, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Moon, Sun, Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/lib/sidebar-context";

export function Navbar() {
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggle} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">
          Welcome{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
        <UserButton afterSignOutUrl="/login" />
      </div>
    </header>
  );
}

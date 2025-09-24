"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  Stethoscope,
  Users,
  Building2,
  Activity,
  Smartphone,
  Settings,
  LogOut,
} from "lucide-react";
import { PeterdrawLogo } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const menuItems = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/appointments", icon: ClipboardList, label: "Appointments" },
  { href: "/doctors", icon: Stethoscope, label: "Doctors" },
  { href: "/patients", icon: Users, label: "Patients" },
  { href: "/departments", icon: Building2, label: "Departments" },
  { href: "/live-status", icon: Activity, label: "Live Status" },
  { href: "/mobile-app", icon: Smartphone, label: "Mobile App" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="group sticky top-0 left-0 h-screen w-16 hover:w-64 transition-all duration-300 ease-in-out flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-lg z-50 rounded-tr-2xl rounded-br-2xl">
        <div className="flex h-20 items-center justify-center p-4 shrink-0">
          <Link href="/" className="flex items-center gap-3">
            <PeterdrawLogo className="h-10 w-10 text-sidebar-primary" />
            <span className="text-xl font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
              Dashyat
            </span>
          </Link>
        </div>
        <nav className="flex-grow flex flex-col justify-center gap-2 p-2">
          {menuItems.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <Link href={item.href}>
                  <div
                    className={cn(
                      "flex items-center h-12 p-3 rounded-lg cursor-pointer transition-colors",
                      pathname === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/50",
                      "overflow-hidden"
                    )}
                  >
                    <item.icon className="h-6 w-6 shrink-0" />
                    <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                      {item.label}
                    </span>
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="group-hover:hidden ml-2"
              >
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>
        <div className="mt-auto p-2 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center h-12 p-3 rounded-lg cursor-pointer transition-colors hover:bg-sidebar-accent/50",
                  "overflow-hidden"
                )}
              >
                <Settings className="h-6 w-6 shrink-0" />
                <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                  Settings
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="group-hover:hidden ml-2"
            >
              Settings
            </TooltipContent>
          </Tooltip>
           <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center h-12 p-3 rounded-lg cursor-pointer transition-colors hover:bg-sidebar-accent/50 text-red-500",
                  "overflow-hidden"
                )}
              >
                <LogOut className="h-6 w-6 shrink-0" />
                <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                  Logout
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="group-hover:hidden ml-2"
            >
              Logout
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

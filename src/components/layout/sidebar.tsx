
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
  LogOut,
  MoreVertical,
  User as UserIcon,
} from "lucide-react";
import { PeterdrawLogo } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { user } from "@/lib/data";
import { Button } from "../ui/button";

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
            <span className="text-xl font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap font-headline">
              Kloqo
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start h-auto p-2 hover:bg-sidebar-accent/50">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="text-left opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                      <p className="text-sm font-semibold text-sidebar-foreground">{user.name}</p>
                      <p className="text-xs text-sidebar-foreground/70">{user.email}</p>
                    </div>
                    <MoreVertical className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100" />
                  </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="mb-2 ml-2">
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                <span>View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-500">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

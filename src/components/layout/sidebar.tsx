
"use client";
import Link from "next/link";
import {
  Home,
  Settings,
  Stethoscope,
  Building2,
  LogOut,
  Activity,
  PlusCircle,
  HelpCircle,
  ClipboardList,
  Users
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { PeterdrawLogo } from "@/components/icons";
import { usePathname } from "next/navigation";
import { Badge } from "../ui/badge";

const menuItems = [
  {
    href: "/",
    icon: Home,
    label: "Dashboard",
  },
  {
    href: "/appointments",
    icon: ClipboardList,
    label: "Appointments",
  },
  {
    href: "/doctors",
    icon: Stethoscope,
    label: "Doctors",
  },
    {
    href: "/patients",
    icon: Users,
    label: "Patients",
  },
  {
    href: "/departments",
    icon: Building2,
    label: "Departments",
  },
  {
    href: "/live-status",
    icon: Activity,
    label: "Live Status",
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
           <PeterdrawLogo className="w-8 h-8" />
            <span
              className={`font-bold text-lg ${
                state === "collapsed" ? "hidden" : ""
              }`}
            >
              Dashyat
            </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={pathname.startsWith(item.href) && item.href !== "/" || pathname === item.href}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                  {item.badge && <Badge variant="destructive" className="ml-auto">{item.badge}</Badge>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        
      </SidebarContent>
      <SidebarFooter className={state === "collapsed" ? "hidden" : ""}>
        <div className="p-4">
          <Button className="w-full">
            <PlusCircle />
            <span>Add New Project</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

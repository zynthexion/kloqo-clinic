"use client";
import Link from "next/link";
import {
  Home,
  Users,
  BriefcaseMedical,
  Settings,
  Calendar,
  Wallet,
  Inbox,
  MessageSquare,
  Stethoscope,
  Building2,
  LogOut,
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
import { MediDashLogo } from "@/components/icons";
import { usePathname } from "next/navigation";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const menuItems = [
  {
    href: "/",
    icon: Home,
    label: "Dashboard",
  },
  {
    href: "/appointments",
    icon: Calendar,
    label: "Appointments",
  },
  {
    href: "/doctors",
    icon: Stethoscope,
    label: "Doctors",
  },
  {
    href: "/departments",
    icon: Building2,
    label: "Departments",
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
           <MediDashLogo className="w-8 h-8 text-primary" />
            <span
              className={`font-bold text-lg ${
                state === "collapsed" ? "hidden" : ""
              }`}
            >
              WellNest
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
                isActive={pathname === item.href}
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
        <div className="mt-auto">
            <SidebarSeparator className="my-2"/>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Logout">
                        <LogOut />
                        <span>Logout</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </div>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <Card className="m-2 bg-muted/20">
            <CardHeader className="p-4">
                <CardTitle className="text-sm font-semibold leading-normal">
                    Unlock New Features & Maximize Your Hospital Management Efficiency
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex gap-2">
                <Button size="sm" variant="ghost">What's New?</Button>
                <Button size="sm">Upgrade</Button>
            </CardContent>
        </Card>
      </SidebarFooter>
    </Sidebar>
  );
}

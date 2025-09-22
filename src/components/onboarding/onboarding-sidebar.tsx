"use client";
import Link from "next/link";
import {
  Home,
  Calendar,
  Stethoscope,
  Building2,
  Activity,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { PeterdrawLogo } from "@/components/icons";

export function OnboardingSidebar({ step }: { step: number }) {
  const { state } = useSidebar();

  const menuItems = [
    {
      href: "/onboarding-demo",
      icon: Home,
      label: "Dashboard",
      disabled: true,
    },
    {
      href: "/onboarding-demo",
      icon: Calendar,
      label: "Appointments",
      disabled: true,
    },
    {
      href: "/onboarding-demo",
      icon: Stethoscope,
      label: "Doctors",
      disabled: step < 2,
    },
    {
      href: "/onboarding-demo",
      icon: Building2,
      label: "Departments",
      disabled: false,
    },
    {
      href: "/onboarding-demo",
      icon: Activity,
      label: "Live Status",
      disabled: true,
    },
  ];

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
              Peterdraw
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
                isActive={(item.label === "Departments" && step === 1) || (item.label === "Doctors" && step === 2)}
                disabled={item.disabled}
                className={item.disabled ? "cursor-not-allowed opacity-50" : ""}
              >
                <Link href={item.href} legacyBehavior>
                    <a className={item.disabled ? "pointer-events-none" : ""}>
                        <item.icon />
                        <span>{item.label}</span>
                    </a>
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
    </Sidebar>
  );
}


"use client";
import Link from "next/link";
import {
  Home,
  Stethoscope,
  Building2,
  LogOut,
  Activity,
  ClipboardList
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
import { cn } from "@/lib/utils";

export function OnboardingSidebar({ step }: { step: number }) {
  const { state } = useSidebar();

  const menuItems = [
    {
      href: "/onboarding-demo",
      icon: Home,
      label: "Dashboard",
      step: -1, 
    },
    {
      href: "/onboarding-demo",
      icon: ClipboardList,
      label: "Appointments",
      step: -1,
    },
    {
      href: "/onboarding-demo",
      icon: Stethoscope,
      label: "Doctors",
      step: 2,
    },
    {
      href: "/onboarding-demo",
      icon: Building2,
      label: "Departments",
      step: 1,
    },
    {
      href: "/onboarding-demo",
      icon: Activity,
      label: "Live Status",
      step: -1,
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
           <PeterdrawLogo className="w-8 h-8" />
            <span
              className={cn(
                "font-bold text-lg",
                state === "collapsed" && "hidden"
              )}
            >
              Dashyat
            </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => {
            const isActive = item.step === step;
            const isDisabled = item.step > step || item.step === -1;

            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.label}
                  isActive={isActive}
                  disabled={isDisabled}
                  className={cn(
                    "data-[active=false]:bg-transparent data-[active=false]:hover:bg-sidebar-accent data-[active=false]:hover:text-sidebar-accent-foreground",
                    isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-sidebar-foreground",
                  )}
                >
                  <Link href={item.href} className={isDisabled ? "pointer-events-none" : ""}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
        <div className="mt-auto">
            <SidebarSeparator className="my-2"/>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Logout" disabled className="cursor-not-allowed opacity-50 hover:bg-transparent hover:text-sidebar-foreground">
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

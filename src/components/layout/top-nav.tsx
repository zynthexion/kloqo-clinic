
"use client";
import Link from "next/link";
import {
  Home,
  Settings,
  Stethoscope,
  Building2,
  LogOut,
  Activity,
  ClipboardList,
  Users,
  Smartphone,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeterdrawLogo } from "@/components/icons";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { user } from "@/lib/data";

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
  {
    href: "/mobile-app",
    icon: Smartphone,
    label: "Mobile App",
  }
];

const MainNav = ({ className }: { className?: string }) => {
    const pathname = usePathname();
    return (
        <nav className={className}>
            {menuItems.map((item) => (
                <Button key={item.label} variant={pathname === item.href ? "secondary" : "ghost"} asChild>
                    <Link href={item.href}>
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                    </Link>
                </Button>
            ))}
        </nav>
    );
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
        <div className="flex gap-6 md:gap-10">
          <Link href="/" className="flex items-center space-x-2">
            <PeterdrawLogo className="h-8 w-8" />
            <span className="inline-block font-bold">Dashyat</span>
          </Link>
          <MainNav className="hidden md:flex items-center space-x-1" />
        </div>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-1">
             <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
                >
                  <PanelLeft className="h-6 w-6" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="pr-0 pt-16">
                 <MainNav className="flex flex-col items-start space-x-0 space-y-2"/>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" className="rounded-full">
                <Settings className="h-5 w-5" />
                <span className="sr-only">Settings</span>
            </Button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar} alt={user.name} data-ai-hint="professional woman"/>
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                        </p>
                    </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Log out</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </div>
    </header>
  );
}


"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { Button } from "../ui/button";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/firebase";
import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import type { User } from "@/lib/types";

const menuItems = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/appointments", icon: ClipboardList, label: "Appointments" },
  { href: "/doctors", icon: Stethoscope, label: "Doctors" },
  { href: "/patients", icon: Users, label: "Patients" },
  { href: "/departments", icon: Building2, label: "Departments" },
  { href: "/live-status", icon: Activity, label: "Live Status" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [userProfile, setUserProfile] = useState<User | null>(null);

  const isOnboarding = pathname === "/onboarding";

  useEffect(() => {
    if (currentUser) {
      const fetchUserProfileAndClinicData = async () => {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setUserProfile(userData);
        }
      };
      fetchUserProfileAndClinicData();
    }
  }, [currentUser, pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
      router.push('/');
    } catch (error) {
      console.error("Logout failed:", error);
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred while logging out. Please try again.",
      });
    }
  };

  const NavLink = ({ href, icon: Icon, label }: { href: string, icon: React.ElementType, label: string }) => {
    const isDisabled = isOnboarding;

    const linkContent = (
        <div
            className={cn(
                "flex items-center h-12 p-3 rounded-lg transition-colors",
                pathname === href && !isOnboarding
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/50",
                isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                "overflow-hidden"
            )}
        >
            <Icon className="h-6 w-6 shrink-0" />
            <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                {label}
            </span>
        </div>
    );

    if (isDisabled) {
        return <div title={`${label} is disabled during onboarding`}>{linkContent}</div>;
    }

    return <Link href={href}>{linkContent}</Link>;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="group sticky top-0 left-0 h-screen w-16 hover:w-64 transition-all duration-300 ease-in-out flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-lg z-50 rounded-tr-2xl rounded-br-2xl">
        <div className="flex h-20 items-center justify-start p-4 shrink-0">
          <Link href="/" className="flex items-center gap-3">
            <PeterdrawLogo className="h-10 w-10 text-sidebar-primary" />
            <span className="text-xl font-bold font-logo opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
              Kloqo
            </span>
          </Link>
        </div>

        <nav className="flex-grow flex flex-col justify-start gap-2 p-2">
          {menuItems.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <NavLink href={item.href} icon={item.icon} label={item.label} />
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
                      <AvatarImage src={currentUser?.photoURL || undefined} alt={userProfile?.name || ""} />
                      <AvatarFallback>{userProfile?.name.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="text-left opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap">
                      <p className="text-sm font-semibold text-sidebar-foreground">{userProfile?.name || 'User'}</p>
                      <p className="text-xs text-sidebar-foreground/70">{userProfile?.clinicName || 'No Clinic'}</p>
                    </div>
                    <MoreVertical className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100" />
                  </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="mb-2 ml-2">
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>View Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-500">
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

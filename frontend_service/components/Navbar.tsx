"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { resolveRole, roleLabel, type AppRole } from "@/lib/role-navigation";

type NavItem = { href: string; label: string };

function getNav(role: AppRole): NavItem[] {
  if (role === "superadmin") {
    return [
      { href: "/superadmin/dashboard", label: "Superadmin Dashboard" },
      { href: "/superadmin/institutions", label: "Institutions" },
    ];
  }

  if (role === "institution_admin") {
    return [
      { href: "/admin/dashboard", label: "Admin Dashboard" },
      { href: "/admin/students", label: "Students / Users" },
      { href: "/admin/institution", label: "Institution Overview" },
      { href: "/dashboard", label: "Student View" },
    ];
  }

  return [
    { href: "/dashboard", label: "Home" },
    { href: "/start-quiz", label: "Start Quiz" },
    { href: "/results", label: "My Results" },
    { href: "/progress", label: "My Progress" },
    { href: "/tests-taken", label: "My Tests" },
  ];
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = resolveRole(session?.user) as AppRole;
  const navLinks = getNav(role);
  const userName = session?.user?.name || "User";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold text-lg">
          DECA Practice
        </Link>

        {session ? (
          <>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Button
                  key={link.href}
                  variant={pathname === link.href ? "secondary" : "ghost"}
                  asChild
                  size="sm"
                >
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetHeader>
                    <SheetTitle>Navigate</SheetTitle>
                  </SheetHeader>
                  <nav className="mt-6 flex flex-col gap-2">
                    {navLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm",
                          pathname === link.href
                            ? "bg-secondary font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-full px-2 py-1 hover:bg-accent">
                    <div className="hidden sm:flex sm:flex-col sm:items-end">
                      <span className="text-sm font-medium max-w-32 truncate">{userName}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">{roleLabel(role)}</Badge>
                    </div>
                    <Avatar className="h-8 w-8">
                      <AvatarImage alt={userName} />
                      <AvatarFallback>
                        {String(userName).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
                  <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">{roleLabel(role)}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="text-destructive"
                  >
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : (
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Register</Link>
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}

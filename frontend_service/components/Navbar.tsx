"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu, GraduationCap } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { resolveRole, roleLabel, type AppRole } from "@/lib/role-navigation";

type NavItem = { href: string; label: string };

function getNav(role: AppRole): NavItem[] {
  if (role === "superadmin") {
    return [
      { href: "/superadmin/dashboard", label: "Platform" },
      { href: "/superadmin/institutions", label: "Institutions" },
    ];
  }

  if (role === "institution_admin") {
    return [
      { href: "/admin/institution", label: "Overview" },
      { href: "/admin/students", label: "Learners" },
      { href: "/admin/dashboard", label: "Assignments" },
      { href: "/roleplays", label: "Roleplays" },
      { href: "/admin/student-view", label: "Learner View" },
    ];
  }

  return [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/roleplays", label: "Roleplays" },
    { href: "/start-quiz", label: "Practice" },
    { href: "/results", label: "Results" },
    { href: "/progress", label: "Progress" },
    { href: "/tests-taken", label: "Sessions" },
  ];
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = resolveRole(session?.user) as AppRole;
  const navLinks = getNav(role);
  const userName = session?.user?.name || "Learner";

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/92 backdrop-blur">
      <div className="page-wrap flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-secondary/80">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">AscendPrep</p>
            <p className="text-[11px] text-muted-foreground">Study with momentum</p>
          </div>
        </Link>

        {session ? (
          <>
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Button
                    key={link.href}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn("h-9", isActive && "bg-primary/10 text-primary hover:bg-primary/15")}
                    asChild
                    size="sm"
                  >
                    <Link href={link.href}>{link.label}</Link>
                  </Button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader>
                    <SheetTitle>Navigation</SheetTitle>
                  </SheetHeader>
                  <nav className="mt-6 flex flex-col gap-1.5">
                    {navLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "rounded-lg px-3 py-2.5 text-sm",
                          pathname === link.href
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
                  <button className="flex items-center gap-3 rounded-full border border-border/70 bg-card px-2 py-1.5 hover:bg-secondary/50">
                    <div className="hidden sm:flex sm:flex-col sm:items-end">
                      <span className="max-w-32 truncate text-sm font-medium">{userName}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {roleLabel(role)}
                      </Badge>
                    </div>
                    <Avatar className="h-8 w-8 border border-border/70">
                      <AvatarImage alt={userName} />
                      <AvatarFallback>{String(userName).slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">{userName}</DropdownMenuLabel>
                  <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">
                    {roleLabel(role)}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-destructive">
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : (
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}

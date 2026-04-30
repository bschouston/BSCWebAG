"use client"

import * as React from "react"
import { Moon, Sun, Laptop } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function MobileModeToggle() {
    const { setTheme, theme } = useTheme()

    return (
        <div className="flex items-center gap-2 border rounded-full p-1 bg-background/50 backdrop-blur-sm">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("light")}
                className={cn(
                    "h-8 w-8 rounded-full",
                    theme === "light" && "bg-accent text-accent-foreground"
                )}
            >
                <Sun className="h-4 w-4" />
                <span className="sr-only">Light</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("dark")}
                className={cn(
                    "h-8 w-8 rounded-full",
                    theme === "dark" && "bg-accent text-accent-foreground"
                )}
            >
                <Moon className="h-4 w-4" />
                <span className="sr-only">Dark</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme("system")}
                className={cn(
                    "h-8 w-8 rounded-full",
                    theme === "system" && "bg-accent text-accent-foreground"
                )}
            >
                <Laptop className="h-4 w-4" />
                <span className="sr-only">System</span>
            </Button>
        </div>
    )
}

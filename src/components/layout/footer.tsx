export function Footer() {
    return (
        <footer className="w-full border-t bg-background py-6 md:py-0">
            <div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row px-4">
                <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                    © {new Date().getFullYear()} Burhani Sports Club Houston. All rights reserved.
                </p>
                <div className="flex items-center gap-4">
                    <a href="#" className="text-sm font-medium underline-offset-4 hover:underline">
                        Privacy Policy
                    </a>
                    <a href="#" className="text-sm font-medium underline-offset-4 hover:underline">
                        Terms of Service
                    </a>
                </div>
            </div>
        </footer>
    )
}

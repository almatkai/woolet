
import { Outlet } from '@tanstack/react-router';

export function SettingsLayout() {
    return (
        <div className="flex h-full bg-background overflow-hidden relative">
            {/* Content Area - Full width, no sidebar */}
            <main className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto p-1 md:p-10">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

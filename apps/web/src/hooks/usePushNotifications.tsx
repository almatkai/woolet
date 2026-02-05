'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Bell, BellRing, Check } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface UsePushNotificationsReturn {
    isSupported: boolean;
    isSubscribed: boolean;
    isLoading: boolean;
    subscribe: () => Promise<void>;
    unsubscribe: () => Promise<void>;
    requestPermission: () => Promise<NotificationPermission>;
    vapidPublicKey: string | null;
    error: Error | null;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const { data: vapidPublicKey, isLoading: isLoadingKey } = trpc.pushSubscription.getVapidPublicKey.useQuery();

    const subscribeMutation = trpc.pushSubscription.subscribe.useMutation();
    const unsubscribeMutation = trpc.pushSubscription.unsubscribe.useMutation();

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            checkSubscription();
        }
    }, []);

    const checkSubscription = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !vapidPublicKey) return;

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        } catch (err) {
            console.error('Error checking subscription:', err);
        }
    }, [vapidPublicKey]);

    const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
        if (!('Notification' in window)) {
            return 'denied';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        if (Notification.permission === 'denied') {
            return 'denied';
        }

        return await Notification.requestPermission();
    }, []);

    const subscribe = useCallback(async () => {
        setError(null);

        try {
            const permission = await requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            if (!vapidPublicKey) {
                throw new Error('VAPID public key not available');
            }

            const registration = await navigator.serviceWorker.ready;

            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
            });
            }

            const subscriptionData = subscription.toJSON();

            await subscribeMutation.mutateAsync({
                endpoint: subscriptionData.endpoint!,
                keys: {
                    p256dh: subscriptionData.keys!.p256dh!,
                    auth: subscriptionData.keys!.auth!,
                },
                browserName: getBrowserName(),
                expirationTime: subscriptionData.expirationTime,
            });

            setIsSubscribed(true);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to subscribe'));
            throw err;
        }
    }, [vapidPublicKey, requestPermission, subscribeMutation]);

    const unsubscribe = useCallback(async () => {
        setError(null);

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();

                await unsubscribeMutation.mutateAsync({
                    endpoint: subscription.endpoint,
                });
            }

            setIsSubscribed(false);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to unsubscribe'));
            throw err;
        }
    }, [unsubscribeMutation]);

    return {
        isSupported,
        isSubscribed,
        isLoading: isLoadingKey,
        subscribe,
        unsubscribe,
        requestPermission,
        vapidPublicKey,
        error,
    };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'chrome';
    if (userAgent.includes('Firefox')) return 'firefox';
    if (userAgent.includes('Safari')) return 'safari';
    if (userAgent.includes('Edge')) return 'edge';
    return 'unknown';
}

interface PushNotificationSettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PushNotificationSettings({ open, onOpenChange }: PushNotificationSettingsProps) {
    const {
        isSupported,
        isSubscribed,
        isLoading,
        subscribe,
        unsubscribe,
        vapidPublicKey,
        error,
    } = usePushNotifications();

    const handleToggle = async () => {
        try {
            if (isSubscribed) {
                await unsubscribe();
            } else {
                await subscribe();
            }
        } catch (err) {
            console.error('Toggle failed:', err);
        }
    };

    if (!isSupported) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Push Notifications</DialogTitle>
                        <DialogDescription>
                            Push notifications are not supported in your browser.
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Push Notifications
                    </DialogTitle>
                    <DialogDescription>
                        Receive notifications in your browser even when Woolet is closed.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-4 text-center text-muted-foreground">
                        Loading...
                    </div>
                ) : !vapidPublicKey ? (
                    <div className="py-4 text-center text-muted-foreground">
                        Push notifications are not configured on the server.
                    </div>
                ) : (
                    <>
                        <div className="py-4 space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                                <div className="flex items-center gap-3">
                                    {isSubscribed ? (
                                        <BellRing className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <Bell className="h-5 w-5 text-muted-foreground" />
                                    )}
                                    <div>
                                        <p className="font-medium">
                                            {isSubscribed ? 'Notifications Enabled' : 'Notifications Disabled'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {isSubscribed
                                                ? 'You will receive browser notifications'
                                                : 'Enable to receive notifications'}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant={isSubscribed ? 'outline' : 'default'}
                                    onClick={handleToggle}
                                >
                                    {isSubscribed ? (
                                        <>
                                            <Check className="h-4 w-4 mr-2" />
                                            Disable
                                        </>
                                    ) : (
                                        'Enable'
                                    )}
                                </Button>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                    {error.message}
                                </div>
                            )}

                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium mb-1">What you&apos;ll receive:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Subscription payment reminders</li>
                                    <li>Due date alerts</li>
                                    <li>Payment confirmations</li>
                                    <li>Spending alerts</li>
                                </ul>
                            </div>
                        </div>
                    </>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

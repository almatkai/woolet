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
    vapidKeyError: string | null;
    isUpdating: boolean;
    error: Error | null;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const {
        data: vapidKeyData,
        isLoading: isLoadingKey,
        error: vapidQueryError,
    } = trpc.pushSubscription.getVapidPublicKey.useQuery();
    const vapidPublicKey = vapidKeyData?.publicKey ?? null;

    const subscribeMutation = trpc.pushSubscription.subscribe.useMutation();
    const unsubscribeMutation = trpc.pushSubscription.unsubscribe.useMutation();
    const isUpdating = subscribeMutation.isLoading || unsubscribeMutation.isLoading || isProcessing;

    const getActiveServiceWorkerRegistration = useCallback(async (): Promise<ServiceWorkerRegistration> => {
        if (!('serviceWorker' in navigator)) {
            throw new Error('Service workers are not supported in this browser');
        }
        // register if not yet registered
        if (!(await navigator.serviceWorker.getRegistration())) {
            await navigator.serviceWorker.register('/push-sw.js');
        }
        // navigator.serviceWorker.ready resolves once an active SW controls the page
        return navigator.serviceWorker.ready;
    }, []);

    const checkSubscription = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !vapidPublicKey) return;

        try {
            const registration = await getActiveServiceWorkerRegistration();
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        } catch (err) {
            console.error('Error checking subscription:', err);
        }
    }, [vapidPublicKey, getActiveServiceWorkerRegistration]);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
        }
    }, []);

    useEffect(() => {
        if (isSupported && vapidPublicKey) {
            checkSubscription();
        }
    }, [isSupported, vapidPublicKey, checkSubscription]);

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
        setIsProcessing(true);

        try {
            const permission = await requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            if (!vapidPublicKey) {
                throw new Error('VAPID public key not available');
            }

            const registration = await getActiveServiceWorkerRegistration();

            // Pre-check: see if push is actually allowed before trying
            const permState = await registration.pushManager.permissionState({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
            });
            if (permState === 'denied') {
                throw new Error('Push notifications are blocked. Please allow notifications in your browser site settings and try again.');
            }

            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                try {
                    // Let the browser manage its own timeout and produce a real error
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
                    });
                } catch (subError: any) {
                    console.error('pushManager.subscribe error:', subError.name, subError.message);
                    if (subError.name === 'NotAllowedError') {
                        throw new Error('Push notifications are blocked. Please allow notifications in your browser site settings.');
                    }
                    if (subError.name === 'AbortError') {
                        throw new Error('Push subscription was aborted by the browser. This can happen in Brave or when Google services are blocked. Check chrome://settings or brave://settings/privacy.');
                    }
                    if (subError.name === 'InvalidStateError') {
                        throw new Error('Service worker is not active. Please refresh the page and try again.');
                    }
                    throw new Error(`Push subscription failed (${subError.name}): ${subError.message || 'Unknown error'}`);
                }
            }

            const subscriptionData = subscription.toJSON();

            await subscribeMutation.mutateAsync({
                endpoint: subscriptionData.endpoint!,
                keys: {
                    p256dh: subscriptionData.keys!.p256dh!,
                    auth: subscriptionData.keys!.auth!,
                },
                browserName: getBrowserName(),
                expirationTime: subscriptionData.expirationTime ?? undefined,
            });

            setIsSubscribed(true);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to subscribe'));
            throw err;
        } finally {
            setIsProcessing(false);
        }
    }, [vapidPublicKey, requestPermission, subscribeMutation, getActiveServiceWorkerRegistration]);

    const unsubscribe = useCallback(async () => {
        setError(null);
        setIsProcessing(true);

        try {
            const registration = await getActiveServiceWorkerRegistration();
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
        } finally {
            setIsProcessing(false);
        }
    }, [unsubscribeMutation, getActiveServiceWorkerRegistration]);

    return {
        isSupported,
        isSubscribed,
        isLoading: isLoadingKey,
        subscribe,
        unsubscribe,
        requestPermission,
        vapidPublicKey,
        vapidKeyError: vapidQueryError?.message ?? null,
        isUpdating,
        error,
    };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    if (typeof base64String !== 'string') {
        throw new Error('Invalid VAPID public key format');
    }
    const sanitized = base64String.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
    if (!sanitized || sanitized.includes('BEGIN PUBLIC KEY') || sanitized.includes('END PUBLIC KEY')) {
        throw new Error('Invalid VAPID public key format');
    }

    const normalized = sanitized.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
        throw new Error('Invalid VAPID public key format');
    }

    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    let rawData: string;
    try {
        rawData = atob(normalized + padding);
    } catch {
        throw new Error('Invalid VAPID public key format');
    }

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
        vapidKeyError,
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
    const hasBrowserPermission =
        typeof window !== 'undefined' &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted';
    const needsInAppSetup = hasBrowserPermission && !isSubscribed;

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
                                    {isSubscribed || hasBrowserPermission ? (
                                        <BellRing className="h-5 w-5 text-green-500" />
                                    ) : (
                                        <Bell className="h-5 w-5 text-muted-foreground" />
                                    )}
                                    <div>
                                        <p className="font-medium">
                                            {isSubscribed
                                                ? 'Notifications Enabled'
                                                : hasBrowserPermission
                                                    ? 'Setup Required'
                                                    : 'Notifications Disabled'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {isSubscribed
                                                ? 'You will receive browser notifications'
                                                : needsInAppSetup
                                                    ? 'Browser permission is on, but push setup is not complete.'
                                                    : 'Enable to receive notifications'}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant={isSubscribed ? 'outline' : 'default'}
                                    onClick={handleToggle}
                                    disabled={isLoading || !vapidPublicKey}
                                >
                                    {isSubscribed ? (
                                        <>
                                            <Check className="h-4 w-4 mr-2" />
                                            Disable
                                        </>
                                    ) : (
                                        needsInAppSetup ? 'Finish setup' : 'Enable'
                                    )}
                                </Button>
                            </div>

                            {(vapidKeyError || error) && (
                                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                    {vapidKeyError || error?.message}
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

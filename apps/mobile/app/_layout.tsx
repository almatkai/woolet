import { ClerkProvider } from "@clerk/clerk-expo";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TRPCProvider } from "../src/providers/TRPCProvider";
import { tokenCache } from "../src/utils/token-cache";

// Clerk publishable key - in Expo we use process.env directly
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
    console.warn("⚠️ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not defined in the environment.");
}

export default function RootLayout() {
    return (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
            <SafeAreaProvider>
                <TRPCProvider>
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: {
                                backgroundColor: '#111827',
                            },
                        }}
                    />
                </TRPCProvider>
            </SafeAreaProvider>
        </ClerkProvider>
    );
}

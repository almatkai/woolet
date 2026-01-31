import React from 'react';
import { View, StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardProps {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    intensity?: number;
    borderRadius?: number;
    showBorder?: boolean;
    padding?: number;
}

const colors = {
    background: '#111827',
    card: '#1F2937',
    cardBorder: '#374151',
};

export function GlassCard({
    children,
    style,
    contentStyle,
    intensity = 80,
    borderRadius = 16,
    showBorder = true,
    padding = 16,
}: GlassCardProps) {
    const containerStyle: ViewStyle = {
        borderRadius,
        overflow: 'hidden',
    };

    const borderStyle: ViewStyle = showBorder ? {} : {
        borderWidth: 0,
        borderColor: 'transparent',
    };

    // iOS with BlurView (mimicking liquid glass)
    if (Platform.OS === 'ios') {
        return (
            <View style={[containerStyle, style]}>
                <BlurView
                    intensity={intensity}
                    tint="systemMaterialDark"
                    style={StyleSheet.absoluteFill}
                />
                <View style={[styles.blurContent, { borderRadius, padding }, borderStyle, contentStyle]}>
                    {children}
                </View>
            </View>
        );
    }

    // Android fallback with glassmorphism styling
    return (
        <View style={[containerStyle, styles.androidGlass, { padding }, style, borderStyle, contentStyle]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    blurContent: {
        backgroundColor: 'rgba(31, 41, 55, 0.4)', // More transparent for better glass effect
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    androidGlass: {
        backgroundColor: 'rgba(31, 41, 55, 0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        // Android shadow
        elevation: 8,
    },
});

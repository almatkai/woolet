import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    backgroundColor?: string;
}

export function ScreenWrapper({
    children,
    style,
    backgroundColor = '#111827'
}: ScreenWrapperProps) {
    const insets = useSafeAreaInsets();

    const containerStyle = {
        flex: 1,
        backgroundColor,
        paddingTop: insets.top,
    };

    return (
        <View style={[containerStyle, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({});

import React from 'react';
import { Text, TextProps } from 'react-native';
import clsx from 'clsx';
import { styled } from 'nativewind';

const StyledText = styled(Text);

interface CurrencyDisplayProps extends TextProps {
    amount: number;
    currency?: string;
    showSymbol?: boolean;
    decimals?: number;
}

export function CurrencyDisplay({
    amount,
    currency = 'USD',
    showSymbol = true,
    decimals = 2,
    style,
    className,
    ...props
}: CurrencyDisplayProps) {
    const formatted = new Intl.NumberFormat('en-US', {
        style: showSymbol ? 'currency' : 'decimal',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(amount);

    return (
        <StyledText className={clsx("font-variant-numeric-tabular", className)} style={style} {...props}>
            {formatted}
        </StyledText>
    );
}

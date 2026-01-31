import React from 'react';
import { TouchableOpacity, Text, TouchableOpacityProps } from 'react-native';
import { styled } from 'nativewind';

const StyledTouchable = styled(TouchableOpacity, 'px-4 py-3 rounded-lg bg-zinc-800');
const StyledText = styled(Text, 'text-white font-semibold text-center');

export function Button({ children, style, ...props }: TouchableOpacityProps & { children: React.ReactNode }) {
  return (
    <StyledTouchable {...props} style={style as any}>
      <StyledText>{children}</StyledText>
    </StyledTouchable>
  );
}

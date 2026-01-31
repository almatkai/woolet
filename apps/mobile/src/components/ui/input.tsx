import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { styled } from 'nativewind';

const StyledInput = styled(TextInput, 'bg-[#111827] border border-zinc-800 rounded-xl px-4 py-3 text-white');

export function Input(props: TextInputProps & { placeholderTextColor?: string }) {
  return <StyledInput placeholderTextColor="#6B7280" {...props} />;
}

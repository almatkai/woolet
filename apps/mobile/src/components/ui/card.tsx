import { View, Text, ViewProps } from 'react-native';
import { styled } from 'nativewind';

export const Card = styled(View, 'bg-white rounded-lg border border-zinc-200 shadow-sm');
export const CardHeader = styled(View, 'p-6 flex-col space-y-1.5');
export const CardTitle = styled(Text, 'text-2xl font-semibold leading-none tracking-tight text-zinc-950');
export const CardDescription = styled(Text, 'text-sm text-zinc-500');
export const CardContent = styled(View, 'p-6 pt-0');
export const CardFooter = styled(View, 'flex-row items-center p-6 pt-0');

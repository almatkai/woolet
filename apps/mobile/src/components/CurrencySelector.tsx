import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { trpc } from '@/utils/trpc';
import BottomSheet from './ui/modal';
import { Input } from './ui/input';
import { Search } from 'lucide-react-native';

interface CurrencySelectorProps {
    value: string;
    onValueChange: (value: string) => void;
    label?: string;
}

export function CurrencySelector({ value, onValueChange, label = "Select Currency" }: CurrencySelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const { data: currencies, isLoading } = trpc.currency.list.useQuery();

    const filteredCurrencies = useMemo(() => {
        if (!currencies) return [];
        if (!search) return currencies;
        const s = search.toLowerCase();
        return currencies.filter((c: any) => 
            c.code.toLowerCase().includes(s) || 
            c.name.toLowerCase().includes(s)
        );
    }, [currencies, search]);

    const selectedCurrency = currencies?.find((c: any) => c.code === value);

    return (
        <View>
            <TouchableOpacity 
                onPress={() => setOpen(true)}
                className="bg-zinc-800 p-4 rounded-xl border border-zinc-700 flex-row justify-between items-center"
            >
                <Text className="text-white font-medium">
                    {selectedCurrency ? `${selectedCurrency.code} - ${selectedCurrency.name}` : label}
                </Text>
                <Text className="text-zinc-500 text-xs">Tap to change</Text>
            </TouchableOpacity>

            <BottomSheet open={open} onClose={() => setOpen(false)}>
                <View className="mb-4 flex-row items-center bg-zinc-800 rounded-lg px-3">
                    <Search size={18} color="#9CA3AF" />
                    <Input 
                        placeholder="Search currencies..." 
                        value={search}
                        onChangeText={setSearch}
                        className="flex-1 border-0"
                        autoCapitalize="characters"
                    />
                </View>

                {isLoading ? (
                    <ActivityIndicator color="#8B5CF6" className="py-8" />
                ) : (
                    <FlatList
                        data={filteredCurrencies}
                        keyExtractor={(item) => item.code}
                        className="max-h-[400px]"
                        renderItem={({ item }) => (
                            <TouchableOpacity 
                                onPress={() => {
                                    onValueChange(item.code);
                                    setOpen(false);
                                }}
                                className={`p-4 border-b border-zinc-800 flex-row justify-between items-center ${value === item.code ? 'bg-zinc-800' : ''}`}
                            >
                                <View>
                                    <Text className="text-white font-bold">{item.code} - {item.name}</Text>
                                    <Text className="text-zinc-500 text-xs">{item.symbol}</Text>
                                </View>
                                {value === item.code && (
                                    <View className="bg-green-500 h-2 w-2 rounded-full" />
                                )}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <Text className="text-center text-zinc-500 py-8">No currencies found</Text>
                        }
                    />
                )}
            </BottomSheet>
        </View>
    );
}

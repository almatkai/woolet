import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, ActivityIndicator } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { trpc } from '@/utils/trpc';
import { Input } from './ui/input';
import { Button } from './ui/button';
import BottomSheet from './ui/modal';
import clsx from 'clsx';
import { Search, TrendingUp, TrendingDown } from 'lucide-react-native';

interface StockSearchResult {
    ticker: string;
    name: string;
    exchange: string;
    currency: string;
}

export function AddInvestmentSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const utils = trpc.useUtils();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
    const [showSearch, setShowSearch] = useState(true);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { data: searchResults, isLoading: isSearching } = trpc.investing.searchStocks.useQuery(
        { query: debouncedQuery },
        { enabled: debouncedQuery.length >= 2 }
    );

    const { control, handleSubmit, setValue, watch, reset } = useForm({
        defaultValues: {
            type: 'buy' as 'buy' | 'sell',
            quantity: '',
            pricePerShare: '',
            date: new Date().toISOString().split('T')[0],
            notes: '',
        }
    });

    const type = watch('type');

    const addStockMutation = trpc.investing.addStock.useMutation();
    const buyStockMutation = trpc.investing.buyStock.useMutation();
    const sellStockMutation = trpc.investing.sellStock.useMutation();

    const handleClose = () => {
        reset();
        setSearchQuery('');
        setSelectedStock(null);
        setShowSearch(true);
        onOpenChange(false);
    };

    const onSubmit = async (data: any) => {
        if (!selectedStock) return;

        try {
            // 1. Ensure stock exists for user
            const stock = await addStockMutation.mutateAsync({
                ticker: selectedStock.ticker,
                name: selectedStock.name,
                currency: selectedStock.currency,
                exchange: selectedStock.exchange,
            });

            // 2. Add transaction
            const mutation = data.type === 'buy' ? buyStockMutation : sellStockMutation;
            await mutation.mutateAsync({
                stockId: (stock as any).id,
                date: data.date,
                quantity: Number(data.quantity),
                pricePerShare: Number(data.pricePerShare),
                currency: selectedStock.currency,
                notes: data.notes || undefined,
            });

            // 3. Cleanup and refresh
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.getTransactions.invalidate();
            utils.investing.getBenchmarkComparison.invalidate();
            handleClose();
        } catch (error) {
            console.error('Failed to add investment:', error);
        }
    };

    return (
        <BottomSheet open={open} onClose={handleClose}>
            <Text className="text-xl font-bold mb-4 text-white">
                {selectedStock ? `Record ${type === 'buy' ? 'Purchase' : 'Sale'}` : 'Add Investment'}
            </Text>

            {showSearch && !selectedStock ? (
                <View className="mb-4">
                    <View className="relative mb-4">
                        <Input
                            placeholder="Search ticker or company..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            className="pl-10"
                        />
                        <View className="absolute left-3 top-3.5">
                            <Search size={18} color="#9CA3AF" />
                        </View>
                    </View>

                    {isSearching && (
                        <ActivityIndicator color="#8B5CF6" className="my-4" />
                    )}

                    <FlatList
                        data={searchResults ?? []}
                        keyExtractor={(item) => `${item.ticker}-${item.exchange}`}
                        className="max-h-[300px]"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => {
                                    setSelectedStock(item);
                                    setShowSearch(false);
                                }}
                                className="p-4 border-b border-zinc-800 flex-row justify-between items-center"
                            >
                                <View className="flex-1">
                                    <Text className="text-white font-bold">{item.ticker}</Text>
                                    <Text className="text-zinc-400 text-xs" numberOfLines={1}>{item.name}</Text>
                                </View>
                                <Text className="text-zinc-500 text-[10px] bg-zinc-800 px-2 py-1 rounded">{item.exchange}</Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            !isSearching && debouncedQuery.length >= 2 ? (
                                <Text className="text-center text-zinc-500 py-4">No results found</Text>
                            ) : null
                        }
                    />
                </View>
            ) : (
                <ScrollView className="max-h-[500px]">
                    {selectedStock && (
                        <TouchableOpacity
                            onPress={() => { setSelectedStock(null); setShowSearch(true); }}
                            className="mb-6 bg-zinc-800 p-4 rounded-xl flex-row justify-between items-center border border-zinc-700"
                        >
                            <View>
                                <Text className="text-white font-bold text-lg">{selectedStock.ticker}</Text>
                                <Text className="text-zinc-400 text-sm">{selectedStock.name}</Text>
                            </View>
                            <Text className="text-zinc-500 text-xs italic">Tap to change</Text>
                        </TouchableOpacity>
                    )}

                    <View className="flex-row mb-6 bg-zinc-800 p-1 rounded-lg">
                        {(['buy', 'sell'] as const).map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => setValue('type', t)}
                                className={clsx(
                                    "flex-1 py-2 rounded-md items-center flex-row justify-center gap-2",
                                    type === t ? "bg-zinc-700 shadow-sm" : ""
                                )}
                            >
                                {t === 'buy' ? <TrendingUp size={16} color={type === t ? '#10B981' : '#6B7280'} /> : <TrendingDown size={16} color={type === t ? '#EF4444' : '#6B7280'} />}
                                <Text className={clsx("capitalize font-medium", type === t ? "text-white" : "text-zinc-400")}>
                                    {t}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View className="flex-row gap-4 mb-4">
                        <View className="flex-1">
                            <Text className="text-xs font-bold mb-2 text-zinc-500 uppercase tracking-widest px-1">Quantity</Text>
                            <Controller
                                control={control}
                                name="quantity"
                                rules={{ required: true }}
                                render={({ field: { onChange, value } }) => (
                                    <Input
                                        placeholder="0.00"
                                        keyboardType="numeric"
                                        onChangeText={onChange}
                                        value={value}
                                    />
                                )}
                            />
                        </View>
                        <View className="flex-1">
                            <Text className="text-xs font-bold mb-2 text-zinc-500 uppercase tracking-widest px-1">Price</Text>
                            <Controller
                                control={control}
                                name="pricePerShare"
                                rules={{ required: true }}
                                render={({ field: { onChange, value } }) => (
                                    <Input
                                        placeholder="0.00"
                                        keyboardType="numeric"
                                        onChangeText={onChange}
                                        value={value}
                                    />
                                )}
                            />
                        </View>
                    </View>

                    <View className="mb-4">
                        <Text className="text-xs font-bold mb-2 text-zinc-500 uppercase tracking-widest px-1">Date</Text>
                        <Controller
                            control={control}
                            name="date"
                            render={({ field: { onChange, value } }) => (
                                <Input
                                    placeholder="YYYY-MM-DD"
                                    onChangeText={onChange}
                                    value={value}
                                />
                            )}
                        />
                    </View>

                    <View className="mb-8">
                        <Text className="text-xs font-bold mb-2 text-zinc-500 uppercase tracking-widest px-1">Notes (Optional)</Text>
                        <Controller
                            control={control}
                            name="notes"
                            render={({ field: { onChange, value } }) => (
                                <Input
                                    placeholder="e.g. Long term hold"
                                    onChangeText={onChange}
                                    value={value}
                                />
                            )}
                        />
                    </View>

                    <Button
                        onPress={handleSubmit(onSubmit)}
                        className={clsx("mb-6", addStockMutation.isPending || buyStockMutation.isPending || sellStockMutation.isPending ? "opacity-50" : "")}
                        disabled={addStockMutation.isPending || buyStockMutation.isPending || sellStockMutation.isPending}
                    >
                        {addStockMutation.isPending || buyStockMutation.isPending || sellStockMutation.isPending ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            `Record ${type === 'buy' ? 'Purchase' : 'Sale'}`
                        )}
                    </Button>
                </ScrollView>
            )}
        </BottomSheet>
    );
}

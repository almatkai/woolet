import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { trpc } from "@/utils/trpc";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Trash2, Plus, MoreHorizontal } from "lucide-react-native";
import { format } from "date-fns";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { GlassCard } from "@/components/GlassCard";

// ===== STYLES =====
const colors = {
  background: "#111827",
  card: "#1F2937",
  cardBorder: "#374151",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSecondary: "#6B7280",
  accent: "#8B5CF6",
  green: "#10B981",
  red: "#EF4444",
  orange: "#F97316",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 12,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  transactionItemLast: {
    borderBottomWidth: 0,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 18,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  transactionMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  transactionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "600",
  },
  amountIncome: {
    color: colors.green,
  },
  amountExpense: {
    color: colors.red,
  },
  deleteButton: {
    padding: 8,
  },
  dateHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 104 : 80,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(139, 92, 246, 0.4)",
      },
      default: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});

// ===== CURRENCY FORMATTER =====
const formatCurrency = (amount: number, currency = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface Transaction {
  id: string;
  amount: string | number;
  description?: string | null;
  date: string;
  type: string;
  category?: {
    id: string;
    name: string;
    icon: string;
  } | null;
  currencyBalance?: {
    currencyCode: string;
    account?: {
      id: string;
      name: string;
      bank?: {
        name: string;
      };
    } | null;
  } | null;
}

export default function SpendingScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const {
    data: transactionsData,
    isLoading,
    refetch,
  } = trpc.transaction.list.useQuery({
    hideAdjustments: true,
    limit: 100,
  }) as {
    data: { transactions: Transaction[] } | undefined;
    isLoading: boolean;
    refetch: () => Promise<any>;
  };

  const [refreshing, setRefreshing] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  const deleteTransaction = trpc.transaction.delete.useMutation({
    onSuccess: () => {
      utils.transaction.list.invalidate();
      utils.account.getTotalBalance.invalidate();
    },
    onError: (error: unknown) => {
      Alert.alert("Error", "Failed to delete transaction");
      console.error(error);
    },
  });

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = (transaction: Transaction) => {
    const label =
      transaction.description || transaction.category?.name || "Transaction";
    Alert.alert("Delete Transaction", `Delete "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setPendingDeletes((prev) => new Set(prev).add(transaction.id));
          deleteTransaction.mutate(
            { id: transaction.id },
            {
              onSettled: () => {
                setPendingDeletes((prev) => {
                  const next = new Set(prev);
                  next.delete(transaction.id);
                  return next;
                });
              },
            },
          );
        },
      },
    ]);
  };

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    if (!transactionsData?.transactions) return [];

    const visible = transactionsData.transactions.filter(
      (t) => !pendingDeletes.has(t.id),
    );

    const groups = visible.reduce(
      (acc, transaction) => {
        const date = transaction.date.split("T")[0];
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(transaction);
        return acc;
      },
      {} as Record<string, Transaction[]>,
    );

    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, transactions]) => ({
        date,
        transactions,
      }));
  }, [transactionsData, pendingDeletes]);

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split("T")[0]) {
      return "Today";
    } else if (dateStr === yesterday.toISOString().split("T")[0]) {
      return "Yesterday";
    }
    return format(date, "MMMM d, yyyy");
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <Text style={{ color: colors.textMuted }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {groupedTransactions.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No transactions yet.</Text>
              <Text style={[styles.emptyText, { marginTop: 4, fontSize: 12 }]}>
                Tap + to add your first transaction
              </Text>
            </View>
          </View>
        ) : (
          groupedTransactions.map((group) => (
            <View key={group.date}>
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>
                  {formatDateHeader(group.date)}
                </Text>
              </View>
              <GlassCard>
                {group.transactions.map((tx, idx) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.transactionItem,
                      idx === group.transactions.length - 1 &&
                        styles.transactionItemLast,
                    ]}
                  >
                    <View style={styles.transactionLeft}>
                      <View style={styles.transactionIcon}>
                        <Text style={styles.transactionIconText}>
                          {tx.category?.icon || "📄"}
                        </Text>
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionDesc} numberOfLines={1}>
                          {tx.description || tx.category?.name || "Transaction"}
                        </Text>
                        <Text style={styles.transactionMeta}>
                          {tx.currencyBalance?.account?.name || "Account"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.transactionRight}>
                      <Text
                        style={[
                          styles.transactionAmount,
                          tx.type === "income"
                            ? styles.amountIncome
                            : styles.amountExpense,
                        ]}
                      >
                        {tx.type === "income" ? "+" : "-"}
                        {formatCurrency(
                          Math.abs(Number(tx.amount)),
                          tx.currencyBalance?.currencyCode || "USD",
                        )}
                      </Text>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(tx)}
                      >
                        <Trash2 size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </GlassCard>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddTransaction(true)}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <AddTransactionSheet
        open={showAddTransaction}
        onOpenChange={setShowAddTransaction}
      />
    </View>
  );
}

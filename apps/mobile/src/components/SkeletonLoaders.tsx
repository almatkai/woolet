import { View, StyleSheet, Dimensions } from 'react-native';
import SkeletonLoading from './SkeletonLoading';

const { width } = Dimensions.get('window');

const colors = {
    background: '#111827',
    skeletonBase: '#1F2937',
    skeletonHighlight: '#374151',
};

export const CardSkeleton = () => {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                    {/* Title */}
                    <View style={styles.skeletonTitle} />
                    {/* Subtitle */}
                    <View style={styles.skeletonSubtitle} />
                </View>
                {/* Amount */}
                <View style={styles.skeletonAmount} />
            </View>
            {/* Divider */}
            <View style={styles.skeletonDivider} />
            {/* Bottom Stats */}
            <View style={styles.statsRow}>
                <View style={styles.statItem} />
                <View style={styles.statItem} />
                <View style={styles.statItem} />
            </View>
        </View>
    );
};

export const ListSkeleton = ({ count = 3 }: { count?: number }) => {
    return (
        <SkeletonLoading
            background={colors.skeletonBase}
            highlight={colors.skeletonHighlight}
        >
            <View style={styles.listContainer}>
                {[...Array(count)].map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </View>
        </SkeletonLoading>
    );
};

// Also a slightly different one for Subscriptions if needed
export const SubscriptionSkeleton = () => {
    return (
        <View style={styles.card}>
            <View style={styles.subRow}>
                <View style={styles.subLeft}>
                    <View style={styles.subIcon} />
                    <View style={{ flex: 1 }}>
                        <View style={styles.skeletonTitle} />
                        <View style={styles.skeletonSubtitle} />
                    </View>
                </View>
                <View style={styles.skeletonAmount} />
            </View>
        </View>
    );
};

export const SubscriptionListSkeleton = ({ count = 4 }: { count?: number }) => {
    return (
        <SkeletonLoading
            background={colors.skeletonBase}
            highlight={colors.skeletonHighlight}
        >
            <View style={styles.listContainer}>
                {[...Array(count)].map((_, i) => (
                    <SubscriptionSkeleton key={i} />
                ))}
            </View>
        </SkeletonLoading>
    );
};

const styles = StyleSheet.create({
    listContainer: {
        padding: 16,
    },
    card: {
        backgroundColor: colors.skeletonBase,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    skeletonTitle: {
        width: '60%',
        height: 18,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 4,
        marginBottom: 8,
    },
    skeletonSubtitle: {
        width: '40%',
        height: 14,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 4,
    },
    skeletonAmount: {
        width: 80,
        height: 20,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 4,
    },
    skeletonDivider: {
        height: 1,
        backgroundColor: colors.skeletonHighlight,
        marginVertical: 12,
        opacity: 0.3,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statItem: {
        width: '28%',
        height: 30,
        backgroundColor: colors.skeletonHighlight,
        borderRadius: 6,
    },
    subRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    subLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    subIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.skeletonHighlight,
        marginRight: 12,
    },
});

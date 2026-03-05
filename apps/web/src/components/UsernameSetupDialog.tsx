import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import twoMenSvg from '../../assets/two_men.svg';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// ─── Full A-Z + 0-9 + _ LED charMap (5-row bitmaps) ─────────────────────────
const charMap: Record<string, number[][]> = {
    A: [[0,1,1,0],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    B: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,1],[1,1,1,0]],
    C: [[0,1,1,1],[1,0,0,0],[1,0,0,0],[1,0,0,0],[0,1,1,1]],
    D: [[1,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,0]],
    E: [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,1,1,1]],
    F: [[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    G: [[0,1,1,1],[1,0,0,0],[1,0,1,1],[1,0,0,1],[0,1,1,1]],
    H: [[1,0,0,1],[1,0,0,1],[1,1,1,1],[1,0,0,1],[1,0,0,1]],
    I: [[1,1,1],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
    J: [[0,0,1],[0,0,1],[0,0,1],[1,0,1],[0,1,0]],
    K: [[1,0,0,1],[1,0,1,0],[1,1,0,0],[1,0,1,0],[1,0,0,1]],
    L: [[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]],
    M: [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]],
    N: [[1,0,0,1],[1,1,0,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]],
    O: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    P: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0]],
    Q: [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,1,0],[0,1,0,1]],
    R: [[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,1,0],[1,0,0,1]],
    S: [[0,1,1,1],[1,0,0,0],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    U: [[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    V: [[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
    W: [[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
    X: [[1,0,0,1],[0,1,1,0],[0,1,1,0],[0,1,1,0],[1,0,0,1]],
    Y: [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
    Z: [[1,1,1,1],[0,0,1,0],[0,1,0,0],[1,0,0,0],[1,1,1,1]],
    '0': [[0,1,1,0],[1,0,0,1],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
    '2': [[0,1,1,0],[1,0,0,1],[0,0,1,0],[0,1,0,0],[1,1,1,1]],
    '3': [[1,1,1,0],[0,0,0,1],[0,1,1,0],[0,0,0,1],[1,1,1,0]],
    '4': [[1,0,0,1],[1,0,0,1],[1,1,1,1],[0,0,0,1],[0,0,0,1]],
    '5': [[1,1,1,1],[1,0,0,0],[1,1,1,0],[0,0,0,1],[1,1,1,0]],
    '6': [[0,1,1,0],[1,0,0,0],[1,1,1,0],[1,0,0,1],[0,1,1,0]],
    '7': [[1,1,1,1],[0,0,0,1],[0,0,1,0],[0,1,0,0],[0,1,0,0]],
    '8': [[0,1,1,0],[1,0,0,1],[0,1,1,0],[1,0,0,1],[0,1,1,0]],
    '9': [[0,1,1,0],[1,0,0,1],[0,1,1,1],[0,0,0,1],[0,1,1,0]],
    '_': [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,1,1,1]],
    ' ': [[0,0],[0,0],[0,0],[0,0],[0,0]],
};

const LED_COLS = 35;
const LED_ROWS = 29;

function buildMatrix(word: string) {
    const chars = word.toUpperCase().split('');
    const matrix: boolean[][] = Array.from({ length: LED_ROWS }, () =>
        Array(LED_COLS).fill(false),
    );

    let lines: { pat: number[][]; w: number; c: number }[][] = [];
    let currentLine: { pat: number[][]; w: number; c: number }[] = [];
    let currentLineWidth = 0;

    for (const ch of chars) {
        const pat = charMap[ch] || charMap[' '];
        const w = pat[0].length;
        
        if (currentLine.length > 0 && currentLineWidth + w > LED_COLS) {
            lines.push(currentLine);
            currentLine = [];
            currentLineWidth = 0;
        }
        
        currentLine.push({ pat, w, c: currentLineWidth });
        currentLineWidth += w + 1;
    }
    
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }
    
    lines = lines.slice(0, 5);

    const blockHeight = lines.length * 5 + Math.max(0, lines.length - 1) * 1;
    const offsetRow = Math.max(0, Math.floor((LED_ROWS - blockHeight) / 2));

    lines.forEach((line, lineIndex) => {
        const lineTotalWidth = Math.max(0, line[line.length - 1].c + line[line.length - 1].w);
        const offsetCol = Math.max(0, Math.floor((LED_COLS - lineTotalWidth) / 2));
        const rStart = offsetRow + lineIndex * 6;

        line.forEach(char => {
            const cStart = offsetCol + char.c;
            for (let r = 0; r < char.pat.length; r++) {
                for (let c = 0; c < char.pat[r].length; c++) {
                    if (char.pat[r][c]) {
                        const mr = rStart + r;
                        const mc = cStart + c;
                        if (mr >= 0 && mr < LED_ROWS && mc >= 0 && mc < LED_COLS) {
                            matrix[mr][mc] = true;
                        }
                    }
                }
            }
        });
    });

    return matrix;
}

function LEDBoard({ word }: { word: string }) {
    const [, setTick] = useState(0);
    const [hovering, setHovering] = useState(false);
    const matrix = useMemo(() => buildMatrix(word), [word]);

    useEffect(() => {
        if (hovering) return;
        const id = setInterval(() => setTick((t) => t + 1), 2800);
        return () => clearInterval(id);
    }, [hovering]);

    return (
        <div
            className="group p-3 sm:p-6 flex flex-1 items-center justify-center bg-gradient-to-bl from-zinc-950/80 via-zinc-900/90 to-zinc-950 overflow-hidden"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
        >
            <svg
                className="w-full h-auto text-zinc-700 max-h-full"
                viewBox={`0 0 ${LED_COLS} ${LED_ROWS}`}
            >
                {matrix.map((row, ri) =>
                    row.map((lit, ci) => {
                        const pulse = !hovering && lit && Math.random() > 0.8;
                        return (
                            <circle
                                key={`${ri}-${ci}`}
                                cx={ci + 0.5}
                                cy={ri + 0.5}
                                r={0.38}
                                style={{
                                    transitionDelay: !hovering ? `${ci * 10}ms` : '0ms',
                                    animationDelay: pulse
                                        ? `${Math.floor(Math.random() * 900)}ms`
                                        : '0ms',
                                }}
                                className={[
                                    'transition-all duration-200 ease-in-out',
                                    pulse ? 'animate-led-pulse' : '',
                                    lit
                                        ? hovering
                                            ? 'fill-purple-400'
                                            : 'fill-zinc-400'
                                        : 'fill-zinc-800',
                                ].join(' ')}
                            />
                        );
                    }),
                )}
            </svg>
        </div>
    );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function UsernameSetupDialog() {
    const utils = trpc.useUtils();
    const { data: me, isLoading } = trpc.user.me.useQuery();
    const [username, setUsername] = useState('');
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const open = useMemo(() => {
        if (isLoading || dismissed) return false;
        return !!me && !me.username;
    }, [isLoading, me, dismissed]);

    const updateUser = trpc.user.update.useMutation({
        onSuccess: async () => {
            await utils.user.me.invalidate();
        },
        onError: (error: unknown) => {
            const message =
                error instanceof Error ? error.message : 'Failed to save username';
            toast.error(message);
        },
    });

    const handleSave = () => {
        const normalized = username.trim().toLowerCase();
        if (normalized.length < 4) {
            toast.error('Username must be at least 4 characters');
            return;
        }
        if (!USERNAME_PATTERN.test(normalized)) {
            toast.error(
                'Username can only contain letters, numbers, and underscores',
            );
            return;
        }
        updateUser.mutate({ username: normalized });
    };

    const isReady =
        username.trim().length >= 4 && USERNAME_PATTERN.test(username.trim());

    // Show typed text in LED; fall back to "WOOLET"
    const ledWord = username.trim() ? username.trim() : 'WOOLET';

    return (
        <Dialog open={open} onOpenChange={(val) => !val && setDismissed(true)}>
            <DialogContent
                className="p-0 overflow-hidden border-border bg-card gap-0 sm:max-w-[680px] w-[calc(100%-2.5rem)] mx-auto rounded-2xl sm:rounded-3xl !top-auto !bottom-4 !translate-y-0 sm:!top-[50%] sm:!bottom-auto sm:!-translate-y-1/2 flex flex-col max-h-[85vh] sm:max-h-none min-h-[300px] sm:min-h-[480px]"
            >
                {/* inline keyframes */}
                <style>{`
                    @keyframes led-pulse-kf {
                        0%, 100% { fill: currentColor; filter: brightness(1); }
                        50% { fill: #a855f7; filter: brightness(5); }
                    }
                    .animate-led-pulse { animation: led-pulse-kf 2s ease-in-out; }
                `}</style>

                {/* top accent line */}
                <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-foreground/20 to-transparent shrink-0" />

                <div className="flex flex-row flex-1">
                    {/* ── LEFT COLUMN ── */}
                    <div className="flex flex-1 flex-col justify-between">
                        {/* LED board — shows typed username or "WOOLET" */}
                        <LEDBoard word={ledWord} />

                        <div className="h-px bg-border" />

                        {/* Form — slight skew that straightens on focus */}
                        <div
                            className="px-8 mx-4 flex flex-col gap-5 flex-1 justify-center transition-transform duration-300"
                            style={{
                                transform: focused || username.trim().length > 0
                                    ? 'skewX(0deg) skewY(0deg)'
                                    : 'skewX(-2.4deg) skewY(2.4deg)',
                            }}
                        >
                            <div>
                                <h2
                                    className="text-foreground font-semibold"
                                    style={{
                                        fontSize: 17,
                                        letterSpacing: '-0.03em',
                                    }}
                                >
                                    Let's get username
                                </h2>
                                <p
                                    className="text-muted-foreground mt-1"
                                    style={{ fontSize: 12.5 }}
                                >
                                    At least 4 chars · letters, numbers, _
                                </p>
                            </div>

                            <div className="flex flex-col gap-2.5">
                                <div className="relative">
                                    <span
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none select-none"
                                        style={{ fontSize: 14 }}
                                    >
                                        @
                                    </span>
                                    <Input
                                        placeholder="your_handle"
                                        value={username}
                                        onChange={(e) =>
                                            setUsername(e.target.value)
                                        }
                                        onFocus={() => setFocused(true)}
                                        onBlur={() => setFocused(false)}
                                        maxLength={30}
                                        autoFocus
                                        className="pl-7 pr-12 h-10 transition-all duration-150"
                                        style={{ fontSize: 14 }}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' &&
                                                isReady &&
                                                !updateUser.isPending
                                            )
                                                handleSave();
                                        }}
                                    />
                                    {(focused || username.length > 0) && (
                                        <span
                                            className="absolute right-3 top-1/2 -translate-y-1/2 tabular-nums"
                                            style={{
                                                fontSize: 10,
                                                color: 'hsl(var(--muted-foreground))',
                                            }}
                                        >
                                            {username.length}/30
                                        </span>
                                    )}
                                </div>

                                <Button
                                    onClick={handleSave}
                                    disabled={
                                        updateUser.isPending || !isReady
                                    }
                                    className="group/btn w-full relative h-10 transition-all duration-300"
                                    style={{
                                        fontSize: 13.5,
                                        letterSpacing: '-0.01em',
                                    }}
                                >
                                    <Check className="absolute left-3 w-3.5 h-3.5 opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100" />
                                    <span className="pl-3">
                                        {updateUser.isPending ? (
                                            <span className="flex items-center gap-2 justify-center">
                                                <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                                                Saving…
                                            </span>
                                        ) : (
                                            'Confirm handle'
                                        )}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    
                </div>
            </DialogContent>
        </Dialog>
    );
}

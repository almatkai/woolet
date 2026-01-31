import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@woolet/api/routers/index';

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createTRPCReact`.
 * @link https://trpc.io/docs/v10/react#3-create-trpc-hooks
 */
export const trpc = createTRPCReact<AppRouter>();

import { createTRPCReact } from '@trpc/react-query';

// Using 'any' to bypass strict type checking for the router structure 
// since we haven't set up shared types between api and web yet.
// In a production app, we would likely use a shared package or project references.
export const trpc: any = createTRPCReact<any>();

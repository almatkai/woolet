# Admin Panel Implementation

## Overview

This document describes the implementation of a secure admin panel for managing AI configuration settings. The admin panel uses Cloudflare Zero Trust for authentication and authorization, providing a secure and easy-to-use interface for managing AI providers and models.

## Features

- Secure authentication with Cloudflare Zero Trust
- Email allowlist control
- Single Sign-On (SSO) with Google and GitHub
- Bot protection
- Session management with configurable durations
- AI configuration management
- Real-time updates without redeployment
- Cost control and optimization

## Architecture

The admin panel architecture consists of three main components:

1. **Frontend**: React-based admin panel with Tailwind CSS
2. **Backend**: Node.js API with TRPC and Drizzle ORM
3. **Security Layer**: Cloudflare Zero Trust for access control

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Zero Trust                   │
├─────────────────────────────────────────────────────────────┤
│  • Single Sign-On (SSO) with Google/GitHub                  │
│  • Email Allowlist Control                                  │
│  • Bot Protection                                           │
│  • Session Management                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Admin Panel (React)                     │
├─────────────────────────────────────────────────────────────┤
│  • Dashboard                                                │
│  • AI Configuration Management                              │
│  • System Status                                            │
│  • Audit Logs                                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (Node.js)                    │
├─────────────────────────────────────────────────────────────┤
│  • TRPC Endpoints                                           │
│  • Drizzle ORM for DB Operations                            │
│  • Admin Role Check                                         │
│  • Audit Log Service                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
├─────────────────────────────────────────────────────────────┤
│  • ai_config Table                                         │
│  • audit_logs Table                                        │
│  • User and Session Data                                   │
└─────────────────────────────────────────────────────────────┘
```

## Cloudflare Zero Trust Setup

### 1. Create an Access Application

1. Go to Zero Trust dashboard → Access → Applications
2. Click "Add an application"
3. Choose "Self-hosted"
4. Enter application details:
   - Name: Woolet Admin Panel
   - Domain: admin.woolet.com
   - Path: /*

### 2. Create an Access Policy

1. Add a new policy
2. Name: Admin Access
3. Action: Allow
4. Session duration: 24 hours
5. Configure identity providers:
   - Google (Add via Settings → Authentication → Login methods)
   - GitHub (Add via Settings → Authentication → Login methods)
6. Configure rules:
   - Email allowlist: admin@woolet.com, your-email@example.com

### 3. Configure DNS Records

1. In Cloudflare DNS dashboard, add A record for admin subdomain:
   - Name: admin
   - Content: <your server IP>
   - Proxy status: Proxied (orange cloud)

## Backend Implementation

### 1. Admin Role Check

```typescript
// apps/api/src/middleware/auth.ts
import { clerkClient } from '@clerk/backend';
import { Hono } from 'hono';

export const isAdmin = async (userId: string): Promise<boolean> => {
  try {
    const client = clerkClient();
    const user = await client.users.getUser(userId);
    
    // Check if user is in admin email list
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@woolet.com'];
    
    return adminEmails.some(email => 
      user.emailAddresses.some(ea => ea.emailAddress === email)
    );
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};
```

### 2. AI Configuration Routes

```typescript
// apps/api/src/routers/ai.ts
import { router, protectedProcedure } from '../lib/trpc';
import { isAdmin } from '../middleware/auth';

export const aiRouter = router({
  getAiConfig: protectedProcedure
    .query(async ({ ctx }) => {
      // Add admin check
      const isAdminUser = await isAdmin(ctx.userId!);
      if (!isAdminUser) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to access this resource',
        });
      }
      
      const config = await AiConfigService.getConfig();
      return config;
    }),

  updateAiConfig: protectedProcedure
    .input(z.object({
      providerOrder: z.array(z.enum(['openrouter', 'openai', 'gemini', 'groq'])).optional(),
      defaultProvider: z.enum(['openrouter', 'openai', 'gemini', 'groq']).optional(),
      modelSettings: z.object({
        openrouter: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
        openai: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
        gemini: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
        groq: z.object({ model: z.string(), enabled: z.boolean() }).optional(),
      }).optional(),
      fallbackEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Add admin check
      const isAdminUser = await isAdmin(ctx.userId!);
      if (!isAdminUser) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to access this resource',
        });
      }
      
      const updatedConfig = await AiConfigService.updateConfig(input);
      return updatedConfig;
    }),

  resetAiConfig: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Add admin check
      const isAdminUser = await isAdmin(ctx.userId!);
      if (!isAdminUser) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to access this resource',
        });
      }
      
      const resetConfig = await AiConfigService.resetToDefault();
      return resetConfig;
    }),

  getAiStatus: protectedProcedure
    .query(async ({ ctx }) => {
      // Add admin check
      const isAdminUser = await isAdmin(ctx.userId!);
      if (!isAdminUser) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to access this resource',
        });
      }
      
      return await getAiStatus();
    }),
});
```

### 3. Environment Variables

```bash
# .env
ADMIN_EMAILS=admin@woolet.com,your-email@example.com
```

## Frontend Implementation

### 1. Admin Panel Component

```typescript
// apps/web/src/components/AdminPanel.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'react-router-dom';
import { api } from '~/utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type AiProvider = 'openrouter' | 'openai' | 'gemini' | 'groq';

interface ModelSettings {
  openrouter?: { model: string; enabled: boolean };
  openai?: { model: string; enabled: boolean };
  gemini?: { model: string; enabled: boolean };
  groq?: { model: string; enabled: boolean };
}

interface AiConfig {
  id: string;
  providerOrder: AiProvider[];
  defaultProvider: AiProvider;
  modelSettings: ModelSettings;
  fallbackEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPanel: React.FC = () => {
  const router = useRouter();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: aiConfig, refetch: refetchAiConfig } = api.ai.getAiConfig.useQuery();

  const updateAiConfig = api.ai.updateAiConfig.useMutation({
    onSuccess: () => {
      refetchAiConfig();
      setSaving(false);
    },
    onError: (err) => {
      setError(err.message);
      setSaving(false);
    },
  });

  useEffect(() => {
    if (aiConfig) {
      setConfig(aiConfig);
      setLoading(false);
    }
  }, [aiConfig]);

  const handleSave = () => {
    if (!config) return;
    
    setSaving(true);
    setError(null);
    
    updateAiConfig.mutate({
      providerOrder: config.providerOrder,
      defaultProvider: config.defaultProvider,
      modelSettings: config.modelSettings,
      fallbackEnabled: config.fallbackEnabled,
    });
  };

  const handleProviderOrderChange = (index: number, value: AiProvider) => {
    if (!config) return;
    
    const newProviderOrder = [...config.providerOrder];
    newProviderOrder[index] = value;
    setConfig({ ...config, providerOrder: newProviderOrder });
  };

  const handleModelChange = (provider: AiProvider, model: string) => {
    if (!config) return;
    
    setConfig({
      ...config,
      modelSettings: {
        ...config.modelSettings,
        [provider]: {
          ...config.modelSettings[provider],
          model,
        },
      },
    });
  };

  const handleEnabledChange = (provider: AiProvider, enabled: boolean) => {
    if (!config) return;
    
    setConfig({
      ...config,
      modelSettings: {
        ...config.modelSettings,
        [provider]: {
          ...config.modelSettings[provider],
          enabled,
        },
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600">Failed to load AI configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Woolet Admin Panel</h1>
          <p className="text-gray-600">Manage AI configuration and settings</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* AI Configuration Card */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Configuration</h2>
            
            <div className="space-y-6">
              {/* Default Provider */}
              <div>
                <Label htmlFor="defaultProvider">Default Provider</Label>
                <Select
                  id="defaultProvider"
                  value={config.defaultProvider}
                  onChange={(e) => setConfig({ ...config, defaultProvider: e.target.value as AiProvider })}
                  className="mt-1"
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="groq">Groq</option>
                  <option value="gemini">Gemini</option>
                </Select>
              </div>

              {/* Fallback Enabled */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="fallbackEnabled"
                  checked={config.fallbackEnabled}
                  onCheckedChange={(checked) => setConfig({ ...config, fallbackEnabled: checked })}
                />
                <Label htmlFor="fallbackEnabled">Enable Fallback Providers</Label>
              </div>

              {/* Provider Order */}
              <div>
                <Label>Provider Order (for fallback)</Label>
                <div className="space-y-2 mt-1">
                  {config.providerOrder.map((provider, index) => (
                    <Select
                      key={index}
                      value={provider}
                      onChange={(e) => handleProviderOrderChange(index, e.target.value as AiProvider)}
                      className="w-full"
                    >
                      <option value="openrouter">OpenRouter</option>
                      <option value="openai">OpenAI</option>
                      <option value="groq">Groq</option>
                      <option value="gemini">Gemini</option>
                    </Select>
                  ))}
                </div>
              </div>

              {/* Model Settings */}
              <div>
                <Label>Model Settings</Label>
                <div className="space-y-4 mt-1">
                  {Object.entries(config.modelSettings).map(([provider, settings]) => (
                    <div key={provider} className="p-3 bg-gray-50 rounded-md">
                      <div className="flex items-center space-x-2 mb-2">
                        <Label htmlFor={`${provider}-enabled`} className="capitalize">
                          {provider}
                        </Label>
                        <Switch
                          id={`${provider}-enabled`}
                          checked={settings.enabled}
                          onCheckedChange={(checked) => handleEnabledChange(provider as AiProvider, checked)}
                        />
                      </div>
                      <div>
                        <Input
                          id={`${provider}-model`}
                          value={settings.model}
                          onChange={(e) => handleModelChange(provider as AiProvider, e.target.value)}
                          className="mt-1"
                          placeholder="Model name"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </Card>

          {/* AI Status Card */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Status</h2>
            <div className="space-y-4">
              {Object.entries({
                openrouter: 'OpenRouter',
                openai: 'OpenAI',
                groq: 'Groq',
                gemini: 'Gemini',
              }).map(([provider, label]) => (
                <div key={provider} className="flex justify-between items-center">
                  <span className="capitalize">{label}</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    config.modelSettings[provider as AiProvider]?.enabled 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {config.modelSettings[provider as AiProvider]?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* System Information Card */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">System Information</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-medium">Created At:</span>
                <span className="ml-2">{new Date(config.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="font-medium">Updated At:</span>
                <span className="ml-2">{new Date(config.updatedAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="font-medium">Version:</span>
                <span className="ml-2">1.0.0</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
```

### 2. Admin Panel Route

```typescript
// apps/web/src/routes/admin.tsx
import React from 'react';
import AdminPanel from '~/components/AdminPanel';

const AdminRoute: React.FC = () => {
  return <AdminPanel />;
};

export default AdminRoute;
```

### 3. Update Route Tree

```typescript
// apps/web/src/routeTree.gen.tsx
// Add this import
import AdminRoute from '~/routes/admin';

// Add this route configuration
const routeTree = createRouteTree({
  // ...existing routes
  admin: component(AdminRoute),
});

// Export the updated route tree
export default routeTree;
```

## Testing

### 1. Cloudflare Zero Trust Flow Test

1. Deploy your changes to your server
2. Navigate to `admin.woolet.com`
3. You should be redirected to Cloudflare's login page
4. Select Google or GitHub login
5. If your email is on the allowlist, you'll be granted access

### 2. AI Configuration Test

1. Once logged in, you should see the admin panel
2. Try changing the default provider from OpenRouter to Groq
3. Save the changes and verify they're reflected in the configuration

### 3. Security Test

1. Try accessing the admin panel with a non-admin email
2. Verify that you're not granted access

## Optional Enhancements

### 1. Rate Limiting

```typescript
// apps/api/src/middleware/rate-limit.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Admin panel rate limit: 100 requests per 15 minutes
const adminRateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 900,
});

export const adminRateLimit = async (c: any, userId: string) => {
  try {
    await adminRateLimiter.consume(userId);
    return true;
  } catch (error) {
    c.set('X-RateLimit-Limit', '100');
    c.set('X-RateLimit-Remaining', '0');
    c.set('X-RateLimit-Reset', Date.now() + 900000);
    return false;
  }
};
```

### 2. Audit Logs

```typescript
// apps/api/src/services/audit-logs.ts
import { db } from '../db';
import { auditLogs } from '../db/schema';

export class AuditLogService {
  static async log(userId: string, action: string, details: any) {
    await db.insert(auditLogs).values({
      userId,
      action,
      details: JSON.stringify(details),
      createdAt: new Date(),
    });
  }
}
```

### 3. Health Check Endpoint

```typescript
// apps/api/src/routers/admin.ts
import { router, protectedProcedure } from '../lib/trpc';
import { isAdmin } from '../middleware/auth';

export const adminRouter = router({
  healthCheck: protectedProcedure
    .query(async ({ ctx }) => {
      const isAdminUser = await isAdmin(ctx.userId!);
      if (!isAdminUser) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    }),
});
```

## Conclusion

By implementing Cloudflare Zero Trust, you're adding a powerful layer of security to your admin panel. The integration is straightforward and provides:

1. **Single Sign-On (SSO)** with Google and GitHub
2. **Email Allowlist Control** to restrict access
3. **Bot Protection** by preventing unauthenticated users from reaching your backend
4. **Session Management** with configurable durations
5. **Compliance Features** like audit logs (optional)

This setup ensures your AI configuration system is secure and accessible only to authorized users.

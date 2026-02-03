import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  Bot, 
  ShieldCheck, 
  Save, 
  RotateCcw, 
  ChevronUp, 
  ChevronDown, 
  Activity, 
  Moon, 
  Sun, 
  Zap,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

type AiProvider = 'openrouter' | 'openai' | 'gemini' | 'groq';

interface ModelSettings {
  openrouter?: { model: string; enabled: boolean };
  openai?: { model: string; enabled: boolean };
  groq?: { model: string; enabled: boolean };
  gemini?: { model: string; enabled: boolean };
}

interface AiConfig {
  id: string;
  providerOrder: AiProvider[];
  defaultProvider: AiProvider;
  modelSettings: ModelSettings;
  fallbackEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPanel() {
  const { theme, setTheme } = useTheme();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: aiConfig, refetch: refetchAiConfig } = trpc.ai.getAiConfig.useQuery();
  const updateAiConfig = trpc.ai.updateAiConfig.useMutation();
  const resetAiConfig = trpc.ai.resetAiConfig.useMutation();

  useEffect(() => {
    if (aiConfig) {
      setConfig(aiConfig as AiConfig);
    }
  }, [aiConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await updateAiConfig.mutateAsync({
        providerOrder: config.providerOrder,
        defaultProvider: config.defaultProvider,
        modelSettings: config.modelSettings,
        fallbackEnabled: config.fallbackEnabled,
      });
      setSuccess('Configuration saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      refetchAiConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all AI settings to default?')) return;
    
    setSaving(true);
    try {
      await resetAiConfig.mutateAsync();
      setSuccess('Reset to defaults successfully!');
      setTimeout(() => setSuccess(null), 3000);
      refetchAiConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to reset configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleProviderOrderChange = (index: number, direction: 'up' | 'down') => {
    if (!config) return;
    const newOrder = [...config.providerOrder];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setConfig({ ...config, providerOrder: newOrder });
  };

  const handleModelChange = (provider: AiProvider, field: 'model' | 'enabled', value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      modelSettings: {
        ...config.modelSettings,
        [provider]: {
          ...config.modelSettings[provider],
          [field]: value
        }
      }
    });
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">Configure system infrastructure and appearance.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="h-9">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} size="sm" disabled={saving} className="h-9 shadow-sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm flex items-center gap-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:emerald-400 px-4 py-3 rounded-lg text-sm flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground mb-6">
          <TabsTrigger value="ai" className="flex gap-2 items-center px-4">
            <Bot className="h-4 w-4" />
            AI Config
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex gap-2 items-center px-4">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Core Settings */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Primary Settings
                </CardTitle>
                <CardDescription>Default provider and fallback behavior.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="defaultProvider" className="text-sm font-medium">Default AI Provider</Label>
                  <Select 
                    value={config.defaultProvider} 
                    onValueChange={(value: AiProvider) => setConfig({ ...config, defaultProvider: value })}
                  >
                    <SelectTrigger id="defaultProvider">
                      <SelectValue placeholder="Select primary provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                  <div className="space-y-0.5">
                    <Label htmlFor="fallbackEnabled" className="text-sm font-semibold">Failover Strategy</Label>
                    <p className="text-xs text-muted-foreground">Switch to next provider on failure.</p>
                  </div>
                  <Switch
                    id="fallbackEnabled"
                    checked={config.fallbackEnabled}
                    onCheckedChange={(checked) => setConfig({ ...config, fallbackEnabled: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Provider Order */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  Provider Priority
                </CardTitle>
                <CardDescription>The order in which providers are attempted.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {config.providerOrder.map((provider, index) => (
                    <div 
                      key={provider} 
                      className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-muted/30 transition-colors"
                    >
                      <span className="capitalize text-sm font-medium">{provider}</span>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-background"
                          disabled={index === 0}
                          onClick={() => handleProviderOrderChange(index, 'up')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-background"
                          disabled={index === config.providerOrder.length - 1}
                          onClick={() => handleProviderOrderChange(index, 'down')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Model Selection */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Models Configuration</CardTitle>
              <CardDescription>Configure specific model IDs for each provider.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['openrouter', 'openai', 'groq', 'gemini'] as AiProvider[]).map((provider) => (
                  <div key={provider} className="p-4 rounded-xl border bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="capitalize font-bold text-foreground">{provider}</Label>
                      <Switch
                        checked={config.modelSettings[provider]?.enabled ?? false}
                        onCheckedChange={(checked) => handleModelChange(provider, 'enabled', checked)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${provider}-model`} className="text-xs text-muted-foreground uppercase tracking-tight">Active Model</Label>
                      <Input
                        id={`${provider}-model`}
                        className="h-9 bg-background"
                        value={config.modelSettings[provider]?.model || ''}
                        onChange={(e) => handleModelChange(provider, 'model', e.target.value)}
                        placeholder="Model ID..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 outline-none">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sun className="h-5 w-5" />
                Theme Settings
              </CardTitle>
              <CardDescription>Choose how Woolet looks on your device.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'light', label: 'Light', icon: Sun, color: 'text-amber-500', bg: 'bg-white' },
                  { id: 'dark', label: 'Dark', icon: Moon, color: 'text-blue-400', bg: 'bg-slate-900' },
                  { id: 'super-dark', label: 'OLED', icon: Zap, color: 'text-purple-500', bg: 'bg-black' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as any)}
                    className={`relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 ${
                      theme === t.id 
                        ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20' 
                        : 'border-transparent bg-muted/40 hover:bg-muted/60'
                    }`}
                  >
                    <div className={`h-12 w-12 rounded-full ${t.bg} border shadow-sm flex items-center justify-center`}>
                      <t.icon className={`h-6 w-6 ${t.color}`} />
                    </div>
                    <span className="text-sm font-semibold">{t.label}</span>
                    {theme === t.id && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-4 w-4 text-primary fill-primary/10" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-6 border-t">
                <h4 className="text-sm font-semibold mb-4 text-foreground">Infrastructure Stats</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-muted/30 border border-dashed">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Version</p>
                    <p className="text-sm font-mono mt-1">v1.2.4-stable</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/30 border border-dashed">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Mode</p>
                    <p className="text-sm font-mono mt-1 text-primary">{import.meta.env.MODE.toUpperCase()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-center py-4 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
          Woolet Administrative Control &bull; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

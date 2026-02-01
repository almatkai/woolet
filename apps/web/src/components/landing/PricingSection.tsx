import React from 'react';
import { PricingTable } from '@clerk/clerk-react';

export function PricingSection() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your financial management needs
          </p>
        </div>

        <PricingTable
          for="user"
          ctaPosition="bottom"
          collapseFeatures={false}
          appearance={{
            variables: {
              colorBackground: 'hsl(220 13% 12%)',
              colorText: 'hsl(210 20% 95%)',
              colorTextSecondary: 'hsl(215 16% 60%)',
              colorPrimary: 'hsl(210 20% 95%)',
              colorInputBackground: 'hsl(220 13% 14%)',
              colorInputText: 'hsl(210 20% 95%)',
              colorShimmer: 'hsl(220 13% 20%)',
              colorDanger: 'hsl(0 62.8% 40%)',
              colorSuccess: 'hsl(160 60% 50%)',
              colorWarning: 'hsl(30 80% 60%)',
            },
            elements: {
              rootBox: "w-full",
              card: "border-2 border-border hover:border-primary/50 transition-all duration-300 hover:shadow-xl bg-card",
              cardHeader: "pb-6",
              cardBody: "space-y-4",
              cardFooter: "pt-6",
              planName: "text-2xl font-bold text-foreground",
              planDescription: "text-muted-foreground mt-2",
              planPrice: "text-4xl font-bold mt-4 text-foreground",
              planPriceInterval: "text-muted-foreground text-sm",
              featuresListItem: "flex items-start gap-3 text-sm text-foreground",
              featuresListItemIcon: "text-primary mt-0.5",
              button: "w-full",
              buttonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
              buttonSecondary: "bg-secondary hover:bg-secondary/90 text-secondary-foreground border border-border",
            },
          }}
          checkoutProps={{
            appearance: {
              variables: {
                colorBackground: 'hsl(220 13% 12%)',
                colorText: 'hsl(210 20% 95%)',
                colorTextSecondary: 'hsl(215 16% 60%)',
                colorPrimary: 'hsl(210 20% 95%)',
                colorInputBackground: 'hsl(220 13% 14%)',
                colorInputText: 'hsl(210 20% 95%)',
              },
              elements: {
                rootBox: "rounded-xl",
                card: "shadow-2xl bg-card border-border",
              },
            },
          }}
          newSubscriptionRedirectUrl="/dashboard"
        />

        {/* Additional info section */}
        <div className="mt-16 grid md:grid-cols-3 gap-8 text-center">
          <div className="p-6 rounded-lg bg-card border">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="font-semibold mb-2">Secure & Private</h3>
            <p className="text-sm text-muted-foreground">
              Your financial data is encrypted and never shared
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border">
            <div className="text-3xl mb-3">💳</div>
            <h3 className="font-semibold mb-2">Cancel Anytime</h3>
            <p className="text-sm text-muted-foreground">
              No long-term contracts. Cancel your subscription anytime
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="font-semibold mb-2">Instant Upgrade</h3>
            <p className="text-sm text-muted-foreground">
              Upgrade or downgrade your plan instantly
            </p>
          </div>
        </div>

        {/* Feature comparison table */}
        <div className="mt-16 p-8 rounded-xl bg-card border">
          <h3 className="text-2xl font-bold mb-6 text-center">
            Feature Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4">Feature</th>
                  <th className="text-center py-4 px-4">Free</th>
                  <th className="text-center py-4 px-4">Pro</th>
                  <th className="text-center py-4 px-4">Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-3 px-4">Banks</td>
                  <td className="text-center py-3 px-4">2</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Accounts per Bank</td>
                  <td className="text-center py-3 px-4">2</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Currencies per Account</td>
                  <td className="text-center py-3 px-4">2</td>
                  <td className="text-center py-3 px-4">5</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Stocks in Portfolio</td>
                  <td className="text-center py-3 px-4">5</td>
                  <td className="text-center py-3 px-4">20</td>
                  <td className="text-center py-3 px-4">1,000</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Woo AI Questions</td>
                  <td className="text-center py-3 px-4">3 total</td>
                  <td className="text-center py-3 px-4">5/day</td>
                  <td className="text-center py-3 px-4">20/day</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Currency Widget</td>
                  <td className="text-center py-3 px-4">❌</td>
                  <td className="text-center py-3 px-4">✅</td>
                  <td className="text-center py-3 px-4">✅</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Market Insight Digest</td>
                  <td className="text-center py-3 px-4">❌</td>
                  <td className="text-center py-3 px-4">Short</td>
                  <td className="text-center py-3 px-4">Complete</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Transaction History</td>
                  <td className="text-center py-3 px-4">90 days</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                  <td className="text-center py-3 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Support</td>
                  <td className="text-center py-3 px-4">Email</td>
                  <td className="text-center py-3 px-4">Email</td>
                  <td className="text-center py-3 px-4">Priority</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

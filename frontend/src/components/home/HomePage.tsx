import { DashboardHeader } from "@/components/home/DashboardHeader";
import { WelcomeHero } from "@/components/home/WelcomeHero";
import { QuickActions } from "@/components/home/QuickActions";
import { RecommendedDatasets } from "@/components/home/RecommendedDatasets";
import { RecentDownloads } from "@/components/home/RecentDownloads";
import { SavedAOIs } from "@/components/home/SavedAOIs";
import { DataFormats } from "@/components/home/DataFormats";
import { AccountOverview } from "@/components/home/AccountOverview";
import { EnvironmentDashboard } from "@/components/environment/EnvironmentDashboard";
import { Footer } from "@/components/layout/Footer";

export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-polar-pearl">
      <DashboardHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-content space-y-10 px-6 py-10 lg:px-16 lg:py-12">
          <WelcomeHero />

          <div className="grid gap-6 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <QuickActions />
            </div>
            <div className="lg:col-span-3">
              <RecommendedDatasets />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-4">
            <RecentDownloads />
            <SavedAOIs />
            <DataFormats />
            <AccountOverview />
          </div>

          <EnvironmentDashboard />
        </div>
      </main>

      <Footer />
    </div>
  );
}

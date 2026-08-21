import { TopEventReadout } from "./TopEventReadout";
import { McsTable } from "./McsTable";
import { ImportanceChart } from "./ImportanceChart";
import { SensitivityChart } from "./SensitivityChart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useFTAStore } from "@/store/ftaStore";

export function ResultsDashboard() {
  const results = useFTAStore((s) => s.results);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-3">
        <TopEventReadout />
        {results && (
          <Tabs defaultValue="cutsets" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="cutsets" className="px-4">
                Minimal Cut Sets
              </TabsTrigger>
              <TabsTrigger value="importance" className="px-4">
                Importance
              </TabsTrigger>
              <TabsTrigger value="sensitivity" className="px-4">
                Sensitivity
              </TabsTrigger>
            </TabsList>
            <TabsContent value="cutsets" className="min-h-0 flex-1">
              <McsTable />
            </TabsContent>
            <TabsContent value="importance" className="min-h-[360px] flex-1">
              <ImportanceChart />
            </TabsContent>
            <TabsContent value="sensitivity" className="min-h-[360px] flex-1">
              <SensitivityChart />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

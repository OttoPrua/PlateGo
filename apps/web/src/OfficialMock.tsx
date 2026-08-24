import { useMemo } from "react";
import { OfficialSelectionFlow, SHANGHAI_SELECTION_RULES } from "@platego/client-app";
import { getSimulatedPool } from "@platego/sim-data";

export function OfficialMock() {
  const snapshot = useMemo(() => getSimulatedPool("310000", "small_blue"), []);
  return <div className="official-fixture-page">
    <OfficialSelectionFlow
      snapshot={snapshot}
      surface="fixture"
      rules={SHANGHAI_SELECTION_RULES}
      fixtureContract
      returnHref="/"
    />
  </div>;
}

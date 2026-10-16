import { useEffect, useState } from "react";
import { AppState } from "react-native";

export default function useCalendarClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      const midnight = new Date(current);
      midnight.setHours(24, 0, 0, 0);
      // Also notice time-zone/clock changes while the screen stays open.
      timer = setTimeout(refresh, Math.min(midnight - current + 50, 60000));
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return now;
}

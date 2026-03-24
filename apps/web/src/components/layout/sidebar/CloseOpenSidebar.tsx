import { Menu02Icon, SidebarLeftIcon } from "@icons";
import useMediaQuery from "@/hooks/ui/useMediaQuery";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

import { Button } from "../../ui/button";

export interface CloseOpenSidebarBtnProps {
  isSidebarVisible?: boolean;
  toggleSidebar: () => void;
}

function CloseOpenSidebarBtn({
  toggleSidebar,
  isSidebarVisible = false,
}: CloseOpenSidebarBtnProps) {
  const isMobileScreen: boolean = useMediaQuery("(max-width: 600px)");

  return (
    <Button
      aria-label="Open Menu"
      className={`group rounded-lg hover:bg-[#00bbff]/20 ${isSidebarVisible ? "sm:hidden sm:opacity-0" : "sm:flex sm:opacity-100"}`}
      size="icon"
      variant={"ghost"}
      onClick={() => {
        trackEvent(
          isSidebarVisible
            ? ANALYTICS_EVENTS.UI_SIDEBAR_COLLAPSED
            : ANALYTICS_EVENTS.UI_SIDEBAR_EXPANDED,
        );
        toggleSidebar();
      }}
    >
      {isMobileScreen ? (
        <Menu02Icon
          className="min-h-[20px] min-w-[20px] text-zinc-400 transition-all group-hover:text-primary"
          height="24"
        />
      ) : (
        <SidebarLeftIcon
          className="min-h-[20px] min-w-[20px] text-zinc-400 transition-all group-hover:text-primary"
          height="24"
        />
      )}
    </Button>
  );
}

export default CloseOpenSidebarBtn;

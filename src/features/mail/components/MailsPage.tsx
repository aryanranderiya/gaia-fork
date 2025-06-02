"use client";

import { Button } from "@heroui/button";
import { Tooltip } from "@heroui/tooltip";
import {
  ArchiveIcon,
  Square,
  SquareCheck,
  StarIcon,
  Timer,
  Trash,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";

import Spinner from "@/components/ui/shadcn/spinner";
import { EmailFrom } from "@/features/mail/components/MailFrom";
import ViewEmail from "@/features/mail/components/ViewMail";
import { useEmailActions } from "@/features/mail/hooks/useEmailActions";
import { useEmailGrouping } from "@/features/mail/hooks/useEmailGrouping";
import { useEmailReadStatus } from "@/features/mail/hooks/useEmailReadStatus";
import { useEmailSelection } from "@/features/mail/hooks/useEmailSelection";
import { useEmailViewer } from "@/features/mail/hooks/useEmailViewer";
import { useInfiniteEmails } from "@/features/mail/hooks/useInfiniteEmails";
import { formatTime } from "@/features/mail/utils/mailUtils";
import useMediaQuery from "@/hooks/ui/useMediaQuery";
import { EmailData } from "@/types/features/mailTypes";

export default function MailsPage() {
  const isMobileScreen: boolean = useMediaQuery("(max-width: 600px)");
  const { toggleReadStatus: hookToggleReadStatus } = useEmailReadStatus();
  const { toggleStarStatus, archiveEmail, trashEmail } = useEmailActions();

  // Get emails with infinite loading
  const {
    emails,
    isLoading,
    isItemLoaded: isItemLoadedBase,
    loadMoreItems,
  } = useInfiniteEmails();

  const {
    selectedEmails,
    toggleEmailSelection,
    clearSelections,
    bulkMarkAsRead,
    bulkMarkAsUnread,
    bulkStarEmails,
    // bulkUnstarEmails,
    bulkArchiveEmails,
    bulkTrashEmails,
  } = useEmailSelection();

  const groupedItems = useEmailGrouping(emails);

  const {
    selectedEmail,
    threadMessages,
    isLoadingThread,
    openEmail,
    closeEmail,
  } = useEmailViewer();

  // Handlers for single email actions
  const handleToggleReadStatus = (e: React.MouseEvent, email: EmailData) => {
    e.stopPropagation(); // Prevent opening the email
    hookToggleReadStatus(email);
  };

  const handleToggleStarStatus = (e: React.MouseEvent, email: EmailData) => {
    e.stopPropagation(); // Prevent opening the email
    toggleStarStatus(email);
  };

  const handleArchiveEmail = (e: React.MouseEvent, email: EmailData) => {
    e.stopPropagation(); // Prevent opening the email
    archiveEmail(email.id);
  };

  const handleTrashEmail = (e: React.MouseEvent, email: EmailData) => {
    e.stopPropagation(); // Prevent opening the email
    trashEmail(email.id);
  };

  // Adapter for isItemLoaded to match the function signature expected by InfiniteLoader
  const isItemLoaded = useCallback(
    (index: number) => isItemLoadedBase(index, groupedItems.length),
    [isItemLoadedBase, groupedItems.length],
  );

  if (isLoading)
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );

  const Row = ({ index, style }: ListChildComponentProps) => {
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");

    if (!isItemLoaded(index)) {
      return (
        <div style={style} className="flex items-center justify-center">
          <Spinner />
        </div>
      );
    }

    const item = groupedItems[index];
    if (!item) return null;

    if (item.type === "header")
      return (
        <div
          style={style}
          className="relative flex h-full w-full items-center px-4 text-sm text-foreground/70 backdrop-blur-xs sm:px-1"
        >
          {item.data as string}
          <div className="absolute bottom-4 h-[1px] w-full border-none bg-white/20 outline-hidden sm:bottom-2"></div>
        </div>
      );

    const email = item.data as EmailData;

    const fetchSummary = (isOpen: boolean) => {
      if (isOpen && !title && !subtitle) {
        setTitle(email.subject);
        setSubtitle("Lorem ipsum");
      }
    };

    return (
      <Tooltip
        showArrow
        placement="top"
        delay={400}
        closeDelay={0}
        shouldCloseOnInteractOutside={() => true}
        onOpenChange={fetchSummary}
        content={
          <div className="flex w-[300px] flex-col p-1">
            <div className="text-lg leading-tight font-medium">{title}</div>
            {/* <div>{subtitle}</div> */}
          </div>
        }
        onClose={() => {
          return !!title && !!subtitle;
        }}
        color="foreground"
        radius="sm"
      >
        <div
          className={`group relative grid w-full cursor-pointer gap-1 p-2 px-4 transition-all duration-200 hover:bg-primary/20 hover:text-primary sm:gap-2 sm:px-1 ${
            email?.labelIds?.includes("UNREAD")
              ? "font-medium"
              : "font-normal text-foreground-400"
          } sm:grid-cols-[auto_0.3fr_1fr_auto] sm:items-center`}
          style={style}
          onClick={() => openEmail(email)}
        >
          {/* Add selection checkbox */}
          <div
            className="flex items-center justify-center px-2"
            onClick={(e) => {
              e.stopPropagation();
              toggleEmailSelection(e, email.id);
            }}
          >
            {selectedEmails.has(email.id) ? (
              <SquareCheck className="h-5 w-5 cursor-pointer text-primary" />
            ) : (
              <Square className="h-5 w-5 cursor-pointer opacity-60 hover:opacity-100" />
            )}
          </div>

          {isMobileScreen ? (
            <>
              <div className="col-span-1 min-h-fit truncate text-lg sm:block">
                <EmailFrom from={email.from} />
              </div>

              <div className="col-span-1 mt-1 min-h-fit text-right text-sm opacity-50 sm:mt-0">
                {formatTime(email.time)}
              </div>

              <div className="col-span-2 min-h-fit w-full truncate sm:col-span-1">
                {email.subject}
              </div>
            </>
          ) : (
            <>
              <div className="col-span-1 min-h-fit truncate pl-2 sm:block">
                <EmailFrom from={email.from} />
              </div>

              <div className="col-span-2 min-h-fit w-full truncate sm:col-span-1">
                {email.subject}
              </div>

              <div className="col-span-1 mt-1 min-h-fit text-right text-sm opacity-50 sm:mt-0">
                {formatTime(email.time)}
              </div>
              <div className="absolute right-0 flex h-fit w-fit items-center gap-1 rounded-lg bg-zinc-900 p-2 text-sm text-zinc-300 opacity-0 group-hover:opacity-100">
                {[
                  {
                    icon: StarIcon,
                    label: "Star",
                    iconProps: {
                      color: "orange",
                      fill: email?.labelIds?.includes("STARRED")
                        ? "orange"
                        : "transparent",
                    },
                    onClick: (e: React.MouseEvent) =>
                      handleToggleStarStatus(e, email),
                  },
                  {
                    icon: ArchiveIcon,
                    label: "Archive",
                    onClick: (e: React.MouseEvent) =>
                      handleArchiveEmail(e, email),
                  },
                  {
                    icon: Trash,
                    label: "Move to Trash",
                    iconProps: { color: "red" },
                    onClick: (e: React.MouseEvent) =>
                      handleTrashEmail(e, email),
                  },
                  {
                    icon: email?.labelIds?.includes("UNREAD")
                      ? SquareCheck
                      : Square,
                    label: email?.labelIds?.includes("UNREAD")
                      ? "Mark as Read"
                      : "Mark as Unread",
                    onClick: (e: React.MouseEvent) =>
                      handleToggleReadStatus(e, email),
                  },
                  {
                    icon: Timer,
                    label: "Set Reminder",
                    onClick: (e: React.MouseEvent) => e.stopPropagation(),
                  },
                ].map(({ icon: Icon, label, iconProps, onClick }, index) => (
                  <Tooltip
                    key={index}
                    content={label}
                    placement="top"
                    className="z-50"
                    color="foreground"
                  >
                    <div
                      className="flex h-6 w-6 cursor-pointer items-center justify-center"
                      onClick={onClick}
                    >
                      <Icon size={19} {...iconProps} />
                    </div>
                  </Tooltip>
                ))}
              </div>
            </>
          )}
        </div>
      </Tooltip>
    );
  };

  const itemCount = groupedItems.length + (emails.length > 0 ? 1 : 0);

  return (
    <div className="relative h-full w-full">
      {/* Selection toolbar */}
      {selectedEmails.size > 0 && (
        <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between rounded-md bg-zinc-900 px-1 py-1 text-white backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              color="default"
              variant="flat"
              onPress={clearSelections}
              startContent={<X size={16} />}
            >
              Clear selection
            </Button>
            <span className="font-medium">{selectedEmails.size} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Mark as read">
              <Button
                size="sm"
                color="default"
                variant="light"
                onPress={bulkMarkAsRead}
                isIconOnly
              >
                <SquareCheck size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Mark as unread">
              <Button
                size="sm"
                color="default"
                variant="light"
                onPress={bulkMarkAsUnread}
                isIconOnly
              >
                <Square size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Star">
              <Button
                size="sm"
                color="warning"
                variant="light"
                onPress={bulkStarEmails}
                isIconOnly
              >
                <StarIcon size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Archive">
              <Button
                size="sm"
                color="default"
                variant="light"
                onPress={bulkArchiveEmails}
                isIconOnly
              >
                <ArchiveIcon size={16} />
              </Button>
            </Tooltip>
            <Tooltip content="Move to trash">
              <Button
                size="sm"
                color="danger"
                variant="light"
                onPress={bulkTrashEmails}
                isIconOnly
              >
                <Trash size={16} />
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={itemCount}
        loadMoreItems={loadMoreItems}
      >
        {({ onItemsRendered, ref }) => (
          <List
            height={window.innerHeight - 50}
            itemCount={itemCount}
            itemSize={isMobileScreen ? 70 : 55}
            onItemsRendered={onItemsRendered}
            ref={ref}
            width="100%"
            className="overflow-x-hidden! rounded-xl"
          >
            {Row}
          </List>
        )}
      </InfiniteLoader>

      <ViewEmail
        mail={selectedEmail}
        threadMessages={threadMessages}
        isLoadingThread={isLoadingThread}
        onOpenChange={closeEmail}
      />
    </div>
  );
}

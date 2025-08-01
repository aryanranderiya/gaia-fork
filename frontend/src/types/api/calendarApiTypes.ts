import { GoogleCalendarEvent } from "@/types/features/calendarTypes";

export interface CalendarEventsResponse {
  events: GoogleCalendarEvent[];
  nextPageToken: string | null;
}

export interface CalendarItem {
  id: string;
  name: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
}
